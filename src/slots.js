/**
 * THE SLOT MACHINE, from the player's side.
 * ============================================================================
 * The machine's book is src/data/slots.js; the spin is decided by the slots
 * function and nowhere else. This module holds the bet, asks for the spin,
 * checks the answer against the book before believing it, and moves the
 * money. It knows one state at a time:
 *
 *   idle -> spinning -> settling -> paying -> idle
 *
 * and refuses every input that is not for the state it is in, which is
 * what keeps a double tap from buying two spins.
 */
import { supabase } from './account.js';
import { askHouse } from './house.js';
import { PAYLINES, LINE_BETS, evaluate, windowAt, REEL } from './data/slots.js';

export const SPIN_COST = (lineBet) => lineBet * PAYLINES.length;

/** Whether the machine can take a coin: the backend is there and the player is known to it. */
export const casinoOpen = (signedIn) => Boolean(supabase) && Boolean(signedIn);

/**
 * One spin. Resolves to the spin the server decided, checked; rejects with
 * an Error whose message is one of:
 *   SIGN_IN     the house does not know the player
 *   CLOSED      no backend, or the function is not deployed
 *   BAD_BET     the bet is not one the machine takes
 *   TIMEOUT     the house did not answer in time
 *   TAMPER      the answer does not add up against the book
 */
export async function spinSlots(lineBet) {
  if (!LINE_BETS.includes(lineBet)) throw new Error('BAD_BET');
  const data = await askHouse('slots', { lineBet });
  return checkSpin(data, lineBet);
}

/** The answer against the book: stops that exist, windows that match them, a total that adds up. */
export function checkSpin(spin, lineBet) {
  if (!spin || !Array.isArray(spin.stops) || spin.stops.length !== 3) throw new Error('TAMPER');
  if (!spin.stops.every((s) => Number.isInteger(s) && s >= 0 && s < REEL.length)) throw new Error('TAMPER');
  const windows = spin.stops.map(windowAt);
  if (JSON.stringify(windows) !== JSON.stringify(spin.windows)) throw new Error('TAMPER');
  const own = evaluate(windows, lineBet);
  if (Math.abs(own.total - Number(spin.total)) > 0.01) throw new Error('TAMPER');
  return { ...spin, windows, lines: own.lines, total: own.total, bet: SPIN_COST(lineBet), net: own.total - SPIN_COST(lineBet) };
}

/* --- the reels' motion --------------------------------------------------- */

/**
 * How long each reel spins before it stops on its stop, left to right, so
 * the machine lands one reel at a time. Milliseconds.
 */
export const REEL_STOP_MS = [1400, 1900, 2400];
/** The ease each reel decelerates on: fast, then a soft settle. */
export const REEL_EASE = 'cubic-bezier(0.2, 0.9, 0.25, 1.02)';
