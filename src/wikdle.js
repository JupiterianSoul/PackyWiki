// @ts-check
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
/*
 * The word lists are the largest file in the app and only a round of Wikdle
 * reads them, so they are fetched when the board opens rather than shipped
 * with the first screen. Everything that needs a word awaits loadWords()
 * once; the board does it before it paints.
 */
let words = null;

/** Fetches the answer and dictionary lists, once. */
export async function loadWords() {
  words ??= await import('./data/wikdle-words.js');
  return words;
}

const lists = () => {
  if (!words) throw new Error('WIKDLE_WORDS_NOT_LOADED');
  return words;
};
import { t } from './i18n.js';

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
  const { ANSWERS } = lists();
  const n = ANSWERS.length;
  // A stride coprime with the list length visits every word once.
  const stride = 7919 % n || 1;
  const index = (Math.floor(h / 97) * stride + (h % n)) % n;
  return ANSWERS[index];
}

/** Whether a guess is a word the dictionary knows. */
export const isWord = (guess) => lists().DICTIONARY.has(String(guess ?? '').toLowerCase());

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

/* --- hints ------------------------------------------------------------------
 * Two hints, and both have to be worth what they cost.
 *
 * The first is always a letter in its place: it is drawn from the answer
 * itself, so it cannot be wrong, cannot be vague, and works with no
 * connection at all. The second is what the word MEANS, taken from
 * Wikipedia - but only when the page is a real article. A five-letter word
 * usually has a page listing its meanings instead, and "Topics referred to
 * by the same term" is not a hint; when that is what comes back, or nothing
 * does, the second hint is another letter rather than a wasted hundred
 * points.
 */

/** What a hint costs, in the day's points, and how many a board may take. */
export const HINT_COST = 120;
export const HINTS_MAX = 2;

/** The word with its letters hidden, in a sentence about it. */
const mask = (text, word) => String(text ?? '').replace(new RegExp(`\\b${word}(s|es|ed|ing)?\\b`, 'gi'), (m) => '▮'.repeat(word.length) + (m.length > word.length ? m.slice(word.length) : ''));

const firstSentence = (text) => {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const cut = clean.match(/^.*?[.!?](\s|$)/);
  return (cut ? cut[0] : clean).trim().slice(0, 220);
};

/**
 * Whether a summary is about the word or about the many things the word can
 * name. A page of meanings, a list, a name page: none of them say anything
 * about the answer, and all of them used to be handed over as the hint.
 */
const EMPTY_MEANING = /(may|can) (also )?refer to|refers? to:|same term|disambiguat|Wikimedia|list of |^(surname|given name|family name)/i;
function usefulMeaning(data, word) {
  if (!data || (data.type && data.type !== 'standard')) return null;
  for (const candidate of [String(data.description ?? '').trim(), firstSentence(data.extract)]) {
    if (!candidate || candidate.length < 8) continue;
    if (EMPTY_MEANING.test(candidate)) continue;
    const hidden = mask(candidate, word);
    // A sentence that is nothing but the blanked-out word says nothing.
    if (hidden.replace(/▮/g, '').replace(/[^a-zA-Z]/g, '').length < 6) continue;
    return hidden.charAt(0).toUpperCase() + hidden.slice(1);
  }
  return null;
}

/**
 * Which letter a letter-hint gives away: the same order every time for a
 * given word, so taking the second hint never repeats the first, and
 * positions the board has already turned green are skipped as worthless.
 */
function letterHint(word, taken, greens = []) {
  const order = [2, 4, 0, 3, 1];   // middle first: the least guessable places
  const known = new Set(greens);
  const free = order.filter((i) => !known.has(i) && !taken.has(i));
  const at = (free.length ? free : order.filter((i) => !taken.has(i)))[0];
  if (at == null) return null;
  taken.add(at);
  return { at, text: t('wikdleHintLetter', { n: at + 1, of: COLUMNS, letter: String(word[at]).toUpperCase() }) };
}

/** The positions a board's letter hints have already given away. */
const hintedPositions = (hints) => new Set((hints ?? [])
  .map((h) => (typeof h === 'string' ? null : h?.at))
  .filter((at) => Number.isInteger(at)));

/**
 * A hint for the day's word. The first is a letter; the second is the
 * meaning when Wikipedia has one worth reading, and another letter when it
 * does not. Never resolves to nothing: a hint always tells you something.
 */
export async function fetchHint(word, n, { greens = [], hints = [] } = {}) {
  const taken = hintedPositions(hints);
  if (n === 0) return letterHint(word, taken, greens);
  const meaning = await wikipediaMeaning(word);
  if (meaning) return { text: meaning };
  return letterHint(word, taken, greens);
}

/** The word's own article, when it has one worth quoting. */
async function wikipediaMeaning(word) {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    return usefulMeaning(await res.json(), word);
  } catch {
    return null;
  }
}

/** Record a hint taken on today's board, so it is charged once and shown again after a relaunch. */
export function takeHint(game, hint) {
  const hints = [...(game.hints ?? []), typeof hint === 'string' ? { text: hint } : hint];
  const next = { ...game, hints };
  saveGame(next);
  return next;
}

/** A stored hint's words, whichever shape it was written in. */
export const hintText = (hint) => (typeof hint === 'string' ? hint : String(hint?.text ?? ''));

/** The Wikipedia article of the day's word, to read once the board is done. */
export const articleUrl = (word) => `https://en.wikipedia.org/wiki/${encodeURIComponent(word)}`;

/**
 * What a finished board is worth: more for fewer rows, less for each hint,
 * nothing for a loss.
 *
 * A board is once a day and takes real thought, so it pays like it: solving
 * one is worth a few slot spins rather than a consolation. The floor keeps a
 * slow solve with both hints from ever reading as a waste of a morning.
 */
export const WIKDLE_POINTS = [1400, 1150, 950, 800, 650, 500];
export const basePoints = (game) => (game.status === 'won' ? WIKDLE_POINTS[game.rows.length - 1] ?? 500 : 0);
export const wikdlePoints = (game) =>
  game.status === 'won' ? Math.max(320, basePoints(game) - (game.hints?.length ?? 0) * HINT_COST) : 0;

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
