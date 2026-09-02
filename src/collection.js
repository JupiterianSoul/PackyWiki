/**
 * Everything the player owns, in localStorage.
 *
 *   collection  the cards, keyed by article, with a copy count
 *   wallet      Buckarooz
 *   inventory   unopened boosters, as spec -> count
 *   profile     first-run state and the last stipend paid
 *
 * Duplicates are kept as a copy count rather than separate entries, and the
 * stored rarity is always the BEST pull of that article - pulling Tardigrade
 * again as a Legendary upgrades the entry.
 */
import { rarityRank, normalizeRarityId } from './data/rarities.js';
import { albumKeyOf, customSlug } from './albums.js';
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
 * The storage keys carry the app's own prefix. A device written under an
 * older prefix is carried over once at launch (see migrateLegacyStorage in
 * src/save.js), so nothing here has to know the old names.
 */
const CARDS_KEY = 'wikster.collection.v3';
const WALLET_KEY = 'wikster.wallet.v1';
const INVENTORY_KEY = 'wikster.inventory.v1';
const PROFILE_KEY = 'wikster.profile.v1';
const CUSTOM_KEY = 'wikster.customPacks.v2';
const BINDER_VIEW_KEY = 'wikster.binderView.v1';

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
  // A tier that was renamed is renamed in the save on the way in, so every
  // filter and count downstream only ever meets the current name.
  for (const entry of Object.values(data.entries)) {
    if (entry?.rarityId) entry.rarityId = normalizeRarityId(entry.rarityId);
  }
  return data;
}

export const saveCollection = (collection) => writeJson(CARDS_KEY, collection);

export function recordPulls(collection, pulls, spec) {
  const now = Date.now();
  const results = [];
  const packId = specId(spec);

  pulls.forEach((pull, index) => {
    const { article, rarity, price } = pull;
    const existing = collection.entries[article.key];
    // A millisecond per card keeps the order of the pull in the timestamps,
    // which is the order a special album shows its six in.
    const at = now + index;

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
        firstPulledAt: at,
        lastPulledAt: at,
        // A card from a secret code carries the code for good: it is what
        // locks the card, keeps its tier, and files it in that person's album.
        ...(article.special ? { special: article.special, article: article.article ?? null, creator: Boolean(article.creator) } : {})
      };
      results.push({ entry: collection.entries[article.key], isNew: true });
      return;
    }

    existing.count += 1;
    existing.lastPulledAt = at;
    // Rarity is the article's readership, and this pull knows it. A copy
    // graded earlier while the readership request failed is put right here,
    // whichever way that goes: the tier follows the page, not the first pull.
    if (!existing.special && article.views != null && Number.isFinite(article.popularity)) {
      existing.views = article.views;
      existing.popularity = article.popularity;
      existing.rarityId = rarity.id;
      existing.price = price;
    }
    if (rarityRank(rarity.id) > rarityRank(existing.rarityId)) {
      existing.rarityId = rarity.id;
      existing.price = price;
      existing.packId = packId;
      existing.packName = pull.packName;
      existing.packIcon = pull.packIcon;
      existing.packAccent = pull.packAccent;
      if (article.special) {
        existing.special = article.special;
        existing.article = article.article ?? null;
        existing.creator = Boolean(article.creator);
        existing.title = article.title;
        existing.thumbnail = article.thumbnail;
      }
    }
    results.push({ entry: existing, isNew: false });
  });

  saveCollection(collection);
  return results;
}

/**
 * One-time cleanup: every card must carry a picture now, and draws enforce
 * it - this sweeps out the pictureless cards players already own. Their
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
/**
 * A card from a secret code stays where it landed: it cannot be sold, put
 * up at auction, given or traded. Every one of those doors checks here.
 */
export const isLocked = (entry) => Boolean(entry?.special);

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

/**
 * Repair a special card in place.
 *
 * A card from a secret code is one exact thing, and an older build could
 * write down the wrong one: the Tardigrades card in Terraforming Mars was
 * stored as the animal, because the draw had lost the name of the wiki it
 * was supposed to read. Rather than leave those collections wrong, the card
 * is redrawn from the right source and swapped in underneath the player.
 *
 * Everything earned stays: how many copies, the favourite star, when it was
 * first pulled, the booster it came from, and the code that locks it. Only
 * the identity, the words and the picture change. The key changes with the
 * source, so the old entry is removed and the new one merged onto whatever
 * is already there.
 */
