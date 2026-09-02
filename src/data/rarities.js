/**
 * RARITY TABLE
 * ----------------------------------------------------------------------------
 * Rarity is the PRINT: it is rolled when a booster is opened, off the pack's
 * odds row (src/data/odds.js), and belongs to that copy of the card. The
 * same article can be pulled as a Common one day and a Legendary the next,
 * and the better print takes the place of the lesser in the collection.
 *
 * The article itself has FAME: how many people read the page each month, on
 * the 0..1 popularity scale from src/pricing.js. Fame sets the price, and the
 * tier scales it:
 *
 *     price = basePrice(popularity) x (1 + tier.bonusPct / 100)
 *
 * `minPop` is only used to grade a card written before prints existed, so
 * an old collection comes up with the tiers it already had.
 */
export const RARITIES = [
  { id: 'common',    name: { en: 'Common', fr: 'Commune' },        minPop: 0,     bonusPct: 0,    color: '#9aa5b1', glow: 'rgba(154, 165, 177, 0.45)', flash: 0 },
  { id: 'uncommon',  name: { en: 'Uncommon', fr: 'Peu commune' },  minPop: 0.53,  bonusPct: 25,   color: '#4ade80', glow: 'rgba(74, 222, 128, 0.5)',   flash: 0 },   // ~2k/mo
  { id: 'rare',      name: { en: 'Rare', fr: 'Rare' },             minPop: 0.655, bonusPct: 60,   color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.55)',  flash: 0.12 }, // ~13k/mo
  { id: 'epic',      name: { en: 'Epic', fr: 'Épique' },           minPop: 0.755, bonusPct: 140,  color: '#c084fc', glow: 'rgba(192, 132, 252, 0.65)', flash: 0.3 },  // ~57k/mo
  { id: 'legendary', name: { en: 'Legendary', fr: 'Légendaire' },  minPop: 0.83,  bonusPct: 320,  color: '#fbbf24', glow: 'rgba(251, 191, 36, 0.75)',  flash: 0.55 }, // ~160k/mo
  { id: 'mythic',    name: { en: 'Mythic', fr: 'Mythique' },       minPop: 0.885, bonusPct: 700,  color: '#e02134', glow: 'rgba(224, 33, 52, 0.8)',    flash: 0.72 }, // ~360k/mo
  { id: 'exotic',    name: { en: 'Exotic', fr: 'Exotique' },       minPop: 0.93,  bonusPct: 1500, color: '#22d3ee', glow: 'rgba(34, 211, 238, 0.85)',  flash: 0.88 }, // ~700k/mo
  { id: 'prismatic', name: { en: 'Prismatic', fr: 'Prismatique' }, minPop: 0.97,  bonusPct: 3200, color: '#f472b6', glow: 'rgba(244, 114, 182, 0.95)', flash: 1 }     // ~1.3M/mo
];

/**
 * The top tier was called Artifact before it became Prismatic. Saves, the
 * codex, wishlists and auctions written under the old name still carry it,
 * so every lookup by id accepts the old name and answers with the new tier.
 */
const LEGACY_IDS = { artifact: 'prismatic' };
export const normalizeRarityId = (id) => LEGACY_IDS[id] ?? id;
/** Every name a tier has gone by, newest first: for queries against old rows. */
export const rarityIdAliases = (id) =>
  [id, ...Object.keys(LEGACY_IDS).filter((old) => LEGACY_IDS[old] === id)];

/**
 * SPECIAL - the tier of the cards behind a secret code (src/codes.js). It is
 * deliberately not in the table: no popularity earns it, no booster rolls
 * it, no shelf sells it, and the odds sheet has nothing to say about it. It
 * ranks above Prismatic so a special copy always wins a merge, and its colour
 * is white because the card's own treatment paints the real one.
 */
export const SPECIAL = {
  id: 'special', name: { en: 'Special', fr: 'Spéciale' }, minPop: 2, bonusPct: 3200,
  color: '#ffffff', glow: 'rgba(255, 255, 255, 0.9)', flash: 1
};

export const rarityRank = (id) =>
  normalizeRarityId(id) === SPECIAL.id ? RARITIES.length : RARITIES.findIndex((r) => r.id === normalizeRarityId(id));
export const rarityById = (id) =>
  normalizeRarityId(id) === SPECIAL.id ? SPECIAL : (RARITIES.find((r) => r.id === normalizeRarityId(id)) ?? RARITIES[0]);

/** The tier a popularity earns: the highest threshold it clears. */
export function rarityFromPopularity(popularity) {
  const p = Number.isFinite(popularity) ? popularity : 0;
  for (let i = RARITIES.length - 1; i >= 0; i--) {
    if (p >= RARITIES[i].minPop) return RARITIES[i];
  }
  return RARITIES[0];
}

/**
 * The tier of a card as it travels: the one on record, else the one its
 * readership earns. `rarityById` answers Common for anything it does not
 * know, so a card that arrived without a tier (an auction row, an index row
 * written by an older build) must not be asked that way.
 */
export const rarityOfCard = (card) =>
  card?.rarityId ? rarityById(card.rarityId) : rarityFromPopularity(card?.popularity);
