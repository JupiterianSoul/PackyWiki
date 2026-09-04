/* H3LLF1R3: the code, the theme, the burning badge and frame, the sixteen cards and the drawn Matrix face; the album immune to filters. */
import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
let fails = 0; const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const b = await chromium.launch(launchOptions());
const p = await (await b.newContext({ serviceWorkers: 'block', ...devices['Pixel 7'] })).newPage(); installStubs(p);
p.setDefaultTimeout(9000); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.addInitScript(() => {
  if (window.name === 'seeded') return; window.name = 'seeded';
  localStorage.setItem('wikster.language', 'en');
  const now = Date.now();
  localStorage.setItem('wikster.profile.v1', JSON.stringify({ started: true, createdAt: now, playMs: 0, boostersOpened: 5, rarityCounts: {}, progress: { level: 5, xp: 0 }, pendingLevels: [], daily: { lastDay: Math.floor(now/86400000), shownDay: Math.floor(now/86400000), claimed: 1, board: 0 }, timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] } }));
  localStorage.setItem('wikster.wallet.v1', '5000');
});
await p.goto((process.env.BASE_URL ?? 'http://127.0.0.1:4173/'), { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2400);
const closeSheets = async () => { for (let i = 0; i < 8; i++) { if (!(await p.locator('#sheet').isVisible().catch(() => false))) return; if (await p.locator('#sheet-close').isVisible()) await p.locator('#sheet-close').click(); else await p.locator('#sheet .btn-primary').click().catch(() => 0); await p.waitForTimeout(380); } };
await closeSheets();
const drawer = async (link) => { for (let i = 0; i < 5; i++) { if (await p.locator('#drawer.is-open').count()) break; await p.evaluate(() => document.querySelector('#menu-btn')?.click()); await p.waitForTimeout(420); } await p.locator(`.drawer-link[data-link="${link}"]`).click(); await p.waitForTimeout(900); };

// A frame at level 5, before anything else: the equipped style is visible from level 1.
check('the level frame is painted at level 5', (await p.locator('#level-badge .frame-overlay svg').count()) === 1);

await drawer('settings');
await p.locator('#redeem-list [data-code]').scrollIntoViewIfNeeded();
await p.locator('#redeem-list [data-code]').fill('H3LLF1R3');
await p.locator('#redeem-list button[type="submit"]').click();
await p.waitForTimeout(1600);
check('the reveal opens', await p.locator('.reveal').isVisible().catch(() => false));
await closeSheets();
const st = await p.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  badges: window.__wikster.store.loadBadgeLoadout(),
  packs: Object.values(window.__wikster.store.loadInventory()).map((s) => s.spec)
}));
check('the Hellfire theme goes on', st.theme === 'hellfire', st.theme);
check('the badge is worn', (st.badges ?? []).includes('special-hellfire'), JSON.stringify(st.badges));
check('the Hellfire frame goes on and burns in the app bar', (await p.evaluate(() => localStorage.getItem('wikster.frameStyle.v1'))) === 'hellfire' && (await p.locator('#level-badge .frame-overlay .hell-flame').count()) > 10, String(await p.locator('#level-badge .frame-overlay .hell-flame').count()));
const spec = st.packs.find((s) => s?.codeId === 'hellfire');
check('the booster is on the shelf with sixteen cards', spec?.cards === 16, JSON.stringify(spec));
check('the drawer mark and the emblem exist', (await p.evaluate(() => Boolean(document.querySelector('#drawer-mark svg')))));

