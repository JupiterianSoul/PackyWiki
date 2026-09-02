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
import { RARITIES, rarityRank } from './data/rarities.js';
import { rollRarity } from './data/odds.js';
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

/** Requests made since the counter was last read: what a draw cost. */
let requestCount = 0;
export const takeRequestCount = () => { const n = requestCount; requestCount = 0; return n; };

/**
 * Whether the line is slow enough that smaller pictures are worth it. The
 * card face is 640 wide at most; on 2G or 3G, or with data saving on, a 400
 * wide picture reads the same and arrives in half the time.
 */
const slowLine = () => {
  const c = typeof navigator !== 'undefined' ? navigator.connection : null;
  return Boolean(c && (c.saveData || /(^|-)(2g|3g)$/.test(String(c.effectiveType ?? ''))));
};
const thumbSize = () => (slowLine() ? '400' : '640');

async function fetchJson(url) {
  requestCount++;
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
  prop: 'extracts|pageimages|categories|info|description|pageviews',
  exintro: '1', explaintext: '1', exchars: '600', exlimit: String(POOL_LIMIT),
  piprop: 'thumbnail|original', pilimit: String(POOL_LIMIT),
  // pithumbsize is added per request (see pageProps): it depends on the line.
  // The last thirty days of readership, IN THE SAME REQUEST as the page.
  // Readership decides rarity, and it used to cost one round trip per
  // candidate to a second host: forty lookups for a five-card pack, which is
  // what made every booster feel like a lost connection. Wikipedia carries
  // its pageview counts on the page itself, so a pool arrives already graded.
  pvipdays: '30',
  // A page's own lead image, whatever its licence: the cover of a game, a
  // character's own art. Without this the API only answers with free files,
  // and a card about a comic hero comes back with nothing to show.
  pilicense: 'any',
  cllimit: '500', clshow: '!hidden',
  inprop: 'url'
};

/** PAGE_PROPS for this request: the picture size follows the line. */
const pageProps = () => ({ ...PAGE_PROPS, pithumbsize: thumbSize() });

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
async function randomPool() {
  const params = new URLSearchParams({
    action: 'query', generator: 'random',
    grnnamespace: '0', grnlimit: String(POOL_LIMIT),
    ...pageProps(), format: 'json', origin: '*'
  });
  return pagesOf(await fetchJson(`${ACTION()}?${params}`));
}

