/**
 * THE SLOT MACHINE
 * ----------------------------------------------------------------------------
 * Every spin is decided here and only here. The client sends a line bet; this
 * draws one stop per reel from the platform's cryptographic generator, reads
 * the five lines against the book (a copy of src/data/slots.js, kept in step
 * by tools/sync-game-tables.mjs), and answers with the stops, the lines that
 * paid and the total. The client draws that and nothing else.
 *
 * The win is also written to the scores table for the leaderboard, as this
 * caller, with the service key: the client is never trusted with a score.
 *
 *   supabase functions deploy slots
 */
import { CORS, json, callerId, adminInsert, randomBelow, nonce } from '../_shared/caller.ts';
import { REEL, PAYLINES, PAYTABLE, LINE_BETS } from '../_shared/slots.ts';

const windowAt = (index: number) => [0, 1, 2].map((k) => REEL[(index + k) % REEL.length]);

function readLine(stops: string[][], line: { id: string; rows: number[] }) {
  const symbols = line.rows.map((row, reel) => stops[reel][row]);
  const first = symbols[0];
  let count = 1;
  while (count < symbols.length && symbols[count] === first) count++;
  const pay = PAYTABLE[first]?.[count] ?? 0;
  return { id: line.id, symbols, symbol: first, count, pay };
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

  const stops = [randomBelow(REEL.length), randomBelow(REEL.length), randomBelow(REEL.length)];
  const windows = stops.map(windowAt);
  const lines = PAYLINES.map((line) => readLine(windows, line)).filter((l) => l.pay > 0);
  const total = Math.round(lines.reduce((sum, l) => sum + l.pay * lineBet, 0) * 100) / 100;
  const bet = lineBet * PAYLINES.length;
  const spin = { nonce: nonce(), at: Date.now(), lineBet, bet, stops, windows, lines, total, net: total - bet };

  // Points for the board: what the spin won, if it won.
  if (total > 0) {
    await adminInsert('scores', { user_id: who, game: 'slots', points: Math.round(total), detail: { nonce: spin.nonce, lineBet } });
  }
  return json(spin);
});
