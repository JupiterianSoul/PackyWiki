/* The arcade, signed out on the offline build: the hub, a whole Wikdle, the quests board, and the stages the casino and the board show without an account. */
import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { loadWords, wordForDay, utcDay } from '/home/user/PackyWiki/src/wikdle.js';
await loadWords();
let fails = 0; const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const b = await chromium.launch(launchOptions());
const p = await (await b.newContext({ ...devices['Pixel 7'] })).newPage(); installStubs(p);
p.setDefaultTimeout(8000); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errs.push('CONSOLE ' + m.text()); });
await p.addInitScript(() => {
  if (window.name === 'seeded') return; window.name = 'seeded';
  localStorage.setItem('wikster.language', 'en');
  const now = Date.now();
  localStorage.setItem('wikster.profile.v1', JSON.stringify({ started: true, createdAt: now, playMs: 0, boostersOpened: 5, rarityCounts: {}, progress: { level: 9, xp: 0 }, pendingLevels: [], daily: { lastDay: Math.floor(now/86400000), shownDay: Math.floor(now/86400000), claimed: 1, board: 0 }, timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] }, codesRedeemed: {} }));
  localStorage.setItem('wikster.wallet.v1', '500');
});
await p.goto((process.env.BASE_URL ?? 'http://127.0.0.1:4173/'), { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2200);
for (let i = 0; i < 8; i++) { if (!(await p.locator('#sheet').isVisible().catch(() => false))) break; if (await p.locator('#sheet-close').isVisible()) await p.locator('#sheet-close').click(); else await p.locator('#sheet .btn-primary').click().catch(() => 0); await p.waitForTimeout(350); }
const go = async (link) => { for (let i = 0; i < 5; i++) { if (await p.locator('#drawer.is-open').count()) break; await p.evaluate(() => document.querySelector('.appbar .icon-btn')?.click()); await p.waitForTimeout(400); } await p.locator(`.drawer-link[data-link="${link}"]`).click(); await p.waitForTimeout(700); };
const wallet = () => p.evaluate(() => Number(JSON.parse(localStorage.getItem('wikster.wallet.v1'))));
const text = (sel) => p.locator(sel).first().textContent().then((s) => (s ?? '').trim()).catch(() => '');

/* --- the drawer and the hub ------------------------------------------------ */
await p.evaluate(() => document.querySelector('.appbar .icon-btn')?.click()); await p.waitForTimeout(400);
for (const link of ['games', 'quests', 'leaderboard']) check(`drawer has the ${link} tab`, (await p.locator(`.drawer-link[data-link="${link}"]`).count()) === 1);
await go('games');
check('the hub shows two games', (await p.locator('#screen-games .game-tile').count()) === 2, String(await p.locator('#screen-games .game-tile').count()));
check('the hub says the house needs an account when there is none', /account/i.test(await text('#screen-games .game-closed')), await text('#screen-games .game-closed'));

/* --- Wikdle -------------------------------------------------------------------- */
await p.locator('#screen-games .game-tile').nth(0).click(); await p.waitForTimeout(700);
check('Wikdle opens on a six by five grid', (await p.locator('#screen-wikdle .wikdle-cell').count()) === 30, String(await p.locator('#screen-wikdle .wikdle-cell').count()));
check('a keyboard of 28 keys', (await p.locator('#screen-wikdle .wikdle-key').count()) === 28, String(await p.locator('#screen-wikdle .wikdle-key').count()));
const key = async (k) => { await p.locator(`#screen-wikdle .wikdle-key[data-key="${k}"]`).dispatchEvent('pointerdown'); await p.waitForTimeout(30); };
const typeWord = async (w) => { for (const ch of w) await key(ch); };
// Too short.
await typeWord('abc'); await key('enter'); await p.waitForTimeout(200);
check('three letters is refused as too short', /five|short/i.test(await text('#screen-wikdle .wikdle-status')), await text('#screen-wikdle .wikdle-status'));
check('nothing was spent on it', (await p.locator('#screen-wikdle .wikdle-cell.is-hit, #screen-wikdle .wikdle-cell.is-near, #screen-wikdle .wikdle-cell.is-miss').count()) === 0);
await key('back'); await key('back'); await key('back');
// Not a word.
await typeWord('zzzzq'); await key('enter'); await p.waitForTimeout(200);
check('a non-word is refused', /not|word/i.test(await text('#screen-wikdle .wikdle-status')), await text('#screen-wikdle .wikdle-status'));
for (let i = 0; i < 5; i++) await key('back');
// A real wrong guess costs a row and marks the letters.
await typeWord('crane'); await key('enter'); await p.waitForTimeout(900);
const marked = await p.locator('#screen-wikdle [data-row="0"] .wikdle-cell.is-hit, #screen-wikdle [data-row="0"] .wikdle-cell.is-near, #screen-wikdle [data-row="0"] .wikdle-cell.is-miss').count();
const answer = wordForDay(utcDay());
const alreadyWon = answer === 'crane';
check('a real word scores the whole row', marked === 5, String(marked));
check('a hint is offered after a guess', (await p.locator('#screen-wikdle .wikdle-hint-btn').count()) === 1);
await p.locator('#screen-wikdle .wikdle-hint-btn').click(); await p.waitForTimeout(900);
check('the hint says something true and never the answer', (await p.locator('#screen-wikdle .wikdle-hint').count()) === 1 && !(await text('#screen-wikdle .wikdle-hint')).toLowerCase().includes(answer), await text('#screen-wikdle .wikdle-hint'));
if (!alreadyWon) {
  check('the keyboard remembers the marks', (await p.locator('#screen-wikdle .wikdle-key.is-hit, #screen-wikdle .wikdle-key.is-near, #screen-wikdle .wikdle-key.is-miss').count()) > 0);
  const before = await wallet();
  await typeWord(answer); await key('enter'); await p.waitForTimeout(1400);
  check('the day\'s word wins the board', (await p.locator('#screen-wikdle [data-row="1"] .wikdle-cell.is-hit').count()) === 5, String(await p.locator('#screen-wikdle [data-row="1"] .wikdle-cell.is-hit').count()));
  check('the done panel comes up', await p.locator('#screen-wikdle .wikdle-done').isVisible());
  // 1,150 for a solve in two, less 120 for the hint, paid at nine tenths.
  check('a solve in two with a hint pays like a day\'s puzzle', (await wallet()) === before + 927, `${before} -> ${await wallet()}`);
check('the breakdown shows the hint', /120/.test(await text('#screen-wikdle .wikdle-breakdown')), await text('#screen-wikdle .wikdle-breakdown'));
check('a link to the article', (await p.locator('#screen-wikdle .wikdle-read').getAttribute('href') ?? '').includes(encodeURIComponent(answer)));
  check('the panel names the answer', (await text('#screen-wikdle .wikdle-answer')).toUpperCase().includes(answer.toUpperCase()), await text('#screen-wikdle .wikdle-answer'));
  check('the keys are locked after the win', await p.locator('#screen-wikdle .wikdle-key[data-key="a"]').isDisabled());
  check('the stats count one played', (await text('#screen-wikdle .wikdle-stat b')) === '1', await text('#screen-wikdle .wikdle-stat b'));
  check('a countdown to the next word', /\d/.test(await text('#screen-wikdle [data-next]')), await text('#screen-wikdle [data-next]'));
  // The day is locked: back and in again, and after a relaunch.
  await p.locator('#wikdle-back').click(); await p.waitForTimeout(500);
  await p.locator('#screen-games .game-tile').nth(0).click(); await p.waitForTimeout(600);
  check('the finished board is still finished', await p.locator('#screen-wikdle .wikdle-done').isVisible());
  const paidOnce = await wallet();
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2200);
  await go('games'); await p.locator('#screen-games .game-tile').nth(0).click(); await p.waitForTimeout(600);
  check('and after a relaunch, with nothing paid twice', (await p.locator('#screen-wikdle .wikdle-done').isVisible()) && (await wallet()) === paidOnce, `${paidOnce} -> ${await wallet()}`);
} else {
  console.log('SKIP  the day\'s word is crane itself; the win path was exercised by the first guess');
}