export function replaceSpecialCard(collection, oldEntry, card) {
  if (!card?.key || !oldEntry?.key) return false;
  if (card.key === oldEntry.key
    && card.title === oldEntry.title
    && card.extract === oldEntry.extract
    && card.thumbnail === oldEntry.thumbnail) return false;
  const kept = {
    count: oldEntry.count ?? 1,
    favorite: Boolean(oldEntry.favorite),
    firstPulledAt: oldEntry.firstPulledAt ?? Date.now(),
    lastPulledAt: oldEntry.lastPulledAt ?? Date.now(),
    packId: oldEntry.packId,
    packName: oldEntry.packName,
    packIcon: oldEntry.packIcon,
    packAccent: oldEntry.packAccent,
    // A special card keeps its code, its tier and its price for good.
    special: oldEntry.special,
    creator: Boolean(oldEntry.creator),
    rarityId: oldEntry.rarityId,
    price: oldEntry.price
  };
  delete collection.entries[oldEntry.key];
  const existing = collection.entries[card.key];
  if (existing) {
    existing.count += kept.count;
    existing.favorite = existing.favorite || kept.favorite;
    existing.firstPulledAt = Math.min(existing.firstPulledAt ?? kept.firstPulledAt, kept.firstPulledAt);
  } else {
    collection.entries[card.key] = {
      key: card.key,
      title: card.title,
      description: card.description,
      extract: card.extract,
      thumbnail: card.thumbnail,
      url: card.url,
      lang: card.lang,
      sourceId: card.sourceId,
      sourceName: card.sourceName,
      views: card.views,
      popularity: card.popularity,
      article: card.article ?? null,
      ...kept
    };
  }
  saveCollection(collection);
  return true;
}

/**
 * Swap a card for the same article in another language.
 *
 * The card keeps everything the player earned on it - how many copies, the
 * favourite star, when it was first pulled and which booster it came from -
 * and takes the translated article's identity, text and picture. Merging
 * onto a card they already own in the right language is fine: the copies add
 * up rather than one of them vanishing.
 */
