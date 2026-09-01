/**
 * SECRET CODES
 * ============================================================================
 * A code typed into Settings unlocks one personal booster: a pack whose
 * contents are written here rather than drawn from a subject. The registry
 * below is deliberately empty; every code is one entry in SECRET_CODES and
 * nothing else in the app needs to change to add one.
 *
 * A code entry looks like this:
 *
 *   {
 *     id: 'founders',                 // stable, stored in the save forever
 *     code: 'WIKLODO-FOUNDERS',       // what the player types, any case
 *     name: { en: 'Founders pack', fr: 'Pack des fondateurs' },
 *     tagline: { en: 'For the first hands', fr: 'Pour les premieres mains' },
 *     cards: 5,                       // 3 to 7
 *     accent: '#f472b6',              // the booster's two colours
 *     accent2: '#7c3aed',
 *     rarityId: null,                 // or a tier to floor the draw
 *     titles: ['Ada Lovelace', ...],  // exact Wikipedia pages, in order
 *     queries: ['jazz', 'noir'],      // or subjects to search instead
 *     lang: null,                     // 'en' / 'fr' to pin, null to follow
 *     uses: 1                         // how many times ONE player may redeem
 *   }
 *
 * `titles` wins over `queries` when both are given: a code booster with a
 * title list always contains exactly those pages, in that order, with no
 * band filtering. That is the point of a personal booster.
 *
 * Redemptions live in the save (profile.codesRedeemed, a map of id to a count),
 * a code cannot be spent twice by reopening the app, and a save carried to a
 * new phone carries its history with it.
 */
import { getLanguage } from './i18n.js';

/** Every code the app knows. Empty until the first one is written. */
export const SECRET_CODES = [];

/** Uppercase, and anything that is not a letter or a digit is noise. */
export function normalizeCode(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** The entry a typed code refers to, or null. */
export function codeByInput(raw) {
  const key = normalizeCode(raw);
  if (!key) return null;
  return SECRET_CODES.find((entry) => normalizeCode(entry.code) === key) ?? null;
}

export const codeById = (id) => SECRET_CODES.find((entry) => entry.id === id) ?? null;

/** How many times this save has redeemed a code. */
export const timesRedeemed = (profile, id) => Number(profile?.codesRedeemed?.[id] ?? 0);

/** Whether this save may still redeem it. */
export const canRedeem = (profile, entry) =>
  Boolean(entry) && timesRedeemed(profile, entry.id) < Math.max(1, entry.uses ?? 1);

/** The booster spec a code hands over. */
export function codeSpec(entry) {
  return {
    kind: 'code',
    codeId: entry.id,
    rarityId: entry.rarityId ?? null,
    cards: Math.min(7, Math.max(3, entry.cards ?? 5)),
    themeId: null
  };
}

/** The name, tagline and colours a code booster wears, in the player's language. */
export function codeLook(entry) {
  const lang = getLanguage();
  return {
    name: entry?.name?.[lang] ?? entry?.name?.en ?? '',
    tagline: entry?.tagline?.[lang] ?? entry?.tagline?.en ?? '',
    accent: entry?.accent ?? '#f472b6',
    accent2: entry?.accent2 ?? '#7c3aed'
  };
}
