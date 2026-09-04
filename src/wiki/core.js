/* core: split out of wiki.js */

import { wikiLang } from '../i18n.js';
import { drawCustomSet } from './custom.js';
import { drawWikipediaSet } from './draw.js';
import { drawTitleSet } from './translate.js';

export const REQUEST_TIMEOUT_MS = 7000;
/**
 * How long a whole booster may spend drawing before it gives up.
 *
 * Every request already has its own timeout, but a booster is many requests,
 * and on a bad connection those timeouts stack: the player was left staring
 * at a torn pack for half a minute before anything happened. The draw now
 * works to a deadline, hands over whatever it has when the clock runs out,
 * and stops the moment the connection is gone.
 */
/* A booster has to come back with the number of cards printed on it, so the
   budget is the one thing that gives when a subject is thin. Sixteen seconds
   was two extra rounds; a ten-card pack on a subject whose pages mostly have
   no picture needs more than that. */

export const DRAW_BUDGET_MS = 26000;
/** How many extra pools of random pages a short booster may pull in. */

export const FILL_ROUNDS = 8;

export const MAX_SEARCH_OFFSET = 5000;

export const SEARCH_PAGE_SIZE = 50;

export function REST() {
  return (`https://${wikiLang()}.wikipedia.org/api/rest_v1`);
}

export function ACTION() {
  return (`https://${wikiLang()}.wikipedia.org/w/api.php`);
}

export const PAGEVIEWS = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';
/** query -> total hits, so the counting query is paid for once per session. */

export const querySizeCache = new Map();
/** queries that returned nothing, skipped from then on. */

export const deadQueries = new Set();
/** normalised custom-pack name -> resolved wiki. */

export const wikiCache = new Map();

export function pick(arr) {
  return (arr[Math.floor(Math.random() * arr.length)]);
}
/** Requests made since the counter was last read: what a draw cost. */

export let requestCount = 0;

export function takeRequestCount() { const n = requestCount; requestCount = 0; return n; }
/**
 * Whether the line is slow enough that smaller pictures are worth it. The
 * card face is 640 wide at most; on 2G or 3G, or with data saving on, a 400
 * wide picture reads the same and arrives in half the time.
 */

export function slowLine() {
  const c = typeof navigator !== 'undefined' ? navigator.connection : null;
  return Boolean(c && (c.saveData || /(^|-)(2g|3g)$/.test(String(c.effectiveType ?? ''))));
}

export function thumbSize() {
  return (slowLine() ? '400' : '640');
}

export async function fetchJson(url) {
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

export function encodeTitle(title) {
  return (encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/gi, '%252F'));
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
