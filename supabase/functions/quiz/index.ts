/**
 * THE QUIZ WRITER
 * ----------------------------------------------------------------------------
 * Wiklodo's quiz questions are written by a language model, and the key that
 * pays for it belongs to the person running the app, not to the players. A
 * key shipped inside an APK is a key anyone can pull back out of it, so this
 * runs the request server-side instead: the app sends the article, this
 * function adds the key and hands back the questions.
 *
 * Deploy once (see README): the key lives in the project's secrets and never
 * reaches a device.
 *
 *   supabase secrets set GROQ_API_KEY=...
 *   supabase functions deploy quiz
 *
 * The function checks the caller ITSELF rather than leaning on the gateway's
 * "verify JWT with legacy secret" switch. That switch only accepts tokens
 * signed by the old shared secret, which a project on the newer publishable
 * keys may not be issuing any more; asking the auth API who the caller is
 * works either way. So leave that switch OFF and let this run.
 */
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.1-8b-instant';

/** The player's browser calls this straight from the app. */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });

/** Harder questions for rarer cards, in the words the model responds to. */
function difficultyFor(rank: number): string {
  if (rank >= 6) return 'Ask expert-level questions about fine details of the text. No giveaway wording.';
  if (rank >= 4) return 'Ask hard questions about specifics in the text. No giveaway wording.';
  if (rank >= 3) return 'Ask moderately hard questions that need a careful read of the text.';
  if (rank >= 2) return 'Mix easy and moderate questions; at most one needs a careful read.';
  return 'Ask straightforward questions a casual reader could answer after skimming the text.';
}

Deno.serve(async (req: Request) => {
  // Every arrival is written down. A silent log is itself a diagnosis: it
  // means the request never reached this code, so it was turned away at the
  // gateway (the JWT switch) or went to a different name entirely.
  console.log(`quiz: ${req.method} in, auth=${req.headers.get('Authorization') ? 'yes' : 'no'}`);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) {
    console.error('quiz: no GROQ_API_KEY secret set on this project');
    return json({ error: 'QUIZ_UNSET' }, 503);
  }

  // Who is asking? The app sends the player's own session, so the auth API
  // can confirm this is a signed-in player of this project and not somebody
  // who found the URL and fancied spending the quiz budget.
  //
  // The apikey for that lookup has to be the PROJECT's own, which the runtime
  // injects: the caller's bearer token is a user session, and handing that
  // over as an apikey is rejected out of hand.
  const authHeader = req.headers.get('Authorization') ?? '';
  const projectUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const projectKey = Deno.env.get('SUPABASE_ANON_KEY')
    ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
    ?? req.headers.get('apikey')
    ?? '';
  if (!authHeader) {
    console.error('quiz: no authorization header on the request');
    return json({ error: 'UNAUTHORISED', detail: 'no authorization header' }, 401);
  }
  if (projectUrl && projectKey) {
    try {
      const who = await fetch(`${projectUrl}/auth/v1/user`, {
        headers: { Authorization: authHeader, apikey: projectKey }
      });
      if (!who.ok) {
        const detail = (await who.text()).slice(0, 200);
        console.error('quiz: caller rejected', who.status, detail);
        return json({ error: 'UNAUTHORISED', status: who.status, detail }, 401);
      }
    } catch (err) {
      console.error('quiz: auth lookup failed', String(err));
      return json({ error: 'UNAUTHORISED', detail: 'auth lookup failed' }, 401);
    }
  } else {
    // Nothing to check against: better to write the quiz than to lock every
    // player out of it over a missing runtime variable.
    console.warn('quiz: no project key available, skipping caller check');
  }

  let body: { title?: string; text?: string; rank?: number; count?: number; lang?: string };
  try {
    body = await req.json();
  } catch (err) {
    console.error('quiz: unreadable request body', String(err));
    return json({ error: 'BAD_REQUEST', detail: 'unreadable body' }, 400);
  }

  const title = String(body.title ?? '').slice(0, 200);
  const text = String(body.text ?? '').slice(0, 6000);
  const rank = Number.isFinite(body.rank) ? Number(body.rank) : 0;
  const count = Math.min(5, Math.max(3, Number(body.count) || 3));
  const language = body.lang === 'fr' ? 'French' : 'English';
  if (!title || text.length < 80) {
    console.error(`quiz: thin request, title=${Boolean(title)} textLength=${text.length}`);
    return json({ error: 'BAD_REQUEST', detail: `title=${Boolean(title)} text=${text.length} chars` }, 400);
  }

  const prompt = [
    `Write a ${count}-question multiple-choice quiz about "${title}", in ${language}.`,
    difficultyFor(rank),
    'Use ONLY facts stated in the article text below.',
    'Each question has exactly 4 choices and exactly one correct choice. Vary which position holds the correct one.',
    'Respond with JSON only, shaped exactly as:',
    '{"questions":[{"question":"...","choices":["...","...","...","..."],"answer":0}]}',
    'where "answer" is the zero-based index of the correct choice.',
    '',
    'ARTICLE TEXT:',
    text
  ].join('\n');

  let upstream: Response;
  try {
    upstream = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: Deno.env.get('GROQ_MODEL') ?? DEFAULT_MODEL,
        temperature: 0.6,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You write quiz questions. You respond with valid JSON only.' },
          { role: 'user', content: prompt }
        ]
      })
    });
  } catch (err) {
    console.error('quiz: could not reach the model', String(err));
    return json({ error: 'UPSTREAM', detail: 'could not reach the model' }, 502);
  }
  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, 400);
    console.error('quiz: model refused', upstream.status, detail);
    return json({ error: 'UPSTREAM', status: upstream.status, detail }, 502);
  }

  let parsed: { questions?: unknown };
  try {
    const data = await upstream.json();
    parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? '{}');
  } catch (err) {
    console.error('quiz: unreadable answer', String(err));
    return json({ error: 'SHAPE', detail: 'unreadable answer' }, 502);
  }

  // Only questions the app can actually render leave this function.
  const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
    .filter((q: any) => q && typeof q.question === 'string'
      && Array.isArray(q.choices) && q.choices.length === 4
      && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4)
    .slice(0, count)
    .map((q: any) => ({
      question: String(q.question).trim(),
      choices: q.choices.map((c: unknown) => String(c).trim()),
      answer: q.answer
    }));

  console.log(`quiz: writing ${questions.length} questions about "${title}"`);
  if (questions.length < 3) {
    console.error('quiz: too few usable questions', questions.length);
    return json({ error: 'SHAPE', detail: `only ${questions.length} usable questions` }, 502);
  }
  return json({ questions });
});
