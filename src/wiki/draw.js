/* draw: split out of wiki.js */

import { wikiLang } from '../i18n.js';
import { RARITIES, rarityRank } from '../data/rarities.js';
import { rollRarity } from '../data/odds.js';
import { popularityFromViews } from '../pricing.js';
import { DRAW_BUDGET_MS, FILL_ROUNDS, deadQueries } from './core.js';
import { bestImage, fetchViewsFor, pageToCard, randomPool, searchPool, subjectScore } from './fetch.js';
import { isUsableText } from './filter.js';

/* --- drawing a whole booster --------------------------------------------- */

export function shuffled(arr) {
  return (arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v));
}
/**
 * Candidates for this booster, best first: on-subject pages with a picture.
 * Every card in a booster is drawn from this one pool, so the whole booster
 * costs about one search rather than one search per card.
 */

export async function gatherCandidates(pack) {
  const live = (pack.queries ?? []).filter((q) => !deadQueries.has(`${wikiLang()}|${q}`));
  const pages = [];

  // No subject to search: this pack's subject IS Wikipedia, and since the
  // print is rolled rather than earned, any page will do. One request.
  if (!live.length) pages.push(...await randomPool().catch(() => []));

  if (live.length) {
    // Two different queries widen a booster without costing a request per
    // card. A pack that leans on the famous end samples the top of the
    // ranking with one of them: search ranks well-read pages first, and that
    // is where a Rare or better is likely to be found. The other roams.
    const queries = shuffled(live).slice(0, Math.min(2, live.length));
    const leansFamous = rarityRank(pack.guarantee ?? 'common') >= 2;
    const pools = await Promise.all(queries.map((q, i) =>
      searchPool(q, { preferBig: leansFamous && i === 0 }).catch(() => [])));
    for (const pool of pools) pages.push(...pool);
  }

  if (!pages.length) pages.push(...await randomPool().catch(() => []));

  const seen = new Set();
  const scored = [];
  for (const page of pages) {
    if (seen.has(page.title)) continue;
    seen.add(page.title);
    if (!bestImage(page) || !isUsableText(page.title, page.extract)) continue;
    const score = subjectScore(pack, page);
    if (score > 0) scored.push({ page, score });
  }
  // On-subject first, shuffled inside each tier so a booster is not the same
  // five pages every time.
  return [...shuffled(scored.filter((c) => c.score === 2)), ...shuffled(scored.filter((c) => c.score === 1))]
    .map((c) => c.page);
}
/**
 * What the pack owes, decided before a single page is looked at.
 *
 * One roll per card off the pack's odds row, then the guarantee on top: a
 * booster with a tier printed on it always owes at least one card of that
 * tier. A card ABOVE the promised tier keeps the promise, so a Legendary roll
 * in an Epic pack satisfies it and nothing is forced.
 */

export function rollWishes(pack, wanted) {
  const wishes = Array.from({ length: wanted }, () => rollRarity(pack.odds));
  if (!pack.guarantee) return wishes;
  const promised = rarityRank(pack.guarantee);
  if (wishes.some((wish) => rarityRank(wish) >= promised)) return wishes;
  wishes[Math.floor(Math.random() * wishes.length)] = pack.guarantee;
  return wishes;
}
/**
 * The prints, settled against the cards the draw actually came back with.
 *
 * The rolls are made for the size the pack was sold as, but a thin subject
 * can come back short. Trimming the rolls to the cards in hand can throw the
 * guaranteed one away - a ten-card Epic pack that found four cards would put
 * the Epic at roll seven and hand over four Commons - so the promise is made
 * again over what is left.
 */

export function settleWishes(pack, wishes, count) {
  const kept = wishes.slice(0, Math.max(1, count));
  if (!pack.guarantee) return kept;
  const promised = rarityRank(pack.guarantee);
  if (kept.some((wish) => rarityRank(wish) >= promised)) return kept;
  kept[Math.floor(Math.random() * kept.length)] = pack.guarantee;
  return kept;
}
/**
 * The highest tier a pack may hand out. Only a timed booster has one: its
 * track level caps the print, so a roll above the cap is brought down to it.
 */

