/**
 * The shop: a small market of fixed stalls rather than a pile of random
 * shelves. Every restock (two hours) re-seeds what each stall carries and
 * how many copies of it:
 *
 *   featured  one spotlight booster at a real discount, one copy
 *   free      the free shelf, on its own slower four-hour clock
 *   subjects  six subject boosters, a few copies each
 *   press     tier boosters, sold at a premium for the guarantee, one or two
 *             copies each; the higher the tier, the rarer the press runs it
 *   bundles   two or three bundles of several boosters, one copy each
 *   crate     one price, a roll across everything the game sells, and each
 *             crate bought makes the next one dearer until the restock
 *   customs   every pack the player has built, always in stock
 *
 * Stock is deterministic per window index, so it is stable across reloads and
 * identical on every device with no server; what has been bought is the
 * save's own count (collection.js, shopBought). Pricing comes from
 * economy.js and already guarantees that opening and selling loses money on
 * average; the press premium and the crate's rising price are the second
 * brake on the top of the game.
 */
import { THEME_PACKS } from './data/packs.js';
import { RARITIES, rarityRank } from './data/rarities.js';
import {
  CARD_COUNT_RANGE, windowIndexAt, boosterPrice, pressPrice, bundlePrice, BUNDLE_OFF_RANGE,
  FREE_SLOTS, FREE_CARDS, freeWindowAt
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
/** One entry of a weighted table: [value, weight][]. */
function weighted(rng, table) {
  const total = table.reduce((sum, [, w]) => sum + w, 0);
  let ticket = rng() * total;
  for (const [value, w] of table) { ticket -= w; if (ticket <= 0) return value; }
  return table[table.length - 1][0];
}

/**
 * How often each tier is in the press at all. Uncommon and Rare are always
 * on; from Epic up, a window simply may not run the tier, and the top of the
 * table is on the plates one window in sixteen.
 */
const PRESS_ODDS = {
  uncommon: 1, rare: 1, epic: 0.7, legendary: 0.45,
  mythic: 0.22, exotic: 0.12, prismatic: 0.06
};

/** A random tier for the spotlight and the bundles, weighted towards the affordable end. */
const FEATURE_TIER_WEIGHT = { uncommon: 10, rare: 7, epic: 4, legendary: 2, mythic: 1 };
function featureTier(rng) {
  return weighted(rng, RARITIES.filter((r) => FEATURE_TIER_WEIGHT[r.id]).map((r) => [r.id, FEATURE_TIER_WEIGHT[r.id]]));
}

function customSpec(rng, pack, cards = null) {
  return {
    kind: 'custom',
    themeId: null,
    rarityId: null,
    cards: cards ?? between(rng, CARD_COUNT_RANGE[0], CARD_COUNT_RANGE[1]),
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
  const entry = (spec, stock) => {
    const id = claim(spec);
    return id ? { id, spec, price: boosterPrice(spec), stock } : null;
  };

  // THE SPOTLIGHT: one booster, a real discount, one copy. The discount is
  // safe by construction - even at 25% off, opening and selling still loses
  // money.
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
    price: Math.max(5, Math.round((fullPrice * (100 - pct)) / 100 / 5) * 5),
    stock: 1
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
    if (id) free.push({ id, spec, price: 0, stock: 1 });
  }

  // SUBJECTS: six distinct themes a window, plain stock, honest sizes, a few
  // copies of each.
  const themePool = [...THEME_PACKS];
  const subjects = [];
  while (subjects.length < 6 && themePool.length) {
    const theme = themePool.splice(Math.floor(rng() * themePool.length), 1)[0];
    const item = entry({ kind: 'theme', themeId: theme.id, rarityId: null, cards: between(rng, 4, 6) }, between(rng, 1, 3));
    if (item) subjects.push(item);
  }

  // THE PRESS: tier boosters. A tier booster rolls its prints on a better
  // row and always carries at least one of its tier; the press runs the
  // higher rows more rarely, in runs of one or two, and charges the premium
  // the guarantee is worth (economy.pressPrice).
  const press = [];
  for (const rarity of RARITIES) {
    const odds = PRESS_ODDS[rarity.id] ?? 0;
    if (odds <= 0 || rng() >= odds) continue;
    const themed = rng() < 0.5;
    const spec = {
      kind: themed ? 'theme' : 'open',
      themeId: themed ? pick(rng, THEME_PACKS).id : null,
      rarityId: rarity.id,
      cards: between(rng, 4, 6)
    };
    const id = claim(spec);
    if (!id) continue;
    const stock = rarityRank(rarity.id) >= rarityRank('mythic') ? 1 : between(rng, 1, 2);
    press.push({ id, spec, price: pressPrice(spec), plain: boosterPrice(spec), rarity, stock });
  }
  press.sort((a, b) => rarityRank(a.rarity.id) - rarityRank(b.rarity.id));

  // BUNDLES: two or three a window, each of two to four boosters, one copy.
  // A bundle is either several of one booster or a mix: different subjects,
  // sizes and tiers in one wrap. The discount is safe by construction: even
  // at twenty percent, opening and selling loses money.
  const bundles = [];
  const bundleCount = between(rng, 2, 3);
  let guard = 0;
  while (bundles.length < bundleCount && guard++ < 20) {
    const size = between(rng, 2, 4);
    const mixed = rng() < 0.55;
    const specs = [];
    if (mixed) {
      for (let i = 0; i < size; i++) {
        specs.push({
          kind: 'theme', themeId: pick(rng, THEME_PACKS).id,
          rarityId: rng() < 0.4 ? featureTier(rng) : null,
          cards: between(rng, 3, CARD_COUNT_RANGE[1])
        });
      }
    } else {
      const one = { kind: 'theme', themeId: pick(rng, THEME_PACKS).id, rarityId: rng() < 0.35 ? featureTier(rng) : null, cards: between(rng, 4, 6) };
      for (let i = 0; i < size; i++) specs.push({ ...one });
    }
    const pct = between(rng, BUNDLE_OFF_RANGE[0], BUNDLE_OFF_RANGE[1]);
    const id = `bundle|${windowIndex}|${bundles.length}|${specs.map(specId).join('+')}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const full = specs.reduce((sum, spec) => sum + boosterPrice(spec), 0);
    bundles.push({ id, specs, mixed, pct, full, price: bundlePrice(specs, pct), stock: 1 });
  }

  // YOUR PACKS: everything the player has built, always buyable. Custom
  // boosters were free once, which was an obvious hole - build, open, sell,
  // repeat. They cost like anything else now.
  const customs = [];
  for (const pack of customPacks.slice(0, 8)) {
    const item = entry(customSpec(rng, pack), Infinity);
    if (item) customs.push(item);
  }

  return { featured, free, subjects, press, bundles, customs };
}

/* --- the crate ------------------------------------------------------------ */

/**
 * What a crate can hold, and how likely. Any subject the game sells and any
 * pack the player has built, at any size from three cards up and at any
 * tier or none; the bigger and the rarer, the less likely. The roll is the
 * device's own: the crate was never a server matter, and its price rises
 * with each one bought so it cannot be farmed.
 */
export const CRATE_TIER_WEIGHTS = [
  [null, 46], ['uncommon', 22], ['rare', 14], ['epic', 8.5], ['legendary', 5],
  ['mythic', 2.6], ['exotic', 1.2], ['prismatic', 0.5]
];
export const CRATE_CARD_WEIGHTS = [[3, 34], [4, 30], [5, 20], [6, 11], [7, 5]];

/** One roll of the crate: a booster spec, drawn from everything on sale. */
export function rollCrate(customPacks = [], rng = Math.random) {
  const cards = weighted(rng, CRATE_CARD_WEIGHTS);
  const rarityId = weighted(rng, CRATE_TIER_WEIGHTS);
  const sources = [...THEME_PACKS.map((theme) => ({ theme })), ...customPacks.slice(0, 8).map((pack) => ({ pack }))];
  const source = pick(rng, sources);
  if (source.pack) return { ...customSpec(rng, source.pack, cards), rarityId };
  return { kind: 'theme', themeId: source.theme.id, rarityId, cards };
}

/**
 * The reel the crate rolls through: `length` boosters, the winner at
 * `winnerAt`, every other one a fresh roll so the reel reads as the whole
 * shop going by. Decorative: only the winner is real.
 */
export function crateReel(winner, customPacks = [], { length = 28, winnerAt = 22, rng = Math.random } = {}) {
  const reel = Array.from({ length }, () => rollCrate(customPacks, rng));
  reel[winnerAt] = winner;
  return reel;
}

/** The average price of what a crate holds, for tuning: run in node. */
export function crateExpectedPrice(customPacks = [], samples = 20000, rng = Math.random) {
  let sum = 0;
  for (let i = 0; i < samples; i++) sum += boosterPrice(rollCrate(customPacks, rng));
  return sum / samples;
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
