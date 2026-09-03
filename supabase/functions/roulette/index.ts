/**
 * THE ROULETTE WHEEL
 * ----------------------------------------------------------------------------
 * The wheel is spun here and only here. The client sends its chips; this
 * checks every one against the table (a copy of src/data/roulette.js, kept in
 * step by tools/sync-game-tables.mjs), draws a pocket from the platform's
 * cryptographic generator, settles each chip, and answers with the pocket
 * and the settlement. The client turns its wheel to the pocket it is told.
 *
 *   supabase functions deploy roulette
 */
import { CORS, json, callerId, adminInsert, randomBelow, nonce } from '../_shared/caller.ts';
import { WHEEL_ORDER, TIER_BETS, CHIPS, TABLE_LIMIT, RETURNS } from '../_shared/roulette.ts';

type Bet = { kind: string; pick: string | number; amount: number };

const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorOf = (n: number) => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');

function valid(bet: Bet): boolean {
  const amount = Number(bet?.amount);
  if (!Number.isFinite(amount) || amount <= 0 || !CHIPS.some((c) => amount % c === 0)) return false;
  const pick = bet.pick;
  switch (bet.kind) {
    case 'straight': return Number.isInteger(Number(pick)) && Number(pick) >= 0 && Number(pick) <= 36;
    case 'color': return pick === 'red' || pick === 'black';
    case 'parity': return pick === 'even' || pick === 'odd';
    case 'half': return pick === 'low' || pick === 'high';
    case 'dozen': case 'column': return [1, 2, 3].includes(Number(pick));
    case 'tier': return TIER_BETS.some((tb) => tb.id === pick);
    default: return false;
  }
}

function wins(bet: Bet, n: number): boolean {
  const pick = bet.pick;
  switch (bet.kind) {
    case 'straight': return n === Number(pick);
    case 'color': return n !== 0 && colorOf(n) === pick;
    case 'parity': return n !== 0 && (n % 2 === 0) === (pick === 'even');
    case 'half': return n !== 0 && (pick === 'low' ? n <= 18 : n >= 19);
    case 'dozen': return n !== 0 && Math.ceil(n / 12) === Number(pick);
    case 'column': return n !== 0 && ((n - 1) % 3) + 1 === Number(pick);
    case 'tier': { const tier = TIER_BETS.find((tb) => tb.id === pick); return Boolean(tier) && n !== 0 && n <= tier!.numbers; }
    default: return false;
  }
}

const returnsFor = (bet: Bet) =>
  bet.kind === 'tier' ? (TIER_BETS.find((tb) => tb.id === bet.pick)?.multiplier ?? 0) : (RETURNS[bet.kind] ?? 0);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const who = await callerId(req);
  if (!who) return json({ error: 'SIGN_IN' }, 401);

  let body: { bets?: unknown } = {};
  try { body = await req.json(); } catch { return json({ error: 'BAD_JSON' }, 400); }
  const bets = Array.isArray(body.bets) ? (body.bets as Bet[]) : [];
  if (!bets.length || bets.length > 24 || !bets.every(valid)) return json({ error: 'BAD_BET' }, 400);
  const staked = bets.reduce((sum, b) => sum + Number(b.amount), 0);
  if (staked > TABLE_LIMIT) return json({ error: 'OVER_LIMIT', limit: TABLE_LIMIT }, 400);

  const pocket = WHEEL_ORDER[randomBelow(WHEEL_ORDER.length)];
  const results = bets.map((bet) => {
    const won = wins(bet, pocket);
    const returned = won ? Math.round(Number(bet.amount) * returnsFor(bet) * 100) / 100 : 0;
    return { kind: bet.kind, pick: bet.pick, amount: Number(bet.amount), won, returned };
  });
  const returned = Math.round(results.reduce((sum, r) => sum + r.returned, 0) * 100) / 100;
  const spin = { nonce: nonce(), at: Date.now(), pocket, color: colorOf(pocket), results, staked, returned, net: Math.round((returned - staked) * 100) / 100 };

  if (returned > 0) {
    await adminInsert('scores', { user_id: who, game: 'roulette', points: Math.round(returned), detail: { nonce: spin.nonce, pocket } });
  }
  return json(spin);
});
