/* The desktop pass: every screen at 1440x900, shot for inspection. */
import { chromium } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
const browser = await chromium.launch(launchOptions());
const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage(); installStubs(p);
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const card = (key, title, rarityId, price, pack, extra = {}) => ({
  key, title, rarityId, price, views: 400000, popularity: 0.7, count: 1, favorite: false,
  packId: `theme|${pack}`, packName: pack, lang: 'en', thumbnail: PX,
  firstPulledAt: 1, lastPulledAt: 1, description: 'A thing', extract: 'Some words about it.', ...extra
});
const entries = {};
const packs = ['animals', 'space', 'history', 'art', 'food', 'music'];
const tiers = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'exotic', 'prismatic'];
for (let i = 0; i < 30; i++) {
  const k = `en:Card_${i}`;
  entries[k] = card(k, `Article number ${i}`, tiers[i % tiers.length], 100 + i * 90, packs[i % packs.length], { count: (i % 3) + 1 });
}
await p.addInitScript(({ entries }) => {
  localStorage.setItem('wikster.language', 'en');
  const now = Date.now();
  localStorage.setItem('wikster.profile.v1', JSON.stringify({
    started: true, createdAt: now - 86400000 * 40, playMs: 7200000, boostersOpened: 24,
    rarityCounts: { common: 9, rare: 6, epic: 4, legendary: 2 }, progress: { level: 37, xp: 200 }, pendingLevels: [],
    daily: { v: 2, day: 3, weeks: 2, lastDay: Math.floor(now / 86400000), shownDay: Math.floor(now / 86400000) },
    timed: { count: 2, stamp: now }, freeTaken: { window: 0, ids: [] }
  }));
  localStorage.setItem('wikster.wallet.v1', '48000');
  localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries }));
  localStorage.setItem('wikster.inventory.v1', JSON.stringify({
    'theme|animals|std|5': { spec: { kind: 'theme', themeId: 'animals', rarityId: null, cards: 5 }, count: 3 },
    'open|any|epic|5': { spec: { kind: 'open', themeId: null, rarityId: 'epic', cards: 5 }, count: 1 }
  }));
}, { entries });
await p.goto((process.env.BASE_URL ?? 'http://127.0.0.1:4173/'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2600);
const closeSheets = async () => {
  for (let i = 0; i < 8; i++) {
    if (!(await p.locator('#sheet').isVisible().catch(() => false))) return;
    if (await p.locator('#sheet-close').isVisible()) await p.locator('#sheet-close').click();
    else await p.locator('#sheet .btn-primary').click().catch(() => 0);
    await p.waitForTimeout(400);
  }
};
await closeSheets();
const shot = async (name) => { await p.waitForTimeout(700); await p.screenshot({ path: `desktop-${name}.png` }); };
const tab = async (name) => { await p.locator(`.nav-item[data-tab="${name}"]`).click(); await p.waitForTimeout(900); };
const link = async (name) => {
  const l = p.locator(`.drawer-link[data-link="${name}"]`).first();
  if (!(await l.isVisible().catch(() => false))) { await p.evaluate(() => document.querySelector('#menu-btn')?.click()); await p.waitForTimeout(400); }
  await l.click(); await p.waitForTimeout(1000);
};
await tab('shop'); await shot('shop');
await tab('binder');
await p.locator('#binder-seg .seg-option[data-value="albums"]').click(); await shot('albums');
await p.locator(".album-shelf > *").first().click({ force: true }); await p.waitForTimeout(1200); await shot("album-open");
await p.locator('#album-back').click({ force: true }).catch(() => 0); await p.waitForTimeout(700);
await tab('packs'); await tab('binder'); await p.waitForTimeout(500);
await p.locator('#binder-seg .seg-option[data-value="classic"]').click(); await shot('classic');
await tab('packs'); await shot('packs');
await tab('timed'); await shot('timed');
await tab('profile'); await shot('profile');
await link('quests').catch(() => 0); await shot('quests');
await link('customize').catch(() => 0); await shot('customize');
await link('settings').catch(() => 0); await shot('settings');
await link('ach').catch(() => 0); await shot('ach');
await link('updates').catch(() => 0); await shot('updates');
await link('glossary').catch(() => 0); await shot('glossary');
// The level-up sheet, and a card detail.
await p.evaluate(() => window.__wikster.debug?.levelUp?.() ?? window.__wikster.state);
await p.waitForTimeout(400);
console.log('errors:', errs.length ? errs.join(' | ') : 'none');
await browser.close();
