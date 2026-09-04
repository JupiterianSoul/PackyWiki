// @ts-check
/**
 * SAVE TRANSFER
 * ============================================================================
 * Everything the player has lives in this device's localStorage, which is tied
 * to the app install. Reinstalling - or moving to another phone - loses it.
 *
 * This turns the whole save into one block of text that can be copied out and
 * pasted back. It is the only bridge across an uninstall, and the only way to
 * move a collection between devices.
 *
 * The format is deliberately dull: a JSON envelope with a version, a
 * timestamp and the raw stored strings. No compression, no encoding tricks -
 * a save you cannot inspect is a save you cannot rescue by hand when
 * something goes wrong with it.
 */

/** Every key the app writes. A save is exactly these, and nothing else. */
export const SAVE_KEYS = [
  'wikster.collection.v3',
  'wikster.wallet.v1',
  'wikster.inventory.v1',
  'wikster.profile.v1',
  'wikster.customPacks.v2',
  'wikster.language',
  'wikster.ripDirection',
  'wikster.theme'
];

import { BUILD } from './version.js';

const FORMAT = 'wikster-save';
/** What the envelope was called before the renames. Still read, never written. */
const LEGACY_FORMATS = ['wiklodo-save', 'packywiki-save'];
/** What the storage keys were prefixed with before the rename. */
const LEGACY_PREFIX = 'packywiki.';
const PREFIX = 'wikster.';
/*
 * 2: every key carries the time it last changed on the device that wrote it,
 *    which is what lets two devices' saves be merged key by key instead of
 *    one replacing the other. A version 1 envelope is read as if every key
 *    had changed at the moment the envelope was written.
 */
const VERSION = 2;
/** When each save key last changed on this device. Kept beside the save,
 *  never inside SAVE_KEYS: it describes the save, it is not part of it. */
const STAMPS_KEY = 'wikster.stamps.v1';

export function loadStamps() {
  try {
    const raw = JSON.parse(localStorage.getItem(STAMPS_KEY) ?? '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch { return {}; }
}
function writeStamps(stamps) {
  try { localStorage.setItem(STAMPS_KEY, JSON.stringify(stamps)); } catch { /* session-only */ }
}

/**
 * Storage written under the old prefix is carried over ONCE, the first time
 * this build runs on a device: every `packywiki.*` key becomes the same
 * `wikster.*` key, and the old one is removed. Runs at import, before anything
 * has read a key, and is a no-op on a device that has nothing old.
 */
export function migrateLegacyStorage() {
  try {
    const moves = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LEGACY_PREFIX)) moves.push(key);
    }
    for (const key of moves) {
      const fresh = PREFIX + key.slice(LEGACY_PREFIX.length);
      if (localStorage.getItem(fresh) === null) localStorage.setItem(fresh, localStorage.getItem(key));
      localStorage.removeItem(key);
    }
    return moves.length;
  } catch {
    return 0;
  }
}
migrateLegacyStorage();

/* --- change notification ------------------------------------------------- */

/**
 * Cloud sync needs to know when the save changed, and the honest place to
 * answer that is here, where the definition of "the save" already lives.
 * Everything that writes game state calls touch(); a listener decides what to
 * do about it (in practice: debounce, then push).
 *
 * The alternative - calling a sync function from each of the thirty-odd places
 * that write state - is one missed call site away from silently not syncing.
 */
const listeners = new Set();

export function onSaveChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Something in the save changed. Named with the key that changed, the
 *  change is stamped so a merge can tell which device has the newer copy. */
export function touch(key = null) {
  if (key && SAVE_KEYS.includes(key)) {
    const stamps = loadStamps();
    stamps[key] = Date.now();
    writeStamps(stamps);
  }
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
  const stamps = {};
  const known = loadStamps();
  for (const key of Object.keys(data)) stamps[key] = known[key] ?? 0;
  return JSON.stringify(envelope(data, stamps), null, 1);
}

/** The save's envelope: format, version, when, which build wrote it (so a save
 *  can be told from one written by a newer build and left alone by an older
 *  one), the keys, and when each key last changed. */
