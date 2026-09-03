/**
 * THE SLOT MACHINE'S BOOK
 * ----------------------------------------------------------------------------
 * Three reels, three rows, five lines, eight symbols. This file is the whole
 * arithmetic of the machine: the strip each reel spins (a symbol appears as
 * many times as it is listed), the lines a win is read along, what each line
 * pays, and the two special symbols:
 *
 *   WILD    stands in for any paying symbol on a line, and three of them on a
 *           line is the jackpot;
 *   BONUS   is a scatter: three anywhere in the window, on any rows, hand
 *           over BONUS_SPINS free spins at the same bet, played by the house
 *           on the spot and paid on top.
 *
 * The server spins from these same tables (the slots function is the only
 * place a spin is decided, supabase/functions/slots) and the client only
 * draws what it is told, after checking it against this book. The book is
 * tuned so the machine returns about 95% of what is bet over the long run;
 * tools/slots-rtp.mjs computes that figure exactly from these tables.
 *
 * Every number below is a multiplier of the line bet.
 */

/* --- the art ---------------------------------------------------------------
 * Each symbol is a small drawing in a 64 x 64 box: gradients, a highlight, a
 * shadow. They are inlined many times over on a strip, so ids are prefixed
 * per symbol and identical copies share them without conflict. */
const ART = {
  page: `
    <defs><linearGradient id="sl-page-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfd8e3"/></linearGradient></defs>
    <path d="M17 8h22l10 10v38a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3V11a3 3 0 0 1 3-3z" fill="url(#sl-page-g)" stroke="#8a98ab" stroke-width="1.5"/>
    <path d="M39 8v10h10" fill="#e6edf5" stroke="#8a98ab" stroke-width="1.5" stroke-linejoin="round"/>
    <g stroke="#7f95b3" stroke-width="2.4" stroke-linecap="round"><path d="M21 26h16M21 33h22M21 40h22M21 47h14"/></g>`,
  book: `
    <defs><linearGradient id="sl-book-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6ee7a0"/><stop offset="1" stop-color="#15803d"/></linearGradient></defs>
    <path d="M14 12a4 4 0 0 1 4-4h30a3 3 0 0 1 3 3v39a3 3 0 0 1-3 3H18a4 4 0 0 1-4-4z" fill="url(#sl-book-g)"/>
    <path d="M14 12a4 4 0 0 1 4-4h4v45h-4a4 4 0 0 1-4-4z" fill="#0f5a2c"/>
    <path d="M22 8h26v45H22z" fill="none" stroke="#0b3d1f" stroke-width="1.5" opacity="0.5"/>
    <rect x="28" y="18" width="14" height="4" rx="1" fill="#fde68a"/>
    <rect x="28" y="26" width="14" height="2" rx="1" fill="#fde68a" opacity="0.8"/>
    <path d="M44 8v14l-3-3-3 3V8z" fill="#fbbf24"/>`,
  globe: `
    <defs><radialGradient id="sl-globe-g" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#93c5fd"/><stop offset="0.6" stop-color="#2563eb"/><stop offset="1" stop-color="#1e3a8a"/></radialGradient></defs>
    <circle cx="32" cy="30" r="21" fill="url(#sl-globe-g)"/>
    <path d="M20 22c5-3 9 1 8 6s-6 5-4 10 8 3 9 7c-6 3-13 1-17-5-4-5-3-13 4-18zM38 15c5 2 8 6 9 11-4-1-8-2-9-6s-2-4 0-5zM41 36c3 1 6 0 8-1-1 5-4 9-8 11-2-3-3-7 0-10z" fill="#4ade80" opacity="0.9"/>
    <ellipse cx="32" cy="30" rx="21" ry="7" fill="none" stroke="#bfdbfe" stroke-width="1.2" opacity="0.55"/>
    <path d="M26 54h12M32 51v3" stroke="#93c5fd" stroke-width="3" stroke-linecap="round"/>
    <path d="M32 51a21 21 0 0 0 16-7" fill="none" stroke="#93c5fd" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>`,
  quill: `
    <defs><linearGradient id="sl-quill-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9d5ff"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs>
    <path d="M50 10c-14 2-26 12-30 26l-2 8 8-2c14-4 24-16 26-30z" fill="url(#sl-quill-g)"/>
    <path d="M47 13L20 40" stroke="#4c1d95" stroke-width="2" stroke-linecap="round"/>
    <path d="M18 44l-6 10" stroke="#4c1d95" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="14" cy="56" r="4" fill="#312e81"/>
    <path d="M34 22c-3 6-6 10-11 15" stroke="#f5f3ff" stroke-width="1.2" opacity="0.7"/>`,
  star: `
    <defs><radialGradient id="sl-star-g" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stop-color="#fff7c2"/><stop offset="0.5" stop-color="#fbbf24"/><stop offset="1" stop-color="#b45309"/></radialGradient></defs>
    <path d="M32 6l7.8 16.6 18.2 2.3-13.4 12.6 3.5 18L32 46.6 15.9 55.5l3.5-18L6 24.9l18.2-2.3z" fill="url(#sl-star-g)" stroke="#92400e" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M32 14l4.6 9.8 10.8 1.4" fill="none" stroke="#fffbeb" stroke-width="2" stroke-linecap="round" opacity="0.8"/>`,
  wiki: `
    <defs><radialGradient id="sl-wiki-g" cx="0.4" cy="0.3" r="0.85"><stop offset="0" stop-color="#fbcfe8"/><stop offset="0.55" stop-color="#ec4899"/><stop offset="1" stop-color="#831843"/></radialGradient></defs>
    <circle cx="32" cy="32" r="25" fill="url(#sl-wiki-g)" stroke="#fdf2f8" stroke-width="2"/>
    <circle cx="32" cy="32" r="19" fill="none" stroke="#fdf2f8" stroke-width="1" opacity="0.5"/>
    <path d="M17 22l6 20 6-14 6 14 6-20" fill="none" stroke="#fff" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M17 22l6 20 6-14 6 14 6-20" fill="none" stroke="#9d174d" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" opacity="0.5" transform="translate(0 1.5)"/>`,
  wild: `
    <defs><linearGradient id="sl-wild-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f472b6"/><stop offset="0.35" stop-color="#fbbf24"/><stop offset="0.65" stop-color="#4ade80"/><stop offset="1" stop-color="#60a5fa"/></linearGradient></defs>
    <path d="M32 4l22 12v24L32 60 10 40V16z" fill="url(#sl-wild-g)" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
    <path d="M32 4l22 12-22 8-22-8z" fill="#fff" opacity="0.28"/>
    <path d="M10 16l22 8v36L10 40z" fill="#000" opacity="0.18"/>
    <text x="32" y="42" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-weight="900" font-size="15" fill="#fff" stroke="#312e81" stroke-width="0.8" letter-spacing="1">WILD</text>`,
  bonus: `
    <defs><radialGradient id="sl-bonus-g" cx="0.35" cy="0.3" r="0.85"><stop offset="0" stop-color="#fef3c7"/><stop offset="0.55" stop-color="#f59e0b"/><stop offset="1" stop-color="#92400e"/></radialGradient></defs>
    <circle cx="32" cy="32" r="25" fill="url(#sl-bonus-g)" stroke="#fde68a" stroke-width="2.5"/>
    <circle cx="32" cy="32" r="18" fill="none" stroke="#fde68a" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.8"/>
    <text x="32" y="40" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="24" fill="#fffbeb" stroke="#78350f" stroke-width="1">B</text>
    <path d="M12 12l2 4 4 2-4 2-2 4-2-4-4-2 4-2zM52 46l1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z" fill="#fff"/>`
};

