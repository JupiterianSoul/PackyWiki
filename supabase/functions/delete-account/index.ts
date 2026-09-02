/**
 * DELETE ACCOUNT
 * ----------------------------------------------------------------------------
 * Wiping a save leaves the account behind: the email is still registered, so
 * signing in brings back an empty account rather than nothing at all. This
 * removes the account itself, so the address is free again and signing up with
 * it makes a genuinely new player.
 *
 * Why a function rather than a client call: deleting a row in `auth.users`
 * needs the service key, and a key shipped inside an APK is a key anyone can
 * pull back out of it. The key stays here.
 *
 * Deploy once:
 *
 *   supabase secrets set SERVICE_ROLE_KEY=...      # Settings, API, service_role
 *   supabase functions deploy delete-account
 *
 * A caller can only ever delete THEMSELVES. The id is taken from the token the
 * request arrives with, never from the body, so there is no id to tamper with:
 * asking to delete somebody else is not a request this function can express.
 *
 * The `auth.users` row is the last thing to go. Every table that references it
 * is declared `on delete cascade` in schema.sql, so the rows go with it; they
 * are cleared first anyway, because a cascade that half-fails is worse than a
 * delete that has nothing left to do.
 */
const TABLES: Array<[string, string[]]> = [
  ['saves', ['user_id']],
  ['wishlists', ['user_id']],
  ['friendships', ['requester', 'addressee']],
  ['messages', ['sender', 'recipient']],
  ['deliveries', ['sender', 'recipient']],
  ['trades', ['proposer', 'recipient']],
  ['auctions', ['seller']],
  ['profiles', ['id']]
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({}, 200);
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);

  const projectUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY')
    ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  // The ANON key, not the service key, is what identifies a caller's token to
  // the auth API. Sending the service key as `apikey` alongside a player's
  // bearer token is a mismatch the API answers with 403, which reads exactly
  // like a rejected user and is not one.
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    ?? Deno.env.get('ANON_KEY')
    ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';

  if (!projectUrl || !serviceKey) {
    console.error('delete-account: not configured');
    return json({ error: 'NOT_CONFIGURED' }, 500);
  }
  if (!authHeader) return json({ error: 'UNAUTHORISED' }, 401);

  // WHO is asking. The token decides, so a caller can only reach their own row.
  let userId = '';
  try {
    const headers: Record<string, string> = { Authorization: authHeader };
    // Without an anon key, ask with no apikey at all rather than with the
    // wrong one: the bearer token alone is enough for this endpoint.
    if (anonKey) headers.apikey = anonKey;
    const who = await fetch(`${projectUrl}/auth/v1/user`, { headers });
    if (!who.ok) {
      const detail = (await who.text()).slice(0, 200);
      console.error('delete-account: caller rejected', who.status, detail);
      return json({ error: 'UNAUTHORISED', status: who.status, detail }, 401);
    }
    userId = (await who.json())?.id ?? '';
  } catch (err) {
    console.error('delete-account: auth lookup failed', String(err));
    return json({ error: 'UNAUTHORISED' }, 401);
  }
  if (!userId) return json({ error: 'UNAUTHORISED' }, 401);

  const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  // The player's rows first, table by table, so one refusal does not strand
  // the rest. A project on an older schema.sql simply has fewer of these.
  for (const [table, columns] of TABLES) {
    for (const column of columns) {
      try {
        const res = await fetch(
          `${projectUrl}/rest/v1/${table}?${column}=eq.${userId}`,
          { method: 'DELETE', headers: admin }
        );
        if (!res.ok && res.status !== 404) {
          console.warn(`delete-account: ${table}.${column} said ${res.status}`);
        }
      } catch (err) {
        console.warn(`delete-account: ${table}.${column} failed`, String(err));
      }
    }
  }

  // Then the account. Once this returns, the address is free to sign up again.
  try {
    const gone = await fetch(`${projectUrl}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: admin
    });
    if (!gone.ok) {
      const detail = (await gone.text()).slice(0, 200);
      console.error('delete-account: user delete failed', gone.status, detail);
      return json({ error: 'DELETE_FAILED', status: gone.status, detail }, 500);
    }
  } catch (err) {
    console.error('delete-account: user delete threw', String(err));
    return json({ error: 'DELETE_FAILED' }, 500);
  }

  console.log('delete-account: removed', userId);
  return json({ ok: true });
});
