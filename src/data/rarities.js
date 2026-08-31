/**
 * RARITY TABLE
 * ----------------------------------------------------------------------------
 * One row per tier, ordered worst -> best. `id` doubles as the value written to
 * `data-rarity` on the card element, which is the hook every visual effect in
 * style.css keys off. To add a tier: insert a row (keeping the array ordered by
 * power), give it a weight, and add a matching `[data-rarity="<id>"]` block in
 * style.css.
 *
 * name     - bilingual; resolve with tx() from src/i18n.js.
 * weight   - relative odds, not percentages: the roll normalises by the
 *            actual total, so tiers can be tuned or added without
 *            rebalancing the rest of the table.
 * bonusPct - how much the tier adds to a card's base price, as a percentage.
 *            Common adds nothing; an Artifact is worth 33x a Common of the
 *            same article. See src/pricing.js.
 * flash    - screen-flash intensity on reveal (0 = no flash).
 *
 * Odds do NOT depend on the article. A page with 100 views a month and one
 * with 100k have exactly the same chance at every tier.
 */
export const RARITIES = [
  { id: 'common',    name: { en: 'Common', fr: 'Commune' },    weight: 42,   bonusPct: 0,    color: '#9aa5b1', glow: 'rgba(154, 165, 177, 0.45)', flash: 0 },
  { id: 'uncommon',  name: { en: 'Uncommon', fr: 'Peu commune' },  weight: 27,   bonusPct: 25,   color: '#4ade80', glow: 'rgba(74, 222, 128, 0.5)',   flash: 0 },
  { id: 'rare',      name: { en: 'Rare', fr: 'Rare' },      weight: 16.5, bonusPct: 60,   color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.55)',  flash: 0.12 },
  { id: 'epic',      name: { en: 'Epic', fr: 'Épique' },      weight: 8,    bonusPct: 140,  color: '#c084fc', glow: 'rgba(192, 132, 252, 0.65)', flash: 0.3 },
  { id: 'legendary', name: { en: 'Legendary', fr: 'Légendaire' }, weight: 2.6,  bonusPct: 320,  color: '#fbbf24', glow: 'rgba(251, 191, 36, 0.75)',  flash: 0.55 },
  { id: 'mythic',    name: { en: 'Mythic', fr: 'Mythique' },    weight: 0.6,  bonusPct: 700,  color: '#e02134', glow: 'rgba(224, 33, 52, 0.8)',    flash: 0.72 },
  { id: 'exotic',    name: { en: 'Exotic', fr: 'Exotique' },    weight: 0.22, bonusPct: 1500, color: '#22d3ee', glow: 'rgba(34, 211, 238, 0.85)',  flash: 0.88 },
  { id: 'artifact',  name: { en: 'Artifact', fr: 'Artefact' },  weight: 0.08, bonusPct: 3200, color: '#fef08a', glow: 'rgba(254, 240, 138, 0.95)', flash: 1 }
];

export const rarityRank = (id) => RARITIES.findIndex((r) => r.id === id);
export const rarityById = (id) => RARITIES.find((r) => r.id === id) ?? RARITIES[0];

const TOTAL_WEIGHT = RARITIES.reduce((sum, r) => sum + r.weight, 0);

/** Odds as a percentage, derived rather than hard-coded. */
export const rarityOdds = (rarity) => (rarity.weight / TOTAL_WEIGHT) * 100;

/**
 * Effective weights for one roll.
 *
 * Standard boosters use the table as-is. Rarity boosters bias it:
 *   tierShift  multiplies every tier's weight by shift^rank, tilting upward.
 *   floorTier  drops everything below that rank outright, so a Legendary
 *              booster can never hand you a Common.
 *
 * Nothing here depends on the article — a 100-view page and a 100k-view page
 * have identical odds at every tier.
 */
export function rarityWeights({ tierShift = 1, floorTier = 0 } = {}) {
  return RARITIES.map((rarity, rank) =>
    rank < floorTier ? 0 : rarity.weight * Math.pow(tierShift, rank));
}

/** Weighted random pull. Options are passed straight to rarityWeights(). */
export function rollRarity(options = {}) {
  const weights = rarityWeights(options);
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return RARITIES[Math.min(options.floorTier ?? 0, RARITIES.length - 1)];

  let ticket = Math.random() * total;
  for (let i = 0; i < RARITIES.length; i++) {
    ticket -= weights[i];
    if (ticket <= 0) return RARITIES[i];
  }
  return RARITIES[RARITIES.length - 1];
}

/** Probability of each tier under the given roll options. */
export function rarityChances(options = {}) {
  const weights = rarityWeights(options);
  const total = weights.reduce((sum, w) => sum + w, 0);
  return RARITIES.map((rarity, i) => ({
    rarity,
    chance: total > 0 ? weights[i] / total : 0
  }));
}

/**
 * Mean price multiplier of a card from a booster with these odds. This is what
 * the shop prices boosters from, so a pack that pulls better costs more by
 * exactly the amount it pulls better — see src/economy.js.
 */
export const expectedMultiplier = (options = {}) =>
  rarityChances(options).reduce((sum, { rarity, chance }) =>
    sum + chance * (1 + rarity.bonusPct / 100), 0);

/** Rows for the odds modal. */
export const oddsTable = (options = {}) =>
  rarityChances(options).map(({ rarity, chance }) => ({ rarity, percent: chance * 100 }));
