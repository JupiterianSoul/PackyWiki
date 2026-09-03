/**
 * THE ROULETTE TABLE
 * ----------------------------------------------------------------------------
 * A European wheel, thirty-seven pockets, one zero. The layout is the real
 * one; the bets are the real ones plus the game's own: a tier bet covers the
 * lowest numbers up to a tier's size and pays the tier's multiplier, from
 * Common at one and a half times to Exotic at ten. The wheel is spun on the
 * server (the roulette function is the only place a number is decided); the
 * client lays the chips, sends them, and turns the wheel to the answer.
 *
 * Every multiplier below is what a winning chip RETURNS, stake included, so
 * a 2x bet doubles the chip and a losing chip is simply gone. The house edge
 * on the classic bets is the wheel's own one-in-thirty-seven; on the tier
 * bets it is the same, except at the very top, where the cap of ten holds.
 */
export const POCKETS = 37;

/** The wheel's order, clockwise from zero: where each number sits physically. */
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const colorOf = (n) => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');

/** The tier bets: the lowest N numbers, and what a chip on them returns. */
export const TIER_BETS = [
  { id: 'common',    numbers: 24, multiplier: 1.5 },
  { id: 'uncommon',  numbers: 18, multiplier: 2 },
  { id: 'rare',      numbers: 12, multiplier: 3 },
  { id: 'epic',      numbers: 8,  multiplier: 4.5 },
  { id: 'legendary', numbers: 6,  multiplier: 6 },
  { id: 'mythic',    numbers: 4,  multiplier: 9 },
  { id: 'exotic',    numbers: 3,  multiplier: 10 }
];

/** The chips a player may put down, in Buckarooz. */
export const CHIPS = [5, 10, 25, 50, 100];
/** How much may ride on one spin, all chips together. */
export const TABLE_LIMIT = 1000;

/**
 * Every bet the table takes, as `kind` and `pick`, and whether a pocket wins
 * it. `returns` is the multiplier of the stake on a win.
 */
export const BETS = {
  straight: { returns: 36, wins: (n, pick) => n === Number(pick) },
  color:    { returns: 2,  wins: (n, pick) => n !== 0 && colorOf(n) === pick },
  parity:   { returns: 2,  wins: (n, pick) => n !== 0 && (n % 2 === 0) === (pick === 'even') },
  half:     { returns: 2,  wins: (n, pick) => n !== 0 && (pick === 'low' ? n <= 18 : n >= 19) },
  dozen:    { returns: 3,  wins: (n, pick) => n !== 0 && Math.ceil(n / 12) === Number(pick) },
  column:   { returns: 3,  wins: (n, pick) => n !== 0 && ((n - 1) % 3) + 1 === Number(pick) },
  tier:     { returns: null, wins: (n, pick) => { const tier = TIER_BETS.find((tb) => tb.id === pick); return Boolean(tier) && n !== 0 && n <= tier.numbers; } }
};

/** What a winning chip returns, by bet. */
export function returnsFor(kind, pick) {
  if (kind === 'tier') return TIER_BETS.find((tb) => tb.id === pick)?.multiplier ?? 0;
  return BETS[kind]?.returns ?? 0;
}

/** Whether a bet is one the table takes. */
export function validBet(bet) {
  if (!bet || !BETS[bet.kind]) return false;
  const amount = Number(bet.amount);
  if (!Number.isFinite(amount) || amount <= 0 || !CHIPS.some((c) => amount % c === 0)) return false;
  switch (bet.kind) {
    case 'straight': return Number.isInteger(Number(bet.pick)) && Number(bet.pick) >= 0 && Number(bet.pick) <= 36;
    case 'color': return bet.pick === 'red' || bet.pick === 'black';
    case 'parity': return bet.pick === 'even' || bet.pick === 'odd';
    case 'half': return bet.pick === 'low' || bet.pick === 'high';
    case 'dozen': case 'column': return [1, 2, 3].includes(Number(bet.pick));
    case 'tier': return TIER_BETS.some((tb) => tb.id === bet.pick);
    default: return false;
  }
}

/** Settle a round: every chip against the pocket, and the sum returned. */
export function settle(bets, pocket) {
  const results = bets.map((bet) => {
    const won = BETS[bet.kind].wins(pocket, bet.pick);
    const returned = won ? Math.round(Number(bet.amount) * returnsFor(bet.kind, bet.pick) * 100) / 100 : 0;
    return { ...bet, won, returned };
  });
  const staked = bets.reduce((sum, b) => sum + Number(b.amount), 0);
  const returned = results.reduce((sum, r) => sum + r.returned, 0);
  return { results, staked, returned, net: Math.round((returned - staked) * 100) / 100 };
}

/** The angle, in degrees, at which a pocket sits on the drawn wheel (zero at the top). */
export const angleOf = (pocket) => (WHEEL_ORDER.indexOf(pocket) * 360) / POCKETS;
