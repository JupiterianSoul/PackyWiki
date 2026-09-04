/* quests: split out of main.js */

import { t, tx } from '../i18n.js';
import * as quests from '../quests.js';
import { Ring, Segmented, press, reveal } from '../ui/components.js';
import { QUEST_TIERS } from '../data/quests.js';
import { specName } from '../booster.js';
import { iconSvg } from '../data/icons.js';
import * as store from '../collection.js';
import { synth } from '../ui/sound.js';
import { formatCountdown } from '../shop.js';
import * as leaderboard from '../leaderboard.js';
import { formatAmount } from '../pricing.js';
import { gameStage, houseError, questUserKey } from './arcade.js';
import { el, esc, money, refreshWallet, state, toast } from './core.js';
import { paintDrawerLinks } from './drawer.js';
import { showGate, signedIn, userId } from './gate.js';
import { gainBooster, spawnBurst } from './open.js';

/* --- quests --------------------------------------------------------------------------------- */

export function renderQuests() {
  el.questsTitle.textContent = t('tabQuests');
  el.questsSub.hidden = true;
  paintQuests(quests.loadBoard(questUserKey()));
  // Signed in, the server's deal is the deal: fetched in the background, painted when it comes.
  if (signedIn()) quests.syncBoard(questUserKey()).then((board) => { if (state.tab === 'quests') paintQuests(board); }).catch(() => { /* the device's board stands */ });
}
/**
 * The day's board, painted IN PLACE: the shell and the rows are built once
 * per day and only their numbers, bars and buttons change after that, so a
 * claim or a server answer never flashes the screen blank and back.
 */