/** Details for named articles, up to twenty at a time. */
async function pagesByTitle(titles) {
  if (!titles.length) return [];
  const params = new URLSearchParams({
    action: 'query', titles: titles.slice(0, POOL_LIMIT).join('|'),
    ...pageProps(), format: 'json', origin: '*'
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

/**
 * A page's monthly readership, read off the page itself: the thirty daily
 * counts that came back with it, added up. Null when the page carried none,
 * which is a real answer (a page created this week) and not a failure.
 */
function viewsOf(page) {
  if (Number.isFinite(page?.knownViews)) return page.knownViews;
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
  const pages = [];

  // No subject to search: this pack's subject IS Wikipedia, so its pool has to
  // span every tier the roll can ask for. Two sources, because neither covers
  // the range alone: the most-read list is the only place the famous end
  // lives, and a random article is Common almost by definition, which is the
  // end the most-read list never reaches.
  if (!live.length) {
    const rows = await topArticles().catch(() => []);
    const famous = rows.length ? (async () => {
      const picked = shuffled(rows).slice(0, POOL_LIMIT);
      const byTitle = new Map(picked.map((row) => [row.title, row.views]));
      const detailed = await pagesByTitle(picked.map((row) => row.title)).catch(() => []);
      for (const page of detailed) page.knownViews = byTitle.get(page.title) ?? null;
      return detailed;
    })() : Promise.resolve([]);
    const [top, random] = await Promise.all([famous, randomPool().catch(() => [])]);
    pages.push(...top, ...random);
  }

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
function rollWishes(pack, wanted) {
  const wishes = Array.from({ length: wanted }, () => rollRarity(pack.odds));
  if (!pack.guarantee) return wishes;
  const promised = rarityRank(pack.guarantee);
  if (wishes.some((wish) => rarityRank(wish) >= promised)) return wishes;
  wishes[Math.floor(Math.random() * wishes.length)] = pack.guarantee;
  return wishes;
}

/**
 * The highest tier a pack may hand out. Only a timed booster has one: its
 * track level caps the print, so a roll above the cap is brought down to it.
 */
function ceilingRank(pack) {
  if (pack.maxPopularity == null) return RARITIES.length - 1;
  for (let i = RARITIES.length - 1; i >= 0; i--) {
    if (RARITIES[i].minPop < pack.maxPopularity) return i;
  }
  return 0;
}

/** The rolls, brought under the pack's ceiling. */
const cappedWishes = (pack, wishes) => {
  const ceiling = ceilingRank(pack);
  return wishes.map((wish) => (rarityRank(wish) > ceiling ? RARITIES[ceiling].id : wish));
};

/**
 * Pages turned into cards. Readership is the article's FAME, which sets the
 * price; it no longer decides the tier, so a page that came without it is
 * still a card, priced off its size, and a few missing counts are asked for
 * once, all at the same time.
 */
async function pagesToCards(pages, seen, outOfTime) {
  const fresh = pages.filter((page) => !seen.has(page.title) && bestImage(page) && isUsableText(page.title, page.extract));
  for (const page of fresh) seen.add(page.title);
  const unknown = fresh.filter((page) => viewsOf(page) == null).slice(0, 8);
  const looked = new Map();
  if (!outOfTime() && unknown.length) {
    await Promise.all(unknown.map(async (page) => {
      looked.set(page.title, await fetchMonthlyViews(page.title).catch(() => null));
    }));
  }
  return fresh.map((page) => pageToCard(page, viewsOf(page) ?? looked.get(page.title) ?? null)).filter(Boolean);
}

/**
 * Stamp each card with the print it was rolled. The print is what the
 * booster promised; the article is whatever the subject had. The two are
 * independent, which is the whole point: an Epic pack deals Epics at its
 * printed rate in every subject, thin or famous.
 */
function stampPrints(cards, wishes) {
  cards.forEach((card, i) => { card.rarityId = wishes[i] ?? wishes[wishes.length - 1] ?? RARITIES[0].id; });
  return cards;
}

async function drawWikipediaSet(pack) {
  const wanted = Math.max(1, pack.cards ?? 5);
  const seen = new Set();
  const deadline = Date.now() + DRAW_BUDGET_MS;
  const outOfTime = () => Date.now() > deadline || navigator.onLine === false;

  if (navigator.onLine === false) throw new Error('OFFLINE');

  // The prints this pack deals, rolled first; then any pages of the subject.
  const wishes = cappedWishes(pack, rollWishes(pack, wanted));
  const out = (await pagesToCards(await gatherCandidates(pack), seen, outOfTime)).slice(0, wanted);

  // Still short (a dead query, a thin subject): random articles, which always
  // exist, rather than an error the player cannot do anything about.
  for (let round = 0; out.length < wanted && round < 2 && !outOfTime(); round++) {
    const extra = await pagesToCards(await randomPool().catch(() => []), seen, outOfTime);
    for (const card of extra) { if (out.length >= wanted) break; out.push(card); }
  }

  if (!out.length) throw new Error(`No usable article found for "${pack.name}"`);
  return stampPrints(out, wishes);
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

/** Random page ids: one request. */
async function randomIds(wiki, limit = 20) {
  const params = new URLSearchParams({
    action: 'query', list: 'random', rnnamespace: '0', rnlimit: String(limit),
    format: 'json', origin: '*'
  });
  return ((await fetchJson(`${wiki.apiUrl}?${params}`))?.query?.random ?? [])
    .filter((r) => r.id).map((r) => r.id);
}

/** Text, picture and size for up to twenty pages at once. */
async function customPagesDetail(wiki, ids) {
  const params = new URLSearchParams({
    action: 'query', pageids: ids.slice(0, POOL_LIMIT).join('|'),
    prop: 'extracts|pageimages|info',
    exintro: '1', explaintext: '1', exchars: '600', exlimit: String(POOL_LIMIT),
    piprop: 'thumbnail|original', pithumbsize: thumbSize(), pilimit: String(POOL_LIMIT),
    inprop: 'url', format: 'json', origin: '*'
  });
  return pagesOf(await fetchJson(`${wiki.apiUrl}?${params}`));
}

/** The source a card from this wiki is filed under. */
const wikiSourceId = (wiki) => {
  const host = new URL(wiki.apiUrl);
  return `wiki:${host.host}${host.pathname.replace('/api.php', '')}`;
};

/**
 * A page from a subject's wiki, sized up but not yet a card: its text and
 * picture are only fetched once the shelves have chosen it, because those
 * are the requests that cost. Size stands in for readership, which Fandom
 * does not publish, so the tier is known from the listing alone.
 */
function protoCard(page) {
  if (!page?.pageid || BAD_TITLE.test(page.title) || BAD_SUFFIX.test(page.title)) return null;
  const wordCount = page.length ? Math.round(page.length / 6) : null;
  return { page, popularity: popularityFromWordCount(wordCount), wordCount };
}

/**
 * The chosen page made into a card, or null when it cannot be one: a page
 * without a picture is not a card, ever. Those are exactly the cards the
 * collection used to sweep out again on the next launch.
 */
async function finishCustomCard(wiki, proto, pack) {
  const { page } = proto;
  let extract = page.extract?.trim();
  if (!extract || extract.length < 80) extract = await customLeadText(wiki, page.pageid).catch(() => null);
  if (!isUsableText(page.title, extract)) return null;
  // pageimages misses a lot on Fandom, and what it does return is often a
  // fifty-pixel icon, so a too-small thumbnail is treated as no thumbnail and
  // we go digging rather than stretch it across the card.
  const thumbnail = usableThumb(page, 640)
    ?? (page.original?.source ? upgradeImageUrl(page.original.source, 640) : null)
    ?? await customLeadImage(wiki, page.pageid)
    ?? await customPageImage(wiki, page.pageid, page.title);
  if (!thumbnail) return null;
  return toCard({
    sourceId: wikiSourceId(wiki),
    sourceName: wiki.sitename,
    pageId: page.pageid,
    title: page.title,
    description: pack.name,
    extract,
    thumbnail,
    url: page.fullurl ?? `${wiki.server}${wiki.articlePath.replace('$1', encodeTitle(page.title))}`,
    views: null,
    // No pageview API on Fandom, so page size stands in for popularity.
    wordCount: proto.wordCount
  });
}

/**
 * A whole booster from a subject's own wiki, the way a Wikipedia one is
 * drawn: one pool, graded, then a card off the right shelf for each roll.
 *
 * This used to be a search per card, and a search was up to sixteen attempts
 * of three to five requests each, run one after the other, hunting for a page
 * whose size fell inside one tier's narrow band. Almost none ever did, so
 * every card burned every attempt: a five-card pack was a few hundred
 * requests in a row, which no connection survives inside the budget. Now the
 * listing comes first (sizes are free there), the pool is fetched twenty
 * pages a request, and only the pages the shelves actually chose pay for
 * their text and picture, all at the same time.
 */
async function drawCustomSet(pack) {
  const wanted = Math.max(1, pack.cards ?? 5);
  const deadline = Date.now() + DRAW_BUDGET_MS;
  const outOfTime = () => Date.now() > deadline || navigator.onLine === false;
  if (navigator.onLine === false) throw new Error('OFFLINE');

  const wiki = await wikiForLanguage(pack.wiki);
  const wishes = cappedWishes(pack, rollWishes(pack, wanted));

  // A listing of random pages, then their details twenty a request; the
  // pages the draw settles on pay for their text and picture, all at once.
  // A page without a picture is not a card, so a round can come up short and
  // the next round asks for more.
  const out = [];
  const seen = new Set();
  for (let round = 0; out.length < wanted && round < 4 && !outOfTime(); round++) {
    const ids = (await randomIds(wiki, 20).catch(() => []));
    const details = (await customPagesDetail(wiki, ids).catch(() => []))
      .map(protoCard).filter((proto) => proto && !seen.has(proto.page.title));
    for (const proto of details) seen.add(proto.page.title);
    // Only as many as are still needed, plus a couple of spares for the
    // pictureless.
    const picks = details.slice(0, wanted - out.length + 2);
    const built = await Promise.all(picks.map((proto) => finishCustomCard(wiki, proto, pack).catch(() => null)));
    for (const card of built) { if (card && out.length < wanted) out.push(card); }
    if (!details.length) break;
  }

  if (!out.length) throw new Error(`No usable page found on ${wiki.sitename}`);
  return stampPrints(out, wishes);
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
    return pageToCard(detail, viewsOf(detail) ?? await fetchMonthlyViews(title).catch(() => null));
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
 * Draw the pages a booster names outright, in order, for the special
 * boosters behind a secret code. Nothing here is negotiable the way a search
 * is: these are the five things one person loves, so
 *
 *   - every title is followed through redirects, and a French page that has
 *     nothing to show falls back to the English article;
 *   - a page always gets a picture: its lead image, else its first real
 *     photograph, else a plate in the booster's own colour. A card is never
 *     dropped for want of one;
 *   - the pack's extra cards (The Creator) are appended as they are.
 */
async function drawTitleSet(pack) {
  let wanted = (pack.titles ?? []).slice();
  // A curated pack (the Darwin Awards) names more pages than a booster
  // holds and deals a random hand of them.
  if (pack.pick) wanted = shuffled(wanted).slice(0, pack.pick);
  wanted = wanted.slice(0, POOL_LIMIT);
  const out = [];
  for (const want of wanted) out.push(await titleCard(want, pack));
  for (const extra of pack.extra ?? []) out.push({ ...extra });
  return out;
}

/**
 * One named card, from wherever that name actually lives.
 *
 * Exported as `refreshTitleCard` too: a collection written by an older build
 * holds cards drawn the wrong way, and they are repaired by running the same
 * title back through this.
 */
async function titleCard(want, pack) {
  let card = null;
  if (want.wiki || want.wikiUrls) {
    // A card that names its own wiki is a thing Wikipedia has no page for:
    // the Tardigrades CARD in Terraforming Mars, not the animal. If that
    // wiki cannot be reached the card stays unillustrated rather than
    // becoming the encyclopaedia article of the same name, which would be
    // the wrong subject entirely.
    card = await fandomCard(want, pack).catch(() => null) ?? placeholderCard(want, pack);
  } else {
    const page = await resolveTitle(want.title, wikiLang())
      ?? (want.fallback && want.fallback !== want.title ? await resolveTitle(want.fallback, 'en') : null);
    card = page ? await namedCard(page, want, pack) : placeholderCard(want, pack);
  }
  card.special = pack.special ?? null;
  // A special card is keyed by its CODE as well as its article. Two people
  // are allowed to love the same thing, and without this the second code to
  // be redeemed would merge its card into the first one's entry: a single
  // card cannot belong to two albums, so one of them would sit at five out
  // of six forever. The Creator has always been keyed this way; every
  // special card is now.
  if (card.special && card.key) card.key = `special:${card.special}:${card.key}`;
  return card;
}

/**
 * The card one title ought to be today, for repairing a card that was drawn
 * before. Answers null rather than a plate: a stored card is only overwritten
 * by something better than what is already there.
 */
export async function refreshTitleCard(want, pack = {}) {
  const card = await titleCard(want, pack);
  if (!card) return null;
  // A wiki card that fell back to a plate is not an improvement on anything.
  if ((want.wiki || want.wikiUrls) && !String(card.sourceId ?? '').startsWith('wiki:')) return null;
  return card;
}

/**
 * A card from a subject's own wiki, for the things Wikipedia has no page
 * for: a card in a board game, a turret in a video game. The wiki is found
 * by name the way custom boosters find theirs, the page by searching it, so
 * neither the host nor the exact title has to be known in advance.
 */
async function fandomCard(want, pack) {
  // A named endpoint is tried first: guessing a Fandom slug from a game's
  // title works often, but not always, and these five cards are not allowed
  // to be a coin toss.
  let wiki = null;
  for (const apiUrl of want.wikiUrls ?? []) {
    wiki = await probeWiki(apiUrl).catch(() => null);
    if (wiki) break;
  }
  if (!wiki && want.wiki) wiki = await resolveCustomWiki(want.wiki).catch(() => null);
  if (!wiki) return null;
  // The exact page title when the card gives one, a search when it does not.
  let hit = want.page ? await pageByTitle(wiki, want.page) : null;
  if (!hit) {
    const queries = Array.isArray(want.search) ? want.search : [want.search ?? want.title];
    for (const q of queries) {
      const params = new URLSearchParams({
        action: 'query', list: 'search', srsearch: q, srnamespace: '0', srlimit: '5', format: 'json', origin: '*'
      });
      const rows = (await fetchJson(`${wiki.apiUrl}?${params}`).catch(() => null))?.query?.search ?? [];
      hit = rows.find((r) => r.pageid && !/\/|disambiguation/i.test(r.title)) ?? null;
      if (hit) break;
    }
  }
  if (!hit) return null;
  const detail = await customPageDetail(wiki, hit.pageid);
  if (!detail) return null;
  let extract = String(detail.extract ?? '').trim();
  if (extract.length < 40) extract = (await customLeadText(wiki, hit.pageid).catch(() => null)) ?? extract;
  if (extract.length < 40 && want.text) extract = want.text;
  const thumbnail = bestImage(detail)
    ?? await firstPhotoOn(wiki.apiUrl, hit.pageid)
    ?? platePicture(pack.fallbackArt ?? '#94a3b8', want.name ?? detail.title);
  const host = new URL(wiki.apiUrl);
  const card = toCard({
    sourceId: `wiki:${host.host}${host.pathname.replace('/api.php', '')}`,
    sourceName: wiki.sitename ?? host.host,
    pageId: detail.pageid,
    title: detail.title,
    description: want.name ? detail.title : (wiki.sitename ?? ''),
    extract: extract || detail.title,
    thumbnail,
    url: detail.fullurl ?? `${wiki.server ?? 'https://' + host.host}${(wiki.articlePath ?? '/wiki/$1').replace('$1', encodeTitle(detail.title))}`,
    views: null,
    wordCount: detail.length ? Math.round(detail.length / 6) : null
  });
  if (want.name) { card.article = card.title; card.title = want.name; }
  return card;
}

/*
 * Site furniture, by file name: the padlocks, ambox arrows and project logos
 * every wiki page carries. Matched against the FILE NAME alone. Matching the
 * description URL, as this once did, rejected everything: a file page always
 * lives at /wiki/File:..., so every candidate contained "wiki" and no page
 * ever found a picture this way.
 *
 * A series logo is not furniture. A television title card is very often the
 * only image its article has, so "logo" is not in this list.
 */
const CHROME_FILE = /(commons-logo|wikimedia|wikipedia|wiktionary|wikisource|wikiquote|wikidata|ambox|question_book|padlock|lock-|edit-icon|nuvola|crystal_|folder|disambig|portal|symbol_|_icon|icon_|arrow|stub|magnify|sound-icon|speaker|red_pencil|text_document|office-book|gnome-)/i;

/** The first real photograph on a page of any MediaWiki, by page id. */
async function firstPhotoOn(apiUrl, pageId) {
  try {
    const params = new URLSearchParams({
      action: 'query', pageids: String(pageId), generator: 'images', gimlimit: '30',
      prop: 'imageinfo', iiprop: 'url|mime|size', iiurlwidth: '640', format: 'json', origin: '*'
    });
    const files = pagesOf(await fetchJson(`${apiUrl}?${params}`));
    const usable = files
      .map((f) => ({ name: String(f.title ?? '').replace(/^[^:]*:/, ''), info: f.imageinfo?.[0] }))
      .filter((f) => f.info && /image\/(jpeg|png|webp|svg)/.test(f.info.mime ?? '') && (f.info.width ?? 0) >= 160)
      .filter((f) => !CHROME_FILE.test(f.name));
    // The biggest one: on an article the lead photograph is almost always the
    // largest file, and the strays are small.
    usable.sort((a, b) => ((b.info.width ?? 0) * (b.info.height ?? 0)) - ((a.info.width ?? 0) * (a.info.height ?? 0)));
    const photo = usable[0]?.info;
    return photo?.thumburl ?? photo?.url ?? null;
  } catch {
    return null;
  }
}

/** One page of any MediaWiki by its exact title, following redirects. */
async function pageByTitle(wiki, title) {
  const params = new URLSearchParams({
    action: 'query', titles: title, redirects: '1', format: 'json', origin: '*'
  });
  const page = pagesOf(await fetchJson(`${wiki.apiUrl}?${params}`).catch(() => null) ?? {})
    .find((p) => p.pageid && !p.missing);
  return page ?? null;
}

/**
 * A page's picture from the REST summary. Wikipedia serves a lead image here
 * that the action API sometimes will not, and it is the endpoint that answers
 * for a television series whose only image is its title card.
 */
async function restImage(title, lang) {
  try {
    const data = await fetchJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeTitle(title)}`);
    return data?.thumbnail?.source ?? data?.originalimage?.source ?? null;
  } catch {
    return null;
  }
}

/** One page by title on one language's Wikipedia, following redirects. */
async function resolveTitle(title, lang) {
  const params = new URLSearchParams({
    action: 'query', titles: title, redirects: '1',
    ...pageProps(), format: 'json', origin: '*'
  });
  try {
    const page = pagesOf(await fetchJson(`https://${lang}.wikipedia.org/w/api.php?${params}`))
      .find((p) => p.pageid && !p.missing);
    if (!page) return null;
    page.lang = lang;
    return page;
  } catch {
    return null;
  }
}

/** The first real photograph on a page, when it has no lead image. */
async function firstPhoto(page, lang) {
  return firstPhotoOn(`https://${lang}.wikipedia.org/w/api.php`, page.pageid);
}
/** A plate in the booster's colour: the last resort for a picture. */
const platePicture = (colour, title) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
  + `<stop offset="0" stop-color="${colour}"/><stop offset="1" stop-color="#0b0d18"/></linearGradient></defs>`
  + `<rect width="640" height="400" fill="url(#g)"/><text x="320" y="216" text-anchor="middle" font-family="system-ui,sans-serif" `
  + `font-size="44" font-weight="800" fill="rgba(255,255,255,0.86)">${String(title).replace(/[<>&]/g, ' ').slice(0, 26)}</text></svg>`);

/**
 * Every picture a Wikipedia article can be made to give up, in order.
 *
 * French Wikipedia hosts no non-free file at all, so a series whose only
 * image is its title card has nothing to show there while the English
 * article does. A named title therefore crosses the language line for its
 * picture rather than going out as a blank plate.
 */
async function articlePicture(page, want, lang) {
  const found = bestImage(page) ?? await restImage(page.title, lang) ?? await firstPhoto(page, lang);
  if (found) return found;
  if (lang === 'en') return null;
  const title = want.fallback ?? want.title ?? page.title;
  const twin = await resolveTitle(title, 'en');
  if (!twin) return await restImage(title, 'en');
  return bestImage(twin) ?? await restImage(twin.title, 'en') ?? await firstPhoto(twin, 'en');
}

async function namedCard(page, want, pack) {
  const lang = page.lang ?? wikiLang();
  const views = await fetchMonthlyViewsOn(page.title, lang).catch(() => null);
  const thumbnail = await articlePicture(page, want, lang).catch(() => null)
    ?? platePicture(pack.fallbackArt ?? '#94a3b8', want.name ?? page.title);
  const extract = String(page.extract ?? '').trim() || String(page.description ?? '').trim()
    || want.text || (want.name ?? page.title);
  const card = toCard({
    sourceId: `wikipedia:${lang}`,
    sourceName: 'Wikipedia',
    pageId: page.pageid,
    title: page.title,
    description: page.description,
    extract,
    thumbnail,
    url: page.fullurl ?? `https://${lang}.wikipedia.org/wiki/${encodeTitle(page.title)}`,
    views,
    wordCount: null
  });
  // The face carries the name the person knows it by; the article keeps its own.
  if (want.name) { card.article = card.title; card.title = want.name; }
  card.lang = lang;
  return card;
}

/** The card for a title Wikipedia could not serve at all: still a card. */
function placeholderCard(want, pack) {
  const title = want.name ?? want.title;
  return toCard({
    sourceId: `wikipedia:${wikiLang()}`,
    sourceName: 'Wikipedia',
    pageId: null,
    title,
    description: '',
    // A card whose page could not be reached still says what it is, when the
    // booster wrote it down.
    extract: want.text || title,
    thumbnail: platePicture(pack.fallbackArt ?? '#94a3b8', title),
    // Never the encyclopaedia article of the same name for a card that lives
    // on another wiki: that link would lead to the wrong subject.
    url: want.link
      ?? (want.wikiUrls?.[0]
        ? want.wikiUrls[0].replace(/\/api\.php$/, `/wiki/${encodeTitle(want.page ?? want.fallback ?? want.title)}`)
        : `https://${wikiLang()}.wikipedia.org/wiki/${encodeTitle(want.title)}`),
    views: null,
    wordCount: null
  });
}

/** Monthly views on a named language's Wikipedia (the default helper reads the app's). */
async function fetchMonthlyViewsOn(title, lang) {
  const [start, end] = pageviewRange();
  const url = `${PAGEVIEWS}/${lang}.wikipedia/all-access/user/${encodeTitle(title)}/monthly/${start}/${end}`;
  const items = (await fetchJson(url))?.items ?? [];
  if (!items.length) return null;
  return Math.round(items.reduce((sum, item) => sum + (item.views ?? 0), 0) / items.length);
}

/* --- public API ---------------------------------------------------------- */

/**
 * Draw a booster's worth of articles. Titles are de-duplicated within the
 * booster; duplicates across boosters are kept and counted as copies.
 */
export async function drawArticles(pack) {
  const started = Date.now();
  takeRequestCount();
  try {
    // A written list of pages: exactly these, in this order, no band, no
    // search. Used by the personal boosters behind a secret code.
    if (pack.source === 'titles') return await drawTitleSet(pack);
    if (pack.source === 'custom') return await drawCustomSet(pack);
    return await drawWikipediaSet(pack);
  } finally {
    // Said in the console so a slow booster can be told apart from a slow
    // line: how many requests the draw made, and how long they took.
    console.info(`Wikster draw: "${pack.name}" in ${Date.now() - started} ms, ${takeRequestCount()} requests`);
  }
}
