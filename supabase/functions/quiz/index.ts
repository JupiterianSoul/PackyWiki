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
const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';

/**
 * Models to try, best first. Groq retires models without much ceremony, so
 * the list is a preference rather than a promise: if none of these answer,
 * the function asks Groq what it actually has and uses that instead.
 */
const MODEL_PREFERENCE = [
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'openai/gpt-oss-20b',
  'gemma2-9b-it'
];

/** Models that cannot hold a conversation, whatever else they are good at. */
const NOT_CHAT = /whisper|tts|guard|embed|vision-only|distil/i;

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

  // A key pasted into a dashboard field very often arrives with a stray
  // space or newline attached, and Groq refuses it without saying why.
  const key = (Deno.env.get('GROQ_API_KEY') ?? '').trim();
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
  const text = String(body.text ?? '').slice(0, 3500);
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

  /** One attempt at one model. `jsonMode` is the strict-JSON request. */
  async function ask(model: string, jsonMode: boolean) {
    const body: Record<string, unknown> = {
      model,
      temperature: 0.6,
      messages: [
        { role: 'system', content: 'You write quiz questions. You respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ]
    };
    if (jsonMode) body.response_format = { type: 'json_object' };
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body)
    });
    if (res.ok) return { ok: true as const, res };
    return { ok: false as const, status: res.status, detail: (await res.text()).slice(0, 400) };
  }

  /** What Groq will actually serve today, best guess first. */
  async function liveModels(): Promise<string[]> {
    try {
      const res = await fetch(GROQ_MODELS_URL, { headers: { Authorization: `Bearer ${key}` } });
      if (!res.ok) return [];
      const data = await res.json();
      return (data?.data ?? [])
        .map((m: { id?: string }) => String(m?.id ?? ''))
        .filter((id: string) => id && !NOT_CHAT.test(id));
    } catch {
      return [];
    }
  }

  const configured = Deno.env.get('GROQ_MODEL');
  const candidates = configured ? [configured, ...MODEL_PREFERENCE] : [...MODEL_PREFERENCE];
  let upstream: Response | null = null;
  let lastStatus = 0;
  let lastDetail = '';
  let usedModel = '';
  let asked = false;

  for (let round = 0; round < 2 && !upstream; round++) {
    // Second round: stop guessing and use whatever this account can see.
    const list = round === 0 ? candidates : (await liveModels()).slice(0, 4);
    for (const model of list) {
      let attempt;
      try {
        attempt = await ask(model, true);
      } catch (err) {
        console.error('quiz: could not reach the model', String(err));
        return json({ error: 'UPSTREAM', detail: 'could not reach the model' }, 502);
      }
      asked = true;
      // A key that is refused will be refused by every model: stop at once.
      if (!attempt.ok && (attempt.status === 401 || attempt.status === 403)) {
        console.error('quiz: the Groq key was refused', attempt.status, attempt.detail);
        return json({ error: 'UPSTREAM', status: attempt.status, detail: 'Groq refused the key' }, 502);
      }
      // Some models will answer, but not under a strict JSON instruction.
      if (!attempt.ok && /response_format|json_object/i.test(attempt.detail)) {
        try {
          attempt = await ask(model, false);
        } catch {
          /* fall through to the next model */
        }
      }
      if (attempt.ok) { upstream = attempt.res; usedModel = model; break; }
      lastStatus = attempt.status;
      lastDetail = attempt.detail;
      console.warn(`quiz: ${model} refused (${attempt.status})`);
    }
  }

  if (!upstream) {
    console.error('quiz: no model would answer', lastStatus, lastDetail);
    return json({
      error: 'UPSTREAM',
      status: lastStatus || 502,
      detail: asked ? `no model would answer: ${lastDetail}` : 'no model available'
    }, 502);
  }
  console.log(`quiz: answered by ${usedModel}`);

  let parsed: { questions?: unknown };
  try {
    const data = await upstream.json();
    // Without strict JSON mode a model may wrap its answer in a code fence.
    const content = String(data?.choices?.[0]?.message?.content ?? '{}')
      .replace(/^[^{]*```(?:json)?/i, '')
      .replace(/```[^}]*$/, '')
      .trim();
    parsed = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1) || '{}');
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
