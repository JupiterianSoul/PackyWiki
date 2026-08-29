/**
 * RARITY TABLE
 * ----------------------------------------------------------------------------
 * One row per tier, ordered worst -> best. `id` doubles as the value written to
 * `data-rarity` on the card element, which is the hook every visual effect in
 * style.css keys off. To add a tier: insert a row (keeping the array ordered by
 * power), give it a weight, and add a matching `[data-rarity="<id>"]` block in
 * style.css. A booster pack for the new tier is generated automatically.
 *
 * weight  - relative odds, not percentages. They happen to sum to 100 here,
 *           which makes them readable as percentages, but every roll normalises
 *           by the actual total so you can add tiers without rebalancing.
 * value   - price multiplier applied on top of the popularity-derived base
 *           price (see src/pricing.js).
 * effect  - short human label for the CSS treatment, shown in the odds table.
 * flash   - screen-flash intensity on reveal (0 = no flash).
 */
export const RARITIES = [
  { id: 'common',      name: 'Common',      weight: 40,   value: 1,    color: '#9aa5b1', glow: 'rgba(154, 165, 177, 0.45)', effect: 'matte stock',                flash: 0 },
  { id: 'uncommon',    name: 'Uncommon',    weight: 25,   value: 1.5,  color: '#4ade80', glow: 'rgba(74, 222, 128, 0.5)',   effect: 'sheen sweep',                flash: 0 },
  { id: 'rare',        name: 'Rare',        weight: 15,   value: 2.4,  color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.55)',  effect: 'edge glow',                  flash: 0 },
  { id: 'double-rare', name: 'Double Rare', weight: 9,    value: 3.8,  color: '#818cf8', glow: 'rgba(129, 140, 248, 0.6)',  effect: 'twin sheen + sparkles',      flash: 0.15 },
  { id: 'epic',        name: 'Epic',        weight: 5.5,  value: 6,    color: '#c084fc', glow: 'rgba(192, 132, 252, 0.65)', effect: 'pulsing aura',               flash: 0.28 },
  { id: 'ultra-rare',  name: 'Ultra Rare',  weight: 3,    value: 10,   color: '#f472b6', glow: 'rgba(244, 114, 182, 0.7)',  effect: 'rainbow foil shimmer',       flash: 0.42 },
  { id: 'legendary',   name: 'Legendary',   weight: 1.6,  value: 18,   color: '#fbbf24', glow: 'rgba(251, 191, 36, 0.75)',  effect: 'rotating light rays',        flash: 0.58 },
  { id: 'mythic',      name: 'Mythic',      weight: 0.7,  value: 34,   color: '#fb7185', glow: 'rgba(251, 113, 133, 0.8)',  effect: 'flame flicker',              flash: 0.72 },
  { id: 'secret-rare', name: 'Secret Rare', weight: 0.15, value: 70,   color: '#22d3ee', glow: 'rgba(34, 211, 238, 0.85)',  effect: 'holographic prismatic shine', flash: 0.86 },
  { id: 'artifact',    name: 'Artifact',    weight: 0.05, value: 160,  color: '#fef08a', glow: 'rgba(254, 240, 138, 0.95)', effect: 'full iridescent burst',      flash: 1 }
];

/** Rank of a tier (0 = Common). Used for sorting and for every weight formula. */
export const rarityRank = (id) => RARITIES.findIndex((r) => r.id === id);

export const rarityById = (id) => RARITIES.find((r) => r.id === id) ?? RARITIES[0];

const BASE_TOTAL = RARITIES.reduce((sum, r) => sum + r.weight, 0);

/** Baseline odds as a percentage, derived rather than hard-coded. */
export const rarityOdds = (rarity) => (rarity.weight / BASE_TOTAL) * 100;

/**
 * How much harder a high tier gets on a popular article.
 *
 * Each rank is multiplied by POPULARITY_DAMPING ^ (popularity * rank), so at
 * popularity 0 nothing changes and at popularity 1 the top tier is ~130x rarer.
 * This is the "a Legendary on a famous page is harder than on an obscure one"
 * rule — and it is the counterweight to pricing, which moves the opposite way.
 */
const POPULARITY_DAMPING = 0.6;

/**
 * Effective weights for one roll.
 *
 * popularity  0..1, from src/pricing.js — 1 is a hugely-visited article.
 * tierShift   >1 biases the whole table upward (rarity booster packs).
 * floorTier   rank below which tiers are excluded entirely (rarity packs).
 */
export function rarityWeights({ popularity = 0.5, tierShift = 1, floorTier = 0 } = {}) {
  const pop = Math.min(1, Math.max(0, popularity));
  return RARITIES.map((rarity, rank) => {
    if (rank < floorTier) return 0;
    const popularityPenalty = Math.pow(POPULARITY_DAMPING, pop * rank);
    const packBias = Math.pow(tierShift, rank);
    return rarity.weight * popularityPenalty * packBias;
  });
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

/** Odds table for a given set of roll options, as percentages. */
export function oddsFor(options = {}) {
  const weights = rarityWeights(options);
  const total = weights.reduce((sum, w) => sum + w, 0);
  return RARITIES.map((rarity, i) => ({
    rarity,
    percent: total > 0 ? (weights[i] / total) * 100 : 0
  }));
}
