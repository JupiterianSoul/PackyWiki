/**
 * ACCOUNTS, SYNC AND FRIENDS
 * ============================================================================
 * The only part of the app that talks to a server. Everything here goes
 * through Supabase: email and password authentication, the save blob, the
 * public profile, and friendships.
 *
 * Two rules this module holds to:
 *
 *   1. The database, not this file, decides who may read what. Every table has
 *      row-level security (see supabase/schema.sql). The anon key below ships
 *      inside the app and is public by design; it grants nothing on its own.
 *
 *   2. The local save stays the source of truth while you play. The server is
 *      a copy: writes are debounced and best-effort, so a dropped connection
 *      costs a sync, never a card. Reads happen at sign-in.
 */
import { normalizeRarityId, rarityIdAliases } from './data/rarities.js';
import { createClient } from '@supabase/supabase-js';
import { exportSave, importSave, parseSave } from './save.js';

const URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/** Whether this build was given a backend at all. */
export const configured = Boolean(URL && ANON_KEY);

export const supabase = configured
  ? createClient(URL, ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The WebView has no address bar to carry a token back in.
        detectSessionInUrl: false,
        storageKey: 'wiklodo.auth'
      }
    })
  : null;

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

/* --- errors ------------------------------------------------------------------ */

/**
 * Turn whatever the server said into something a player can act on. Supabase
 * messages are accurate but written for developers.
 *
 * Returns a string key, or NULL when the message is not one this knows - the
 * caller then shows what the server actually said. That matters more than it
 * sounds: a guess dressed up as an explanation sends you looking in the wrong
 * place, and "this does not look like an email address" is a very confident
 * thing to say about an address that is fine.
 *
 * Each test is therefore as narrow as the message allows, and the order is
 * deliberate - "Email rate limit exceeded" is about the rate limit, not the
 * address, so the broader tests come last.
 */
export function readableError(error) {
  const raw = String(error?.message ?? error ?? '').toLowerCase();
  if (!raw) return 'authUnknown';

  // The project IS set up - it is just running the older schema, which is a
  // different problem with a different fix (re-run schema.sql), and saying
  // "not set up yet" about a working database sends the owner nowhere.
  if (raw.includes(SCHEMA_OUTDATED.toLowerCase())) return 'authSchemaOld';

  if (raw.includes('invalid login')) return 'authBadLogin';
  if (raw.includes('already registered') || raw.includes('already been registered')) return 'authEmailTaken';
  if (raw.includes('duplicate key') && raw.includes('username')) return 'authNameTaken';
  if (raw.includes('rate limit') || raw.includes('too many')) return 'authTooMany';

  // The provider itself is switched off in the project's dashboard.
  if (raw.includes('signups not allowed') || raw.includes('signups are disabled')
      || raw.includes('logins are disabled') || raw.includes('provider is disabled')
      || raw.includes('not enabled')) return 'authSignupsOff';

  if (raw.includes('password')) return 'authWeakPassword';
  if (raw.includes('unable to validate email') || raw.includes('email address is invalid')
      || (raw.includes('email') && raw.includes('invalid'))) return 'authBadEmail';

  if (raw.includes('failed to fetch') || raw.includes('network')) return 'authOffline';
  // The project exists but schema.sql was never run: PostgREST answers with a
  // missing relation or a function it cannot find in its schema cache. Worth
  // its own message, because "try again" will never fix it.
  if (raw.includes('does not exist') || raw.includes('schema cache')
      || raw.includes('could not find')) return 'authNoSchema';

  return null;
}

/* --- session ------------------------------------------------------------------ */

export async function currentSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

export const onAuthChange = (fn) => supabase?.auth.onAuthStateChange((_event, session) => fn(session));

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(), password
  });
  if (error) throw error;
  return data.session;
}

/**
 * Create an account. Email and password only.
 *
 * The username is claimed afterwards, as its own step, because the two are
 * different kinds of question: one is credentials, the other is identity in
 * the game. It also removes a failure mode - a name taken between typing it
 * and submitting no longer wastes the whole form.
 *
 * An account therefore exists for a moment with no profile. That is the same
 * state an email-confirmation round trip leaves behind, and the gate already
 * handles it: no profile means "ask for a username".
 */
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) throw error;
  return { session: data.session, needsConfirmation: !data.session };
}

