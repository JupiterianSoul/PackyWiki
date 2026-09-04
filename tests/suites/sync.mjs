/*
 * Sync: the save is merged key by key between devices, a fresh device takes
 * the account whole, the server keeps the save's history, and a backup can be
 * put back. Against the stubbed Supabase.
 */
import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { installSupabase, newDatabase } from '../lib/supastub.mjs';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const browser = await chromium.launch(launchOptions());
const shared = newDatabase();
const errors = [];
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const COL = 'wikster.collection.v3';
const WALLET = 'wikster.wallet.v1';
const THEME = 'wikster.theme';
const card = (key, title, rarityId, price, pack) => ({
  key, title, rarityId, price, views: 400000, popularity: 0.7, count: 1, favorite: false,
  packId: `theme|${pack}`, packName: pack[0].toUpperCase() + pack.slice(1), lang: 'en',
  thumbnail: PX, firstPulledAt: 1, lastPulledAt: 1, description: 'A thing', extract: 'Some words about it.'
});
const MINE = {
  'en:Cat': card('en:Cat', 'Cat', 'rare', 300, 'animals'),
  'en:Dog': card('en:Dog', 'Dog', 'legendary', 1600, 'animals')
};
const keysOf = (page) => page.evaluate((k) => Object.keys(JSON.parse(localStorage.getItem(k) ?? '{"entries":{}}').entries), COL);
const local = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);

async function device(label, { cards = {}, wallet = '50000', owner = null, extra = {} } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label} PAGE: ${e.message}`));
  installStubs(page);
  installSupabase(page, { db: shared });
  await page.addInitScript(({ cards, wallet, owner, extra }) => {
    // Once per device: a reload (a restore ends in one) must find the
    // storage the app left, not this script's starting point again.
    if (localStorage.getItem('wikster.test.seeded')) return;
    localStorage.setItem('wikster.test.seeded', '1');
    localStorage.setItem('wikster.language', 'en');
    localStorage.setItem('wikster.profile.v1', JSON.stringify({
      started: true, createdAt: Date.now(), playMs: 0, boostersOpened: 3,
      rarityCounts: {}, progress: { level: 5, xp: 0 }, pendingLevels: [],
      daily: { lastDay: Math.floor(Date.now() / 86400000), shownDay: Math.floor(Date.now() / 86400000), claimed: 1, board: 0 },
      timed: { count: 0, stamp: Date.now() }, freeTaken: { window: 0, ids: [] }
    }));
    localStorage.setItem('wikster.wallet.v1', wallet);
    localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries: cards }));
    if (owner) localStorage.setItem('wikster.syncedUser', owner);
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
  }, { cards, wallet, owner, extra });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await closeSheets(page);
  return page;
}
async function closeSheets(page) {
  for (let i = 0; i < 6; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    if (await page.locator('#sheet-close').isVisible()) await page.locator('#sheet-close').click();
    else await page.locator('#sheet .btn-primary').click().catch(() => 0);
    await page.waitForTimeout(400);
  }
}
async function gate(page, mode, email, username) {
  await page.locator(`#gate-seg .seg-option[data-value="${mode}"]`).click();
  await page.waitForTimeout(200);
  await page.locator('#gate-form input[name="email"]').fill(email);
  await page.locator('#gate-form input[name="password"]').fill('hunter2hunter2');
  await page.locator('#gate-form button[type="submit"]').click();
  await page.waitForTimeout(1200);
  if (await page.locator('#gate-form input[name="username"]').count()) {
    await page.locator('#gate-form input[name="username"]').fill(username);
    await page.locator('#gate-form button[type="submit"]').click();
  }
  await page.waitForTimeout(2500);
  await closeSheets(page);
}
const viaDrawer = async (page, link) => {
  await page.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
  await page.waitForTimeout(400);
  await page.locator(`.drawer-link[data-link="${link}"]`).click();
  await page.waitForTimeout(800);
};

/* --- the first device signs up and its save goes up ---------------------- */
section('first sign-in');
const a = await device('A', { cards: MINE });
await gate(a, 'signup', 'ada@example.com', 'ada_lovelace');
const idA = [...shared.profiles.values()].find((p) => p.username === 'ada_lovelace')?.id;
check('the account exists', Boolean(idA));
const first = shared.saves.get(idA);
check('the save went up', Boolean(first?.data?.data?.[COL]));
check('as a version 2 envelope', first?.data?.version === 2, String(first?.data?.version));
check('with a stamp per key', typeof first?.data?.stamps === 'object' && COL in first.data.stamps);
check('the device remembers whose save it holds', (await local(a, 'wikster.syncedUser')) === idA);

