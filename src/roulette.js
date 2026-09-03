/**
 * THE ROULETTE WHEEL, from the player's side.
 * ============================================================================
 * The table is src/data/roulette.js; the spin is decided by the roulette
 * function and nowhere else. This module keeps the chips laid on the table,
 * sends them, checks the settlement against the table before believing it,
 * and says where the wheel has to come to rest.
 */
import { askHouse } from './house.js';
import { validBet, settle, angleOf, TABLE_LIMIT, POCKETS } from './data/roulette.js';

/** The chips on the table, merged by bet so a second chip on red adds to the first. */
export function layChip(bets, bet) {
  if (!validBet(bet)) return bets;
  const staked = bets.reduce((sum, b) => sum + b.amount, 0);
  if (staked + bet.amount > TABLE_LIMIT) return bets;
  const same = bets.find((b) => b.kind === bet.kind && String(b.pick) === String(bet.pick));
  if (same) return bets.map((b) => (b === same ? { ...b, amount: b.amount + bet.amount } : b));
  return [...bets, { ...bet }];
}

export const staked = (bets) => bets.reduce((sum, b) => sum + b.amount, 0);

/**
 * One spin of the wheel with these chips. Rejects with SIGN_IN, CLOSED,
 * BAD_BET, OVER_LIMIT, TIMEOUT or TAMPER, like the slot machine.
 */
export async function spinRoulette(bets) {
  if (!bets.length || !bets.every(validBet)) throw new Error('BAD_BET');
  if (staked(bets) > TABLE_LIMIT) throw new Error('OVER_LIMIT');
  const data = await askHouse('roulette', { bets });
  return checkSpin(data, bets);
}

/** The answer against the table: a real pocket, and a settlement that adds up. */
export function checkSpin(spin, bets) {
  const pocket = Number(spin?.pocket);
  if (!Number.isInteger(pocket) || pocket < 0 || pocket >= POCKETS) throw new Error('TAMPER');
  const own = settle(bets, pocket);
  if (Math.abs(own.returned - Number(spin.returned)) > 0.01) throw new Error('TAMPER');
  return { ...spin, pocket, ...own };
}

/* --- the wheel's motion -------------------------------------------------- */

/** How long the wheel turns, and the curve it slows on: hard start, long settle. */
export const WHEEL_SPIN_MS = 5200;
export const WHEEL_EASE = 'cubic-bezier(0.12, 0.8, 0.12, 1)';

/**
 * The angle the wheel has to be at when it stops for `pocket` to sit under
 * the marker at the top, from where it is now: at least four full turns
 * forward, then on to the pocket. Degrees, always increasing, so a CSS
 * transition from the current angle to this one is the whole animation.
 */
export function restAngle(pocket, currentAngle = 0) {
  const target = (360 - angleOf(pocket)) % 360;
  const base = Math.ceil(currentAngle / 360) * 360 + 4 * 360;
  return base + target;
}
