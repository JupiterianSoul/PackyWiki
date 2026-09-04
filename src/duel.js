// @ts-check
/**
 * THE POPULARITY DUEL
 * ============================================================================
 * Two of your own cards. One shows how many people read its article in a
 * month; the other asks: more, or fewer? Right, and the challenger takes the
 * left seat and a new one walks in; wrong, and the round is over. The cards
 * are the player's, drawn from the album, so the game is about knowing what
 * you collected: Paris against a bacterium is easy, a city against a river is
 * not.
 *
 * Points climb with the streak (100, 110, 120...) and a full round of
 * DUEL_ROUND_LENGTH right answers is a perfect, worth a bonus. Three rounds
 * a day; coins are a share of the points. This module is the arithmetic and
 * the day's ledger; the screen is src/app/duel.js.
 */

/** Right answers in a row that end a round as a perfect. */
export const DUEL_ROUND_LENGTH = 15;
/** Rounds a day. */
export const DUEL_PER_DAY = 3;
/** Points for the first right answer; each one after adds DUEL_STEP more. */
export const DUEL_BASE = 100;
export const DUEL_STEP = 10;
/** On top of a perfect round. */
export const DUEL_PERFECT_BONUS = 500;
/** Coins per point. */
export const DUEL_COIN_RATE = 0.25;
/** Different cards with a readership the game needs before it opens. */
export const DUEL_MIN_CARDS = 10;
/** The most a round can be worth; the server refuses anything above it. */
export const DUEL_MAX_POINTS = pointsFor(DUEL_ROUND_LENGTH) + DUEL_PERFECT_BONUS;

const STATE_KEY = 'wikster.duel.v1';

export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** Points for a streak of `n` right answers, before any bonus. */
export function pointsFor(n) {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += DUEL_BASE + DUEL_STEP * i;
  return sum;
}

/** What one more right answer is worth at this streak. */
export const nextPoints = (streak) => DUEL_BASE + DUEL_STEP * streak;

export const coinsFor = (points) => Math.round(points * DUEL_COIN_RATE);

/** The cards a duel can use: a readership on record, and not the same twice. */
export function eligible(entries) {
  const seen = new Set();
  return entries.filter((e) => {
    const views = Number(e?.views);
    if (!e?.key || !e.title || !Number.isFinite(views) || views <= 0 || e.special) return false;
    if (seen.has(e.key)) return false;
    seen.add(e.key);
    return true;
  });
}

export const canPlay = (entries) => eligible(entries).length >= DUEL_MIN_CARDS;

/**
 * A challenger for the card in the left seat: a different readership (so
 * there is a right answer), not just used, and picked at random among the
 * rest. `rng` is injectable for the tests.
 */
export function challengerFor(left, pool, used, rng = Math.random) {
  const options = pool.filter((e) => e.key !== left.key && !used.has(e.key) && Number(e.views) !== Number(left.views));
  if (!options.length) return null;
  return options[Math.floor(rng() * options.length)];
}

/** A fresh round on this pool: the first two seats filled, nothing scored. */
export function startRound(entries, rng = Math.random) {
  const pool = eligible(entries);
  if (pool.length < DUEL_MIN_CARDS) return null;
  const left = pool[Math.floor(rng() * pool.length)];
  const used = new Set([left.key]);
  const right = challengerFor(left, pool, used, rng);
  if (!right) return null;
  used.add(right.key);
  return { pool, used, left, right, streak: 0, points: 0, over: false, perfect: false, last: null };
}

/**
 * The player's call: 'higher' means the right card has more readers than the
 * left. Returns the round moved on: a new challenger on a right answer, over
 * on a wrong one, perfect at DUEL_ROUND_LENGTH.
 */
export function answer(round, call, rng = Math.random) {
  if (!round || round.over) return round;
  const higher = Number(round.right.views) > Number(round.left.views);
  const right = (call === 'higher') === higher;
  const last = { left: round.left, right: round.right, call, correct: right };
  if (!right) return { ...round, over: true, last };
  const streak = round.streak + 1;
  const points = round.points + nextPoints(round.streak);
  if (streak >= DUEL_ROUND_LENGTH) {
    return { ...round, streak, points: points + DUEL_PERFECT_BONUS, over: true, perfect: true, last };
  }
  const used = new Set(round.used);
  const challenger = challengerFor(round.right, round.pool, used, rng);
  if (!challenger) return { ...round, streak, points, over: true, last };
  used.add(challenger.key);
  return { ...round, used, left: round.right, right: challenger, streak, points, over: false, last };
}

/* --- the day's ledger --------------------------------------------------- */

export function loadDay(now = Date.now()) {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null'); } catch { /* unreadable */ }
  const day = utcDay(now);
  if (!saved || saved.day !== day) return { day, rounds: 0, best: 0, points: 0 };
  return { day, rounds: Number(saved.rounds) || 0, best: Number(saved.best) || 0, points: Number(saved.points) || 0 };
}

export function saveDay(ledger) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(ledger)); } catch { /* session-only */ }
}

export const roundsLeft = (now = Date.now()) => Math.max(0, DUEL_PER_DAY - loadDay(now).rounds);

/** Files a finished round: one more played, the best kept, the points summed. */
export function recordRound(round, now = Date.now()) {
  const ledger = loadDay(now);
  ledger.rounds += 1;
  ledger.best = Math.max(ledger.best, round.points);
  ledger.points += round.points;
  saveDay(ledger);
  return ledger;
}
