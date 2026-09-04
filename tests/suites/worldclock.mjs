/* The World Clock: the daily week on UTC, quests painted in place, the podium, the toast card, the ladder and the Singularity. */
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
const ctx = await browser.newContext({ serviceWorkers: 'block', ...devices['Pixel 7'] });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(e.message));
installStubs(p); installSupabase(p, { db: shared });
const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
await p.addInitScript(({ PX }) => {
  localStorage.setItem('wikster.language', 'en');
  const now = Date.now();
  // An OLD daily record: board 1, 9 claimed, last claim two local days ago.
  const localDay = Math.floor((now - new Date(now).getTimezoneOffset() * 60000) / 86400000);
  localStorage.setItem('wikster.profile.v1', JSON.stringify({ started: true, createdAt: now, playMs: 0, boostersOpened: 3, rarityCounts: {}, progress: { level: 500, xp: 0 }, pendingLevels: [],
    daily: { board: 1, claimed: 9, lastDay: localDay - 2, shownDay: localDay }, timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] } }));
  localStorage.setItem('wikster.wallet.v1', '3000');
  localStorage.setItem('wikster.frameStyle.v1', 'singularity');
  localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries: { 'en:Cat': { key: 'en:Cat', title: 'Cat', rarityId: 'rare', price: 300, views: 400000, popularity: 0.7, count: 1, favorite: false, packId: 'theme|animals', packName: 'Animals', lang: 'en', thumbnail: PX, firstPulledAt: 1, lastPulledAt: 1 } } }));
}, { PX });
await p.goto((process.env.BASE_URL ?? 'http://127.0.0.1:4173/'), { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2200);
const closeSheets = async () => { for (let i = 0; i < 6; i++) { if (!(await p.locator('#sheet').isVisible().catch(() => false))) return; if (await p.locator('#sheet-close').isVisible()) await p.locator('#sheet-close').click(); else await p.locator('#sheet .btn-primary').click().catch(() => 0); await p.waitForTimeout(400); } };
await closeSheets();
// sign up
await p.locator('#gate-seg .seg-option[data-value="signup"]').click(); await p.waitForTimeout(250);
await p.locator('#gate-form input[name="email"]').fill('ada@example.com');
await p.locator('#gate-form input[name="password"]').fill('hunter2hunter2');
await p.locator('#gate-form button[type="submit"]').click(); await p.waitForTimeout(1000);
if (await p.locator('#gate-form input[name="username"]').count()) { await p.locator('#gate-form input[name="username"]').fill('ada_lovelace'); await p.locator('#gate-form button[type="submit"]').click(); await p.waitForTimeout(1100); }
await closeSheets();
const viaDrawer = async (link) => { await p.evaluate(() => document.querySelector('.appbar .icon-btn')?.click()); await p.waitForTimeout(400); await p.locator(`.drawer-link[data-link="${link}"]`).click(); await p.waitForTimeout(900); };

section('the ladder and the Singularity');
check('the app bar wears the Singularity', (await p.locator('#level-badge .frame-overlay .sing-spin').count()) === 3);
check('its disc turns and its ring breathes', await p.evaluate(() => {
  const spin = document.querySelector('#level-badge .sing-in'); const ring = document.querySelector('#level-badge .sing-ring');
  return spin && ring && getComputedStyle(spin).animationName === 'god-turn' && getComputedStyle(ring).animationName === 'sing-breathe';
}));
await p.screenshot({ path: 'wc-appbar.png', clip: { x: 0, y: 0, width: 412, height: 130 } });
await viaDrawer('customize');
await p.waitForTimeout(800);
const frameCards = await p.evaluate(() => [...document.querySelectorAll('.frame-card, [data-frame]')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean));
console.log('frame cards:', frameCards.slice(0, 12).join(' | ').slice(0, 400));
check('the Singularity is in the picker', frameCards.some((x) => /Singularity/.test(x)));
check('the Solar Crown asks for level 200 at most', !frameCards.some((x) => /Solar Crown/.test(x) && /level (2[1-9]\d|[3-9]\d\d)/i.test(x)));

section('the daily week');
const migrated = await p.evaluate(() => JSON.parse(localStorage.getItem('wikster.profile.v1')).daily);
check('the old record was carried into the week', migrated.v === 2 && migrated.day === 2 && migrated.weeks === 5 && migrated.lastDay === Math.floor(Date.now() / 86400000) - 2, JSON.stringify(migrated));
await p.locator('#gift-btn').click(); await p.waitForTimeout(900);
check('the sheet shows seven rungs', (await p.locator('#sheet .daily-tile').count()) === 7);
check('the streak was missed, so it starts at day 1', await p.locator('#sheet .daily-tile').nth(0).evaluate((n) => n.classList.contains('is-ready')) && (await p.locator('#sheet [data-note]').isVisible()));
check('the footer speaks UTC', /UTC/.test(await p.locator('#sheet [data-reset]').textContent()) && /Week 6/.test(await p.locator('#sheet [data-week-n]').textContent()), await p.locator('#sheet .daily-foot').textContent());
check('the seventh rung is the big one', await p.locator('#sheet .daily-tile').nth(6).evaluate((n) => n.classList.contains('is-big') && n.classList.contains('is-both')));
await p.screenshot({ path: 'wc-daily.png' });
const walletBefore = await p.evaluate(() => Number(localStorage.getItem('wikster.wallet.v1')));
await p.locator('#sheet .present').click(); await p.waitForTimeout(1500);
const walletAfter = await p.evaluate(() => Number(localStorage.getItem('wikster.wallet.v1')));
const after = await p.evaluate(() => JSON.parse(localStorage.getItem('wikster.profile.v1')).daily);
check('day 1 pays its coins with loyalty', walletAfter - walletBefore === 280, `${walletBefore} -> ${walletAfter}`);
check('the record moved to day 1, claimed today (UTC)', after.day === 1 && after.lastDay === Math.floor(Date.now() / 86400000), JSON.stringify(after));
check('the sheet repainted claimed', await p.locator('#sheet .daily-tile').nth(0).evaluate((n) => n.classList.contains('is-claimed')) && await p.locator('#sheet .daily-tile').nth(1).evaluate((n) => n.classList.contains('is-next')));
check('the toast is the new card', (await p.locator('#toast .toast-mark').count()) === 1 && (await p.locator('#toast .toast-bar').count()) === 1);
await p.screenshot({ path: 'wc-daily-claimed.png' });
check('the gift dot went out', await p.locator('#gift-dot').isHidden());
await closeSheets();

section('quests, in place');
await viaDrawer('quests'); await p.waitForTimeout(900);
check('the shell has a ring and three rows', (await p.locator('#quests-body .quests-ring').count()) === 1 && (await p.locator('#quests-body .quest').count()) === 3);
check('the header speaks UTC', /UTC/.test(await p.locator('#quests-body [data-sub]').textContent()) && /UTC/.test(await p.locator('#quests-body [data-reset]').textContent()));
check('the sub line under the title is gone', await p.locator('#quests-sub').isHidden());
const gap = await p.evaluate(() => { const h = document.querySelector('#screen-quests .screen-head').getBoundingClientRect(); const s = document.querySelector('#quests-body .quests-top').getBoundingClientRect(); return s.top - h.bottom; });
check('the board sits clear of the title', gap >= 0, String(gap));
const shellBefore = await p.evaluate(() => { const s = document.querySelector('#quests-body .quests-shell'); s.dataset.probe = 'x'; return true; });
await p.locator('.nav-item[data-tab="packs"]').click(); await p.waitForTimeout(500);
await viaDrawer('quests'); await p.waitForTimeout(1200);
check('coming back does not rebuild the board', await p.evaluate(() => document.querySelector('#quests-body .quests-shell')?.dataset.probe === 'x'));
await p.screenshot({ path: 'wc-quests.png' });

section('the podium');
const meId = [...shared.profiles.values()].find((x) => x.username === 'ada_lovelace')?.id;
shared.scores = [
  { user_id: 'u1', username: 'ArbrePoilu', score: 1459 }, { user_id: 'u2', username: 'Mattpnatahlasandale', score: 80 },
  { user_id: 'u3', username: 'grace_h', score: 60 }, { user_id: 'u4', username: 'linus', score: 40 }, { user_id: meId, username: 'ada_lovelace', score: 12 }
];
await viaDrawer('leaderboard'); await p.waitForTimeout(1500);
check('three steps on the podium', (await p.locator('.lb-podium .lb-step').count()) === 3);
check('the first stands in the middle', await p.locator('.lb-podium .lb-step').nth(1).evaluate((n) => n.classList.contains('is-r1') && /ArbrePoilu/.test(n.textContent)));
check('the rest are rows from #4', (await p.locator('.leaderboard .lb-row').count()) === 2 && /#4/.test(await p.locator('.leaderboard .lb-row').first().textContent()));
check('the clock speaks UTC', /UTC/.test(await p.locator('.lb-foot').textContent()));
check('the switch has room under it', await p.evaluate(() => { const s = document.querySelector('#leaderboard-seg').getBoundingClientRect(); const b = document.querySelector('.lb-podium').getBoundingClientRect(); return b.top - s.bottom >= 8; }));
await p.screenshot({ path: 'wc-leaderboard.png' });
await p.locator('#leaderboard-seg .seg-option[data-value="weekly"]').click(); await p.waitForTimeout(1200);
check('the weekly clock names Sunday', /Sunday/.test(await p.locator('.lb-foot').textContent()));

console.log(errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors');
console.log(fails ? `${fails} CHECK(S) FAILED` : 'ALL PASS');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
