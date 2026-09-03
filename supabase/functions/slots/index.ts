/**
 * THE SLOT MACHINE
 * ----------------------------------------------------------------------------
 * Every spin is decided here and only here. The client sends a line bet; this
 * draws one stop per reel from the platform's cryptographic generator, reads
 * the five lines against the book (a copy of src/data/slots.js, kept in step
 * by tools/sync-game-tables.mjs), and answers with the stops, the lines that
 * paid and the total. When the window shows three bonus symbols the house
 * plays the free spins on the spot, the same way, and answers with all of
 * them: the client draws them one after another and nothing else.
 *
 * readLine() below is the same arithmetic as the book's, line for line:
 * wilds lead or fill a line, a line of wilds pays as wilds, a bonus symbol
 * never pays on a line. The client re-reads every window it is handed and
 * refuses one that does not add up, so a drift here would show at once.
 *
 * The win is also written to the scores table for the leaderboard, as this
 * caller, with the service key: the client is never trusted with a score.
 *
 *   supabase functions deploy slots
 */
import { CORS, json, callerId, adminInsert, randomBelow, nonce } from '../_shared/caller.ts';
import { REEL, PAYLINES, PAYTABLE, LINE_BETS, WILD, SCATTER, SCATTER_MIN, BONUS_SPINS } from '../_shared/slots.ts';

type Line = { id: string; rows: number[] };
type Read = { id: string; symbols: string[]; symbol: string; count: number; pay: number };

const windowAt = (index: number) => [0, 1, 2].map((k) => REEL[(index + k) % REEL.length]);

function readLine(stops: string[][], line: Line): Read {
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

/** One window, spun and read. */
function spinOnce(lineBet: number) {
  const stops = [randomBelow(REEL.length), randomBelow(REEL.length), randomBelow(REEL.length)];
  const windows = stops.map(windowAt);
  const lines = PAYLINES.map((line) => readLine(windows, line)).filter((l) => l.pay > 0);
  const total = Math.round(lines.reduce((sum, l) => sum + l.pay * lineBet, 0) * 100) / 100;
  const scatters = windows.flat().filter((s) => s === SCATTER).length;
  return { stops, windows, lines, total, scatters, bonus: scatters >= SCATTER_MIN };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const who = await callerId(req);
  if (!who) return json({ error: 'SIGN_IN' }, 401);

  let body: { lineBet?: unknown } = {};
  try { body = await req.json(); } catch { return json({ error: 'BAD_JSON' }, 400); }
  const lineBet = Number(body.lineBet);
  if (!LINE_BETS.includes(lineBet)) return json({ error: 'BAD_BET', allowed: LINE_BETS }, 400);

  const base = spinOnce(lineBet);
  const bet = lineBet * PAYLINES.length;
  let bonus: { spins: ReturnType<typeof spinOnce>[]; total: number } | null = null;
  if (base.bonus) {
    const spins = Array.from({ length: BONUS_SPINS }, () => spinOnce(lineBet));
    const total = Math.round(spins.reduce((sum, s) => sum + s.total, 0) * 100) / 100;
    bonus = { spins, total };
  }
  const grand = Math.round((base.total + (bonus?.total ?? 0)) * 100) / 100;
  const spin = { nonce: nonce(), at: Date.now(), lineBet, bet, ...base, bonus, grand, net: grand - bet };

  // Points for the board: what the spin won, if it won.
  if (grand > 0) {
    await adminInsert('scores', { user_id: who, game: 'slots', points: Math.round(grand), detail: { nonce: spin.nonce, lineBet, bonus: Boolean(bonus) } });
  }
  return json(spin);
});