export function ceilingRank(pack) {
  if (pack.maxPopularity == null) return RARITIES.length - 1;
  for (let i = RARITIES.length - 1; i >= 0; i--) {
    if (RARITIES[i].minPop < pack.maxPopularity) return i;
  }
  return 0;
}
/** The rolls, brought under the pack's ceiling. */

export function cappedWishes(pack, wishes) {
  const ceiling = ceilingRank(pack);
  return wishes.map((wish) => (rarityRank(wish) > ceiling ? RARITIES[ceiling].id : wish));
}
/** Pages turned into cards, priced on their size until their readership is known. */

export function pagesToCards(pages, seen) {
  const fresh = pages.filter((page) => !seen.has(page.title) && bestImage(page) && isUsableText(page.title, page.extract));
  for (const page of fresh) seen.add(page.title);
  return fresh.map((page) => pageToCard(page, null)).filter(Boolean);
}
/** How long the draw waits for readership before pricing on size instead. */

export const VIEWS_PATIENCE_MS = 1500;
/**
 * The readership of the cards the draw settled on: ONE request, for a
 * handful of titles, and no longer than a couple of seconds. Readership is
 * the article's fame and only sets the price, so a pack is never held for
 * it: a card whose count did not come in time is priced on its size, and
 * the next pull of it, or the launch repair, prices it right.
 */

export async function priceOnReadership(cards) {
  const titles = cards.map((card) => card.title);
  if (!titles.length) return cards;
  const views = await Promise.race([
    fetchViewsFor(titles).catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), VIEWS_PATIENCE_MS))
  ]);
  if (!views) return cards;
  for (const card of cards) {
    const n = views.get(card.title);
    if (n == null) continue;
    card.views = n;
    card.popularity = popularityFromViews(n);
  }
  return cards;
}
/**
 * Stamp each card with the print it was rolled. The print is what the
 * booster promised; the article is whatever the subject had. The two are
 * independent, which is the whole point: an Epic pack deals Epics at its
 * printed rate in every subject, thin or famous.
 */

export function stampPrints(cards, wishes) {
  cards.forEach((card, i) => { card.rarityId = wishes[i] ?? wishes[wishes.length - 1] ?? RARITIES[0].id; });
  return cards;
}

export async function drawWikipediaSet(pack) {
  const wanted = Math.max(1, pack.cards ?? 5);
  const seen = new Set();
  const deadline = Date.now() + DRAW_BUDGET_MS;
  const outOfTime = () => Date.now() > deadline || navigator.onLine === false;

  if (navigator.onLine === false) throw new Error('OFFLINE');

  // The prints this pack deals, rolled first; then any pages of the subject.
  const wishes = cappedWishes(pack, rollWishes(pack, wanted));
  const out = pagesToCards(await gatherCandidates(pack), seen).slice(0, wanted);

  // Still short (a dead query, a thin subject, a candidate list mostly
  // without pictures): random articles, which always exist, rather than a
  // ten-card booster that hands over four. Each round is one request for
  // twenty pages, and the loop only runs while the pack is still owed cards.
  for (let round = 0; out.length < wanted && round < FILL_ROUNDS && !outOfTime(); round++) {
    const extra = pagesToCards(await randomPool().catch(() => []), seen);
    for (const card of extra) { if (out.length >= wanted) break; out.push(card); }
  }
  if (out.length < wanted) console.warn(`Wikster draw "${pack.name}": ${out.length} of ${wanted} cards`);

  if (!out.length) throw new Error(`No usable article found for "${pack.name}"`);
  if (!outOfTime()) await priceOnReadership(out);
  return stampPrints(out, settleWishes(pack, wishes, out.length));
}
