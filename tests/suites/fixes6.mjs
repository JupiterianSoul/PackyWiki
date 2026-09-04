/*
 * The fixes batch: the star's centre, the classic search field, every card
 * offered as a picture, the withdrawn subject, boosters that deal what they
 * print, Wikdle's hints and its pay, the adult-content blur, and the desktop
 * measures.
 */
import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { installSupabase, newDatabase } from '../lib/supastub.mjs';
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const browser = await chromium.launch(launchOptions());
const errs = [];
const shared = newDatabase();
const PX = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

const card = (i, over = {}) => ({
  key: `en:C${i}`, title: `Article ${i}`, rarityId: 'rare', price: 300, views: 4e5, popularity: 0.7,
  count: 1, favorite: false, packId: 'theme|animals', packName: 'Animals', lang: 'en',
  thumbnail: PX, firstPulledAt: 1, lastPulledAt: 1, description: 'A thing', extract: 'Words about it.', ...over
});
const entries = {};
for (let i = 0; i < 70; i++) entries[`en:C${i}`] = card(i);
// One card the blur setting is for, and one from the withdrawn subject.
entries['en:Nude'] = card(900, { key: 'en:Nude', title: 'Nude photography', description: 'Genre of photography', extract: 'Nude photography is a genre of erotica.' });
entries['en:Reichelt'] = card(901, { key: 'en:Reichelt', title: 'Franz Reichelt', packId: 'theme|darwin', packName: 'Darwin Awards' });

async function open({ mobile = true } = {}) {
  const ctx = await browser.newContext(mobile ? { ...devices['Pixel 7'] } : { viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  installStubs(p);
  installSupabase(p, { db: shared });
  await p.addInitScript(({ entries }) => {
    localStorage.setItem('wikster.language', 'en');
    const now = Date.now();
    localStorage.setItem('wikster.profile.v1', JSON.stringify({
      started: true, createdAt: now, playMs: 0, boostersOpened: 4, rarityCounts: {},
      progress: { level: 20, xp: 0 }, pendingLevels: [],
      daily: { v: 2, day: 1, weeks: 0, lastDay: Math.floor(now / 86400000), shownDay: Math.floor(now / 86400000) },
      timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] }
    }));
    localStorage.setItem('wikster.wallet.v1', '30000');
    localStorage.setItem('wikster.binderView.v1', 'classic');
    localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries }));
  }, { entries });
  await p.goto((process.env.BASE_URL ?? 'http://127.0.0.1:4173/'), { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2400);
  for (let i = 0; i < 6; i++) {
    if (!(await p.locator('#sheet').isVisible().catch(() => false))) break;
    if (await p.locator('#sheet-close').isVisible()) await p.locator('#sheet-close').click();
    else await p.locator('#sheet .btn-primary').click().catch(() => 0);
    await p.waitForTimeout(400);
  }
  await gate(p);
  return p;
}
/** The stubbed build opens on the gate; every screen is behind it. */
let seq = 0;
async function gate(p) {
  if (!(await p.locator('#gate-seg .seg-option[data-value="signup"]').count())) return;
  const who = `player${++seq}`;
  await p.locator('#gate-seg .seg-option[data-value="signup"]').click();
  await p.waitForTimeout(250);
  await p.locator('#gate-form input[name="email"]').fill(`${who}@example.com`);
  await p.locator('#gate-form input[name="password"]').fill('hunter2hunter2');
  await p.locator('#gate-form button[type="submit"]').click();
  await p.waitForTimeout(1100);
  if (await p.locator('#gate-form input[name="username"]').count()) {
    await p.locator('#gate-form input[name="username"]').fill(who);
    await p.locator('#gate-form button[type="submit"]').click();
    await p.waitForTimeout(1300);
  }
  await closeSheets(p);
}
const closeSheets = async (p) => {
  for (let i = 0; i < 6; i++) {
    if (!(await p.locator('#sheet').isVisible().catch(() => false))) return;
    if (await p.locator('#sheet-close').isVisible()) await p.locator('#sheet-close').click();
    else await p.locator('#sheet .btn-primary').click().catch(() => 0);
    await p.waitForTimeout(400);
  }
};
const tab = async (p, name) => { await p.locator(`.nav-item[data-tab="${name}"]`).click(); await p.waitForTimeout(800); };
const viaDrawer = async (p, link) => {
  const l = p.locator(`.drawer-link[data-link="${link}"]`).first();
  if (!(await l.isVisible().catch(() => false))) { await p.evaluate(() => document.querySelector('#menu-btn')?.click()); await p.waitForTimeout(400); }
  await l.click(); await p.waitForTimeout(900);
};

const p = await open();

/* --- the withdrawn subject --------------------------------------------------- */
section('the withdrawn subject');
check('no pack of it is left on the shelf', await p.evaluate(() =>
  !window.__wikster.THEME_PACKS.some((t) => t.id === 'darwin')));
