/**
 * Data layer. Two sources hide behind one `drawArticles(pack)`:
 *
 *  1. WIKIPEDIA — theme boosters and open boosters, on the Wikipedia of the
 *     language the player chose. Queries are language-specific too (see
 *     src/data/packs.js), so a French booster pulls French articles rather
 *     than English ones with French chrome around them.
 *
 *  2. A SUBJECT'S OWN WIKI — custom boosters. Searching Wikipedia for
 *     "Terraria" yields a handful of pages; the Terraria wiki has thousands.
 *     Fandom runs MediaWiki, so the same action API works once the wiki is
 *     resolved.
 *
 * Everything funnels through `toCard`, so a card has the same shape either way.
 */
import { popularityFromViews, popularityFromWordCount } from './pricing.js';
import { wikiLang, getLanguage } from './i18n.js';

const REQUEST_TIMEOUT_MS = 9000;
const MAX_ATTEMPTS_PER_CARD = 8;
const MAX_SEARCH_OFFSET = 5000;
const SEARCH_PAGE_SIZE = 50;

const REST = () => `https://${wikiLang()}.wikipedia.org/api/rest_v1`;
const ACTION = () => `https://${wikiLang()}.wikipedia.org/w/api.php`;
const PAGEVIEWS = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';

/** query -> total hits, so the counting query is paid for once per session. */
const querySizeCache = new Map();
/** queries that returned nothing, skipped from then on. */
const deadQueries = new Set();
/** normalised custom-pack name -> resolved wiki. */
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

const BAD_TITLE =
  /^(List of|Index of|Outline of|Timeline of|Glossary of|Liste de|Liste des|Chronologie|Portail|Category:|Catégorie:|Template:|Modèle:|File:|Fichier:|Help:|Aide:)/i;
const BAD_SUFFIX = /\((disambiguation|homonymie|surname|given name|nom de famille|prénom)\)$/i;

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
    sourceId, sourceName, pageId, title,
    description: description ?? '',
    extract: extract.trim(),
    thumbnail: thumbnail ?? null,
    url,
    lang: getLanguage(),
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
  return `${ACTION()}?${params}`;
}

/** A random hit for one query, sampled across the whole result set. */
async function searchOne(query) {
  const cacheKey = `${wikiLang()}|${query}`;
  let offset = 0;
  const known = querySizeCache.get(cacheKey);
  if (known && known > SEARCH_PAGE_SIZE) {
    const ceiling = Math.min(known, MAX_SEARCH_OFFSET) - SEARCH_PAGE_SIZE;
    offset = Math.max(0, Math.floor(Math.random() * ceiling));
  }

  const data = await fetchJson(searchUrl(query, offset));
  const totalHits = data?.query?.searchinfo?.totalhits ?? 0;
  querySizeCache.set(cacheKey, totalHits);

  const results = data?.query?.search ?? [];
  if (!results.length) {
    if (totalHits === 0) deadQueries.add(cacheKey);
    return null;
  }
  return pick(results);
}

/** Month range covering the two most recent complete months. */
function pageviewRange() {
  const now = new Date();
  const fmt = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}0100`;
  return [
    fmt(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1))),
    fmt(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)))
  ];
}

/** Average monthly pageviews, or null — a new article legitimately has none. */
async function fetchMonthlyViews(title) {
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

const summaryFor = (title) => fetchJson(`${REST()}/page/summary/${encodeTitle(title)}`);

function summaryToCard(summary, wordCount, views) {
  const lang = wikiLang();
  return toCard({
    sourceId: `wikipedia:${lang}`,
    sourceName: 'Wikipedia',
    pageId: summary.pageid,
    title: summary.titles?.normalized ?? summary.title,
    description: summary.description,
    extract: summary.extract,
    thumbnail: summary.thumbnail?.source ?? summary.originalimage?.source ?? null,
    url: summary.content_urls?.desktop?.page ??
      `https://${lang}.wikipedia.org/wiki/${encodeTitle(summary.title)}`,
    views, wordCount
  });
}

