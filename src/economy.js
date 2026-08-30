/**
 * The economy.
 *
 * The one rule everything else is built to protect: **you cannot get rich by
 * churning boosters.** Selling a booster's entire contents returns a fixed
 * fraction of what the booster cost, whatever tier it was, so the
 * sell-buy-bigger-sell loop always leaks value instead of compounding. A lucky
 * Artifact can still pay for several packs — that's the thrill — but it is
 * variance around a losing mean, not a strategy.
 *
 * Concretely:
 *   sell value of a card   = SELL_RATE × its price
 *   price of a booster     = its expected sell value ÷ RETURN_RATE
 *
 * so E[sell everything] = RETURN_RATE × price, for every booster in the game.
 * Progression therefore comes from time (the shop stipend), not from grinding.
 */
import { expectedMultiplier, rarityRank, rarityById } from './data/rarities.js';
import { basePrice } from './pricing.js';
import { timedRollOptions } from './timed.js';

/** A card sells for this fraction of its listed price. */
export const SELL_RATE = 0.3;

/** Selling a whole booster returns this fraction of what it cost. */
export const RETURN_RATE = 0.72;

/**
 * Assumed average article value, used to price boosters before we know which
 * articles they'll contain. Real pulls vary around it — that variance is the
 * gambling texture — but prices stay predictable.
 */
const BASE_ESTIMATE = basePrice(0.5);

/** Boosters restricted to one theme cost more than open ones. */
const THEME_SURCHARGE = 1.25;

/** How many cards a shop booster can hold. */
export const CARD_COUNT_RANGE = [3, 7];

/* --- rarity boosters ------------------------------------------------------ */

/**
 * Roll odds for a booster. A standard booster uses the plain table; a rarity
 * booster tilts it upward and drops the bottom three tiers, so a Legendary
 * booster never yields a Common.
 */
export function rollOptionsFor(spec) {
  // Timed boosters run on their own nerfed table, which only reaches the
  // normal odds at the top of their track. See src/timed.js.
  if (spec?.kind === 'timed') return timedRollOptions(spec.timedLevel ?? 1);
  if (!spec?.rarityId) return {};
  const rank = rarityRank(spec.rarityId);
  return { tierShift: 1 + rank * 0.16, floorTier: Math.max(0, rank - 3) };
}

/** Mean value of a single card out of this booster. */
export const expectedCardValue = (spec) =>
  BASE_ESTIMATE * expectedMultiplier(rollOptionsFor(spec));

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

/** Credited once per elapsed restock, so time — not grinding — is the income. */
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
 * you sell every card — under half a single stipend, and under a tenth of what
 * a day of stipends pays — so it is a floor, not a faucet.
 */
export const FREE_SLOTS = 2;
export const FREE_CARDS = 3;