/* --- the casino, signed out -------------------------------------------------- */
await p.locator('#wikdle-back').click(); await p.waitForTimeout(500);
await p.locator('#screen-games .game-tile').nth(1).click(); await p.waitForTimeout(600);
check('the slot machine asks for an account', (await p.locator('#screen-slots .game-stage').count()) === 1 && /sign in/i.test(await text('#screen-slots .game-stage')), await text('#screen-slots .game-stage'));
check('no lever without the house', (await p.locator('#screen-slots .slots-lever').count()) === 0);
await p.locator('#slots-back').click(); await p.waitForTimeout(500);
check('back lands on the hub', await p.locator('#screen-games').isVisible());

/* --- quests ---------------------------------------------------------------------- */
await go('quests');
check('three quests dealt for the day', (await p.locator('#screen-quests .quest').count()) === 3, String(await p.locator('#screen-quests .quest').count()));
check('each shows a tier and a reward', (await p.locator('#screen-quests .quest-tier').count()) === 3 && (await p.locator('#screen-quests .quest-reward').count()) === 3);
check('a countdown to the reset', /\d/.test(await text('#screen-quests .quests-reset')), await text('#screen-quests .quests-reset'));
const board = await p.evaluate(() => JSON.parse(localStorage.getItem('wikster.quests.v1')));
const doneRows = board.quests.filter((q) => q.progress >= q.target).length;
check('exactly the finished quests offer a claim', (await p.locator('#screen-quests .quest .btn-primary').count()) === doneRows, `${doneRows} done`);
check('the board is kept on the device for today', board && board.day === new Date().toISOString().slice(0, 10) && board.userKey === 'local' && board.quests.length === 3, JSON.stringify(board)?.slice(0, 120));
// A Wikdle solve is reported to the quests: a wikdle or points quest, if dealt, moved.
const wikdleRow = board.quests.find((q) => /wikdle|points/.test(q.id));
if (wikdleRow && !alreadyWon) check('the Wikdle win was credited to the day\'s quest', wikdleRow.progress > 0, JSON.stringify(wikdleRow));
// Finish the first quest by hand and claim it.
await p.evaluate(() => { const b = JSON.parse(localStorage.getItem('wikster.quests.v1')); b.quests[0].progress = b.quests[0].target; localStorage.setItem('wikster.quests.v1', JSON.stringify(b)); });
await go('packs'); await go('quests');
const claimable = await p.locator('#screen-quests .quest.is-done .btn-primary').count();
check('a finished quest offers its claim', claimable >= 1, String(claimable));
const beforeClaim = await wallet();
await p.locator('#screen-quests .quest.is-done .btn-primary').first().click(); await p.waitForTimeout(900);
const afterClaim = await wallet();
check('the claim pays out', afterClaim > beforeClaim, `${beforeClaim} -> ${afterClaim}`);
check('and the quest is marked claimed', (await p.locator('#screen-quests .quest.is-claimed').count()) === 1 && (await p.locator('#screen-quests .quest .btn-primary').count()) === claimable - 1);
const board2 = await p.evaluate(() => JSON.parse(localStorage.getItem('wikster.quests.v1')));
check('the claim is written down', board2.quests.filter((q) => q.claimed).length === 1);
await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2200);
await go('quests');
check('a relaunch cannot claim it again', (await p.locator('#screen-quests .quest.is-claimed').count()) === 1 && (await wallet()) === afterClaim, `${afterClaim} -> ${await wallet()}`);