/**
 * Take a username for an account that has none.
 *
 * Returns the profile, or null when the name has just been taken. The unique
 * index is the check that counts; the availability call before it exists only
 * to say "taken" rather than "duplicate key value violates..." in the common
 * case where nobody is racing for it.
 */
export async function claimUsername(userId, username) {
  const name = String(username ?? '').trim();
  if (!USERNAME_RE.test(name)) throw new Error('username invalid');

  const { data: free, error: checkError } = await supabase.rpc('username_available', { name });
  if (checkError) throw checkError;
  if (!free) return null;

  return ensureProfile(userId, name);
}

export async function signOut() {
  await supabase?.auth.signOut();
}

export async function sendReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) throw error;
}

/* --- profile -------------------------------------------------------------------- */

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Create the profile row if this account has not got one yet.
 *
 * Returns null rather than throwing when there is no name to use, or when the
 * wanted name has been taken since sign-up - both are recoverable by asking
 * the player for a different one, which is what the gate does.
 */
export async function ensureProfile(userId, username = null) {
  const existing = await getProfile(userId);
  if (existing) return existing;

  const name = String(username ?? '').trim();
  if (!USERNAME_RE.test(name)) return null;

  const { data, error } = await supabase
    .from('profiles').insert({ id: userId, username: name }).select().single();
  if (error) {
    // A unique-constraint failure means someone else claimed it first; that is
    // a question for the player, not an error to abort sign-in on.
    if (String(error.message ?? '').toLowerCase().includes('duplicate key')) return null;
    throw error;
  }
  return data;
}

/**
 * The profile for a session, creating it from the name carried on the auth
 * user when this is the first sign-in after confirming an email address.
 */
export const profileForSession = (session) =>
  ensureProfile(session.user.id, session.user.user_metadata?.username ?? null);

/**
 * Publish the stats a friend is allowed to see. Sent alongside every save
 * push, so a friend list is one read rather than one save download per friend.
 */
export async function publishStats(userId, stats) {
  const { error } = await supabase.from('profiles').update({
    level: stats.level,
    rank: stats.rank,
    cards: stats.cards,
    unique_cards: stats.uniqueCards,
    boosters_opened: stats.boostersOpened,
    collection_value: stats.value,
    best_rarity: stats.bestRarity,
    play_ms: stats.playMs
  }).eq('id', userId);
  if (error) throw error;
}

/* --- the save ---------------------------------------------------------------------- */

/** Push the whole local save. Last write wins; there is one device per account. */
/*
 * Once a hard reset starts, nothing may write a save again for the life of
 * this page. Erasing used to race its own syncing: a flush already in flight
 * finished after the wipe and put the old save straight back on the server, so
 * the next launch pulled everything down again and the reset looked like it
 * had done nothing at all.
 */
let frozen = false;

export async function pushSave(userId) {
  if (frozen) return;
  const { error } = await supabase.from('saves')
    .upsert({ user_id: userId, data: JSON.parse(exportSave()) }, { onConflict: 'user_id' });
  if (error) throw error;
}

/**
 * Empty the stored save, and the stats with it.
 *
 * "Erase everything" has to reach the server or it erases nothing: the local
 * save would be wiped and then pulled straight back down on the next sign-in.
 * An empty blob fails parseSave() on the way back, which is exactly right -
 * syncOnLogin treats it as an account with nothing stored and uploads whatever
 * the player starts over with.
 */
export async function clearSave(userId) {
  const { error } = await supabase.from('saves')
    .upsert({ user_id: userId, data: { format: 'wiklodo-save', version: 1, at: Date.now(), data: {} } },
      { onConflict: 'user_id' });
  if (error) throw error;
  await publishStats(userId, {
    level: 1, rank: null, cards: 0, uniqueCards: 0,
    boostersOpened: 0, value: 0, bestRarity: null, playMs: 0
  });
}

/**
 * Give the account back to the server as if it had just been made.
 *
 * Emptying the save was never enough on its own. The profile row kept the
 * level and the rank, the wishlist and the friends list survived, and any sync
 * still in flight could put the old save back. So this freezes writing first,
 * then takes down everything that belongs to this player.
 *
 * Each table is taken down on its own and a refusal on one does not stop the
 * others: a project running an older schema.sql simply does not have some of
 * these, and a reset that stops halfway is worse than one that skips a table
 * the database never had. The save itself is the exception - if that cannot be
 * emptied the reset has not happened, so its failure is reported.
 */