export function paintQuests(board) {
  const rows = quests.describe(board);
  const done = rows.filter((r) => r.progress >= r.target).length;
  const pot = rows.reduce((sum, r) => sum + (r.quest.reward.money || 0), 0);

  let shell = el.questsBody.querySelector('.quests-shell');
  const fresh = !shell || shell.dataset.day !== board.day || shell.dataset.user !== questUserKey();
  if (fresh) {
    shell = document.createElement('div');
    shell.className = 'quests-shell';
    shell.dataset.day = board.day;
    shell.dataset.user = questUserKey();
    shell.innerHTML = `
      <div class="quests-top panel">
        <span class="quests-ring" data-ring></span>
        <div class="quests-top-copy">
          <b data-headline></b>
          <span data-sub></span>
          <span class="quests-pot" data-pot></span>
        </div>
      </div>
      <div class="quests" data-list></div>
      <p class="quests-reset tabular" data-reset></p>`;
    shell.ring = new Ring(shell.querySelector('[data-ring]'), { size: 58, width: 5 });
    el.questsBody.replaceChildren(shell);
    reveal([shell.querySelector('.quests-top')], { step: 0 });
  }
  shell.ring.set(rows.length ? done / rows.length : 0, `${done}/${rows.length}`);
  shell.querySelector('[data-headline]').textContent = done >= rows.length ? t('questsAllDone') : t('questsToGo', { n: rows.length - done });
  shell.querySelector('[data-sub]').textContent = t('questsIntroShort');
  shell.querySelector('[data-pot]').innerHTML = t('questsPot', { amount: money(pot) });

  const list = shell.querySelector('[data-list]');
  const seen = new Set();
  rows.forEach((row, i) => {
    seen.add(row.id);
    const tier = QUEST_TIERS[row.quest.tier];
    let card = list.querySelector(`[data-quest="${row.id}"]`);
    if (!card) {
      card = document.createElement('div');
      card.className = 'quest';
      card.dataset.quest = row.id;
      card.style.setProperty('--tier', tier.color);
      card.innerHTML = `
        <span class="quest-stripe" aria-hidden="true"></span>
        <div class="quest-main">
          <div class="quest-head"><b class="quest-name"></b><span class="quest-tier"></span></div>
          <div class="quest-bar"><i></i><span class="quest-bar-text tabular"></span></div>
          <div class="quest-foot"><span class="quest-reward"></span><span class="quest-state"></span></div>
        </div>`;
      card.querySelector('.quest-name').textContent = tx(row.quest.name);
      card.querySelector('.quest-tier').textContent = tx(tier.name);
      const rewardBits = [money(row.quest.reward.money)];
      if (row.quest.reward.booster) rewardBits.push(esc(specName(row.quest.reward.booster)));
      card.querySelector('.quest-reward').innerHTML = rewardBits.join(' + ');
      list.appendChild(card);
      if (fresh) { card.style.setProperty('--enter-from', '14px'); card.style.animationDelay = `${60 + i * 60}ms`; card.classList.add('is-entering'); }
    }
    const complete = row.progress >= row.target;
    card.classList.toggle('is-done', complete);
    card.classList.toggle('is-claimed', row.claimed);
    card.querySelector('.quest-bar i').style.width = `${Math.round(100 * Math.min(1, row.progress / row.target))}%`;
    card.querySelector('.quest-bar-text').textContent = `${Math.min(row.progress, row.target)} / ${row.target}`;
    const status = row.claimed ? 'claimed' : complete ? 'ready' : 'going';
    if (card.dataset.status === status) return;
    card.dataset.status = status;
    const slot = card.querySelector('.quest-state');
    if (status === 'claimed') {
      slot.innerHTML = `<span class="quest-stamp">${iconSvg('check', { size: 13 })}<span></span></span>`;
      slot.querySelector('.quest-stamp span').textContent = t('questClaimed');
    } else if (status === 'ready') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary btn-sm quest-claim';
      btn.textContent = t('questClaim');
      press(btn, { sound: null });
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const reward = await quests.claim(row.id, questUserKey());
          if (reward.money) { store.saveWallet(store.loadWallet() + reward.money); refreshWallet(); }
          if (reward.booster) gainBooster({ ...reward.booster }, 1);
          synth.playPurchase();
          const rect = btn.getBoundingClientRect();
          spawnBurst({ shapes: ['star4', 'orb'], colors: [tier.color, '#f8fafc', '#fbbf24'], count: 16, spread: 1, gravity: 0.3 },
            { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, { scale: 0.8 });
          toast(esc(t('questPaid', { name: tx(row.quest.name) })), 'ok');
          paintQuests(quests.loadBoard(questUserKey()));
          paintDrawerLinks();
        } catch (error) {
          btn.disabled = false;
          const code = String(error?.message ?? '');
          toast(esc(code === 'CLAIMED' ? t('questClaimed') : code === 'NOT_DONE' ? t('questNotDone') : houseError(error)), 'error');
          synth.playDenied();
        }
      });
      slot.replaceChildren(btn);
    } else {
      slot.innerHTML = `<span class="quest-pct tabular"></span>`;
      slot.querySelector('.quest-pct').textContent = `${Math.round(100 * Math.min(1, row.progress / row.target))}%`;
    }
  });
  for (const stale of [...list.children]) if (!seen.has(stale.dataset.quest)) stale.remove();

  const reset = shell.querySelector('[data-reset]');
  const tick = () => { reset.textContent = t('questsReset', { time: formatCountdown(quests.msToReset(board)) }); };
  tick();
  clearInterval(state.questsTimer);
  state.questsTimer = setInterval(() => {
    if (state.tab !== 'quests') { clearInterval(state.questsTimer); return; }
    if (quests.msToReset(board) <= 0) { renderQuests(); return; }
    tick();
  }, 1000);
}
/* --- the leaderboard --------------------------------------------------------------------------- */

export let leaderboardSeg = null;

export function renderLeaderboard() {
  el.leaderboardTitle.textContent = t('tabLeaderboard');
  const view = state.leaderboardView ??= { window: 'daily', page: 0, rows: [], more: false };
  if (!leaderboardSeg) {
    leaderboardSeg = new Segmented(el.leaderboardSeg, leaderboard.WINDOWS.map((id) => ({ id, label: t(`lb_${id}`) })), (id) => {
      view.window = id; view.page = 0; view.rows = [];
      loadLeaderboard();
    });
  }
  leaderboardSeg.select?.(view.window, { silent: true });
  loadLeaderboard();
}