check('its cards are gone from the collection', await p.evaluate(() =>
  !Object.keys(JSON.parse(localStorage.getItem('wikster.collection.v3')).entries).includes('en:Reichelt')));
check('and the rest of the collection is untouched', await p.evaluate(() =>
  Object.keys(JSON.parse(localStorage.getItem('wikster.collection.v3')).entries).length === 71));
check('nothing in the app says its name', await p.evaluate(() => !/darwin/i.test(document.body.innerHTML)));

/* --- the star ---------------------------------------------------------------- */
section('the favourite star');
await tab(p, 'binder');
const star = await p.evaluate(() => {
  const s = document.querySelector('#classic-view .fav-button');
  const r = s.getBoundingClientRect();
  const g = s.querySelector('svg').getBoundingClientRect();
  const disc = getComputedStyle(s, '::before');
  return {
    w: Math.round(r.width), h: Math.round(r.height),
    offY: Math.round((g.top + g.height / 2) - (r.top + r.height / 2)),
    offX: Math.round((g.left + g.width / 2) - (r.left + r.width / 2)),
    disc: parseFloat(disc.width)
  };
});
check('the glyph is centred in its button', Math.abs(star.offY) <= 1 && Math.abs(star.offX) <= 1, JSON.stringify(star));
check('the disc it sits in is still small', star.disc === 30, String(star.disc));
check('the reach around it is much wider', star.w >= 48 && star.h >= 44, `${star.w}x${star.h}`);

/* --- the classic search ------------------------------------------------------ */
section('the classic search field');
const search = await p.evaluate(() => {
  const inp = document.querySelector('#classic-search');
  const mark = document.querySelector('#classic-search-mark').getBoundingClientRect();
  const box = inp.getBoundingClientRect();
  return { textStart: box.left + parseFloat(getComputedStyle(inp).paddingLeft), markRight: mark.right };
});
check('the placeholder starts clear of the magnifier', search.textStart >= search.markRight + 6,
  `text ${Math.round(search.textStart)} vs mark ${Math.round(search.markRight)}`);
await p.locator('#classic-search').fill('Article 42');
await p.waitForTimeout(600);
check('and it still filters', (await p.locator('#classic-view .card').count()) === 1,
  String(await p.locator('#classic-view .card').count()));
await p.locator('#classic-search').fill('');
await p.waitForTimeout(600);

/* --- every card as a picture -------------------------------------------------- */
section('the picture picker');
await viaDrawer(p, 'settings');
let face = p.locator('.person-mark.row-action').first();
if (!(await face.count())) { await viaDrawer(p, 'customize'); face = p.locator('.person-mark.row-action').first(); }
if (await face.count()) {
  await face.click();
  await p.waitForTimeout(800);
  const cells = await p.locator('#sheet .avatar-cell').count();
  check('every card with a picture is offered', cells === 71, String(cells));
  await closeSheets(p);
} else {
  check('the picture row is offered', false, 'no avatar row on this build');
}

/* --- boosters deal what they print -------------------------------------------- */
section('boosters deal what they print');
const draws = await p.evaluate(async () => {
  const w = window.__wikster;
  const spec = { kind: 'theme', themeId: 'animals', rarityId: 'epic', cards: 10 };
  const out = [];
  for (let i = 0; i < 6; i++) {
    const cards = await w.draw(w.drawPack(spec));
    out.push({ n: cards.length, tiers: cards.map((c) => c.rarityId) });
  }
  return out;
});
const rank = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'exotic', 'prismatic'];
check('a tier booster always deals its tier', draws.every((d) => d.tiers.some((t) => rank.indexOf(t) >= rank.indexOf('epic'))),
  JSON.stringify(draws.map((d) => `${d.n}:${d.tiers.join(',')}`)));
const five = await p.evaluate(async () => {
  const w = window.__wikster;
  const cards = await w.draw(w.drawPack({ kind: 'theme', themeId: 'animals', rarityId: null, cards: 5 }));
  return cards.length;
});
check('a five-card booster deals five', five === 5, String(five));