export async function hardReset(userId) {
  frozen = true;
  // Remove the row outright where the policy allows it, which is what makes
  // the account read as having nothing stored rather than as holding an empty
  // save. A project running a schema.sql from before that policy existed falls
  // back to blanking it, which the sync treats the same way on the way back.
  const { error } = await supabase.from('saves').delete().eq('user_id', userId);
  if (error) await clearSave(userId);
  else {
    await publishStats(userId, {
      level: 1, rank: null, cards: 0, uniqueCards: 0,
      boostersOpened: 0, value: 0, bestRarity: null, playMs: 0
    }).catch(() => { /* the save is already gone */ });
  }

  const quiet = (promise) => Promise.resolve(promise).then(() => true, () => false);
  await Promise.all([
    quiet(supabase.from('wishlists').delete().eq('user_id', userId)),
    quiet(supabase.from('friendships').delete().or(`requester.eq.${userId},addressee.eq.${userId}`)),
    quiet(supabase.from('messages').delete().or(`sender.eq.${userId},recipient.eq.${userId}`)),
    quiet(supabase.from('deliveries').delete().or(`sender.eq.${userId},recipient.eq.${userId}`)),
    quiet(supabase.from('trades').delete().or(`proposer.eq.${userId},recipient.eq.${userId}`)),
    quiet(supabase.from('auctions').delete().eq('seller', userId)),
    // The profile row stays, because the username is claimed against it and a
    // missing row would read as a deleted account everywhere else. What it
    // carries about progress goes back to nothing.
    quiet(supabase.from('profiles').update({
      level: 1, cards: 0, unique_cards: 0, boosters_opened: 0,
      collection_value: 0, best_rarity: null, play_ms: 0
    }).eq('id', userId))
  ]);
}

/**
 * Delete the account itself, not just what is in it.
 *
 * Emptying a save leaves the address registered, so signing in brings back an
 * empty account rather than nothing: the only way to be rid of it is to remove
 * the `auth.users` row, which needs the service key. That key cannot ship in
 * an APK, so the work happens in the delete-account edge function and this
 * only asks. The function takes the id from the token, so this can never
 * delete anybody else.
 *
 * Nothing is written afterwards: `frozen` stops any sync in flight from
 * recreating rows against an id that no longer exists.
 */
export async function deleteAccount() {
  frozen = true;
  const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return true;
}

