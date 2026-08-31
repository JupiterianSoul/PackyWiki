/**
 * ALBUMS
 * ============================================================================
 * The collection is a shelf of albums, one per category: every subject
 * booster has its own album, every custom pack has its own, and everything
 * pulled from all of Wikipedia (wildcard, free and rarity boosters) files
 * into the Wikipedia album.
 *
 * An album unlocks when you own your first card of its category, and is
 * complete at ALBUM_SIZE distinct cards. The book shows two pages at a
 * time, four cards to a page.
 */
import { THEME_PACKS } from './data/packs.js';
import { styleForSpec } from './packstyle.js';
import { tx } from './i18n.js';

export const ALBUM_SIZE = 48;
export const CARDS_PER_PAGE = 4;
export const CARDS_PER_SPREAD = CARDS_PER_PAGE * 2;

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
  album.total = ALBUM_SIZE;
  album.unlocked = album.owned > 0;
  album.complete = album.owned >= ALBUM_SIZE;
  album.spreads = Math.max(ALBUM_SIZE / CARDS_PER_SPREAD,
    Math.ceil(album.owned / CARDS_PER_SPREAD));
  return album;
}

/** How many albums are complete — the profile stat and achievement hook. */
export function albumsCompleted(entries, customPacks = []) {
  return buildAlbums(entries, customPacks).filter((a) => a.complete).length;
}