/* --- Wikdle ------------------------------------------------------------------- */
section('Wikdle');
const hints = await p.evaluate(async () => {
  const mod = window.__wikster.wikdle;
  const word = 'crane';
  const out = {};
  const first = await mod.fetchHint(word, 0, { greens: [], hints: [] });
  out.first = first;
  // Wikipedia answering with a page of meanings: the hint falls back to a letter.
  const realFetch = window.fetch;
  window.fetch = async () => ({ ok: true, json: async () => ({ type: 'disambiguation', description: 'Topics referred to by the same term', extract: 'Crane may refer to:' }) });
  out.second = await mod.fetchHint(word, 1, { greens: [], hints: [first] });
  // And a real article: the hint is the meaning, with the word blanked out.
  window.fetch = async () => ({ ok: true, json: async () => ({ type: 'standard', description: 'Machine for lifting heavy loads', extract: 'A crane is a machine used to lift and move loads.' }) });
  out.meaning = await mod.fetchHint(word, 1, { greens: [], hints: [first] });
  window.fetch = realFetch;
  out.points = mod.WIKDLE_POINTS;
  out.cost = mod.HINT_COST;
  out.paid = mod.wikdlePoints({ status: 'won', rows: [1, 2, 3], hints: [{}, {}] });
  return out;
});
check('the first hint is a letter of the answer', Number.isInteger(hints.first?.at) && /letter/i.test(hints.first.text), JSON.stringify(hints.first));
check('it names the letter that is really there', 'crane'[hints.first.at].toUpperCase() === (hints.first.text.match(/is ([A-Z])/) ?? [])[1], hints.first.text);
check('a page of meanings is never handed over as a hint', Number.isInteger(hints.second?.at) && hints.second.at !== hints.first.at, JSON.stringify(hints.second));
check('a real article is', !Number.isInteger(hints.meaning?.at) && /machine/i.test(hints.meaning.text), JSON.stringify(hints.meaning));
check('and the answer is blanked out of it', !/crane/i.test(hints.meaning.text), hints.meaning.text);
check('a solve is worth several slot spins', hints.points[0] >= 1200 && hints.paid >= 600, `${hints.points[0]} / ${hints.paid}`);

/* --- the adult-content blur ---------------------------------------------------- */
section('the blur setting');
await tab(p, 'binder');
check('the card is marked', (await p.locator('#classic-view .card[data-adult]').count()) === 1);
check('and nothing is hidden until it is asked for', await p.evaluate(() => {
  const c = document.querySelector('#classic-view .card[data-adult] .card-art img');
  return getComputedStyle(c).filter === 'none';
}));
await p.evaluate(() => {
  const w = window.__wikster;
  w.state.profile.settings.blurAdult = true;
  document.documentElement.dataset.blurAdult = '1';
});
await p.waitForTimeout(400);
check('with the setting on the picture is hidden', await p.evaluate(() =>
  /blur/.test(getComputedStyle(document.querySelector('#classic-view .card[data-adult] .card-art img')).filter)));
check('and no other card is touched', await p.evaluate(() =>
  getComputedStyle(document.querySelector('#classic-view .card:not([data-adult]) .card-art img')).filter === 'none'));
await p.locator('#classic-view .card[data-adult]').first().evaluate((n) => n.click());
await p.waitForTimeout(900);
check('an open card offers to show it', (await p.locator('#sheet .adult-reveal').count()) === 1);
await p.locator('#sheet .adult-reveal').click();
await p.waitForTimeout(400);
check('and shows it', await p.evaluate(() => !document.querySelector('#sheet .giant-card').hasAttribute('data-adult')));
await closeSheets(p);

/* --- the desk ------------------------------------------------------------------ */
section('at 1440 by 900');
const d = await open({ mobile: false });
await tab(d, 'binder');
await d.locator('#binder-seg .seg-option[data-value="classic"]').click();
await d.waitForTimeout(800);
const big = await d.evaluate(() => {
  const c = document.querySelector('#classic-view .card');
  return Math.round(c.getBoundingClientRect().width);
});
check('a card in the collection is a card, not a poster', big <= 220 && big >= 120, String(big));
await d.evaluate(() => window.__wikster.levelUp(21));
await d.waitForTimeout(700);
const level = await d.evaluate(() => {
  const body = document.querySelector('#sheet-body');
  const b = body.getBoundingClientRect();
  const mid = (el) => { const r = el.getBoundingClientRect(); return Math.round((r.left + r.right) / 2 - (b.left + b.right) / 2); };
  return { jump: mid(body.querySelector('.level-jump')), reward: mid(body.querySelector('.level-reward')), btn: mid(body.querySelector('.btn-block')) };
});
check('the level-up sheet is centred on itself', Math.abs(level.jump) <= 2 && Math.abs(level.reward) <= 2 && Math.abs(level.btn) <= 2, JSON.stringify(level));
await closeSheets(d);
await tab(d, 'profile');
const measures = await d.evaluate(() => {
  const w = (sel) => Math.round(document.querySelector(sel)?.getBoundingClientRect().width ?? 0);
  return { hero: w('.hero-card'), reward: w('#next-reward .reward-card'), stats: w('.stat-grid') };
});
check('a panel keeps a readable measure', measures.hero <= 900 && measures.reward <= 440, JSON.stringify(measures));

console.log(errs.length ? `page errors: ${errs.join(' | ')}` : 'no page errors');
console.log(fails ? `${fails} CHECK(S) FAILED` : 'ALL PASS');
await browser.close();
process.exit(fails || errs.length ? 1 : 0);
