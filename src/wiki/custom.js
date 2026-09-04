/* custom: split out of wiki.js */

import { getLanguage } from '../i18n.js';
import { popularityFromWordCount } from '../pricing.js';
import { ACTION, DRAW_BUDGET_MS, encodeTitle, fetchJson, pick, thumbSize, wikiCache } from './core.js';
import { cappedWishes, rollWishes, settleWishes, stampPrints } from './draw.js';
import { POOL_LIMIT, pagesOf } from './fetch.js';
import { BAD_SUFFIX, BAD_TITLE, isUsableText, toCard } from './filter.js';

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

export async function probeWiki(apiUrl) {
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

export async function searchFandom(name) {
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

export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('table, style, script, sup, .infobox, .navbox').forEach((n) => n.remove());
  const p = [...doc.querySelectorAll('p')].map((n) => n.textContent.trim()).find((t) => t.length > 80);
  return (p ?? doc.body.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
}
/** File names that are chrome rather than illustration. */

export const JUNK_IMAGE =
  /(icon|logo|wiki-wordmark|favicon|badge|stub|placeholder|button|sprite|ui[-_]|site-?background|community|discord|twitter|facebook|edit|arrow|bullet|spacer|blank|transparent|nav|banner|header|footer)/i;
/** Below this, an image is chrome or a sprite, not a picture of anything. */

export const MIN_IMAGE_EDGE = 180;

export const MIN_IMAGE_AREA = 60000;
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

export function upgradeImageUrl(url, width = 640) {
  if (typeof url !== 'string' || !url) return url;
  if (!/static\.wikia\.nocookie\.net|\/revision\/latest/.test(url)) return url;
  return url
    .replace(/\/scale-to-width-down\/\d+/, `/scale-to-width-down/${width}`)
    .replace(/\/scale-to-width\/\d+/, `/scale-to-width/${width}`)
    .replace(/\/smart\/width\/\d+\/height\/\d+/, `/scale-to-width-down/${width}`)
    .replace(/\/window-crop\/width\/\d+\/[^?]*/, `/scale-to-width-down/${width}`);
}
/** A thumbnail the API gave us, only if it is actually big enough to use. */

export function usableThumb(page, width = 640) {
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

export function titleWords(title) {
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

export async function customLeadImage(wiki, pageId) {
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

export async function customPageImage(wiki, pageId, title = '') {
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

export async function customPageDetail(wiki, pageId) {
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

export async function customLeadText(wiki, pageId) {
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

export const langTwinCache = new Map();

export async function wikiForLanguage(wiki) {
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

export async function randomIds(wiki, limit = 20) {
  const params = new URLSearchParams({
    action: 'query', list: 'random', rnnamespace: '0', rnlimit: String(limit),
    format: 'json', origin: '*'
  });
  return ((await fetchJson(`${wiki.apiUrl}?${params}`))?.query?.random ?? [])
    .filter((r) => r.id).map((r) => r.id);
}
/** Text, picture and size for up to twenty pages at once. */

export async function customPagesDetail(wiki, ids) {
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

export function wikiSourceId(wiki) {
  const host = new URL(wiki.apiUrl);
  return `wiki:${host.host}${host.pathname.replace('/api.php', '')}`;
}
/**
 * A page from a subject's wiki, sized up but not yet a card: its text and
 * picture are only fetched once the shelves have chosen it, because those
 * are the requests that cost. Size stands in for readership, which Fandom
 * does not publish, so the tier is known from the listing alone.
 */

export function protoCard(page) {
  if (!page?.pageid || BAD_TITLE.test(page.title) || BAD_SUFFIX.test(page.title)) return null;
  const wordCount = page.length ? Math.round(page.length / 6) : null;
  return { page, popularity: popularityFromWordCount(wordCount), wordCount };
}
/**
 * The chosen page made into a card, or null when it cannot be one: a page
 * without a picture is not a card, ever. Those are exactly the cards the
 * collection used to sweep out again on the next launch.
 */
/**
 * Whether a candidate can be a card WITHOUT another request: its opening
 * text came with the details and so did a usable picture. On a wiki like
 * Fandom every page that is not free costs one to three slow parse
 * requests, so the free ones are dealt first and the rest only as needed.
 */

export function isFreeCard(proto) {
  const page = proto.page;
  const extract = page.extract?.trim();
  return Boolean(extract && extract.length >= 80 && isUsableText(page.title, extract)
    && (usableThumb(page, 640) || page.original?.source));
}

export async function finishCustomCard(wiki, proto, pack) {
  const { page } = proto;
  let extract = page.extract?.trim();
  if (!extract || extract.length < 80) extract = await customLeadText(wiki, page.pageid).catch(() => null);
  if (!isUsableText(page.title, extract)) throw new Error('NO_TEXT');
  // pageimages misses a lot on Fandom, and what it does return is often a
  // fifty-pixel icon, so a too-small thumbnail is treated as no thumbnail and
  // we go digging rather than stretch it across the card.
  const thumbnail = usableThumb(page, 640)
    ?? (page.original?.source ? upgradeImageUrl(page.original.source, 640) : null)
    ?? await customLeadImage(wiki, page.pageid)
    ?? await customPageImage(wiki, page.pageid, page.title);
  if (!thumbnail) throw new Error('NO_IMAGE');
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
/**
 * One card the old way: a few random pages at a time, one looked at at a
 * time, until one can be a card. Slower per card than the pool, but it is
 * the path that has always worked on every wiki, so it is what the pack
 * falls back to when the pooled draw comes up empty. Several run at once,
 * one per card still owed, so the wall time is one card's, not five.
 */

export async function huntCustomCard(wiki, pack, seen, outOfTime, tally) {
  for (let attempt = 0; attempt < 8 && !outOfTime(); attempt++) {
    const params = new URLSearchParams({
      action: 'query', list: 'random', rnnamespace: '0', rnlimit: '6', format: 'json', origin: '*'
    });
    const rows = ((await fetchJson(`${wiki.apiUrl}?${params}`).catch(() => null))?.query?.random ?? [])
      .filter((r) => r.id && !seen.has(r.title));
    if (!rows.length) continue;
    const choice = pick(rows);
    seen.add(choice.title);
    const page = await customPageDetail(wiki, choice.id).catch(() => null);
    const proto = protoCard(page);
    if (!proto) { tally.other++; continue; }
    try {
      return await finishCustomCard(wiki, proto, pack);
    } catch (err) {
      tally[err?.message === 'NO_TEXT' ? 'noText' : err?.message === 'NO_IMAGE' ? 'noImage' : 'other']++;
    }
  }
  return null;
}
/**
 * The free candidates a custom draw did not use, kept per wiki for the next
 * draw on it: a page whose text and picture came with its details costs
 * nothing to deal, so a leftover from this pack is an instant card in the
 * next. Held in memory only, a few dozen per wiki.
 */

export const spareCustom = new Map();

export const SPARE_KEEP = 40;

export async function drawCustomSet(pack) {
  const wanted = Math.max(1, pack.cards ?? 5);
  const deadline = Date.now() + DRAW_BUDGET_MS;
  const outOfTime = () => Date.now() > deadline || navigator.onLine === false;
  if (navigator.onLine === false) throw new Error('OFFLINE');

  const wiki = await wikiForLanguage(pack.wiki);
  const wishes = cappedWishes(pack, rollWishes(pack, wanted));
  const out = [];
  const seen = new Set();
  // Why candidates were turned away, for the console: a pack that comes
  // back empty has to be readable from the outside.
  const tally = { noText: 0, noImage: 0, other: 0 };
  // Leftovers from the last draw on this wiki: dealt first, at no cost.
  const spares = spareCustom.get(wiki.apiUrl) ?? [];
  while (spares.length && out.length < wanted) {
    const proto = spares.shift();
    if (seen.has(proto.page.title)) continue;
    seen.add(proto.page.title);
    try { out.push(await finishCustomCard(wiki, proto, pack)); } catch { /* not a card after all */ }
  }
  if (out.length) console.info(`Wikster custom draw "${pack.name}": ${out.length} cards from the spares, ${spares.length} spares left`);
  const say = (what) => console.info(`Wikster custom draw "${pack.name}" on ${wiki.apiUrl}: ${what}; turned away: ${tally.noText} without text, ${tally.noImage} without picture, ${tally.other} other`);

  // First the pool: a listing of random pages and their details twenty a
  // request. The candidates that came back complete (text and a picture in
  // the details) are dealt at no further cost; the rest are finished three
  // at a time, only as many as are still owed, because each one is one to
  // three slow parse requests. Ten at a time was thirty slow requests at
  // once, which blew the draw's whole budget on a single round and left
  // nothing for the hunt below: the pack came back empty, or, when a round
  // happened to be all free cards, instantly.
  const tallyMiss = (reason) => { tally[reason === 'NO_TEXT' ? 'noText' : reason === 'NO_IMAGE' ? 'noImage' : 'other']++; };
  for (let round = 0; out.length < wanted && round < 6 && !outOfTime(); round++) {
    const ids = await randomIds(wiki, 20).catch(() => []);
    let details = ids.length ? await customPagesDetail(wiki, ids).catch(() => []) : [];
    if (!details.length && ids.length) {
      details = (await Promise.all(ids.slice(0, 10).map((id) => customPageDetail(wiki, id).catch(() => null)))).filter(Boolean);
    }
    const protos = details.map(protoCard).filter((proto) => proto && !seen.has(proto.page.title));
    for (const proto of protos) seen.add(proto.page.title);
    const free = protos.filter(isFreeCard);
    const costly = protos.filter((proto) => !isFreeCard(proto));
    let built = 0;
    for (const proto of free) {
      if (out.length >= wanted) { spares.push(proto); continue; }
      try { out.push(await finishCustomCard(wiki, proto, pack)); built++; } catch (err) { tallyMiss(err?.message); }
    }
    spareCustom.set(wiki.apiUrl, spares.slice(-SPARE_KEEP));
    for (let i = 0; i < costly.length && out.length < wanted && !outOfTime(); i += 3) {
      const settled = await Promise.allSettled(costly.slice(i, i + 3).map((proto) => finishCustomCard(wiki, proto, pack)));
      for (const result of settled) {
        if (result.status === 'fulfilled' && result.value) { if (out.length < wanted) { out.push(result.value); built++; } }
        else tallyMiss(result.reason?.message);
      }
    }
    say(`pool round ${round + 1}: ${ids.length} random, ${details.length} detailed, ${protos.length} candidates (${free.length} free), ${built} cards`);
    if (!ids.length) break;
  }

  // Then, for whatever is still owed, the old way, one hunt per card at once.
  // A hunt can come back empty, so it is run again while the pack is short
  // and there is time: the size printed on the wrapper is a promise.
  for (let pass = 0; out.length < wanted && pass < 3 && !outOfTime(); pass++) {
    const hunted = await Promise.all(Array.from({ length: wanted - out.length }, () => huntCustomCard(wiki, pack, seen, outOfTime, tally)));
    for (const card of hunted) if (card && out.length < wanted) out.push(card);
    say(`hunt ${pass + 1}: ${hunted.filter(Boolean).length} of ${hunted.length} cards`);
  }
  if (out.length < wanted) console.warn(`Wikster custom draw "${pack.name}": ${out.length} of ${wanted} cards`);

  if (!out.length) throw new Error(`No usable page found on ${wiki.sitename}`);
  const dealt = out.slice(0, wanted);
  return stampPrints(dealt, settleWishes(pack, wishes, dealt.length));
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
