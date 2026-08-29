/**
 * Data layer. Two very different sources hide behind one `drawArticles(pack)`:
 *
 *  1. WIKIPEDIA — theme packs and rarity packs.
 *     REST   /page/random/summary          a random article
 *     REST   /page/summary/{title}         one article's summary
 *     ACTION list=search&srsearch=…        titles matching a pack query
 *     REST   metrics/pageviews/per-article monthly views, which drive price
 *                                          and the rarity roll
 *
 *  2. A SUBJECT'S OWN WIKI — custom packs.
 *     Searching Wikipedia for "Terraria" yields a handful of pages. The
 *     Terraria wiki has thousands. So a custom pack resolves the subject's
 *     dedicated wiki first (resolveCustomWiki) and then draws from it with the
 *     same MediaWiki action API, since Fandom runs MediaWiki too.
 *
 * Everything funnels through `toCard`, so a card has the same shape either way.
 */
import { popularityFromViews, popularityFromWordCount } from './pricing.js';

const LANG = 'en';
const REST = `https://${LANG}.wikipedia.org/api/rest_v1`;
const ACTION = `https://${LANG}.wikipedia.org/w/api.php`;
const PAGEVIEWS = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';

const REQUEST_TIMEOUT_MS = 9000;
const MAX_ATTEMPTS_PER_CARD = 8;
const MAX_SEARCH_OFFSET = 5000;
const SEARCH_PAGE_SIZE = 50;

/** query -> total hits, so the counting query is paid for once per session. */
const querySizeCache = new Map();
/** queries that returned nothing, skipped from then on. */
const deadQueries = new Set();
/** normalised custom-pack name -> resolved wiki, so re-creating is instant. */
const wikiCache = new Map();

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Wiki responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** MediaWiki decodes a path segment once, so a slash in a title needs %252F. */
const encodeTitle = (title) =>
  encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/gi, '%252F');

/* --- shared filtering ---------------------------------------------------- */

const BAD_TITLE = /^(List of|Index of|Outline of|Timeline of|Glossary of|Category:|Template:|File:|Help:)/i;
const BAD_SUFFIX = /\((disambiguation|surname|given name)\)$/i;

function isUsableText(title, extract) {
  if (!title || BAD_TITLE.test(title) || BAD_SUFFIX.test(title)) return false;
  if (!extract || extract.trim().length < 80) return false;
  return true;
}

function toCard({ sourceId, sourceName, pageId, title, description, extract, thumbnail, url, views, wordCount }) {
  const popularity = Number.isFinite(views) && views > 0
    ? popularityFromViews(views)
    : popularityFromWordCount(wordCount);
  return {
    key: `${sourceId}:${pageId ?? title}`,
    sourceId,
    sourceName,
    pageId,
    title,
    description: description ?? '',
    extract: extract.trim(),
    thumbnail: thumbnail ?? null,
    url,
    views: Number.isFinite(views) ? views : null,
    wordCount: wordCount ?? null,
    popularity
  };
}

/* --- Wikipedia ----------------------------------------------------------- */

function searchUrl(query, offset) {
  const params = new URLSearchParams({
    action: 'query', list: 'search', srsearch: query,
    srnamespace: '0', srlimit: String(SEARCH_PAGE_SIZE), sroffset: String(offset),
    srinfo: 'totalhits', srprop: 'wordcount', format: 'json', origin: '*'
  });
  return `${ACTION}?${params}`;
}

/**
 * A random hit for one pack query. Deep queries would otherwise always serve
 * the same first 50 results, so the total is cached and re-queried at a random
 * offset to sample the whole result set.
 */
async function searchOne(query) {
  let offset = 0;
  const known = querySizeCache.get(query);
  if (known && known > SEARCH_PAGE_SIZE) {
    const ceiling = Math.min(known, MAX_SEARCH_OFFSET) - SEARCH_PAGE_SIZE;
    offset = Math.max(0, Math.floor(Math.random() * ceiling));
  }

  const data = await fetchJson(searchUrl(query, offset));
  const totalHits = data?.query?.searchinfo?.totalhits ?? 0;
  querySizeCache.set(query, totalHits);

  const results = data?.query?.search ?? [];
  if (!results.length) {
    if (totalHits === 0) deadQueries.add(query);
    return null;
  }
  return pick(results);
}