async function drawWikipediaCard(pack, seen) {
  const live = (pack.queries ?? []).filter((q) => !deadQueries.has(`${wikiLang()}|${q}`));

  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_CARD; attempt++) {
    try {
      let summary = null;
      let wordCount = null;
      // The search hit already names the article, so its pageviews can be
      // fetched alongside the summary — one fewer round trip per card.
      let viewsPromise = null;

      // The final two attempts fall back to a fully random article, so a
      // renamed category can never leave a booster unopenable.
      const useQuery = live.length > 0 && attempt < MAX_ATTEMPTS_PER_CARD - 2;

      if (useQuery) {
        const hit = await searchOne(pick(live));
        if (!hit || seen.has(hit.title)) continue;
        wordCount = hit.wordcount ?? null;
        viewsPromise = fetchMonthlyViews(hit.title);
        summary = await summaryFor(hit.title);
      } else {
        summary = await fetchJson(`${REST()}/page/random/summary`);
      }

      if (!summary || summary.type !== 'standard') continue;
      const title = summary.titles?.normalized ?? summary.title;
      if (!isUsableText(title, summary.extract) || seen.has(title)) continue;
      seen.add(title);

      const views = viewsPromise ? await viewsPromise : await fetchMonthlyViews(title);
      return summaryToCard(summary, wordCount, views);
    } catch (err) {
      if (attempt === MAX_ATTEMPTS_PER_CARD - 1) throw err;
    }
  }
  throw new Error(`No usable article found for "${pack.name}"`);
}

/* --- pack art ------------------------------------------------------------ */

/**
 * Lead photographs for the boosters, fetched in ONE request for all of them.
 * Returns a Map of requested title -> image URL; titles with no image are
 * absent and the caller falls back to the booster's drawn icon.
 */
