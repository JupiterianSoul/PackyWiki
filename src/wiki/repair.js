/* --- a card whose article moved, or went away ------------------------------
 *
 * Wikipedia is not a fixed deck. Articles are renamed, merged into others and
 * now and then deleted, and a card drawn a year ago can point at a page that
 * is no longer there under that name. When a card is looked at, its article
 * is checked, at most once a week: a page that moved brings the card's title
 * and text up to date (the card keeps its key, which is its identity in the
 * album), and a page that is gone marks the card as such. The card itself is
 * never taken away: what was pulled was pulled.
 */

import { fetchJson } from './core.js';
import { pageProps, pageToCard, pagesOf } from './fetch.js';

/** How long a check holds before the article is looked at again. */
export const REPAIR_EVERY = 7 * 24 * 3600 * 1000;

/**
 * Looks the card's article up on its Wikipedia. Resolves to null when there
 * is nothing to do (checked recently, not a Wikipedia card, or no answer from
 * the line, which is not the same as the page being gone); otherwise to
 * `{ gone: true }`, or `{ gone: false, ...fields }` with the fields that moved.
 */
export async function repairCard(entry) {
  if (!entry?.key || !entry.title || entry.special) return null;
  if (String(entry.sourceId ?? '').startsWith('wiki:')) return null;
  if (entry.checkedAt && Date.now() - entry.checkedAt < REPAIR_EVERY) return null;
  const lang = entry.lang ?? String(entry.key).split(':')[0];
  if (!/^[a-z-]{2,12}$/.test(lang)) return null;
  const params = new URLSearchParams({
    action: 'query', titles: entry.title, redirects: '1', ...pageProps(), format: 'json', origin: '*'
  });
  let data;
  try { data = await fetchJson(`https://${lang}.wikipedia.org/w/api.php?${params}`); } catch { return null; }
  const pages = pagesOf(data ?? {});
  const page = pages.find((p) => p.pageid && !p.missing);
  if (!page) return pages.some((p) => p.missing !== undefined || p.invalid !== undefined) ? { gone: true } : null;
  page.lang = lang;
  const fresh = pageToCard(page, entry.views);
  const fix = { gone: false };
  for (const field of ['title', 'description', 'extract']) {
    if (fresh?.[field] && fresh[field] !== entry[field]) fix[field] = fresh[field];
  }
  if (!entry.thumbnail && fresh?.thumbnail) fix.thumbnail = fresh.thumbnail;
  return fix;
}
