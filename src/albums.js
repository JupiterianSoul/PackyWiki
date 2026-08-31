/**
 * ALBUMS
 * ============================================================================
 * The collection is a shelf of albums, one per category: every subject
 * booster has its own album, every custom pack has its own, and everything
 * pulled from all of Wikipedia (wildcard, free and rarity boosters) files
 * into the Wikipedia album.
 *
 * An album unlocks when you own your first card of its category. Its total is
 * the REAL size of the category: how many articles its queries actually match
 * on Wikipedia, or how many pages the custom wiki holds. Those numbers are
 * fetched once, cached, and honest: nobody is completing Wikipedia.
 * The book shows two pages at a time, four cards to a page.
 */
import { THEME_PACKS, themeById } from './data/packs.js';
import { styleForSpec } from './packstyle.js';
import { tx, getLanguage, wikiLang } from './i18n.js';

export const CARDS_PER_PAGE = 4;
export const CARDS_PER_SPREAD = CARDS_PER_PAGE * 2;

/* --- real category sizes -------------------------------------------------- */

const TOTALS_KEY = 'packywiki.albumTotals.v1';
const TOTALS_TTL = 7 * 24 * 60 * 60 * 1000;

let totalsCache = null;
function totals() {
  if (totalsCache) return totalsCache;
  try {
    totalsCache = JSON.parse(localStorage.getItem(TOTALS_KEY)) ?? {};
  } catch {
    totalsCache = {};
  }
  return totalsCache;
}
function rememberTotal(key, total) {
  totals()[key] = { total, at: Date.now() };
  try { localStorage.setItem(TOTALS_KEY, JSON.stringify(totalsCache)); } catch { /* full */ }
}

const totalKeyFor = (albumKey) => `${getLanguage()}|${albumKey}`;

/** The cached size of an album's category, or null if never fetched. */
export function knownAlbumTotal(albumKey) {
  const hit = totals()[totalKeyFor(albumKey)];
  return Number.isFinite(hit?.total) ? hit.total : null;
}

const isFresh = (albumKey) => {
  const hit = totals()[totalKeyFor(albumKey)];
  return hit && Date.now() - (hit.at ?? 0) < TOTALS_TTL;
};

async function countJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Count request failed (${res.status})`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** How many articles one search query matches, from its totalhits. */
async function queryHits(query) {
  const params = new URLSearchParams({
    action: 'query', list: 'search', srsearch: query, srnamespace: '0',
    srlimit: '1', srinfo: 'totalhits', srprop: '', format: 'json', origin: '*'
  });
  const data = await countJson(`https://${wikiLang()}.wikipedia.org/w/api.php?${params}`);
  return data?.query?.searchinfo?.totalhits ?? 0;
}

/** An article count from a MediaWiki siteinfo, for custom wikis and the wild album. */
async function siteArticles(apiUrl) {
  const params = new URLSearchParams({
    action: 'query', meta: 'siteinfo', siprop: 'statistics', format: 'json', origin: '*'
  });
  const data = await countJson(`${apiUrl}?${params}`);
  const articles = data?.query?.statistics?.articles;
  return Number.isFinite(articles) ? articles : null;
}

const inFlight = new Map();

/**
 * Fetch (and cache) the real size of an album's category. Resolves to the
 * total, or null when the network has nothing for us. Safe to fire and
 * forget: concurrent calls for one album share a single request.
 */
