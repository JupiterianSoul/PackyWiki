/*
 * PULL RATES.
 *
 * A booster rolls one rarity per card off the table below, and that roll IS
 * the card's rarity: its print. The article the card shows is drawn from the
 * subject separately, so the rates hold in every subject, however thin.
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
