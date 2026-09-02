/*
 * PULL RATES.
 *
 * How a card is drawn, in two steps and in this order:
 *
 *   1. Roll a rarity off the table below.
 *   2. Go and find an article whose readership puts it in THAT rarity's band.
 *
 * This is the opposite of what the draw used to do, which was to find an
 * article and read its rarity off afterwards. Rarity is still the article's
 * own property, decided by how many people read the page each month, so the
 * same page is still the same rarity for every player: what the table decides
 * is what the draw goes looking for, not what it finds.
 *
 * A booster with a tier printed on it uses a better row. Each row moves the
 * weight up one rarity, keeps a long tail underneath so a pack still has
 * variance, and never becomes a certainty: even the Prismatic row spends most
 * of its mass in the middle. The guarantee is what makes the tier a promise
 * rather than a lean; it lives in the draw, not here.
 *
 * Every row is a percentage and every row sums to 100. Tune here.
 */
import { RARITIES, rarityRank } from './rarities.js';

/** Column order is RARITIES order: common ... prismatic. */
const TABLE = {
  //          com   unc   rare  epic  leg   myth  exo   pris
  none:      [68,   18,   8,    3.5,  1.6,  0.6,  0.25, 0.05],
  common:    [68,   18,   8,    3.5,  1.6,  0.6,  0.25, 0.05],
  uncommon:  [50,   28,   13,   5.5,  2.2,  0.9,  0.35, 0.05],
  rare:      [34,   30,   20,   9,    4.2,  1.8,  0.85, 0.15],
  epic:      [20,   26,   26,   16,   7.5,  3,    1.3,  0.2],
  legendary: [11,   18,   25,   23,   14,   6,    2.6,  0.4],
  mythic:    [6,    11,   19,   24,   22,   12,   5,    1],
  exotic:    [3,    6,    12,   19,   24,   20,   13,   3],
  prismatic: [1.5,  3,    7,    13,   20,   24,   20,   11.5]
};

/** The row a booster pulls on. An untiered booster is the basic row. */
export const oddsFor = (rarityId) => TABLE[rarityId ?? 'none'] ?? TABLE.none;

/** The row as { rarityId, pct } pairs, for the odds sheet. */
export const oddsRows = (rarityId) =>
  oddsFor(rarityId).map((pct, i) => ({ rarity: RARITIES[i], pct }));

/**
 * Roll one rarity off a row. `rng` is passed in so a test can make the roll
 * repeatable; it defaults to Math.random.
 */
export function rollRarity(rarityId, rng = Math.random) {
  const row = oddsFor(rarityId);
  let ticket = rng() * 100;
  for (let i = 0; i < row.length; i++) {
    ticket -= row[i];
    if (ticket < 0) return RARITIES[i].id;
  }
  return RARITIES[0].id;
}

/** Chance, 0..1, that a single card off this row lands at `wanted` or better. */
export function chanceOfAtLeast(rarityId, wanted) {
  const from = rarityRank(wanted);
  return oddsFor(rarityId).slice(from).reduce((sum, pct) => sum + pct, 0) / 100;
}