export async function fetchSave(userId) {
  const { data, error } = await supabase
    .from('saves').select('data, updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/**
 * Bring the local save in line with the account's.
 *
 * Sign-in is required, so the account is authoritative: whatever is on the
 * server replaces what is on the device. The one exception is a brand new
 * account with nothing stored yet, where the local save is uploaded instead of
 * being thrown away - that is what carries a pre-account collection in.
 */
export async function syncOnLogin(userId) {
  const remote = await fetchSave(userId);
  if (remote?.data && parseSave(JSON.stringify(remote.data))) {
    const ok = importSave(JSON.stringify(remote.data));
    return ok ? 'pulled' : 'kept';
  }
  await pushSave(userId);
  return 'pushed';
}

/* --- what this database actually has ---------------------------------------
 *
 * The social release (chat, trades, gifts, presence, avatars) added columns
 * to `profiles` and three new tables. A project running the older schema is
 * a normal state - the owner has not re-run schema.sql yet - and it must NOT
 * take the friends list down with it.
 *
 * So the shape of the database is DETECTED rather than assumed: the first
 * query asks for the new columns, and if the server says they are not there,
 * it is remembered and every later query asks only for what exists. Friends,
 * search and requests keep working; the newer features report themselves as
 * unavailable instead of failing at random.
 */

/** null = not probed yet, true = present, false = this project is pre-social. */
let socialColumns = null;
let socialTables = null;

/** What the app may offer right now. */
export const socialSchemaReady = () => socialColumns !== false;
export const socialTablesReady = () => socialTables !== false;

/**
 * Forget what we learned about the database's shape.
 *
 * The owner very often runs schema.sql with the app still installed and
 * open, so coming back to the foreground re-probes rather than staying in
 * degraded mode until the next restart.
 */
export function forgetSchemaProbe() {
  socialColumns = null;
  socialTables = null;
}

/** The marker a v2-only write throws when the tables are not installed. */
export const SCHEMA_OUTDATED = 'WIKLODO_SCHEMA_OUTDATED';

/**
 * Is this failure "that column/table isn't there", rather than a real error?
 * Postgres answers 42703 for an unknown column and 42P01 for an unknown
 * table; PostgREST answers PGRST204/PGRST205 out of its schema cache.
 */
function isSchemaGap(error) {
  const code = String(error?.code ?? '');
  if (['42703', '42P01', 'PGRST204', 'PGRST205'].includes(code)) return true;
  const raw = String(error?.message ?? '').toLowerCase();
  return raw.includes('does not exist')
    || raw.includes('schema cache')
    || raw.includes('could not find');
}

/** The v2 columns on `profiles`, asked for only where they exist. */
const SOCIAL_COLS = 'avatar, presence, last_seen_at, visibility';

/**
 * Run a profiles read that WANTS the social columns. `build` is handed the
 * column list to use; on a pre-social project it is called again with the
 * base list alone.
 */
async function readProfiles(baseCols, build) {
  if (socialColumns !== false) {
    const { data, error } = await build(`${baseCols}, ${SOCIAL_COLS}`);
    if (!error) {
      socialColumns = true;
      return data ?? [];
    }
    if (!isSchemaGap(error)) throw error;
    socialColumns = false;
  }
  const { data, error } = await build(baseCols);
  if (error) throw error;
  return data ?? [];
}

/**
 * Run a read against one of the v2 tables. A missing table is not an error
 * here - it is an answer: this project has nothing to report yet.
 */
async function readSocialTable(run, empty) {
  if (socialTables === false) return empty;
  try {
    const value = await run();
    socialTables = true;
    return value;
  } catch (error) {
    if (!isSchemaGap(error)) throw error;
    socialTables = false;
    return empty;
  }
}

/** Run a v2 WRITE. Unlike a read, this has to be reported: the player asked
 *  for something the database cannot do yet. */
async function writeSocial(run) {
  try {
    const value = await run();
    socialTables = true;
    return value;
  } catch (error) {
    if (isSchemaGap(error)) {
      socialTables = false;
      throw new Error(SCHEMA_OUTDATED);
    }
    throw error;
  }
}

/* --- friends ------------------------------------------------------------------------- */

/** Prefix search, excluding yourself. */
export async function searchPlayers(term, selfId) {
  const q = term.trim();
  if (q.length < 2) return [];
  return readProfiles('id, username, level, rank, cards', (cols) => supabase
    .from('profiles')
    .select(cols)
    .ilike('username', `${q}%`)
    .neq('id', selfId)
    .limit(20));
}

/**
 * Everyone you are connected to, in one read, split by what the connection is:
 * an accepted friend, a request you sent, or a request waiting on you.
 */
export async function listFriendships(selfId) {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester, addressee, status, created_at')
    .or(`requester.eq.${selfId},addressee.eq.${selfId}`);
  if (error) throw error;

  const rows = data ?? [];
  const otherIds = [...new Set(rows.map((r) => (r.requester === selfId ? r.addressee : r.requester)))];
  const profiles = new Map();
  if (otherIds.length) {
    const people = await readProfiles(
      'id, username, level, rank, cards, unique_cards, boosters_opened,'
      + ' collection_value, best_rarity, play_ms, created_at',
      (cols) => supabase.from('profiles').select(cols).in('id', otherIds));
    for (const person of people) profiles.set(person.id, person);
  }

  const friends = [];
  const outgoing = [];
  const incoming = [];
  for (const row of rows) {
    const otherId = row.requester === selfId ? row.addressee : row.requester;
    const entry = { ...row, profile: profiles.get(otherId) ?? null, otherId };
    if (!entry.profile) continue;               // profile deleted; skip the row
    if (row.status === 'accepted') friends.push(entry);
    else if (row.requester === selfId) outgoing.push(entry);
    else incoming.push(entry);
  }
  const byName = (a, b) => a.profile.username.localeCompare(b.profile.username);
  return { friends: friends.sort(byName), outgoing: outgoing.sort(byName), incoming: incoming.sort(byName) };
}

export async function sendRequest(selfId, otherId) {
  const { error } = await supabase.from('friendships')
    .insert({ requester: selfId, addressee: otherId, status: 'pending' });
  if (error) throw error;
}

export async function acceptRequest(id) {
  const { error } = await supabase.from('friendships')
    .update({ status: 'accepted' }).eq('id', id);
  if (error) throw error;
}

export async function removeFriendship(id) {
  const { error } = await supabase.from('friendships').delete().eq('id', id);
  if (error) throw error;
}

/**
 * A friend's cards, or null when you are not allowed to see them.
 *
 * Nobody can read anyone else's save row; friend_cards() hands back the one
 * key holding the collection and nothing else in the blob, and does the
 * friendship check itself. It answers "allowed" separately from "cards" so an
 * empty collection does not read as a refusal.
 */
export async function friendCollection(userId) {
  const { data, error } = await supabase.rpc('friend_cards', { target: userId });
  if (error) throw error;
  if (!data?.allowed) return null;
  if (!data.cards) return [];
  try {
    const cards = JSON.parse(data.cards);
    return cards?.entries ? Object.values(cards.entries) : [];
  } catch {
    return [];
  }
}

/* --- identity and presence -------------------------------------------------- */

/** Whether this row carries presence at all (a pre-social project's does not). */
export const hasPresence = (profile) => Boolean(profile) && 'presence' in profile;

/**
 * Whether a friend counts as online right now. Returns null when the
 * database cannot say - which is not the same as "offline", and the UI shows
 * nothing rather than claiming everyone is away.
 */
export function isOnline(profile) {
  if (!hasPresence(profile)) return null;
  if (profile.presence !== 'online') return false;
  const seen = Date.parse(profile.last_seen_at ?? 0);
  return Number.isFinite(seen) && Date.now() - seen < 2 * 60 * 1000;
}

/**
 * Change username. The unique index is the real gate; the availability call
 * exists to say "taken" nicely. Returns the updated profile, or null when the
 * name is already held.
 */
export async function changeUsername(userId, username) {
  const name = String(username ?? '').trim();
  if (!USERNAME_RE.test(name)) throw new Error('username invalid');
  const { data: free, error: checkError } = await supabase.rpc('username_available', { name });
  if (checkError) throw checkError;
  if (!free) return null;
  const { data, error } = await supabase
    .from('profiles').update({ username: name }).eq('id', userId).select().single();
  if (error) {
    if (String(error.message ?? '').toLowerCase().includes('duplicate key')) return null;
    throw error;
  }
  return data;
}

/** Visibility, presence switch, avatar - the player's own row only. */
export async function updateProfileFields(userId, fields) {
  return writeSocial(async () => {
    const { error } = await supabase.from('profiles').update(fields).eq('id', userId);
    if (error) throw error;
  });
}

/** A cheap "I am here": refreshes last_seen_at. Fired on resume and on a slow
 *  interval; failures are the caller's to ignore. */
export async function heartbeat(userId) {
  if (socialColumns === false) return;         // nothing to write to
  const { error } = await supabase.from('profiles')
    .update({ last_seen_at: new Date().toISOString() }).eq('id', userId);
  if (error) {
    if (isSchemaGap(error)) { socialColumns = false; return; }
    throw error;
  }
}

/* --- chat -------------------------------------------------------------------- */

export async function listMessages(selfId, otherId, { limit = 60 } = {}) {
  return readSocialTable(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender, recipient, body, created_at, read_at')
      .or(`and(sender.eq.${selfId},recipient.eq.${otherId}),and(sender.eq.${otherId},recipient.eq.${selfId})`)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).reverse();
  }, []);
}

