/*
 * A fake Supabase, good enough for the account, sync and friends screens.
 *
 * Outbound network is blocked in this sandbox, so nothing can be tested
 * against a real project. What this DOES buy is that every request the app
 * makes is seen, answered in the shape PostgREST and GoTrue answer in, and
 * checked — including the row-level rules, which are enforced here rather than
 * assumed, so a screen that reads something it should not be able to fails.
 */
export const SUPA_URL = 'https://stub.supabase.co';
export const SUPA_KEY = 'stub-anon-key';

/**
 * One database, many pages. Two players are two browser contexts with their
 * own route handlers, and they have to be looking at the same server — so the
 * tables (and the id counter, or both players would be issued the same uuid)
 * are created once and passed in.
 */
export const newDatabase = () => ({
  users: new Map(),         // email -> { id, password, meta }
  profiles: new Map(),      // id -> profile row
  saves: new Map(),         // id -> { user_id, data, updated_at }
  savesHistory: [],         // { id, user_id, at, reason, cards, coins, data }: what the saves_history trigger files
  friendships: [],          // { id, requester, addressee, status, created_at }
  messages: [],             // { id, sender, recipient, body, created_at, read_at }
  deliveries: [],           // { id, sender, recipient, kind, payload, created_at, claimed_at }
  trades: [],               // { id, proposer, recipient, offer, ask, status, created_at }
  auctions: [],             // { id, seller, seller_name, card, start_price, current_bid, bidder, bidder_name, bid_count, ends_at, status, created_at }
  codex: new Map(),         // key -> { key, title, rarity, price, views, thumbnail, lang, found_at, found_by }
  wishlists: [],            // { owner, key, card, created_at }
  tokens: new Map(),        // access_token -> user id
  seq: 0
});

/**
 * `schema` picks which shape of database to impersonate:
 *   'v2' (default) everything the app knows about
 *   'v1'           a project whose owner has not re-run schema.sql: no
 *                  social columns on profiles, and no messages/deliveries/
 *                  trades tables at all. The app must stay usable on this.
 */
