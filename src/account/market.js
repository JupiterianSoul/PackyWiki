/* market: split out of account.js */

import { configured, supabase } from './client.js';
import { isSchemaGap } from './schema.js';

/* --- the market (V3: auctions) ------------------------------------------------
 * Every rule that matters is enforced by the definer functions in
 * supabase/schema.sql; the calls here just carry the request. A project
 * that has not run the V3 schema yet answers with a missing-table error,
 * which `marketReady` turns into one honest flag for the UI.
 */

export let marketTables = null;
              // null unknown, then true/false

export function marketSchemaReady() {
  return (marketTables !== false);
}

export async function marketCall(run) {
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
/**
 * The live wire between two people in a conversation: "I am typing", "I just
 * sent one", "I have read yours". It is a Realtime broadcast channel, so it
 * needs no table and no policy, and nothing here is ever stored: a project
 * without Realtime loses the typing dots and the instant refresh, and the
 * ten-second poll still carries every message and every receipt.
 */

export function openChatChannel(selfId, otherId, onEvent) {
  if (!configured) return { send() {}, close() {} };
  const name = `chat:${[selfId, otherId].sort().join(':')}`;
  let channel = null;
  let ready = false;
  try {
    channel = supabase.channel(name, { config: { broadcast: { self: false } } });
    channel
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        if (payload?.from && payload.from !== selfId) onEvent?.(payload);
      })
      .subscribe((status) => { ready = status === 'SUBSCRIBED'; });
  } catch {
    channel = null;
  }
  return {
    send(kind, extra = {}) {
      if (!channel || !ready) return;
      try {
        channel.send({ type: 'broadcast', event: 'chat', payload: { kind, from: selfId, at: Date.now(), ...extra } });
      } catch { /* the poll carries it */ }
    },
    close() {
      if (!channel) return;
      try { supabase.removeChannel(channel); } catch { /* gone */ }
      channel = null;
    }
  };
}
