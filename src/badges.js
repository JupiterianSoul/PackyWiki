/**
 * BADGES
 * ============================================================================
 * The trophies above the statistics: holographic foil chips, one per family
 * of hard achievements, shown on the profile between the level card and the
 * numbers. A badge is not another achievement - it is what the top rungs of
 * a chain LOOK like once you are standing on them.
 *
 * Each badge hangs off one achievement chain (src/achievements.js) and starts
 * counting at that chain's hard end: `from` names the first rung that shows
 * on the chip. Climb further and the same chip upgrades in place - the foil
 * re-tints, a pip is added, the rank rises. Two hang off single feats
 * instead. Everything is computed from live achievement state; nothing is
 * stored.
 *
 * The look is the "holo foil chip" the player picked from ten candidates: a
 * rounded hexagon of iridescent foil, a dark inset, the motif in white line
 * art, a diagonal sheen, and one pip per rank along the bottom edge.
 */
import { tx } from './i18n.js';
import { ACHIEVEMENTS } from './achievements.js';

/* --- the set ---------------------------------------------------------------
 * `chain` + `from`: upgradeable, one rank per unlocked rung from `from` up.
 * `ach`: a single feat, one rank. `motif` picks the line art below. */
export const BADGES = [
  { id: 'ripper',     chain: 'pack',      from: 4, motif: 'pack',
    name: { en: 'Ripper', fr: 'Déchireur' } },
  { id: 'collector',  chain: 'cards',     from: 4, motif: 'cards',
    name: { en: 'Collector', fr: 'Collectionneur' } },
  { id: 'archivist',  chain: 'album',     from: 3, motif: 'book',
    name: { en: 'Archivist', fr: 'Archiviste' } },
  { id: 'tycoon',     chain: 'value',     from: 3, motif: 'gem',
    name: { en: 'Tycoon', fr: 'Magnat' } },
  { id: 'ascendant',  chain: 'level',     from: 5, motif: 'peak',
    name: { en: 'Ascendant', fr: 'Ascendant' } },
  { id: 'starcatcher', chain: 'legendary', from: 2, motif: 'star',
    name: { en: 'Starcatcher', fr: 'Attrapeur d’étoiles' } },
  // The id predates the tier's rename; it stays so equipped loadouts hold.
  { id: 'relichunter', chain: 'prismatic', from: 1, motif: 'crystal',
    name: { en: 'Prism Hunter', fr: 'Chasseur de prismes' } },
  { id: 'scholar',    chain: 'perfect',   from: 2, motif: 'quiz',
    name: { en: 'Scholar', fr: 'Érudit' } },
  { id: 'timekeeper', chain: 'timed',     from: 3, motif: 'hourglass',
    name: { en: 'Timekeeper', fr: 'Gardien du temps' } },
  { id: 'devoted',    chain: 'daily',     from: 3, motif: 'gift',
    name: { en: 'Devoted', fr: 'Fidèle' } },
  { id: 'magnate',    chain: 'rich',      from: 2, motif: 'coin',
    name: { en: 'Deep Pockets', fr: 'Poches profondes' } },
  { id: 'prismatic',  ach: 'one-of-each', motif: 'prism',
    name: { en: 'One of Each', fr: 'Un de chaque' } },
  { id: 'seller',     chain: 'vendor',    from: 1, motif: 'tag',
    name: { en: 'Seller', fr: 'Vendeur' } },
  { id: 'buyer',      chain: 'hammer',    from: 1, motif: 'gavel',
    name: { en: 'Buyer', fr: 'Acheteur' } },
  { id: 'encyclo',    chain: 'unique',    from: 3, motif: 'scroll',
    name: { en: 'Encyclopedist', fr: 'Encyclopédiste' } },
  { id: 'philanthrope', chain: 'gift',    from: 2, motif: 'heart',
    name: { en: 'Philanthropist', fr: 'Philanthrope' } },
  // The special badges: one per secret code (src/codes.js), earned the
  // moment the code is redeemed, worn straight away. `code` names the code;
  // the chip's foil is the person's own colour rather than the rank ladder.
  { id: 'special-simon',   code: 'simon',   motif: 'laugh',  foil: ['#bfdbfe', '#3b82f6', '#1d4ed8'],
    name: { en: 'Simon’s Special Badge', fr: 'Badge spécial de Simon' } },
  { id: 'special-celeste', code: 'celeste', motif: 'lamassu', foil: ['#fce7f3', '#f472b6', '#be185d'],
    name: { en: 'Céleste’s Special Badge', fr: 'Badge spécial de Céleste' } },
  { id: 'special-samuel',  code: 'samuel',  motif: 'pixel',  foil: ['#cfe7ff', '#1e90ff', '#1e3a8a'],
    name: { en: 'Samuel’s Special Badge', fr: 'Badge spécial de Samuel' } },
  { id: 'special-noah',    code: 'noah',    motif: 'dice',   foil: ['#e9d5ff', '#a855f7', '#6b21a8'],
    name: { en: 'Noah’s Special Badge', fr: 'Badge spécial de Noah' } },
  { id: 'special-julien',  code: 'julien',  motif: 'wheel',    foil: ['#f5ead6', '#d8c39a', '#5c4426'],
    name: { en: 'Julien’s Special Badge', fr: 'Badge spécial de Julien' } },
  { id: 'special-catherine', code: 'catherine', motif: 'openbook', foil: ['#ccfbf1', '#2dd4bf', '#0f4c47'],
    name: { en: 'Catherine’s Special Badge', fr: 'Badge spécial de Catherine' } },
  { id: 'special-mathilde', code: 'mathilde', motif: 'pot',      foil: ['#ede9fe', '#a78bfa', '#3b1f6b'],
    name: { en: 'Mathilde’s Special Badge', fr: 'Badge spécial de Mathilde' } },
  // The only badge that burns: a live flame behind the skull (badge-live-fire in screens.css).
  { id: 'special-hellfire', code: 'hellfire', motif: 'hellfire', live: 'fire', foil: ['#ffe4de', '#fa8072', '#5b1717'],
    name: { en: 'To the Hellfire', fr: 'Vers le Feu de l’enfer' } },
  // The only badge in gold, and the only one that is not somebody else's.
  { id: 'special-creator', code: 'creator', motif: 'seal',   foil: ['#fff7d6', '#fbbf24', '#7c2d12'],
    name: { en: 'The Creator', fr: 'Le Créateur' } }
];

