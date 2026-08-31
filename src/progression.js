/**
 * Player progression: experience, levels, ranks and level rewards.
 *
 * XP comes from CARDS, never from money or from buying things, so the only
 * way to level is to actually open boosters and see what is inside. A card is
 * worth XP by its tier, on roughly the same curve as its price, which means a
 * lucky Artifact is a genuine jump without being the only thing that matters.
 *
 * The curve is deliberately long. Level 500 is an endgame number: at the
 * average of ~33 XP per card it takes on the order of eighteen thousand
 * boosters, so the last levels are years of casual play rather than a weekend.
 * Early levels are quick - the first booster nearly finishes level 1 - because
 * the point of the first hour is to feel the system working.
 */
import { RARITIES, rarityRank } from './data/rarities.js';
import { THEME_PACKS } from './data/packs.js';

export const MAX_LEVEL = 500;

/** XP for one card, by tier. */
const XP_BY_RANK = [12, 20, 34, 62, 130, 280, 600, 1300];

export const xpForCard = (rarityId) => XP_BY_RANK[rarityRank(rarityId)] ?? XP_BY_RANK[0];

/**
 * XP to get from `level` to `level + 1`. Mostly linear with a gentle curve on
 * top, so the requirement grows without the late game becoming a wall.
 */
export function xpForLevel(level) {
  if (level >= MAX_LEVEL) return Infinity;
  const raw = 180 + (level - 1) * 17 + Math.pow(level, 1.25) * 1.6;
  return Math.round(raw / 5) * 5;
}

/* --- ranks ---------------------------------------------------------------- */

/**
 * A name for where you are. Ranks are wide on purpose: crossing one should be
 * rare enough to be worth noticing.
 */
export const RANKS = [
  { min: 1,   name: { en: 'Newcomer',      fr: 'Nouveau venu' } },
  { min: 10,  name: { en: 'Collector',     fr: 'Collectionneur' } },
  { min: 25,  name: { en: 'Archivist',     fr: 'Archiviste' } },
  { min: 50,  name: { en: 'Curator',       fr: 'Conservateur' } },
  { min: 80,  name: { en: 'Scholar',       fr: 'Érudit' } },
  { min: 120, name: { en: 'Historian',     fr: 'Historien' } },
  { min: 170, name: { en: 'Sage',          fr: 'Sage' } },
  { min: 230, name: { en: 'Luminary',      fr: 'Sommité' } },
  { min: 300, name: { en: 'Polymath',      fr: 'Polymathe' } },
  { min: 400, name: { en: 'Encyclopedist', fr: 'Encyclopédiste' } }
];

export const rankFor = (level) =>
  [...RANKS].reverse().find((rank) => level >= rank.min) ?? RANKS[0];

/* --- level rewards -------------------------------------------------------- */

/**
 * What level `level` pays out. Every level gives something; the shape varies
 * so the ladder has texture, but the value stays modest next to the shop
 * stipend - levelling is a pace-setter, not an income stream.
 */
export function rewardForLevel(level) {
  const coins = Math.round((90 + level * 11) / 5) * 5;

  if (level % 25 === 0) {
    return { type: 'both', coins: coins * 4, spec: rewardBooster(level, 'high') };
  }
  if (level % 10 === 0) {
    return { type: 'booster', spec: rewardBooster(level, 'mid') };
  }
  if (level % 5 === 0) {
    return { type: 'booster', spec: rewardBooster(level, 'low') };
  }
  return { type: 'coins', coins };
}

/** The tier a level reward is allowed to reach, so early levels stay tame. */
function rewardTier(level, grade) {
  const ceiling = level >= 300 ? 6 : level >= 150 ? 5 : level >= 60 ? 4 : level >= 20 ? 3 : 2;
  const wanted = grade === 'high' ? 4 : grade === 'mid' ? 3 : 1;
  return RARITIES[Math.min(ceiling, wanted + Math.floor(level / 100))].id;
}

function rewardBooster(level, grade) {
  // Deterministic: the same level always pays the same booster, so the
  // "next reward" shown on the profile is the reward you actually get.
  const theme = THEME_PACKS[(level * 7) % THEME_PACKS.length];
  return {
    kind: 'theme',
    themeId: theme.id,
    rarityId: grade === 'low' ? null : rewardTier(level, grade),
    cards: grade === 'high' ? 6 : grade === 'mid' ? 5 : 4
  };
}

/* --- applying XP ---------------------------------------------------------- */

/**
 * Add XP to a progress record, rolling over as many levels as it earns.
 * Returns the levels gained so the UI can walk the player through them one at
 * a time, each with its own reward to claim.
 */
export function addXp(progress, amount) {
  const gained = [];
  progress.xp = (progress.xp ?? 0) + Math.max(0, Math.round(amount));
  progress.level = progress.level ?? 1;

  while (progress.level < MAX_LEVEL && progress.xp >= xpForLevel(progress.level)) {
    progress.xp -= xpForLevel(progress.level);
    progress.level += 1;
    gained.push(progress.level);
  }
  if (progress.level >= MAX_LEVEL) progress.xp = 0;
  return gained;
}

/** Where the bar sits, as a fraction. */
export function levelFraction(progress) {
  const level = progress.level ?? 1;
  if (level >= MAX_LEVEL) return 1;
  const need = xpForLevel(level);
  return need > 0 ? Math.min(1, (progress.xp ?? 0) / need) : 0;
}
