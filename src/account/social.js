/* social: split out of account.js */

import { USERNAME_RE, supabase } from './client.js';
import { live } from './live.js';
import { isSchemaGap, readProfiles, readSocialTable, writeSocial } from './schema.js';

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

export function hasPresence(profile) {
  return (Boolean(profile) && 'presence' in profile);
}
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
  if (live.socialColumns === false) return;         // nothing to write to
  const { error } = await supabase.from('profiles')
    .update({ last_seen_at: new Date().toISOString() }).eq('id', userId);
  if (error) {
    if (isSchemaGap(error)) { live.socialColumns = false; return; }
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
