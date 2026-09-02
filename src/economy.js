/**
 * The economy.
 *
 * The one rule everything else is built to protect: **you cannot get rich by
 * churning boosters.** Selling a booster's entire contents returns a fixed
 * fraction of what the booster cost, whatever tier it was, so the
 * sell-buy-bigger-sell loop always leaks value instead of compounding. A lucky
 * Prismatic can still pay for several packs - that's the thrill - but it is
 * variance around a losing mean, not a strategy.
 *
 * Concretely:
 *   sell value of a card   = SELL_RATE × its price
 *   price of a booster     = its expected sell value ÷ RETURN_RATE
 *
 * so E[sell everything] = RETURN_RATE × price, for every booster in the game.
 * Progression therefore comes from time (the shop stipend), not from grinding.
 */
import { RARITIES, rarityById } from './data/rarities.js';
import { oddsFor } from './data/odds.js';
import { basePrice, priceFor } from './pricing.js';
import { timedDrawCaps } from './timed.js';

/** A card sells for this fraction of its listed price. */
export const SELL_RATE = 0.3;

/** Selling a whole booster returns this fraction of what it cost. */
export const RETURN_RATE = 0.72;

/**
 * Assumed popularity of a typical draw from an untiered pack, used to price
 * boosters before we know which articles they'll contain. Real pulls vary
 * around it - that variance is the gambling texture - but prices stay
 * predictable.
 */
const TYPICAL_POP = 0.56;

/** Boosters restricted to one theme cost more than open ones. */
const THEME_SURCHARGE = 1.25;

/** How many cards a shop booster can hold. */
export const CARD_COUNT_RANGE = [3, 7];

/* --- what a pack is allowed to draw --------------------------------------- */

/**
 * Rarity is the article's own now, so a booster's tier is a POPULARITY
 * CONSTRAINT on what it may draw: a Legendary booster only pulls pages
 * famous enough to BE at least Legendary. Timed packs run the other way:
 * low track levels cap how famous a page they may pull.
 *
 * Returns { minPopularity, maxPopularity } for the draw, either side null
 * when unconstrained.
 */
export function drawCapsFor(spec) {
  // A timed booster is the one pack still described by a range: its track
  // level caps how famous a page it may pull, whatever the roll says.
  if (spec?.kind === 'timed') return timedDrawCaps(spec.timedLevel ?? 1);
  // Everything else is described by its ODDS ROW, not by a band. The row is
  // rolled once per card and the roll decides which band that card is fetched
  // from, so the pack has no single band of its own. `guarantee` is the tier
  // the pack promises at least one card of, and null when it promises nothing.
  return {
    minPopularity: null,
    maxPopularity: null,
    odds: spec?.rarityId ?? null,
    guarantee: spec?.rarityId ?? null
  };
}

/**
 * Mean value of a single card out of this booster.
 *
 * Read straight off the odds row: the chance of each rarity times what a card
 * of that rarity is worth. This has to follow the table or the shop misprices
 * every tier booster the moment the table is tuned, which is exactly what
 * happened when the price was derived from a band the draw no longer used.
 *
 * A timed booster still has a ceiling rather than a row, so it keeps the old
 * reckoning.
 */
export function expectedCardValue(spec) {
  if (spec?.kind === 'timed') {
    const caps = timedDrawCaps(spec.timedLevel ?? 1);
    const pop = Math.min(TYPICAL_POP, caps.maxPopularity ?? 1);
    return priceFor(pop, rarityById('common'));
  }
  // The print is rolled and the article's fame is whatever the subject gives,
  // so a card is worth the typical fame times the tier it was rolled.
  const row = oddsFor(spec?.rarityId ?? null);
  let value = 0;
  for (let i = 0; i < RARITIES.length; i++) {
    value += ((row[i] ?? 0) / 100) * priceFor(TYPICAL_POP, RARITIES[i]);
  }
  return value;
}

/** What the shop charges. */
export function boosterPrice(spec) {
  const cards = spec.cards ?? 5;
  const raw = (expectedCardValue(spec) * cards * SELL_RATE) / RETURN_RATE;
  const themed = spec.themeId || spec.kind === 'custom' ? THEME_SURCHARGE : 1;
  // Round to something that reads like a price tag.
  return Math.round((raw * themed) / 5) * 5;
}

/** What the player gets for a card. */
export const sellPriceFor = (price) => Math.max(1, Math.round(price * SELL_RATE));

/* --- shop cadence --------------------------------------------------------- */

/** The shop restocks on this cadence, and pays a stipend each time. */
export const REFRESH_MS = 2 * 60 * 60 * 1000;

/** Credited once per elapsed restock, so time - not grinding - is the income. */
export const STIPEND = 500;

/** Stipends stop accruing past this many missed restocks. */
export const STIPEND_MAX_BANKED = 4;

/** The window index the shop's contents are seeded from. */
export const windowIndexAt = (now = Date.now()) => Math.floor(now / REFRESH_MS);

export const nextRefreshAt = (now = Date.now()) => (windowIndexAt(now) + 1) * REFRESH_MS;

/* --- starting out --------------------------------------------------------- */

export const STARTER_COINS = 1500;
export const STARTER_PACKS = 3;
export const STARTER_PACK_CARDS = 5;

/* --- the free shelf ------------------------------------------------------- */

/**
 * The shop always carries something free, so a player with an empty wallet is
 * never stuck. Two small boosters a window is worth roughly 230 Buckarooz if
 * you sell every card - under half a single stipend, and under a tenth of what
 * a day of stipends pays - so it is a floor, not a faucet.
 */
export const FREE_SLOTS = 2;
export const FREE_CARDS = 3;

/**
 * The free shelf runs on its own, slower clock than the rest of the shop: the
 * shelves rotate every two hours, but a free booster comes round every four.
 * Its contents therefore sit still through one restock before changing, which
 * is deliberate - you can see what is coming, and the shop turning over does
 * not hand out another one.
 */
export const FREE_REFRESH_MS = 4 * 60 * 60 * 1000;

export const freeWindowAt = (now = Date.now()) => Math.floor(now / FREE_REFRESH_MS);

export const nextFreeAt = (now = Date.now()) => (freeWindowAt(now) + 1) * FREE_REFRESH_MS;
