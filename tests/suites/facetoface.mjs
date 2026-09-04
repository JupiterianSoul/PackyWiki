/*
 * Face to Face: a friend's stats and two views of their cards, chat receipts
 * and header doors, the classic search, the star's reach, the giant star,
 * bundles capped at three sleeves, the real cropper, and the gold and
 * prismatic plates - against the stubbed Supabase with two players.
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
const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const card = (key, title, rarityId, price, pack, extra = {}) => ({
  key, title, rarityId, price, views: 400000, popularity: 0.7, count: 1, favorite: false,
  packId: `theme|${pack}`, packName: pack[0].toUpperCase() + pack.slice(1), lang: 'en',
  thumbnail: PX, firstPulledAt: 1, lastPulledAt: 1, description: 'A thing', extract: 'Some words about it.', ...extra
});
const MINE = {
  'en:Cat': card('en:Cat', 'Cat', 'rare', 300, 'animals'),
  'en:Dog': card('en:Dog', 'Dog', 'legendary', 1600, 'animals', { count: 2 }),
  'en:Paris': card('en:Paris', 'Paris', 'prismatic', 9000, 'geography'),
  'en:Mars': card('en:Mars', 'Mars', 'epic', 800, 'space')
};
const THEIRS = {
  'en:Ada_Lovelace': card('en:Ada_Lovelace', 'Ada Lovelace', 'epic', 900, 'history'),
  'en:Alan_Turing': card('en:Alan_Turing', 'Alan Turing', 'legendary', 1600, 'history', { count: 3 }),
  'en:Cat': card('en:Cat', 'Cat', 'rare', 300, 'animals')
};

async function newPlayer(label, { cards = {} } = {}) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label} PAGE: ${e.message}`));
  installStubs(page);
  installSupabase(page, { db: shared });
  await page.addInitScript(({ cards }) => {
    localStorage.setItem('wikster.language', 'en');
    localStorage.setItem('wikster.profile.v1', JSON.stringify({
      started: true, createdAt: Date.now(), playMs: 0, boostersOpened: 3,
      rarityCounts: {}, progress: { level: 5, xp: 0 }, pendingLevels: [],
      daily: { lastDay: Math.floor(Date.now() / 86400000), shownDay: Math.floor(Date.now() / 86400000), claimed: 1, board: 0 },
      timed: { count: 0, stamp: Date.now() }, freeTaken: { window: 0, ids: [] }
    }));
    localStorage.setItem('wikster.wallet.v1', '50000');
    localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries: cards }));
  }, { cards });
  await page.goto((process.env.BASE_URL ?? 'http://127.0.0.1:4173/'), { waitUntil: 'domcontentloaded' });
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
async function gate(page, email, username) {
  await page.locator('#gate-seg .seg-option[data-value="signup"]').click();
  await page.waitForTimeout(250);
  await page.locator('#gate-form input[name="email"]').fill(email);
  await page.locator('#gate-form input[name="password"]').fill('hunter2hunter2');
  await page.locator('#gate-form button[type="submit"]').click();
  await page.waitForTimeout(1000);
  if (await page.locator('#gate-form input[name="username"]').count()) {
    await page.locator('#gate-form input[name="username"]').fill(username);
    await page.locator('#gate-form button[type="submit"]').click();
    await page.waitForTimeout(1100);
  }
  await closeSheets(page);
}
const viaDrawer = async (page, link) => {
  await page.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
  await page.waitForTimeout(400);
  await page.locator(`.drawer-link[data-link="${link}"]`).click();
  await page.waitForTimeout(900);
};
const tab = async (page, name) => { await page.locator(`.nav-item[data-tab="${name}"]`).click(); await page.waitForTimeout(700); };

/* --- two players, friends ---------------------------------------------------- */
section('two friends');
const a = await newPlayer('A', { cards: MINE });
await gate(a, 'ada@example.com', 'ada_lovelace');
const b = await newPlayer('B', { cards: THEIRS });
await gate(b, 'grace@example.com', 'grace_h');
await b.waitForTimeout(1500);   // B's save has to land for friend_cards to find it
const idA = [...shared.profiles.values()].find((p) => p.username === 'ada_lovelace')?.id;
const idB = [...shared.profiles.values()].find((p) => p.username === 'grace_h')?.id;
check('both accounts exist', Boolean(idA && idB));
shared.friendships.push({ id: 'f1', requester: idA, addressee: idB, status: 'accepted', created_at: new Date().toISOString() });
check('B\'s save carries the cards', Boolean(shared.saves.get(idB)?.data?.data?.['wikster.collection.v3']));

