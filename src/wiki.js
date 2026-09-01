/**
 * Data layer. Two sources hide behind one `drawArticles(pack)`:
 *
 *  1. WIKIPEDIA - theme boosters and open boosters, on the Wikipedia of the
 *     language the player chose. Queries are language-specific too (see
 *     src/data/packs.js), so a French booster pulls French articles rather
 *     than English ones with French chrome around them.
 *
 *  2. A SUBJECT'S OWN WIKI - custom boosters. Searching Wikipedia for
 *     "Terraria" yields a handful of pages; the Terraria wiki has thousands.
 *     Fandom runs MediaWiki, so the same action API works once the wiki is
 *     resolved.
 *
 * Everything funnels through `toCard`, so a card has the same shape either way.
 */
import { popularityFromViews, popularityFromWordCount } from './pricing.js';
import { wikiLang, getLanguage } from './i18n.js';

const REQUEST_TIMEOUT_MS = 7000;

/**
 * How long a whole booster may spend drawing before it gives up.
 *
 * Every request already has its own timeout, but a booster is many requests,
 * and on a bad connection those timeouts stack: the player was left staring
 * at a torn pack for half a minute before anything happened. The draw now
 * works to a deadline, hands over whatever it has when the clock runs out,
 * and stops the moment the connection is gone.
 */
const DRAW_BUDGET_MS = 11000;
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

/* --- draw constraints ----------------------------------------------------- */

const fitsBand = (pack, popularity) =>
  (pack.minPopularity == null || popularity >= pack.minPopularity) &&
  (pack.maxPopularity == null || popularity <= pack.maxPopularity);

/** How far outside the pack's band a popularity lands; 0 inside it. */
function bandMiss(pack, popularity) {
  if (pack.minPopularity != null && popularity < pack.minPopularity) return pack.minPopularity - popularity;
  if (pack.maxPopularity != null && popularity > pack.maxPopularity) return popularity - pack.maxPopularity;
  return 0;
}

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

const POOL_LIMIT = 20;

/** Everything a card needs, asked for in the same breath as the search. */
const PAGE_PROPS = {
  prop: 'extracts|pageimages|categories|info|description',
  exintro: '1', explaintext: '1', exchars: '600', exlimit: String(POOL_LIMIT),
  piprop: 'thumbnail|original', pithumbsize: '640', pilimit: String(POOL_LIMIT),
  cllimit: '500', clshow: '!hidden',
  inprop: 'url'
};

const pagesOf = (data) => Object.values(data?.query?.pages ?? {}).filter((page) => page?.title);

/** A pool of candidates for one search query, sampled across the result set. */
async function searchPool(query, { preferBig = false } = {}) {
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
    ...PAGE_PROPS, format: 'json', origin: '*'
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
async function randomPool() {
  const params = new URLSearchParams({
    action: 'query', generator: 'random',
    grnnamespace: '0', grnlimit: String(POOL_LIMIT),
    ...PAGE_PROPS, format: 'json', origin: '*'
  });
  return pagesOf(await fetchJson(`${ACTION()}?${params}`));
}

/** Details for named articles, up to twenty at a time. */
async function pagesByTitle(titles) {
  if (!titles.length) return [];
  const params = new URLSearchParams({
    action: 'query', titles: titles.slice(0, POOL_LIMIT).join('|'),
    ...PAGE_PROPS, format: 'json', origin: '*'
  });
  return pagesOf(await fetchJson(`${ACTION()}?${params}`));
}

/* --- the most-read list --------------------------------------------------
 * A booster with a high fame floor cannot get there by drawing at random:
 * almost nothing clears it. Wikipedia publishes its own most-read list, so a
 * Legendary booster draws from that instead, and the views come back with
 * the list rather than costing a request each.
 */
let topCache = null;

async function topArticles() {
  const lang = wikiLang();
  if (topCache?.lang === lang && Date.now() - topCache.at < 12 * 60 * 60 * 1000) return topCache.rows;
  const now = new Date();
  // Last month, which is always complete.
  const when = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const y = when.getUTCFullYear();
  const m = String(when.getUTCMonth() + 1).padStart(2, '0');
  try {
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${lang}.wikipedia/all-access/${y}/${m}/all-days`;
    const rows = ((await fetchJson(url))?.items?.[0]?.articles ?? [])
      .map((row) => ({ title: String(row.article ?? '').replace(/_/g, ' '), views: Math.round(row.views ?? 0) }))
      .filter((row) => row.title && !row.title.includes(':') && !BAD_TITLE.test(row.title));
    topCache = { lang, at: Date.now(), rows };
    return rows;
  } catch {
    topCache = { lang, at: Date.now(), rows: [] };
    return [];
  }
}

/* --- is this page actually about the subject? ---------------------------- */

/**
 * 2 = the page's own categories, title or short description say so.
 * 1 = only its opening text mentions the subject, which is weaker.
 * 0 = nothing lines up; this page does not belong in this booster.
 */
function subjectScore(pack, page) {
  const terms = pack.match ?? [];
  if (!terms.length) return 2;
  const strong = [page.title, page.description, ...(page.categories ?? []).map((c) => c.title)]
    .join(' ').toLowerCase();
  if (terms.some((term) => strong.includes(term))) return 2;
  return terms.some((term) => String(page.extract ?? '').toLowerCase().includes(term)) ? 1 : 0;
}

const bestImage = (page) => page.thumbnail?.source ?? page.original?.source ?? null;

/** A raw API page turned into a card, or null when it is not card material. */
function pageToCard(page, views) {
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
    wordCount: page.index != null ? null : null
  });
}

/* --- pageviews ------------------------------------------------------------ */

/** Month range covering the two most recent complete months. */
function pageviewRange() {
  const now = new Date();
  const fmt = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}0100`;
  return [
    fmt(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1))),
    fmt(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)))
  ];
}