export function installSupabase(page, { log = null, db = newDatabase(), schema = 'v2' } = {}) {
  const uuid = () => `00000000-0000-4000-8000-${String(++db.seq).padStart(12, '0')}`;

  const note = (method, url) => { if (log) log.push(`${method} ${url.replace(SUPA_URL, '')}`); };

  // The page is on 127.0.0.1 and the "server" is on another origin, so every
  // request is a CORS request and the preflight has to be answered like the
  // real one is.
  const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-expose-headers': 'content-range,x-supabase-api-version'
  };
  const preflight = (route) => route.fulfill({ status: 204, headers: CORS, body: '' });

  const json = (route, body, status = 200) => route.fulfill({
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const fail = (route, message, status = 400, pgCode = null) =>
    json(route, { message, error: message, code: pgCode ?? status }, status);

  /* --- pretending to be the older schema ---------------------------------- */
  const V1_ABSENT_COLUMNS = ['avatar', 'presence', 'last_seen_at', 'visibility'];
  const V1_ABSENT_TABLES = ['messages', 'deliveries', 'trades', 'auctions', 'codex', 'wishlists'];
  /** Postgres 42703 — the exact refusal a missing column produces. */
  const noColumn = (route, name) =>
    fail(route, `column profiles.${name} does not exist`, 400, '42703');
  /** Postgres 42P01 — the exact refusal a missing table produces. */
  const noTable = (route, name) =>
    fail(route, `relation "public.${name}" does not exist`, 400, '42P01');

  /**
   * A PostgREST result set. `single()` and `maybeSingle()` ask for
   * `application/vnd.pgrst.object+json`, and the real server then returns a
   * bare object rather than a one-element array — returning the array anyway
   * is the difference between a working profile and an undefined username.
   */
  const rows = (route, list, status = 200) => {
    const accept = route.request().headers().accept ?? '';
    if (!accept.includes('vnd.pgrst.object+json')) return json(route, list, status);
    if (list.length === 1) return json(route, list[0], status);
    return json(route, {
      code: 'PGRST116',
      details: `Results contain ${list.length} rows, application/vnd.pgrst.object+json requires 1 row`,
      hint: null,
      message: 'JSON object requested, multiple (or no) rows returned'
    }, 406);
  };

  const session = (user) => {
    const token = `tok-${user.id}`;
    db.tokens.set(token, user.id);
    return {
      access_token: token, token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: `ref-${user.id}`,
      user: {
        id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email,
        user_metadata: user.meta ?? {}, app_metadata: {}, created_at: new Date().toISOString()
      }
    };
  };

  /** Who is calling, from the bearer token. This is what stands in for auth.uid(). */
  const caller = (route) => {
    const auth = route.request().headers().authorization ?? '';
    return db.tokens.get(auth.replace(/^Bearer /, '')) ?? null;
  };

  /** Files a save row into the history the way the server's trigger does. */
  const fileSave = (row, reason) => {
    let cards = null; let coins = null;
    try { cards = Object.keys(JSON.parse(row.data?.data?.['wikster.collection.v3'] ?? '{}').entries ?? {}).length; } catch { /* unreadable */ }
    try { coins = Number(row.data?.data?.['wikster.wallet.v1']); if (!Number.isFinite(coins)) coins = null; } catch { /* unreadable */ }
    db.savesHistory.push({ id: ++db.seq, user_id: row.user_id, at: new Date().toISOString(), reason, cards, coins, data: row.data });
  };

  const areFriends = (a, b) => db.friendships.some((f) =>
    f.status === 'accepted' &&
    ((f.requester === a && f.addressee === b) || (f.requester === b && f.addressee === a)));

  // --- GoTrue ---------------------------------------------------------------
  page.route(`${SUPA_URL}/auth/v1/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return preflight(route);
    const url = new URL(request.url());
    const path = url.pathname.replace('/auth/v1/', '');
    note(request.method(), request.url());
    const body = request.postData() ? JSON.parse(request.postData()) : {};

    if (path === 'signup') {
      if (db.users.has(body.email)) return fail(route, 'User already registered', 422);
      if ((body.password ?? '').length < 6) return fail(route, 'Password should be at least 6 characters', 422);
      const user = { id: uuid(), email: body.email, password: body.password, meta: body.data ?? {} };
      db.users.set(body.email, user);
      return json(route, session(user));
    }
    if (path === 'token') {
      const user = db.users.get(body.email);
      if (!user || user.password !== body.password) {
        return fail(route, 'Invalid login credentials', 400);
      }
      return json(route, session(user));
    }
    if (path === 'logout') return route.fulfill({ status: 204, headers: CORS, body: '' });
    if (path === 'recover') return json(route, {});
    if (path === 'user') {
      const id = caller(route);
      const user = [...db.users.values()].find((u) => u.id === id);
      return user ? json(route, session(user).user) : fail(route, 'Unauthorized', 401);
    }
    return json(route, {});
  });

  // --- PostgREST ------------------------------------------------------------
  page.route(`${SUPA_URL}/rest/v1/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return preflight(route);
    const url = new URL(request.url());
    const path = url.pathname.replace('/rest/v1/', '');
    const method = request.method();
    note(method, request.url());
    const me = caller(route);
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    const params = url.searchParams;

    // Signed out, the bearer token is just the anon key. The schema grants
    // that role exactly one thing, so this stub does too.
    if (!me && path !== 'rpc/username_available') {
      return fail(route, 'JWT expired', 401);
    }

    /* -- rpc -- */
    if (path === 'rpc/username_available') {
      const taken = [...db.profiles.values()]
        .some((p) => p.username.toLowerCase() === String(body.name).toLowerCase());
      return json(route, !taken);
    }
    /* -- the leaderboard: scores seeded by the test as db.scores = [{ user_id, username, score }] -- */
    if (path === 'rpc/leaderboard_page') {
      const all = [...(db.scores ?? [])].sort((a, b) => b.score - a.score);
      const page = Number(body.p_page) || 0;
      return json(route, all.slice(page * 20, page * 20 + 20).map((r, i) => ({ rank: page * 20 + i + 1, user_id: r.user_id, username: r.username, score: r.score })));
    }
    if (path === 'rpc/submit_score') {
      // The server's rule: one row per game and day, a duel or reveal round
      // replacing the day's when it beats it, never above the game's maximum.
      const max = { wikdle: 1400, duel: 3100, reveal: 1600 }[body.p_game];
      if (!max) return fail(route, 'this game is not scored by the client', 400);
      if (body.p_points < 0 || body.p_points > max) return fail(route, 'points out of range', 400);
      db.scores ??= [];
      const at = db.scores.findIndex((r) => r.user_id === me && r.game === body.p_game && r.day === body.p_day);
      if (at >= 0) {
        if (body.p_game === 'wikdle' || body.p_points <= db.scores[at].score) return json(route, null, 204);
        db.scores.splice(at, 1);
      }
      const username = db.profiles.get(me)?.username ?? 'someone';
      db.scores.push({ user_id: me, username, game: body.p_game, day: body.p_day, score: body.p_points });
      return json(route, null, 204);
    }
    if (path === 'rpc/my_rank') {
      const all = [...(db.scores ?? [])].sort((a, b) => b.score - a.score);
      const at = all.findIndex((r) => r.user_id === me);
      return json(route, at < 0 ? [] : [{ rank: at + 1, score: all[at].score, total: all.length }]);
    }
    if (path === 'rpc/friend_cards') {
      // The whole point of the function: only a friend gets anything, and only
      // the collection key, never the rest of the blob.
      const target = body.target;
      if (target !== me && !areFriends(me, target)) return json(route, { allowed: false });
      const save = db.saves.get(target);
      return json(route, {
        allowed: true,
        cards: save?.data?.data?.['wikster.collection.v3'] ?? null
      });
    }

    /* -- the market: same rules as the definer functions in schema.sql -- */
    const auctionFloor = (a) => (a.current_bid == null ? a.start_price : Math.ceil(a.current_bid * 1.15));
    const postParcel = (sender, recipient, kind, payload) => db.deliveries.push({
      id: uuid(), sender, recipient, kind, payload,
      created_at: new Date().toISOString(), claimed_at: null
    });
    if (path === 'rpc/create_auction') {
      if (schema === 'v1') return fail(route, 'function public.create_auction does not exist', 404);
      const minutes = Number(body.minutes);
      if (![10, 30, 60, 180, 360, 720, 1440].includes(minutes)) return fail(route, 'BAD_DURATION', 400);
      const price = Number(body.price);
      if (!(price >= 1 && price <= 1000000)) return fail(route, 'BAD_PRICE', 400);
      const mine = db.auctions.filter((a) => a.seller === me && a.status === 'open').length;
      if (mine >= 10) return fail(route, 'TOO_MANY', 400);
      const row = {
        id: uuid(), seller: me,
        seller_name: db.profiles.get(me)?.username ?? '',
        card: body.card, start_price: price, current_bid: null,
        bidder: null, bidder_name: null, bid_count: 0,
        ends_at: new Date(Date.now() + minutes * 60000).toISOString(),
        status: 'open', created_at: new Date().toISOString()
      };
      db.auctions.push(row);
      return json(route, row);
    }
    if (path === 'rpc/place_bid') {
      if (schema === 'v1') return fail(route, 'function public.place_bid does not exist', 404);
      const a = db.auctions.find((x) => x.id === body.auction);
      if (!a) return fail(route, 'NOT_FOUND', 400);
      if (a.status !== 'open' || Date.now() >= new Date(a.ends_at).getTime()) return fail(route, 'ENDED', 400);
      if (a.seller === me) return fail(route, 'OWN_AUCTION', 400);
      const amount = Number(body.amount);
      if (!(amount >= auctionFloor(a))) return fail(route, 'TOO_LOW', 400);
      if (a.bidder) {
        postParcel(a.seller, a.bidder, 'auction-money',
          { amount: a.current_bid, reason: 'refund', title: a.card?.title });
      }
      a.current_bid = amount;
      a.bidder = me;
      a.bidder_name = db.profiles.get(me)?.username ?? '';
      a.bid_count += 1;
      if (new Date(a.ends_at).getTime() - Date.now() < 10000) {
        a.ends_at = new Date(Date.now() + 65000).toISOString();
      }
      return json(route, a);
    }
    if (path === 'rpc/cancel_auction') {
      if (schema === 'v1') return fail(route, 'function public.cancel_auction does not exist', 404);
      const a = db.auctions.find((x) => x.id === body.auction);
      if (!a) return fail(route, 'NOT_FOUND', 400);
      if (a.seller !== me) return fail(route, 'NOT_YOURS', 400);
      if (a.status !== 'open') return fail(route, 'ENDED', 400);
      if (a.bid_count > 0) return fail(route, 'HAS_BIDS', 400);
      a.status = 'cancelled';
      postParcel(a.seller, a.seller, 'auction-card', a.card);
      return json(route, a);
    }
    if (path === 'rpc/settle_auction') {
      if (schema === 'v1') return fail(route, 'function public.settle_auction does not exist', 404);
      const a = db.auctions.find((x) => x.id === body.auction);
      if (!a) return fail(route, 'NOT_FOUND', 400);
      if (a.status !== 'open') return json(route, a);
      if (Date.now() < new Date(a.ends_at).getTime()) return fail(route, 'NOT_OVER', 400);
      a.status = 'settled';
      if (!a.bidder) {
        postParcel(a.seller, a.seller, 'auction-card', a.card);
      } else {
        postParcel(a.seller, a.bidder, 'auction-card', a.card);
        postParcel(a.bidder, a.seller, 'auction-money',
          { amount: a.current_bid, reason: 'sale', title: a.card?.title });
      }
      return json(route, a);
    }
    if (path === 'auctions') {
      if (schema === 'v1') return fail(route, 'relation "public.auctions" does not exist', 404);
      if (method === 'GET') {
        const found = db.auctions.filter((a) => a.status === 'open' || a.seller === me || a.bidder === me);
        found.sort((x, y) => new Date(x.ends_at) - new Date(y.ends_at));
        return rows(route, found);
      }
    }

    /* -- the codex and wishlists (V4) -- */
    if (path === 'rpc/codex_counts') {
      if (schema === 'v1') return fail(route, 'function public.codex_counts does not exist', 404);
      const byRarity = {};
      for (const row of db.codex.values()) {
        if (row.rarity) byRarity[row.rarity] = (byRarity[row.rarity] ?? 0) + 1;
      }
      return json(route, { total: db.codex.size, byRarity });
    }
    if (path === 'codex') {
      if (schema === 'v1') return fail(route, 'relation "public.codex" does not exist', 404);
      if (method === 'GET') {
        let found = [...db.codex.values()];
        const rarityParam = params.get('rarity');
        if ((rarityParam ?? '').startsWith('eq.')) found = found.filter((r) => r.rarity === rarityParam.slice(3));
        // PostgREST in.(a,b): the app asks for a tier and its legacy aliases.
        else if ((rarityParam ?? '').startsWith('in.')) {
          const want = rarityParam.slice(3).replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, ''));
          found = found.filter((r) => want.includes(r.rarity));
        }
        const titleParam = params.get('title');
        if ((titleParam ?? '').startsWith('ilike.')) {
          const q = titleParam.slice(6).replace(/\*/g, '').replace(/%/g, '').toLowerCase();
          found = found.filter((r) => r.title.toLowerCase().includes(q));
        }
        const order = params.get('order') ?? '';
        if (order.startsWith('title')) found.sort((a, b) => a.title.localeCompare(b.title));
        else if (order.startsWith('price')) found.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
        else found.sort((a, b) => new Date(b.found_at) - new Date(a.found_at));
        const range = request.headers()['range'] ?? '0-39';
        const [lo, hi] = range.split('-').map(Number);
        return rows(route, found.slice(lo, hi + 1));
      }
      if (method === 'POST') {
        const list = Array.isArray(body) ? body : [body];
        for (const row of list) {
          if (row.found_by !== me) return fail(route, 'row-level security policy', 403);
          if (!db.codex.has(row.key)) db.codex.set(row.key, { ...row, found_at: new Date().toISOString() });
        }
        return rows(route, [], 201);
      }
    }
    if (path === 'wishlists') {
      if (schema === 'v1') return fail(route, 'relation "public.wishlists" does not exist', 404);
      if (method === 'GET') {
        let found = db.wishlists;
        const ownerParam = params.get('owner');
        if ((ownerParam ?? '').startsWith('eq.')) {
          const owner = ownerParam.slice(3);
          if (owner !== me && !areFriends(me, owner)) return rows(route, []);
          found = found.filter((w) => w.owner === owner);
        } else if ((ownerParam ?? '').startsWith('in.')) {
          const ids = ownerParam.slice(4, -1).split(',').map((x) => x.replace(/"/g, ''));
          found = found.filter((w) => ids.includes(w.owner) && (w.owner === me || areFriends(me, w.owner)));
        } else {
          found = found.filter((w) => w.owner === me || areFriends(me, w.owner));
        }
        return rows(route, found);
      }
      if (method === 'POST') {
        const list = Array.isArray(body) ? body : [body];
        for (const row of list) {
          if (row.owner !== me) return fail(route, 'row-level security policy', 403);
          if (!db.wishlists.some((w) => w.owner === row.owner && w.key === row.key)) {
            db.wishlists.push({ ...row, created_at: new Date().toISOString() });
          }
        }
        return rows(route, [], 201);
      }
      if (method === 'DELETE') {
        const owner = (params.get('owner') ?? '').slice(3);
        const key = (params.get('key') ?? '').slice(3);
        if (owner !== me) return fail(route, 'row-level security policy', 403);
        db.wishlists = db.wishlists.filter((w) => !(w.owner === owner && w.key === key));
        return rows(route, []);
      }
    }

    /* -- profiles -- */
    if (path === 'profiles') {
      if (schema === 'v1') {
        const asked = params.get('select') ?? '';
        const missingRead = V1_ABSENT_COLUMNS.find((c) => asked.includes(c));
        if (missingRead) return noColumn(route, missingRead);
        const missingWrite = body && V1_ABSENT_COLUMNS.find((c) => c in body);
        if (missingWrite) return noColumn(route, missingWrite);
      }
      if (method === 'GET') {
        let found = [...db.profiles.values()];
        const eq = params.get('id');
        if (eq?.startsWith('eq.')) found = found.filter((p) => p.id === eq.slice(3));
        if (eq?.startsWith('in.')) {
          const wanted = eq.slice(3).replace(/[()]/g, '').split(',');
          found = found.filter((p) => wanted.includes(p.id));
        }
        const neq = params.get('id')?.startsWith('neq.') ? params.get('id').slice(4) : null;
        if (neq) found = found.filter((p) => p.id !== neq);
        const like = params.get('username');
        if (like?.startsWith('ilike.')) {
          const pattern = like.slice(6).replace(/%$/, '').toLowerCase();
          found = found.filter((p) => p.username.toLowerCase().startsWith(pattern));
        }
        return rows(route, found);
      }
      if (method === 'POST') {
        if (body.id !== me) return fail(route, 'new row violates row-level security policy', 403);
        if ([...db.profiles.values()].some((p) => p.username.toLowerCase() === body.username.toLowerCase())) {
          return fail(route, 'duplicate key value violates unique constraint "profiles_username_key"', 409);
        }
        const row = {
          id: body.id, username: body.username, created_at: new Date().toISOString(),
          level: 1, rank: null, cards: 0, unique_cards: 0, boosters_opened: 0,
          collection_value: 0, best_rarity: null, play_ms: 0,
          ...(schema === 'v1' ? {} : {
            visibility: 'public', presence: 'online',
            last_seen_at: new Date().toISOString(), avatar: null
          })
        };
        db.profiles.set(row.id, row);
        return rows(route, [row], 201);
      }
      if (method === 'PATCH') {
        const target = (params.get('id') ?? '').slice(3);
        if (target !== me) return fail(route, 'row-level security policy', 403);
        const row = db.profiles.get(target);
        if (row && body.username && [...db.profiles.values()]
            .some((p) => p.id !== target && p.username.toLowerCase() === body.username.toLowerCase())) {
          return fail(route, 'duplicate key value violates unique constraint', 409);
        }
        if (row) Object.assign(row, body);
        return rows(route, row ? [row] : []);
      }
    }

    /* -- saves -- */
    if (path === 'saves') {
      if (method === 'GET') {
        const target = (params.get('user_id') ?? '').slice(3);
        // The narrowed policy: nobody reads anyone else's save row.
        if (target !== me) return json(route, []);
        const row = db.saves.get(target);
        return rows(route, row ? [row] : []);
      }
      if (method === 'POST') {   // upsert
        if (body.user_id !== me) return fail(route, 'row-level security policy', 403);
        // What the saves_history trigger does on the real server: the row
        // being replaced is filed first.
        const previous = db.saves.get(body.user_id);
        if (previous) fileSave(previous, 'update');
        db.saves.set(body.user_id, { ...body, updated_at: new Date().toISOString() });
        return rows(route, [db.saves.get(body.user_id)], 201);
      }
      if (method === 'DELETE') {
        const target = (params.get('user_id') ?? '').slice(3);
        if (target !== me) return fail(route, 'row-level security policy', 403);
        const previous = db.saves.get(target);
        if (previous) fileSave(previous, 'erase');
        db.saves.delete(target);
        return json(route, [], 204);
      }
    }
    if (path === 'saves_history') {
      if (schema === 'v1') return fail(route, 'relation "public.saves_history" does not exist', 404);
      if (method === 'GET') {
        const found = db.savesHistory.filter((h) => h.user_id === me);
        const id = (params.get('id') ?? '').slice(3);
        const picked = id ? found.filter((h) => String(h.id) === id) : found;
        picked.sort((x, y) => new Date(y.at) - new Date(x.at));
        return rows(route, picked);
      }
      if (method === 'POST') {
        if (body.user_id !== me) return fail(route, 'row-level security policy', 403);
        fileSave({ user_id: body.user_id, data: body.data }, body.reason ?? 'update');
        return rows(route, [db.savesHistory[db.savesHistory.length - 1]], 201);
      }
    }

    /* -- friendships -- */
    if (path === 'friendships') {
      if (method === 'GET') {
        return rows(route, db.friendships.filter((f) => f.requester === me || f.addressee === me));
      }
      if (method === 'POST') {
        if (body.requester !== me) return fail(route, 'row-level security policy', 403);
        if (body.requester === body.addressee) return fail(route, 'violates check constraint', 400);
        if (db.friendships.some((f) => f.requester === body.requester && f.addressee === body.addressee)) {
          return fail(route, 'duplicate key value violates unique constraint', 409);
        }
        const row = { id: uuid(), status: 'pending', created_at: new Date().toISOString(), ...body };
        db.friendships.push(row);
        return rows(route, [row], 201);
      }
      if (method === 'PATCH') {
        const id = (params.get('id') ?? '').slice(3);
        const row = db.friendships.find((f) => f.id === id);
        // Only the addressee may accept.
        if (!row || row.addressee !== me) return fail(route, 'row-level security policy', 403);
        Object.assign(row, body);
        return rows(route, [row]);
      }
      if (method === 'DELETE') {
        const id = (params.get('id') ?? '').slice(3);
        const at = db.friendships.findIndex((f) => f.id === id);
        if (at < 0) return rows(route, []);
        if (db.friendships[at].requester !== me && db.friendships[at].addressee !== me) {
          return fail(route, 'row-level security policy', 403);
        }
        const [gone] = db.friendships.splice(at, 1);
        return rows(route, [gone]);
      }
    }

    if (schema === 'v1' && V1_ABSENT_TABLES.includes(path)) return noTable(route, path);

    /* -- messages -- */
    if (path === 'messages') {
      if (method === 'GET') {
        let found = db.messages.filter((m) => m.sender === me || m.recipient === me);
        const orParam = params.get('or');
        if (orParam) {
          const ids = [...orParam.matchAll(/(?:sender|recipient)\.eq\.([0-9a-f-]+)/g)].map((m) => m[1]);
          const pair = new Set(ids);
          found = found.filter((m) => pair.has(m.sender) && pair.has(m.recipient));
        }
        if ((params.get('recipient') ?? '').startsWith('eq.')) {
          found = found.filter((m) => m.recipient === params.get('recipient').slice(3));
        }
        if (params.get('read_at') === 'is.null') found = found.filter((m) => !m.read_at);
        if ((params.get('order') ?? '').includes('created_at.desc')) {
          found = [...found].sort((a, b) => b.created_at.localeCompare(a.created_at));
        }
        const limit = Number(params.get('limit') ?? 0);
        if (limit) found = found.slice(0, limit);
        return rows(route, found);
      }
      if (method === 'POST') {
        if (body.sender !== me) return fail(route, 'row-level security policy', 403);
        if (!areFriends(body.sender, body.recipient)) return fail(route, 'row-level security policy', 403);
        const row = { id: uuid(), read_at: null, created_at: new Date().toISOString(), ...body };
        db.messages.push(row);
        return rows(route, [row], 201);
      }
      if (method === 'PATCH') {
        const recipient = (params.get('recipient') ?? '').slice(3);
        if (recipient !== me) return fail(route, 'row-level security policy', 403);
        const sender = (params.get('sender') ?? '').slice(3);
        const changed = [];
        for (const m of db.messages) {
          if (m.recipient !== me) continue;
          if (sender && m.sender !== sender) continue;
          if (params.get('read_at') === 'is.null' && m.read_at) continue;
          Object.assign(m, body);
          changed.push(m);
        }
        return rows(route, changed);
      }
    }

    /* -- deliveries -- */
    if (path === 'deliveries') {
      if (method === 'GET') {
        let found = db.deliveries.filter((d) => d.sender === me || d.recipient === me);
        if ((params.get('recipient') ?? '').startsWith('eq.')) {
          found = found.filter((d) => d.recipient === params.get('recipient').slice(3));
        }
        if (params.get('claimed_at') === 'is.null') found = found.filter((d) => !d.claimed_at);
        return rows(route, found);
      }
      if (method === 'POST') {
        if (body.sender !== me) return fail(route, 'row-level security policy', 403);
        if (body.sender !== body.recipient && !areFriends(body.sender, body.recipient)) {
          return fail(route, 'row-level security policy', 403);
        }
        const row = { id: uuid(), claimed_at: null, created_at: new Date().toISOString(), ...body };
        db.deliveries.push(row);
        return rows(route, [row], 201);
      }
      if (method === 'PATCH') {
        const id = (params.get('id') ?? '').slice(3);
        const row = db.deliveries.find((d) => d.id === id);
        if (!row || row.recipient !== me) return fail(route, 'row-level security policy', 403);
        Object.assign(row, body);
        return rows(route, [row]);
      }
    }

    /* -- trades -- */
    if (path === 'trades') {
      if (method === 'GET') {
        let found = db.trades.filter((tr) => tr.proposer === me || tr.recipient === me);
        const statusParam = params.get('status');
        if (statusParam?.startsWith('neq.')) found = found.filter((tr) => tr.status !== statusParam.slice(4));
        if ((params.get('order') ?? '').includes('created_at.desc')) {
          found = [...found].sort((a, b) => b.created_at.localeCompare(a.created_at));
        }
        return rows(route, found);
      }
      if (method === 'POST') {
        if (body.proposer !== me) return fail(route, 'row-level security policy', 403);
        if (!areFriends(body.proposer, body.recipient)) return fail(route, 'row-level security policy', 403);
        const row = { id: uuid(), status: 'pending', resolved_at: null,
          created_at: new Date().toISOString(), ...body };
        db.trades.push(row);
        return rows(route, [row], 201);
      }
      if (method === 'PATCH') {
        const id = (params.get('id') ?? '').slice(3);
        const row = db.trades.find((tr) => tr.id === id);
        if (!row || (row.proposer !== me && row.recipient !== me)) {
          return fail(route, 'row-level security policy', 403);
        }
        Object.assign(row, body);
        return rows(route, [row]);
      }
    }

    return fail(route, `unstubbed: ${method} ${path}`, 404);
  });

  return db;
}