/** Month range covering the two most recent complete months. */
function pageviewRange() {
  const now = new Date();
  const fmt = (d) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}0100`;
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  return [fmt(start), fmt(end)];
}

/**
 * Average monthly pageviews. Returns null rather than throwing — a redirect or
 * a brand-new article legitimately has no stats, and the caller falls back to
 * article length.
 */
async function fetchMonthlyViews(title) {
  try {
    const [start, end] = pageviewRange();
    const url = `${PAGEVIEWS}/${LANG}.wikipedia/all-access/user/${encodeTitle(title)}/monthly/${start}/${end}`;
    const data = await fetchJson(url);
    const items = data?.items ?? [];
    if (!items.length) return null;
    const total = items.reduce((sum, item) => sum + (item.views ?? 0), 0);
    return Math.round(total / items.length);
  } catch {
    return null;
  }
}

async function summaryFor(title) {
  return fetchJson(`${REST}/page/summary/${encodeTitle(title)}`);
}

function summaryToCard(summary, wordCount, views) {
  return toCard({
    sourceId: 'wikipedia',
    sourceName: 'Wikipedia',
    pageId: summary.pageid,
    title: summary.titles?.normalized ?? summary.title,
    description: summary.description,
    extract: summary.extract,
    thumbnail: summary.thumbnail?.source ?? summary.originalimage?.source ?? null,
    url: summary.content_urls?.desktop?.page ??
      `https://${LANG}.wikipedia.org/wiki/${encodeTitle(summary.title)}`,
    views,
    wordCount
  });
}

async function drawWikipediaCard(pack, seen) {
  const liveQueries = (pack.queries ?? []).filter((q) => !deadQueries.has(q));

  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_CARD; attempt++) {
    try {
      let summary = null;
      let wordCount = null;

      // The final two attempts always fall back to a fully random article, so
      // a renamed category can never leave a pack unopenable.
      const useQuery = liveQueries.length > 0 && attempt < MAX_ATTEMPTS_PER_CARD - 2;

      // The search hit already names the article, so its pageviews can be
      // fetched alongside the summary rather than after it — one fewer round
      // trip per card, which is most of the wait before a pack opens.
      let viewsPromise = null;

      if (useQuery) {
        const hit = await searchOne(pick(liveQueries));
        if (!hit || seen.has(hit.title)) continue;
        wordCount = hit.wordcount ?? null;
        viewsPromise = fetchMonthlyViews(hit.title);
        summary = await summaryFor(hit.title);
      } else {
        summary = await fetchJson(`${REST}/page/random/summary`);
      }

      if (!summary || summary.type !== 'standard') continue;
      const title = summary.titles?.normalized ?? summary.title;
      if (!isUsableText(title, summary.extract)) continue;
      if (seen.has(title)) continue;
      seen.add(title);

      // On the query path views are already in flight for the search hit's
      // title (which redirects rarely change); only the random path needs a
      // fresh lookup here.
      const views = viewsPromise ? await viewsPromise : await fetchMonthlyViews(title);
      return summaryToCard(summary, wordCount, views);
    } catch (err) {
      if (attempt === MAX_ATTEMPTS_PER_CARD - 1) throw err;
    }
  }
  throw new Error(`Could not find a usable article for "${pack.name}"`);
}

/**
 * Lead photographs for the booster packs, fetched in ONE request for all of
 * them. Returns a Map of requested title -> image URL; titles with no image
 * are simply absent and the caller falls back to the pack's drawn icon.
 */