/** Average monthly pageviews, or null - a new article legitimately has none. */
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

/* --- drawing a whole booster --------------------------------------------- */

const shuffled = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);

/**
 * Candidates for this booster, best first: on-subject pages with a picture.
 * Every card in a booster is drawn from this one pool, so the whole booster
 * costs about one search rather than one search per card.
 */
async function gatherCandidates(pack) {
  const live = (pack.queries ?? []).filter((q) => !deadQueries.has(`${wikiLang()}|${q}`));
  const floor = pack.minPopularity ?? 0;
  const pages = [];

  // A high floor with no subject to search: draw from the most-read list,
  // which is the only place those pages actually live.
  if (!live.length && floor >= 0.755) {
    const rows = await topArticles();
    if (rows.length) {
      const picked = shuffled(rows).slice(0, POOL_LIMIT);
      const byTitle = new Map(picked.map((row) => [row.title, row.views]));
      const detailed = await pagesByTitle(picked.map((row) => row.title));
      for (const page of detailed) page.knownViews = byTitle.get(page.title) ?? null;
      pages.push(...detailed);
    }
  }

  if (live.length) {
    // Two different queries widen a booster without costing a request per card.
    const queries = shuffled(live).slice(0, Math.min(2, live.length));
    const pools = await Promise.all(queries.map((q) =>
      searchPool(q, { preferBig: floor >= 0.65 }).catch(() => [])));
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

async function drawWikipediaSet(pack) {
  const wanted = Math.max(1, pack.cards ?? 5);
  const seen = new Set();
  const out = [];
  const nearMisses = [];
  const deadline = Date.now() + DRAW_BUDGET_MS;
  const outOfTime = () => Date.now() > deadline || navigator.onLine === false;

  if (navigator.onLine === false) throw new Error('OFFLINE');

  const pool = await gatherCandidates(pack);

  // Views decide rarity, so they decide whether a candidate is allowed in a
  // tiered booster. Look them up several at a time instead of one by one.
  const consider = async (page) => {
    if (seen.has(page.title)) return null;
    const views = page.knownViews ?? await fetchMonthlyViews(page.title);
    const card = pageToCard(page, views);
    if (!card) return null;
    if (fitsBand(pack, card.popularity)) return card;
    nearMisses.push({ card, miss: bandMiss(pack, card.popularity) });
    return null;
  };

  for (let i = 0; i < pool.length && out.length < wanted && !outOfTime(); i += 5) {
    const chunk = pool.slice(i, i + 5);
    const cards = await Promise.all(chunk.map((page) => consider(page).catch(() => null)));
    for (const card of cards) {
      if (!card || out.length >= wanted || seen.has(card.title)) continue;
      seen.add(card.title);
      out.push(card);
    }
  }

  // A booster ALWAYS opens. Anything that was merely outside the tier's band
  // fills the rest, closest first, before we go looking any further.
  if (out.length < wanted) {
    nearMisses.sort((a, b) => a.miss - b.miss);
    for (const { card } of nearMisses) {
      if (out.length >= wanted) break;
      if (seen.has(card.title)) continue;
      seen.add(card.title);
      out.push(card);
    }
  }

  // Still short (a dead query, a thin subject): random articles, which always
  // exist, rather than an error the player cannot do anything about.
  for (let round = 0; out.length < wanted && round < 2 && !outOfTime(); round++) {
    const extra = await randomPool().catch(() => []);
    for (const page of extra) {
      if (out.length >= wanted || seen.has(page.title) || outOfTime()) continue;
      const card = pageToCard(page, await fetchMonthlyViews(page.title).catch(() => null));
      if (!card) continue;
      seen.add(card.title);
      out.push(card);
    }
  }

  if (!out.length) throw new Error(`No usable article found for "${pack.name}"`);
  return out;
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
    lang: (general.lang ?? 'en').split('-')[0],
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
 * community is only the fallback - a French booster should hold French cards.
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
/** Words that say what a page is about, for matching a picture to it. */
function titleWords(title) {
  return String(title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9À-ſ\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3);
}

/**
 * The picture the ARTICLE ITSELF leads with.
 *
 * A Fandom page's lead section opens with its infobox, and the infobox image
 * is the picture of the thing. Going straight to the biggest image on the
 * page instead is how an ore ended up wearing a boss's head: a navigation
 * template further down the page happened to hold a larger picture.
 */
async function customLeadImage(wiki, pageId) {
  try {
    const params = new URLSearchParams({
      action: 'parse', pageid: String(pageId), prop: 'text', section: '0',
      format: 'json', origin: '*'
    });
    const html = (await fetchJson(`${wiki.apiUrl}?${params}`))?.parse?.text?.['*'];
    if (!html) return null;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const img of doc.querySelectorAll('img')) {
      const src = img.getAttribute('data-src') || img.getAttribute('src') || '';
      if (!src || src.startsWith('data:')) continue;
      const name = decodeURIComponent(src.split('?')[0]);
      if (JUNK_IMAGE.test(name)) continue;
      const width = Number(img.getAttribute('width')) || 0;
      const height = Number(img.getAttribute('height')) || 0;
      if (width && width < 80) continue;
      if (height && height < 60) continue;
      return upgradeImageUrl(src.startsWith('//') ? `https:${src}` : src, 640);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve an image for a page the hard way.
 *
 * Fandom pages very often have a picture that `pageimages` doesn't surface,
 * so when it comes back empty we ask what images the page actually *uses*.
 * That list is in page order, and the first entry is usually a nav icon,
 * while the biggest can belong to something else entirely. So each candidate
 * is scored: a file whose name shares words with the article wins outright,
 * and only then does size decide.
 */
async function customPageImage(wiki, pageId, title = '') {
  try {
    const params = new URLSearchParams({
      action: 'query', pageids: String(pageId), generator: 'images', gimlimit: '24',
      prop: 'imageinfo', iiprop: 'url|size|mime', iiurlwidth: '640',
      format: 'json', origin: '*'
    });
    const pages = Object.values((await fetchJson(`${wiki.apiUrl}?${params}`))?.query?.pages ?? {});
    const words = titleWords(title);
    const usable = pages
      .map((p) => ({ title: p.title ?? '', info: p.imageinfo?.[0] }))
      .filter(({ title: name, info }) => info && name && !JUNK_IMAGE.test(name))
      .filter(({ title: name, info }) =>
        /^image\/(jpeg|png|webp)$/i.test(info.mime ?? '') || /\.(jpe?g|png|webp)$/i.test(name))
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
      .map((candidate) => {
        const name = candidate.title.toLowerCase();
        const hits = words.filter((word) => name.includes(word)).length;
        const area = (candidate.info.width ?? 0) * (candidate.info.height ?? 0);
        return { ...candidate, hits, area };
      })
      // Named after the subject first; among equals, the biggest picture.
      .sort((a, b) => b.hits - a.hits || b.area - a.area);

    const best = usable[0]?.info;
    if (!best) return null;
    return upgradeImageUrl(best.thumburl ?? best.url, 640);
  } catch {
    return null;
  }
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

/**
 * The language-matched twin of a resolved wiki. A pack built while the app
 * was in English still has to pull French pages when the app is in French:
 * Fandom keeps localised communities on a language path, so we probe
 * `<wiki>/<lang>/api.php` once and use it whenever it exists.
 */
const langTwinCache = new Map();
async function wikiForLanguage(wiki) {
  const lang = getLanguage();
  if ((wiki.lang ?? 'en') === lang) return wiki;
  const base = wiki.apiUrl.replace(/\/[a-z]{2}\/api\.php$/, '/api.php');
  const twinUrl = lang === 'en' ? base : base.replace(/\/api\.php$/, `/${lang}/api.php`);
  if (twinUrl === wiki.apiUrl) return wiki;
  if (langTwinCache.has(twinUrl)) return langTwinCache.get(twinUrl) ?? wiki;
  try {
    const twin = await probeWiki(twinUrl);
    langTwinCache.set(twinUrl, twin);
    return twin ?? wiki;
  } catch {
    langTwinCache.set(twinUrl, null);
    return wiki;
  }
}

/** Article bytes needed before its word count can read as this popular. */
function bytesForPopularity(minPopularity) {
  const words = Math.pow(10, Math.log10(20000) * Math.pow(minPopularity, 1 / 1.15)) - 1;
  return Math.max(0, Math.round(words * 6));
}

const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * Candidates big enough for a tiered custom booster. Random pages on a mid
 * sized wiki are nearly all stubs, so a fame floor would reject almost all of
 * them; allpages filters by size server-side, and starting from a random
 * letter keeps the sample spread across the wiki.
 */
async function bigPageCandidates(wiki, minPopularity, seen) {
  try {
    const params = new URLSearchParams({
      action: 'query', list: 'allpages', apnamespace: '0', apfilterredir: 'nonredirects',
      apminsize: String(bytesForPopularity(minPopularity)),
      apfrom: pick(AZ), aplimit: '40', format: 'json', origin: '*'
    });
    const rows = (await fetchJson(`${wiki.apiUrl}?${params}`))?.query?.allpages ?? [];
    return rows
      .filter((r) => r.pageid && !seen.has(r.title))
      .map((r) => ({ id: r.pageid, title: r.title }));
  } catch {
    return [];
  }
}

async function drawCustomCard(pack, seen) {
  const wiki = await wikiForLanguage(pack.wiki);
  const banded = pack.minPopularity != null || pack.maxPopularity != null;
  // Every card must carry a picture, so a wiki with thin pages needs room to
  // keep looking rather than handing over a blank.
  const maxAttempts = banded ? MAX_ATTEMPTS_PER_CARD + 8 : MAX_ATTEMPTS_PER_CARD + 4;
  const floor = pack.minPopularity ?? 0;
  let nearest = null;
  let nearestMiss = Infinity;
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // With a fame floor, random pages are hopeless on most wikis: ask for
      // pages big enough to qualify instead. Without one, roam freely.
      let candidates = [];
      if (floor >= 0.5 && attempt < maxAttempts - 2) {
        candidates = await bigPageCandidates(wiki, floor, seen);
      }
      if (!candidates.length) {
        const params = new URLSearchParams({
          action: 'query', list: 'random', rnnamespace: '0', rnlimit: '6',
          format: 'json', origin: '*'
        });
        candidates = ((await fetchJson(`${wiki.apiUrl}?${params}`))?.query?.random ?? [])
          .filter((r) => !seen.has(r.title));
      }
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
        ?? await customLeadImage(wiki, page.pageid)
        ?? await customPageImage(wiki, page.pageid, page.title);
      // A pictureless page is not a card, ever: those are exactly the cards
      // the collection used to sweep out again on the next launch.
      if (!thumbnail) { seen.add(page.title); continue; }

      const card = toCard({
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
      if (fitsBand(pack, card.popularity)) return card;
      const miss = bandMiss(pack, card.popularity);
      if (miss < nearestMiss) { nearest = card; nearestMiss = miss; }
    } catch (err) {
      lastError = err;
    }
  }
  if (nearest) return nearest;
  if (lastError) throw lastError;
  throw new Error(`No usable page found on ${wiki.sitename}`);
}

/** The article's full plain text (lead and body), for the quiz. */
export async function fetchArticleText(title, { limit = 7000 } = {}) {
  const params = new URLSearchParams({
    action: 'query', titles: title, prop: 'extracts', explaintext: '1',
    exsectionformat: 'plain', format: 'json', origin: '*'
  });
  const pages = (await fetchJson(`${ACTION()}?${params}`))?.query?.pages ?? {};
  const page = Object.values(pages)[0];
  return String(page?.extract ?? '').slice(0, limit);
}

/* --- translating a card the player already owns --------------------------- */

/** The API a stored card came from, from its own sourceId. */
function apiForEntry(entry) {
  const source = String(entry.sourceId ?? '');
  if (source.startsWith('wikipedia:')) {
    return `https://${source.slice('wikipedia:'.length) || 'en'}.wikipedia.org/w/api.php`;
  }
  if (source.startsWith('wiki:')) return `https://${source.slice('wiki:'.length)}/api.php`;
  return null;
}

/**
 * The same article, in the language the app is set to.
 *
 * Cards drawn before draws were language-locked are still sitting in old
 * collections in the wrong language. Wikipedia and Fandom both publish
 * interlanguage links, so the translated page can be found and the card
 * rebuilt around it. Returns a fresh card, or null when this article simply
 * does not exist in that language, which is a real answer and not a failure.
 */
export async function translateCard(entry, targetLang) {
  const api = apiForEntry(entry);
  if (!api || !entry.title) return null;

  const params = new URLSearchParams({
    action: 'query', titles: entry.title, prop: 'langlinks',
    lllang: targetLang, llprop: 'url', lllimit: '1', format: 'json', origin: '*'
  });
  const page = pagesOf(await fetchJson(`${api}?${params}`))[0];
  const link = page?.langlinks?.[0];
  const title = link?.['*'];
  if (!title) return null;

  // A Wikipedia twin lives on the wiki the app is already pointed at.
  if (api.includes('.wikipedia.org')) {
    const [detail] = await pagesByTitle([title]);
    if (!detail) return null;
    return pageToCard(detail, await fetchMonthlyViews(title).catch(() => null));
  }

  // A Fandom twin lives on its own community; its url says where.
  let twinApi = null;
  try {
    const url = new URL(link.url);
    twinApi = `${url.origin}${url.pathname.split('/wiki/')[0]}/api.php`;
  } catch {
    return null;
  }
  const wiki = { apiUrl: twinApi, sitename: entry.sourceName ?? '', server: null, articlePath: '/wiki/$1' };
  const params2 = new URLSearchParams({
    action: 'query', titles: title,
    prop: 'extracts|pageimages|info', exintro: '1', explaintext: '1', exchars: '600',
    piprop: 'thumbnail|original', pithumbsize: '640', inprop: 'url',
    format: 'json', origin: '*'
  });
  const detail = pagesOf(await fetchJson(`${twinApi}?${params2}`))[0];
  if (!detail) return null;
  let extract = detail.extract?.trim();
  if (!extract || extract.length < 80) extract = await customLeadText(wiki, detail.pageid);
  if (!isUsableText(detail.title, extract)) return null;
  const thumbnail = usableThumb(detail, 640)
    ?? (detail.original?.source ? upgradeImageUrl(detail.original.source, 640) : null)
    ?? await customLeadImage(wiki, detail.pageid)
    ?? await customPageImage(wiki, detail.pageid, detail.title);
  if (!thumbnail) return null;
  const host = new URL(twinApi);
  return toCard({
    sourceId: `wiki:${host.host}${host.pathname.replace('/api.php', '')}`,
    sourceName: entry.sourceName ?? host.host,
    pageId: detail.pageid,
    title: detail.title,
    description: entry.description ?? '',
    extract,
    thumbnail,
    url: detail.fullurl ?? link.url,
    views: null,
    wordCount: detail.length ? Math.round(detail.length / 6) : null
  });
}

/**
 * Draw the pages a booster names outright. Anything Wikipedia cannot serve
 * (a renamed page, one with no usable picture) is skipped rather than faked,
 * so a list of five that resolves to four opens as four.
 */
async function drawTitleSet(pack) {
  const wanted = Math.max(1, pack.cards ?? 5);
  const titles = (pack.titles ?? []).slice(0, POOL_LIMIT);
  if (!titles.length) return [];
  const pages = await pagesByTitle(titles);
  // pagesByTitle answers in the API's order, not ours.
  const byTitle = new Map(pages.map((page) => [page.title, page]));
  const ordered = titles.map((title) => byTitle.get(title)).filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const page of ordered) {
    if (out.length >= wanted) break;
    if (seen.has(page.title)) continue;
    const views = await fetchMonthlyViews(page.title).catch(() => null);
    const card = pageToCard(page, views);
    if (!card) continue;
    seen.add(page.title);
    out.push(card);
  }
  return out;
}

/* --- public API ---------------------------------------------------------- */

/**
 * Draw a booster's worth of articles. Titles are de-duplicated within the
 * booster; duplicates across boosters are kept and counted as copies.
 */
export async function drawArticles(pack) {
  // A written list of pages: exactly these, in this order, no band, no
  // search. Used by the personal boosters behind a secret code.
  if (pack.source === 'titles') return drawTitleSet(pack);
  if (pack.source === 'custom') {
    const seen = new Set();
    return Promise.all(Array.from({ length: pack.cards }, () => drawCustomCard(pack, seen)));
  }
  return drawWikipediaSet(pack);
}
