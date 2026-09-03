/**
 * WIKDLE
 * ============================================================================
 * The encyclopaedia's word of the day, guessed in six rows of five. One
 * puzzle a day for everyone, chosen by the UTC date so the whole world plays
 * the same word and a phone's clock cannot fetch tomorrow's; a guess has to
 * be a real word before it costs a row; and the board is written down after
 * every guess, so a game survives a closed app and cannot be replayed once
 * it is over.
 *
 * Scoring follows the game everyone knows, duplicates included: a letter is
 * GREEN in its right place, YELLOW where the word has an unclaimed copy of it
 * somewhere else, GRAY otherwise, and a word with one E never lights two.
 */
import { ANSWERS, DICTIONARY } from './data/wikdle-words.js';

export const ROWS = 6;
export const COLUMNS = 5;
const STATE_KEY = 'wikster.wikdle.v1';

/** The UTC day, as the calendar date the puzzle belongs to. */
export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** Milliseconds until the next puzzle, for the countdown after a finished one. */
export const msToNextDay = (now = Date.now()) => {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.getTime() - now;
};

/**
 * The day's word. A hash of the date walks the answer list so consecutive
 * days are not consecutive words, and the walk is a permutation, so a word
 * does not come back until every other has been used.
 */
export function wordForDay(day = utcDay()) {
  let h = 2166136261;
  for (const ch of `wikdle:${day}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const n = ANSWERS.length;
  // A stride coprime with the list length visits every word once.
  const stride = 7919 % n || 1;
  const index = (Math.floor(h / 97) * stride + (h % n)) % n;
  return ANSWERS[index];
}

/** Whether a guess is a word the dictionary knows. */
export const isWord = (guess) => DICTIONARY.has(String(guess ?? '').toLowerCase());

/**
 * One row scored against the answer: an array of 'hit' | 'near' | 'miss'.
 * Exact matches are claimed first, so a letter in its place can never be
 * robbed by an earlier copy of it elsewhere; then each remaining guess
 * letter takes one unclaimed copy from the answer, if there is one.
 */
export function scoreGuess(guess, answer) {
  const g = String(guess).toLowerCase().split('');
  const a = String(answer).toLowerCase().split('');
  const marks = new Array(COLUMNS).fill('miss');
  const left = {};
  for (let i = 0; i < COLUMNS; i++) {
    if (g[i] === a[i]) marks[i] = 'hit';
    else left[a[i]] = (left[a[i]] ?? 0) + 1;
  }
  for (let i = 0; i < COLUMNS; i++) {
    if (marks[i] === 'hit') continue;
    if (left[g[i]] > 0) { marks[i] = 'near'; left[g[i]]--; }
  }
  return marks;
}

/** The keyboard's memory: the best mark seen for every letter. */
export function keyMarks(rows) {
  const rank = { miss: 1, near: 2, hit: 3 };
  const best = {};
  for (const row of rows) {
    row.guess.split('').forEach((ch, i) => {
      const mark = row.marks[i];
      if ((rank[mark] ?? 0) > (rank[best[ch]] ?? 0)) best[ch] = mark;
    });
  }
  return best;
}

/* --- persistence ---------------------------------------------------------- */

const blank = (day) => ({ day, rows: [], status: 'playing', startedAt: Date.now(), finishedAt: null });

function readAll() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function writeAll(all) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(all)); } catch { /* storage unavailable */ }
}

/** Today's board, started if there is none. A board from another day is not today's. */
export function loadGame(day = utcDay()) {
  const all = readAll();
  const game = all.games?.[day];
  if (game && Array.isArray(game.rows)) return game;
  return blank(day);
}

function saveGame(game) {
  const all = readAll();
  all.games = all.games ?? {};
  all.games[game.day] = game;
  // Only the last few days are kept; the streak and the stats carry the rest.
  const days = Object.keys(all.games).sort();
  while (days.length > 7) delete all.games[days.shift()];
  writeAll(all);
}

/** Wins, plays, streaks and the guess histogram, kept forever. */
export function loadStats() {
  const all = readAll();
  const s = all.stats ?? {};
  return {
    played: s.played ?? 0, won: s.won ?? 0, streak: s.streak ?? 0, best: s.best ?? 0,
    lastWonDay: s.lastWonDay ?? null,
    guesses: Array.isArray(s.guesses) && s.guesses.length === ROWS ? s.guesses : new Array(ROWS).fill(0)
  };
}

function saveStats(stats) {
  const all = readAll();
  all.stats = stats;
  writeAll(all);
}

/** Yesterday's date string, for the streak. */
const dayBefore = (day) => new Date(new Date(`${day}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);

/**
 * Play one guess. Returns the updated game, or an object with `error`:
 *   'over'      the board is finished
 *   'short'     fewer than five letters
 *   'unknown'   not a word the dictionary knows
 */
export function playGuess(game, guess) {
  if (game.status !== 'playing') return { error: 'over' };
  const word = String(guess ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (word.length !== COLUMNS) return { error: 'short' };
  if (!isWord(word)) return { error: 'unknown' };
  const answer = wordForDay(game.day);
  const marks = scoreGuess(word, answer);
  const rows = [...game.rows, { guess: word, marks }];
  const won = marks.every((m) => m === 'hit');
  const status = won ? 'won' : rows.length >= ROWS ? 'lost' : 'playing';
  const next = { ...game, rows, status, finishedAt: status === 'playing' ? null : Date.now() };
  saveGame(next);
  if (status !== 'playing') {
    const stats = loadStats();
    stats.played += 1;
    if (won) {
      stats.won += 1;
      stats.guesses[rows.length - 1] += 1;
      stats.streak = stats.lastWonDay === dayBefore(game.day) ? stats.streak + 1 : 1;
      stats.best = Math.max(stats.best, stats.streak);
      stats.lastWonDay = game.day;
    } else {
      stats.streak = 0;
    }
    saveStats(stats);
  }
  return next;
}

/* --- hints, from the encyclopaedia ----------------------------------------- */

/** What a hint costs, in the day's points, and how many a board may take. */
export const HINT_COST = 100;
export const HINTS_MAX = 2;

/** The word with its letters hidden, in a sentence about it. */
const mask = (text, word) => String(text ?? '').replace(new RegExp(`\\b${word}(s|es|ed|ing)?\\b`, 'gi'), (m) => '▮'.repeat(word.length) + (m.length > word.length ? m.slice(word.length) : ''));

/**
 * A hint for the day's word: first its short description on Wikipedia,
 * then the opening sentence of its article with the word blanked out. Both
 * come from the encyclopaedia's summary endpoint for the word itself; a
 * word whose page is a list of meanings still says so, which is a hint of
 * its own. Resolves to null when nothing can be reached, and then nothing
 * is charged.
 */
export async function fetchHint(word, n) {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (n === 0) {
      const description = String(data.description ?? '').trim();
      return description ? mask(description, word) : mask(firstSentence(data.extract), word) || null;
    }
    const sentence = firstSentence(data.extract);
    return sentence ? mask(sentence, word) : null;
  } catch {
    return null;
  }
}

const firstSentence = (text) => {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const cut = clean.match(/^.*?[.!?](\s|$)/);
  return (cut ? cut[0] : clean).trim().slice(0, 220);
};

/** Record a hint taken on today's board, so it is charged once and shown again after a relaunch. */
export function takeHint(game, text) {
  const hints = [...(game.hints ?? []), text];
  const next = { ...game, hints };
  saveGame(next);
  return next;
}

/** The Wikipedia article of the day's word, to read once the board is done. */
export const articleUrl = (word) => `https://en.wikipedia.org/wiki/${encodeURIComponent(word)}`;

/** What a finished board is worth: more for fewer rows, less for each hint, nothing for a loss. */
export const WIKDLE_POINTS = [600, 500, 400, 300, 200, 100];
export const basePoints = (game) => (game.status === 'won' ? WIKDLE_POINTS[game.rows.length - 1] ?? 100 : 0);
export const wikdlePoints = (game) =>
  game.status === 'won' ? Math.max(50, basePoints(game) - (game.hints?.length ?? 0) * HINT_COST) : 0;

/**
 * The streak's bonus on the day's coins: five percent a day, up to half
 * again at ten days. A streak is a habit, and a habit pays.
 */
export const STREAK_BONUS_STEP = 0.05;
export const STREAK_BONUS_MAX = 0.5;
export const streakBonus = (streak) => Math.min(STREAK_BONUS_MAX, Math.max(0, (Number(streak) || 0) - 1) * STREAK_BONUS_STEP);

/** Solving in this many rows or fewer hands over a booster on top of the coins. */
export const FAST_SOLVE_ROWS = 2;
/** Every streak of this many days hands over a booster too. */
export const STREAK_BOOSTER_EVERY = 7;

/** The shareable grid of squares, the way people post it. */
export function shareText(game) {
  const square = { hit: '\u{1F7E9}', near: '\u{1F7E8}', miss: '⬛' };
  const head = `Wikster Wikdle ${game.day} ${game.status === 'won' ? game.rows.length : 'X'}/${ROWS}`;
  return [head, ...game.rows.map((row) => row.marks.map((m) => square[m]).join(''))].join('\n');
}
