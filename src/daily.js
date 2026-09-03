/**
 * The daily gift: a week-long ladder on the world's clock.
 *
 * One gift a day, on UTC days, so the gift turns over at the same moment for
 * everyone, the moment the quests and the leaderboard do. Seven rungs make a
 * week: coins on most days, a booster on the third and sixth, and on the
 * seventh both coins and a tier booster. Claim seven days running and the
 * week is complete and a new one starts; miss a day and the ladder goes back
 * to its first rung, the way a streak does. Completed weeks are remembered
 * and pay a little loyalty on every coin gift after them.
 *
 * Sized against the economy: the shop pays 500 every restock, up to 2,000
 * banked, so a full week here (about 4,000 coins and three boosters) is a
 * good day's stipends spread over seven days: a reason to come back, never a
 * way to get rich.
 */
import { THEME_PACKS } from './data/packs.js';

export const WEEK = 7;

/** UTC calendar day, as a count of days since the epoch. */
export const utcDayNumber = (now = Date.now()) => Math.floor(now / 86400000);

/** Milliseconds until the next 00:00 UTC. */
export const msUntilNextUtcDay = (now = Date.now()) => (utcDayNumber(now) + 1) * 86400000 - now;

/** Deterministic PRNG, so a week's boosters are the same on every device. */
function seeded(seed) {
  let a = (seed >>> 0) + 0x9e3779b9;
  return () => {
    a = Math.imul(a ^ (a >>> 15), a | 1);
    a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  };
}

/** Two percent a completed week, up to half again after twenty-five. */
export const loyaltyPct = (weeks) => Math.min(50, 2 * (Number(weeks) || 0));
const withLoyalty = (coins, weeks) => Math.round((coins * (1 + loyaltyPct(weeks) / 100)) / 10) * 10;

/**
 * The seven gifts of a week. `weeks` is how many weeks were completed before
 * it: it seeds which subjects the boosters draw from and lifts the coins.
 */
export function weekLadder(weeks = 0) {
  const rng = seeded((Number(weeks) || 0) * 7919 + 101);
  const theme = () => THEME_PACKS[Math.floor(rng() * THEME_PACKS.length)].id;
  const booster = (rarityId, cards) => ({ kind: 'theme', themeId: theme(), rarityId, cards });
  return [
    { day: 1, coins: withLoyalty(250, weeks) },
    { day: 2, coins: withLoyalty(350, weeks) },
    { day: 3, spec: booster(null, 3) },
    { day: 4, coins: withLoyalty(500, weeks) },
    { day: 5, coins: withLoyalty(700, weeks) },
    { day: 6, spec: booster('rare', 4) },
    { day: 7, coins: withLoyalty(1000, weeks), spec: booster('epic', 5) }
  ];
}

/* --- claim state ---------------------------------------------------------- */

export const emptyDaily = () => ({ v: 2, day: 0, weeks: 0, lastDay: null, shownDay: null });

/**
 * A record from before the week existed (thirty-slot boards on local days)
 * is carried over: the slot reached becomes the rung, the boards become
 * weeks, and a claim made today (by the local clock) still counts as today.
 */
export function normalizeDaily(daily, now = Date.now()) {
  if (daily && daily.v === 2) return daily;
  const old = daily ?? {};
  const claimed = Number(old.claimed) || 0;
  const boards = Number(old.board) || 0;
  const localToday = Math.floor((now - new Date(now).getTimezoneOffset() * 60000) / 86400000);
  // The old record counted local days; how many days ago it was claimed is
  // the same count on either clock, near enough.
  const ago = Number.isFinite(old.lastDay) ? Math.max(0, localToday - old.lastDay) : null;
  return {
    v: 2,
    day: claimed % WEEK,
    weeks: Math.floor((boards * 30 + claimed) / WEEK),
    lastDay: ago == null ? null : utcDayNumber(now) - ago,
    shownDay: null
  };
}

/** Whether the streak reaches today: the last claim was yesterday or today. */
export const streakAlive = (daily, now = Date.now()) =>
  daily?.lastDay != null && daily.lastDay >= utcDayNumber(now) - 1;

/** A gift is waiting whenever the last claim was on an earlier UTC day. */
export const canClaim = (daily, now = Date.now()) => (daily?.lastDay ?? null) !== utcDayNumber(now);

/** The rung that would be handed over next (0-based); a broken streak starts over. */
export const nextIndex = (daily, now = Date.now()) =>
  (!daily?.lastDay || streakAlive(daily, now)) ? (Number(daily?.day) || 0) % WEEK : 0;

/**
 * Take today's gift. Returns { index, day, gift, weekDone }, or null when
 * today's has already been taken. Finishing the seventh rung completes the
 * week on the spot.
 */
export function claim(daily, now = Date.now()) {
  if (!canClaim(daily, now)) return null;
  if (daily.lastDay != null && !streakAlive(daily, now)) daily.day = 0;
  const index = (Number(daily.day) || 0) % WEEK;
  const gift = weekLadder(daily.weeks)[index];
  daily.day = index + 1;
  daily.lastDay = utcDayNumber(now);
  let weekDone = false;
  if (daily.day >= WEEK) {
    daily.day = 0;
    daily.weeks = (Number(daily.weeks) || 0) + 1;
    weekDone = true;
  }
  return { index, day: index + 1, gift, weekDone };
}
