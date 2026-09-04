/* translate: split out of wiki.js */

import { wikiLang } from '../i18n.js';
import { PAGEVIEWS, encodeTitle, fetchJson } from './core.js';
import { customLeadImage, customLeadText, customPageDetail, customPageImage, probeWiki, resolveCustomWiki, upgradeImageUrl, usableThumb } from './custom.js';
import { shuffled } from './draw.js';
import { POOL_LIMIT, bestImage, fetchMonthlyViews, pageProps, pageToCard, pagesByTitle, pagesOf, pageviewRange, viewsOf } from './fetch.js';
import { isUsableText, toCard } from './filter.js';

/* --- translating a card the player already owns --------------------------- */

/** The API a stored card came from, from its own sourceId. */

export function apiForEntry(entry) {
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

export async function drawTitleSet(pack) {
  let wanted = (pack.titles ?? []).slice();
  // A curated pack may name more pages than a booster holds, and deals a
  // random hand of them.
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

export async function titleCard(want, pack) {
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
  // A card whose face is drawn rather than fetched (the Matrix card wears
  // the rain of the Matrix theme) takes the drawing over any picture.
  if (typeof want.art === 'function') { const drawn = want.art(); if (drawn) card.thumbnail = drawn; }
  card.special = pack.special ?? null;
  // A special card is keyed by its CODE as well as its article. Two people
  // are allowed to love the same thing, and without this the second code to
  // be redeemed would merge its card into the first one's entry: a single
  // card cannot belong to two albums, so one of them would sit at five out
  // of six forever. The Creator has always been keyed this way; every
  // special card is now.
  // Several cards read from one article (a band's members) each keep a
  // slot of their own, or the collection would fold them into one entry.
  if (want.slot && card.key) card.key = `${card.key}#${want.slot}`;
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

export async function fandomCard(want, pack) {
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

export const CHROME_FILE = /(commons-logo|wikimedia|wikipedia|wiktionary|wikisource|wikiquote|wikidata|ambox|question_book|padlock|lock-|edit-icon|nuvola|crystal_|folder|disambig|portal|symbol_|_icon|icon_|arrow|stub|magnify|sound-icon|speaker|red_pencil|text_document|office-book|gnome-)/i;
/** The first real photograph on a page of any MediaWiki, by page id. */

export async function firstPhotoOn(apiUrl, pageId) {
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

export async function pageByTitle(wiki, title) {
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

export async function restImage(title, lang) {
  try {
    const data = await fetchJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeTitle(title)}`);
    return data?.thumbnail?.source ?? data?.originalimage?.source ?? null;
  } catch {
    return null;
  }
}
/** One page by title on one language's Wikipedia, following redirects. */

export async function resolveTitle(title, lang) {
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

export async function firstPhoto(page, lang) {
  return firstPhotoOn(`https://${lang}.wikipedia.org/w/api.php`, page.pageid);
}
/** A plate in the booster's colour: the last resort for a picture. */

export function platePicture(colour, title) {
  return ('data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
  + `<stop offset="0" stop-color="${colour}"/><stop offset="1" stop-color="#0b0d18"/></linearGradient></defs>`
  + `<rect width="640" height="400" fill="url(#g)"/><text x="320" y="216" text-anchor="middle" font-family="system-ui,sans-serif" `
  + `font-size="44" font-weight="800" fill="rgba(255,255,255,0.86)">${String(title).replace(/[<>&]/g, ' ').slice(0, 26)}</text></svg>`));
}
/**
 * Every picture a Wikipedia article can be made to give up, in order.
 *
 * French Wikipedia hosts no non-free file at all, so a series whose only
 * image is its title card has nothing to show there while the English
 * article does. A named title therefore crosses the language line for its
 * picture rather than going out as a blank plate.
 */

export async function articlePicture(page, want, lang) {
  const found = bestImage(page) ?? await restImage(page.title, lang) ?? await firstPhoto(page, lang);
  if (found) return found;
  if (lang === 'en') return null;
  const title = want.fallback ?? want.title ?? page.title;
  const twin = await resolveTitle(title, 'en');
  if (!twin) return await restImage(title, 'en');
  return bestImage(twin) ?? await restImage(twin.title, 'en') ?? await firstPhoto(twin, 'en');
}

export async function namedCard(page, want, pack) {
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

export function placeholderCard(want, pack) {
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

export async function fetchMonthlyViewsOn(title, lang) {
  const [start, end] = pageviewRange();
  const url = `${PAGEVIEWS}/${lang}.wikipedia/all-access/user/${encodeTitle(title)}/monthly/${start}/${end}`;
  const items = (await fetchJson(url))?.items ?? [];
  if (!items.length) return null;
  return Math.round(items.reduce((sum, item) => sum + (item.views ?? 0), 0) / items.length);
}