export async function sendChatMessage(selfId, otherId, body) {
  const text = String(body ?? '').trim().slice(0, 500);
  if (!text) return null;
  return writeSocial(async () => {
    const { data, error } = await supabase.from('messages')
      .insert({ sender: selfId, recipient: otherId, body: text }).select().single();
    if (error) throw error;
    return data;
  });
}

/** Mark everything the other person sent me as read. */
export async function markConversationRead(selfId, otherId) {
  return readSocialTable(async () => {
    const { error } = await supabase.from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient', selfId).eq('sender', otherId).is('read_at', null);
    if (error) throw error;
  }, undefined);
}

/** Unread message count per sender, for badges. */
export async function unreadBySender(selfId) {
  return readSocialTable(async () => {
    const { data, error } = await supabase
      .from('messages').select('sender')
      .eq('recipient', selfId).is('read_at', null);
    if (error) throw error;
    const counts = new Map();
    for (const row of data ?? []) counts.set(row.sender, (counts.get(row.sender) ?? 0) + 1);
    return counts;
  }, new Map());
}

/* --- deliveries (gifts, and the goods side of trades) ------------------------ */

export async function sendDelivery(selfId, otherId, kind, payload, note = null) {
  return writeSocial(async () => {
    const { error } = await supabase.from('deliveries')
      .insert({ sender: selfId, recipient: otherId, kind, payload, note });
    if (error) throw error;
  });
}

