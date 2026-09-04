/* index: split out of account.js */

import { normalizeRarityId, rarityIdAliases } from '../data/rarities.js';
import { supabase } from './client.js';
import { isSchemaGap } from './schema.js';

/* --- the card index and wishlists (V4) ---------------------------------------- */

export let indexTables = null;

export function indexSchemaReady() {
  return (indexTables !== false);
}

export async function indexCall(run) {
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
