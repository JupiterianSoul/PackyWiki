/**
 * RARITY TABLE
 * ----------------------------------------------------------------------------
 * One row per tier, ordered worst -> best. `id` doubles as the value written to
 * `data-rarity` on the card element, which is the hook every visual effect in
 * style.css keys off. To add a tier: insert a row (keeping the array ordered by
 * power), give it a weight, and add a matching `[data-rarity="<id>"]` block in
 * style.css. Nothing else in the app needs to change.
 *
 * weight  - relative odds, not percentages. They happen to sum to 100 here,
 *           which makes them readable as percentages, but the roll normalises
 *           by the actual total so you can add tiers without rebalancing.
 * effect  - short human label for the CSS treatment, shown in the odds table.
 * flash   - screen-flash intensity on reveal (0 = no flash).
 * color   - primary accent; `glow` is the bloom/shadow colour.
 */
export const RARITIES = [
  {
    id: 'common',
    name: 'Common',
    weight: 40,
    color: '#9aa5b1',
    glow: 'rgba(154, 165, 177, 0.45)',
    effect: 'matte stock',
    flash: 0
  },
  {
    id: 'uncommon',
    name: 'Uncommon',
    weight: 25,
    color: '#4ade80',
    glow: 'rgba(74, 222, 128, 0.5)',
    effect: 'sheen sweep',
    flash: 0
  },
  {
    id: 'rare',
    name: 'Rare',
    weight: 15,
    color: '#38bdf8',
    glow: 'rgba(56, 189, 248, 0.55)',
    effect: 'edge glow',
    flash: 0
  },
  {
    id: 'double-rare',
    name: 'Double Rare',
    weight: 9,
    color: '#818cf8',
    glow: 'rgba(129, 140, 248, 0.6)',
    effect: 'twin sheen + sparkles',
    flash: 0.15
  },
  {
    id: 'epic',
    name: 'Epic',
    weight: 5.5,
    color: '#c084fc',
    glow: 'rgba(192, 132, 252, 0.65)',
    effect: 'pulsing aura',
    flash: 0.28
  },
  {
    id: 'ultra-rare',
    name: 'Ultra Rare',
    weight: 3,
    color: '#f472b6',
    glow: 'rgba(244, 114, 182, 0.7)',
    effect: 'rainbow foil shimmer',
    flash: 0.42
  },
  {
    id: 'legendary',
    name: 'Legendary',
    weight: 1.6,
    color: '#fbbf24',
    glow: 'rgba(251, 191, 36, 0.75)',
    effect: 'rotating light rays',
    flash: 0.58
  },
  {
    id: 'mythic',
    name: 'Mythic',
    weight: 0.7,
    color: '#fb7185',
    glow: 'rgba(251, 113, 133, 0.8)',
    effect: 'flame flicker',
    flash: 0.72
  },
  {
    id: 'secret-rare',
    name: 'Secret Rare',
    weight: 0.15,
    color: '#22d3ee',
    glow: 'rgba(34, 211, 238, 0.85)',
    effect: 'holographic prismatic shine',
    flash: 0.86
  },
  {
    id: 'artifact',
    name: 'Artifact',
    weight: 0.05,
    color: '#fef08a',
    glow: 'rgba(254, 240, 138, 0.95)',
    effect: 'full iridescent burst',
    flash: 1
  }
];

/** Rank of a tier (0 = Common). Used for sorting reveals worst -> best. */
export const rarityRank = (id) => RARITIES.findIndex((r) => r.id === id);

export const rarityById = (id) => RARITIES.find((r) => r.id === id) ?? RARITIES[0];

const TOTAL_WEIGHT = RARITIES.reduce((sum, r) => sum + r.weight, 0);

/** Odds as a percentage, derived rather than hard-coded. */
export const rarityOdds = (rarity) => (rarity.weight / TOTAL_WEIGHT) * 100;

/** Weighted random pull across the whole table. */
export function rollRarity() {
  let ticket = Math.random() * TOTAL_WEIGHT;
  for (const rarity of RARITIES) {
    ticket -= rarity.weight;
    if (ticket <= 0) return rarity;
  }
  return RARITIES[0];
}