/* --- another device wrote meanwhile: the push merges ---------------------- */
section('a push merges');
await a.evaluate(() => window.__wikster.store.saveWallet(60000));   // stamped now, and queued for sync
await a.waitForTimeout(300);
{
  const row = shared.saves.get(idA);
  row.data.data[THEME] = 'noir';
  row.data.stamps[THEME] = Date.now() + 60000;   // the other device, later
  row.data.data[WALLET] = '1';
  row.data.stamps[WALLET] = 1;                   // the other device, long ago
  row.updated_at = new Date(Date.now() + 1000).toISOString();
}
await a.waitForTimeout(5500);   // past the sync debounce
const merged = shared.saves.get(idA);
check('the other device\'s newer theme is kept', merged?.data?.data?.[THEME] === 'noir', String(merged?.data?.data?.[THEME]));
check('this device\'s newer wallet is kept', merged?.data?.data?.[WALLET] === '60000', String(merged?.data?.data?.[WALLET]));
check('the newer theme came down to this device', (await local(a, THEME)) === 'noir', String(await local(a, THEME)));
check('and the wallet stayed', (await local(a, WALLET)) === '60000');
check('the merge is said on screen', /merged|fusionn/i.test(await a.locator('#toast').textContent().catch(() => '')));

/* --- the same account on a device that already played it: merged at sign-in */
section('sign-in merges on a known device');
const later = Date.now() + 120000;
const b = await device('B', {
  cards: { ...MINE, 'en:Mars': card('en:Mars', 'Mars', 'epic', 800, 'space') }, wallet: '70000', owner: idA,
  extra: { 'wikster.stamps.v1': JSON.stringify({ [COL]: later, [WALLET]: later }) }
});
await gate(b, 'signin', 'ada@example.com', 'ada_lovelace');
check('the local newer collection is kept', (await keysOf(b)).includes('en:Mars'));
check('the local newer wallet is kept', (await local(b, WALLET)) === '70000');
check('the account\'s newer theme comes down', (await local(b, THEME)) === 'noir');
const pushedB = shared.saves.get(idA);
check('and the merged save went up', JSON.parse(pushedB.data.data[COL]).entries['en:Mars'] !== undefined && pushedB.data.data[THEME] === 'noir');

/* --- a fresh device takes the account whole ------------------------------- */
section('a fresh device');
const c = await device('C', { cards: { 'en:Zebra': card('en:Zebra', 'Zebra', 'rare', 300, 'animals') }, wallet: '5' });
await gate(c, 'signin', 'ada@example.com', 'ada_lovelace');
const keysC = await keysOf(c);
check('the account\'s cards replace the device\'s', keysC.includes('en:Mars') && keysC.includes('en:Cat'), keysC.join(','));
check('the device\'s pre-account card is gone', !keysC.includes('en:Zebra'));
check('the wallet is the account\'s', (await local(c, WALLET)) === '70000');
check('the device now belongs to the account', (await local(c, 'wikster.syncedUser')) === idA);

/* --- the server kept the history, and a backup goes back ------------------ */
section('backups');
const history = shared.savesHistory.filter((h) => h.user_id === idA);
check('the server filed earlier versions', history.length >= 2, String(history.length));
check('with what each held', history.every((h) => typeof h.cards === 'number' && typeof h.coins === 'number'));
await viaDrawer(c, 'settings');
const backupsRow = c.locator('#data-list .row', { hasText: /backups|sauvegardes/i });
check('settings offers the backups', (await backupsRow.count()) === 1);
await backupsRow.locator('button').click();
await c.waitForTimeout(1500);
const rowsShown = c.locator('#sheet-body .press .row');
check('the sheet lists them', (await rowsShown.count()) >= 2, String(await rowsShown.count()));
check('each says how many cards it held', /cards|cartes/.test(await rowsShown.first().textContent()));
await c.screenshot({ path: 'sync-backups.png' });
// The oldest is the first push: two cards, 50,000 coins.
const oldest = rowsShown.last();
const restore = oldest.locator('button');
await restore.click(); await c.waitForTimeout(300);
check('restoring asks twice', /again|encore/i.test(await restore.textContent()));
await restore.click();
await c.waitForTimeout(4500);   // restored, said, reloaded
await closeSheets(c);
const keysAfter = await keysOf(c);
check('the restored save is the old one', keysAfter.includes('en:Cat') && !keysAfter.includes('en:Mars'), keysAfter.join(','));
check('and it is the account\'s save now', JSON.parse(shared.saves.get(idA).data.data[COL]).entries['en:Mars'] === undefined);
check('the save it replaced was filed first', shared.savesHistory.some((h) => h.user_id === idA && h.reason === 'before-restore'));

console.log(errors.length ? `\npage errors:\n${errors.join('\n')}` : '\nno page errors');
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
