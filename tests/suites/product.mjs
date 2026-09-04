/*
 * Product: album medals (reached, claimed, paid) and fusing three copies
 * into a booster a tier up. Against the offline build (no backend).
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
const card = (key, title, rarityId, price, pack, extra = {}) => ({
  key, title, rarityId, price, views: 400000, popularity: 0.7, count: 1, favorite: false,
  packId: `theme|${pack}`, packName: pack[0].toUpperCase() + pack.slice(1), lang: 'en',
  thumbnail: PX, firstPulledAt: 1, lastPulledAt: 1, description: 'A thing', extract: 'Some words about it.', ...extra
});
// Eighty different animals (bronze is 75), one of them with five copies.
const entries = {};
for (let i = 0; i < 80; i++) entries[`en:Animal_${i}`] = card(`en:Animal_${i}`, `Animal number ${i}`, ['common', 'uncommon', 'rare'][i % 3], 100 + i, 'animals');
entries['en:Dog'] = card('en:Dog', 'Dog', 'rare', 300, 'animals', { count: 5 });
entries['en:Paris'] = card('en:Paris', 'Paris', 'prismatic', 9000, 'geography', { count: 6 });

await p.addInitScript(({ entries }) => {
  if (localStorage.getItem('wikster.test.seeded')) return;
  localStorage.setItem('wikster.test.seeded', '1');
  localStorage.setItem('wikster.language', 'en');
  localStorage.setItem('wikster.profile.v1', JSON.stringify({
    started: true, createdAt: Date.now(), playMs: 0, boostersOpened: 30, rarityCounts: { common: 30, rare: 20 }, progress: { level: 9, xp: 0 }, pendingLevels: [],
    daily: { lastDay: Math.floor(Date.now() / 86400000), shownDay: Math.floor(Date.now() / 86400000), claimed: 1, board: 0 },
    timed: { count: 0, stamp: Date.now() }, freeTaken: { window: 0, ids: [] }
  }));
  localStorage.setItem('wikster.wallet.v1', '10000');
  localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries }));
  localStorage.setItem('wikster.inventory.v1', JSON.stringify({}));
}, { entries });
await p.goto(BASE, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
for (let i = 0; i < 4; i++) {
  if (!(await p.locator('#sheet').isVisible().catch(() => false))) break;
  if (await p.locator('#sheet-close').isVisible()) await p.locator('#sheet-close').click(); else await p.locator('#sheet .btn-primary').click().catch(() => 0);
  await p.waitForTimeout(400);
}
const wallet = () => p.evaluate(() => Number(localStorage.getItem('wikster.wallet.v1')));
const tab = async (name) => { await p.locator(`.nav-item[data-tab="${name}"]`).click(); await p.waitForTimeout(800); };

/* --- medals ------------------------------------------------------------------ */
section('album medals');
await tab('binder');
await p.locator('#binder-seg .seg-option[data-value="albums"]').click();
await p.waitForTimeout(600);
const animals = p.locator('.album-cover', { hasText: /animals/i });
check('the shelf shows the animals album', (await animals.count()) === 1);
check('its cover wears a medal', (await animals.locator('.album-cover-medal').count()) === 1);
check('a bronze one', (await animals.locator('.album-cover-medal').getAttribute('data-tier')) === 'bronze');
const geography = p.locator('.album-cover', { hasText: /geography/i });
check('an album under seventy-five wears none', (await geography.locator('.album-cover-medal').count()) === 0);
// The shelf is repainted when the category sizes arrive, so the click goes to the DOM, not to a node that may just have been replaced.
await p.evaluate(() => [...document.querySelectorAll('.album-cover')].find((c) => /animals/i.test(c.textContent))?.click());
await p.waitForTimeout(1200);
const tiers = p.locator('.album-tiers .album-tier');
check('the open album shows four rungs', (await tiers.count()) === 4, String(await tiers.count()));
check('bronze is reached and waiting', (await tiers.nth(0).getAttribute('data-state')) === 'ready');
check('silver is locked', (await tiers.nth(1).getAttribute('data-state')) === 'locked');
check('and says what it asks', /200/.test(await tiers.nth(1).textContent()));
check('exactly one claim button', (await p.locator('.album-tier-claim').count()) === 1);
await p.screenshot({ path: 'product-medals.png' });
const before = await wallet();
await p.locator('.album-tier-claim').click();
await p.waitForTimeout(900);
check('claiming pays the coins', (await wallet()) === before + 2500, `${before} -> ${await wallet()}`);
check('bronze is now claimed', (await tiers.nth(0).getAttribute('data-state')) === 'claimed');
check('no claim button is left', (await p.locator('.album-tier-claim').count()) === 0);
check('the medal is remembered', await p.evaluate(() => JSON.parse(localStorage.getItem('wikster.profile.v1')).albumTiers?.['theme:animals'] === 1));
await p.evaluate(() => document.querySelector('#album-back')?.click());
await p.waitForTimeout(600);

/* --- fusion -------------------------------------------------------------------- */
section('fusing copies');
await p.locator('#binder-seg .seg-option[data-value="classic"]').click();
await p.waitForTimeout(700);
// Cards are opened through the DOM: the grid is repainted around a sheet
// closing, and a pointer click can land on a node that was just replaced.
const openCard = async (title) => {
  await p.evaluate((title) => [...document.querySelectorAll('.classic-grid .card')].find((c) => c.textContent.includes(title))?.click(), title);
  await p.locator('#sheet').waitFor({ state: 'visible' });
  await p.waitForTimeout(600);
};
const closeSheet = async () => { await p.locator('#sheet-close').click(); await p.locator('#sheet').waitFor({ state: 'hidden' }); await p.waitForTimeout(300); };
await openCard('Dog');
const fuse = p.locator('#sheet .fuse');
check('a card with five copies offers fusion', await fuse.isVisible());
check('into the tier above', /epic/i.test(await fuse.textContent()), await fuse.textContent());
await closeSheet();
await openCard('Paris');
check('the sheet is open on the prismatic', await p.locator('#sheet').isVisible());
check('a prismatic has nowhere to go', !(await p.locator('#sheet .fuse').isVisible()));
await closeSheet();
await openCard('Dog');
await p.locator('#sheet .fuse').click();
await p.waitForTimeout(300);
check('the first tap arms', /again|encore/i.test(await p.locator('#sheet .fuse').textContent()));
check('nothing fused yet', await p.evaluate(() => JSON.parse(localStorage.getItem('wikster.collection.v3')).entries['en:Dog'].count === 5));
await p.locator('#sheet .fuse').click();
await p.waitForTimeout(1000);
check('three copies are gone', await p.evaluate(() => JSON.parse(localStorage.getItem('wikster.collection.v3')).entries['en:Dog'].count === 2));
const inv = await p.evaluate(() => JSON.parse(localStorage.getItem('wikster.inventory.v1')));
check('a one-card epic booster is on the shelf', inv['open|any|epic|1']?.count === 1, JSON.stringify(Object.keys(inv)));
check('the sheet still shows the card', await p.locator('#sheet').isVisible());
check('with two copies left, no more fusing', !(await p.locator('#sheet .fuse').isVisible()));
check('the fusion is counted', await p.evaluate(() => JSON.parse(localStorage.getItem('wikster.profile.v1')).fused === 1));
await p.screenshot({ path: 'product-fused.png' });

console.log(errors.length ? `\npage errors:\n${errors.join('\n')}` : '\nno page errors');
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