/**
 * Where every badge stands, from the evaluated achievement list
 * (achievements.evaluate() output - names already translated).
 * Returns [{ badge, rank, max, rungs, next }] in BADGES order:
 * rank 0 = locked; rungs = the achievements the chip counts, in order;
 * next = the first rung not yet unlocked, if any.
 */
export function badgeStates(evaluated, redeemed = {}) {
  const byChain = new Map();
  for (const a of evaluated) {
    if (!a.chain) continue;
    if (!byChain.has(a.chain)) byChain.set(a.chain, []);
    byChain.get(a.chain).push(a);
  }
  for (const list of byChain.values()) list.sort((a, b) => a.tier - b.tier);

  // A special badge that has not been earned is not a locked chip: it is
  // not there at all. Nobody is shown a thing they can never have.
  return BADGES.filter((badge) => !badge.code || Number(redeemed?.[badge.code] ?? 0) > 0).map((badge) => {
    if (badge.code) {
      // One rung: the code itself. Unlocked by redeeming it, nothing else.
      const on = Number(redeemed?.[badge.code] ?? 0) > 0;
      const rung = { id: `code:${badge.code}`, unlocked: on, tier: 1,
        name: tx(badge.name), desc: tx(CODE_RUNG) };
      return { badge, rank: on ? 1 : 0, max: 1, rungs: [rung], next: on ? null : rung, name: tx(badge.name) };
    }
    const rungs = badge.chain
      ? (byChain.get(badge.chain) ?? []).filter((a) => a.tier >= badge.from)
      : evaluated.filter((a) => a.id === badge.ach);
    let rank = 0;
    for (const r of rungs) { if (r.unlocked) rank++; else break; }
    return {
      badge, rank, max: rungs.length, rungs,
      next: rungs.find((r) => !r.unlocked) ?? null,
      name: tx(badge.name)
    };
  });
}

export const badgesEarned = (evaluated, redeemed = {}) =>
  badgeStates(evaluated, redeemed).filter((s) => s.rank > 0).length;

const CODE_RUNG = {
  en: 'Redeem the secret code made for you in Settings.',
  fr: 'Utilisez le code secret fait pour vous dans les Réglages.'
};

/* --- the chip --------------------------------------------------------------
 * Foil sets by rank: cool holo first, warmer and wider the higher the chip
 * has been carried. Locked chips are pressed in grey. */

