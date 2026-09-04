/*
 * Offline: the shell is stored on the first visit, and the app opens with
 * no line at all afterwards. Against the offline build (no backend).
 */
import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch(launchOptions());
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
installStubs(p);
await p.addInitScript(() => {
  if (localStorage.getItem('wikster.test.seeded')) return;
  localStorage.setItem('wikster.test.seeded', '1');
  localStorage.setItem('wikster.language', 'en');
  localStorage.setItem('wikster.profile.v1', JSON.stringify({
    started: true, createdAt: Date.now(), playMs: 0, boostersOpened: 3, rarityCounts: {}, progress: { level: 2, xp: 0 }, pendingLevels: [],
    daily: { lastDay: Math.floor(Date.now() / 86400000), shownDay: Math.floor(Date.now() / 86400000), claimed: 1, board: 0 },
    timed: { count: 0, stamp: Date.now() }, freeTaken: { window: 0, ids: [] }
  }));
});

await p.goto(BASE, { waitUntil: 'load' });
check('the page names its manifest', (await p.locator('link[rel="manifest"]').count()) === 1);
const manifest = await p.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
check('the manifest is served', manifest?.name === 'Wikster' && manifest.icons?.length === 3);
const iconOk = await p.evaluate(async () => (await fetch('./icons/icon-192.png')).ok);
check('and its icons', iconOk);
const sw = await p.evaluate(async () => (await fetch('./sw.js')).text());
check('the worker is served with this build\'s files in it', /PRECACHE = \[/.test(sw) && /assets\/index-/.test(sw));
check('and without the music', !/\.mp3/.test(sw.split('PRECACHE = ')[1].split('];')[0]));

// The registration is asked for a few seconds after launch.
await p.waitForTimeout(4500);
const state = await p.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'none';
  await navigator.serviceWorker.ready;
  return (reg.active ?? reg.waiting ?? reg.installing)?.state ?? 'unknown';
});
check('the worker is registered and active', state === 'activated', state);
const shellKeys = await p.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('wikster-shell-')));
check('the shell is stored', shellKeys.length === 1, shellKeys.join(','));
const stored = await p.evaluate(async () => {
  const cache = await caches.open((await caches.keys()).find((k) => k.startsWith('wikster-shell-')));
  return (await cache.keys()).length;
});
check('with the page, the scripts, the styles and the sounds', stored >= 8, String(stored));

// No line at all: the app still opens, from the shell.
await ctx.setOffline(true);
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
check('offline, the page still loads', await p.locator('#app').isVisible());
check('and the app is painted', (await p.locator('.nav-item').count()) >= 5, String(await p.locator('.nav-item').count()));
check('the shop is reachable', await p.locator('.nav-item[data-tab="shop"]').isVisible());
await p.screenshot({ path: 'offline-shell.png' });
await ctx.setOffline(false);

console.log(errors.length ? `\npage errors:\n${errors.join('\n')}` : '\nno page errors');
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