export async function fetchPackArt(titles) {
  const art = new Map();
  if (!titles.length) return art;

  const params = new URLSearchParams({
    action: 'query', titles: titles.join('|'), redirects: '1',
    prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '640',
    format: 'json', origin: '*'
  });
  const query = (await fetchJson(`${ACTION()}?${params}`))?.query ?? {};

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

/* --- custom wikis -------------------------------------------------------- */

/**
 * Subdomain guesses for a typed subject. Input is deliberately forgiving:
 * "Terraria", "terraria" and "TERRARIA" all normalise to the same candidates.
 */
export function candidateSlugs(name) {
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const noThe = cleaned.replace(/^(the|le|la|les)\s+/, '');
  const forms = new Set();
  for (const base of [cleaned, noThe]) {
    if (!base) continue;
    forms.add(base.replace(/[\s-]+/g, ''));
    forms.add(base.replace(/\s+/g, '-'));
  }
  return [...forms].filter(Boolean).slice(0, 6);
}

/** A wiki counts as real only if MediaWiki answers AND it has content. */
async function probeWiki(apiUrl) {
  const params = new URLSearchParams({
    action: 'query', meta: 'siteinfo', siprop: 'general|statistics',
    format: 'json', origin: '*'
  });
  const data = await fetchJson(`${apiUrl}?${params}`);
  const general = data?.query?.general;
  const stats = data?.query?.statistics;
  if (!general?.sitename) return null;
  if ((stats?.articles ?? 0) < 40) return null;
  const absolute = (u) => (u?.startsWith('//') ? `https:${u}` : u) || null;
  return {
    apiUrl,
    sitename: general.sitename,
    server: absolute(general.server),
    articlePath: general.articlepath ?? '/wiki/$1',
    mainPage: general.mainpage ?? null,
    logo: absolute(general.logo),
    articles: stats.articles
  };
}

/** Fandom's cross-wiki search, for subjects whose slug isn't guessable. */
async function searchFandom(name) {
  const params = new URLSearchParams({ string: name.trim(), limit: '6', batch: '1' });
  const items = (await fetchJson(`https://community.fandom.com/api/v1/Wikis/ByString?${params}`))?.items ?? [];
  return items
    .map((item) => item.url || (item.domain ? `https://${item.domain}` : null))
    .filter(Boolean)
    .map((url) => `${url.replace(/\/+$/, '')}/api.php`);
}

/**
 * Find the wiki dedicated to a subject, in the player's language.
 *
 * Fandom puts non-English communities on a language path
 * (`terraria.fandom.com/fr/api.php`), so those are tried first and the English
 * community is only the fallback — a French booster should hold French cards.
 */
export async function resolveCustomWiki(name) {
  const lang = getLanguage();
  const normalised = `${lang}|${name.trim().toLowerCase().replace(/\s+/g, ' ')}`;
  if (!normalised.endsWith('|')) {
    if (wikiCache.has(normalised)) return wikiCache.get(normalised);
  }

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
  const accept = (wiki) => {
    wikiCache.set(normalised, wiki);
    return wiki;
  };

  for (const slug of candidateSlugs(name)) {
    // Language path first when we aren't in English.
    if (lang !== 'en') {
      const localised = await attempt(`https://${slug}.fandom.com/${lang}/api.php`);
      if (localised) return accept(localised);
    }
    const wiki = await attempt(`https://${slug}.fandom.com/api.php`);
    if (wiki) return accept(wiki);
  }

  try {
    for (const apiUrl of await searchFandom(name)) {
      if (lang !== 'en') {
        const localised = await attempt(apiUrl.replace(/\/api\.php$/, `/${lang}/api.php`));
        if (localised) return accept(localised);
      }
      const wiki = await attempt(apiUrl);
      if (wiki) return accept(wiki);
    }
  } catch {
    // Cross-wiki search is best-effort.
  }

  throw new Error('NO_WIKI');
}

/** Strip HTML to plain text, for wikis without the TextExtracts API. */
function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('table, style, script, sup, .infobox, .navbox').forEach((n) => n.remove());
  const p = [...doc.querySelectorAll('p')].map((n) => n.textContent.trim()).find((t) => t.length > 80);
  return (p ?? doc.body.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
}

/** File names that are chrome rather than illustration. */
const JUNK_IMAGE =
  /(icon|logo|wiki-wordmark|favicon|badge|stub|placeholder|button|sprite|ui[-_]|site-?background|community|discord|twitter|facebook|edit|arrow|bullet|spacer|blank|transparent|nav|banner|header|footer)/i;

/** Below this, an image is chrome or a sprite, not a picture of anything. */
const MIN_IMAGE_EDGE = 180;
const MIN_IMAGE_AREA = 60000;

/**
 * Ask a Fandom image URL for a bigger version of itself.
 *
 * Fandom serves images through a resizing CDN, and the URL says what size you
 * are getting: `/revision/latest/scale-to-width-down/50` is a fifty-pixel
 * thumbnail. Dropped straight into a 300px card slot that is the blurry,
 * over-zoomed mess it looks like. Rewriting the width asks the CDN for a
 * usable size instead, and stripping a `smart` crop stops the CDN returning a
 * hard-cropped square where the subject has been cut in half.
 */
function upgradeImageUrl(url, width = 640) {
  if (typeof url !== 'string' || !url) return url;
  if (!/static\.wikia\.nocookie\.net|\/revision\/latest/.test(url)) return url;
  return url
    .replace(/\/scale-to-width-down\/\d+/, `/scale-to-width-down/${width}`)
    .replace(/\/scale-to-width\/\d+/, `/scale-to-width/${width}`)
    .replace(/\/smart\/width\/\d+\/height\/\d+/, `/scale-to-width-down/${width}`)
    .replace(/\/window-crop\/width\/\d+\/[^?]*/, `/scale-to-width-down/${width}`);
}

/** A thumbnail the API gave us, only if it is actually big enough to use. */
function usableThumb(page, width = 640) {
  const thumb = page?.thumbnail;
  if (!thumb?.source) return null;
  // pageimages reports the size it produced. A 60px one is a favicon.
  if (Number.isFinite(thumb.width) && thumb.width < MIN_IMAGE_EDGE) {
    // It may still be a big picture served small: ask for it larger and check.
    const bigger = upgradeImageUrl(thumb.source, width);
    return bigger !== thumb.source ? bigger : null;
  }
  return upgradeImageUrl(thumb.source, width);
}

/**
 * Resolve an image for a page the hard way.
 *
 * Fandom pages very often have a picture that `pageimages` doesn't surface, so
 * when it comes back empty we ask what images the page actually *uses*. That
 * list is in page order, which is why taking the first one so often produced
 * the wrong picture: the first image on a Fandom article is usually a nav
 * icon or an infobox glyph. We ask for each image's real dimensions instead,
 * throw away anything too small to be an illustration, and take the largest.
 */
async function customPageImage(wiki, pageId) {
  try {
    const params = new URLSearchParams({
      action: 'query', pageids: String(pageId), generator: 'images', gimlimit: '24',
      prop: 'imageinfo', iiprop: 'url|size|mime', iiurlwidth: '640',
      format: 'json', origin: '*'
    });
    const pages = Object.values((await fetchJson(`${wiki.apiUrl}?${params}`))?.query?.pages ?? {});
    const usable = pages
      .map((p) => ({ title: p.title ?? '', info: p.imageinfo?.[0] }))
      .filter(({ title, info }) => info && title && !JUNK_IMAGE.test(title))
      .filter(({ title, info }) =>
        /^image\/(jpeg|png|webp)$/i.test(info.mime ?? '') || /\.(jpe?g|png|webp)$/i.test(title))
      .filter(({ info }) => {
        const w = info.width ?? 0;
        const h = info.height ?? 0;
        // No dimensions reported: keep it rather than lose a good picture.
        if (!w || !h) return true;
        if (w < MIN_IMAGE_EDGE || h < MIN_IMAGE_EDGE * 0.6) return false;
        // Long thin strips are page furniture, whatever they are called.
        if (w / h > 4 || h / w > 4) return false;
        return w * h >= MIN_IMAGE_AREA;
      })
      // Biggest wins: on a Fandom article that is reliably the subject.
      .sort((a, b) => (b.info.width ?? 0) * (b.info.height ?? 0) - (a.info.width ?? 0) * (a.info.height ?? 0));

    const best = usable[0]?.info;
    if (!best) return null;
    return upgradeImageUrl(best.thumburl ?? best.url, 640);
  } catch {
    return null;
  }
}

/** A representative image for a custom booster's pack art. */
export async function fetchCustomPackArt(wiki) {
  // The main page usually carries the wiki's best hero image.
  if (wiki.mainPage) {
    try {
      const params = new URLSearchParams({
        action: 'query', titles: wiki.mainPage, prop: 'pageimages',
        piprop: 'thumbnail|original', pithumbsize: '640', format: 'json', origin: '*'
      });
      const page = Object.values((await fetchJson(`${wiki.apiUrl}?${params}`))?.query?.pages ?? {})[0];
      const art = usableThumb(page, 640) ?? (page?.original?.source
        ? upgradeImageUrl(page.original.source, 640) : null);
      if (art) return art;
    } catch { /* fall through */ }
  }

  // Otherwise take the first random page that has a picture.
  try {
    const params = new URLSearchParams({
      action: 'query', generator: 'random', grnnamespace: '0', grnlimit: '16',
      prop: 'pageimages', piprop: 'thumbnail|original', pithumbsize: '640',
      format: 'json', origin: '*'
    });
    const pages = Object.values((await fetchJson(`${wiki.apiUrl}?${params}`))?.query?.pages ?? {});
    for (const page of pages) {
      const art = usableThumb(page, 640);
      if (art) return art;
    }
    // Nothing surfaced a thumbnail: go digging on the first couple of pages.
    for (const page of pages.slice(0, 3)) {
      const deep = await customPageImage(wiki, page.pageid);
      if (deep) return deep;
    }
  } catch { /* fall through */ }

  return wiki.logo ?? null;
}

async function customPageDetail(wiki, pageId) {
  const params = new URLSearchParams({
    action: 'query', pageids: String(pageId),
    prop: 'extracts|pageimages|info',
    exintro: '1', explaintext: '1', exchars: '600',
    piprop: 'thumbnail|original', pithumbsize: '640', inprop: 'url',
    format: 'json', origin: '*'
  });
  return (await fetchJson(`${wiki.apiUrl}?${params}`))?.query?.pages?.[pageId] ?? null;
}

/** Fallback for wikis without TextExtracts: parse the lead section as HTML. */
async function customLeadText(wiki, pageId) {
  const params = new URLSearchParams({
    action: 'parse', pageid: String(pageId), prop: 'text', section: '0',
    format: 'json', origin: '*'
  });
  const html = (await fetchJson(`${wiki.apiUrl}?${params}`))?.parse?.text?.['*'];
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
      const candidates = ((await fetchJson(`${wiki.apiUrl}?${params}`))?.query?.random ?? [])
        .filter((r) => !seen.has(r.title));
      if (!candidates.length) continue;

      const choice = pick(candidates);
      const page = await customPageDetail(wiki, choice.id);
      if (!page) continue;

      let extract = page.extract?.trim();
      if (!extract || extract.length < 80) extract = await customLeadText(wiki, choice.id);
      if (!isUsableText(page.title, extract) || seen.has(page.title)) continue;
      seen.add(page.title);

      // pageimages misses a lot on Fandom, and what it does return is often
      // a fifty-pixel icon, so a too-small thumbnail is treated as no
      // thumbnail and we go digging rather than stretch it across the card.
      const thumbnail = usableThumb(page, 640)
        ?? (page.original?.source ? upgradeImageUrl(page.original.source, 640) : null)
        ?? await customPageImage(wiki, page.pageid);

      return toCard({
        sourceId: `wiki:${new URL(wiki.apiUrl).host}${new URL(wiki.apiUrl).pathname.replace('/api.php', '')}`,
        sourceName: wiki.sitename,
        pageId: page.pageid,
        title: page.title,
        description: pack.name,
        extract,
        thumbnail,
        url: page.fullurl ?? `${wiki.server}${wiki.articlePath.replace('$1', encodeTitle(page.title))}`,
        views: null,
        // No pageview API on Fandom, so page size stands in for popularity.
        wordCount: page.length ? Math.round(page.length / 6) : null
      });
    } catch (err) {
      if (attempt === MAX_ATTEMPTS_PER_CARD - 1) throw err;
    }
  }
  throw new Error(`No usable page found on ${wiki.sitename}`);
}

/* --- public API ---------------------------------------------------------- */

/**
 * Draw a booster's worth of articles. Titles are de-duplicated within the
 * booster; duplicates across boosters are kept and counted as copies.
 */
export async function drawArticles(pack) {
  const seen = new Set();
  const draw = pack.source === 'custom' ? drawCustomCard : drawWikipediaCard;
  return Promise.all(Array.from({ length: pack.cards }, () => draw(pack, seen)));
}
