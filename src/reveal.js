// @ts-check
/**
 * GUESS THE ARTICLE
 * ============================================================================
 * A card's picture, blurred past recognition, and four titles: which one is
 * it? The blur lifts in steps, and every step it lifts costs points, so the
 * game is between a bold early guess and a safe late one. Cards and decoys
 * come from the player's own album, the decoys from the same album as the
 * answer where there are enough, so "the one animal among three cities" is
 * never the tell. Eight cards a round, three rounds a day; coins are a share
 * of the points. The screen is src/app/reveal.js.
 */

/** Cards in a round. */
export const REVEAL_ROUND_LENGTH = 8;
/** Rounds a day. */
export const REVEAL_PER_DAY = 3;
/**
 * Points by the step the blur is at when the right title is picked, and the
 * blur at each step in pixels of a 300-pixel picture.
 *
 * Three steps, not four: the round used to open at a blur nothing could be
 * read through, so the first step was never a real chance to answer, only a
 * few seconds of waiting. It now opens where a good eye has something to go
 * on, and the two steps after it are the ones that were already right.
 */
export const REVEAL_POINTS = [200, 120, 60];
export const REVEAL_BLUR = [14, 7, 2];
/** How long a step lasts before the blur lifts on its own, in milliseconds. */
export const REVEAL_STEP_MS = 6000;
/** Coins per point. */
export const REVEAL_COIN_RATE = 0.3;
/** Titles offered per card. */
export const REVEAL_CHOICES = 4;
/** Different cards with a picture the game needs before it opens. */
export const REVEAL_MIN_CARDS = 12;
/** The most a round can be worth; the server refuses anything above it. */
export const REVEAL_MAX_POINTS = REVEAL_ROUND_LENGTH * REVEAL_POINTS[0];

const STATE_KEY = 'wikster.reveal.v1';

export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

export const coinsFor = (points) => Math.round(points * REVEAL_COIN_RATE);

/** Whether a card is one the adult filter would blur; the app passes its own. */
const never = /** @type {(card: object) => boolean} */ (() => false);

/**
 * The cards a round can show: a real picture, a title, and not adult.
 * @param {object[]} entries
 * @param {(card: object) => boolean} [isSensitive]
 */
export function eligible(entries, isSensitive = never) {
  const seen = new Set();
  return entries.filter((e) => {
    if (!e?.key || !e.title || !e.thumbnail || e.special) return false;
    if (seen.has(e.key) || isSensitive(e)) return false;
    seen.add(e.key);
    return true;
  });
}

/** @param {object[]} entries @param {(card: object) => boolean} [isSensitive] */
export const canPlay = (entries, isSensitive = never) => eligible(entries, isSensitive).length >= REVEAL_MIN_CARDS;

const shuffle = (list, rng) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * The titles offered for one card: the answer and three decoys, from the
 * same album when it has three others, from the whole pool otherwise, in a
 * random order.
 */
export function choicesFor(card, pool, rng = Math.random) {
  const others = pool.filter((e) => e.key !== card.key && e.title !== card.title);
  const sameAlbum = others.filter((e) => e.packId && e.packId === card.packId);
  const from = sameAlbum.length >= REVEAL_CHOICES - 1 ? sameAlbum : others;
  const decoys = shuffle(from, rng).slice(0, REVEAL_CHOICES - 1);
  return shuffle([card, ...decoys], rng).map((e) => ({ key: e.key, title: e.title }));
}

/**
 * A round: REVEAL_ROUND_LENGTH cards drawn without repeats, each with its titles.
 * @param {object[]} entries
 * @param {{ isSensitive?: (card: object) => boolean, rng?: () => number }} [options]
 */
export function startRound(entries, { isSensitive = never, rng = Math.random } = {}) {
  const pool = eligible(entries, isSensitive);
  if (pool.length < REVEAL_MIN_CARDS) return null;
  const cards = shuffle(pool, rng).slice(0, REVEAL_ROUND_LENGTH);
  return {
    items: cards.map((card) => ({ card, choices: choicesFor(card, pool, rng), step: 0, picked: null, points: 0 })),
    index: 0, points: 0, over: false, right: 0
  };
}

/** The blur lifted one step; nothing to do past the last. */
export function lift(round) {
  const item = round.items[round.index];
  if (!item || item.picked !== null) return round;
  if (item.step >= REVEAL_BLUR.length - 1) return round;
  const items = round.items.map((it, i) => (i === round.index ? { ...it, step: it.step + 1 } : it));
  return { ...round, items };
}

/** The player's pick for the current card: scored by the step, then on to the next. */
export function pick(round, key) {
  const item = round.items[round.index];
  if (!item || item.picked !== null || round.over) return round;
  const correct = key === item.card.key;
  const points = correct ? REVEAL_POINTS[item.step] : 0;
  const items = round.items.map((it, i) => (i === round.index ? { ...it, picked: key, points, correct } : it));
  return { ...round, items, points: round.points + points, right: round.right + (correct ? 1 : 0) };
}

/** After a pick is shown: the next card, or the round over. */
export function advance(round) {
  const item = round.items[round.index];
  if (!item || item.picked === null) return round;
  if (round.index + 1 >= round.items.length) return { ...round, over: true };
  return { ...round, index: round.index + 1 };
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

export const roundsLeft = (now = Date.now()) => Math.max(0, REVEAL_PER_DAY - loadDay(now).rounds);

export function recordRound(round, now = Date.now()) {
  const ledger = loadDay(now);
  ledger.rounds += 1;
  ledger.best = Math.max(ledger.best, round.points);
  ledger.points += round.points;
  saveDay(ledger);
  return ledger;
}
