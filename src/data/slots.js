/**
 * THE SLOT MACHINE'S BOOK
 * ----------------------------------------------------------------------------
 * Three reels, three rows, five lines, five symbols. This file is the whole
 * arithmetic of the machine: the strips each reel spins (a symbol appears as
 * many times as it is listed), the lines a win is read along, and what each
 * line pays. The server spins from these same tables (the function is the
 * only place a spin is decided), and the client only draws what it is told.
 *
 * The book is tuned so the machine returns 95% of what is bet over the long
 * run (see tools/slots-rtp.mjs, which computes it exactly from these
 * tables). Every number here is a multiplier of the line bet.
 */
export const SYMBOLS = [
  { id: 'page',  name: { en: 'Page',      fr: 'Page' },       glyph: 'page',   color: '#9aa5b1' },
  { id: 'book',  name: { en: 'Book',      fr: 'Livre' },      glyph: 'book',   color: '#4ade80' },
  { id: 'globe', name: { en: 'Globe',     fr: 'Globe' },      glyph: 'globe',  color: '#3b82f6' },
  { id: 'star',  name: { en: 'Star',      fr: 'Étoile' },     glyph: 'star',   color: '#fbbf24' },
  { id: 'wiki',  name: { en: 'Wiki logo', fr: 'Logo Wiki' },  glyph: 'wiki',   color: '#f472b6' }
];

/** Each reel's strip. The same strip on all three keeps the maths readable. */
export const REEL = [
  'page', 'page', 'page', 'page', 'page', 'page', 'page', 'page', 'page', 'page',
  'book', 'book', 'book', 'book', 'book', 'book',
  'globe', 'globe', 'globe', 'globe',
  'star', 'star',
  'wiki'
];
export const REELS = 3;
export const ROWS = 3;

/** The lines, as the row read on each reel: three straights, two diagonals. */
export const PAYLINES = [
  { id: 'top',    rows: [0, 0, 0] },
  { id: 'middle', rows: [1, 1, 1] },
  { id: 'bottom', rows: [2, 2, 2] },
  { id: 'down',   rows: [0, 1, 2] },
  { id: 'up',     rows: [2, 1, 0] }
];

/**
 * What a line pays, times the line bet, by symbol and how many in a row
 * from the left. Two pages is the smallest win in the game; three logos is
 * the jackpot.
 */
export const PAYTABLE = {
  page:  { 2: 0.5, 3: 4.25 },
  book:  { 2: 1.25,   3: 10 },
  globe: { 2: 2,   3: 30 },
  star:  { 3: 100 },
  wiki:  { 3: 400 }
};

/** The bets a player may place, in Buckarooz, per line; the spin costs five lines. */
export const LINE_BETS = [2, 5, 10, 25, 50];

/** The symbols on a line of three stops, and what they pay. */
export function readLine(stops, line) {
  const symbols = line.rows.map((row, reel) => stops[reel][row]);
  const first = symbols[0];
  let count = 1;
  while (count < symbols.length && symbols[count] === first) count++;
  const pay = PAYTABLE[first]?.[count] ?? 0;
  return { id: line.id, symbols, symbol: first, count, pay };
}

/** Every line read, and the total, for a window of three rows per reel. */
export function evaluate(stops, lineBet) {
  const lines = PAYLINES.map((line) => readLine(stops, line)).filter((l) => l.pay > 0);
  const total = lines.reduce((sum, l) => sum + l.pay * lineBet, 0);
  return { lines, total };
}

/** The window shown for a reel stopped at `index`: that stop and the two after it. */
export const windowAt = (index) => [0, 1, 2].map((k) => REEL[(index + k) % REEL.length]);
