/**
 * The daily gift board.
 *
 * Thirty slots. You claim one per calendar day, and you always claim the NEXT
 * UNCLAIMED slot - never the slot matching today's date. Miss a day and you
 * lose the day, not the gift: log in on Wednesday having skipped Tuesday and
 * you still get slot 2, not slot 3. Once all thirty are taken a fresh board is
 * generated, so the ladder never runs out.
 *
 * Boards are generated from a seeded PRNG keyed to the board number, so the
 * whole month can be shown in advance and the eleventh gift is the same gift
 * whenever you get round to claiming it.
 *
 * Value is deliberately small against the shop stipend (500 every two hours,
 * ~6,000 a day). A whole month of gifts is worth roughly two days of stipend.
 * The point of this feature is that a player with nothing left can always get
 * moving again, not that logging in is the way to get rich.
 */
import { THEME_PACKS } from './data/packs.js';
import { RARITIES } from './data/rarities.js';

export const BOARD_SIZE = 30;

/** Deterministic PRNG, so a board is the same everywhere and every reload. */
function seeded(seed) {
  let a = (seed >>> 0) + 0x9e3779b9;
  return () => {
    a = Math.imul(a ^ (a >>> 15), a | 1);
    a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  };
}

/** Local calendar day. Local, not UTC: "today" should mean the player's day. */
export function dayNumber(now = Date.now()) {
  const d = new Date(now);
  return Math.floor((now - d.getTimezoneOffset() * 60000) / 86400000);
}

/** Milliseconds until the next local midnight. */
export function msUntilNextDay(now = Date.now()) {
  return (dayNumber(now) + 1) * 86400000 + new Date(now).getTimezoneOffset() * 60000 - now;
}

/* --- the board ------------------------------------------------------------ */

/**
 * One slot's gift. `index` is 0-based within the board and `board` is how many
 * boards have already been completed, so gifts keep creeping up forever
 * without ever running away - the board bonus is capped.
 */
function giftFor(rng, index, board) {
  const day = index + 1;
  // Later slots in a board are worth more, and later boards a little more
  // again, but the board multiplier stops climbing after ten months.
  const ramp = 1 + index * 0.09;
  const loyalty = 1 + Math.min(board, 10) * 0.06;
  const scale = ramp * loyalty;

  // Day 30 closes the board with the best thing on it.
  if (day === BOARD_SIZE) {
    return { kind: 'booster', spec: giftBooster(rng, Math.min(4, 2 + Math.floor(board / 3)), 6) };
  }
  // Weekly milestones.
  if (day % 7 === 0) {
    return { kind: 'booster', spec: giftBooster(rng, day >= 21 ? 2 : 1, day >= 14 ? 5 : 4) };
  }
  // A single free card: a one-card booster, opened like any other.
  if (day % 5 === 0) {
    return { kind: 'card', spec: giftBooster(rng, day >= 20 ? 2 : 1, 1) };
  }
  // Everything else is money.
  return { kind: 'coins', coins: Math.round((110 * scale) / 5) * 5 };
}

function giftBooster(rng, tierRank, cards) {
  const theme = THEME_PACKS[Math.floor(rng() * THEME_PACKS.length)];
  return {
    kind: 'theme',
    themeId: theme.id,
    rarityId: tierRank > 0 ? RARITIES[tierRank].id : null,
    cards
  };
}

/** The whole board, so the player can see what is coming. */
export function generateBoard(board = 0) {
  const rng = seeded(board * 7919 + 13);
  return Array.from({ length: BOARD_SIZE }, (_, index) => ({
    index,
    day: index + 1,
    gift: giftFor(rng, index, board)
  }));
}

/* --- claim state ---------------------------------------------------------- */

export const emptyDaily = () => ({ board: 0, claimed: 0, lastDay: null });

/** A gift is waiting whenever the last claim was on an earlier day. */
export const canClaim = (daily, now = Date.now()) =>
  (daily?.lastDay ?? null) !== dayNumber(now);

/** The slot that would be handed over next. */
export const nextIndex = (daily) => (daily?.claimed ?? 0) % BOARD_SIZE;

/**
 * Take the next gift. Returns the slot claimed, or null when today's gift has
 * already been taken. Completing a board immediately starts the next one.
 */
export function claim(daily, now = Date.now()) {
  if (!canClaim(daily, now)) return null;
  const board = generateBoard(daily.board ?? 0);
  const slot = board[nextIndex(daily)];

  daily.claimed = (daily.claimed ?? 0) + 1;
  daily.lastDay = dayNumber(now);
  if (daily.claimed >= BOARD_SIZE) {
    daily.claimed = 0;
    daily.board = (daily.board ?? 0) + 1;
  }
  return slot;
}
