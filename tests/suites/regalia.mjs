import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const b = await chromium.launch(launchOptions());
const ctx = await b.newContext({ ...devices['Pixel 7'] });
const p = await ctx.newPage(); installStubs(p);
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.addInitScript(() => {
  localStorage.setItem('wikster.language', 'en');
  const now = Date.now();
  localStorage.setItem('wikster.profile.v1', JSON.stringify({ started: true, createdAt: now, playMs: 0, boostersOpened: 6, rarityCounts: {}, progress: { level: 30, xp: 0 }, pendingLevels: [], daily: { lastDay: Math.floor(now/86400000), shownDay: Math.floor(now/86400000), claimed: 1, board: 0 }, timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] } }));
  localStorage.setItem('wikster.wallet.v1', '9000');
});
await p.goto((process.env.BASE_URL ?? 'http://127.0.0.1:4173/'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2400);
const closeSheets = async () => { for (let i = 0; i < 8; i++) {
  if (!(await p.locator('#sheet').isVisible().catch(() => false))) return;
  if (await p.locator('#sheet-close').isVisible()) await p.locator('#sheet-close').click();
  else await p.locator('#sheet .btn-primary').click().catch(() => 0);
  await p.waitForTimeout(380); } };
await closeSheets();
const drawer = async (link) => {
  for (let i = 0; i < 5; i++) {
    if (await p.locator('#drawer.is-open').count()) break;
    await p.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
    await p.waitForTimeout(420);
  }
  await p.locator(`.drawer-link[data-link="${link}"]`).click();
  await p.waitForTimeout(900);
};

// --- before the code: nothing gold is on offer -----------------------------
await p.locator('.nav-item[data-tab="customize"]').click().catch(() => 0);
await p.waitForTimeout(400);
await drawer('customize');
const before = await p.evaluate(() => ({
  themes: [...document.querySelectorAll('.theme-card')].map((c) => c.dataset.theme),
  frames: [...document.querySelectorAll('.frame-card')].map((c) => c.dataset.frame),
  fxRows: document.querySelectorAll('.fx-tier').length,
  fxChips: document.querySelectorAll('.fx-chip').length
}));
console.log('   before:', JSON.stringify(before));
check('the gold theme is hidden before the code', !before.themes.includes('apotheosis'));
check('the gold frame is hidden before the code', !before.frames.includes('god'));
check('a card-effect row per rarity', before.fxRows === 8, String(before.fxRows));
check('five styles offered per rarity', before.fxChips === 40, String(before.fxChips));
check('locked styles are marked', await p.locator('.fx-chip.is-locked').count() > 0);
check('high frames are locked at level 30', await p.locator('.frame-card.is-locked').count() >= 4);

// --- redeem ----------------------------------------------------------------
await drawer('settings');
await p.locator('#redeem-list [data-code]').scrollIntoViewIfNeeded();
await p.locator('#redeem-list [data-code]').fill('W1KL0D0');
await p.locator('#redeem-list button[type="submit"]').click();
await p.waitForTimeout(1400);
check('the reveal opens', await p.locator('.reveal').isVisible().catch(() => false));
check('and shows no booster, since it grants none', await p.locator('.reveal-booster').count() === 0);
const revealText = await p.locator('.reveal').textContent().catch(() => '');
check('it names The Creator', /Creator/.test(revealText), revealText.slice(0, 90));
await closeSheets();

const after = await p.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  frame: window.__wikster.store.loadFrameStyle(),
  badges: window.__wikster.store.loadBadgeLoadout()
}));
console.log('   after:', JSON.stringify(after));
check('the gold theme is on', after.theme === 'apotheosis', after.theme);
check('the gold frame is worn', after.frame === 'god', String(after.frame));
check('the Creator badge is worn', (after.badges ?? []).includes('special-creator'), JSON.stringify(after.badges));
check('no booster was added', await p.evaluate(() => Object.keys(window.__wikster.store.loadInventory()).some((k) => k.startsWith('code|creator'))) === false);

await drawer('customize');
const now2 = await p.evaluate(() => ({
  themes: [...document.querySelectorAll('.theme-card')].map((c) => c.dataset.theme),
  frames: [...document.querySelectorAll('.frame-card')].map((c) => c.dataset.frame)
}));
check('the gold theme is in the picker now', now2.themes.includes('apotheosis'));
check('the gold frame is in the picker now', now2.frames.includes('god'));
check('the animated frame is drawn', await p.locator('.frame-card[data-frame="god"] .god-spin').count() > 0);
await p.locator('.frame-card[data-frame="god"]').scrollIntoViewIfNeeded();
await p.locator('.frame-card[data-frame="god"]').screenshot({ path: 'god-frame.png' });
check('redeeming twice is refused', await (async () => {
  await drawer('settings');
  await p.locator('#redeem-list [data-code]').fill('W1KL0D0');
  await p.locator('#redeem-list button[type="submit"]').click();
  await p.waitForTimeout(900);
  return (await p.locator('#redeem-list .find-status').textContent() ?? '').length > 0
    && !(await p.locator('.reveal').isVisible().catch(() => false));
})());
console.log(errs.length ? 'PAGE ERRORS: ' + errs.join('\n') : 'no page errors');
console.log(fails ? `${fails} FAILURES` : 'ALL PASS');
await b.close();
