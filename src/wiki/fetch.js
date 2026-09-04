/* fetch: split out of wiki.js */

import { wikiLang } from '../i18n.js';
import { ACTION, MAX_SEARCH_OFFSET, PAGEVIEWS, deadQueries, encodeTitle, fetchJson, querySizeCache, thumbSize } from './core.js';
import { isUsableText, toCard } from './filter.js';

/* --- Wikipedia -----------------------------------------------------------
 *
 * ONE request brings back twenty candidates COMPLETE: opening text, picture,
 * short description, categories and url. That is the whole redesign here.
 * The old draw asked for a search hit, then a summary, then pageviews, one
 * card at a time, three round trips deep, which is why a five-card booster
 * could sit there for ten seconds. Now a booster is one search plus a
 * handful of pageview lookups running side by side.
 *
 * Having the categories in hand is also what makes a booster honest: a
 * full-text search returns anything that merely mentions the words, which is
 * how an actor turned up in the Weird booster. Every candidate is scored
 * against the pack's own terms (see `match` in src/data/packs.js) and the
 * ones that are not about the subject are thrown away.
 */

export const POOL_LIMIT = 20;
/** Everything a card needs, asked for in the same breath as the search. */

export const PAGE_PROPS = {
  prop: 'extracts|pageimages|categories|info|description',
  exintro: '1', explaintext: '1', exchars: '600', exlimit: String(POOL_LIMIT),
  piprop: 'thumbnail|original', pilimit: String(POOL_LIMIT),
  // pithumbsize is added per request (see pageProps): it depends on the line.
  // Readership is deliberately NOT asked for here. Asking the search to
  // carry pageview counts for twenty candidates made the one request that
  // matters take several seconds: the wiki fetches those counts one page at
  // a time on its side. Readership only sets the price, so it is asked for
  // afterwards, for the handful of pages the draw settled on.
  // A page's own lead image, whatever its licence: the cover of a game, a
  // character's own art. Without this the API only answers with free files,
  // and a card about a comic hero comes back with nothing to show.
  pilicense: 'any',
  cllimit: '500', clshow: '!hidden',
  inprop: 'url'
};
/** PAGE_PROPS for this request: the picture size follows the line. */

export function pageProps() {
  return ({ ...PAGE_PROPS, pithumbsize: thumbSize() });
}

export function pagesOf(data) {
  return (Object.values(data?.query?.pages ?? {}).filter((page) => page?.title));
}
/** A pool of candidates for one search query, sampled across the result set. */

export async function searchPool(query, { preferBig = false } = {}) {
  const cacheKey = `${wikiLang()}|${query}`;
  let offset = 0;
  const known = querySizeCache.get(cacheKey);
  // Famous pages cluster at the top of the ranking, so a fame hunt samples
  // the first few hundred hits; an ordinary draw roams the whole result set.
  const roam = preferBig ? 300 : MAX_SEARCH_OFFSET;
  if (known && known > POOL_LIMIT) {
    const ceiling = Math.min(known, roam) - POOL_LIMIT;
    if (ceiling > 0) offset = Math.max(0, Math.floor(Math.random() * ceiling));
  }

  const params = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: query,
    gsrnamespace: '0', gsrlimit: String(POOL_LIMIT), gsroffset: String(offset),
    gsrinfo: 'totalhits', gsrprop: 'wordcount',
    ...pageProps(), format: 'json', origin: '*'
  });
  const data = await fetchJson(`${ACTION()}?${params}`);
  const totalHits = data?.query?.searchinfo?.totalhits;
  if (Number.isFinite(totalHits)) {
    querySizeCache.set(cacheKey, totalHits);
    if (totalHits === 0) deadQueries.add(cacheKey);
  }
  return pagesOf(data);
}
/** A pool of random articles, for open boosters. Also one request for twenty. */

export async function randomPool() {
  const params = new URLSearchParams({
    action: 'query', generator: 'random',
    grnnamespace: '0', grnlimit: String(POOL_LIMIT),
    ...pageProps(), format: 'json', origin: '*'
  });
  return pagesOf(await fetchJson(`${ACTION()}?${params}`));
}
/** Details for named articles, up to twenty at a time. */

