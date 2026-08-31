/**
 * Timed boosters.
 *
 * A small booster accrues on a timer whether you are playing or not, up to a
 * cap. They are the floor of the game: a player with no cards and no money
 * still has something to open in ten minutes.
 *
 * They must not become the whole game, so:
 *   - they are always three cards,
 *   - their odds start badly nerfed and only reach the normal table at the
 *     very top of the track,
 *   - and the track is long. Levelling all ten takes 2,100 opened boosters,
 *     which at a realistic thirty to fifty a day is a couple of months.
 *
 * Levelling improves all three axes at once — odds, cap and speed — so the
 * track is felt rather than read.
 */
import { RARITIES } from './data/rarities.js';

export const MAX_TIMED_LEVEL = 10;
export const TIMED_CARDS = 3;

/**
 * Cumulative timed boosters opened to reach each level. Index 0 is level 1, so
 * LEVEL_STEPS[n] is the total needed for level n + 1.
 */
const LEVEL_STEPS = [0, 20, 55, 110, 200, 340, 560, 900, 1400, 2100];

export function timedLevel(opened = 0) {
  let level = 1;
  for (let i = 1; i < LEVEL_STEPS.length; i++) if (opened >= LEVEL_STEPS[i]) level = i + 1;
  return level;
}

/** Opened count at which the current level started, and at which it ends. */
export function levelBounds(opened = 0) {
  const level = timedLevel(opened);
  const from = LEVEL_STEPS[level - 1];
  const to = level >= MAX_TIMED_LEVEL ? LEVEL_STEPS[MAX_TIMED_LEVEL - 1] : LEVEL_STEPS[level];
  return { level, from, to };
}

/** Progress through the current level, 0..1. */
export function levelProgress(opened = 0) {
  const { level, from, to } = levelBounds(opened);
  if (level >= MAX_TIMED_LEVEL) return 1;
  return Math.min(1, Math.max(0, (opened - from) / (to - from)));
}

/* --- what a level buys ---------------------------------------------------- */

const lerp = (a, b, level) => a + (b - a) * ((level - 1) / (MAX_TIMED_LEVEL - 1));

/** 10 minutes at level 1 down to 3 at level 10. */
export const regenMs = (level) => Math.round(lerp(10, 3, level) * 60 * 1000);

/** 7 held at level 1 up to 20 at level 10. */
export const maxHeld = (level) => Math.round(lerp(7, 20, level));

/**
 * What a free pack may pull. Rarity belongs to the article now, so the track
 * gates FAME instead of odds: at level 1 a free pack only draws pages up to
 * the Rare band; each level raises the ceiling until level 10 lifts it
 * entirely and a free pack can hand you anything.
 */
export function timedDrawCaps(level) {
  const cap = lerp(0.755, 1, level);   // Epic's floor at level 1, open at 10
  return { minPopularity: null, maxPopularity: cap >= 0.995 ? null : cap };
}

/** The best tier a free pack can reach at this level, for the track UI. */
export function timedTopTier(level) {
  const { maxPopularity } = timedDrawCaps(level);
  if (maxPopularity === null) return RARITIES[RARITIES.length - 1];
  for (let i = RARITIES.length - 1; i >= 0; i--) {
    if (RARITIES[i].minPop < maxPopularity) return RARITIES[i];
  }
  return RARITIES[0];
}

/** The booster a timed slot hands over. */
export const timedSpec = (level) => ({
  kind: 'timed',
  themeId: null,
  rarityId: null,
  cards: TIMED_CARDS,
  timedLevel: level
});

/* --- accrual -------------------------------------------------------------- */

export const emptyTimed = () => ({ count: 0, last: Date.now(), opened: 0 });

/**
 * Bring a stored timed record up to date.
 *
 * `last` advances by whole intervals only, so the fraction of an interval you
 * were away for is not thrown away. Once the cap is reached the clock is
 * pinned to now: time spent full does not bank, otherwise a week away would
 * refill the moment you spent one.
 */
export function accrue(timed, now = Date.now()) {
  const level = timedLevel(timed.opened ?? 0);
  const cap = maxHeld(level);
  const step = regenMs(level);

  if (!Number.isFinite(timed.last)) timed.last = now;
  if ((timed.count ?? 0) >= cap) {
    timed.count = cap;
    timed.last = now;
    return timed;
  }

  const earned = Math.floor((now - timed.last) / step);
  if (earned > 0) {
    const room = cap - timed.count;
    const added = Math.min(room, earned);
    timed.count += added;
    timed.last = timed.count >= cap ? now : timed.last + earned * step;
  }
  return timed;
}

/** Milliseconds until one more arrives, or null when full. */
export function msToNext(timed, now = Date.now()) {
  const level = timedLevel(timed.opened ?? 0);
  if ((timed.count ?? 0) >= maxHeld(level)) return null;
  return Math.max(0, timed.last + regenMs(level) - now);
}

/** Human-readable summary of what the next level changes. */
export function levelPerks(level) {
  return {
    regen: Math.round(regenMs(level) / 60000),
    max: maxHeld(level),
    // The top tier reachable in practice, for the "odds improve" line.
    top: RARITIES[RARITIES.length - 1].id
  };
}
