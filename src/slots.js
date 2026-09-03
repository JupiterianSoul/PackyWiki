/**
 * THE SLOT MACHINE, from the player's side.
 * ============================================================================
 * The machine's book is src/data/slots.js; the spin is decided by the slots
 * function and nowhere else. This module holds the bet, asks for the spin,
 * checks the answer against the book before believing it (the base spin and
 * every bonus spin the house played on top), and says what the reels and the
 * wallet have to do. It knows one state at a time:
 *
 *   idle -> spinning -> settling -> paying -> (bonus) -> idle
 *
 * and refuses every input that is not for the state it is in, which is
 * what keeps a double tap from buying two spins.
 */
import { supabase } from './account.js';
import { askHouse } from './house.js';
import { PAYLINES, LINE_BETS, BONUS_SPINS, evaluate, windowAt, REEL } from './data/slots.js';

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

/** One window against the book: stops that exist, windows that match them, a total that adds up. */
function checkWindow(spin, lineBet) {
  if (!spin || !Array.isArray(spin.stops) || spin.stops.length !== 3) throw new Error('TAMPER');
  if (!spin.stops.every((s) => Number.isInteger(s) && s >= 0 && s < REEL.length)) throw new Error('TAMPER');
  const windows = spin.stops.map(windowAt);
  if (JSON.stringify(windows) !== JSON.stringify(spin.windows)) throw new Error('TAMPER');
  const own = evaluate(windows, lineBet);
  if (Math.abs(own.total - Number(spin.total)) > 0.01) throw new Error('TAMPER');
  return { stops: spin.stops, windows, lines: own.lines, total: own.total, scatters: own.scatters, bonus: own.bonus };
}

/**
 * The whole answer against the book: the base window, and, when it opened
 * the bonus, exactly BONUS_SPINS free windows, each checked on its own. The
 * grand total is what the wallet receives.
 */
export function checkSpin(spin, lineBet) {
  const base = checkWindow(spin, lineBet);
  const bet = SPIN_COST(lineBet);
  let bonus = null;
  if (base.bonus) {
    const played = Array.isArray(spin.bonus?.spins) ? spin.bonus.spins : null;
    if (!played || played.length !== BONUS_SPINS) throw new Error('TAMPER');
    const spins = played.map((s) => checkWindow(s, lineBet));
    const total = Math.round(spins.reduce((sum, s) => sum + s.total, 0) * 100) / 100;
    if (Math.abs(total - Number(spin.bonus.total)) > 0.01) throw new Error('TAMPER');
    bonus = { spins, total };
  } else if (spin.bonus?.spins?.length) {
    throw new Error('TAMPER');
  }
  const grand = Math.round((base.total + (bonus?.total ?? 0)) * 100) / 100;
  if (Math.abs(grand - Number(spin.grand ?? grand)) > 0.01) throw new Error('TAMPER');
  return { ...base, bet, lineBet, bonus, grand, net: grand - bet, nonce: spin.nonce ?? null };
}

/* --- the reels' motion --------------------------------------------------- */

/**
 * How long each reel spins before it stops on its stop, left to right, so
 * the machine lands one reel at a time. Milliseconds; the bonus plays faster.
 */
export const REEL_STOP_MS = [1500, 2000, 2500];
export const BONUS_STOP_MS = [800, 1050, 1300];
/** The ease each reel decelerates on: fast, a soft overshoot, then it sits. */
export const REEL_EASE = 'cubic-bezier(0.18, 0.86, 0.32, 1.06)';
