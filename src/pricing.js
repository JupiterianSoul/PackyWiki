/**
 * Card pricing and popularity.
 *
 * Popularity is the hinge the whole economy turns on, and it pulls in two
 * directions on purpose:
 *
 *   - a popular article makes a card WORTH MORE (see priceFor)
 *   - a popular article makes a high rarity HARDER to roll (see rarities.js)
 *
 * So a Legendary Isaac Newton is both far rarer and far more valuable than a
 * Legendary pull on some 200-view stub.
 */

/** log10(views) at which an article counts as maximally popular (~2M/month). */
const VIEWS_LOG_CEILING = 6.3;

/** log10(words) treated as maximally "big" when pageviews aren't available. */
const WORDS_LOG_CEILING = Math.log10(9000);

const clamp01 = (n) => Math.min(1, Math.max(0, n));

/** Monthly pageviews -> 0..1 popularity, on a log scale. */
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
  return clamp01(Math.log10(words + 1) / WORDS_LOG_CEILING);
}

/**
 * Base price before rarity, in credits. Ranges from 12 (nobody reads this) to
 * ~192 (front-page famous), curved so the middle of the range isn't flat.
 */
export function basePrice(popularity) {
  return 12 + 180 * Math.pow(clamp01(popularity), 1.6);
}

/** Final card price: popularity sets the base, rarity multiplies it. */
export function priceFor(popularity, rarity) {
  return Math.round(basePrice(popularity) * rarity.value);
}

export function formatPrice(price) {
  return `$${Math.round(price).toLocaleString('en-US')}`;
}

/** Compact view count for the card face and collection filters. */
export function formatViews(views) {
  if (!Number.isFinite(views) || views <= 0) return '—';
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(views >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(views));
}

/**
 * Popularity bands, used as a collection filter ("the most popular cards") and
 * as the label under the view count.
 */
export const POPULARITY_BANDS = [
  { id: 'obscure',   name: 'Obscure',   min: 0,    max: 0.35 },
  { id: 'known',     name: 'Known',     min: 0.35, max: 0.55 },
  { id: 'popular',   name: 'Popular',   min: 0.55, max: 0.75 },
  { id: 'famous',    name: 'Famous',    min: 0.75, max: 1.01 }
];

export const bandFor = (popularity) =>
  POPULARITY_BANDS.find((b) => popularity >= b.min && popularity < b.max) ?? POPULARITY_BANDS[0];
