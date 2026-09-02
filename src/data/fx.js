/*
 * CARD EFFECTS, AND WHAT UNLOCKS THEM.
 *
 * Every rarity ships with its own bespoke treatment, drawn tier by tier: that
 * is `classic`, and it is what a card wears until its owner says otherwise.
 * The rest are alternates a player earns by collecting, chosen per rarity, so
 * a collection can be made to look like its owner rather than like everyone
 * else's.
 *
 * The alternates are deliberately written against the rarity's OWN colour
 * rather than against a tier: `sheen` on a Rare is blue and `sheen` on a
 * Mythic is red, because an effect that ignored the tier would flatten the
 * ladder the whole game is built on. Their CSS lives in styles/cards.css under
 * [data-fx].
 *
 * UNLOCKING. A style opens for one rarity at a time, and the cost is cards of
 * that rarity in the collection. Two things push it up: the rarity, because a
 * Mythic is far harder to find than a Common, and the style's own place in the
 * list, so the showiest are the last to arrive. Special sits outside all of
 * this and always wears its own treatment.
 */
import { RARITIES, rarityRank } from './rarities.js';

export const FX_STYLES = [
  { id: 'classic', step: 0, name: { en: 'Classic', fr: 'Classique' },
    note: { en: 'The treatment drawn for this tier.', fr: 'Le traitement dessiné pour ce palier.' } },
  { id: 'sheen', step: 1, name: { en: 'Foil Sheen', fr: 'Éclat métallisé' },
    note: { en: 'A bar of light sweeps the card as it tilts.', fr: 'Une barre de lumière balaie la carte quand elle penche.' } },
  { id: 'prism', step: 2, name: { en: 'Prism Split', fr: 'Éclat prismatique' },
    note: { en: 'The surface refracts into bands of its own colour.', fr: 'La surface se réfracte en bandes de sa propre couleur.' } },
  { id: 'halo', step: 3, name: { en: 'Halo', fr: 'Halo' },
    note: { en: 'A ring of light breathes around the frame.', fr: 'Un anneau de lumière respire autour du cadre.' } },
  { id: 'grain', step: 4, name: { en: 'Archive', fr: 'Archive' },
    note: { en: 'Film grain and a soft vignette, like a kept photograph.', fr: 'Grain argentique et vignettage doux, comme une photo conservée.' } }
];

export const DEFAULT_FX = 'classic';
export const fxById = (id) => FX_STYLES.find((s) => s.id === id) ?? FX_STYLES[0];

/**
 * How many cards of a rarity unlock a style for it.
 *
 * The rarity's rank sets the scale and the style's step multiplies it, so the
 * curve stays readable: Foil Sheen on Commons is a handful of cards, Archive
 * on Mythics is a real collection. `classic` is never locked, because a card
 * has to look like something.
 */
export function fxCost(fxId, rarityId) {
  const style = fxById(fxId);
  if (style.step === 0) return 0;
  const rank = rarityRank(rarityId);
  // Each tier up roughly halves how many cards a player will ever see, so the
  // requirement falls as the tier rises and still bites harder in practice.
  const base = [40, 30, 20, 12, 8, 5, 3, 2][rank] ?? 2;
  return base * style.step;
}

/** Is this style open for this rarity, given how many are owned? */
export const fxUnlocked = (fxId, rarityId, owned) => owned >= fxCost(fxId, rarityId);

/** Every rarity a player can dress, which is every tier in the table. */
export const dressableRarities = () => RARITIES;
