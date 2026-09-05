/* --- the right-hand panel ------------------------------------------------------
 *
 * A desk has room for two things at once: what you are doing, and what you
 * would otherwise have to leave it to check. Past 1280px the app grows a
 * third column on the right that carries the second kind: the day (level,
 * gift, quests, the bell) under every screen, and above it whatever the
 * screen at hand keeps somewhere else on a phone - the shop's clocks, the
 * collection's filters, the arcade's rounds left.
 *
 * It is a reader, not a second app: every control here calls the same
 * function the phone's control calls, so nothing about the game's state
 * depends on the panel being open. It collapses to a strip, and remembers.
 *
 * The panel repaints on a screen change and once a second, and only when
 * something it shows has actually changed (see signature), so a hover or a
 * focus is never taken away from under the pointer.
 */

import { getLanguage, t, tx } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import { press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import * as store from '../collection.js';
import * as quests from '../quests.js';
import * as duel from '../duel.js';
import * as reveal from '../reveal.js';
import * as wikdle from '../wikdle.js';
import { canClaim, msUntilNextUtcDay } from '../daily.js';
import { formatCountdown } from '../shop.js';
import { nextFreeAt, nextRefreshAt } from '../economy.js';
import { levelFraction, rankFor, xpForLevel } from '../progression.js';
import { fill, h } from '../ui/dom.js';
import { activeFilterCount, openFilters } from './binder.js';
import { WIDE, el, money, showScreen, state } from './core.js';
import { openDaily, openOdds } from './daily.js';
import { openNotifications, unreadCount } from './drawer.js';
import { userId } from './gate.js';
import { questUserKey } from './arcade.js';

const PANEL_KEY = 'wikster.panel.v1';
/** The panel is a shape of this device's window, not part of the save. */
const stored = () => { try { return localStorage.getItem(PANEL_KEY); } catch { return null; } };
export const panelOpen = () => stored() !== 'closed';

let signature = '';

/** Puts the panel's state on the document, where the stylesheet reads it. */
export function applyPanelState() {
  document.documentElement.dataset.panel = panelOpen() ? 'open' : 'closed';
  const title = document.getElementById('panel-title');
  if (title) title.textContent = t('panelTitle');
  if (el.panelToggle) {
    el.panelToggle.innerHTML = iconSvg(panelOpen() ? 'chevronRight' : 'chevronLeft', { size: 16 });
    el.panelToggle.setAttribute('aria-label', t(panelOpen() ? 'panelHide' : 'panelShow'));
    el.panelToggle.setAttribute('aria-expanded', String(panelOpen()));
  }
}

export function togglePanel() {
  try { localStorage.setItem(PANEL_KEY, panelOpen() ? 'closed' : 'open'); } catch { /* session only */ }
  synth.playTap();
  applyPanelState();
  paintPanel({ force: true });
}

/* --- the blocks ---------------------------------------------------------- */

/** One line: an icon, what it says, and at most one thing to do about it.
 *  A line whose words are a countdown carries a `clock` so the tick can
 *  rewrite it without rebuilding the panel under the pointer. */
const line = (icon, text, extra = null, clock = null) => h('div.panel-line', [
  h('span.panel-line-icon', { html: iconSvg(icon, { size: 15 }), 'aria-hidden': 'true' }),
  h('span.panel-line-text', clock ? { dataset: { clock } } : null, text),
  extra
]);

/** What each clock line says right now. */
function clockText(name) {
  if (name === 'gift') return t('panelGiftIn', { time: formatCountdown(msUntilNextUtcDay()) });
  if (name === 'restock') return `${t('shopRestockIn')} ${formatCountdown(nextRefreshAt() - Date.now())}`;
  if (name === 'free') return t('freeAgainIn', { time: formatCountdown(nextFreeAt() - Date.now()) });
  return '';
}

/** The tick: the clocks move, nothing else is touched. */
function paintClocks() {
  for (const node of el.panelBody.querySelectorAll('[data-clock]')) node.textContent = clockText(node.dataset.clock);
}

const action = (label, run) => {
  const btn = h('button.btn.btn-sm.btn-ghost.panel-action', { type: 'button' }, label);
  press(btn, { sound: null });
  btn.addEventListener('click', () => { synth.playTap(); run(); });
  return btn;
};

const block = (title, rows) => h('section.panel-block', [h('h3.panel-title', title), ...rows.filter(Boolean)]);

/** The day: where you are, what is waiting, what is unread. */
function todayBlock() {
  const progress = state.profile.progress ?? { level: 1, xp: 0 };
  const level = progress.level ?? 1;
  const claimable = quests.claimableCount(questUserKey());
  const board = quests.loadBoard(questUserKey());
  const done = board.quests.filter((q) => q.progress >= q.target).length;
  const unread = unreadCount();
  const gift = canClaim(state.profile.daily);

  return block(t('panelToday'), [
    h('div.panel-level', [
      h('div.panel-level-head', [
        h('b', t('panelLevel', { n: level })),
        h('span.panel-rank', tx(rankFor(level).name))
      ]),
      h('span.panel-xp', h('i', { style: { width: `${Math.round(levelFraction(progress) * 100)}%` } })),
      h('span.panel-xp-note.tabular', t('panelXp', { have: (progress.xp ?? 0).toLocaleString(), need: xpForLevel(level).toLocaleString() }))
    ]),
    line('gift', gift ? t('panelGiftReady') : clockText('gift'),
      gift ? action(t('dailyClaim'), () => openDaily()) : null, gift ? null : 'gift'),
    line('scroll', t('panelQuests', { done, n: board.quests.length }),
      claimable ? action(t('panelClaim', { n: claimable }), () => showScreen('quests')) : null),
    line('bell', unread ? t('panelUnread', { n: unread }) : t('panelNoUnread'),
      unread ? action(t('panelRead'), () => openNotifications()) : null)
  ]);
}

/** What the screen at hand keeps out of sight on a phone. */
function screenBlock(tab) {
  if (tab === 'shop') {
    return block(t('tabShop'), [
      line('gem', t('shopPurse'), h('b.panel-money', { html: money(state.wallet) })),
      line('hourglass', clockText('restock'), null, 'restock'),
      line('clock', clockText('free'), null, 'free'),
      action(t('pullRates'), () => openOdds())
    ]);
  }
  if (tab === 'packs' || tab === 'timed') {
    const owned = Object.values(state.inventory ?? {}).reduce((sum, row) => sum + (row.count ?? 0), 0);
    const timed = state.profile.timed ?? { count: 0 };
    return block(t('tabBoosters'), [
      line('packs', t('panelShelf', { n: owned })),
      line('hourglass', t('panelTimed', { n: timed.count ?? 0 })),
      action(t('tabTimed'), () => showScreen('timed'))
    ]);
  }
  if (tab === 'binder' || tab === 'cardindex' || tab === 'glossary') {
    const entries = store.allEntries(state.collection);
    const own = entries.filter((e) => !e.special);
    const stats = store.collectionStats(own);
    const active = activeFilterCount();
    return block(t('tabCollection'), [
      line('collection', t('panelCards', { copies: stats.copies, unique: own.length })),
      line('gem', t('panelValue'), h('b.panel-money', { html: money(stats.value) })),
      tab === 'binder' ? action(active ? t('panelFiltersOn', { n: active }) : t('filters'), () => openFilters()) : null
    ]);
  }
  if (tab === 'market') {
    const m = state.market ?? { auctions: [], myBids: [] };
    const me = userId();
    const mine = (m.auctions ?? []).filter((a) => a.status === 'open' && a.seller === me).length;
    return block(t('tabMarket'), [
      line('trade', t('panelSelling', { n: mine })),
      line('star', t('panelBidding', { n: (m.myBids ?? []).length })),
      action(t('marketSell'), () => import('./market.js').then((mod) => mod.openSellSheet()))
    ]);
  }
  if (['games', 'wikdle', 'slots', 'duel', 'reveal'].includes(tab)) {
    const game = wikdle.loadGame();
    return block(t('tabGames'), [
      line('grid', game.status === 'playing' ? t('panelWikdleOpen') : t('panelWikdleDone')),
      line('podium', t('panelRounds', { game: t('duelTitle'), n: duel.roundsLeft() })),
      line('search', t('panelRounds', { game: t('revealGameTitle'), n: reveal.roundsLeft() })),
      action(t('tabLeaderboard'), () => showScreen('leaderboard'))
    ]);
  }
  return null;
}

/**
 * Everything the panel shows except the clocks, as one string: what tells a
 * rebuild from a tick. The clocks are left out on purpose, or the panel would
 * be rebuilt once a second and take the hover out from under the pointer.
 */
function currentSignature() {
  const progress = state.profile.progress ?? {};
  const board = quests.loadBoard(questUserKey());
  return [
    state.tab, document.documentElement.dataset.panel, getLanguage(),
    progress.level, progress.xp, state.wallet, unreadCount(),
    canClaim(state.profile.daily), board.quests.filter((q) => q.progress >= q.target).length,
    quests.claimableCount(questUserKey()),
    duel.roundsLeft(), reveal.roundsLeft(), activeFilterCount(),
    Object.keys(state.collection?.entries ?? {}).length,
    Object.values(state.inventory ?? {}).reduce((s, r) => s + (r.count ?? 0), 0)
  ].join('|');
}

/**
 * Paints the panel if anything on it moved. Called on every screen change and
 * once a second by the app's ticker; `force` is for the collapse toggle and
 * for a language change, where the signature has not moved but the words have.
 */
export function paintPanel({ force = false } = {}) {
  if (!el.panelBody) return;
  if (!WIDE.matches || !panelOpen()) { signature = ''; return; }
  const now = currentSignature();
  if (!force && now === signature) { paintClocks(); return; }
  signature = now;
  const blocks = [screenBlock(state.tab), todayBlock()].filter(Boolean);
  fill(el.panelBody, blocks);
  paintClocks();
}
