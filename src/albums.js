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
 *
 * The book shows ONE page at a time, four cards to a page in a 2x2 grid.
 * It used to show a two-page spread, which on a phone meant four cards
 * across: every card was squeezed into a tall thin sliver and the next
 * page's slots peeked in at the edge.
 */
import { codeById, codeSpec } from './codes.js';
import { THEME_PACKS, themeById } from './data/packs.js';
import { styleForSpec } from './packstyle.js';
import { tx, getLanguage, wikiLang } from './i18n.js';

/**
 * Slots on one page of the book. A phone holds four, two across; a desk
 * holds eight, four across, so a card on a monitor is the size of a card
 * rather than a poster and a page shows a shelf's worth at once. The book
 * asks on every paint, so the two agree the moment the window changes.
 */
export const cardsPerPage = () => (typeof matchMedia === 'function' && matchMedia('(min-width: 1024px)').matches ? 8 : 4);

/* --- real category sizes -------------------------------------------------- */

const TOTALS_KEY = 'wikster.albumTotals.v1';
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
  if (album.kind === 'code') return Promise.resolve(album.total ?? null);
  const key = totalKeyFor(album.key);
  if (isFresh(album.key)) return Promise.resolve(knownAlbumTotal(album.key));
  if (inFlight.has(key)) return inFlight.get(key);

  const job = (async () => {
    try {
      let total = null;
      if (album.kind === 'theme') {
        const theme = themeById(album.themeId);
        const lang = getLanguage();
        // A curated subject is exactly as big as its roll.
        if (theme?.titles) {
          const roll = theme.titles[lang] ?? theme.titles.en;
          rememberTotal(key, Math.max(roll.length, album.owned ?? 0));
          return roll.length;
        }
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

/**
 * ONE canonical name per custom wiki.
 *
 * A custom pack has been written down three different ways over the app's
 * life: `terraria.fandom.com`, `terraria.fandom.com/fr`, and the flattened
 * `terraria-fandom-com` a stored pack id uses. Left alone those are three
 * different albums for one subject, which is exactly the duplicate the
 * shelf kept growing. Everything funnels through here instead: the language
 * path is dropped (a French Terraria card belongs in the Terraria album)
 * and the punctuation is flattened, so one subject is one album, forever.
 */
export function customSlug(raw) {
  return String(raw ?? '')
    .replace(/^custom-/, '')
    .replace(/^https?:\/\//, '')
    .replace(/\/api\.php$/, '')
    .replace(/\/[a-z]{2}$/, '')
    .toLowerCase()
    .replace(/\W+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Which album an owned card belongs to. */
export function albumKeyOf(entry) {
  // A card from a secret code belongs to that person's album, whatever pack
  // id it carries: the mark on the card is the truth.
  if (entry.special) return `code:${entry.special}`;
  const [kind, ident] = String(entry.packId ?? '').split('|');
  if (kind === 'theme' && ident && ident !== 'any') return `theme:${ident}`;
  if (kind === 'custom' && ident) return `custom:${customSlug(ident)}`;
  return 'wild';
}

/** A minimal spec for an album, so pack styling (family, emblem, palette)
 *  can be reused for covers and page decoration. */
export function albumSpec(album) {
  if (album.kind === 'code') {
    const code = codeById(album.codeId);
    return code ? codeSpec(code) : { kind: 'open', themeId: null, rarityId: null, cards: 5 };
  }
  if (album.kind === 'theme') return { kind: 'theme', themeId: album.themeId, rarityId: null, cards: 5 };
  if (album.kind === 'custom') {
    // The slug lost the dots on the way in; the host it came from is kept on
    // the album so styling and the article count still reach the real wiki.
    const host = album.host ?? `${album.slug.replace(/-/g, '.')}`;
    return {
      kind: 'custom', cards: 5, customName: album.name, customId: `custom-${album.slug}`,
      wiki: { apiUrl: `https://${host}/api.php`, sitename: album.name }
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

  // Custom albums: one per SUBJECT, never one per spelling. Both the packs
  // the player still has built and the packs their cards remember collapse
  // onto the same slug, so a subject can only ever hold one album.
  const customs = new Map();
  const remember = (slug, { name, host }) => {
    if (!slug) return;
    const found = customs.get(slug) ?? { slug, name: null, host: null };
    found.name = found.name ?? name ?? null;
    found.host = found.host ?? host ?? null;
    customs.set(slug, found);
  };
  for (const pack of customPacks) {
    let host = null;
    try {
      const url = new URL(pack.wiki?.apiUrl ?? '');
      host = url.host + url.pathname.replace('/api.php', '');
    } catch { /* an older pack may have no wiki stored */ }
    remember(customSlug(host || pack.id), { name: pack.name, host });
  }
  for (const [key, owned] of byKey) {
    if (!key.startsWith('custom:')) continue;
    const slug = key.slice('custom:'.length);
    const raw = String(owned[0]?.packId ?? '').split('|')[1] ?? '';
    remember(slug, { name: String(owned[0]?.packName ?? '').replace(/\u00b7.*$/, '').trim() || slug, host: raw || null });
  }
  for (const [slug, info] of customs) {
    albums.push(decorate({
      key: `custom:${slug}`, kind: 'custom', slug, host: info.host,
      name: info.name || slug, entries: byKey.get(`custom:${slug}`) ?? []
    }));
  }

  // The special albums: one per secret code whose cards this save holds,
  // in the person's colour, named for them, six cards and no more.
  for (const [key, owned] of byKey) {
    if (!key.startsWith('code:')) continue;
    const code = codeById(key.slice('code:'.length));
    if (!code) continue;
    albums.push(decorate({
      key, kind: 'code', codeId: code.id, name: tx(code.album), entries: owned,
      size: code.cards.length + 1
    }));
  }

  albums.push(decorate({
    key: 'wild', kind: 'wild', name: 'Wikipedia', entries: byKey.get('wild') ?? []
  }));

  return albums;
}

/**
 * What counts as a well-stocked album.
 *
 * An album is measured against the REAL size of its category now, so nobody
 * is ever going to finish one: Wikipedia's own album runs to millions. The
 * milestones the game rewards are therefore about depth, not completion, and
 * this is the number they use.
 */
export const ALBUM_DEEP = 25;

/* --- the medals ----------------------------------------------------------- */

/*
 * An album against a real category is never finished: Animals has tens of
 * thousands of pages. The medals are the targets that can be reached, and
 * each one is a real climb: 75 different cards of one subject is a few dozen
 * boosters, a thousand is a season. An album smaller than a rung (a subject
 * whose category is short) awards the rung on being complete instead. The
 * personal albums behind a code have no medals: they are five cards, and
 * complete is the whole story.
 */
export const ALBUM_TIERS = [
  { id: 'bronze',  need: 75,   coins: 2500,  booster: null },
  { id: 'silver',  need: 200,  coins: 7500,  booster: { rarityId: null,     cards: 5 } },
  { id: 'gold',    need: 500,  coins: 20000, booster: { rarityId: 'rare',   cards: 5 } },
  { id: 'diamond', need: 1000, coins: 60000, booster: { rarityId: 'mythic', cards: 5 } }
];

/** Whether the album has medals to win at all. */
export const albumHasTiers = (album) => album.kind !== 'code';

/** How many different cards the rung asks of this album. */
export function albumTierNeed(album, tier) {
  return album.total != null && album.total < tier.need ? album.total : tier.need;
}

/** The rungs reached so far, 0 to 4. */
export function albumTiersReached(album) {
  if (!albumHasTiers(album)) return 0;
  let n = 0;
  for (const tier of ALBUM_TIERS) {
    if (album.owned >= albumTierNeed(album, tier)) n++;
    else break;
  }
  return n;
}

/** The rungs already claimed for this album, from the profile. */
export const albumTiersClaimed = (profile, album) => Math.min(ALBUM_TIERS.length, Number(profile?.albumTiers?.[album.key]) || 0);

/** The booster a rung pays, for this album: the subject's own where there is one. */
export function albumTierBooster(album, tier) {
  if (!tier.booster) return null;
  return album.kind === 'theme'
    ? { kind: 'theme', themeId: album.themeId, rarityId: tier.booster.rarityId, cards: tier.booster.cards }
    : { kind: 'open', themeId: null, rarityId: tier.booster.rarityId, cards: tier.booster.cards };
}

function decorate(album) {
  const style = styleForSpec(albumSpec(album));
  album.style = style;
  album.owned = album.entries.length;
  if (album.kind === 'code') {
    // A special album is the one album that can be finished: its size is
    // written in the code, not read off Wikipedia, and full counts as deep.
    album.total = album.size;
    album.unlocked = album.owned > 0;
    album.complete = album.owned >= album.total;
    album.deep = album.complete;
    return album;
  }
  const known = knownAlbumTotal(album.key);
  album.total = known == null ? null : Math.max(known, album.owned);
  album.unlocked = album.owned > 0;
  album.complete = album.total != null && album.owned >= album.total;
  album.deep = album.owned >= ALBUM_DEEP;
  return album;
}

/** How many albums are well stocked - the profile stat and achievement hook. */
export function albumsDeep(entries, customPacks = []) {
  return buildAlbums(entries, customPacks).filter((a) => a.deep).length;
}

/** How many albums have been opened at all. */
export function albumsStarted(entries, customPacks = []) {
  return buildAlbums(entries, customPacks).filter((a) => a.unlocked).length;
}