export const SYMBOLS = [
  { id: 'page',  name: { en: 'Page',     fr: 'Page' },     color: '#cfd8e3', art: ART.page },
  { id: 'book',  name: { en: 'Book',     fr: 'Livre' },    color: '#4ade80', art: ART.book },
  { id: 'globe', name: { en: 'Globe',    fr: 'Globe' },    color: '#60a5fa', art: ART.globe },
  { id: 'quill', name: { en: 'Quill',    fr: 'Plume' },    color: '#a78bfa', art: ART.quill },
  { id: 'star',  name: { en: 'Star',     fr: 'Étoile' },   color: '#fbbf24', art: ART.star },
  { id: 'wiki',  name: { en: 'Wiki seal', fr: 'Sceau Wiki' }, color: '#f472b6', art: ART.wiki },
  { id: 'wild',  name: { en: 'Wild',     fr: 'Joker' },    color: '#f9a8d4', art: ART.wild, wild: true },
  { id: 'bonus', name: { en: 'Bonus',    fr: 'Bonus' },    color: '#f59e0b', art: ART.bonus, scatter: true }
];
export const WILD = 'wild';
export const SCATTER = 'bonus';
export const symbolById = (id) => SYMBOLS.find((s) => s.id === id) ?? null;

/** Each reel's strip. The same strip on all three keeps the maths readable. */
export const REEL = [
  'page', 'page', 'page', 'page', 'page', 'page', 'page', 'page', 'page', 'page',
  'book', 'book', 'book', 'book', 'book', 'book', 'book',
  'globe', 'globe', 'globe', 'globe', 'globe',
  'bonus',
  'quill', 'quill', 'quill', 'quill',
  'star', 'star',
  'wiki',
  'wild',
  'bonus'
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
 * from the left. Two pages is the smallest win in the game; three wilds
 * is the jackpot.
 */
export const PAYTABLE = {
  page:  { 2: 0.5, 3: 3.5 },
  book:  { 2: 1,   3: 8 },
  globe: { 2: 2,   3: 16 },
  quill: { 2: 3,   3: 32 },
  star:  { 2: 5,   3: 100 },
  wiki:  { 3: 350 },
  wild:  { 3: 700 }
};

/** Three bonus symbols anywhere in the window, and the house spins this many times for free. */
export const SCATTER_MIN = 3;
export const BONUS_SPINS = 8;

/** The bets a player may place, in Buckarooz, per line; the spin costs five lines. */
export const LINE_BETS = [2, 5, 10, 25, 50];

/**
 * The symbols on a line of three stops, and what they pay. Wilds lead or
 * fill: a line's symbol is its first symbol that is not wild, wilds count
 * towards its run, and a line of wilds is paid as wilds. A bonus symbol
 * never pays on a line and a wild never stands in for one.
 */
export function readLine(stops, line) {
  const symbols = line.rows.map((row, reel) => stops[reel][row]);
  let wilds = 0;
  while (wilds < symbols.length && symbols[wilds] === WILD) wilds++;
  if (wilds === symbols.length) {
    return { id: line.id, symbols, symbol: WILD, count: wilds, pay: PAYTABLE[WILD]?.[wilds] ?? 0 };
  }
  const symbol = symbols[wilds];
  if (symbol === SCATTER) return { id: line.id, symbols, symbol, count: 0, pay: 0 };
  let count = wilds + 1;
  while (count < symbols.length && (symbols[count] === symbol || symbols[count] === WILD)) count++;
  const pay = Math.max(PAYTABLE[symbol]?.[count] ?? 0, PAYTABLE[WILD]?.[wilds] ?? 0);
  return { id: line.id, symbols, symbol, count, pay };
}

/** How many bonus symbols the whole window shows, on any rows. */
export const scattersIn = (stops) => stops.flat().filter((s) => s === SCATTER).length;

/** Every line read, the total, and whether the window opened the bonus. */
export function evaluate(stops, lineBet) {
  const lines = PAYLINES.map((line) => readLine(stops, line)).filter((l) => l.pay > 0);
  const total = Math.round(lines.reduce((sum, l) => sum + l.pay * lineBet, 0) * 100) / 100;
  const scatters = scattersIn(stops);
  return { lines, total, scatters, bonus: scatters >= SCATTER_MIN };
}

/** The window shown for a reel stopped at `index`: that stop and the two after it. */
export const windowAt = (index) => [0, 1, 2].map((k) => REEL[(index + k) % REEL.length]);

/** How big a win is, against the whole spin's cost: nothing, a win, big, mega, or the jackpot. */
export function winTier(total, bet) {
  if (!(total > 0)) return null;
  const x = total / bet;
  if (x >= 40) return 'jackpot';
  if (x >= 12) return 'mega';
  if (x >= 4) return 'big';
  return 'win';
}
