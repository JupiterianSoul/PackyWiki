/*
 * The desk: the three-column frame at 1600, the panel and its collapse, the
 * album book measured in cards, the two-column lists, and the promise that
 * nothing on a screen runs under the panel. Offline build.
 */
import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch(launchOptions());
const errors = [];
const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const packs = ['animals', 'space', 'history', 'art', 'food', 'music'];
const tiers = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'exotic', 'prismatic'];
const entries = {};
for (let i = 0; i < 90; i++) {
  const k = `en:Card_${i}`;
  entries[k] = { key: k, title: `Article number ${i}`, rarityId: tiers[i % 8], price: 100 + i * 90, views: 400000, popularity: 0.7,
    count: (i % 3) + 1, favorite: false, packId: `theme|${packs[i % 6]}`, packName: packs[i % 6], lang: 'en', thumbnail: PX,
    firstPulledAt: 1, lastPulledAt: 1, description: 'A thing', extract: 'Some words about it.' };
}

async function open(viewport) {
  const ctx = await browser.newContext(viewport
    ? { serviceWorkers: 'block', viewport, deviceScaleFactor: 1 }
    : { serviceWorkers: 'block', ...devices['Pixel 7'] });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  installStubs(p);
  await p.addInitScript(({ entries }) => {
    localStorage.setItem('wikster.language', 'en');
    const now = Date.now();
    localStorage.setItem('wikster.profile.v1', JSON.stringify({
      started: true, createdAt: now - 86400000 * 40, playMs: 7200000, boostersOpened: 24,
      rarityCounts: { common: 9, rare: 6 }, progress: { level: 37, xp: 200 }, pendingLevels: [],
      daily: { v: 2, day: 3, weeks: 2, lastDay: Math.floor(now / 86400000), shownDay: Math.floor(now / 86400000) },
      timed: { count: 2, stamp: now }, freeTaken: { window: 0, ids: [] }
    }));
    localStorage.setItem('wikster.wallet.v1', '48000');
    localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries }));
  }, { entries });
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2400);
  for (let i = 0; i < 6; i++) {
    if (!(await p.locator('#sheet').isVisible().catch(() => false))) break;
    if (await p.locator('#sheet-close').isVisible()) await p.locator('#sheet-close').click();
    else await p.locator('#sheet .btn-primary').click().catch(() => 0);
    await p.waitForTimeout(350);
  }
  return p;
}
const tab = async (p, name) => { await p.locator(`.nav-item[data-tab="${name}"]`).click(); await p.waitForTimeout(800); };
const link = async (p, name) => { await p.locator(`.drawer-link[data-link="${name}"]`).first().click(); await p.waitForTimeout(900); };
const box = (p, sel) => p.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }, sel);
/** The furthest right any painted thing on the screen reaches. */
const rightEdge = (p) => p.evaluate(() => {
  let max = 0;
  for (const el of document.querySelectorAll('main .screen.is-active *')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.height && r.top < innerHeight && r.bottom > 0) max = Math.max(max, r.right);
  }
  return Math.round(max);
});