export async function fetchPackArt(titles) {
  const art = new Map();
  if (!titles.length) return art;

  const params = new URLSearchParams({
    action: 'query', titles: titles.join('|'), redirects: '1',
    prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '640',
    format: 'json', origin: '*'
  });

  const data = await fetchJson(`${ACTION}?${params}`);
  const query = data?.query ?? {};

  // MediaWiki rewrites titles twice on the way in (capitalisation, then
  // redirects), so follow both chains to get back to what we asked for.
  const rename = new Map();
  for (const list of [query.normalized ?? [], query.redirects ?? []]) {
    for (const { from, to } of list) rename.set(from, to);
  }
  const resolve = (title) => {
    let current = title;
    for (let hop = 0; hop < 4 && rename.has(current); hop++) current = rename.get(current);
    return current;
  };

  const byTitle = new Map();
  for (const page of Object.values(query.pages ?? {})) {
    if (page.thumbnail?.source) byTitle.set(page.title, page.thumbnail.source);
  }

  for (const title of titles) {
    const image = byTitle.get(resolve(title));
    if (image) art.set(title, image);
  }
  return art;
}

/** A representative image for a custom pack: the wiki's logo, else a page. */
export async function fetchCustomPackArt(wiki) {
  if (wiki.logo) return wiki.logo;
  try {
    const params = new URLSearchParams({
      action: 'query', generator: 'random', grnnamespace: '0', grnlimit: '10',
      prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '640',
      format: 'json', origin: '*'
    });
    const data = await fetchJson(`${wiki.apiUrl}?${params}`);
    const page = Object.values(data?.query?.pages ?? {}).find((p) => p.thumbnail?.source);
    return page?.thumbnail?.source ?? null;
  } catch {
    return null;
  }
}

/* --- custom wikis -------------------------------------------------------- */

/**
 * Subdomain guesses for a typed subject. Input is deliberately forgiving:
 * "Terraria", "terraria" and "TERRARIA" all normalise to the same candidates.
 */
export function candidateSlugs(name) {
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const noThe = cleaned.replace(/^the\s+/, '');
  const forms = new Set();
  for (const base of [cleaned, noThe]) {
    if (!base) continue;
    forms.add(base.replace(/[\s-]+/g, ''));   // terraria, harrypotter
    forms.add(base.replace(/\s+/g, '-'));      // harry-potter
  }
  return [...forms].filter(Boolean).slice(0, 6);
}

/** A wiki counts as real only if MediaWiki answers AND it has actual content. */
async function probeWiki(apiUrl) {
  const params = new URLSearchParams({
    action: 'query', meta: 'siteinfo', siprop: 'general|statistics',
    format: 'json', origin: '*'
  });
  const data = await fetchJson(`${apiUrl}?${params}`);
  const general = data?.query?.general;
  const stats = data?.query?.statistics;
  if (!general?.sitename) return null;
  if ((stats?.articles ?? 0) < 40) return null; // empty/abandoned wiki
  const logo = general.logo?.startsWith('//') ? `https:${general.logo}` : general.logo;
  return {
    apiUrl,
    sitename: general.sitename,
    logo: logo ?? null,
    server: general.server?.startsWith('//') ? `https:${general.server}` : general.server,
    articlePath: general.articlepath ?? '/wiki/$1',
    articles: stats.articles
  };
}

/** Fandom's cross-wiki search, for subjects whose slug isn't guessable. */
async function searchFandom(name) {
  const params = new URLSearchParams({ string: name.trim(), limit: '6', batch: '1' });
  const data = await fetchJson(`https://community.fandom.com/api/v1/Wikis/ByString?${params}`);
  const items = data?.items ?? [];
  return items
    .map((item) => item.url || (item.domain ? `https://${item.domain}` : null))
    .filter(Boolean)
    .map((url) => `${url.replace(/\/+$/, '')}/api.php`);
}

/**
 * Find the wiki dedicated to a subject. Tries guessed Fandom subdomains first
 * (cheap and correct for most things), then Fandom's own search.
 *
 * Throws when nothing usable is found, which the UI reports as
 * "Booster cannot be created".
 */
