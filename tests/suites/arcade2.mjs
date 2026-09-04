/*
 * The two newer games: the Popularity Duel and Guess the Article, played on
 * a seeded album. Against the offline build (no backend).
 */
import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch(launchOptions());
const ctx = await browser.newContext({ serviceWorkers: 'block', ...devices['Pixel 7'] });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
installStubs(p);
const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const entries = {};
for (let i = 0; i < 24; i++) {
  const key = `en:Thing_${i}`;
  entries[key] = { key, title: `Thing number ${i}`, rarityId: 'rare', price: 300, views: 1000 * (i + 1) * 7, popularity: 0.6, count: 1, favorite: false,
    packId: `theme|${i % 2 ? 'animals' : 'space'}`, packName: i % 2 ? 'Animals' : 'Space', lang: 'en', thumbnail: PX,
    firstPulledAt: 1, lastPulledAt: 1, description: 'A thing', extract: 'Words.' };
}
await p.addInitScript(({ entries }) => {
  if (localStorage.getItem('wikster.test.seeded')) return;
  localStorage.setItem('wikster.test.seeded', '1');
  localStorage.setItem('wikster.language', 'en');
  localStorage.setItem('wikster.profile.v1', JSON.stringify({
    started: true, createdAt: Date.now(), playMs: 0, boostersOpened: 5, rarityCounts: { rare: 24 }, progress: { level: 4, xp: 0 }, pendingLevels: [],
    daily: { lastDay: Math.floor(Date.now() / 86400000), shownDay: Math.floor(Date.now() / 86400000), claimed: 1, board: 0 },
    timed: { count: 0, stamp: Date.now() }, freeTaken: { window: 0, ids: [] }
  }));
  localStorage.setItem('wikster.wallet.v1', '1000');
  localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries }));
}, { entries });
await p.goto(BASE, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
for (let i = 0; i < 4; i++) {
  if (!(await p.locator('#sheet').isVisible().catch(() => false))) break;
  if (await p.locator('#sheet-close').isVisible()) await p.locator('#sheet-close').click(); else await p.locator('#sheet .btn-primary').click().catch(() => 0);
  await p.waitForTimeout(400);
}
const wallet = () => p.evaluate(() => Number(localStorage.getItem('wikster.wallet.v1')));
const go = async (link) => { await p.evaluate(() => document.querySelector('.appbar .icon-btn')?.click()); await p.waitForTimeout(400); await p.locator(`.drawer-link[data-link="${link}"]`).click(); await p.waitForTimeout(800); };
const text = async (sel) => (await p.locator(sel).textContent().catch(() => '')) ?? '';

/* --- the duel ------------------------------------------------------------------ */
section('the popularity duel');
await go('games');
check('the hub offers four games', (await p.locator('#screen-games .game-tile').count()) === 4);
await p.locator('#screen-games .game-tile').nth(2).click();
await p.waitForTimeout(900);
check('the duel opens on its lobby', await p.locator('#screen-duel .duel-start').isVisible());
check('three rounds a day', /3 rounds/.test(await text('#screen-duel .duel')));
await p.locator('#screen-duel .duel-start').click();
await p.waitForTimeout(600);
check('two cards face off', (await p.locator('#screen-duel .duel-card').count()) === 2);
check('one shows its readers', /readers a month/.test(await text('#screen-duel .duel-card.is-known')));
check('the other hides them', (await text('#screen-duel .duel-card.is-asked .duel-figure')).trim() === '?');
const right = async () => p.evaluate(() => { const r = window.__wikster.state.duel.round; return Number(r.right.views) > Number(r.left.views) ? 'higher' : 'lower'; });
const call = async (which) => { await p.locator(`#screen-duel .duel-call[data-call="${which}"]`).click(); await p.waitForTimeout(1200); };
await call(await right());
check('a right call grows the streak', /Streak 1/.test(await text('#screen-duel .duel-score')), await text('#screen-duel .duel-score'));
check('and pays a hundred points', /100 pts/.test(await text('#screen-duel .duel-score')));
await call(await right());
check('the second is worth ten more', /210 pts/.test(await text('#screen-duel .duel-score')), await text('#screen-duel .duel-score'));
const wrong = (await right()) === 'higher' ? 'lower' : 'higher';
const before = await wallet();
await call(wrong);
await p.waitForTimeout(600);
check('a wrong call ends the round', await p.locator('#screen-duel .duel-summary').isVisible());
check('the reckoning says the streak and the points', /streak of 2/.test(await text('#screen-duel .duel-summary')) && /210 points/.test(await text('#screen-duel .duel-summary')), await text('#screen-duel .duel-summary'));
check('and pays a quarter in coins', (await wallet()) === before + 53, `${before} -> ${await wallet()}`);
check('one round is spent', /2 rounds left/.test(await text('#screen-duel .duel')));
check('the best streak is remembered', await p.evaluate(() => JSON.parse(localStorage.getItem('wikster.profile.v1')).duelBest === 2));
await p.screenshot({ path: 'arcade2-duel.png' });

/* --- guess the article ---------------------------------------------------------- */
section('guess the article');
await p.locator('#duel-back').click();
await p.waitForTimeout(600);
await p.locator('#screen-games .game-tile').nth(3).click();
await p.waitForTimeout(900);
check('the reveal opens on its lobby', await p.locator('#screen-reveal .reveal-start').isVisible());
await p.locator('#screen-reveal .reveal-start').click();
await p.waitForTimeout(600);
check('a blurred picture', /blur\(26px\)/.test(await p.locator('#screen-reveal .reveal-stage img').getAttribute('style')));
check('four titles to pick from', (await p.locator('#screen-reveal .reveal-choice').count()) === 4);
check('the first step is worth 250', (await p.locator('#screen-reveal .reveal-step[data-state="now"]').textContent()) === '250');
check('card one of eight', /Card 1 of 8/.test(await text('#screen-reveal .reveal-count')));
const answerKey = () => p.evaluate(() => { const r = window.__wikster.state.reveal.round; return r.items[r.index].card.key; });
await p.locator('#screen-reveal .reveal-clearer').click();
await p.waitForTimeout(300);
check('asking for clearer lifts the blur', /blur\(14px\)/.test(await p.locator('#screen-reveal .reveal-stage img').getAttribute('style')));
check('and the step is now worth 180', (await p.locator('#screen-reveal .reveal-step[data-state="now"]').textContent()) === '180');
await p.locator(`#screen-reveal .reveal-choice[data-key="${await answerKey()}"]`).click();
await p.waitForTimeout(400);
check('the right title pays the step', /180 points/.test(await text('#screen-reveal .reveal-verdict')), await text('#screen-reveal .reveal-verdict'));
check('the picture comes clear', /blur\(2px\)/.test(await p.locator('#screen-reveal .reveal-stage img').getAttribute('style')));
await p.locator('#screen-reveal .reveal-next').click();
await p.waitForTimeout(400);
check('on to card two', /Card 2 of 8/.test(await text('#screen-reveal .reveal-count')));
// A wrong pick on card two, then the right one straight away on the rest.
const wrongKey = await p.evaluate(() => { const r = window.__wikster.state.reveal.round; const it = r.items[r.index]; return it.choices.find((c) => c.key !== it.card.key).key; });
await p.locator(`#screen-reveal .reveal-choice[data-key="${wrongKey}"]`).click();
await p.waitForTimeout(400);
check('a wrong pick names the card', /It was/.test(await text('#screen-reveal .reveal-verdict')));
await p.locator('#screen-reveal .reveal-next').click();
await p.waitForTimeout(400);
const before2 = await wallet();
for (let i = 3; i <= 8; i++) {
  await p.locator(`#screen-reveal .reveal-choice[data-key="${await answerKey()}"]`).click();
  await p.waitForTimeout(300);
  await p.locator('#screen-reveal .reveal-next').click();
  await p.waitForTimeout(400);
}
check('the round ends after eight', await p.locator('#screen-reveal .duel-summary').isVisible());
check('seven of eight named for 1,680 points', /7 of 8/.test(await text('#screen-reveal .duel-summary')) && /1,680 points|1680 points/.test(await text('#screen-reveal .duel-summary')), await text('#screen-reveal .duel-summary'));
check('paid at thirty percent', (await wallet()) === before2 + 504, `${before2} -> ${await wallet()}`);
check('one reveal round is spent', /2 rounds left/.test(await text('#screen-reveal .reveal')));
await p.screenshot({ path: 'arcade2-reveal.png' });

console.log(errors.length ? `\npage errors:\n${errors.join('\n')}` : '\nno page errors');
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
