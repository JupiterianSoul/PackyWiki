/**
 * The economy on one page: where Buckarooz come from, where they go, and
 * what a day of play adds up to. Read straight off the modules that decide
 * it, so the numbers here are the numbers in the app. Run it after touching
 * economy.js, shop.js, daily.js, wikdle.js, quiz.js or slots.js:
 *
 *   node tools/economy-report.mjs
 */
import { readFileSync } from 'node:fs';
import { STIPEND, STIPEND_MAX_BANKED, REFRESH_MS, STARTER_COINS, STARTER_PACKS, FREE_SLOTS, FREE_CARDS, FREE_REFRESH_MS,
  SELL_RATE, boosterPrice, pressPrice, cratePriceAt, CRATE_BASE_PRICE, sellPriceFor, CARD_COUNT_RANGE } from '../src/economy.js';
import { weekLadder, loyaltyPct } from '../src/daily.js';
import { WIKDLE_POINTS, HINT_COST, streakBonus } from '../src/wikdle.js';
// albums.js reaches the asset pipeline through codes.js, so its table is read off the file.
import { ACHIEVEMENTS } from '../src/achievements.js';

/** A constant read off a module that cannot be imported outside the browser. */
const constant = (file, name) => {
  const m = readFileSync(file, 'utf8').match(new RegExp(`export const ${name} = ([^;]+);`));
  if (!m) throw new Error(`${name} not found in ${file}`);
  return Function(`return (${m[1]})`)();
};
const QUIZ_MONEY = constant('src/quiz.js', 'QUIZ_MONEY');
const QUIZ_PER_DAY = constant('src/quiz.js', 'QUIZ_PER_DAY');
const LINE_BETS = constant('src/data/slots.js', 'LINE_BETS');
const PAYLINES_COUNT = constant('src/data/slots.js', 'PAYLINES').length;
const ALBUM_TIERS = constant('src/albums.js', 'ALBUM_TIERS');

const n = (x) => Math.round(x).toLocaleString('en-US');
const line = (label, value, note = '') => console.log(`${label.padEnd(44)} ${String(value).padStart(10)}  ${note}`);
const head = (s) => console.log(`\n${s}\n${'-'.repeat(s.length)}`);

head('Coming in, per day (an active player)');
const stipendPerDay = Math.min(STIPEND_MAX_BANKED, 24 * 3600000 / REFRESH_MS) * STIPEND;
line('Shop stipend', n(stipendPerDay), `${STIPEND} every ${REFRESH_MS / 3600000}h, banks ${STIPEND_MAX_BANKED}`);
const week = weekLadder(0);
const weekTotal = week.reduce((s, r) => s + (r.coins ?? 0), 0);
line('Daily gift (average over a week)', n(weekTotal / 7), `week total ${n(weekTotal)}, up to +${loyaltyPct(25)}% loyalty`);
const wikdleBest = Math.round(WIKDLE_POINTS[0] * 0.9 * (1 + streakBonus(30)));
const wikdleTypical = Math.round(WIKDLE_POINTS[3] * 0.9);
line('Wikdle', `${n(wikdleTypical)}..${n(wikdleBest)}`, `points ${WIKDLE_POINTS.join('/')} x0.9, hint ${HINT_COST}`);
line('Quiz (all perfect)', n(QUIZ_PER_DAY * QUIZ_MONEY.large), `${QUIZ_PER_DAY} a day x ${QUIZ_MONEY.small}/${QUIZ_MONEY.medium}/${QUIZ_MONEY.large}`);
line('Free shelf', `${FREE_SLOTS}x${FREE_CARDS} cards / ${FREE_REFRESH_MS / 3600000}h`, 'boosters, not coins');
line('Slot machine', `-${n(LINE_BETS[0] * PAYLINES_COUNT * 0.049)}..-${n(LINE_BETS[LINE_BETS.length - 1] * PAYLINES_COUNT * 0.049)} / spin`, `bets ${LINE_BETS.join('/')} a line x ${PAYLINES_COUNT} lines, RTP about 95% (tools/slots-rtp.mjs)`);
line('Starter', n(STARTER_COINS), `once, with ${STARTER_PACKS} boosters`);
const perDay = stipendPerDay + weekTotal / 7 + wikdleTypical + QUIZ_PER_DAY * QUIZ_MONEY.medium;
line('A typical active day, in coins', n(perDay), 'stipend + gift + Wikdle + quiz at medium');

head('Going out');
const spec = (rarityId, cards = 5) => ({ kind: 'open', themeId: null, rarityId, cards });
for (const r of [null, 'rare', 'epic', 'legendary', 'mythic', 'exotic', 'prismatic']) {
  line(`5-card booster, ${r ? r + ' guaranteed' : 'any tier'}`, n(boosterPrice(spec(r))));
}
line('Press (a 5-card any-tier at the press)', n(pressPrice(spec(null))));
line('Crate', `${n(CRATE_BASE_PRICE)} -> ${n(cratePriceAt(5))}`, 'first, then after five bought today');
line('Booster sizes', `${CARD_COUNT_RANGE[0]}-${CARD_COUNT_RANGE[1]} cards`);
line('Boosters a typical day buys', (perDay / boosterPrice(spec(null))).toFixed(1), 'any-tier 5-card, no selling');

head('Coming back');
line('Selling a card', `${Math.round(SELL_RATE * 100)}% of its price`);
for (const price of [100, 500, 2000, 10000]) line(`  a card priced ${n(price)}`, n(sellPriceFor(price)));
line('Fusing', '3 copies -> 1-card booster a tier up', 'no coins either way');

head('Album medals');
for (const tier of ALBUM_TIERS) {
  line(`${tier.id} at ${tier.need} different cards`, n(tier.coins), tier.booster ? `+ 5-card ${tier.booster.rarityId ?? 'any'} booster of the subject` : '');
}

head('Achievements');
const coinsTotal = ACHIEVEMENTS.reduce((s, a) => s + (a.reward.kind === 'coins' ? a.reward.coins : 0), 0);
const packsTotal = ACHIEVEMENTS.filter((a) => a.reward.kind === 'booster').length;
line('Coins across every achievement', n(coinsTotal), `${ACHIEVEMENTS.length} achievements, ${packsTotal} pay a booster`);
console.log('');