export async function resolveCustomWiki(name) {
  const normalised = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalised) throw new Error('Type a name first.');
  if (wikiCache.has(normalised)) return wikiCache.get(normalised);

  const tried = new Set();
  const attempt = async (apiUrl) => {
    if (tried.has(apiUrl)) return null;
    tried.add(apiUrl);
    try {
      return await probeWiki(apiUrl);
    } catch {
      return null;
    }
  };

  for (const slug of candidateSlugs(name)) {
    const wiki = await attempt(`https://${slug}.fandom.com/api.php`);
    if (wiki) {
      wikiCache.set(normalised, wiki);
      return wiki;
    }
  }

  try {
    for (const apiUrl of await searchFandom(name)) {
      const wiki = await attempt(apiUrl);
      if (wiki) {
        wikiCache.set(normalised, wiki);
        return wiki;
      }
    }
  } catch {
    // Cross-wiki search is best-effort; fall through to the error below.
  }

  throw new Error('NO_WIKI');
}

/** Strip HTML down to plain text, for wikis without the TextExtracts API. */
function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('table, style, script, sup, .infobox, .navbox').forEach((n) => n.remove());
  const p = [...doc.querySelectorAll('p')].map((n) => n.textContent.trim()).find((t) => t.length > 80);
  return (p ?? doc.body.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
}

async function customPageDetail(wiki, pageId) {
  const params = new URLSearchParams({
    action: 'query', pageids: String(pageId),
    prop: 'extracts|pageimages|info',
    exintro: '1', explaintext: '1', exchars: '600',
    piprop: 'thumbnail', pithumbsize: '480', inprop: 'url',
    format: 'json', origin: '*'
  });
  const data = await fetchJson(`${wiki.apiUrl}?${params}`);
  return data?.query?.pages?.[pageId] ?? null;
}

/** Fallback for wikis without TextExtracts: parse the lead section as HTML. */
async function customLeadText(wiki, pageId) {
  const params = new URLSearchParams({
    action: 'parse', pageid: String(pageId), prop: 'text', section: '0',
    format: 'json', origin: '*'
  });
  const data = await fetchJson(`${wiki.apiUrl}?${params}`);
  const html = data?.parse?.text?.['*'];
  return html ? htmlToText(html) : null;
}

async function drawCustomCard(pack, seen) {
  const wiki = pack.wiki;

  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_CARD; attempt++) {
    try {
      const params = new URLSearchParams({
        action: 'query', list: 'random', rnnamespace: '0', rnlimit: '6',
        format: 'json', origin: '*'
      });
      const data = await fetchJson(`${wiki.apiUrl}?${params}`);
      const candidates = (data?.query?.random ?? []).filter((r) => !seen.has(r.title));
      if (!candidates.length) continue;

      const choice = pick(candidates);
      const page = await customPageDetail(wiki, choice.id);
      if (!page) continue;

      let extract = page.extract?.trim();
      if (!extract || extract.length < 80) {
        extract = await customLeadText(wiki, choice.id);
      }
      if (!isUsableText(page.title, extract)) continue;
      if (seen.has(page.title)) continue;
      seen.add(page.title);

      return toCard({
        sourceId: `wiki:${new URL(wiki.apiUrl).host}`,
        sourceName: wiki.sitename,
        pageId: page.pageid,
        title: page.title,
        description: pack.name,
        extract,
        thumbnail: page.thumbnail?.source ?? null,
        url: page.fullurl ?? `${wiki.server}${wiki.articlePath.replace('$1', encodeTitle(page.title))}`,
        views: null,
        // No pageview API on Fandom, so page size stands in for popularity.
        wordCount: page.length ? Math.round(page.length / 6) : null
      });
    } catch (err) {
      if (attempt === MAX_ATTEMPTS_PER_CARD - 1) throw err;
    }
  }
  throw new Error(`Could not find a usable page on ${wiki.sitename}`);
}

/* --- public API ---------------------------------------------------------- */

/**
 * Draw a full pack's worth of articles. Titles are de-duplicated within the
 * pack; duplicates ACROSS packs are kept, and tracked as copies in the
 * collection.
 */
export async function drawArticles(pack) {
  const seen = new Set();
  const draw = pack.source === 'custom' ? drawCustomCard : drawWikipediaCard;
  return Promise.all(
    Array.from({ length: pack.cards }, () => draw(pack, seen))
  );
}