export function replaceEntryWithTranslation(collection, oldEntry, card, lang) {
  if (!card?.key || !oldEntry?.key) return false;
  const kept = {
    count: oldEntry.count ?? 1,
    favorite: Boolean(oldEntry.favorite),
    firstPulledAt: oldEntry.firstPulledAt ?? Date.now(),
    lastPulledAt: oldEntry.lastPulledAt ?? Date.now(),
    packId: oldEntry.packId,
    packName: oldEntry.packName,
    packIcon: oldEntry.packIcon,
    packAccent: oldEntry.packAccent
  };
  delete collection.entries[oldEntry.key];

  const existing = collection.entries[card.key];
  if (existing) {
    existing.count += kept.count;
    existing.favorite = existing.favorite || kept.favorite;
    existing.firstPulledAt = Math.min(existing.firstPulledAt ?? kept.firstPulledAt, kept.firstPulledAt);
  } else {
    collection.entries[card.key] = {
      key: card.key,
      title: card.title,
      description: card.description,
      extract: card.extract,
      thumbnail: card.thumbnail,
      url: card.url,
      lang,
      sourceId: card.sourceId,
      sourceName: card.sourceName,
      views: card.views,
      popularity: card.popularity,
      // The re-grade that follows sets the tier and the price from popularity.
      rarityId: oldEntry.rarityId,
      price: oldEntry.price,
      ...kept
    };
  }
  saveCollection(collection);
  return true;
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
      if (filters.pack && albumKeyOf(entry) !== filters.pack) return false;
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
  const inventory = data && typeof data === 'object' ? data : {};
  // Boosters of a renamed tier are re-filed under the tier's current name;
  // the slot key is derived from the spec, so it moves with it.
  for (const [id, slot] of Object.entries(inventory)) {
    const rarityId = slot?.spec?.rarityId;
    if (!rarityId || rarityId === normalizeRarityId(rarityId)) continue;
    slot.spec.rarityId = normalizeRarityId(rarityId);
    delete inventory[id];
    const fresh = specId(slot.spec);
    inventory[fresh] = inventory[fresh]
      ? { spec: slot.spec, count: inventory[fresh].count + slot.count }
      : slot;
  }
  return inventory;
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

/* --- the open ledger -----------------------------------------------------
 *
 * A booster leaves the inventory the moment the pack tears, and the cards
 * only exist once the draw comes back. Anything that happens in between - a
 * lost connection, a phone that kills the app to free memory, a player who
 * swipes the app away mid-tear - used to take the booster with it. So the
 * open is written down before the booster is spent and crossed off once the
 * cards are safely in the collection; whatever is still written down on the
 * next launch is handed straight back.
 */
const IN_FLIGHT_KEY = 'wikster.openInFlight.v1';

export function markOpenInFlight(spec) {
  try { localStorage.setItem(IN_FLIGHT_KEY, JSON.stringify({ spec, at: Date.now() })); }
  catch { /* storage unavailable */ }
}

export function clearOpenInFlight() {
  try { localStorage.removeItem(IN_FLIGHT_KEY); }
  catch { /* storage unavailable */ }
}

/** The booster an interrupted open still owes the player, once. */
export function reclaimOpenInFlight(inventory) {
  let record = null;
  try { record = JSON.parse(localStorage.getItem(IN_FLIGHT_KEY) ?? 'null'); }
  catch { record = null; }
  clearOpenInFlight();
  if (!record?.spec) return null;
  if (record.spec.rarityId) record.spec.rarityId = normalizeRarityId(record.spec.rarityId);
  addBooster(inventory, record.spec, 1);
  return record.spec;
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
  // Secret codes: id -> how many times this save has redeemed it.
  profile.codesRedeemed ??= {};
  // The top tier was renamed: its pull counts and the redeemed marks of its
  // achievement chain move to the new name so nothing is lost or paid twice.
  for (const [id, n] of Object.entries(profile.rarityCounts)) {
    const fresh = normalizeRarityId(id);
    if (fresh === id) continue;
    profile.rarityCounts[fresh] = (profile.rarityCounts[fresh] ?? 0) + n;
    delete profile.rarityCounts[id];
  }
  profile.achievements.redeemed = profile.achievements.redeemed
    .map((id) => id.replace(/^artifact-/, 'prismatic-'));
  // The achievements rework renamed the very first one; the feat is
  // identical, so its redeemed mark carries over instead of paying twice.
  if (profile.achievements.redeemed.includes('first-pack')
    && !profile.achievements.redeemed.includes('pack-1')) {
    profile.achievements.redeemed.push('pack-1');
  }
  profile.cardsSold ??= 0;
  profile.settings ??= {};
  profile.settings.sound ??= true;
  profile.settings.lowPower ??= false;
  profile.settings.flash ??= true;
  profile.settings.hints ??= true;
  profile.settings.volume ??= 1;
  profile.settings.music ??= true;
  profile.settings.musicVolume ??= 0.4;
  // Added later; a save that predates them takes the default.
  profile.settings.haptics ??= true;
  profile.settings.tilt ??= true;
  profile.settings.awake ??= true;
  profile.settings.prices ??= true;
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
 * Playtime, accumulated in chunks rather than continuously - a timer running
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

/** Which way the collection was last read: as albums, or as one long list. */
/* --- the wishlist, cached --------------------------------------------------
 * The server copy is the truth (it is what friends can see); this cache is
 * what paints instantly on launch and what an offline build falls back to. */
const WISH_KEY = 'wikster.wishlist.v1';
export function loadWishlist() {
  try {
    const raw = JSON.parse(localStorage.getItem(WISH_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((c) => c && typeof c.key === 'string') : [];
  } catch { return []; }
}
export function saveWishlist(cards) {
  try { localStorage.setItem(WISH_KEY, JSON.stringify(cards.slice(0, 200))); } catch { /* storage unavailable */ }
}

/* Auctions already flagged as carrying a wished card, so the bell rings once
 * per auction rather than once per refresh. */
const WISH_SEEN_KEY = 'wikster.wishSeen.v1';
export function loadWishSeen() {
  try {
    const raw = JSON.parse(localStorage.getItem(WISH_SEEN_KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}
export function saveWishSeen(ids) {
  try { localStorage.setItem(WISH_SEEN_KEY, JSON.stringify(ids.slice(-200))); } catch { /* storage unavailable */ }
}

/* --- auctions I have bid on ------------------------------------------------
 * Ids only, so the Mine tab can show fights I am in even after being outbid.
 * Capped: an id is worthless once its auction is gone from the listing. */
const BIDS_KEY = 'wikster.myBids.v1';
export function loadMyBids() {
  try {
    const raw = JSON.parse(localStorage.getItem(BIDS_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((id) => typeof id === 'string').slice(-100) : [];
  } catch { return []; }
}
export function saveMyBids(ids) {
  try { localStorage.setItem(BIDS_KEY, JSON.stringify(ids.slice(-100))); } catch { /* storage unavailable */ }
}

/* --- the badges worn on the profile ---------------------------------------
 * Up to four badge ids, chosen on the Badges screen. Empty means "let the
 * app pick": the best-ranked earned chips fill the shelf by default. */
const LOADOUT_KEY = 'wikster.badgeLoadout.v1';
export function loadBadgeLoadout() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOADOUT_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((id) => typeof id === 'string').slice(0, 4) : [];
  } catch { return []; }
}
export function saveBadgeLoadout(ids) {
  try { localStorage.setItem(LOADOUT_KEY, JSON.stringify(ids.slice(0, 4))); } catch { /* storage unavailable */ }
}

/* --- the equipped level-frame style ---------------------------------------
 * Which of the five frame designs wraps your level and your picture. The
 * frame's tier is never stored: it is always derived from the level. */
const FRAME_KEY = 'wikster.frameStyle.v1';
export function loadFrameStyle() {
  try { return localStorage.getItem(FRAME_KEY) || null; } catch { return null; }
}
export function saveFrameStyle(styleId) {
  try { localStorage.setItem(FRAME_KEY, styleId); } catch { /* storage unavailable */ }
}

export function loadBinderView() {
  try {
    return localStorage.getItem(BINDER_VIEW_KEY) === 'classic' ? 'classic' : 'albums';
  } catch {
    return 'albums';
  }
}

export function saveBinderView(view) {
  try { localStorage.setItem(BINDER_VIEW_KEY, view === 'classic' ? 'classic' : 'albums'); }
  catch { /* storage unavailable */ }
}

export function loadCustomPacks() {
  const packs = readJson(CUSTOM_KEY, []);
  return Array.isArray(packs) ? packs : [];
}

/**
 * One pack per subject, whatever it is called.
 *
 * "Terraria", "terraria" and the French community of the same wiki all
 * collapse onto one slug, so building a pack you already have replaces it
 * instead of stacking a second copy beside it (which is what put two
 * Terraria albums on the shelf).
 */
export function saveCustomPack(pack) {
  const slug = customSlug(packHost(pack) || pack.id);
  const packs = loadCustomPacks().filter((p) => customSlug(packHost(p) || p.id) !== slug);
  packs.unshift(pack);
  writeJson(CUSTOM_KEY, packs);
  return packs;
}

export function deleteCustomPack(id) {
  const slug = customSlug(id);
  const packs = loadCustomPacks().filter((p) => customSlug(packHost(p) || p.id) !== slug);
  writeJson(CUSTOM_KEY, packs);
  return packs;
}

/** The wiki host a stored pack points at, if it still remembers one. */
export function packHost(pack) {
  try {
    const url = new URL(pack?.wiki?.apiUrl ?? '');
    return url.host + url.pathname.replace('/api.php', '');
  } catch {
    return '';
  }
}

/**
 * Rebuild the custom packs a save has lost, and drop the duplicates.
 *
 * A pack that disappears from the Custom tab takes its shop shelf with it,
 * which is how somebody ends up rebuilding a pack they already had and
 * finding two albums for one subject. Owned cards remember the wiki they
 * came from, so anything missing is put back from them, and any pack stored
 * twice under different spellings collapses to one.
 * Returns how many packs were restored.
 */
export function healCustomPacks(collection) {
  const packs = loadCustomPacks();
  const bySlug = new Map();
  for (const pack of packs) {
    const slug = customSlug(packHost(pack) || pack.id);
    if (slug && !bySlug.has(slug)) bySlug.set(slug, pack);
  }
  const before = bySlug.size;

  let restored = 0;
  for (const entry of Object.values(collection.entries ?? {})) {
    const [kind, ident] = String(entry.packId ?? '').split('|');
    if (kind !== 'custom' || !ident) continue;
    const slug = customSlug(ident);
    if (!slug || bySlug.has(slug)) continue;
    const host = ident.replace(/^https?:\/\//, '');
    bySlug.set(slug, {
      id: `custom-${slug}`,
      name: String(entry.packName ?? slug).replace(/\u00b7.*$/, '').trim() || slug,
      tagline: entry.sourceName ?? '',
      icon: 'wand',
      accent: entry.packAccent ?? '#a78bfa',
      accent2: '#4c1d95',
      wiki: { apiUrl: `https://${host}/api.php`, sitename: entry.sourceName ?? entry.packName ?? slug }
    });
    restored++;
  }
  if (restored || bySlug.size !== packs.length || before !== packs.length) {
    writeJson(CUSTOM_KEY, [...bySlug.values()]);
  }
  return restored;
}

/* --- the effect a rarity wears ---------------------------------------------
 * One chosen style per rarity, keyed by rarity id. A rarity missing from here
 * wears the treatment drawn for it, which is what `classic` means, so an empty
 * object is the right starting state and a save that predates the picker needs
 * no migration. */
const FX_KEY = 'wikster.cardFx.v1';

export function loadCardFx() {
  const data = readJson(FX_KEY, null);
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

export const saveCardFx = (choices) => writeJson(FX_KEY, choices ?? {});
