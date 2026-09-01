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
import { rarityRank, rarityFromPopularity, tierMidPopularity, tierBand } from './data/rarities.js';
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
  if (spec?.kind === 'timed') return timedDrawCaps(spec.timedLevel ?? 1);
  if (!spec?.rarityId) return { minPopularity: null, maxPopularity: null };
  return { minPopularity: tierBand(spec.rarityId).min, maxPopularity: null };
}

/** Mean value of a single card out of this booster, from what it may draw. */
export function expectedCardValue(spec) {
  if (spec?.rarityId) {
    // A tiered pack draws from its tier's band and up; assume the low half
    // of the band, since fame thins out fast above every threshold.
    const { min, max } = tierBand(spec.rarityId);
    const pop = min + (max - min) * 0.35;
    return priceFor(pop, rarityFromPopularity(pop));
  }
  const caps = drawCapsFor(spec);
  const pop = Math.min(TYPICAL_POP, caps.maxPopularity ?? 1);
  return priceFor(pop, rarityFromPopularity(pop));
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