/* --- leaderboard, signed out --------------------------------------------------- */
await go('leaderboard');
check('the board asks for an account', (await p.locator('#screen-leaderboard .game-stage').count()) === 1 && /sign in/i.test(await text('#screen-leaderboard .game-stage')), await text('#screen-leaderboard .game-stage'));
check('three windows to pick from', (await p.locator('#leaderboard-seg .seg-option').count()) === 3, String(await p.locator('#leaderboard-seg .seg-option').count()));
check('the pinned row stays hidden', await p.locator('#leaderboard-me').isHidden());

/* --- help sheets exist for every new screen ------------------------------------- */
for (const [link, help] of [['games', 'games'], ['quests', 'quests'], ['leaderboard', 'leaderboard']]) {
  await go(link);
  await p.locator(`#screen-${link} .help-btn[data-help="${help}"]`).click(); await p.waitForTimeout(400);
  const body = await text('#sheet');
  check(`help sheet for ${help} reads as English`, body.length > 80 && !/help_/.test(body), body.slice(0, 60));
  await p.locator('#sheet-close').click().catch(() => 0); await p.waitForTimeout(300);
}

/* --- French -------------------------------------------------------------------- */
await p.evaluate(() => localStorage.setItem('wikster.language', 'fr'));
await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2200);
await go('games');
check('the hub in French', /Mini-jeux/.test(await text('#games-title')), await text('#games-title'));
await go('quests');
check('the quests in French, no raw keys', !/[a-z]+[A-Z][a-z]+[A-Z]/.test(await text('#screen-quests')) && /Qu/.test(await text('#quests-title')), await text('#quests-title'));

console.log(errs.length ? `page errors: ${errs.join(' | ')}` : 'no page errors'); console.log(fails ? `${fails} FAILURES` : 'ALL PASS'); await b.close();
