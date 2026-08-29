/**
 * Collection persistence.
 *
 * Everything the player owns lives in localStorage under two keys: the cards
 * themselves and any custom packs they've created (so a resolved wiki survives
 * a reload without probing it again).
 *
 * Duplicates are kept as a copy count rather than as separate entries, and the
 * stored rarity/price is always the BEST pull of that article — pulling
 * Tardigrade a second time as a Legendary upgrades the entry.
 */
import { rarityRank } from './data/rarities.js';
import { bandFor } from './pricing.js';

const CARDS_KEY = 'packywiki.collection.v2';
const PACKS_KEY = 'packywiki.customPacks.v1';

/** Every read and write is guarded: localStorage throws in some privacy modes. */
function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/* --- cards --------------------------------------------------------------- */

export function loadCollection() {
  const data = readJson(CARDS_KEY, null);
  if (!data || typeof data !== 'object' || !data.entries) return { entries: {} };
  return data;
}

export function saveCollection(collection) {
  return writeJson(CARDS_KEY, collection);
}

/**
 * Record a set of pulls. Returns the entries as stored, with `isNew` set for
 * articles the player had never seen before.
 */
export function recordPulls(collection, pulls, pack) {
  const now = Date.now();
  const results = [];

  for (const pull of pulls) {
    const { article, rarity, price } = pull;
    const existing = collection.entries[article.key];

    if (!existing) {
      collection.entries[article.key] = {
        key: article.key,
        title: article.title,
        description: article.description,
        extract: article.extract,
        thumbnail: article.thumbnail,
        url: article.url,
        sourceId: article.sourceId,
        sourceName: article.sourceName,
        views: article.views,
        popularity: article.popularity,
        rarityId: rarity.id,
        price,
        packId: pack.id,
        packName: pack.name,
        packIcon: pack.icon,
        packAccent: pack.accent,
        count: 1,
        favorite: false,
        firstPulledAt: now,
        lastPulledAt: now
      };
      results.push({ entry: collection.entries[article.key], isNew: true });
      continue;
    }

    existing.count += 1;
    existing.lastPulledAt = now;
    // Keep the best version of a duplicate.
    if (rarityRank(rarity.id) > rarityRank(existing.rarityId)) {
      existing.rarityId = rarity.id;
      existing.price = price;
      existing.packId = pack.id;
      existing.packName = pack.name;
      existing.packIcon = pack.icon;
      existing.packAccent = pack.accent;
    }
    results.push({ entry: existing, isNew: false });
  }

  saveCollection(collection);
  return results;
}

export function toggleFavorite(collection, key) {
  const entry = collection.entries[key];
  if (!entry) return false;
  entry.favorite = !entry.favorite;
  saveCollection(collection);
  return entry.favorite;
}

export const allEntries = (collection) => Object.values(collection.entries);

/* --- filtering ----------------------------------------------------------- */

export const SORTS = [
  { id: 'recent',     name: 'Newest first',     compare: (a, b) => b.lastPulledAt - a.lastPulledAt },
  { id: 'price-desc', name: 'Price: high to low', compare: (a, b) => b.price - a.price },
  { id: 'price-asc',  name: 'Price: low to high', compare: (a, b) => a.price - b.price },
  { id: 'rarity',     name: 'Rarity',           compare: (a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId) || b.price - a.price },
  { id: 'popular',    name: 'Most popular',     compare: (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0) },
  { id: 'name',       name: 'A to Z',           compare: (a, b) => a.title.localeCompare(b.title) }
];

export const sortById = (id) => SORTS.find((s) => s.id === id) ?? SORTS[0];

/**
 * Apply the collection filters.
 *
 * filters = { pack, rarity, band, favoritesOnly, minPrice, search, sort }
 * Empty string means "any" for the dropdown filters.
 */
export function filterEntries(entries, filters) {
  const term = (filters.search ?? '').trim().toLowerCase();

  const filtered = entries.filter((entry) => {
    if (filters.favoritesOnly && !entry.favorite) return false;
    if (filters.pack && entry.packId !== filters.pack) return false;
    if (filters.rarity && entry.rarityId !== filters.rarity) return false;
    if (filters.band && bandFor(entry.popularity ?? 0).id !== filters.band) return false;
    if (filters.minPrice && entry.price < Number(filters.minPrice)) return false;
    if (term && !entry.title.toLowerCase().includes(term)) return false;
    return true;
  });

  return filtered.sort(sortById(filters.sort).compare);
}

export const collectionStats = (entries) => ({
  unique: entries.length,
  copies: entries.reduce((sum, e) => sum + e.count, 0),
  value: entries.reduce((sum, e) => sum + e.price * e.count, 0),
  favorites: entries.filter((e) => e.favorite).length
});

/* --- custom packs -------------------------------------------------------- */

export function loadCustomPacks() {
  const packs = readJson(PACKS_KEY, []);
  return Array.isArray(packs) ? packs : [];
}

export function saveCustomPack(pack) {
  const packs = loadCustomPacks().filter((p) => p.id !== pack.id);
  packs.unshift(pack);
  writeJson(PACKS_KEY, packs);
  return packs;
}

export function deleteCustomPack(id) {
  const packs = loadCustomPacks().filter((p) => p.id !== id);
  writeJson(PACKS_KEY, packs);
  return packs;
}