const FOILS = [
  ['#3a4160', '#4a5478', '#3a4160'],                                  // locked
  ['#7ef2ff', '#7d8bff', '#e07dff'],                                  // rank I
  ['#7d8bff', '#e07dff', '#ffb37d'],                                  // rank II
  ['#7ef2ff', '#7d8bff', '#e07dff', '#ffb37d', '#7ef77f'],            // rank III
  ['#ffd75e', '#ff9d7d', '#e07dff', '#7d8bff', '#7ef2ff'],            // rank IV
  ['#fff3b8', '#ffd75e', '#ff9d7d', '#e07dff', '#8ff2ff'],            // rank V
  ['#ffffff', '#fff3b8', '#ffc5e8', '#c5b8ff', '#b8fff4']             // rank VI+
];
const ROMANS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
export const romanRank = (n) => ROMANS[Math.min(n, ROMANS.length - 1)];

const hexPoints = (r) => Array.from({ length: 6 }, (_, i) => {
  const a = (-90 + i * 60) * Math.PI / 180;
  return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

/* Line-art motifs, drawn for a 44-unit box centred on 0,0; stroke colour and
 * width come from the chip so locked and earned share the same drawings. */
const MOTIFS = {
  pack: (s) => `<g fill="none" stroke="${s}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
    <path d="M -11 -17 L 11 -17 L 14 -12 L 14 14 Q 14 17 11 17 L -11 17 Q -14 17 -14 14 L -14 -12 Z"/>
    <path d="M -11 -17 L -6 -12 L 0 -17 L 6 -12 L 11 -17"/>
    <line x1="-7" y1="5" x2="7" y2="5"/><line x1="-7" y1="10" x2="4" y2="10"/></g>`,
  cards: (s) => `<g fill="none" stroke="${s}" stroke-width="2.4" stroke-linejoin="round">
    <rect x="-16" y="-12" width="20" height="27" rx="3" transform="rotate(-8)"/>
    <rect x="-3" y="-15" width="20" height="27" rx="3" transform="rotate(7)"/>
    <polygon points="7.5,-6 9.3,-1.8 13.8,-1.6 10.3,1.2 11.5,5.6 7.5,3 3.5,5.6 4.7,1.2 1.2,-1.6 5.7,-1.8" fill="${s}" stroke="none" transform="rotate(7)"/></g>`,
  book: (s) => `<g fill="none" stroke="${s}" stroke-width="2.4" stroke-linejoin="round">
    <path d="M -15 -14 Q -15 -17 -12 -17 L 12 -17 Q 15 -17 15 -14 L 15 14 Q 15 17 12 17 L -12 17 Q -15 17 -15 14 Z"/>
    <line x1="-8" y1="-17" x2="-8" y2="17"/>
    <polygon points="4,-5 5.8,-0.8 10.3,-0.6 6.8,2.2 8,6.6 4,4 0,6.6 1.2,2.2 -2.3,-0.6 2.2,-0.8" fill="${s}" stroke="none"/></g>`,
  gem: (s) => `<g fill="none" stroke="${s}" stroke-width="2.4" stroke-linejoin="round">
    <polygon points="-14,-6 -7,-14 7,-14 14,-6 0,16"/>
    <polyline points="-14,-6 14,-6"/><polyline points="-7,-14 -4,-6 0,16"/><polyline points="7,-14 4,-6 0,16"/></g>`,
  peak: (s) => `<g fill="none" stroke="${s}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
    <path d="M -16 14 L -5 -8 L 1 2 L 7 -12 L 16 14 Z"/>
    <path d="M 7 -12 L 7 -17 L 12 -15 L 7 -13.2"/></g>`,
  star: (s) => `<g stroke="${s}" stroke-width="2.2" stroke-linejoin="round" fill="none">
    <path d="M 0 -16 Q 2.5 -2.5 16 0 Q 2.5 2.5 0 16 Q -2.5 2.5 -16 0 Q -2.5 -2.5 0 -16 Z"/>
    <circle cx="10" cy="-11" r="1.6" fill="${s}" stroke="none"/></g>`,
  relic: (s) => `<g fill="none" stroke="${s}" stroke-width="2.4" stroke-linejoin="round">
    <polygon points="0,-15 13,-4 8,14 -8,14 -13,-4"/>
    <circle cx="0" cy="1" r="5.5"/><circle cx="0" cy="1" r="1.6" fill="${s}" stroke="none"/></g>`,
  crystal: (s) => `<g fill="none" stroke="${s}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
    <polygon points="0,-16 9,-7 5,15 -5,15 -9,-7"/>
    <polyline points="-9,-7 0,-3 9,-7"/><line x1="0" y1="-3" x2="0" y2="15"/>
    <path d="M 15 -14 L 15 -8 M 12 -11 L 18 -11" stroke-width="2"/></g>`,
  quiz: (s) => `<g fill="none" stroke="${s}" stroke-width="2.8" stroke-linecap="round">
    <path d="M -7 -7 Q -7 -15 0 -15 Q 8 -15 8 -8 Q 8 -3 2 -1 Q 0 0 0 4"/>
    <circle cx="0" cy="13" r="1.8" fill="${s}" stroke="none"/></g>`,
  hourglass: (s) => `<g fill="none" stroke="${s}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
    <path d="M -10 -16 L 10 -16 L 10 -10 Q 10 -4 3 0 Q 10 4 10 10 L 10 16 L -10 16 L -10 10 Q -10 4 -3 0 Q -10 -4 -10 -10 Z"/>
    <path d="M -5 12 L 5 12 L 0 6 Z" fill="${s}" stroke="none"/></g>`,
  gift: (s) => `<g fill="none" stroke="${s}" stroke-width="2.4" stroke-linejoin="round">
    <rect x="-13" y="-6" width="26" height="21" rx="2"/><line x1="0" y1="-6" x2="0" y2="15"/>
    <path d="M 0 -6 Q -9 -8 -8 -13 Q -4 -16 0 -6 Q 4 -16 8 -13 Q 9 -8 0 -6"/></g>`,
  coin: (s) => `<g fill="none" stroke="${s}" stroke-width="2.4">
    <circle cx="0" cy="0" r="14"/><circle cx="0" cy="0" r="9.5"/>
    <line x1="0" y1="-9.5" x2="0" y2="-14"/><line x1="0" y1="9.5" x2="0" y2="14"/></g>`,
  prism: (s) => `<g fill="none" stroke="${s}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
    <polygon points="0,-13 13,10 -13,10"/>
    <line x1="-18" y1="-2" x2="-6" y2="-2"/>
    <line x1="6" y1="1" x2="17" y2="-3"/><line x1="6" y1="4" x2="18" y2="3"/><line x1="6" y1="7" x2="17" y2="9"/></g>`,
  tag: (s) => `<g fill="none" stroke="${s}" stroke-width="2.4" stroke-linejoin="round">
    <path d="M -2 -16 L 10 -16 Q 13 -16 13 -13 L 13 -1 L 1 14 Q -1 16 -3 14 L -15 0 Q -17 -2 -15 -4 Z" transform="rotate(14)"/>
    <circle cx="6" cy="-9" r="2.4" transform="rotate(14)"/></g>`,
  gavel: (s) => `<g fill="none" stroke="${s}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
    <rect x="-4" y="-16" width="14" height="9" rx="2" transform="rotate(38)"/>
    <line x1="-1" y1="1" x2="-11" y2="12"/>
    <line x1="-16" y1="16" x2="2" y2="16"/></g>`,
  scroll: (s) => `<g fill="none" stroke="${s}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
    <path d="M -13 -13 Q -9 -16 -5 -13 L -5 12 Q -9 15 -13 12 Z"/>
    <path d="M -5 -13 L 9 -13 Q 13 -13 13 -9 L 13 8 Q 13 12 9 12 L -5 12"/>
    <line x1="0" y1="-6" x2="8" y2="-6"/><line x1="0" y1="0" x2="8" y2="0"/><line x1="0" y1="6" x2="6" y2="6"/></g>`,
  heart: (s) => `<g fill="none" stroke="${s}" stroke-width="2.4" stroke-linejoin="round">
    <path d="M 0 13 Q -14 3 -14 -5 Q -14 -13 -7 -13 Q -2 -13 0 -8 Q 2 -13 7 -13 Q 14 -13 14 -5 Q 14 3 0 13 Z"/>
    <path d="M -5 -4 L -1 -4 L 1 -8 L 3 0 L 5 -4" stroke-width="1.8"/></g>`,
  /* A speech bubble laughing: shut eyes, wide mouth. */
  laugh: (s) => `<g fill="none" stroke="${s}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
    <path d="M -16 -14 Q -16 -17 -13 -17 L 13 -17 Q 16 -17 16 -14 L 16 5 Q 16 8 13 8 L -2 8 L -10 16 L -8 8 L -13 8 Q -16 8 -16 5 Z"/>
    <path d="M -10 -8 Q -7 -12 -4 -8 M 4 -8 Q 7 -12 10 -8"/>
    <path d="M -8 -2 Q 0 8 8 -2 Z" fill="${s}"/></g>`,
  /* A winged bull, in profile. */
  lamassu: (s) => `<g fill="none" stroke="${s}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M -16 4 Q -14 -6 -2 -8 L 12 -8 Q 17 -8 17 -3 L 17 14 M 12 14 L 12 4 M 4 14 L 4 4 M -4 14 L -4 4 M -12 14 L -12 3"/>
    <path d="M -2 -8 Q -5 -16 3 -18 L 12 -18 Q 17 -18 17 -13 L 17 -8"/>
    <path d="M -3 -7 L -13 -13 Q -14 -3 -3 0 Z"/>
    <path d="M 6 -20 L 5 -24 M 12 -20 L 13 -24"/></g>`,
  /* An eight-bit heart. */
  pixel: (s) => `<g fill="${s}" stroke="none">
    <path d="M -14 -10 h 6 v -4 h 6 v 4 h 4 v -4 h 6 v 4 h 6 v 8 h -4 v 4 h -4 v 4 h -4 v 4 h -4 v -4 h -4 v -4 h -4 v -4 h -4 Z" fill="none" stroke="${s}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M -10 -8 h 4 v 4 h -4 Z"/></g>`,
  /* Two dice, one showing five, one showing three. */
  dice: (s) => `<g fill="none" stroke="${s}" stroke-width="2.2" stroke-linejoin="round">
    <rect x="-17" y="-12" width="16" height="16" rx="3" transform="rotate(-10)"/>
    <rect x="2" y="-4" width="16" height="16" rx="3" transform="rotate(10)"/>
    <g fill="${s}" stroke="none">
      <circle cx="-13" cy="-9" r="1.6" transform="rotate(-10)"/><circle cx="-5" cy="-9" r="1.6" transform="rotate(-10)"/>
      <circle cx="-9" cy="-4" r="1.6" transform="rotate(-10)"/>
      <circle cx="-13" cy="1" r="1.6" transform="rotate(-10)"/><circle cx="-5" cy="1" r="1.6" transform="rotate(-10)"/>
      <circle cx="6" cy="0" r="1.6" transform="rotate(10)"/><circle cx="10" cy="4" r="1.6" transform="rotate(10)"/><circle cx="14" cy="8" r="1.6" transform="rotate(10)"/>
    </g></g>`,
  /* A wax seal with the W pressed into it, for The Creator. */
  seal: (s) => `<g fill="none" stroke="${s}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M0 -15 Q9 -17 13 -9 Q19 -4 15 4 Q16 12 8 15 Q2 20 -5 16 Q-13 17 -15 9 Q-20 3 -15 -3 Q-16 -11 -8 -13 Q-5 -18 0 -15 Z"/>
    <path d="M-8 -5 L-4 6 L0 -2 L4 6 L8 -5"/></g>`,
  /* A half wheel of cheese under the lamp, for Julien. */
  wheel: (s) => `<g fill="none" stroke="${s}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M-17 4 A17 17 0 0 1 17 4 Z"/><path d="M-17 4 v7 h34 v-7"/><path d="M-6 -2 a2 2 0 1 0 .1 0 M6 -4 a1.6 1.6 0 1 0 .1 0"/></g>`,
  /* An open book, for Catherine. */
  openbook: (s) => `<g fill="none" stroke="${s}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M0 -9 Q-8 -14 -17 -11 V11 Q-8 8 0 13 Q8 8 17 11 V-11 Q8 -14 0 -9 Z"/><path d="M0 -9 V13"/><path d="M-12 -6 Q-7 -7 -4 -5 M-12 0 Q-7 -1 -4 1 M4 -5 Q7 -7 12 -6 M4 1 Q7 -1 12 0"/></g>`,
  /* A pot of yoghurt with the spoon in it, for Mathilde. */
  pot: (s) => `<g fill="none" stroke="${s}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M-13 -8 h26 l-3 22 h-20 Z"/><path d="M-15 -8 h30"/><path d="M4 -15 l6 12"/><path d="M-8 2 h6"/></g>`,
  /* A skull in flames, for the Hellfire code. */
  hellfire: (s) => `<g fill="none" stroke="${s}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M-9 4 a9 8 0 0 1 18 0 c0 3-1.5 5-3.5 6.5 V15 h-11 v-4.5 C-7.5 9 -9 7 -9 4 Z"/>
    <path d="M-5 4 a1.8 1.8 0 1 0 .1 0 M5 4 a1.8 1.8 0 1 0 .1 0"/><path d="M-2 15 v2 M2 15 v2"/>
    <path d="M0 -19 c-3 4 -6 7 -6 11 0 2 1 3 2 4 0-3 1-4 3-5 -1 2 0 4 1 5 1-1 2-3 2-5 2 1 3 2 3 5 1-1 2-2 2-4 0-4 -4 -7 -7 -11 Z"/>
    <path d="M-14 -3 c-2 3 -3 6 -2 9 M14 -3 c2 3 3 6 2 9"/></g>`
};

/**
 * One chip. `rank` 0 draws the locked press; higher ranks brighten the foil
 * and add a pip per rank under the motif. Ids are deterministic so repeated
 * chips share definitions instead of fighting over them.
 */
export function badgeSvg(badge, rank, max, { size = 64 } = {}) {
  const uid = `pwb-${badge.id}-${Math.min(rank, FOILS.length - 1)}`;
  const foil = rank > 0 && badge.foil ? badge.foil : FOILS[Math.min(rank, FOILS.length - 1)];
  const locked = rank <= 0;
  const stops = foil.map((c, i) => [i / Math.max(foil.length - 1, 1), c]);
  const ink = locked ? '#67719c' : '#ffffff';

  const pipRow = max > 1 ? Array.from({ length: max }, (_, i) => {
    const x = (i - (max - 1) / 2) * 8;
    const on = i < rank;
    return `<polygon points="${x},23.6 ${x + 2.6},26.2 ${x},28.8 ${x - 2.6},26.2"
      fill="${on ? foil[Math.min(1, foil.length - 1)] : 'none'}" stroke="${on ? 'none' : '#4a5478'}" stroke-width="1"/>`;
  }).join('') : '';

  const live = !locked && badge.live ? ` class="badge-live badge-live-${badge.live}"` : '';
  return `<svg viewBox="-50 -46 100 96" width="${size}" height="${size * 0.96}" aria-hidden="true" style="display:block"${live}>
    <defs>
      <linearGradient id="${uid}g" x1="0" y1="0" x2="1" y2="1">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>
      <clipPath id="${uid}c"><polygon points="${hexPoints(40)}"/></clipPath>
    </defs>
    <polygon points="${hexPoints(40)}" fill="url(#${uid}g)" stroke="${locked ? '#4a5478' : '#ffffff'}" stroke-opacity="${locked ? 1 : 0.8}" stroke-width="1.8" stroke-linejoin="round"/>
    <polygon points="${hexPoints(32.5)}" fill="#151936" fill-opacity="${locked ? 0.92 : 0.82}"/>
    ${live ? `<g clip-path="url(#${uid}c)" class="badge-flames">
      <path class="badge-flame is-1" d="M-26 40 C-24 22 -14 14 -18 -2 C-8 8 -6 20 -10 34 C-2 22 4 8 -2 -8 C10 4 12 22 6 34 C14 24 18 10 12 -4 C24 10 26 26 26 40 Z" fill="#fa8072" opacity="0.55"/>
      <path class="badge-flame is-2" d="M-22 40 C-20 26 -12 20 -14 8 C-6 16 -4 26 -8 36 C-2 26 2 16 -2 4 C8 14 10 26 4 36 C12 28 14 16 10 6 C20 16 22 30 22 40 Z" fill="#ffb3a7" opacity="0.5"/>
      <path class="badge-flame is-3" d="M-14 40 C-12 30 -8 26 -8 18 C-2 24 0 30 -2 38 C2 30 6 24 4 16 C10 24 12 32 12 40 Z" fill="#fff1ec" opacity="0.55"/>
    </g>` : ''}
    <g transform="translate(0,-3)">${(MOTIFS[badge.motif] ?? MOTIFS.star)(ink)}</g>
    ${pipRow}
    ${locked ? '' : `<g clip-path="url(#${uid}c)"><rect x="-64" y="-13" width="128" height="14" fill="#ffffff" opacity=".3" transform="rotate(-32)"/></g>`}
  </svg>`;
}
