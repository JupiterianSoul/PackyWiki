/**
 * RARITY TABLE
 * ----------------------------------------------------------------------------
 * One row per tier, ordered worst -> best. `id` doubles as the value written to
 * `data-rarity` on the card element, which is the hook every visual effect in
 * style.css keys off. To add a tier: insert a row (keeping the array ordered by
 * power), give it a weight, and add a matching `[data-rarity="<id>"]` block in
 * style.css.
 *
 * weight   - relative odds, not percentages. They happen to sum to 100 here,
 *            which makes them readable as percentages, but the roll normalises
 *            by the actual total so you can add tiers without rebalancing.
 * bonusPct - how much the tier adds to a card's base price, as a percentage.
 *            Common adds nothing; an Artifact is worth 33x a Common of the
 *            same article. See src/pricing.js.
 * flash    - screen-flash intensity on reveal (0 = no flash).
 *
 * Odds do NOT depend on the article. A page with 100 views a month and one
 * with 100k have exactly the same chance at every tier.
 */
export const RARITIES = [
  { id: 'common',    name: 'Common',    weight: 42,   bonusPct: 0,    color: '#9aa5b1', glow: 'rgba(154, 165, 177, 0.45)', flash: 0 },
  { id: 'uncommon',  name: 'Uncommon',  weight: 27,   bonusPct: 25,   color: '#4ade80', glow: 'rgba(74, 222, 128, 0.5)',   flash: 0 },
  { id: 'rare',      name: 'Rare',      weight: 17,   bonusPct: 60,   color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.55)',  flash: 0.12 },
  { id: 'epic',      name: 'Epic',      weight: 9,    bonusPct: 140,  color: '#c084fc', glow: 'rgba(192, 132, 252, 0.65)', flash: 0.3 },
  { id: 'legendary', name: 'Legendary', weight: 3.6,  bonusPct: 320,  color: '#fbbf24', glow: 'rgba(251, 191, 36, 0.75)',  flash: 0.55 },
  { id: 'mythic',    name: 'Mythic',    weight: 0.9,  bonusPct: 700,  color: '#e02134', glow: 'rgba(224, 33, 52, 0.8)',    flash: 0.72 },
  { id: 'exotic',    name: 'Exotic',    weight: 0.35, bonusPct: 1500, color: '#22d3ee', glow: 'rgba(34, 211, 238, 0.85)',  flash: 0.88 },
  { id: 'artifact',  name: 'Artifact',  weight: 0.15, bonusPct: 3200, color: '#fef08a', glow: 'rgba(254, 240, 138, 0.95)', flash: 1 }
];

export const rarityRank = (id) => RARITIES.findIndex((r) => r.id === id);
export const rarityById = (id) => RARITIES.find((r) => r.id === id) ?? RARITIES[0];

const TOTAL_WEIGHT = RARITIES.reduce((sum, r) => sum + r.weight, 0);

/** Odds as a percentage, derived rather than hard-coded. */
export const rarityOdds = (rarity) => (rarity.weight / TOTAL_WEIGHT) * 100;

/** Weighted random pull. Identical for every article — no popularity input. */
export function rollRarity() {
  let ticket = Math.random() * TOTAL_WEIGHT;
  for (const rarity of RARITIES) {
    ticket -= rarity.weight;
    if (ticket <= 0) return rarity;
  }
  return RARITIES[0];
}

/** Rows for the odds modal. */
export const oddsTable = () =>
  RARITIES.map((rarity) => ({ rarity, percent: rarityOdds(rarity) }));
