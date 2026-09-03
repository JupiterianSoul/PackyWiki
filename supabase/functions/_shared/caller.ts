// Who is calling, and the tools every game function needs.
//
// The function checks the caller ITSELF rather than leaning on the gateway's
// "verify JWT" switch (see the quiz function for why). The lookup's apikey
// has to be the project's own, which the runtime injects; the caller's
// bearer token is a user session and is rejected as an apikey.
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export const projectUrl = () => Deno.env.get('SUPABASE_URL') ?? '';
export const projectKey = (req: Request) =>
  Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? req.headers.get('apikey') ?? '';
export const serviceKey = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** The signed-in user behind the request, or null. */
export async function callerId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  try {
    const who = await fetch(`${projectUrl()}/auth/v1/user`, { headers: { Authorization: auth, apikey: projectKey(req) } });
    if (!who.ok) return null;
    const user = await who.json();
    return typeof user?.id === 'string' ? user.id : null;
  } catch {
    return null;
  }
}

/** A row written with the service key, past row-level security. Errors are logged, never thrown. */
export async function adminInsert(table: string, row: Record<string, unknown>): Promise<boolean> {
  const key = serviceKey();
  if (!key) { console.warn(`${table}: no service key, row not written`); return false; }
  try {
    const res = await fetch(`${projectUrl()}/rest/v1/${table}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row)
    });
    if (!res.ok) console.error(`${table}: insert refused`, res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error(`${table}: insert failed`, err);
    return false;
  }
}

/** Rows read or changed with the service key. */
export async function admin(path: string, init: RequestInit = {}): Promise<Response> {
  const key = serviceKey();
  return fetch(`${projectUrl()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
  });
}

/** A uniform random integer below `n`, from the platform's cryptographic generator, without modulo bias. */
export function randomBelow(n: number): number {
  if (!Number.isInteger(n) || n <= 0) throw new Error('randomBelow: bad range');
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

/** A short random token for a spin, so a result can be told from a replay. */
export const nonce = () => {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
};

/** The UTC day, the way the app writes it. */
export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