// Open it.
await p.locator('.nav-item[data-tab="packs"]').click(); await p.waitForTimeout(800);
await p.locator('.seg-option').filter({ hasText: /Custom/ }).first().click().catch(() => 0);
await p.waitForTimeout(900);
const tile = p.locator('.booster[data-spec^="code|hellfire"]').first();
check('the booster tile shows on the custom shelf', (await tile.count()) === 1);
await tile.click(); await p.waitForTimeout(900);
const openBtn = p.locator('#sheet button, .sheet button').filter({ hasText: /^Open/ }).first();
if (await openBtn.isVisible().catch(() => false)) { await p.waitForFunction((sel) => { const x = [...document.querySelectorAll(sel)].find((y) => /^Open/.test(y.textContent.trim())); return x && !x.disabled; }, '#sheet button, .sheet button', { timeout: 45000 }).catch(() => 0); await openBtn.click({ timeout: 45000 }); await p.waitForTimeout(1200); }
console.log('after tile: open screen', await p.locator('#screen-open').isVisible().catch(() => false), 'packs-open', await p.locator('#packs-open').isVisible().catch(() => false), 'sheet', await p.locator('#sheet').isVisible().catch(() => false));
if (await p.locator('#packs-open').isVisible().catch(() => false)) { await p.locator('#packs-open').click(); await p.waitForTimeout(900); }
const zone = await p.locator('.rip-zone').boundingBox();
check('the rip zone is up', Boolean(zone));
if (zone) {
  const y = zone.y + zone.height / 2;
  await p.locator('.rip-zone').dispatchEvent('pointerdown', { pointerId: 1, clientX: zone.x + 20, clientY: y, isPrimary: true, pointerType: 'touch', bubbles: true });
  for (let dx = 30; dx <= 240; dx += 26) await p.evaluate(({ x, yy }) => window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: x, clientY: yy, isPrimary: true, pointerType: 'touch', bubbles: true })), { x: zone.x + 20 + dx, yy: y });
  await p.evaluate(({ x, yy }) => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: x, clientY: yy, isPrimary: true, pointerType: 'touch', bubbles: true })), { x: zone.x + 260, yy: y });
  await p.waitForFunction(() => document.querySelector('#screen-open').classList.contains('phase-reveal'), null, { timeout: 40000 }).catch(() => 0);
  await p.waitForTimeout(1500);
}
const cards = await p.evaluate(() => [...document.querySelectorAll('#screen-open .card, #screen-open [data-special]')].map((c) => ({ special: c.dataset.special, title: c.querySelector('.card-title')?.textContent?.trim(), art: c.querySelector('.card-art img')?.getAttribute('src')?.slice(0, 22) })).filter((c) => c.title));
console.log('cards revealed:', cards.length, cards.map((c) => c.title).join(' | '));
check('sixteen cards come out', cards.length === 16, String(cards.length));
check('every card wears the hellfire treatment but the last, which is the Creator', cards.slice(0, 15).every((c) => c.special === 'hellfire') && cards[15]?.special === 'creator', JSON.stringify(cards.map((c) => c.special)));
const names = cards.map((c) => c.title);
check('the five members are five different cards', ['Will Ramos', 'Adam De Micco', 'Andrew O’Connor', 'Austin Archey', 'Michael Yager'].every((n) => names.includes(n)), names.join(', '));
const matrix = cards.find((c) => c.title === 'Matrix');
check('the Matrix card is drawn, not fetched', matrix && matrix.art?.startsWith('data:image/png'), JSON.stringify(matrix));
// In the collection: seventeen entries under the code, distinct keys.
const owned = await p.evaluate(() => Object.entries(window.__wikster.store.loadCollection().entries).filter(([, e]) => e.special === 'hellfire').map(([k, e]) => ({ k, t: e.title })));
check('sixteen distinct entries land in the collection', owned.length === 16, String(owned.length) + ' ' + owned.map((o) => o.t).join(','));
check('member keys carry their slot', owned.filter((o) => /#(demicco|oconnor|archey|yager)$/.test(o.k)).length === 4, owned.map((o) => o.k).filter((k) => k.includes('#')).join(','));
// The album shows every card even under a binder filter that would hide them.
await p.evaluate(() => document.querySelector('#open-back')?.click()); await p.waitForTimeout(900);
if (await p.locator('#screen-open.is-active').count()) { await p.evaluate(() => document.querySelector('#open-done')?.click()); await p.waitForTimeout(900); }
await p.evaluate(() => { window.__wikster.state.filters.band = 'famous'; window.__wikster.state.filters.search = 'zzz'; });
await p.locator('.nav-item[data-tab="binder"]').click(); await p.waitForTimeout(900);
await p.locator('.album-cover').filter({ hasText: /Creator/ }).first().click(); await p.waitForTimeout(1200);
const shown = await p.evaluate(() => [...document.querySelectorAll('#page-slots .card')].map((n) => n.querySelector('.card-title')?.textContent));
check('the album shows its first page whatever the filters', shown.length === 4 && shown[0] === 'Lorna Shore', JSON.stringify(shown));
check('four pages, the Creator last', (await p.locator('.album-dot').count()) === 4);
// The badge burns on the profile.
await p.locator('.nav-item[data-tab="profile"]').click(); await p.waitForTimeout(900);
check('the badge on the profile carries a live flame', (await p.locator('#screen-profile .badge-live-fire .badge-flame').count()) === 3, String(await p.locator('#screen-profile .badge-live-fire .badge-flame').count()));
check('the Hellfire frame rings the profile too', (await p.locator('#profile-ring .frame-overlay .hell-flame').count()) > 10);
console.log(errs.length ? `page errors: ${errs.join(' | ')}` : 'no page errors'); console.log(fails ? `${fails} FAILURES` : 'ALL PASS'); await b.close();
