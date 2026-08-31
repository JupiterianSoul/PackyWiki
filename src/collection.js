/**
 * Everything the player owns, in localStorage.
 *
 *   collection  the cards, keyed by article, with a copy count
 *   wallet      Buckarooz
 *   inventory   unopened boosters, as spec -> count
 *   profile     first-run state and the last stipend paid
 *
 * Duplicates are kept as a copy count rather than separate entries, and the
 * stored rarity is always the BEST pull of that article — pulling Tardigrade
 * again as a Legendary upgrades the entry.
 */
import { rarityRank } from './data/rarities.js';
import { bandFor } from './pricing.js';
import { specId } from './booster.js';
import {
  STARTER_COINS, STIPEND, STIPEND_MAX_BANKED, windowIndexAt, freeWindowAt
} from './economy.js';
import { emptyDaily } from './daily.js';
import { emptyTimed, accrue } from './timed.js';
import { t } from './i18n.js';
import { touch } from './save.js';

/*
 * The storage keys keep the old `packywiki.` prefix after the rename to
 * Wiklodo, on purpose: they are what an existing player's collection, wallet
 * and progress are filed under, and renaming them would silently wipe every
 * save on the next launch.
 */
const CARDS_KEY = 'packywiki.collection.v3';
const WALLET_KEY = 'packywiki.wallet.v1';
const INVENTORY_KEY = 'packywiki.inventory.v1';
const PROFILE_KEY = 'packywiki.profile.v1';
const CUSTOM_KEY = 'packywiki.customPacks.v2';

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
    // Every write to game state passes through here, which makes it the one
    // place cloud sync has to be told about a change.
    touch();
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

export const saveCollection = (collection) => writeJson(CARDS_KEY, collection);

export function recordPulls(collection, pulls, spec) {
  const now = Date.now();
  const results = [];
  const packId = specId(spec);

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
        lang: article.lang,
        sourceId: article.sourceId,
        sourceName: article.sourceName,
        views: article.views,
        popularity: article.popularity,
        rarityId: rarity.id,
        price,
        packId,
        packName: pull.packName,
        packIcon: pull.packIcon,
        packAccent: pull.packAccent,
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
    if (rarityRank(rarity.id) > rarityRank(existing.rarityId)) {
      existing.rarityId = rarity.id;
      existing.price = price;
      existing.packId = packId;
      existing.packName = pull.packName;
      existing.packIcon = pull.packIcon;
      existing.packAccent = pull.packAccent;
    }
    results.push({ entry: existing, isNew: false });
  }

  saveCollection(collection);
  return results;
}

/**
 * One-time cleanup: every card must carry a picture now, and draws enforce
 * it — this sweeps out the pictureless cards players already own. Their
 * copies are simply removed (they were the cards nobody wanted to look at).
 * Returns how many entries were dropped.
 */
export function pruneImagelessCards(collection) {
  const doomed = Object.values(collection.entries ?? {}).filter((e) => !e.thumbnail);
  if (!doomed.length) return 0;
  for (const entry of doomed) delete collection.entries[entry.key];
  saveCollection(collection);
  return doomed.length;
}

export function toggleFavorite(collection, key) {
  const entry = collection.entries[key];
  if (!entry) return false;
  entry.favorite = !entry.favorite;
  saveCollection(collection);
  return entry.favorite;
}

/** Sell one copy. The last copy removes the card from the binder. */
export function sellCopy(collection, key) {
  const entry = collection.entries[key];
  if (!entry) return null;
  entry.count -= 1;
  if (entry.count <= 0) delete collection.entries[key];
  saveCollection(collection);
  return entry;
}

/**
 * Take one copy of a card OUT of the collection (a gift, a trade), returning
 * a single-copy snapshot suitable for handing to another player. Null when
 * the card is not owned.
 */
export function takeCardCopy(collection, key) {
  const entry = collection.entries[key];
  if (!entry) return null;
  const snapshot = { ...entry, count: 1, favorite: false };
  entry.count -= 1;
  if (entry.count <= 0) delete collection.entries[key];
  saveCollection(collection);
  return snapshot;
}

/**
 * Put a received card entry INTO the collection (a gift, a trade, an escrow
 * refund). Merges with an existing entry the same way pulling does: counts
 * add, the better rarity wins.
 */
