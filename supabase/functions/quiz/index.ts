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
const MODEL = 'llama-3.1-8b-instant';

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) return json({ error: 'QUIZ_UNSET' }, 503);

  // Who is asking? The app sends the player's own session, so the auth API
  // can confirm this is a signed-in player of this project and not somebody
  // who found the URL and fancied spending the quiz budget.
  const authHeader = req.headers.get('Authorization') ?? '';
  const apikey = req.headers.get('apikey') ?? authHeader.replace(/^Bearer\s+/i, '');
  const projectUrl = Deno.env.get('SUPABASE_URL');
  if (!authHeader || !projectUrl) return json({ error: 'UNAUTHORISED' }, 401);
  try {
    const who = await fetch(`${projectUrl}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey }
    });
    if (!who.ok) return json({ error: 'UNAUTHORISED' }, 401);
  } catch {
    return json({ error: 'UNAUTHORISED' }, 401);
  }

  let body: { title?: string; text?: string; rank?: number; count?: number; lang?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'BAD_REQUEST' }, 400);
  }

  const title = String(body.title ?? '').slice(0, 200);
  const text = String(body.text ?? '').slice(0, 6000);
  const rank = Number.isFinite(body.rank) ? Number(body.rank) : 0;
  const count = Math.min(5, Math.max(3, Number(body.count) || 3));
  const language = body.lang === 'fr' ? 'French' : 'English';
  if (!title || text.length < 80) return json({ error: 'BAD_REQUEST' }, 400);

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
        model: MODEL,
        temperature: 0.6,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You write quiz questions. You respond with valid JSON only.' },
          { role: 'user', content: prompt }
        ]
      })
    });
  } catch {
    return json({ error: 'UPSTREAM' }, 502);
  }
  if (!upstream.ok) return json({ error: 'UPSTREAM', status: upstream.status }, 502);

  let parsed: { questions?: unknown };
  try {
    const data = await upstream.json();
    parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? '{}');
  } catch {
    return json({ error: 'SHAPE' }, 502);
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

  if (questions.length < 3) return json({ error: 'SHAPE' }, 502);
  return json({ questions });
});