/* --- the frame ---------------------------------------------------------------- */
section('the frame at 1600 by 1000');
const d = await open({ width: 1600, height: 1000 });
const rail = await box(d, '.navbar');
check('a rail down the left', rail.x === 0 && rail.h >= 900, JSON.stringify(rail));
check('with the app\'s name and its destinations', (await d.locator('.navbar .nav-item').count()) >= 5);
check('and the drawer\'s list folded into it', (await d.locator('.navbar .drawer-link').count()) >= 8);
check('no menu button beside a menu', !(await d.locator('#menu-btn').isVisible()));
const panel = await box(d, '#panel');
check('a panel down the right', panel.x + panel.w === 1600 && panel.w >= 320, JSON.stringify(panel));
check('the day is on it', /Level 37/.test(await d.locator('#panel-body').textContent()));
check('and what the screen at hand keeps out of sight', (await d.locator('.panel-block').count()) === 2);
const edge = await rightEdge(d);
check('nothing on the screen runs under the panel', edge <= panel.x, `content to ${edge}, panel from ${panel.x}`);
check('no sideways overflow', await d.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

/* --- the panel follows the screen ---------------------------------------------- */
section('the panel follows the screen');
await tab(d, 'shop');
check('the shop puts its clocks on it', /New stock in/i.test(await d.locator('#panel-body').textContent()));
await tab(d, 'binder');
check('the collection puts its count on it', /different/i.test(await d.locator('#panel-body').textContent()));
await link(d, 'games');
check('the arcade puts the day\'s rounds on it', /rounds left/i.test(await d.locator('#panel-body').textContent()));

/* --- collapsing ----------------------------------------------------------------- */
section('collapsing');
await tab(d, 'shop');
const wide = await box(d, '.screen.is-active');
await d.locator('#panel-toggle').click();
await d.waitForTimeout(700);
check('the panel folds away', (await d.evaluate(() => document.documentElement.dataset.panel)) === 'closed');
const wider = await box(d, '.screen.is-active');
check('and the work takes the room', wider.w > wide.w + 200, `${wide.w} -> ${wider.w}`);
check('the handle stays reachable', await d.locator('#panel-toggle').isVisible());
const edge2 = await rightEdge(d);
check('still nothing under it', edge2 <= 1600 - 40, String(edge2));
await d.locator('#panel-toggle').click();
await d.waitForTimeout(600);
check('and it comes back', (await d.evaluate(() => document.documentElement.dataset.panel)) === 'open');

/* --- more than one column -------------------------------------------------------- */
section('more than one column');
await link(d, 'settings');
const rows = await d.evaluate(() => {
  const list = [...document.querySelectorAll('#settings-list > .row')].slice(0, 2).map((r) => Math.round(r.getBoundingClientRect().x));
  return list;
});
check('settings run in two columns', rows.length === 2 && rows[1] > rows[0] + 200, JSON.stringify(rows));
await tab(d, 'profile');
const hero = await box(d, '#screen-profile .hero-card');
const stats = await box(d, '#stat-grid');
check('the profile puts who you are beside what you have', stats.x > hero.x + hero.w - 40 && hero.y < 200, JSON.stringify({ hero, stats }));
check('and the card does not stretch down the page', hero.h < 700, String(hero.h));

/* --- cards are cards -------------------------------------------------------------- */
section('the book');
await tab(d, 'binder');
await d.locator('#binder-seg .seg-option[data-value="albums"]').click();
await d.waitForTimeout(700);
await d.evaluate(() => [...document.querySelectorAll('.album-cover')].find((c) => !c.classList.contains('is-locked'))?.click());
await d.waitForTimeout(1100);
const slots = await d.locator('#page-slots > *').count();
check('a page of the book holds eight on a desk', slots === 8, String(slots));
const card = await box(d, '#page-slots .card');
check('and a card is the size of a card', card.w >= 130 && card.w <= 230, String(card.w));
check('the medals are not in the album', (await d.locator('.album-tiers, .album-tier').count()) === 0);
await d.screenshot({ path: 'desk-album.png' });
await tab(d, 'shop');
await d.screenshot({ path: 'desk-shop.png' });

/* --- and the phone is untouched ---------------------------------------------------- */
section('the phone is untouched');
const m = await open(null);
check('no rail', (await m.locator('.navbar').boundingBox()).width < 460);
check('no panel', !(await m.locator('#panel').isVisible()));
await m.locator('.nav-item[data-tab="binder"]').click();
await m.waitForTimeout(700);
await m.locator('#binder-seg .seg-option[data-value="albums"]').click();
await m.waitForTimeout(600);
await m.evaluate(() => [...document.querySelectorAll('.album-cover')].find((c) => !c.classList.contains('is-locked'))?.click());
await m.waitForTimeout(1000);
check('a page of the book still holds four in a hand', (await m.locator('#page-slots > *').count()) === 4);

console.log(errors.length ? `\npage errors:\n${errors.join('\n')}` : '\nno page errors');
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