export async function loadLeaderboard() {
  const view = state.leaderboardView;
  const body = el.leaderboardBody;
  el.leaderboardMe.hidden = true;
  el.screens.leaderboard?.classList.remove('has-pin');
  if (!signedIn()) {
    body.replaceChildren(gameStage('podium', t('lbSignIn'), { label: t('gateSignIn'), run: () => showGate() }));
    return;
  }
  if (view.page === 0) body.replaceChildren(gameStage('podium', t('lbLoading')));
  let page, mine = null;
  try {
    [page, mine] = await Promise.all([leaderboard.fetchPage(view.window, view.page), leaderboard.fetchMyRank(view.window).catch(() => null)]);
  } catch (error) {
    body.replaceChildren(gameStage('podium', houseError(error), { label: t('retry'), run: () => loadLeaderboard() }));
    return;
  }
  if (state.tab !== 'leaderboard') return;
  view.rows = view.page === 0 ? page.rows : [...view.rows, ...page.rows];
  view.more = page.more;
  const me = userId();
  const rowNode = (r, cls = '') => {
    const row = document.createElement('div');
    row.className = `lb-row${r.userId === me ? ' is-me' : ''}${r.rank <= 3 ? ` is-top${r.rank}` : ''} ${cls}`;
    row.innerHTML = `<span class="lb-rank tabular"></span><span class="lb-name"></span><span class="lb-score tabular"></span>`;
    row.querySelector('.lb-rank').textContent = `#${r.rank}`;
    row.querySelector('.lb-name').textContent = r.username;
    row.querySelector('.lb-score').textContent = formatAmount(r.score);
    return row;
  };
  // The three on the podium, first in the middle and a step higher.
  const step = (r, rank) => {
    const node = document.createElement('div');
    node.className = `lb-step is-r${rank}${r ? '' : ' is-empty'}${r && r.userId === me ? ' is-me' : ''}`;
    node.innerHTML = `
      <span class="lb-medal tabular"></span>
      <span class="person-mark lb-face" aria-hidden="true"></span>
      <span class="lb-step-name"></span>
      <span class="lb-step-score tabular"></span>`;
    node.querySelector('.lb-medal').textContent = String(rank);
    node.querySelector('.lb-face').textContent = r ? String(r.username).slice(0, 1) : '·';
    node.querySelector('.lb-step-name').textContent = r ? r.username : t('lbOpenStep');
    node.querySelector('.lb-step-score').textContent = r ? formatAmount(r.score) : '';
    return node;
  };
  const list = document.createElement('div');
  list.className = 'lb';
  if (!view.rows.length) list.appendChild(gameStage('podium', t('lbEmpty')));
  else {
    const podium = document.createElement('div');
    podium.className = 'lb-podium';
    podium.replaceChildren(step(view.rows[1], 2), step(view.rows[0], 1), step(view.rows[2], 3));
    list.appendChild(podium);
    const rest = view.rows.slice(3);
    if (rest.length) {
      const rows = document.createElement('div');
      rows.className = 'leaderboard';
      rows.replaceChildren(...rest.map((r) => rowNode(r)));
      list.appendChild(rows);
    }
  }
  // The world clock: the window turns at midnight UTC, and says so.
  const reset = document.createElement('p');
  reset.className = 'lb-foot';
  const paintReset = () => {
    const ms = leaderboard.msToReset(view.window);
    reset.innerHTML = `${iconSvg('clock', { size: 14 })}<span></span>`;
    reset.querySelector('span').textContent = ms == null ? t('lbForever')
      : t(view.window === 'weekly' ? 'lbResetWeekly' : 'lbResetDaily', { time: formatCountdown(ms) });
  };
  paintReset();
  clearInterval(state.lbTimer);
  state.lbTimer = setInterval(() => {
    if (state.tab !== 'leaderboard') { clearInterval(state.lbTimer); return; }
    paintReset();
  }, 1000);
  list.appendChild(reset);
  if (view.more) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'btn btn-ghost btn-sm lb-more';
    more.textContent = t('lbMore');
    press(more, { sound: null });
    more.addEventListener('click', () => { synth.playTap(); view.page += 1; loadLeaderboard(); });
    list.appendChild(more);
  }
  body.replaceChildren(list);
  // The player's own row, pinned to the bottom when it is not on the page.
  const onPage = view.rows.some((r) => r.userId === me);
  if (mine && !onPage) {
    el.leaderboardMe.replaceChildren(...rowNode({ rank: mine.rank, userId: me, username: t('lbYou'), score: mine.score }).childNodes);
    el.leaderboardMe.className = 'leaderboard-me lb-row is-me';
    el.leaderboardMe.hidden = false;
    el.screens.leaderboard?.classList.add('has-pin');
  }
}
