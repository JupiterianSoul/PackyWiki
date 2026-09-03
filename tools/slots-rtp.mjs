/**
 * The exact return of the slot machine, from its book.
 *
 *   node tools/slots-rtp.mjs
 *
 * Every combination of three stops is equally likely (the server draws each
 * reel's stop uniformly), so the base return is the average payout over all
 * of them, divided by the bet. The bonus adds to it: the share of windows
 * that show three bonus symbols, times the free spins each hands over, times
 * what a free spin pays on average (a free spin pays lines only; it does not
 * open another bonus). Change src/data/slots.js and run this again; the
 * machine should sit at about 95%.
 */
import { REEL, PAYLINES, LINE_BETS, BONUS_SPINS, windowAt, evaluate } from '../src/data/slots.js';

const n = REEL.length;
let paid = 0;
let hits = 0;
let bonuses = 0;
const byLine = {};
for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let c = 0; c < n; c++) {
  const stops = [windowAt(a), windowAt(b), windowAt(c)];
  const { lines, total, bonus } = evaluate(stops, 1);
  paid += total;
  if (total > 0) hits++;
  if (bonus) bonuses++;
  for (const l of lines) byLine[`${l.symbol}x${l.count}`] = (byLine[`${l.symbol}x${l.count}`] ?? 0) + 1;
}
const spins = n ** 3;
const bet = PAYLINES.length;
const base = paid / spins;                 // line pay per spin, in line bets
const pBonus = bonuses / spins;
const withBonus = base * (1 + pBonus * BONUS_SPINS);
console.log(`stops per reel ${n}, spins ${spins}, bet per spin ${bet} line bets, bets ${LINE_BETS.join('/')}`);
console.log(`base RTP ${(100 * base / bet).toFixed(2)}%   bonus 1 in ${(1 / pBonus).toFixed(0)} spins, ${BONUS_SPINS} free spins each, adds ${(100 * (withBonus - base) / bet).toFixed(2)}%`);
console.log(`TOTAL RTP ${(100 * withBonus / bet).toFixed(2)}%   hit rate ${(100 * hits / spins).toFixed(1)}%`);
for (const [k, v] of Object.entries(byLine).sort((x, y) => y[1] - x[1])) console.log(`  ${k.padEnd(9)} 1 in ${(spins / v).toFixed(0)} spins per line`);