/** Everything waiting for me, oldest first. */
export async function pendingDeliveries(selfId) {
  return readSocialTable(async () => {
    const { data, error } = await supabase
      .from('deliveries')
      .select('id, sender, kind, payload, note, created_at')
      .eq('recipient', selfId).is('claimed_at', null)
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  }, []);
}

export async function claimDelivery(id) {
  return writeSocial(async () => {
    const { error } = await supabase.from('deliveries')
      .update({ claimed_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  });
}

/* --- trades ------------------------------------------------------------------- */

export async function proposeTrade(selfId, otherId, offer, ask) {
  return writeSocial(async () => {
    const { data, error } = await supabase.from('trades')
      .insert({ proposer: selfId, recipient: otherId, offer, ask }).select().single();
    if (error) throw error;
    return data;
  });
}

/** Trades I am part of that still need something from somebody. */
export async function openTrades(selfId) {
  return readSocialTable(async () => {
    const { data, error } = await supabase
      .from('trades')
      .select('id, proposer, recipient, offer, ask, status, created_at, resolved_at')
      .or(`proposer.eq.${selfId},recipient.eq.${selfId}`)
      .neq('status', 'closed')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    return data ?? [];
  }, []);
}

export async function setTradeStatus(id, status) {
  return writeSocial(async () => {
    const patch = { status };
    if (status !== 'pending') patch.resolved_at = new Date().toISOString();
    const { error } = await supabase.from('trades').update(patch).eq('id', id);
    if (error) throw error;
  });
}

/* --- the market (V3: auctions) ------------------------------------------------
 * Every rule that matters is enforced by the definer functions in
 * supabase/schema.sql; the calls here just carry the request. A project
 * that has not run the V3 schema yet answers with a missing-table error,
 * which `marketReady` turns into one honest flag for the UI.
 */

let marketTables = null;              // null unknown, then true/false
export const marketSchemaReady = () => marketTables !== false;

async function marketCall(run) {
  try {
    const value = await run();
    marketTables = true;
    return value;
  } catch (error) {
    if (isSchemaGap(error)) { marketTables = false; throw new Error('MARKET_UNSET'); }
    throw error;
  }
}

/** Open auctions, ending soonest first, plus my own recent ones. */
export async function listAuctions(selfId) {
  return marketCall(async () => {
    const { data, error } = await supabase
      .from('auctions')
      .select('*')
      .or(`status.eq.open,seller.eq.${selfId},bidder.eq.${selfId}`)
      .order('ends_at', { ascending: true })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  });
}

export async function createAuction(card, price, minutes) {
  return marketCall(async () => {
    const { data, error } = await supabase.rpc('create_auction',
      { card, price, minutes });
    if (error) throw error;
    return data;
  });
}

export async function placeBid(auctionId, amount) {
  return marketCall(async () => {
    const { data, error } = await supabase.rpc('place_bid',
      { auction: auctionId, amount });
    if (error) throw error;
    return data;
  });
}

export async function cancelAuction(auctionId) {
  return marketCall(async () => {
    const { data, error } = await supabase.rpc('cancel_auction', { auction: auctionId });
    if (error) throw error;
    return data;
  });
}

export async function settleAuction(auctionId) {
  return marketCall(async () => {
    const { data, error } = await supabase.rpc('settle_auction', { auction: auctionId });
    if (error) throw error;
    return data;
  });
}

/**
 * Live changes to the auctions table, when the project has Realtime on.
 * Returns an unsubscribe. The market screen still polls at a slow beat, so
 * a project without Realtime only loses immediacy, never correctness.
 */
export function subscribeAuctions(onChange) {
  if (!configured) return () => {};
  try {
    const channel = supabase
      .channel('market')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auctions' },
        (payload) => onChange(payload?.new ?? null))
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch { /* gone */ } };
  } catch {
    return () => {};
  }
}