export async function pagesByTitle(titles) {
  if (!titles.length) return [];
  const params = new URLSearchParams({
    action: 'query', titles: titles.slice(0, POOL_LIMIT).join('|'),
    ...pageProps(), format: 'json', origin: '*'
  });
  return pagesOf(await fetchJson(`${ACTION()}?${params}`));
}
/* --- is this page actually about the subject? ---------------------------- */

/**
 * 2 = the page's own categories, title or short description say so.
 * 1 = only its opening text mentions the subject, which is weaker.
 * 0 = nothing lines up; this page does not belong in this booster.
 */

export function subjectScore(pack, page) {
  const terms = pack.match ?? [];
  if (!terms.length) return 2;
  const strong = [page.title, page.description, ...(page.categories ?? []).map((c) => c.title)]
    .join(' ').toLowerCase();
  if (terms.some((term) => strong.includes(term))) return 2;
  return terms.some((term) => String(page.extract ?? '').toLowerCase().includes(term)) ? 1 : 0;
}

export function bestImage(page) {
  return (page.thumbnail?.source ?? page.original?.source ?? null);
}
/** A raw API page turned into a card, or null when it is not card material. */

export function pageToCard(page, views) {
  const thumbnail = bestImage(page);
  if (!thumbnail) return null;
  if (!isUsableText(page.title, page.extract)) return null;
  const lang = wikiLang();
  return toCard({
    sourceId: `wikipedia:${lang}`,
    sourceName: 'Wikipedia',
    pageId: page.pageid,
    title: page.title,
    description: page.description,
    extract: page.extract,
    thumbnail,
    url: page.fullurl ?? `https://${lang}.wikipedia.org/wiki/${encodeTitle(page.title)}`,
    views,
    // The search reports the article's size; until its readership is known,
    // that is what its fame is priced on.
    wordCount: page.wordcount ?? null
  });
}
/* --- pageviews ------------------------------------------------------------ */

/** Month range covering the two most recent complete months. */

export function pageviewRange() {
  const now = new Date();
  const fmt = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}0100`;
  return [
    fmt(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1))),
    fmt(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)))
  ];
}
/**
 * A page's monthly readership, read off the page itself: the thirty daily
 * counts that came back with it, added up. Null when the page carried none,
 * which is a real answer (a page created this week) and not a failure.
 */

export function viewsOf(page) {
  const days = page?.pageviews;
  if (!days || typeof days !== 'object') return null;
  const counts = Object.values(days).filter((n) => Number.isFinite(n));
  if (!counts.length) return null;
  return Math.round(counts.reduce((sum, n) => sum + n, 0));
}
/**
 * Readership for named pages, twenty at a time, one request per twenty.
 * For the repair of cards that were graded while the views request failed.
 */

export async function fetchViewsFor(titles, lang = wikiLang()) {
  const found = new Map();
  for (let i = 0; i < titles.length; i += POOL_LIMIT) {
    const params = new URLSearchParams({
      action: 'query', titles: titles.slice(i, i + POOL_LIMIT).join('|'), redirects: '1',
      prop: 'pageviews', pvipdays: '30', format: 'json', origin: '*'
    });
    const data = await fetchJson(`https://${lang}.wikipedia.org/w/api.php?${params}`);
    // A title that redirected is answered under its target: map it back.
    const back = new Map((data?.query?.redirects ?? []).map((r) => [r.to, r.from]));
    for (const page of pagesOf(data)) {
      const views = viewsOf(page);
      if (views == null) continue;
      found.set(page.title, views);
      if (back.has(page.title)) found.set(back.get(page.title), views);
    }
  }
  return found;
}
/** Average monthly pageviews, or null - a new article legitimately has none. */

export async function fetchMonthlyViews(title) {
  try {
    const [start, end] = pageviewRange();
    const url = `${PAGEVIEWS}/${wikiLang()}.wikipedia/all-access/user/${encodeTitle(title)}/monthly/${start}/${end}`;
    const items = (await fetchJson(url))?.items ?? [];
    if (!items.length) return null;
    return Math.round(items.reduce((sum, item) => sum + (item.views ?? 0), 0) / items.length);
  } catch {
    return null;
  }
}