export function envelope(data, stamps) {
  return { format: FORMAT, version: VERSION, at: Date.now(), build: BUILD, data, stamps };
}

/** Roughly what is in a save, for the confirmation line before importing. */
export function describeSave(text) {
  const parsed = parseSave(text);
  if (!parsed) return null;
  const read = (key, fallback) => {
    try { return JSON.parse(parsed.data[key] ?? 'null') ?? fallback; } catch { return fallback; }
  };
  const collection = read('wikster.collection.v3', { entries: {} });
  const profile = read('wikster.profile.v1', {});
  const entries = Object.values(collection.entries ?? {});
  return {
    cards: entries.reduce((sum, e) => sum + (e.count ?? 1), 0),
    unique: entries.length,
    wallet: read('wikster.wallet.v1', 0),
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
  if (!parsed || (parsed.format !== FORMAT && !LEGACY_FORMATS.includes(parsed.format))) return null;
  if (!parsed.data || typeof parsed.data !== 'object') return null;
  // Unknown keys are dropped rather than trusted. A save written before the
  // rename carries the old prefix; its keys are read as the new ones.
  const data = {};
  for (const key of SAVE_KEYS) {
    const legacy = LEGACY_PREFIX + key.slice(PREFIX.length);
    const value = parsed.data[key] ?? parsed.data[legacy];
    if (typeof value === 'string') data[key] = value;
  }
  if (!Object.keys(data).length) return null;
  // Version 1 knew nothing about keys changing separately: every key is taken
  // to have changed when the envelope was written.
  const given = parsed.stamps && typeof parsed.stamps === 'object' ? parsed.stamps : {};
  const stamps = {};
  for (const key of Object.keys(data)) {
    const legacy = LEGACY_PREFIX + key.slice(PREFIX.length);
    const at = Number(given[key] ?? given[legacy]);
    stamps[key] = Number.isFinite(at) && at > 0 ? at : (Number(parsed.at) || 0);
  }
  return { ...parsed, version: Number(parsed.version) || 1, data, stamps };
}

/**
 * Two saves of the same account, one from each device: for every key the copy
 * that changed later wins, and a key only one side has is kept. A tie goes to
 * the account's copy, which is the one every device has agreed on. Returns
 * the merged keys and which side each changed key came from, so the caller
 * knows what to write locally and whether there is anything to push.
 */
export function mergeSaves(local, remote) {
  const data = {};
  const stamps = {};
  const fromLocal = [];
  const fromRemote = [];
  for (const key of SAVE_KEYS) {
    const l = local?.data?.[key];
    const r = remote?.data?.[key];
    if (l === undefined && r === undefined) continue;
    const ls = l === undefined ? -1 : (local.stamps?.[key] ?? 0);
    const rs = r === undefined ? -1 : (remote.stamps?.[key] ?? 0);
    const takeRemote = rs >= ls;
    data[key] = takeRemote ? r : l;
    stamps[key] = Math.max(ls, rs, 0);
    if (l !== r) (takeRemote ? fromRemote : fromLocal).push(key);
  }
  return { data, stamps, fromLocal, fromRemote };
}

/** Writes the given keys of a merged save, and their stamps, into storage. */
export function applySave(data, stamps, keys) {
  const known = loadStamps();
  for (const key of keys) {
    if (data[key] === undefined) continue;
    try { localStorage.setItem(key, data[key]); } catch { return false; }
    known[key] = stamps[key] ?? 0;
  }
  writeStamps(known);
  return true;
}

/**
 * Replace the save. Every key in SAVE_KEYS is cleared first, so importing a
 * save that lacks a key does not leave the old value of it behind mixed in
 * with the new one.
 */
export function importSave(text, { stampNow = false } = {}) {
  const parsed = parseSave(text);
  if (!parsed) return false;
  try {
    for (const key of SAVE_KEYS) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(parsed.data)) localStorage.setItem(key, value);
    // A restored backup is the player's decision, made now: stamped now, it
    // wins over whatever any other device still holds.
    const stamps = {};
    for (const key of Object.keys(parsed.data)) stamps[key] = stampNow ? Date.now() : (parsed.stamps[key] ?? 0);
    writeStamps(stamps);
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
