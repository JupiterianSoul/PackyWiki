/**
 * SAVE TRANSFER
 * ============================================================================
 * Everything the player has lives in this device's localStorage, which is tied
 * to the app install. Reinstalling — or moving to another phone — loses it.
 *
 * This turns the whole save into one block of text that can be copied out and
 * pasted back. It is the only bridge across an uninstall, and the only way to
 * move a collection between devices.
 *
 * The format is deliberately dull: a JSON envelope with a version, a
 * timestamp and the raw stored strings. No compression, no encoding tricks —
 * a save you cannot inspect is a save you cannot rescue by hand when
 * something goes wrong with it.
 */

/** Every key the app writes. A save is exactly these, and nothing else. */
export const SAVE_KEYS = [
  'packywiki.collection.v3',
  'packywiki.wallet.v1',
  'packywiki.inventory.v1',
  'packywiki.profile.v1',
  'packywiki.customPacks.v2',
  'packywiki.language',
  'packywiki.ripDirection',
  'packywiki.theme'
];

const FORMAT = 'wiklodo-save';
const VERSION = 1;

/* --- change notification ------------------------------------------------- */

/**
 * Cloud sync needs to know when the save changed, and the honest place to
 * answer that is here, where the definition of "the save" already lives.
 * Everything that writes game state calls touch(); a listener decides what to
 * do about it (in practice: debounce, then push).
 *
 * The alternative — calling a sync function from each of the thirty-odd places
 * that write state — is one missed call site away from silently not syncing.
 */
const listeners = new Set();

export function onSaveChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function touch() {
  for (const fn of listeners) {
    try { fn(); } catch { /* a broken listener must not break saving */ }
  }
}

/** The current save, as text. */
export function exportSave() {
  const data = {};
  for (const key of SAVE_KEYS) {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) data[key] = value;
    } catch { /* unreadable storage: skip the key rather than fail the export */ }
  }
  return JSON.stringify({ format: FORMAT, version: VERSION, at: Date.now(), data }, null, 1);
}

/** Roughly what is in a save, for the confirmation line before importing. */
export function describeSave(text) {
  const parsed = parseSave(text);
  if (!parsed) return null;
  const read = (key, fallback) => {
    try { return JSON.parse(parsed.data[key] ?? 'null') ?? fallback; } catch { return fallback; }
  };
  const collection = read('packywiki.collection.v3', { entries: {} });
  const profile = read('packywiki.profile.v1', {});
  const entries = Object.values(collection.entries ?? {});
  return {
    cards: entries.reduce((sum, e) => sum + (e.count ?? 1), 0),
    unique: entries.length,
    wallet: read('packywiki.wallet.v1', 0),
    level: profile?.progress?.level ?? 1,
    boosters: profile?.boostersOpened ?? 0,
    at: parsed.at ?? null
  };
}

/**
 * Validate before touching anything. Importing overwrites the whole save, so
 * a half-recognised blob must be rejected outright rather than applied in
 * part and leaving the player with neither their old save nor the new one.
 */
export function parseSave(text) {
  let parsed;
  try { parsed = JSON.parse(String(text).trim()); } catch { return null; }
  if (!parsed || parsed.format !== FORMAT) return null;
  if (!parsed.data || typeof parsed.data !== 'object') return null;
  // Unknown keys are dropped rather than trusted.
  const data = {};
  for (const key of SAVE_KEYS) {
    if (typeof parsed.data[key] === 'string') data[key] = parsed.data[key];
  }
  if (!Object.keys(data).length) return null;
  return { ...parsed, data };
}

/**
 * Replace the save. Every key in SAVE_KEYS is cleared first, so importing a
 * save that lacks a key does not leave the old value of it behind mixed in
 * with the new one.
 */
export function importSave(text) {
  const parsed = parseSave(text);
  if (!parsed) return false;
  try {
    for (const key of SAVE_KEYS) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(parsed.data)) localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Put text on the clipboard. The async Clipboard API is not available in every
 * WebView, so fall back to a hidden textarea and execCommand, which is.
 * Returns false when neither worked and the caller should show the text for
 * the player to copy by hand.
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the old way */ }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Read the clipboard, where the WebView allows it. */
export async function readText() {
  try {
    if (navigator.clipboard?.readText) return await navigator.clipboard.readText();
  } catch { /* permission refused, or no API */ }
  return null;
}
