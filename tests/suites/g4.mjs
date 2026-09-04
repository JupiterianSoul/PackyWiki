/*
 * The card index, wishlists everywhere, the glossary, and the new bells -
 * against the stubbed Supabase, with two players and a pre-seeded codex.
 */
import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { installSupabase, newDatabase } from '../lib/supastub.mjs';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n— ${s} ${'—'.repeat(Math.max(0, 52 - s.length))}`);
const browser = await chromium.launch(launchOptions());
const shared = newDatabase();
const errors = [];

const CODEX = [
  { key: 'en:Ada_Lovelace', title: 'Ada Lovelace', rarity: 'epic', price: 900, views: 250000, thumbnail: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', lang: 'en' },
  { key: 'en:Alan_Turing', title: 'Alan Turing', rarity: 'legendary', price: 1600, views: 900000, thumbnail: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', lang: 'en' },
  { key: 'en:Cat', title: 'Cat', rarity: 'rare', price: 300, views: 400000, thumbnail: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', lang: 'en' },
  { key: 'en:Dog', title: 'Dog', rarity: 'rare', price: 280, views: 380000, thumbnail: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', lang: 'en' },
  { key: 'en:Paris', title: 'Paris', rarity: 'mythic', price: 3200, views: 1500000, thumbnail: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', lang: 'en' }
];
for (const row of CODEX) shared.codex.set(row.key, { ...row, found_at: new Date().toISOString(), found_by: null });

const OWNED = {
  'en:Cat': { key: 'en:Cat', title: 'Cat', rarityId: 'rare', price: 300, views: 400000, popularity: 0.7,
    count: 1, favorite: false, packId: 'theme:animals', packName: 'Animals', lang: 'en',
    thumbnail: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', firstPulledAt: 1, lastPulledAt: 1 }
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
      started: true, createdAt: Date.now(), playMs: 0, boostersOpened: 1,
      rarityCounts: {}, progress: { level: 5, xp: 0 }, pendingLevels: [],
      daily: { lastDay: Math.floor(Date.now() / 86400000), shownDay: Math.floor(Date.now() / 86400000), claimed: 1, board: 0 },
      timed: { count: 0, stamp: Date.now() }, freeTaken: { window: 0, ids: [] }
    }));
    localStorage.setItem('wikster.wallet.v1', '5000');
    localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries: cards }));
  }, { cards });
  await page.goto((process.env.BASE_URL ?? 'http://127.0.0.1:4173/'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  for (let i = 0; i < 6; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    if (await page.locator('#sheet-close').isVisible()) await page.locator('#sheet-close').click();
    else await page.locator('#sheet .btn-primary').click().catch(() => 0);
    await page.waitForTimeout(400);
  }
  return page;
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
  for (let i = 0; i < 6; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    if (await page.locator('#sheet-close').isVisible()) await page.locator('#sheet-close').click();
    else await page.locator('#sheet .btn-primary').click().catch(() => 0);
    await page.waitForTimeout(400);
  }
}

const viaDrawer = async (page, link) => {
  await page.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
  await page.waitForTimeout(400);
  await page.locator(`.drawer-link[data-link="${link}"]`).click();
  await page.waitForTimeout(900);
};

/* --- the index -------------------------------------------------------------- */
section('the card index');
const a = await newPlayer('A', { cards: OWNED });
await gate(a, 'ada@example.com', 'ada_lovelace');
await viaDrawer(a, 'cardindex');
check('the index lists every discovery', (await a.locator('#index-list .card').count()) === 5);
check('the header counts five discovered', /5/.test(await a.locator('#index-counts').textContent()));
check('the card I own wears the tag', (await a.locator('#index-list .owned-tag').count()) === 1);
check('every card offers the bookmark', (await a.locator('#index-list .wish-button').count()) === 5);
check('tiles fit their columns', await a.evaluate(() => {
  const list = document.querySelector('#index-list');
  const cards = [...list.querySelectorAll('.card')];
  const col = list.getBoundingClientRect().width / 2;
  return cards.length > 0 && cards.every((c) => c.getBoundingClientRect().width <= col);
}));

await a.locator('#index-search').fill('ada');
await a.waitForTimeout(700);
check('search narrows to the name', (await a.locator('#index-list .card').count()) === 1);
await a.locator('#index-search').fill('');
await a.waitForTimeout(700);
await a.locator('#index-rarities .chip', { hasText: 'Rare' }).first().click();
await a.waitForTimeout(700);
check('a tier chip narrows to the tier', (await a.locator('#index-list .card').count()) === 2);
await a.locator('#index-rarities .chip', { hasText: 'All' }).click();
await a.waitForTimeout(700);

/* --- wishing ---------------------------------------------------------------- */
section('wishing');
const adaTile = a.locator('#index-list .card', { hasText: 'Ada Lovelace' });
await adaTile.evaluate((n) => n.scrollIntoView({ block: 'center' }));
await a.waitForTimeout(400);
await adaTile.locator('.wish-button').click({ force: true });
await a.waitForTimeout(600);
check('the bookmark takes', await adaTile.locator('.wish-button').evaluate((n) => n.classList.contains('is-on')));
check('and reaches the server', shared.wishlists.some((w) => w.key === 'en:Ada_Lovelace'));
await a.locator('#index-rarities .chip', { hasText: /wishlist/i }).click();
await a.waitForTimeout(800);
check('the wishlist view holds the one wish', (await a.locator('#index-list .card').count()) === 1);
check('and knows I do not own it', (await a.locator('#index-list .owned-tag').count()) === 0);
await a.screenshot({ path: 'g4-wishlist.png' });

/* --- the glossary ----------------------------------------------------------- */
section('the glossary');
await viaDrawer(a, 'glossary');
const glossaryRows = await a.locator('.glossary-row').count();
check('the glossary shelves every category', glossaryRows === 26, String(glossaryRows));
check('and none of them is a button', (await a.locator('.glossary-row button').count()) === 0);
await a.screenshot({ path: 'g4-glossary.png' });

/* --- a friend's wishlist ----------------------------------------------------- */
section('a friend and their wishes');
const b = await newPlayer('B');
await gate(b, 'grace@example.com', 'grace_h');
const idA = [...shared.profiles.values()].find((p) => p.username === 'ada_lovelace').id;
const idB = [...shared.profiles.values()].find((p) => p.username === 'grace_h').id;
shared.friendships.push({ id: 'f1', requester: idA, addressee: idB, status: 'accepted', created_at: new Date().toISOString() });

await viaDrawer(b, 'friends');
await b.waitForTimeout(1200);
await b.locator('#friends-list .person').click();
await b.waitForTimeout(1200);
check('the friend screen offers a wishlist door', (await b.locator('#friend-actions .btn', { hasText: /wishlist/i }).count()) === 1);
await b.locator('#friend-actions .btn', { hasText: /wishlist/i }).click();
await b.waitForTimeout(1200);
check('it lists what the friend wishes', /ada lovelace/i.test(await b.locator('#sheet-body').textContent()));
await b.screenshot({ path: 'g4-friend-wishlist.png' });
await b.locator('#sheet-close').click();
await b.waitForTimeout(400);

/* --- a wished card at auction rings the bell -------------------------------- */
section('the wish bell');
// B lists Ada Lovelace; A browses the floor and the bell rings.
shared.auctions.push({
  id: '00000000-0000-4000-8000-00000000a001', seller: idB, seller_name: 'grace_h',
  card: { key: 'en:Ada_Lovelace', title: 'Ada Lovelace', rarityId: 'epic', price: 900,
    thumbnail: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' },
  start_price: 500, current_bid: null, bidder: null, bidder_name: null, bid_count: 0,
  ends_at: new Date(Date.now() + 600000).toISOString(), status: 'open', created_at: new Date().toISOString()
});
await viaDrawer(a, 'market');
await a.waitForTimeout(1500);
check('the note lands in the feed', await a.evaluate(() =>
  (JSON.parse(localStorage.getItem('wikster.profile.v1')).notifFeed ?? [])
    .some((n) => /wished card|ada lovelace/i.test(n.title))));
check('the auction tile knows I do not own it', (await a.locator('.auction-tile .owned-tag').count()) === 0);
check('and still offers the bookmark', (await a.locator('.auction-tile .wish-button').count()) >= 1, `tiles ${await a.locator('.auction-tile').count()} bookmarks ${await a.locator('.auction-tile .wish-button').count()} in-card ${await a.locator('.auction-tile .card > .wish-button').count()} status [${await a.locator('#market-status').textContent()}] class [${await a.locator('#market-status').getAttribute('class')}] list [${(await a.locator('#market-list').innerHTML()).slice(0, 200)}]`);

/* --- notifications in the drawer --------------------------------------------- */
await a.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
await a.waitForTimeout(400);
check('the drawer carries a notifications door', (await a.locator('.drawer-link[data-link="bell"]').count()) === 1);
await a.locator('.drawer-link[data-link="bell"]').click();
await a.waitForTimeout(700);
check('and it opens the bell sheet', /wished card|auction/i.test(await a.locator('#sheet-body').textContent()));
await a.screenshot({ path: 'g4-bell.png' });

console.log(errors.length ? `\nERRORS:\n${errors.join('\n')}` : '\nno page errors');
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
