/**
 * Wikipedia data layer.
 *
 * Two endpoints are used, both CORS-enabled so this works straight from the
 * browser with no backend and no API key:
 *
 *   REST   /api/rest_v1/page/random/summary   -> a random article summary
 *   REST   /api/rest_v1/page/summary/{title}  -> one article's summary
 *   ACTION /w/api.php?list=search&srsearch=incategory:"X"
 *                                             -> titles inside a category
 *
 * Everything funnels through `summaryToCard`, so a card always has the same
 * shape regardless of which pack drew it.
 */

const LANG = 'en';
const REST = `https://${LANG}.wikipedia.org/api/rest_v1`;
const ACTION = `https://${LANG}.wikipedia.org/w/api.php`;

const REQUEST_TIMEOUT_MS = 8000;
/** Attempts per card before that card slot gives up and reports an error. */
const MAX_ATTEMPTS_PER_CARD = 8;
/** The action API refuses very large offsets; stay well inside the limit. */
const MAX_SEARCH_OFFSET = 5000;
const SEARCH_PAGE_SIZE = 50;

/** category -> total hits, so we only pay for the counting query once. */
const categorySizeCache = new Map();
/** category -> known-bad marker, so a dead category is skipped after one try. */
const deadCategories = new Set();

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`Wikipedia responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reject the things that make a bad trading card: disambiguation pages, list
 * and index pages, redirects to nothing, and articles with no real prose.
 */
function isUsableSummary(summary) {
  if (!summary || summary.type !== 'standard') return false;
  if (!summary.extract || summary.extract.trim().length < 80) return false;
  const title = summary.title ?? '';
  if (/^(List of|Index of|Outline of|Timeline of|Glossary of)\b/i.test(title)) return false;
  if (/\((disambiguation|surname|given name)\)$/i.test(title)) return false;
  return true;
}

function summaryToCard(summary) {
  return {
    pageId: summary.pageid,
    title: summary.titles?.normalized ?? summary.title,
    description: summary.description ?? '',
    extract: summary.extract,
    thumbnail: summary.thumbnail?.source ?? summary.originalimage?.source ?? null,
    url:
      summary.content_urls?.desktop?.page ??
      `https://${LANG}.wikipedia.org/wiki/${encodeURIComponent(summary.title)}`
  };
}

/** A random article from anywhere in the encyclopedia. */
async function drawRandomSummary() {
  return fetchJson(`${REST}/page/random/summary`);
}

async function fetchSummaryByTitle(title) {
  // The REST router decodes the path segment once, so a slash inside a title
  // has to be double-encoded (%2F -> %252F) to survive as part of the title.
  const path = encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/gi, '%252F');
  return fetchJson(`${REST}/page/summary/${path}`);
}

function searchUrl(category, offset) {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: `incategory:"${category}"`,
    srnamespace: '0',
    srlimit: String(SEARCH_PAGE_SIZE),
    sroffset: String(offset),
    srinfo: 'totalhits',
    srprop: '',
    format: 'json',
    origin: '*'
  });
  return `${ACTION}?${params}`;
}

/**
 * A random title from a category. Deep categories are sampled with a random
 * offset so repeated packs don't keep serving the same first 50 results.
 */
async function drawTitleFromCategory(category) {
  let offset = 0;
  const knownSize = categorySizeCache.get(category);
  if (knownSize && knownSize > SEARCH_PAGE_SIZE) {
    const ceiling = Math.min(knownSize, MAX_SEARCH_OFFSET) - SEARCH_PAGE_SIZE;
    offset = Math.max(0, Math.floor(Math.random() * ceiling));
  }

  const data = await fetchJson(searchUrl(category, offset));
  const totalHits = data?.query?.searchinfo?.totalhits ?? 0;
  categorySizeCache.set(category, totalHits);

  const results = data?.query?.search ?? [];
  if (!results.length) {
    if (totalHits === 0) deadCategories.add(category);
    return null;
  }
  return pick(results).title;
}

/**
 * Draw one usable card for a pack, retrying past disambiguation pages, stubs
 * and duplicates. Category packs fall back to a random article rather than
 * failing outright, so a renamed or emptied category can never brick a pack.
 */
async function drawCard(pack, seenTitles) {
  const liveCategories = pack.categories.filter((c) => !deadCategories.has(c));

  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_CARD; attempt++) {
    try {
      let summary = null;

      // The last two attempts always fall back to a random article.
      const useCategory =
        pack.source === 'category' &&
        liveCategories.length > 0 &&
        attempt < MAX_ATTEMPTS_PER_CARD - 2;

      if (useCategory) {
        const title = await drawTitleFromCategory(pick(liveCategories));
        if (!title) continue;
        if (seenTitles.has(title)) continue;
        summary = await fetchSummaryByTitle(title);
      } else {
        summary = await drawRandomSummary();
      }

      if (!isUsableSummary(summary)) continue;

      const card = summaryToCard(summary);
      // Single-threaded: this check-then-add is atomic across parallel draws.
      if (seenTitles.has(card.title)) continue;
      seenTitles.add(card.title);
      return card;
    } catch (err) {
      // Network hiccup or a 404 on a title the search index hadn't caught up
      // with -- just try again with a fresh draw.
      if (attempt === MAX_ATTEMPTS_PER_CARD - 1) throw err;
    }
  }

  throw new Error(`Could not find a usable article for "${pack.name}"`);
}

/**
 * Draw a full pack's worth of articles in parallel.
 * Titles are deduplicated within the pack (but not across packs -- see README).
 */
export async function drawArticles(pack) {
  const seenTitles = new Set();
  const draws = Array.from({ length: pack.cards }, () => drawCard(pack, seenTitles));
  return Promise.all(draws);
}