/* --- the card index and wishlists (V4) ---------------------------------------- */

let indexTables = null;
export const indexSchemaReady = () => indexTables !== false;

async function indexCall(run) {
  try {
    const value = await run();
    indexTables = true;
    return value;
  } catch (error) {
    if (isSchemaGap(error)) { indexTables = false; throw new Error('INDEX_UNSET'); }
    throw error;
  }
}

/** Write freshly pulled cards into the shared codex. Duplicates are the
 *  normal case and are dropped by the server, not reported. */
export async function codexAdd(selfId, cards) {
  if (!cards.length) return;
  return indexCall(async () => {
    const rows = cards.map((card) => ({
      key: card.key, title: card.title, rarity: card.rarityId ?? null,
      price: card.price ?? null, views: card.views ?? null,
      thumbnail: card.thumbnail ?? null, lang: card.lang ?? null,
      found_by: selfId
    }));
    const { error } = await supabase.from('codex')
      .upsert(rows, { onConflict: 'key', ignoreDuplicates: true });
    if (error) throw error;
  });
}

export async function codexCounts() {
  return indexCall(async () => {
    const { data, error } = await supabase.rpc('codex_counts');
    if (error) throw error;
    const counts = data ?? { total: 0, byRarity: {} };
    // Rows written under a tier's old name count for the tier they are now.
    const byRarity = {};
    for (const [id, n] of Object.entries(counts.byRarity ?? {})) {
      const fresh = normalizeRarityId(id);
      byRarity[fresh] = (byRarity[fresh] ?? 0) + Number(n);
    }
    return { ...counts, byRarity };
  });
}

/** One page of the codex. `sort` is one of recent | name | value. */
export async function codexPage({ search = '', rarity = null, sort = 'recent', offset = 0, limit = 40 } = {}) {
  return indexCall(async () => {
    let query = supabase.from('codex')
      .select('key, title, rarity, price, views, thumbnail, lang, found_at');
    if (rarity) query = query.in('rarity', rarityIdAliases(rarity));
    if (search.trim()) query = query.ilike('title', `%${search.trim().replace(/[%_]/g, '')}%`);
    if (sort === 'name') query = query.order('title', { ascending: true });
    else if (sort === 'value') query = query.order('price', { ascending: false, nullsFirst: false });
    else query = query.order('found_at', { ascending: false });
    const { data, error } = await query.range(offset, offset + limit - 1);
    if (error) throw error;
    return data ?? [];
  });
}

export async function wishlistMine(selfId) {
  return indexCall(async () => {
    const { data, error } = await supabase.from('wishlists')
      .select('key, card, created_at').eq('owner', selfId)
      .order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    return data ?? [];
  });
}

export async function wishlistSet(selfId, card, on) {
  return indexCall(async () => {
    if (on) {
      const { error } = await supabase.from('wishlists')
        .upsert({ owner: selfId, key: card.key, card }, { onConflict: 'owner,key' });
      if (error) throw error;
    } else {
      const { error } = await supabase.from('wishlists')
        .delete().eq('owner', selfId).eq('key', card.key);
      if (error) throw error;
    }
  });
}

/** A friend's whole wishlist, newest wishes first. */
export async function wishlistOf(ownerId) {
  return indexCall(async () => {
    const { data, error } = await supabase.from('wishlists')
      .select('key, card, created_at').eq('owner', ownerId)
      .order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    return data ?? [];
  });
}

/** Which cards the whole table wants: key -> [names], across my friends. */
export async function friendsWishes(friendIds, nameOf) {
  if (!friendIds.length) return new Map();
  return indexCall(async () => {
    const { data, error } = await supabase.from('wishlists')
      .select('owner, key').in('owner', friendIds).limit(1000);
    if (error) throw error;
    const wishes = new Map();
    for (const row of data ?? []) {
      const name = nameOf(row.owner);
      if (!name) continue;
      if (!wishes.has(row.key)) wishes.set(row.key, []);
      wishes.get(row.key).push(name);
    }
    return wishes;
  });
}