export function fetchAlbumTotal(album) {
  const key = totalKeyFor(album.key);
  if (isFresh(album.key)) return Promise.resolve(knownAlbumTotal(album.key));
  if (inFlight.has(key)) return inFlight.get(key);

  const job = (async () => {
    try {
      let total = null;
      if (album.kind === 'theme') {
        const theme = themeById(album.themeId);
        const lang = getLanguage();
        const queries = theme?.queries?.[lang] ?? theme?.queries?.en ?? [];
        if (queries.length) {
          const hits = await Promise.all(queries.map((q) => queryHits(q).catch(() => 0)));
          const sum = hits.reduce((a, b) => a + b, 0);
          if (sum > 0) total = sum;
        }
      } else if (album.kind === 'custom') {
        total = await siteArticles(albumSpec(album).wiki.apiUrl);
      } else {
        total = await siteArticles(`https://${wikiLang()}.wikipedia.org/w/api.php`);
      }
      if (Number.isFinite(total) && total > 0) {
        // The category can never read smaller than what is already owned.
        rememberTotal(key, Math.max(total, album.owned ?? 0));
        return total;
      }
      return knownAlbumTotal(album.key);
    } catch {
      return knownAlbumTotal(album.key);
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, job);
  return job;
}

/** Which album an owned card belongs to. */
export function albumKeyOf(entry) {
  const [kind, ident] = String(entry.packId ?? '').split('|');
  if (kind === 'theme' && ident && ident !== 'any') return `theme:${ident}`;
  if (kind === 'custom' && ident) return `custom:${ident}`;
  return 'wild';
}

/** A minimal spec for an album, so pack styling (family, emblem, palette)
 *  can be reused for covers and page decoration. */
export function albumSpec(album) {
  if (album.kind === 'theme') return { kind: 'theme', themeId: album.themeId, rarityId: null, cards: 5 };
  if (album.kind === 'custom') {
    return {
      kind: 'custom', cards: 5, customName: album.name,
      wiki: { apiUrl: `https://${album.host}/api.php`, sitename: album.name }
    };
  }
  return { kind: 'open', themeId: null, rarityId: null, cards: 5 };
}

/**
 * Every album, in shelf order: the eighteen subjects, then custom packs,
 * then Wikipedia. Albums the player has no cards for are listed but locked
 * (custom albums only exist once a card has been pulled from that pack, or
 * while the pack itself is still built).
 */
export function buildAlbums(entries, customPacks = []) {
  const byKey = new Map();
  for (const entry of entries) {
    const key = albumKeyOf(entry);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(entry);
  }

  const albums = [];

  for (const theme of THEME_PACKS) {
    const owned = byKey.get(`theme:${theme.id}`) ?? [];
    albums.push(decorate({
      key: `theme:${theme.id}`, kind: 'theme', themeId: theme.id,
      name: tx(theme.name), entries: owned
    }));
  }

  // Custom albums: one per pack ever pulled from, plus packs still built
  // (so a freshly created pack's album shows locked on the shelf).
  const customHosts = new Map();
  for (const pack of customPacks) {
    const host = String(pack.id ?? '').replace(/^custom-/, '');
    if (host) customHosts.set(host, pack.name);
  }
  for (const [key, owned] of byKey) {
    if (!key.startsWith('custom:')) continue;
    const host = key.slice('custom:'.length);
    if (!customHosts.has(host)) customHosts.set(host, owned[0]?.packName ?? host);
  }
  for (const [hostKey, name] of customHosts) {
    // Stored pack ids flatten the host's punctuation; card packIds keep it.
    // Match either shape.
    const flat = hostKey.replace(/\W+/g, '-');
    const owned = byKey.get(`custom:${hostKey}`)
      ?? [...byKey.entries()].find(([k]) => k.startsWith('custom:')
        && k.slice(7).replace(/\W+/g, '-') === flat)?.[1]
      ?? [];
    albums.push(decorate({
      key: `custom:${hostKey}`, kind: 'custom', host: hostKey,
      name: String(name).replace(/·.*$/, '').trim() || hostKey, entries: owned
    }));
  }

  albums.push(decorate({
    key: 'wild', kind: 'wild', name: 'Wikipedia', entries: byKey.get('wild') ?? []
  }));

  return albums;
}

function decorate(album) {
  const style = styleForSpec(albumSpec(album));
  album.style = style;
  album.owned = album.entries.length;
  const known = knownAlbumTotal(album.key);
  album.total = known == null ? null : Math.max(known, album.owned);
  album.unlocked = album.owned > 0;
  album.complete = album.total != null && album.owned >= album.total;
  // The book holds what you own, plus one blank spread that says there is
  // more out there. A complete album closes exactly on its last card.
  const filled = Math.max(1, Math.ceil(album.owned / CARDS_PER_SPREAD));
  album.spreads = album.complete ? filled : filled + 1;
  return album;
}

/** How many albums are complete — the profile stat and achievement hook. */
export function albumsCompleted(entries, customPacks = []) {
  return buildAlbums(entries, customPacks).filter((a) => a.complete).length;
}