export function receiveCardEntry(collection, incoming) {
  if (!incoming?.key || !incoming.title) return null;
  const existing = collection.entries[incoming.key];
  if (!existing) {
    collection.entries[incoming.key] = { ...incoming, count: incoming.count ?? 1, favorite: false };
  } else {
    existing.count += incoming.count ?? 1;
    if (rarityRank(incoming.rarityId) > rarityRank(existing.rarityId)) {
      existing.rarityId = incoming.rarityId;
      existing.price = incoming.price ?? existing.price;
    }
    existing.lastPulledAt = Date.now();
  }
  saveCollection(collection);
  return collection.entries[incoming.key];
}

export const allEntries = (collection) => Object.values(collection.entries);

/* --- filtering ----------------------------------------------------------- */

export const SORTS = [
  { id: 'recent', labelKey: 'sortRecent', compare: (a, b) => b.lastPulledAt - a.lastPulledAt },
  { id: 'price-desc', labelKey: 'sortPriceDesc', compare: (a, b) => b.price - a.price },
  { id: 'price-asc', labelKey: 'sortPriceAsc', compare: (a, b) => a.price - b.price },
  { id: 'rarity', labelKey: 'sortRarity', compare: (a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId) || b.price - a.price },
  { id: 'popular', labelKey: 'sortPopular', compare: (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0) },
  { id: 'name', labelKey: 'sortName', compare: (a, b) => a.title.localeCompare(b.title) }
];

export const sortById = (id) => SORTS.find((s) => s.id === id) ?? SORTS[0];
export const sortLabel = (sort) => t(sort.labelKey);

export function filterEntries(entries, filters) {
  const term = (filters.search ?? '').trim().toLowerCase();
  return entries
    .filter((entry) => {
      if (filters.favoritesOnly && !entry.favorite) return false;
      if (filters.pack && entry.packId !== filters.pack) return false;
      if (filters.rarity && entry.rarityId !== filters.rarity) return false;
      if (filters.band && bandFor(entry.popularity ?? 0).id !== filters.band) return false;
      if (filters.minPrice && entry.price < Number(filters.minPrice)) return false;
      if (term && !entry.title.toLowerCase().includes(term)) return false;
      return true;
    })
    .sort(sortById(filters.sort).compare);
}

export const collectionStats = (entries) => ({
  copies: entries.reduce((sum, e) => sum + e.count, 0),
  value: entries.reduce((sum, e) => sum + e.price * e.count, 0),
  favorites: entries.filter((e) => e.favorite).length
});

/* --- wallet -------------------------------------------------------------- */

export function loadWallet() {
  const value = readJson(WALLET_KEY, null);
  return Number.isFinite(value) ? value : 0;
}

export const saveWallet = (amount) => writeJson(WALLET_KEY, Math.max(0, Math.round(amount)));

/* --- inventory ----------------------------------------------------------- */

/** { [specId]: { spec, count } } */
export function loadInventory() {
  const data = readJson(INVENTORY_KEY, null);
  return data && typeof data === 'object' ? data : {};
}

export const saveInventory = (inventory) => writeJson(INVENTORY_KEY, inventory);

export function addBooster(inventory, spec, count = 1) {
  const id = specId(spec);
  const slot = inventory[id] ?? { spec, count: 0 };
  slot.spec = spec;
  slot.count += count;
  inventory[id] = slot;
  saveInventory(inventory);
  return inventory;
}

export function takeBooster(inventory, id) {
  const slot = inventory[id];
  if (!slot || slot.count <= 0) return false;
  slot.count -= 1;
  if (slot.count <= 0) delete inventory[id];
  saveInventory(inventory);
  return true;
}

export const ownedBoosters = (inventory) =>
  Object.values(inventory).filter((slot) => slot.count > 0);

/* --- profile ------------------------------------------------------------- */

/**
 * The profile carries everything that is about the player rather than about
 * the cards: how far along they are, what they have claimed, and how they
 * want the app to behave. Every field is defaulted on read, so a profile
 * written by an older build loads without a migration step.
 */