/* --- a friend's profile ------------------------------------------------------ */
section('a friend\'s profile');
await viaDrawer(a, 'friends');
await a.waitForTimeout(1200);
await a.locator('#friends-list .person').first().click();
await a.waitForTimeout(1800);
check('the friend screen is up', await a.locator('#screen-friend').isVisible());
check('the stats label reads like the profile', /stat/i.test(await a.locator('#friend-stats-label').textContent()));
check('seven stat cells', (await a.locator('#friend-stats .stat-cell').count()) === 7, String(await a.locator('#friend-stats .stat-cell').count()));
check('albums are counted off their cards', /^[0-9]+$/.test((await a.locator('#friend-stats .stat-cell b').nth(5).textContent()).trim()));
check('the tier breakdown is painted', (await a.locator('#friend-rarity-bars .rarity-row').count()) === 8);
check('legendary counts their three copies', /3/.test(await a.locator('#friend-rarity-bars .rarity-row', { hasText: 'Legendary' }).locator('.rarity-count').textContent()));
check('the view switch is offered', await a.locator('#friend-seg .seg-option').count() === 2);
check('albums show first', (await a.locator('#friend-albums .album-cover, #friend-albums > *').count()) >= 1 && await a.locator('#friend-classic').isHidden());
await a.locator('#friend-seg .seg-option[data-value="classic"]').click();
await a.waitForTimeout(900);
check('classic lists every card in groups', (await a.locator('#friend-classic .classic-group').count()) === 2 && (await a.locator('#friend-classic .card').count()) === 3, `${await a.locator('#friend-classic .classic-group').count()} groups, ${await a.locator('#friend-classic .card').count()} cards: ${(await a.locator('#friend-classic .classic-group h3').allTextContents()).join('/')}`);
check('copies are counted on the card', (await a.locator('#friend-classic .copy-badge', { hasText: '3' }).count()) === 1);
check('no star on a friend\'s card', (await a.locator('#friend-classic .fav-button').count()) === 0);
await a.screenshot({ path: 'f2f-friend-classic.png', fullPage: true });
await a.locator('#friend-classic .card', { hasText: 'Ada' }).first().click({ force: true });
await a.waitForTimeout(900);
check('a friend\'s card opens big', await a.locator('#sheet .giant-card').isVisible());
check('with no star of mine on it', (await a.locator('#sheet .giant-card .fav-button').count()) === 0);
await closeSheets(a);
await a.locator('#friend-seg .seg-option[data-value="albums"]').click();
await a.waitForTimeout(600);
check('back to albums', await a.locator('#friend-albums').isVisible() && await a.locator('#friend-classic').isHidden());

/* --- chat ----------------------------------------------------------------------- */
section('chat');
await a.locator('#friend-actions .btn-primary').click();
await a.waitForTimeout(1200);
check('the chat is up', await a.locator('#screen-chat').isVisible());
check('gift and trade sit in the header', (await a.locator('#chat-tools .chat-tool').count()) === 2);
check('the header is a door', (await a.locator('#chat-who').getAttribute('aria-label') ?? '').includes('grace_h'));
await a.locator('#chat-input').fill('hello grace');
await a.waitForTimeout(200);
await a.locator('#chat-send').click();
await a.waitForTimeout(1200);
const bubble = a.locator('#chat-log .bubble.is-mine').first();
check('my bubble is up', (await bubble.count()) === 1);
check('one tick: on the server, unseen', (await bubble.locator('.bubble-ticks svg path').count()) === 1 && !(await bubble.evaluate((n) => n.classList.contains('is-read'))));
check('the last one says Sent', /sent/i.test(await a.locator('#chat-log .chat-receipt').textContent()));
await a.screenshot({ path: 'f2f-chat-sent.png' });
// B opens the conversation: that is the read.
await viaDrawer(b, 'friends');
await b.waitForTimeout(1200);
await b.locator('#friends-list .person').first().click();
await b.waitForTimeout(1200);
await b.locator('#friend-actions .btn-primary').click();
await b.waitForTimeout(1500);
check('B sees the message', /hello grace/.test(await b.locator('#chat-log').textContent()));
check('the server has it read', shared.messages.every((m) => m.read_at));
// A's poll picks the receipt up.
await a.waitForTimeout(10800);
check('two blue ticks once seen', await bubble.evaluate((n) => n.classList.contains('is-read')) && (await bubble.locator('.bubble-ticks svg path').count()) === 2);
check('and it says Seen', /seen/i.test(await a.locator('#chat-log .chat-receipt').textContent()));
await a.screenshot({ path: 'f2f-chat-seen.png' });
// The typing line exists and is hidden while nobody types.
check('the typing line waits hidden', await a.locator('#chat-typing').isHidden());
await a.locator('#chat-input').fill('typing something');
await a.waitForTimeout(300);
await a.locator('#chat-input').fill('');
// The header opens the profile.
await a.locator('#chat-who').click();
await a.waitForTimeout(900);
check('the name opens the friend\'s profile', await a.locator('#screen-friend').isVisible());
// A gift door from the chat opens the gift sheet.
await a.locator('#friend-actions .btn-primary').click();
await a.waitForTimeout(900);
await a.locator('#chat-tools .chat-tool').first().click();
await a.waitForTimeout(900);
check('the gift door opens the gift sheet', await a.locator('#sheet').isVisible() && /gift/i.test(await a.locator('#sheet-title').textContent()));
await closeSheets(a);
check('the chat room is a fixed-height column', await a.evaluate(() => {
  const s = getComputedStyle(document.querySelector('#screen-chat'));
  return s.display === 'flex' && s.flexDirection === 'column' && parseFloat(s.height) > 200;
}));

