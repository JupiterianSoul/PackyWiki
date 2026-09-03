/**
 * The exact return of the slot machine, from its book.
 *
 *   node tools/slots-rtp.mjs
 *
 * Every combination of three stops is equally likely (the server draws each
 * reel's stop uniformly), so the return is the average payout over all of
 * them, divided by the bet. Change src/data/slots.js and run this again;
 * the machine should sit at about 95%.
 */
import { REEL, PAYLINES, windowAt, evaluate } from '../src/data/slots.js';

const n = REEL.length;
let paid = 0;
let hits = 0;
const byLine = {};
for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let c = 0; c < n; c++) {
  const stops = [windowAt(a), windowAt(b), windowAt(c)];
  const { lines, total } = evaluate(stops, 1);
  paid += total;
  if (total > 0) hits++;
  for (const l of lines) byLine[`${l.symbol}x${l.count}`] = (byLine[`${l.symbol}x${l.count}`] ?? 0) + 1;
}
const spins = n ** 3;
const bet = PAYLINES.length;
console.log(`stops per reel ${n}, spins ${spins}, bet per spin ${bet} line bets`);
console.log(`RTP ${(100 * paid / spins / bet).toFixed(2)}%   hit rate ${(100 * hits / spins).toFixed(1)}%`);
for (const [k, v] of Object.entries(byLine).sort((x, y) => y[1] - x[1])) console.log(`  ${k.padEnd(9)} 1 in ${(spins * PAYLINES.length / v / PAYLINES.length).toFixed(0)} spins per line`);
