/**
 * The shop: a small market of fixed stalls rather than a pile of random
 * shelves. Every restock (two hours) re-seeds what each stall carries:
 *
 *   featured  one spotlight booster at a real discount
 *   free      the free shelf, on its own slower four-hour clock
 *   subjects  six subject boosters, plain stock
 *   vault     tier boosters; the higher the tier, the rarer the stall stocks it
 *   customs   every pack the player has built
 *
 * Stock is deterministic per window index, so it is stable across reloads and
 * identical on every device with no server. Pricing comes from economy.js and
 * already guarantees that opening and selling loses money on average; the
 * vault's availability odds are the second brake on the top of the game: an
 * Prismatic booster you cannot buy is one you cannot farm.
 */
import { THEME_PACKS } from './data/packs.js';
import { RARITIES, rarityRank, tierBand, viewsAtPopularity } from './data/rarities.js';
import {
  CARD_COUNT_RANGE, windowIndexAt, boosterPrice, FREE_SLOTS, FREE_CARDS, freeWindowAt
} from './economy.js';
import { specId } from './booster.js';

/** Deterministic PRNG - same window, same shop, on every device and reload. */
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
 * How often each tier is in the vault at all. Uncommon and Rare are always
 * stocked; from Epic up, a window simply may not carry the tier, and the top
 * of the table is on the shelves one window in sixteen.
 */
const VAULT_ODDS = {
  uncommon: 1, rare: 1, epic: 0.7, legendary: 0.45,
  mythic: 0.22, exotic: 0.12, prismatic: 0.06
};

/** A random tier for the featured slot, weighted towards the affordable end. */
const FEATURE_TIER_WEIGHT = { uncommon: 10, rare: 7, epic: 4, legendary: 2, mythic: 1 };
function featureTier(rng) {
  const pool = RARITIES.filter((r) => FEATURE_TIER_WEIGHT[r.id]);
  const total = pool.reduce((sum, r) => sum + FEATURE_TIER_WEIGHT[r.id], 0);
  let ticket = rng() * total;
  for (const rarity of pool) {
    ticket -= FEATURE_TIER_WEIGHT[rarity.id];
    if (ticket <= 0) return rarity.id;
  }
  return pool[0].id;
}

function customSpec(rng, pack) {
  return {
    kind: 'custom',
    themeId: null,
    rarityId: null,
    cards: between(rng, CARD_COUNT_RANGE[0], CARD_COUNT_RANGE[1]),
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

/* --- the market ----------------------------------------------------------- */

export function generateShop(windowIndex = windowIndexAt(), customPacks = [], freeWindow = freeWindowAt()) {
  const rng = seeded(windowIndex);
  const seen = new Set();
  const claim = (spec) => {
    spec.cards = Math.min(CARD_COUNT_RANGE[1], Math.max(CARD_COUNT_RANGE[0], spec.cards));
    const id = specId(spec);
    if (seen.has(id)) return null;
    seen.add(id);
    return id;
  };
  const entry = (spec) => {
    const id = claim(spec);
    return id ? { id, spec, price: boosterPrice(spec) } : null;
  };

  // THE SPOTLIGHT: one booster, a real discount. The discount is safe by
  // construction - even at 25% off, opening and selling still loses money.
  const featSpec = {
    kind: 'theme',
    themeId: pick(rng, THEME_PACKS).id,
    rarityId: rng() < 0.55 ? featureTier(rng) : null,
    cards: between(rng, 5, CARD_COUNT_RANGE[1])
  };
  claim(featSpec);
  const fullPrice = boosterPrice(featSpec);
  const pct = between(rng, 15, 25);
  const featured = {
    id: specId(featSpec),
    spec: featSpec,
    fullPrice,
    pct,
    price: Math.max(5, Math.round((fullPrice * (100 - pct)) / 100 / 5) * 5)
  };

  // THE FREE SHELF: seeded from the FOUR-hour free window rather than the
  // shop's two-hour one, so it sits still through one restock. Using the
  // shop's rng would reshuffle it every restock and quietly halve the
  // cooldown. This is the anti-lockout guarantee: whatever happens to your
  // wallet, there is always something to open.
  const freeRng = seeded(freeWindow * 104729 + 7);
  const free = [];
  for (let i = 0; i < FREE_SLOTS; i++) {
    const spec = {
      kind: 'theme',
      themeId: pick(freeRng, THEME_PACKS).id,
      // A tenth of the time the free pack is an Uncommon upgrade, which is
      // the whole reason to come back and look at it.
      rarityId: freeRng() < 0.1 ? RARITIES[1].id : null,
      cards: FREE_CARDS,
      free: true
    };
    const id = claim(spec);
    if (id) free.push({ id, spec, price: 0 });
  }

  // SUBJECTS: six distinct themes a window, plain stock, honest sizes.
  const themePool = [...THEME_PACKS];
  const subjects = [];
  while (subjects.length < 6 && themePool.length) {
    const theme = themePool.splice(Math.floor(rng() * themePool.length), 1)[0];
    const item = entry({ kind: 'theme', themeId: theme.id, rarityId: null, cards: between(rng, 4, 6) });
    if (item) subjects.push(item);
  }

  // THE VAULT: tier boosters. A tier booster only draws pages famous enough
  // for its tier (see economy.drawCapsFor), and availability thins fast.
  const vault = [];
  for (const rarity of RARITIES) {
    const odds = VAULT_ODDS[rarity.id] ?? 0;
    if (odds <= 0 || rng() >= odds) continue;
    const themed = rng() < 0.5;
    const item = entry({
      kind: themed ? 'theme' : 'open',
      themeId: themed ? pick(rng, THEME_PACKS).id : null,
      rarityId: rarity.id,
      cards: between(rng, 4, 6)
    });
    if (item) {
      vault.push({ ...item, rarity, minViews: viewsAtPopularity(tierBand(rarity.id).min) });
    }
  }
  vault.sort((a, b) => rarityRank(a.rarity.id) - rarityRank(b.rarity.id));

  // YOUR PACKS: everything the player has built, always buyable. Custom
  // boosters were free once, which was an obvious hole - build, open, sell,
  // repeat. They cost like anything else now.
  const customs = [];
  for (const pack of customPacks.slice(0, 8)) {
    const item = entry(customSpec(rng, pack));
    if (item) customs.push(item);
  }

  return { featured, free, subjects, vault, customs };
}

/** "1h 24m" - how long until the shelves change. */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}