/* --- classic search and the star's reach ---------------------------------- */
section('classic search and the star');
await tab(a, 'binder');
await a.locator('#binder-seg .seg-option[data-value="classic"]').click();
await a.waitForTimeout(900);
check('the search field is in the classic tools', await a.locator('#classic-search').isVisible());
await a.locator('#classic-search').fill('cat');
await a.waitForTimeout(700);
check('search narrows to the one card', (await a.locator('#classic-view .card').count()) === 1, String(await a.locator('#classic-view .card').count()));
check('the count says one', /1/.test(await a.locator('#classic-count').textContent()));
await a.locator('#classic-search').fill('');
await a.waitForTimeout(700);
check('clearing brings every card back', (await a.locator('#classic-view .card').count()) === 4);
await tab(a, 'packs'); await tab(a, 'binder'); await a.waitForTimeout(600);
check('the field survives a tab change', await a.locator('#classic-search').isVisible());
const cat = a.locator('#classic-view .card', { hasText: 'Cat' }).first();
await cat.evaluate((n) => n.scrollIntoView({ block: 'center' }));
await a.waitForTimeout(400);
const star = cat.locator('.fav-button');
const box = await star.boundingBox();
check('the star is still drawn small', box && box.width >= 48 && (await star.evaluate((n) => getComputedStyle(n, '::before').width)) === '30px', JSON.stringify(box));
check('the star sits on the card, above the face', await star.evaluate((n) => n.parentElement.classList.contains('card')));
console.log('centre hits over a second:', JSON.stringify(await star.evaluate(async (star) => {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const r = star.getBoundingClientRect();
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    out.push(`${e?.className?.toString().slice(0, 10)}@${Math.round(r.left)},${Math.round(r.top)}`);
    await new Promise((f) => setTimeout(f, 80));
  }
  return out;
})));
// A tap six pixels left of the drawn disc: inside the star's reach, outside what is drawn.
console.log('star probe:', JSON.stringify(await star.evaluate((star) => {
  const r = star.getBoundingClientRect();
  const cs = getComputedStyle(star, '::before');
  const at = (dx, dy) => { const e = document.elementFromPoint(r.left + r.width / 2 + dx, r.top + r.height / 2 + dy); return e ? `${e.tagName}.${String(e.className).slice(0, 24)}` : 'none'; };
  return { box: [r.left, r.top, r.width, r.height].map(Math.round), before: { content: cs.content, pos: cs.position, inset: cs.inset, w: cs.width }, centre: at(0, 0), l10: at(-10, 0), l20: at(-20, 0), l24: at(-24, 0), d18: at(0, 18)};
})));
await a.mouse.click(box.x + 6, box.y + box.height / 2 - 3);
await a.waitForTimeout(600);
await a.waitForTimeout(600);
check('the near miss still favourites', await star.evaluate((n) => n.getAttribute('aria-pressed') === 'true'));
check('and does not open the card', !(await a.locator('#sheet').isVisible().catch(() => false)));
await a.waitForTimeout(2200);   // the binder repaints, and its reveal settles, after a favourite
const star2 = a.locator('#classic-view .card', { hasText: 'Cat' }).first().locator('.fav-button');
await star2.evaluate((n) => n.scrollIntoView({ block: 'center' }));
await a.waitForTimeout(400);
const box2 = await star2.boundingBox();
console.log('second tap under:', await a.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}.${String(e.className).slice(0, 30)} pressed=${e.getAttribute('aria-pressed')}` : 'none'; }, [box2.x + 6, box2.y + box2.height / 2 - 3]), JSON.stringify(box2));
await a.mouse.click(box2.x + 6, box2.y + box2.height / 2 - 3);
await a.waitForTimeout(900);
console.log('after second tap: sheet', await a.locator('#sheet').isVisible().catch(() => false), 'stars', JSON.stringify(await a.evaluate(() => [...document.querySelectorAll('#classic-view .card')].map((c) => `${c.querySelector('.card-title').textContent}:${c.querySelector('.fav-button')?.getAttribute('aria-pressed')}`))));
check('a second tap takes it back', await a.locator('#classic-view .card', { hasText: 'Cat' }).first().locator('.fav-button').evaluate((n) => n.getAttribute('aria-pressed') === 'false'));
await closeSheets(a);
// A tap in the card's body opens it, and the giant card has its own star.
await a.locator('#classic-view .card', { hasText: 'Cat' }).first().evaluate((n) => n.click());
await a.waitForTimeout(1000);
const giantStar = a.locator('#sheet .giant-card .fav-button.is-giant');
check('the big view has a star, top right', (await giantStar.count()) === 1 && await giantStar.evaluate((n) => {
  const r = n.getBoundingClientRect(); const c = n.closest('.giant-card').getBoundingClientRect();
  return r.right > c.right - 80 && r.top < c.top + 80 && r.width >= 40;
}));
await giantStar.click();
await a.waitForTimeout(500);
check('it favourites', await giantStar.evaluate((n) => n.classList.contains('is-on')));
await a.screenshot({ path: 'f2f-giant.png' });
await closeSheets(a);
check('the binder star agrees', await a.locator('#classic-view .card', { hasText: 'Cat' }).first().locator('.fav-button').evaluate((n) => n.classList.contains('is-on')));

/* --- the plates ------------------------------------------------------------------ */
section('gold and prism');
const dog = a.locator('#classic-view .card[data-rarity="legendary"]').first();
check('legendary plate is opaque gold', await dog.evaluate((n) => {
  const bg = getComputedStyle(n.querySelector('.card-front')).backgroundImage;
  return /185, 132, 22/.test(bg) && !/color-mix|rgba\(0, 0, 0, 0\)/.test(bg);
}));
check('legendary type is stamped dark', await dog.evaluate((n) => getComputedStyle(n.querySelector('.card-front')).color === 'rgb(43, 29, 5)'));
const paris = a.locator('#classic-view .card[data-rarity="prismatic"]').first();
check('prismatic front is the charcoal foil', await paris.evaluate((n) => /28, 28, 38/.test(getComputedStyle(n.querySelector('.card-front')).backgroundImage)));
check('the ribbon is a drawn curve', await paris.evaluate((n) => /svg\+xml/.test(getComputedStyle(n.querySelector('.fx-b'), '::before').backgroundImage)));
check('the bezel is the thin-film ring', await paris.evaluate((n) => /0, 224, 192/.test(getComputedStyle(n.querySelector('.fx-ring'), '::before').backgroundImage)));
check('the badge is glass with a spectrum rim', await paris.evaluate((n) => /conic-gradient/.test(getComputedStyle(n.querySelector('.rarity-badge')).backgroundImage) && getComputedStyle(n.querySelector('.rarity-badge')).color === 'rgb(255, 255, 255)'));
await a.waitForTimeout(600);
await dog.evaluate((n) => n.click()); await a.waitForTimeout(1200);
check('the legendary opens big', await a.locator('#sheet .giant-card').isVisible());
await a.locator('#sheet .giant-card').screenshot({ path: 'f2f-legendary.png' }).catch(() => 0);
await closeSheets(a); await a.waitForTimeout(600);
await a.locator('#classic-view .card[data-rarity="prismatic"]').first().evaluate((n) => n.click()); await a.waitForTimeout(1200);
check('the prismatic opens big', await a.locator('#sheet .giant-card').isVisible());
await a.locator('#sheet .giant-card').screenshot({ path: 'f2f-prismatic.png' }).catch(() => 0);
await closeSheets(a); await a.waitForTimeout(600);

/* --- bundles ------------------------------------------------------------------------ */
section('bundles');
await tab(a, 'shop');
await a.waitForTimeout(1200);
const bundles = await a.locator('.shop-tile.is-bundle').count();
check('there are bundles', bundles >= 1, String(bundles));
check('never more than three sleeves', await a.evaluate(() =>
  [...document.querySelectorAll('.shop-tile.is-bundle')].every((t) => t.querySelectorAll('.shop-tile-stack-item').length <= 3)));
check('a bundle beyond three carries a count', await a.evaluate(() =>
  [...document.querySelectorAll('.shop-tile.is-bundle')].every((t) => {
    const listed = [...t.querySelectorAll('.shop-bundle-list li b')].reduce((n, b) => n + (Number((b.textContent.match(/^(\d+)×/) ?? [])[1]) || 1), 0);
    const shown = t.querySelectorAll('.shop-tile-stack-item').length;
    const more = t.querySelector('.shop-tile-stack-more');
    return listed <= 3 ? !more : (more && more.textContent === `+${listed - 3}`);
  })));
check('sleeves stay inside the tile', await a.evaluate(() =>
  [...document.querySelectorAll('.shop-tile.is-bundle .shop-tile-stack')].every((s) => {
    const r = s.getBoundingClientRect();
    return [...s.querySelectorAll('.booster')].every((b) => { const q = b.getBoundingClientRect(); return q.left >= r.left - 1 && q.right <= r.right + 1; });
  })));
await a.locator('.shop-tile.is-bundle').first().screenshot({ path: 'f2f-bundle.png' });
console.log('bundle geometry:', JSON.stringify(await a.evaluate(() => [...document.querySelectorAll('.shop-tile.is-bundle')].map((t) => { const s = t.querySelector('.shop-tile-stack').getBoundingClientRect(); return { stack: [Math.round(s.width), Math.round(s.height)], boosters: [...t.querySelectorAll('.booster')].map((b) => { const q = b.getBoundingClientRect(); return [Math.round(q.left - s.left), Math.round(q.right - s.left), Math.round(q.width), Math.round(q.height)]; }) }; }))));

/* --- the cropper --------------------------------------------------------------------- */
section('the cropper');
await viaDrawer(a, 'customize');
await a.waitForTimeout(800);
let face = a.locator('.person-mark.row-action').first();
if (!(await face.count())) { await viaDrawer(a, 'settings'); await a.waitForTimeout(800); face = a.locator('.person-mark.row-action').first(); }
check('the picture row is offered', (await face.count()) === 1);
await face.click();
await a.waitForTimeout(800);
await a.locator('#sheet .avatar-cell').first().click();
await a.waitForTimeout(800);
const stage = a.locator('#sheet .crop-stage');
check('the crop stage is up with a fixed circle', await stage.isVisible() && await a.locator('#sheet .crop-circle').evaluate((n) => {
  const r = n.getBoundingClientRect(); const s = n.parentElement.getBoundingClientRect();
  return Math.abs((r.left + r.width / 2) - (s.left + s.width / 2)) < 2 && Math.abs(r.width - s.width * 0.72) < 3;
}));
const before = await a.locator('#sheet .crop-img').evaluate((n) => n.style.transform);
const sb = await stage.boundingBox();
await a.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
await a.mouse.down();
await a.mouse.move(sb.x + sb.width / 2 - 30, sb.y + sb.height / 2 - 10, { steps: 6 });
await a.mouse.up();
await a.waitForTimeout(300);
const after = await a.locator('#sheet .crop-img').evaluate((n) => n.style.transform);
check('dragging moves the picture', before !== after, `${before} -> ${after}`);
const z0 = await a.locator('#sheet [data-zoom]').inputValue();
await a.locator('#sheet [data-zoom]').evaluate((n) => { n.value = '200'; n.dispatchEvent(new Event('input', { bubbles: true })); });
await a.waitForTimeout(300);
const w0 = parseFloat(await a.locator('#sheet .crop-img').evaluate((n) => n.style.width));
check('the slider zooms the picture', w0 > sb.width * 0.72 * 1.5, `${z0} -> width ${w0}`);
check('the preview shows the crop', await a.locator('#sheet .crop-preview').evaluate((n) => /%/.test(n.style.backgroundSize) && n.style.backgroundSize !== 'cover'));
await a.screenshot({ path: 'f2f-crop.png' });
await a.locator('#sheet [data-save]').click();
await a.waitForTimeout(1200);
const saved = shared.profiles.get(idA)?.avatar;
check('the crop is saved with zoom and shape', saved && saved.z > 0 && saved.r > 0 && Math.abs(saved.z - 0.5) < 0.02, JSON.stringify(saved));
check('the mark wears the crop, not a cover', await a.evaluate(() => {
  const m = document.querySelector('.person-mark.has-avatar');
  return m && /%/.test(m.style.backgroundSize) && m.style.backgroundSize !== 'cover';
}));

console.log(errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors');
console.log(fails ? `${fails} CHECK(S) FAILED` : 'ALL PASS');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
