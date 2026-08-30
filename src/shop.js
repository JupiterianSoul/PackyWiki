/**
 * The shop.
 *
 * Stock is generated from the current two-hour window index, so it is stable
 * across reloads and restocks on its own without any server. Rows are shelves
 * of boosters: some grouped by tier, some by subject, some just cheap.
 *
 * Availability is the other half of the economy. Pricing already guarantees
 * that selling a booster's contents returns less than it cost (see
 * economy.js), but that alone would let a lucky player buy Artifact boosters
 * back to back forever. High tiers are therefore also *rare on the shelves* —
 * an Artifact booster shows up in roughly one window in twelve.
 */
import { THEME_PACKS } from './data/packs.js';
import { RARITIES, rarityRank } from './data/rarities.js';
import { CARD_COUNT_RANGE, windowIndexAt, boosterPrice, FREE_SLOTS, FREE_CARDS } from './economy.js';
import { specId } from './booster.js';
import { t, tx } from './i18n.js';

/** Deterministic PRNG — same window, same shop, on every device and reload. */
function seeded(seed) {
  let a = (seed >>> 0) + 0x6d2b79f5;
  return () => {
    a = Math.imul(a ^ (a >>> 15), a | 1);
    a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const between = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

/**
 * How often each tier is offered at all. This is the main brake on the top of
 * the game: an Artifact booster you cannot buy is one you cannot farm.
 */
const TIER_STOCK_WEIGHT = {
  common: 0, uncommon: 26, rare: 20, epic: 12,
  legendary: 6, mythic: 3.4, exotic: 1.8, artifact: 0.8
};

function weightedTier(rng, { max = 'artifact' } = {}) {
  const ceiling = rarityRank(max);
  const pool = RARITIES.filter((r) => TIER_STOCK_WEIGHT[r.id] > 0 && rarityRank(r.id) <= ceiling);
  const total = pool.reduce((sum, r) => sum + TIER_STOCK_WEIGHT[r.id], 0);
  let ticket = rng() * total;
  for (const rarity of pool) {
    ticket -= TIER_STOCK_WEIGHT[rarity.id];
    if (ticket <= 0) return rarity.id;
  }
  return pool[0].id;
}

const cardCount = (rng) => between(rng, CARD_COUNT_RANGE[0], CARD_COUNT_RANGE[1]);

/* --- shelves -------------------------------------------------------------- */

function rarityShelf(rng, customPacks) {
  const rarityId = weightedTier(rng);
  const rarity = RARITIES.find((r) => r.id === rarityId);
  const specs = [];
  const count = between(rng, 3, 5);

  for (let i = 0; i < count; i++) {
    // Mostly subject-tied (which costs more), occasionally a pure tier booster.
    const pure = rng() < 0.3;
    specs.push(pure
      ? { kind: 'open', themeId: null, rarityId, cards: cardCount(rng) }
      : { kind: 'theme', themeId: pick(rng, THEME_PACKS).id, rarityId, cards: cardCount(rng) });
  }
  // A custom booster can turn up on any shelf.
  if (customPacks.length && rng() < 0.25) {
    specs.push({ ...customSpec(rng, customPacks), rarityId });
  }
  return { id: `rarity-${rarityId}`, title: t('shopRarityRow', { rarity: tx(rarity.name) }), specs };
}

function themeShelf(rng, customPacks) {
  const theme = pick(rng, THEME_PACKS);
  const specs = [];
  const count = between(rng, 3, 5);
  for (let i = 0; i < count; i++) {
    // Most of a subject shelf is plain stock; a minority is upgraded.
    const rarityId = rng() < 0.35 ? weightedTier(rng, { max: 'legendary' }) : null;
    specs.push({ kind: 'theme', themeId: theme.id, rarityId, cards: cardCount(rng) });
  }
  if (customPacks.length && rng() < 0.15) specs.push(customSpec(rng, customPacks));
  return { id: `theme-${theme.id}`, title: t('shopThemeRow', { theme: tx(theme.name) }), specs };
}

function mixedShelf(rng, customPacks) {
  const specs = [];
  const count = between(rng, 4, 6);
  for (let i = 0; i < count; i++) {
    const roll = rng();
    if (roll < 0.2) specs.push({ kind: 'open', themeId: null, rarityId: null, cards: cardCount(rng) });
    else if (roll < 0.75) specs.push({ kind: 'theme', themeId: pick(rng, THEME_PACKS).id, rarityId: null, cards: cardCount(rng) });
    else specs.push({ kind: 'theme', themeId: pick(rng, THEME_PACKS).id, rarityId: weightedTier(rng, { max: 'epic' }), cards: cardCount(rng) });
  }
  if (customPacks.length && rng() < 0.4) specs.push(customSpec(rng, customPacks));
  return { id: 'mixed', title: t('shopMixedRow'), specs };
}

function valueShelf(rng) {
  const specs = [];
  for (let i = 0; i < between(rng, 3, 5); i++) {
    specs.push({
      kind: rng() < 0.35 ? 'open' : 'theme',
      themeId: rng() < 0.35 ? null : pick(rng, THEME_PACKS).id,
      rarityId: null,
      cards: between(rng, CARD_COUNT_RANGE[0], 4)
    });
  }
  return { id: 'value', title: t('shopValueRow'), specs };
}

function customSpec(rng, customPacks) {
  const pack = pick(rng, customPacks);
  return {
    kind: 'custom',
    themeId: null,
    rarityId: null,
    cards: cardCount(rng),
    wiki: pack.wiki,
    customName: pack.name,
    customTagline: pack.tagline,
    customId: pack.id,
    icon: pack.icon,
    accent: pack.accent,
    accent2: pack.accent2,
    art: pack.art ?? null
  };
}

/* --- more shelves --------------------------------------------------------- */

/** Only the biggest boosters. Expensive, but the best cards-per-tear ratio. */
function jumboShelf(rng) {
  const specs = [];
  for (let i = 0; i < between(rng, 3, 4); i++) {
    specs.push({
      kind: 'theme',
      themeId: pick(rng, THEME_PACKS).id,
      rarityId: rng() < 0.45 ? weightedTier(rng, { max: 'mythic' }) : null,
      cards: between(rng, 6, CARD_COUNT_RANGE[1])
    });
  }
  return { id: 'jumbo', title: t('shopJumboRow'), specs };
}

/** Two subjects, side by side, so the row reads as a matchup. */
function duoShelf(rng) {
  const a = pick(rng, THEME_PACKS);
  const b = pick(rng, THEME_PACKS.filter((theme) => theme.id !== a.id));
  const specs = [a, b, a, b].map((theme, i) => ({
    kind: 'theme',
    themeId: theme.id,
    rarityId: i < 2 ? null : weightedTier(rng, { max: 'legendary' }),
    cards: cardCount(rng)
  }));
  return { id: `duo-${a.id}-${b.id}`, title: t('shopDuoRow', { a: tx(a.name), b: tx(b.name) }), specs };
}

/** One subject, climbing the tiers, so you can see what the ladder costs. */
function ladderShelf(rng) {
  const theme = pick(rng, THEME_PACKS);
  const cards = cardCount(rng);
  const top = rarityRank(weightedTier(rng, { max: 'exotic' }));
  const specs = [{ kind: 'theme', themeId: theme.id, rarityId: null, cards }];
  for (let rank = 1; rank <= top; rank++) {
    specs.push({ kind: 'theme', themeId: theme.id, rarityId: RARITIES[rank].id, cards });
  }
  return { id: `ladder-${theme.id}`, title: t('shopLadderRow', { theme: tx(theme.name) }), specs };
}

/** No subject at all: the whole of Wikipedia, at every size. */
function wildShelf(rng) {
  const specs = [];
  for (let i = 0; i < between(rng, 3, 5); i++) {
    specs.push({
      kind: 'open', themeId: null,
      rarityId: rng() < 0.4 ? weightedTier(rng, { max: 'legendary' }) : null,
      cards: cardCount(rng)
    });
  }
  return { id: 'wild', title: t('shopWildRow'), specs };
}

/** Everything in the row is the same size, at a slight discount for buying blind. */
function bundleShelf(rng) {
  const cards = between(rng, 4, 6);
  const specs = [];
  for (let i = 0; i < between(rng, 4, 5); i++) {
    specs.push({ kind: 'theme', themeId: pick(rng, THEME_PACKS).id, rarityId: null, cards });
  }
  return { id: `bundle-${cards}`, title: t('shopBundleRow', { n: cards }), specs };
}

/**
 * Everything the player has built. Custom boosters were free once, which was
 * an obvious hole — build a pack, open it, sell the cards, repeat. They are
 * bought here like anything else now, and this shelf guarantees a pack you
 * just made is immediately available rather than waiting on a lucky roll.
 */
function customShelf(rng, customPacks) {
  if (!customPacks.length) return null;
  const specs = customPacks.slice(0, 8).map((pack, i) => ({
    ...customSpec(rng, [pack]),
    cards: i === 0 ? 5 : cardCount(rng)
  }));
  return { id: 'custom-built', title: t('shopCustomRow'), specs, pinned: true };
}

/**
 * The free shelf, which is always here. Small boosters, no tier most of the
 * time, one per window each. This is the anti-lockout guarantee: whatever
 * happens to your wallet, there is always something to open.
 */
function freeShelf(rng) {
  const specs = [];
  for (let i = 0; i < FREE_SLOTS; i++) {
    specs.push({
      kind: 'theme',
      themeId: pick(rng, THEME_PACKS).id,
      // A tenth of the time the free pack is a low-tier upgrade, which is the
      // whole reason to come back and look at it.
      rarityId: rng() < 0.1 ? RARITIES[1].id : null,
      cards: FREE_CARDS,
      free: true
    });
  }
  return { id: 'free', title: t('shopFreeRow'), specs, free: true, pinned: true };
}

/* --- assembly ------------------------------------------------------------- */

/**
 * The shelves for a window. Rows are deduped by spec so the same booster never
 * appears twice, and each entry carries its price so the UI doesn't recompute.
 */
const ROTATING = [
  rarityShelf, themeShelf, mixedShelf, valueShelf,
  jumboShelf, duoShelf, ladderShelf, wildShelf, bundleShelf
];

export function generateShop(windowIndex = windowIndexAt(), customPacks = []) {
  const rng = seeded(windowIndex);

  // The free shelf and the player's own custom boosters are always here; the
  // rest of the shop is a rotating draw from the pool, so no two windows look
  // quite alike.
  const pool = [...ROTATING];
  const rotating = [];
  const wanted = between(rng, 5, 7);
  while (rotating.length < wanted && pool.length) {
    rotating.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  // A rarity shelf always earns its place: it is where the top of the game is.
  if (!rotating.includes(rarityShelf)) rotating.unshift(rarityShelf);

  const builders = [freeShelf, customShelf, ...rotating];
  const seen = new Set();
  const rows = [];

  for (const build of builders) {
    const row = build(rng, customPacks);
    if (!row) continue;
    const specs = [];
    for (const spec of row.specs) {
      // Enforce the card-count range even if a builder drifts.
      spec.cards = Math.min(CARD_COUNT_RANGE[1], Math.max(CARD_COUNT_RANGE[0], spec.cards));
      const id = specId(spec);
      if (seen.has(id)) continue;
      seen.add(id);
      specs.push({ id, spec, price: row.free ? 0 : boosterPrice(spec) });
    }
    if (specs.length) rows.push({ ...row, specs });
  }
  return rows;
}

/** "1h 24m" — how long until the shelves change. */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}
