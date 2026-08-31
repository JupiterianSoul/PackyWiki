/**
 * Card pricing, in Buckarooz (Ᏸ).
 *
 * Popularity sets the BASE price — how many people actually read the article
 * each month. Rarity is then a percentage bonus on top of that base, so the
 * tier scales the card rather than replacing its value:
 *
 *     price = base(popularity) × (1 + rarity.bonusPct / 100)
 *
 * A Common and an Artifact of the same article share a base; the Artifact is
 * simply worth 3200% more of it.
 *
 * Popularity now also DECIDES the rarity (see src/data/rarities.js), so a
 * card's price is one curve of how read its article is, with tier steps.
 */

/** log10(views) at which an article counts as maximally popular (~2M/month). */
const VIEWS_LOG_CEILING = 6.3;
/** log10(words) treated as maximally "big" when pageviews aren't available. */
const WORDS_LOG_CEILING = Math.log10(20000);

const clamp01 = (n) => Math.min(1, Math.max(0, n));

export function popularityFromViews(views) {
  if (!Number.isFinite(views) || views <= 0) return 0;
  return clamp01(Math.log10(views + 1) / VIEWS_LOG_CEILING);
}

/**
 * Fallback for wikis with no pageview API (every custom pack, and any
 * Wikipedia article whose stats request failed). Article length is a decent
 * stand-in: on a topic wiki the big articles are the ones people care about.
 */
export function popularityFromWordCount(words) {
  if (!Number.isFinite(words) || words <= 0) return 0.25;
  // The gentle power keeps a middling wiki page from reading as famous:
  // rarity comes straight from this number now, so the size-to-popularity
  // curve has to hand out the top of the scale as grudgingly as pageviews do.
  return clamp01(Math.pow(Math.log10(words + 1) / WORDS_LOG_CEILING, 1.15));
}

/** Base value of the article itself, before any rarity bonus. */
export function basePrice(popularity) {
  return 20 + 480 * Math.pow(clamp01(popularity), 1.5);
}

export function priceFor(popularity, rarity) {
  return Math.round(basePrice(popularity) * (1 + rarity.bonusPct / 100));
}

export const CURRENCY_NAME = 'Buckarooz';

/** Plain-text amount. The Ᏸ glyph itself is drawn as SVG — see icons.js. */
export function formatAmount(price) {
  return Math.round(price).toLocaleString('en-US');
}

/** Compact view count for the card face and collection filters. */
export function formatViews(views) {
  if (!Number.isFinite(views) || views <= 0) return '?';
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(views >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(views));
}

/** Popularity bands, used as a collection filter and as a card-face label. */
export const POPULARITY_BANDS = [
  { id: 'obscure', name: 'Obscure', min: 0,    max: 0.35 },
  { id: 'known',   name: 'Known',   min: 0.35, max: 0.55 },
  { id: 'popular', name: 'Popular', min: 0.55, max: 0.75 },
  { id: 'famous',  name: 'Famous',  min: 0.75, max: 1.01 }
];

export const bandFor = (popularity) =>
  POPULARITY_BANDS.find((b) => popularity >= b.min && popularity < b.max) ?? POPULARITY_BANDS[0];