export function loadProfile() {
  const data = readJson(PROFILE_KEY, null);
  const profile = data && typeof data === 'object' ? data : {};
  profile.started ??= false;
  profile.stipendWindow ??= null;
  profile.createdAt ??= Date.now();
  profile.playMs ??= 0;
  profile.boostersOpened ??= 0;
  profile.rarityCounts ??= {};
  profile.progress ??= { level: 1, xp: 0 };
  profile.progress.level ??= 1;
  profile.progress.xp ??= 0;
  profile.pendingLevels ??= [];
  profile.daily ??= emptyDaily();
  profile.timed ??= emptyTimed();
  profile.freeTaken ??= { window: null, ids: [] };
  profile.achievements ??= { redeemed: [] };
  profile.achievements.redeemed ??= [];
  profile.cardsSold ??= 0;
  profile.settings ??= {};
  profile.settings.sound ??= true;
  profile.settings.lowPower ??= false;
  profile.settings.flash ??= true;
  profile.settings.hints ??= true;
  accrue(profile.timed);
  return profile;
}

export const saveProfile = (profile) => writeJson(PROFILE_KEY, profile);

/**
 * Pay the restock stipend for any windows that have elapsed since the last
 * one, capped so a long absence doesn't hand over a fortune. Returns the
 * amount paid, or 0.
 */
export function claimStipend(profile, wallet) {
  const now = windowIndexAt();
  if (profile.stipendWindow == null) {
    profile.stipendWindow = now;
    saveProfile(profile);
    return 0;
  }
  const missed = Math.min(STIPEND_MAX_BANKED, now - profile.stipendWindow);
  if (missed <= 0) return 0;
  profile.stipendWindow = now;
  saveProfile(profile);
  const paid = missed * STIPEND;
  saveWallet(wallet + paid);
  return paid;
}

export function grantStarter(profile) {
  profile.started = true;
  profile.stipendWindow = windowIndexAt();
  profile.createdAt = Date.now();
  saveProfile(profile);
  saveWallet(STARTER_COINS);
  return STARTER_COINS;
}

/* --- stats --------------------------------------------------------------- */

/** Record what a booster produced. Drives the profile page and the XP award. */
export function recordOpening(profile, pulls) {
  profile.boostersOpened = (profile.boostersOpened ?? 0) + 1;
  for (const pull of pulls) {
    const id = pull.rarity.id;
    profile.rarityCounts[id] = (profile.rarityCounts[id] ?? 0) + 1;
  }
  saveProfile(profile);
}

/**
 * Playtime, accumulated in chunks rather than continuously — a timer running
 * every second just to count seconds is exactly the kind of thing that warms
 * a phone up for nothing.
 */
export function addPlaytime(profile, ms) {
  if (!(ms > 0)) return;
  profile.playMs = (profile.playMs ?? 0) + ms;
  saveProfile(profile);
}

/* --- the free shelf ------------------------------------------------------ */

/*
 * Keyed to the FOUR-hour free window, not the shop's two-hour one. Using the
 * shop window here would hand out a fresh pair of free boosters on every
 * restock and halve the cooldown.
 */
export function freeAvailable(profile, id, freeWindow = freeWindowAt()) {
  if (profile.freeTaken.window !== freeWindow) return true;
  return !profile.freeTaken.ids.includes(id);
}

export function markFreeTaken(profile, id, freeWindow = freeWindowAt()) {
  if (profile.freeTaken.window !== freeWindow) {
    profile.freeTaken = { window: freeWindow, ids: [] };
  }
  if (!profile.freeTaken.ids.includes(id)) profile.freeTaken.ids.push(id);
  saveProfile(profile);
}

/* --- custom boosters ----------------------------------------------------- */

export function loadCustomPacks() {
  const packs = readJson(CUSTOM_KEY, []);
  return Array.isArray(packs) ? packs : [];
}

export function saveCustomPack(pack) {
  const packs = loadCustomPacks().filter((p) => p.id !== pack.id);
  packs.unshift(pack);
  writeJson(CUSTOM_KEY, packs);
  return packs;
}

export function deleteCustomPack(id) {
  const packs = loadCustomPacks().filter((p) => p.id !== id);
  writeJson(CUSTOM_KEY, packs);
  return packs;
}
