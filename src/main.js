/**
 * WIKLODO — application shell.
 * ============================================================================
 * This file owns the interface and nothing else. Every rule about what a
 * booster costs, what a card is worth, when a gift is due or how a level is
 * earned lives in its own module and is imported here; if you are looking for
 * a number, it is not in this file.
 *
 * The shape of the app:
 *
 *   a live backdrop        one canvas, per theme, behind everything
 *   a floating app bar     level, screen, wallet, gift
 *   five destinations      Packs, Timed, Shop, Binder, Profile
 *   one sheet              every panel in the app is this one component
 *   one takeover           opening a pack hides the frame entirely
 *
 * Themes are not a palette swap: each carries its own shapes, typeface, pace,
 * texture, backdrop and instrument. See ui/themes.js.
 */

import { THEME_PACKS, themeById as packById } from './data/packs.js';
import { RARITIES, rarityById, rarityRank, rollRarity, oddsTable, rarityChances } from './data/rarities.js';
import { iconSvg, logoSvg, buckSvg } from './data/icons.js';
import { drawArticles, resolveCustomWiki } from './wiki.js';
import { priceFor, formatAmount, formatViews, bandFor, POPULARITY_BANDS } from './pricing.js';
import {
  boosterPrice, rollOptionsFor, sellPriceFor, nextRefreshAt, windowIndexAt,
  nextFreeAt, freeWindowAt, STARTER_PACKS, STARTER_PACK_CARDS, STARTER_COINS
} from './economy.js';
import { generateShop, formatCountdown } from './shop.js';
import {
  specId, specName, specTagline, specColours, specIcon, toDrawPack
} from './booster.js';
import * as store from './collection.js';
import {
  MAX_LEVEL, xpForCard, xpForLevel, rankFor, rewardForLevel, addXp, levelFraction
} from './progression.js';
import {
  generateBoard, canClaim, claim as claimDaily, nextIndex as nextGiftIndex, BOARD_SIZE,
  msUntilNextDay, dayNumber
} from './daily.js';
import {
  MAX_TIMED_LEVEL, TIMED_CARDS, accrue, msToNext, timedLevel, timedSpec, maxHeld,
  regenMs, levelBounds, levelProgress, timedRollOptions
} from './timed.js';
import { t, tx, getLanguage, setLanguage, languageChosen, LANGUAGES } from './i18n.js';
import {
  exportSave, importSave, describeSave, parseSave, copyText, readText, onSaveChanged
} from './save.js';
import * as account from './account.js';

import { THEMES, DEFAULT_THEME, applyTheme, themeById } from './ui/themes.js';
import { buildPackElement, buildCardBack } from './packview.js';
import { buildAlbums, albumsCompleted, CARDS_PER_PAGE, CARDS_PER_SPREAD } from './albums.js';
import { evaluate as evaluateAchievements, measure as measureAchievements, redeemableCount } from './achievements.js';
import { emblemSvg, monogramSvg } from './data/emblems.js';
import { styleForSpec, rarityBurst } from './packstyle.js';
import { synth } from './ui/sound.js';
import { backdrop } from './ui/backdrop.js';
import {
  press, trackDrag, dur, Odometer, Ring, Bar, Segmented, Sheet, NavBar, Rail, reveal
} from './ui/components.js';

/* --- tuning ---------------------------------------------------------------- */
const RIP_COMMIT = 0.62;
const RIP_TICK_STEP = 0.055;
const RIP_LOCK_SLOP = 10;
const SWIPE_COMMIT = 78;
const EMERGE_STAGGER = 130;
const EMERGE_DURATION = 1060;
const PREFETCH_DELAY = 350;
/** How long the last card stays up before the summary takes over. */
const LAST_CARD_HOLD = 2000;
const TILT_MAX = 16;

const $ = (sel) => document.querySelector(sel);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const clamp01 = (n) => clamp(n, 0, 1);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shuffle = (arr) => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const THEME_KEY = 'packywiki.theme';
const RIP_DIR_KEY = 'packywiki.ripDirection';

/* --- state ----------------------------------------------------------------- */

const state = {
  tab: 'packs',
  packMode: 'owned',           // 'owned' | 'custom'
  shopFilter: 'all',
  spec: null,
  customPacks: store.loadCustomPacks(),
  collection: store.loadCollection(),
  inventory: store.loadInventory(),
  profile: store.loadProfile(),
  wallet: store.loadWallet(),
  ripDir: Number(localStorage.getItem?.(RIP_DIR_KEY)) || 0,
  prefetch: null,
  prefetchTimer: null,
  summaryTimer: null,
  busy: false,
  pulls: [], cards: [], index: 0, seen: new Set(),
  detail: null,
  album: null, albumTurning: false,
  packSlots: [],
  filters: { search: '', pack: '', rarity: '', band: '', minPrice: '', sort: 'rarity', favoritesOnly: false },

  // Who is signed in, and what the server last told us about them.
  account: { session: null, profile: null, mode: 'signin', syncing: false, syncedAt: null, failed: false },
  // The friends screen, and whichever friend is being looked at.
  social: { friends: [], incoming: [], outgoing: [], results: [], loaded: false, unread: new Map(), trades: [] },
  viewing: null
};

/** Test-only switches, reachable through window.__packywiki. */
const debug = { failNextOpen: false };

const settings = () => state.profile.settings;
const money = (amount) => `${buckSvg({ size: 12 })}${formatAmount(amount)}`;
/** For the few places that put a value into markup rather than textContent. */
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* --- elements --------------------------------------------------------------- */

const el = {};
const bind = (map) => Object.assign(el, map);
bind({
  screens: {
    packs: $('#screen-packs'), timed: $('#screen-timed'), shop: $('#screen-shop'),
    binder: $('#screen-binder'), profile: $('#screen-profile'),
    settings: $('#screen-settings'), friends: $('#screen-friends'),
    friend: $('#screen-friend'), chat: $('#screen-chat'), ach: $('#screen-ach'), open: $('#screen-open')
  },
  backdrop: $('#backdrop'), navbar: $('#navbar'),
  menuBtn: $('#menu-btn'), menuIcon: $('#menu-icon'),
  giftBtn: $('#gift-btn'), giftIcon: $('#gift-icon'), giftDot: $('#gift-dot'),
  levelBadge: $('#level-badge'),
  wallet: $('#wallet'), walletMark: $('#wallet-mark'), walletAmount: $('#wallet-amount'),
  bell: $('#bell'), bellIcon: $('#bell-icon'), bellCount: $('#bell-count'),

  drawer: $('#drawer'), drawerScrim: $('#drawer .drawer-scrim'), drawerPanel: $('#drawer .drawer-panel'),
  drawerMark: $('#drawer-mark'), drawerWho: $('#drawer-who'), drawerLinks: $('#drawer-links'),
  splash: $('#splash'), splashMark: $('#splash-mark'),

  packsSeg: $('#packs-seg'), packsRail: $('#packs-rail'), packsCaption: $('#packs-caption'),
  packsName: $('#packs-name'), packsSub: $('#packs-sub'), packsOwn: $('#packs-own'),
  packsActions: $('#packs-actions'), packsOpen: $('#packs-open'), packsHint: $('#packs-hint'),
  packsEmpty: $('#packs-empty'), packsEmptyMark: $('#packs-empty-mark'),
  packsEmptyText: $('#packs-empty-text'), packsEmptyCta: $('#packs-empty-cta'),
  creatorWrap: $('#creator-wrap'), creator: $('#creator'), creatorMark: $('#creator-mark'),
  creatorLabel: $('#creator-label'), creatorNote: $('#creator-note'),
  creatorInput: $('#creator-input'), creatorGo: $('#creator-go'), creatorStatus: $('#creator-status'),
  creatorMineLabel: $('#creator-mine-label'),
  creatorMine: $('#creator-mine'), creatorEmpty: $('#creator-empty'),
  creatorEmptyMark: $('#creator-empty-mark'), creatorEmptyText: $('#creator-empty-text'),

  timedTitle: $('#timed-title'), timedOpen: $('#timed-open'),
  freeRing: $('#free-ring'), freeCount: $('#free-count'), freeCap: $('#free-cap'),
  freeState: $('#free-state'), freePips: $('#free-pips'), freeFoot: $('#free-foot'),
  freeTrackLabel: $('#free-track-label'), freePerks: $('#free-perks'),
  trackLevel: $('#track-level'), trackRemaining: $('#track-remaining'), trackBar: $('#track-bar'),
  trackNext: $('#track-next'),

  shopTitle: $('#shop-title'), restock: $('#restock'), shopRows: $('#shop-rows'),
  shopPurse: $('#shop-purse'), shopPurseLabel: $('#shop-purse-label'),
  shopRestockLabel: $('#shop-restock-label'), shopFilter: $('#shop-filter'),
  shopEmpty: $('#shop-empty'), shopEmptyMark: $('#shop-empty-mark'), shopEmptyText: $('#shop-empty-text'),

  oddsBtn: $('#odds-btn'), oddsIcon: $('#odds-icon'), oddsLabel: $('#odds-label'),

  binderTitle: $('#binder-title'), binderStats: $('#binder-stats'),
  albumShelf: $('#album-shelf'), albumView: $('#album-view'), albumBack: $('#album-back'),
  albumName: $('#album-name'), albumProgress: $('#album-progress'),
  albumBook: $('#album-book'), pageLeft: $('#page-left'), pageRight: $('#page-right'),
  pagenoLeft: $('#pageno-left'), pagenoRight: $('#pageno-right'),
  albumDots: $('#album-dots'), albumHint: $('#album-hint'),
  achTitle: $('#ach-title'), achSub: $('#ach-sub'), achList: $('#ach-list'),
  friendActions: $('#friend-actions'), friendAlbums: $('#friend-albums'),
  tradesHead: $('#trades-head'), tradesLabel: $('#trades-label'), tradesList: $('#trades-list'),
  friendsStale: $('#friends-stale'),
  chatBack: $('#chat-back'), chatAvatar: $('#chat-avatar'), chatName: $('#chat-name'),
  chatPresence: $('#chat-presence'), chatLog: $('#chat-log'),
  chatForm: $('#chat-form'), chatInput: $('#chat-input'), chatSend: $('#chat-send'),
  binderEmpty: $('#binder-empty'), binderEmptyMark: $('#binder-empty-mark'),
  binderEmptyText: $('#binder-empty-text'),
  filterOpen: $('#filter-open'), filterCount: $('#filter-count'),

  profileRing: $('#profile-ring'), profileLevel: $('#profile-level'), profileRank: $('#profile-rank'),
  xpBar: $('#xp-bar'), xpLine: $('#xp-line'), nextRewardLabel: $('#next-reward-label'),
  nextReward: $('#next-reward'), statsLabel: $('#stats-label'), statGrid: $('#stat-grid'),
  rarityLabel: $('#rarity-label'), rarityBars: $('#rarity-bars'),

  settingsTitle: $('#settings-title'), themeLabel: $('#theme-label'), themeGrid: $('#theme-grid'),
  prefsLabel: $('#prefs-label'), settingsList: $('#settings-list'),
  dataLabel: $('#data-label'), dataList: $('#data-list'),

  openScreen: $('#screen-open'), openBack: $('#open-back'), openTitle: $('#open-title'),
  burstLayer: $('#burst-layer'),
  openProgress: $('#open-progress'), openStage: $('#open-stage'), boosterSlot: $('#booster-slot'),
  cardStack: $('#card-stack'), summary: $('#summary'), openHint: $('#open-hint'), openDone: $('#open-done'),

  sheet: $('#sheet'), sheetTitle: $('#sheet-title'), sheetBody: $('#sheet-body'), sheetClose: $('#sheet-close'),

  friendsTitle: $('#friends-title'), friendsIntro: $('#friends-intro'),
  find: $('#find'), findMark: $('#find-mark'), findInput: $('#find-input'),
  findGo: $('#find-go'), findStatus: $('#find-status'), findResults: $('#find-results'),
  resultsHead: $('#results-head'), resultsLabel: $('#results-label'),
  incomingHead: $('#incoming-head'), incomingLabel: $('#incoming-label'), incomingList: $('#incoming-list'),
  friendsHead: $('#friends-head'), friendsLabel: $('#friends-label'), friendsList: $('#friends-list'),
  outgoingHead: $('#outgoing-head'), outgoingLabel: $('#outgoing-label'), outgoingList: $('#outgoing-list'),
  friendsEmpty: $('#friends-empty'), friendsEmptyMark: $('#friends-empty-mark'),
  friendsEmptyText: $('#friends-empty-text'),

  friendBack: $('#friend-back'), friendName: $('#friend-name'), friendRing: $('#friend-ring'),
  friendLevel: $('#friend-level'), friendRank: $('#friend-rank'), friendStats: $('#friend-stats'),
  friendCardsLabel: $('#friend-cards-label'), friendCardsStatus: $('#friend-cards-status'),
   friendRemove: $('#friend-remove'),

  gate: $('#gate'), gateMark: $('#gate-mark'), gateTitle: $('#gate-title'), gateBody: $('#gate-body'),
  gateSeg: $('#gate-seg'), gateForm: $('#gate-form'), gateStatus: $('#gate-status'),
  gateAlt: $('#gate-alt'), gateFoot: $('#gate-foot'),

  welcome: $('#welcome'), welcomeMark: $('#welcome-mark'), welcomeTitle: $('#welcome-title'),
  welcomeBody: $('#welcome-body'), langChoices: $('#lang-choices'), starter: $('#starter'),
  starterTitle: $('#starter-title'), starterBody: $('#starter-body'),
  starterLoot: $('#starter-loot'), starterGo: $('#starter-go'),

  flash: $('#flash'), toast: $('#toast'), xpPop: $('#xp-pop')
});

let nav, sheet, walletOdo, levelRing, profileRing, xpBar, trackBar, packsSeg, gateSeg, friendRing, freeRing;

/* --- the one timer ----------------------------------------------------------- */

/**
 * Everything that needs a clock shares one interval, and it only runs when the
 * document is visible AND a screen that wants it is on display. A 1 Hz timer
 * left running in the background is the cheapest way to warm a phone up for
 * nothing.
 */
const ticker = { id: null, jobs: new Map() };

const runTicker = () => { for (const job of ticker.jobs.values()) job(); };

function setTickerJob(name, job) {
  if (job) ticker.jobs.set(name, job);
  else ticker.jobs.delete(name);
  syncTicker();
}

function syncTicker() {
  const wanted = document.visibilityState === 'visible' && ticker.jobs.size > 0;
  if (wanted && ticker.id == null) ticker.id = setInterval(runTicker, 1000);
  if (!wanted && ticker.id != null) { clearInterval(ticker.id); ticker.id = null; }
}

/* --- playtime ---------------------------------------------------------------- */

let visibleSince = document.visibilityState === 'visible' ? Date.now() : null;

function flushPlaytime() {
  if (visibleSince == null) return;
  store.addPlaytime(state.profile, Date.now() - visibleSince);
  visibleSince = Date.now();
}

/* --- toast -------------------------------------------------------------------- */

function toast(markup, kind = 'ok') {
  el.toast.innerHTML = markup;
  el.toast.className = `toast is-${kind} is-showing`;
  el.toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.toast.classList.remove('is-showing'); }, 2600);
}

/* --- theming -------------------------------------------------------------------- */

function storedTheme() {
  try { return localStorage.getItem(THEME_KEY) ?? DEFAULT_THEME; } catch { return DEFAULT_THEME; }
}

/**
 * Switch theme. The document attribute repaints every token; the backdrop and
 * the synthesiser are told separately because neither lives in CSS.
 */
function useTheme(id, { announce = false } = {}) {
  const theme = applyTheme(id);
  try { localStorage.setItem(THEME_KEY, theme.id); } catch { /* session only */ }
  backdrop.setTheme(theme.id);
  synth.setTheme(theme.id);
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme.swatch[0]);
  if (announce) { synth.resume(); synth.playTheme(); }
  return theme;
}

/* --- app chrome ------------------------------------------------------------------ */

const SCREEN_TITLES = {
  packs: 'tabBoosters', timed: 'tabTimed', shop: 'tabShop',
  binder: 'tabCollection', profile: 'tabProfile', settings: 'tabSettings',
  friends: 'tabFriends', friend: 'tabFriends'
};

function showScreen(name) {
  Object.entries(el.screens).forEach(([key, node]) => node.classList.toggle('is-active', key === name));
  if (name !== 'open') {
    state.tab = name;
    nav?.select(navTabFor(name), { silent: true });
    paintDrawerLinks();
  }

  // Opening a pack is a takeover: the frame gets out of the way, and the
  // backdrop stops so the whole GPU budget goes to the cards.
  const immersive = name === 'open';
  document.documentElement.classList.toggle('is-immersive', immersive);
  backdrop.setPaused(immersive);

  setTickerJob('shop', name === 'shop' ? tickRestock : null);
  setTickerJob('timed', name === 'timed' ? tickTimed : null);
  // #app is the scroll container now, not the document.
  document.getElementById('app')?.scrollTo({ top: 0 });
}

/**
 * Settings and Friends have no destination of their own; both hang off the
 * Profile, so the bottom bar stays at five.
 */
const navTabFor = (screen) =>
  (['settings', 'friends', 'friend', 'chat', 'ach'].includes(screen) ? 'profile' : screen);

function refreshWallet() {
  state.wallet = store.loadWallet();
  walletOdo.set(state.wallet);
  el.wallet.setAttribute('aria-label', `${t('walletTitle')}: ${formatAmount(state.wallet)}`);
}

function refreshLevelBadge() {
  const level = state.profile.progress.level ?? 1;
  levelRing.set(levelFraction(state.profile.progress), String(level));
  el.levelBadge.setAttribute('aria-label', `${t('profileLevel', { n: level })}`);
}

function updateBadges() {
  // The collection count is deliberately not badged: it only ever grows, so it
  // is a number that is always there and never means anything has happened.
  const timed = state.profile.timed.count ?? 0;
  nav.setBadge('timed', timed ? String(timed) : '');
  const ready = canClaim(state.profile.daily);
  el.giftDot.hidden = !ready;
  paintBell();
}

/* --- the drawer --------------------------------------------------------------------
 *
 * Everything you can go to, in one list. The bottom bar holds five; the app has
 * more than five places, and the ones that did not fit were previously hidden
 * behind a "More" heading on the Profile — which is a strange place to keep the
 * way to Settings.
 */

/** id, icon, label key, and what opening it does. */
function drawerItems() {
  const go = (screen, paint) => () => { paint?.(); showScreen(screen); };
  return [
    { id: 'packs',  icon: 'packs',      key: 'tabBoosters',    run: go('packs', renderPacks) },
    { id: 'timed',  icon: 'hourglass',  key: 'tabTimed',       run: go('timed', renderTimed) },
    { id: 'shop',   icon: 'gem',        key: 'tabShop',        run: go('shop', () => { payStipend(); renderShop(); }) },
    { id: 'binder', icon: 'collection', key: 'tabCollection',  run: go('binder', renderBinder) },
    { id: 'daily',  icon: 'gift',       key: 'dailyTitle', dot: () => canClaim(state.profile.daily),
      run: () => openDaily() },
    { id: 'ach',    icon: 'trophy',     key: 'achTitle',
      badge: () => achRedeemableCount(),
      run: go('ach', renderAchievements) },
    { sep: true },
    ...(account.configured
      ? [{ id: 'friends', icon: 'friends', key: 'tabFriends',
           badge: () => state.social.incoming.length,
           run: go('friends', () => { renderFriends(); loadFriends(); }) }]
      : []),
    { id: 'profile',  icon: 'profile',  key: 'tabProfile',  run: go('profile', renderProfile) },
    { id: 'settings', icon: 'settings', key: 'tabSettings', run: go('settings', renderSettings) }
  ];
}

function buildDrawer() {
  el.drawerMark.innerHTML = logoSvg({ size: 34 });
  el.drawerLinks.replaceChildren(...drawerItems().map((item) => {
    if (item.sep) {
      const rule = document.createElement('div');
      rule.className = 'drawer-sep';
      return rule;
    }
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'drawer-link';
    row.dataset.link = item.id;
    row.innerHTML = `<span class="drawer-icon">${iconSvg(item.icon, { size: 20 })}</span>
      <span></span><span class="chip" hidden></span>`;
    row.querySelector('span:nth-child(2)').textContent = t(item.key);
    press(row, { sound: null });
    row.addEventListener('click', () => {
      synth.playTap();
      closeDrawer();
      item.run();
    });
    return row;
  }));
  paintDrawerLinks();
}

/** Keep the drawer's highlight and counts honest without rebuilding it. */
function paintDrawerLinks() {
  const items = new Map(drawerItems().filter((i) => !i.sep).map((i) => [i.id, i]));
  el.drawerLinks.querySelectorAll('.drawer-link').forEach((row) => {
    const item = items.get(row.dataset.link);
    row.classList.toggle('is-current', row.dataset.link === navTabFor(state.tab));
    const chip = row.querySelector('.chip');
    const n = item?.badge?.() ?? 0;
    const dot = item?.dot?.() ?? false;
    chip.textContent = n ? String(n) : (dot ? '!' : '');
    chip.hidden = !n && !dot;
  });
}

function openDrawer() {
  buildDrawer();
  el.drawer.hidden = false;
  el.menuBtn.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => el.drawer.classList.add('is-open'));
  synth.playSheetOpen?.();
}

function closeDrawer() {
  if (el.drawer.hidden) return;
  el.drawer.classList.remove('is-open');
  el.menuBtn.setAttribute('aria-expanded', 'false');
  setTimeout(() => { el.drawer.hidden = true; }, dur(300));
}

/* --- notifications -----------------------------------------------------------------
 *
 * One list, one unread count. The only thing that raises a notification today
 * is a friend request; the shape is general so the next one has somewhere to
 * go. Read state lives in the profile, keyed by the id of the thing that
 * caused it, so it survives a restart and syncs with everything else.
 */

/**
 * A persistent local feed for one-off events (a gift arrived, a trade was
 * answered), capped so it cannot grow forever. Live rows — friend requests,
 * unread chats, trades awaiting your answer — are derived fresh every time.
 */
function pushNote(icon, title, screen = 'friends') {
  const feed = state.profile.notifFeed ??= [];
  feed.unshift({ id: `note-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    icon, title, when: new Date().toISOString(), screen });
  if (feed.length > 30) feed.length = 30;
  store.saveProfile(state.profile);
  paintBell();
}

function notifications() {
  const go = (screen) => () => {
    if (screen === 'friends') { renderFriends(); showScreen('friends'); }
    else if (screen === 'packs') { renderPacks(); showScreen('packs'); }
    else showScreen(screen);
  };
  const rows = [];

  for (const entry of state.social.incoming) {
    rows.push({ id: entry.id, icon: 'addFriend',
      title: t('notifRequest', { name: entry.profile.username }),
      when: entry.created_at, run: go('friends') });
  }
  // Trades waiting on my answer.
  for (const trade of state.social.trades ?? []) {
    if (trade.status !== 'pending' || trade.recipient !== userId()) continue;
    const who = state.social.friends.find((f) => f.otherId === trade.proposer)?.profile?.username ?? '?';
    rows.push({ id: `trade-${trade.id}`, icon: 'trade',
      title: t('notifTrade', { name: who }), when: trade.created_at, run: go('friends') });
  }
  // Unread chats, one row per sender.
  for (const [sender, n] of state.social.unread ?? []) {
    const who = state.social.friends.find((f) => f.otherId === sender);
    if (!who) continue;
    rows.push({ id: `chat-${sender}-${n}`, icon: 'chat',
      title: t('notifMessages', { n, name: who.profile.username }),
      when: null, run: () => openChat(who) });
  }
  // The stored feed (gifts received, trades resolved).
  for (const note of state.profile.notifFeed ?? []) {
    rows.push({ id: note.id, icon: note.icon, title: note.title,
      when: note.when, run: go(note.screen) });
  }
  return rows;
}

const isRead = (id) => (state.profile.notifRead ?? []).includes(id);
const unreadCount = () => notifications().filter((n) => !isRead(n.id)).length;

function markRead(ids) {
  const seen = new Set(state.profile.notifRead ?? []);
  const live = new Set(notifications().map((n) => n.id));
  ids.forEach((id) => seen.add(id));
  // Drop ids for things that no longer exist, or the list grows forever.
  state.profile.notifRead = [...seen].filter((id) => live.has(id));
  store.saveProfile(state.profile);
  paintBell();
}

function paintBell() {
  const n = unreadCount();
  el.bellCount.textContent = n > 9 ? '9+' : String(n);
  el.bellCount.hidden = n === 0;
  el.bell.classList.toggle('is-hot', n > 0);
}

function openNotifications() {
  const list = notifications();
  openSheet(t('notifTitle'), (body) => {
    if (!list.length) {
      body.innerHTML = `<p class="muted" style="font-size:.88rem;line-height:1.6"></p>`;
      body.querySelector('p').textContent = t('notifEmpty');
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'notes';
    wrap.replaceChildren(...list.map((note) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `note-row${isRead(note.id) ? '' : ' is-unread'}`;
      row.innerHTML = `<span class="note-mark">${iconSvg(note.icon, { size: 18 })}</span>
        <span class="note-copy"><b></b><span></span></span>
        <span class="muted">${iconSvg('chevron', { size: 17 })}</span>`;
      row.querySelector('b').textContent = note.title;
      row.querySelector('.note-copy span').textContent = whenText(note.when);
      press(row, { sound: null });
      row.addEventListener('click', () => { sheet.hide(); note.run(); });
      return row;
    }));
    body.appendChild(wrap);
  });
  // Opening the list is reading it.
  markRead(list.map((n) => n.id));
}

/** "3 min ago", "2 days ago" — enough to place it, no more. */
function whenText(iso) {
  const at = Date.parse(iso ?? '');
  if (!Number.isFinite(at)) return '';
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (mins < 1) return t('accountJustNow');
  if (mins < 60) return t('accountMinsAgo', { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t('notifHoursAgo', { n: hours });
  return t('notifDaysAgo', { n: Math.round(hours / 24) });
}

/* --- help ---------------------------------------------------------------------------
 *
 * A "?" on each screen that explains what the screen is for, in the fewest
 * words that actually answer the question. Numbered steps rather than prose,
 * because the answer is nearly always "here is the loop".
 */

const HELP = {
  packs:   { steps: 3, tip: true },
  timed:   { steps: 3, tip: true },
  shop:    { steps: 3, tip: true },
  binder:  { steps: 3, tip: true },
  friends: { steps: 3, tip: true }
};

function openHelp(topic) {
  const shape = HELP[topic];
  if (!shape) return;
  openSheet(t(`help_${topic}_title`), (body) => {
    const wrap = document.createElement('div');
    wrap.className = 'help-body';

    const lead = document.createElement('p');
    lead.className = 'help-lead';
    lead.textContent = t(`help_${topic}_lead`);
    wrap.appendChild(lead);

    for (let i = 1; i <= shape.steps; i++) {
      const step = document.createElement('div');
      step.className = 'help-step';
      step.innerHTML = `<span class="help-num">${i}</span><p></p>`;
      // The copy marks one phrase per step with *stars*; that phrase is the
      // thing you actually do, so it is the thing that should stand out.
      step.querySelector('p').innerHTML = esc(t(`help_${topic}_${i}`))
        .replace(/\*([^*]+)\*/g, '<b>$1</b>');
      wrap.appendChild(step);
    }

    if (shape.tip) {
      const tip = document.createElement('p');
      tip.className = 'help-tip';
      tip.textContent = t(`help_${topic}_tip`);
      wrap.appendChild(tip);
    }
    body.appendChild(wrap);
  });
}

/* --- booster art ------------------------------------------------------------------ */

function buildBooster(spec, { interactive = false, size = '' } = {}) {
  const booster = buildPackElement(spec, { interactive, size });
  if (interactive && state.ripDir) booster.dataset.ripDir = String(state.ripDir);
  return booster;
}

/* --- packs ------------------------------------------------------------------------- */

function ownedFor(mode) {
  return store.ownedBoosters(state.inventory)
    .filter((slot) => (mode === 'custom') === (slot.spec.kind === 'custom'))
    .sort((a, b) => specName(a.spec).localeCompare(specName(b.spec)));
}

function renderPacks() {
  const slots = ownedFor(state.packMode);
  state.packSlots = slots;

  const custom = state.packMode === 'custom';
  el.creatorWrap.hidden = !custom;
  if (custom) renderCreator();
  const has = slots.length > 0;
  el.packsRail.hidden = !has;
  el.packsCaption.hidden = !has;
  el.packsActions.hidden = !has;
  el.packsEmpty.hidden = has;

  if (!has) {
    // Clear it, do not just hide it: leaving the previous shelf's items in the
    // DOM means switching to an empty shelf still has boosters behind the
    // empty state, which is exactly the bug the `[hidden]` fix was for.
    packsRail.setItems([]);
    // On the custom tab the builder below already says what to do, so the
    // shelf's own empty state would be the same advice twice.
    el.packsEmpty.hidden = custom;
    el.packsEmptyMark.innerHTML = iconSvg('packs', { size: 46 });
    el.packsEmptyText.textContent = t('shelfEmpty');
    el.packsEmptyCta.textContent = t('goShop');
    el.packsEmptyCta.hidden = false;
    return;
  }

  packsRail.setItems(slots.map((slot, index) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'rail-item';
    item.dataset.index = String(index);
    item.setAttribute('aria-label', specName(slot.spec));
    item.appendChild(buildBooster(slot.spec));

    const badge = document.createElement('span');
    badge.className = 'own-badge';
    badge.textContent = `×${slot.count}`;
    item.appendChild(badge);

    item.addEventListener('click', () => {
      if (index === packsRail.index) openScreenFor(slot.spec);
      else packsRail.scrollTo(index);
    });
    return item;
  }));
  paintPackCaption(Math.min(packsRail.index, slots.length - 1));
}

function paintPackCaption(index) {
  const slot = state.packSlots[index];
  if (!slot) return;
  el.packsName.textContent = specName(slot.spec);
  el.packsSub.textContent = specTagline(slot.spec);
  el.packsOwn.innerHTML = `${t('youOwn', { n: slot.count })} · ${slot.spec.cards} ${t('cards')}`;
  el.packsOpen.textContent = t('openPack');
  el.packsOpen.onclick = () => openScreenFor(slot.spec);
  el.packsHint.textContent = t('swipeShelf');
  schedulePrefetch(slot.spec);
}

/* --- custom boosters ---------------------------------------------------------------- */

/*
 * Rebuilt as a workbench rather than a bare text field.
 *
 * The old version was a label, an input and a button, and gave no clue what
 * counted as a subject or whether anything you had built still existed — you
 * had to go and look in the Shop. It now says what it makes, offers real
 * examples to tap, and lists what you have already built underneath.
 */
function renderCreator() {
  el.creatorMark.innerHTML = iconSvg('wand', { size: 22 });
  el.creatorLabel.textContent = t('creatorTitle');
  el.creatorNote.textContent = t('creatorNote');
  el.creatorInput.placeholder = t('customPlaceholder');
  el.creatorGo.textContent = t('create');
  el.creatorMineLabel.textContent = t('creatorMine');

  const made = state.customPacks ?? [];
  el.creatorEmpty.hidden = made.length > 0;
  if (!made.length) {
    el.creatorEmptyMark.innerHTML = iconSvg('wand', { size: 40 });
    el.creatorEmptyText.textContent = t('creatorNoneYet');
  }

  el.creatorMine.replaceChildren(...made.map((pack) => {
    const spec = { kind: 'custom', themeId: pack.id, rarityId: null, cards: 5 };
    const row = document.createElement('div');
    row.className = 'made';
    row.innerHTML = `
      <button type="button" class="made-main">
        <span class="made-art"></span>
        <span class="made-copy"><b></b><span></span></span>
      </button>
      <button type="button" class="made-delete" aria-label="${t('deleteBooster')}">
        ${iconSvg('trash', { size: 17 })}
      </button>`;
    row.querySelector('.made-art').appendChild(buildBooster(spec, { size: 'is-tiny' }));
    row.querySelector('b').textContent = pack.name;
    row.querySelector('.made-copy span').textContent = t('creatorInShop');

    const main = row.querySelector('.made-main');
    press(main, { sound: null });
    main.addEventListener('click', () => {
      synth.playTap();
      payStipend();
      renderShop();
      showScreen('shop');
    });

    // Deleting is two taps: the first arms the button, the second commits.
    // Walking away (or tapping anything else) disarms it.
    const del = row.querySelector('.made-delete');
    let armTimer = 0;
    del.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!del.classList.contains('is-armed')) {
        del.classList.add('is-armed');
        toast(t('deleteArmed'), 'ok');
        synth.playTap();
        armTimer = setTimeout(() => del.classList.remove('is-armed'), 3500);
        return;
      }
      clearTimeout(armTimer);
      state.customPacks = store.deleteCustomPack(pack.id);
      toast(t('packDeleted', { name: pack.name }), 'ok');
      synth.playResolved();
      renderCreator();
      renderPacks();
      renderShop();
    });
    return row;
  }));
}


function customPackName(typed, sitename) {
  const trimmed = (sitename ?? '').replace(/\s*(fandom|wiki|wikia)\s*$/i, '').trim();
  return trimmed.length >= 2 ? trimmed : typed.replace(/\s+/g, ' ').trim();
}

function setCreatorStatus(text, kind) {
  el.creatorStatus.textContent = text;
  el.creatorStatus.className = `creator-status is-${kind}`;
}

async function createCustomPack(event) {
  event.preventDefault();
  if (state.busy) return;

  const raw = el.creatorInput.value.trim();
  if (!raw) { setCreatorStatus(t('typeNameFirst'), 'error'); return; }

  state.busy = true;
  el.creatorGo.disabled = true;
  el.creatorInput.disabled = true;
  setCreatorStatus(t('creating'), 'working');

  try {
    const wiki = await resolveCustomWiki(raw);
    const url = new URL(wiki.apiUrl);
    const host = url.host + url.pathname.replace('/api.php', '');
    const pack = {
      id: `custom-${host.replace(/\W+/g, '-')}`,
      name: customPackName(raw, wiki.sitename),
      tagline: wiki.sitename,
      icon: 'wand',
      accent: '#a78bfa', accent2: '#4c1d95',
      wiki
    };
    state.customPacks = store.saveCustomPack(pack);

    // Building a pack does NOT hand over a booster: it goes on sale in the
    // Shop, on its own shelf. It used to be free, which was a free openable
    // pack out of thin air for anyone who typed a name.
    renderPacks();
    renderShop();
    setCreatorStatus(t('createdGoShop', { name: pack.name }), 'ok');
    el.creatorInput.value = '';
    synth.playResolved();
  } catch {
    setCreatorStatus(t('createFailed'), 'error');
    synth.playDenied();
  } finally {
    state.busy = false;
    el.creatorGo.disabled = false;
    el.creatorInput.disabled = false;
  }
}

/* --- timed boosters -------------------------------------------------------------------- */

function syncTimed() {
  accrue(state.profile.timed);
  store.saveProfile(state.profile);
  return state.profile.timed;
}

const currentTimedSpec = () => timedSpec(timedLevel(state.profile.timed.opened ?? 0));

/**
 * How much scarcer the top tier is on the timed table. This, not expected
 * value, is the number worth showing: value barely moves because commons
 * dominate it, while an Artifact goes from one in 667 to one in 28,000.
 */
function timedTopScarcity(level) {
  const top = (options) => rarityChances(options).at(-1).chance;
  const timed = top(timedRollOptions(level));
  return timed > 0 ? top({}) / timed : Infinity;
}

/*
 * FREE PACKS
 * ----------------------------------------------------------------------------
 * Rebuilt around the only two things anyone comes to this screen for: how many
 * are waiting, and when the next one lands. The dial answers both at once —
 * the number is the count, the ring is the fill towards the next — and the
 * pips give the cap a shape, so "5 of 7" is something you see before you read.
 *
 * The old screen led with a paragraph of rules and a pack sitting off-centre.
 * The rules are now behind the "?" where rules belong, and the track below
 * says what levelling actually buys, one line per thing it changes, instead of
 * one dense sentence.
 */
function renderTimed() {
  const timed = syncTimed();
  const level = timedLevel(timed.opened ?? 0);
  const cap = maxHeld(level);
  const held = timed.count ?? 0;

  el.timedTitle.textContent = t('tabTimed');
  el.freeCap.textContent = t('freeOf', { max: cap });
  el.freeFoot.textContent = t('freeFoot', {
    cards: TIMED_CARDS, minutes: Math.round(regenMs(level) / 60000)
  });

  // Pips: one per slot the cap allows, filled for what is banked.
  el.freePips.replaceChildren(...Array.from({ length: cap }, (_, i) => {
    const pip = document.createElement('span');
    pip.className = `free-pip${i < held ? ' is-full' : (i === held ? ' is-next' : '')}`;
    return pip;
  }));

  el.timedOpen.textContent = t('timedOpen');
  el.timedOpen.disabled = held <= 0;
  el.timedOpen.onclick = openTimed;

  el.freeTrackLabel.textContent = t('freeTrackLabel');
  const { to } = levelBounds(timed.opened ?? 0);
  const atMax = level >= MAX_TIMED_LEVEL;
  el.trackLevel.textContent = t('freeLevel', { level });
  el.trackRemaining.textContent = atMax
    ? t('freeMaxed')
    : t('timedToNext', { n: to - (timed.opened ?? 0), level: level + 1 });
  trackBar.set(levelProgress(timed.opened ?? 0));

  // What this level buys, one line each, rather than one dense sentence.
  const scarcity = timedTopScarcity(level);
  const perks = [
    ['clock', t('freePerkSpeed', { minutes: Math.round(regenMs(level) / 60000) })],
    ['packs', t('freePerkCap', { max: cap })],
    ['gem', scarcity <= 1.05
      ? t('freePerkOddsMax')
      : t('freePerkOdds', { factor: scarcity >= 10 ? Math.round(scarcity) : scarcity.toFixed(1) })]
  ];
  el.freePerks.replaceChildren(...perks.map(([icon, text]) => {
    const row = document.createElement('div');
    row.className = 'free-perk';
    row.innerHTML = `<span class="free-perk-icon">${iconSvg(icon, { size: 17 })}</span><span></span>`;
    row.querySelector('span:last-child').innerHTML = esc(text).replace(/\*([^*]+)\*/g, '<b>$1</b>');
    return row;
  }));

  el.trackNext.textContent = atMax ? '' : t('timedNextPerks', {
    minutes: Math.round(regenMs(level + 1) / 60000), max: maxHeld(level + 1)
  });
  el.trackNext.hidden = atMax;

  tickTimed();
}

/** The 1 Hz part: the dial and the countdown, only while this screen is up. */
function tickTimed() {
  const timed = state.profile.timed;
  const before = timed.count ?? 0;
  accrue(timed);
  const level = timedLevel(timed.opened ?? 0);
  const cap = maxHeld(level);
  const held = timed.count ?? 0;

  if (held !== before) {
    store.saveProfile(state.profile);
    updateBadges();
    synth.playReady();
    renderTimed();
    return;
  }

  el.freeCount.textContent = String(held);
  el.timedOpen.disabled = held <= 0;

  const left = msToNext(timed);
  if (left === null) {
    freeRing.set(1, '');
    el.freeState.textContent = t('freeFull');
    el.freeState.className = 'free-state is-ready';
  } else {
    // The ring is the fraction of the current interval already elapsed.
    const step = regenMs(level);
    freeRing.set(step > 0 ? 1 - left / step : 0, '');
    el.freeState.textContent = t('freeNextIn', { time: formatCountdown(left) });
    el.freeState.className = `free-state${held > 0 ? ' is-ready' : ''}`;
  }
  el.freeCap.textContent = t('freeOf', { max: cap });
}

function openTimed() {
  const timed = syncTimed();
  if ((timed.count ?? 0) <= 0) { synth.playDenied(); return; }
  const spec = currentTimedSpec();
  // Track progress is credited when the pack produces cards, not here: a
  // failed draw refunds the booster and must not also count as an opening.
  store.addBooster(state.inventory, spec, 1);
  timed.count -= 1;
  if (!Number.isFinite(timed.last)) timed.last = Date.now();
  store.saveProfile(state.profile);
  updateBadges();
  openScreenFor(spec);
}

/* --- shop -------------------------------------------------------------------------------- */

const freeNoteText = () =>
  `${t('freeShelfNote')} ${t('freeAgainIn', { time: formatCountdown(nextFreeAt() - Date.now()) })}`;

/** Which kinds of shelf the filter chips offer, and what each keeps. */
const SHOP_FILTERS = [
  { id: 'all',   key: 'shopAll',   keep: () => true },
  { id: 'free',  key: 'shopFree',  keep: (row) => Boolean(row.free) },
  { id: 'cheap', key: 'shopCheap', keep: (row) => row.specs.some((s) => s.price <= state.wallet) },
  { id: 'big',   key: 'shopBig',   keep: (row) => row.specs.some((s) => s.spec.cards >= 6) }
];

/*
 * THE SHOP
 * ----------------------------------------------------------------------------
 * Rebuilt so that the two things you need before spending anything — what is
 * in your purse and how long this stock lasts — sit above the stock instead of
 * inside a paragraph, and so a shelf item is a labelled card rather than a
 * strip of art with a price under it. You could not previously tell what you
 * were buying without recognising the picture.
 *
 * Filter chips are a plain client-side pass over the generated shelves: the
 * stock itself is still whatever the two-hour window decided, so filtering
 * cannot conjure anything that was not on sale.
 */
function renderShop() {
  el.shopTitle.textContent = t('tabShop');
  el.shopPurseLabel.textContent = t('shopPurse');
  el.shopRestockLabel.textContent = t('shopRestockIn');
  el.shopPurse.innerHTML = money(state.wallet);

  const all = generateShop(windowIndexAt(), state.customPacks, freeWindowAt());
  const filter = SHOP_FILTERS.find((f) => f.id === state.shopFilter) ?? SHOP_FILTERS[0];
  const rows = all.filter(filter.keep);

  el.shopFilter.replaceChildren(...SHOP_FILTERS.map((f) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `shop-chip${f.id === filter.id ? ' is-on' : ''}`;
    chip.textContent = t(f.key);
    press(chip, { sound: null });
    chip.addEventListener('click', () => {
      state.shopFilter = f.id;
      synth.playTab?.(1);
      renderShop();
    });
    return chip;
  }));

  el.shopEmpty.hidden = rows.length > 0;
  if (!rows.length) {
    el.shopEmptyMark.innerHTML = iconSvg('gem', { size: 46 });
    el.shopEmptyText.textContent = t('shopNoMatch');
  }

  el.shopRows.replaceChildren(...rows.map((row) => {
    const section = document.createElement('section');
    section.className = `shop-row${row.free ? ' is-free' : ''}`;
    section.innerHTML = `
      <div class="shop-row-head"><h3></h3><span class="shop-row-tag"></span></div>
      ${row.free ? '<p class="shop-note"></p>' : ''}
      <div class="shelf"></div>`;
    section.querySelector('h3').textContent = row.title;
    // The tag says the one thing the row's title does not: what it costs, or
    // that it is free.
    const prices = row.specs.map((s) => s.price).filter((p) => p > 0);
    section.querySelector('.shop-row-tag').textContent = row.free
      ? t('free')
      : (prices.length ? t('shopFrom', { amount: formatAmount(Math.min(...prices)) }) : '');
    if (row.free) section.querySelector('.shop-note').textContent = freeNoteText();

    const shelf = section.querySelector('.shelf');
    shelf.replaceChildren(...row.specs.map(({ id, spec, price }) => {
      const item = document.createElement('div');
      item.className = 'shop-item';
      item.dataset.spec = id;

      const art = document.createElement('div');
      art.className = 'shop-item-art';
      art.appendChild(buildBooster(spec, { size: 'is-tiny' }));
      item.appendChild(art);

      // Name and size in words, so the shelf can be read rather than decoded.
      const name = document.createElement('p');
      name.className = 'shop-item-name';
      name.textContent = specName(spec);
      item.appendChild(name);

      const meta = document.createElement('p');
      meta.className = 'shop-item-meta';
      const tier = spec.rarityId ? rarityById(spec.rarityId) : null;
      meta.textContent = tier
        ? `${t('shopItemMeta', { n: spec.cards })} · ${tx(tier.name)}`
        : t('shopItemMeta', { n: spec.cards });
      if (tier) meta.style.color = tier.color;
      item.appendChild(meta);

      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = row.free ? 'buy is-free' : 'buy';
      press(buy, { sound: null });
      if (row.free) paintFreeButton(buy, id, spec);
      else {
        buy.classList.toggle('is-poor', price > state.wallet);
        buy.innerHTML = `<span class="buy-label">${t('buy')}</span><span class="buy-price">${money(price)}</span>`;
        buy.addEventListener('click', () => purchase(spec, price, buy));
      }
      item.appendChild(buy);
      return item;
    }));
    return section;
  }));

  reveal(el.shopRows.children, { step: 60 });
  tickRestock();
}

/**
 * The free shelf. Each slot can be taken once per FOUR-hour window, which is
 * what keeps it a safety net rather than an income: come back later and there
 * are two more, but standing in front of it does nothing.
 */
function paintFreeButton(button, id, spec) {
  const available = store.freeAvailable(state.profile, id);
  button.disabled = !available;
  button.classList.toggle('is-taken', !available);
  button.innerHTML = available
    ? `<span class="buy-label">${t('claimFree')}</span><span class="buy-price">${t('free')}</span>`
    : `<span class="buy-label">${t('freeTaken')}</span>`;
  button.onclick = available ? () => takeFree(id, spec, button) : null;
}

function takeFree(id, spec, button) {
  if (!store.freeAvailable(state.profile, id)) return;
  store.markFreeTaken(state.profile, id);
  store.addBooster(state.inventory, spec, 1);
  synth.playPurchase();
  toast(`${t('bought')} ${specName(spec)}`, 'ok');
  paintFreeButton(button, id, spec);
  renderPacks();
}

function purchase(spec, price, button) {
  if (state.wallet < price) {
    synth.playDenied();
    toast(t('cantAfford'), 'error');
    return;
  }
  store.saveWallet(state.wallet - price);
  store.addBooster(state.inventory, spec, 1);
  refreshWallet();
  synth.playPurchase();
  button.classList.add('is-bought');
  setTimeout(() => button.classList.remove('is-bought'), 700);
  toast(`${t('bought')} ${specName(spec)}`, 'ok');
  renderPacks();
}

function tickRestock() {
  const remaining = nextRefreshAt() - Date.now();
  el.restock.textContent = formatCountdown(remaining);
  const note = el.shopRows.querySelector('.shop-row.is-free .shop-note');
  if (note) note.textContent = freeNoteText();
  if (remaining <= 0) { payStipend(); renderShop(); }
}

function payStipend() {
  const paid = store.claimStipend(state.profile, store.loadWallet());
  if (paid > 0) {
    refreshWallet();
    synth.playFanfare();
    toast(t('stipendPaid', { amount: money(paid) }), 'ok');
  }
}

/* --- opening: the burst ------------------------------------------------------------------
 *
 * The pack does not fade out; it ERUPTS. When the tear completes, the bag
 * snaps, a column of the pack's own light stands up out of the mouth, and the
 * subject's particles — checker confetti for F1, pages for Books, stars for
 * Space, whatever packstyle.js says this pack throws — blow outward. Then the
 * cards climb out through the light.
 *
 * All of it is spawned into one layer over the stage and driven by custom
 * properties, so one keyframe animates every subject's language. Battery
 * saver skips the lot.
 */

/** Where the pack's mouth sits, in burst-layer coordinates. */
function mouthPoint(booster) {
  const stage = el.burstLayer.getBoundingClientRect();
  const rect = booster.getBoundingClientRect();
  return { x: rect.left + rect.width / 2 - stage.left, y: rect.top + rect.height * 0.15 - stage.top };
}

/**
 * Throw one round of particles. `style.particles` is the pack's own language;
 * `lift` biases the cone upward (the mouth points up).
 */
function spawnBurst(style, { x, y }, { scale = 1 } = {}) {
  if (settings().lowPower) return;
  const p = style.particles ?? style;
  const frag = document.createDocumentFragment();
  const count = Math.round(p.count * scale);
  for (let i = 0; i < count; i++) {
    const node = document.createElement('div');
    node.className = `pcl pcl-${p.shapes[i % p.shapes.length]}`;
    // A cone pointing up, widened by the pack's own spread.
    const angle = (-90 + (Math.random() - 0.5) * 120 * (p.spread ?? 1)) * (Math.PI / 180);
    const dist = (80 + Math.random() * 230) * scale;
    node.style.setProperty('--x', `${x}px`);
    node.style.setProperty('--y', `${y}px`);
    node.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    node.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
    node.style.setProperty('--g', `${(p.gravity ?? 0.35) * (120 + Math.random() * 180)}px`);
    node.style.setProperty('--rot', `${((Math.random() - 0.5) * 640).toFixed(0)}deg`);
    node.style.setProperty('--dur', `${(0.65 + Math.random() * 0.75).toFixed(2)}s`);
    node.style.setProperty('--delay', `${(Math.random() * 0.12).toFixed(2)}s`);
    node.style.setProperty('--size', String(Math.round(6 + Math.random() * 9)));
    node.style.setProperty('--c', p.colors[i % p.colors.length]);
    node.addEventListener('animationend', () => node.remove(), { once: true });
    frag.appendChild(node);
  }
  el.burstLayer.appendChild(frag);
}

/** The column of light standing up out of the mouth. */
function raiseBeam(booster, accent) {
  if (settings().lowPower) return;
  const stage = el.burstLayer.getBoundingClientRect();
  const rect = booster.getBoundingClientRect();
  const beam = document.createElement('div');
  beam.className = 'mouth-beam';
  beam.style.setProperty('--accent', accent);
  beam.style.left = `${rect.left + rect.width * 0.22 - stage.left}px`;
  beam.style.width = `${rect.width * 0.56}px`;
  beam.style.bottom = `${stage.bottom - rect.top - rect.height * 0.16}px`;
  beam.style.height = `${Math.min(rect.top - stage.top + rect.height * 0.16, stage.height * 0.6)}px`;
  beam.addEventListener('animationend', () => beam.remove(), { once: true });
  el.burstLayer.appendChild(beam);
}

/** The whole eruption: snap, light, particles, tinted flash. */
function eruptPack(booster) {
  const style = styleForSpec(state.spec);
  booster.classList.add('is-bursting');
  booster.addEventListener('animationend', function done(e) {
    if (e.animationName !== 'pack-burst') return;
    booster.removeEventListener('animationend', done);
    booster.classList.remove('is-bursting');
  });
  raiseBeam(booster, style.accent);
  spawnBurst(style, mouthPoint(booster));
  el.flash.style.setProperty('--flash-tint', style.accent);
  fireFlash(0.34);
}

/* --- opening: the rip ---------------------------------------------------------------------- */

const rip = {
  // Where the tear actually is (what is painted) and where the finger is
  // asking it to be. They differ: the tear chases the finger through a
  // spring, and snags in the foil hold it back until they pop.
  progress: 0, target: 0, vel: 0,
  // Weak spots in the seam. Each { at, give, popped }: the tear catches at
  // `at` until the finger has pulled `give` past it.
  snags: [],
  raf: 0,
  dragging: false, lastTick: 0, done: false,
  booster: null, zone: null,
  // The teardown for the drag currently in flight, if any. See endRipDrag().
  release: null
};

/**
 * Abandon whatever drag the rip thinks is in progress.
 *
 * Called before starting a new one and whenever a booster is set up, so a
 * gesture the system swallowed (no pointerup ever arrives) cannot leave
 * listeners behind that fight with the next finger.
 */
function endRipDrag() {
  rip.release?.();
  rip.release = null;
  rip.dragging = false;
}

function paintRip() {
  const dir = state.ripDir || 1;
  const pct = rip.progress * 100;
  const tear = rip.booster?.querySelector('.booster-tear');
  if (!tear) return;
  const clip = dir > 0 ? `inset(0 0 0 ${pct}%)` : `inset(0 ${pct}% 0 0)`;
  tear.style.clipPath = clip;
  const front = rip.booster.querySelector('.rip-front');
  if (front) {
    front.style.left = `${dir > 0 ? pct : 100 - pct}%`;
    front.style.opacity = rip.progress > 0.02 && rip.progress < 0.99 ? '1' : '0';
  }
  rip.zone?.setAttribute('aria-valuenow', String(Math.round(pct)));
}

function applyRipProgress(progress) {
  rip.progress = clamp01(progress);
  paintRip();
  if (Math.abs(rip.progress - rip.lastTick) >= RIP_TICK_STEP) {
    rip.lastTick = rip.progress;
    synth.playRipTick(rip.progress);
  }
}

/** Authoritative set: target and tear move together, no spring in between. */
function setRip(progress) {
  rip.target = clamp01(progress);
  rip.vel = 0;
  applyRipProgress(progress);
}

/**
 * The tear chasing the finger, one frame at a time.
 *
 * The finger writes rip.target; this spring drags rip.progress after it. On
 * the way it catches on each unpopped snag: progress holds at the snag while
 * the finger keeps going, strain builds (the pack tilts and lifts — CSS reads
 * --shear/--strain off the booster), and once the finger is far enough past,
 * the snag pops, the spring gets a kick, and the tear leaps forward. That
 * catch-and-release is the whole feel of the thing.
 */
function ripFrame(now) {
  rip.raf = 0;
  const booster = rip.booster;
  if (!booster) return;
  const dt = Math.min(0.032, (now - (rip.frameAt || now)) / 1000 || 0.016);
  rip.frameAt = now;

  // Where the spring is allowed to go: the finger, unless a snag is in the way.
  let goal = rip.target;
  const snag = rip.snags.find((s) => !s.popped && rip.target > s.at);
  if (snag) {
    if (rip.target >= snag.at + snag.give) {
      snag.popped = true;
      synth.playSnagPop(snag.at);
      rip.vel += 2.6;                    // the weld lets go: the tear leaps
    } else {
      goal = snag.at;
    }
  }

  // Slightly underdamped, so a pop overshoots a hair before settling.
  rip.vel += (goal - rip.progress) * 190 * dt;
  rip.vel *= Math.exp(-16 * dt);
  applyRipProgress(rip.progress + rip.vel * dt);

  // Strain: how hard the finger is pulling against whatever is holding on.
  const strain = clamp01((rip.target - rip.progress) * 4);
  const dir = state.ripDir || 1;
  booster.style.setProperty('--strain', strain.toFixed(3));
  booster.style.setProperty('--shear', (dir * strain * 2.2).toFixed(3));

  const settled = !rip.dragging
    && Math.abs(rip.vel) < 0.01 && Math.abs(goal - rip.progress) < 0.002;
  if (!settled) rip.raf = requestAnimationFrame(ripFrame);
}

function startRipLoop() {
  if (rip.raf) return;
  rip.frameAt = 0;
  rip.raf = requestAnimationFrame(ripFrame);
}

function stopRipLoop() {
  if (rip.raf) cancelAnimationFrame(rip.raf);
  rip.raf = 0;
  rip.booster?.style.removeProperty('--strain');
  rip.booster?.style.removeProperty('--shear');
}

function animateRip(from, to, duration) {
  const start = performance.now();
  return new Promise((resolve) => {
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      setRip(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

function lockRipDirection(dx) {
  if (state.ripDir) return;
  state.ripDir = dx > 0 ? 1 : -1;
  try { localStorage.setItem(RIP_DIR_KEY, String(state.ripDir)); } catch { /* not fatal */ }
  if (rip.booster) rip.booster.dataset.ripDir = String(state.ripDir);
}

/**
 * Every pack tears differently: a few weak welds along the seam, never in
 * the same places. Kept clear of the start (the first pull should always
 * bite) and of the commit point (the last stretch is a clean run).
 */
function rollSnags() {
  const count = 3 + Math.floor(Math.random() * 3);
  const lane = (0.55 - 0.1) / count;
  return Array.from({ length: count }, (_, i) => ({
    at: 0.1 + lane * (i + 0.2 + Math.random() * 0.6),
    give: 0.045 + Math.random() * 0.035,
    popped: false
  }));
}

function initRip(booster) {
  endRipDrag();
  stopRipLoop();
  rip.booster = booster;
  rip.zone = booster.querySelector('.rip-zone');
  rip.progress = 0; rip.target = 0; rip.vel = 0;
  rip.lastTick = 0; rip.done = false;
  rip.snags = rollSnags();
  paintRip();

  const zone = rip.zone;
  if (!zone) return;

  zone.addEventListener('pointerdown', (event) => {
    if (rip.done) return;
    endRipDrag();                       // drop any gesture that never ended
    rip.dragging = true;
    rip.lastTick = rip.progress;
    booster.classList.add('is-tearing');
    synth.resume();
    event.preventDefault();

    rip.release = trackDrag(event, {
      onMove: (dx) => {
        if (!rip.dragging || Math.abs(dx) < RIP_LOCK_SLOP) return;
        lockRipDirection(dx);
        const span = Math.max(120, zone.getBoundingClientRect().width * 0.72);
        rip.target = clamp01((dx * state.ripDir) / span);
        startRipLoop();
      },
      onEnd: async () => {
        if (!rip.dragging) return;
        rip.dragging = false;
        rip.release = null;
        stopRipLoop();
        booster.classList.remove('is-tearing');
        // The finger decides, not the lagging tear: if it was pulled past the
        // commit point, the pack opens even while the spring is still catching
        // up (or held on a snag it would have popped anyway).
        if (rip.target >= RIP_COMMIT) completeRip();
        else if (rip.progress > 0.01) {
          await animateRip(rip.progress, 0, 300);
          synth.playRipTick(0.35);
        } else {
          setRip(0);
        }
      }
    });
  });

  zone.addEventListener('keydown', (event) => {
    if (rip.done) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      lockRipDirection(event.key === 'ArrowRight' ? 1 : -1);
      setRip(rip.progress + 0.14);
      if (rip.progress >= RIP_COMMIT) completeRip();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      lockRipDirection(1);
      completeRip();
    }
  });
}

/** The torn-off piece, which tumbles away rather than fading out. */
function dropScrap(booster) {
  const dir = state.ripDir || 1;
  const stage = el.burstLayer.getBoundingClientRect();
  const rect = booster.getBoundingClientRect();
  const scrap = document.createElement('div');
  scrap.className = 'tear-scrap';
  // Spawned into the stage layer, not the bag: the bag's serrated clip-path
  // would cut the scrap off the moment it left the silhouette.
  scrap.style.left = `${rect.left - stage.left}px`;
  scrap.style.top = `${rect.top - stage.top}px`;
  scrap.style.width = `${rect.width}px`;
  scrap.style.height = `${rect.height * 0.15}px`;
  scrap.style.setProperty('--accent', styleForSpec(state.spec).accent);
  scrap.style.setProperty('--holo', styleForSpec(state.spec).holo);
  scrap.style.setProperty('--drift', `${dir * (70 + Math.random() * 50)}px`);
  scrap.style.setProperty('--spin', `${dir * (150 + Math.random() * 120)}deg`);
  el.burstLayer.appendChild(scrap);
  scrap.addEventListener('animationend', () => scrap.remove(), { once: true });
}

async function completeRip() {
  if (rip.done) return;
  rip.done = true;
  stopRipLoop();
  const booster = rip.booster;
  await animateRip(rip.progress, 1, 220);
  synth.playRip();
  booster.classList.add('is-open');
  dropScrap(booster);

  // If the open does not take, put the pack back the way it was rather than
  // leaving a torn booster that no longer answers to anything. openPack() is
  // awaited so a failure inside it lands here instead of becoming an unhandled
  // rejection nobody sees.
  let opened = false;
  try {
    opened = await openPack(booster);
  } catch (error) {
    console.error('opening failed', error);
  }
  if (!opened) {
    rip.done = false;
    booster.classList.remove('is-open');
    setRip(0);
  }
}

/* --- opening: drawing ------------------------------------------------------------------------ */

function schedulePrefetch(spec) {
  clearTimeout(state.prefetchTimer);
  const id = specId(spec);
  if (state.prefetch?.id === id) return;
  state.prefetchTimer = setTimeout(() => {
    state.prefetch = { id, promise: drawArticles(toDrawPack(spec)).catch((error) => ({ error })) };
  }, PREFETCH_DELAY);
}

function drawFor(spec) {
  const id = specId(spec);
  if (state.prefetch?.id === id) {
    const { promise } = state.prefetch;
    state.prefetch = null;
    return promise;
  }
  return drawArticles(toDrawPack(spec)).catch((error) => ({ error }));
}

const homeTabFor = (spec) =>
  spec?.kind === 'timed' ? 'timed' : 'packs';

function openScreenFor(spec) {
  state.spec = spec;
  synth.resume();

  el.openScreen.className = 'screen is-active phase-idle';
  el.openTitle.textContent = specName(spec);
  el.openProgress.textContent = '';
  el.openHint.textContent = t('slideToRip');
  el.openHint.className = 'open-hint';
  el.summary.replaceChildren();
  el.openDone.hidden = true;
  el.cardStack.replaceChildren();
  state.pulls = []; state.cards = []; state.index = 0; state.seen = new Set();

  if (spec.kind === 'custom') state.packMode = 'custom';

  const booster = buildBooster(spec, { interactive: true, size: 'is-hero' });
  booster.classList.add('is-idle');
  el.boosterSlot.replaceChildren(booster);
  initRip(booster);

  schedulePrefetch(spec);
  showScreen('open');
}

/**
 * Open the torn pack. Returns whether it actually opened.
 *
 * The whole body runs inside a try/finally for one reason: `state.busy` used
 * to be cleared on the happy path and on the one handled error, so ANY other
 * throw left it set for the rest of the session. Nothing clears it again, and
 * every later open returns at the guard above — so no booster could be opened
 * at all until the app was restarted, with the tear itself silently doing
 * nothing. A flag that gates the whole feature has to be released by the
 * language, not by remembering to.
 */
async function openPack(booster) {
  if (state.busy) return false;
  state.busy = true;
  try {
    // A seam for the test that proves the invariant above: a throw from
    // anywhere in here must still release the flag and leave the pack
    // openable. Without it the regression is only reachable by a real crash,
    // which is exactly the thing that is hard to arrange on purpose.
    if (debug.failNextOpen) { debug.failNextOpen = false; throw new Error('debug: forced open failure'); }
    return await runOpen(booster);
  } finally {
    state.busy = false;
  }
}

async function runOpen(booster) {
  clearTimeout(state.prefetchTimer);

  if (!store.takeBooster(state.inventory, specId(state.spec))) return false;
  renderPacks();

  const drawing = drawFor(state.spec);

  // The animation runs on card BACKS, which need no data, so it starts the
  // instant the pack tears and the fetch happens underneath it.
  el.openScreen.classList.replace('phase-idle', 'phase-opening');
  el.openHint.textContent = '';
  booster.classList.remove('is-idle');

  // The eruption: snap, light column, the subject's own particles.
  eruptPack(booster);
  await wait(190);

  const count = state.spec.cards;
  state.cards = Array.from({ length: count }, (_, i) => buildPlaceholderCard(i, count));
  el.cardStack.replaceChildren(...state.cards);
  state.cards.forEach((card, i) => {
    // The fountain fans out: cards alternate left and right of the mouth,
    // each with its own throw and twist, then flock back into the stack.
    const side = i % 2 ? 1 : -1;
    card.style.setProperty('--spin', `${(side * (10 + Math.random() * 16)).toFixed(1)}deg`);
    card.style.setProperty('--sway', `${(side * (30 + Math.random() * 46)).toFixed(0)}px`);
    card.style.setProperty('--apex', `${-(30 + Math.random() * 14).toFixed(0)}%`);
    card.style.animationDelay = `${i * EMERGE_STAGGER}ms`;
    card.classList.add('is-emerging');
    card.addEventListener('animationend', function done(event) {
      if (event.target !== card || event.animationName !== 'card-emerge') return;
      card.removeEventListener('animationend', done);
      card.classList.remove('is-emerging');
    });
  });

  await wait(EMERGE_STAGGER * 2);
  booster.classList.add('is-leaving');

  const [articles] = await Promise.all([
    drawing,
    wait(EMERGE_DURATION + EMERGE_STAGGER * (count - 1))
  ]);

  if (!articles || articles.error) {
    // Refund: the booster was consumed but produced nothing.
    store.addBooster(state.inventory, state.spec, 1);
    renderPacks();
    el.openScreen.className = 'screen is-active phase-idle';
    el.openHint.textContent = t('openFailed', { error: articles?.error?.message ?? 'Network error' });
    el.openHint.className = 'open-hint is-error';
    el.cardStack.replaceChildren();
    const fresh = buildBooster(state.spec, { interactive: true, size: 'is-hero' });
    fresh.classList.add('is-idle');
    el.boosterSlot.replaceChildren(fresh);
    initRip(fresh);
    return false;
  }

  const options = rollOptionsFor(state.spec);
  const colours = specColours(state.spec);
  // Random order: a Legendary can come first and a Common last.
  const pulls = shuffle(articles.map((article) => {
    const rarity = rollRarity(options);
    return {
      article, rarity,
      price: priceFor(article.popularity, rarity),
      packName: specName(state.spec),
      packIcon: specIcon(state.spec),
      packAccent: colours.accent
    };
  }));

  const recorded = store.recordPulls(state.collection, pulls, state.spec);
  pulls.forEach((pull, i) => { pull.entry = recorded[i].entry; });

  store.recordOpening(state.profile, pulls);
  if (state.spec.kind === 'timed') {
    state.profile.timed.opened = (state.profile.timed.opened ?? 0) + 1;
    store.saveProfile(state.profile);
  }
  awardXp(pulls);
  updateBadges();

  state.pulls = pulls;
  bindCards(pulls);
  el.openScreen.classList.replace('phase-opening', 'phase-reveal');
  state.index = 0;
  layoutDeck();
  revealCurrent();
  return true;
}

/* --- cards --------------------------------------------------------------------------------- */

const CARD_FRONT_MARKUP = `
  <div class="fx fx-a" aria-hidden="true"></div>
  <div class="fx-c" aria-hidden="true"></div>
  <div class="fx-art" aria-hidden="true"></div>
  <div class="card-art"></div>
  <button class="fav-button" type="button" aria-pressed="false"></button>
  <div class="card-body">
    <h3 class="card-title"></h3>
    <p class="card-desc"></p>
    <p class="card-extract"></p>
  </div>
  <div class="card-stats"><span class="card-price"></span><span class="card-views"></span></div>
  <div class="card-footer"><span class="rarity-badge"></span></div>
  <div class="fx fx-b" aria-hidden="true"></div>
  <div class="fx-ring" aria-hidden="true"></div>`;

/**
 * A face-down card. The back takes the booster's colour and icon so a card
 * looks like it came from the pack it came from, but it carries no rarity, so
 * nothing here can give the pull away.
 */
function buildPlaceholderCard(index, total) {
  const card = document.createElement('div');
  card.className = 'card stack-card';
  card.style.zIndex = String(total - index);
  const inner = document.createElement('div');
  inner.className = 'card-inner';
  inner.appendChild(buildCardBack(state.spec));
  const front = document.createElement('div');
  front.className = 'card-face card-front';
  front.innerHTML = CARD_FRONT_MARKUP;
  inner.appendChild(front);
  card.appendChild(inner);
  return card;
}

function applyRarityVars(node, rarity) {
  node.dataset.rarity = rarity.id;
  node.style.setProperty('--rarity', rarity.color);
  node.style.setProperty('--rarity-glow', rarity.glow);
}

function fillFront(front, data, rarity) {
  const art = front.querySelector('.card-art');
  art.replaceChildren();
  const fallback = () => art.insertAdjacentHTML('afterbegin',
    `<div class="card-art-fallback">${iconSvg(data.packIcon ?? 'packs', { size: 38 })}</div>`);

  if (data.thumbnail) {
    const img = document.createElement('img');
    img.src = data.thumbnail;
    img.alt = '';
    img.addEventListener('error', () => { img.remove(); fallback(); });
    // Fit a picture smaller than its frame rather than magnifying it.
    img.addEventListener('load', () => {
      if (img.naturalWidth && img.naturalWidth < 220) art.classList.add('is-small-art');
    });
    art.appendChild(img);
  } else {
    fallback();
  }

  front.querySelector('.card-title').textContent = data.title;
  front.querySelector('.card-desc').textContent = data.description || data.sourceName || '';
  front.querySelector('.card-extract').textContent = data.extract;
  front.querySelector('.rarity-badge').textContent = tx(rarity.name);
  front.querySelector('.card-price').innerHTML = money(data.price);
  front.querySelector('.card-views').textContent =
    data.views ? t('viewsPerMonth', { views: formatViews(data.views) }) : bandFor(data.popularity ?? 0).name;
}

function wireFavButton(button, entryKey) {
  const paint = () => {
    const on = Boolean(state.collection.entries[entryKey]?.favorite);
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', t('favourites'));
    button.innerHTML = iconSvg(on ? 'starFilled' : 'star', { size: 16 });
  };
  paint();
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    store.toggleFavorite(state.collection, entryKey);
    paint();
    synth.playTap();
    if (state.tab === 'binder') renderBinder();
  });
}

/** Attach the drawn data. Rarity is only set here, on the hidden front face. */
function bindCards(pulls) {
  state.cards.forEach((card, i) => {
    const pull = pulls[i];
    if (!pull) return;
    applyRarityVars(card, pull.rarity);
    const front = card.querySelector('.card-front');
    const data = { ...pull.article, price: pull.price, packIcon: pull.packIcon };
    fillFront(front, data, pull.rarity);
    wireFavButton(front.querySelector('.fav-button'), pull.article.key);
    card.addEventListener('click', () => {
      if (!card.classList.contains('is-revealed')) return;
      openCardDetail(pull.article.key, data, pull.rarity);
    });
  });
}

/* --- reveal ---------------------------------------------------------------------------------- */

/** A held card only leans: it turns on its own axes rather than travelling. */
function layoutDeck(tiltX = 0, tiltY = 0) {
  state.cards.forEach((card, i) => {
    const offset = i - state.index;
    if (offset < 0) {
      card.style.zIndex = String(100 + offset);
      card.style.transform = 'translateX(128%) rotate(13deg) scale(0.94)';
      card.style.opacity = '0';
      return;
    }
    const depth = Math.min(3, offset);
    card.style.zIndex = String(50 - offset);
    card.style.opacity = '1';
    const lean = offset === 0 ? `rotateY(${tiltX}deg) rotateX(${tiltY}deg)` : '';
    card.style.transform =
      `translate(${depth * 5}px, ${depth * 9}px) rotate(${depth * 1.3}deg) ` +
      `scale(${(1 - depth * 0.04).toFixed(3)}) ${lean}`;
  });
}

async function revealCurrent() {
  const card = state.cards[state.index];
  const pull = state.pulls[state.index];
  if (!card || !pull) return;

  el.openProgress.textContent = t('cardOf', {
    i: Math.min(state.index + 1, state.pulls.length), n: state.pulls.length
  });
  const isNew = !state.seen.has(state.index);
  card.classList.add('is-revealed', 'is-lit');

  if (isNew) {
    state.seen.add(state.index);
    synth.playReveal(rarityRank(pull.rarity.id));
    if (pull.rarity.flash > 0) {
      el.flash.style.setProperty('--flash-tint', pull.rarity.color);
      fireFlash(pull.rarity.flash);
    }
    // Legendary and above: the card announces itself.
    if (rarityRank(pull.rarity.id) >= 4) {
      const stage = el.burstLayer.getBoundingClientRect();
      const rect = card.getBoundingClientRect();
      spawnBurst(rarityBurst(pull.rarity), {
        x: rect.left + rect.width / 2 - stage.left,
        y: rect.top + rect.height / 2 - stage.top
      }, { scale: 0.8 + rarityRank(pull.rarity.id) * 0.16 });
    }
  }

  if (state.seen.size >= state.pulls.length) {
    // The last card is the one you most want to look at, and the summary used
    // to take it away almost immediately. Hold it, and let a swipe move on
    // early for anyone who has already seen enough.
    el.openHint.textContent = t('swipeToSummary');
    clearTimeout(state.summaryTimer);
    state.summaryTimer = setTimeout(() => {
      if (state.seen.size >= state.pulls.length) showSummary();
    }, LAST_CARD_HOLD);
  } else {
    el.openHint.textContent = state.index === 0 ? t('swipeToReveal') : t('swipeEitherWay');
  }
}

function goTo(index) {
  const last = state.pulls.length - 1;
  // Swiping past the last card, once every card has been turned, is how you
  // ask for the summary before the hold is up.
  if (index > last && state.seen.size >= state.pulls.length) { showSummary(); return; }
  const next = clamp(index, 0, last);
  if (next === state.index) { layoutDeck(); return; }
  state.index = next;
  layoutDeck();
  synth.playFlip();
  revealCurrent();
}

function showSummary() {
  if (el.openScreen.classList.contains('phase-summary')) return;
  clearTimeout(state.summaryTimer);
  el.summary.replaceChildren(...state.pulls.map((pull) => {
    const data = { ...pull.article, price: pull.price, packIcon: pull.packIcon };
    return buildStaticCard(data, pull.rarity, pull.article.key);
  }));
  reveal(el.summary.children, { step: 70, from: 20 });
  el.openScreen.classList.replace('phase-reveal', 'phase-summary');
  el.openProgress.textContent = t('packSummary', { n: state.pulls.length });
  el.openHint.textContent = t('packDone');
  el.openDone.textContent = t('back');
  el.openDone.hidden = false;
  setTimeout(drainLevelUps, 700);
}

function initSwipe() {
  el.cardStack.addEventListener('pointerdown', (event) => {
    if (!el.openScreen.classList.contains('phase-reveal') || !state.cards.length) return;
    const card = state.cards[state.index];
    card?.classList.add('is-dragging');
    synth.resume();

    trackDrag(event, {
      onMove: (dx, dy) => layoutDeck(
        clamp(dx * 0.14, -TILT_MAX, TILT_MAX),
        clamp(-dy * 0.14, -TILT_MAX, TILT_MAX)
      ),
      onEnd: (dx) => {
        card?.classList.remove('is-dragging');
        if (dx <= -SWIPE_COMMIT) goTo(state.index + 1);
        else if (dx >= SWIPE_COMMIT) goTo(state.index - 1);
        else layoutDeck();
      }
    });
  });

  document.addEventListener('keydown', (event) => {
    if (!el.openScreen.classList.contains('phase-reveal')) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); goTo(state.index + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(state.index - 1); }
  });
}

function fireFlash(intensity, tint = null) {
  if (!settings().flash) return;
  el.flash.style.setProperty('--flash-peak', String(intensity));
  if (tint) el.flash.style.setProperty('--flash-tint', tint);
  el.flash.classList.remove('is-firing');
  void el.flash.offsetWidth;
  el.flash.classList.add('is-firing');
}

/* --- experience and levels ---------------------------------------------------------------------- */

function awardXp(pulls) {
  const gained = pulls.reduce((sum, pull) => sum + xpForCard(pull.rarity.id), 0);
  const levels = addXp(state.profile.progress, gained);
  if (levels.length) state.profile.pendingLevels.push(...levels);
  store.saveProfile(state.profile);
  showXpPop(gained);
  refreshLevelBadge();
}

let xpPopTimer = null;
function showXpPop(amount) {
  if (amount <= 0) return;
  synth.playXp();
  el.xpPop.textContent = t('xpGained', { n: amount.toLocaleString() });
  el.xpPop.hidden = false;
  el.xpPop.classList.remove('is-rising');
  void el.xpPop.offsetWidth;
  el.xpPop.classList.add('is-rising');
  clearTimeout(xpPopTimer);
  xpPopTimer = setTimeout(() => {
    el.xpPop.classList.remove('is-rising');
    el.xpPop.hidden = true;
  }, 1500);
}

/** Show the next queued level-up, if any. Called once the pack is finished. */
function drainLevelUps() {
  const level = state.profile.pendingLevels[0];
  if (level == null) return false;
  showLevelUp(level);
  return true;
}

function rewardCard(reward, { art = true } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'reward-card';
  // The profile's "next reward" line shows the name alone: a thumbnail-sized
  // pack render reads as clutter there. The level-up sheet keeps the art.
  if (reward.spec && art) {
    const artBox = document.createElement('div');
    artBox.appendChild(buildBooster(reward.spec, { size: 'is-tiny' }));
    wrap.appendChild(artBox);
  }
  const label = document.createElement('p');
  label.className = 'reward-label';
  if (reward.type === 'both') label.innerHTML = t('rewardBoth', { amount: money(reward.coins) });
  else if (reward.coins) label.innerHTML = t('rewardCoins', { amount: money(reward.coins) });
  else label.textContent = specName(reward.spec);
  wrap.appendChild(label);
  return wrap;
}

function showLevelUp(level) {
  const reward = rewardForLevel(level);
  const rank = rankFor(level);

  openSheet(t('levelUpTitle'), (body) => {
    body.innerHTML = `
      <div class="level-jump">
        <span class="level-node"></span>
        <span class="level-bar"></span>
        <span class="level-node is-new"></span>
      </div>
      <p style="text-align:center"></p>
      <div class="level-reward" style="margin:16px 0 18px"></div>
      <button class="btn btn-primary btn-block" type="button"></button>`;

    body.querySelector('.level-node').textContent = String(level - 1);
    body.querySelector('.level-node.is-new').textContent = String(level);
    body.querySelector('p').textContent = t('levelUpBody', { level, rank: tx(rank.name) });
    body.querySelector('.level-reward').appendChild(rewardCard(reward));

    const bar = new Bar(body.querySelector('.level-bar'));
    bar.set(0, { animate: false });
    requestAnimationFrame(() => bar.set(1));

    const claim = body.querySelector('button');
    claim.textContent = t('claimReward');
    press(claim, { sound: null });
    claim.addEventListener('click', () => claimLevel(level, reward));
  }, { dismissible: false });

  synth.playLevelUp();
}

function claimLevel(level, reward) {
  if (reward.coins) store.saveWallet(store.loadWallet() + reward.coins);
  if (reward.spec) store.addBooster(state.inventory, reward.spec, 1);

  state.profile.pendingLevels = state.profile.pendingLevels.filter((l) => l !== level);
  store.saveProfile(state.profile);
  refreshWallet();
  refreshLevelBadge();
  renderPacks();
  synth.playCoins();
  sheet.hide({ silent: true, force: true });

  // More than one level at once is possible on a very good pack.
  setTimeout(() => {
    if (!drainLevelUps() && state.tab === 'profile') renderProfile();
  }, dur(360));
}

/* --- the sheet ------------------------------------------------------------------------------------ */

/**
 * Every panel in the app is this one component: the wallet, the odds, the
 * card, the filters, the daily board, a level-up. One sheet means one set of
 * gestures, one entrance, one dismissal, and no dialog anywhere that behaves
 * unlike the others.
 */
function openSheet(title, build, { dismissible = true, onClose = null } = {}) {
  el.sheetTitle.textContent = title;
  el.sheetClose.hidden = !dismissible;
  el.sheetBody.replaceChildren();
  build(el.sheetBody);
  sheet.show(onClose, { locked: !dismissible });
  el.sheet.classList.toggle('is-locked', !dismissible);
}

/* --- card detail ---------------------------------------------------------------------------------- */

/** A face-up card with no back and no flip: summary, binder and detail. */
function buildStaticCard(data, rarity, entryKey = null, { fav = true, lit = false } = {}) {
  // `lit` runs the tier's animations. Only the one card you are actually
  // looking at (reveal, detail) earns it — a binder page of forty lit cards
  // is forty looping animations and a hot phone.
  const card = document.createElement('article');
  card.className = `card is-revealed${lit ? ' is-lit' : ''}`;
  applyRarityVars(card, rarity);
  card.innerHTML = `<div class="card-inner"><div class="card-face card-front">${CARD_FRONT_MARKUP}</div></div>`;
  const front = card.querySelector('.card-front');
  fillFront(front, data, rarity);
  const favButton = front.querySelector('.fav-button');
  if (fav && entryKey) wireFavButton(favButton, entryKey);
  else favButton.remove();
  if (entryKey) card.addEventListener('click', () => openCardDetail(entryKey, data, rarity));
  return card;
}

/**
 * The fullscreen card. There is exactly one of these, reached three ways: off
 * the reveal stack, off the pack summary, and out of the binder. They must
 * stay the same view, so they all come through here.
 */
function openCardDetail(entryKey, data, rarity) {
  const entry = state.collection.entries[entryKey] ?? null;
  state.detail = { key: entryKey, data, rarity, sellArmed: false };

  openSheet(data.title, (body) => {
    // The detail IS the card, blown up: same frame, same tier treatment,
    // with the full text and the actions living inside it — not a small
    // card floating over a separate description.
    const card = document.createElement('article');
    card.className = 'card giant-card is-revealed is-lit';
    applyRarityVars(card, rarity);
    card.innerHTML = `
      <div class="card-inner">
        <div class="card-face card-front">
          <div class="fx fx-a" aria-hidden="true"></div>
          <div class="fx-c" aria-hidden="true"></div>
          <div class="fx-art" aria-hidden="true"></div>
          <div class="card-art"></div>
          <div class="card-body">
            <h3 class="card-title"></h3>
            <p class="card-desc"></p>
            <div class="detail-facts giant-facts"></div>
            <p class="giant-extract selectable"></p>
          </div>
          <div class="card-stats">
            <span class="card-price"></span><span class="card-views"></span>
          </div>
          <div class="giant-actions">
            <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer"></a>
            <button class="btn btn-ghost btn-sm sell" type="button" hidden></button>
          </div>
          <div class="fx fx-b" aria-hidden="true"></div>
          <div class="fx-ring" aria-hidden="true"></div>
        </div>
      </div>`;
    body.appendChild(card);

    const art = card.querySelector('.card-art');
    if (data.thumbnail) {
      const img = document.createElement('img');
      img.src = data.thumbnail;
      img.alt = '';
      img.addEventListener('error', () => { img.remove(); art.insertAdjacentHTML('afterbegin',
        `<div class="card-art-fallback">${iconSvg(data.packIcon ?? 'packs', { size: 54 })}</div>`); });
      art.appendChild(img);
    } else {
      art.innerHTML = `<div class="card-art-fallback">${iconSvg(data.packIcon ?? 'packs', { size: 54 })}</div>`;
    }

    card.querySelector('.card-title').textContent = data.title;
    card.querySelector('.card-desc').textContent = data.description || data.sourceName || '';
    card.querySelector('.giant-extract').textContent = data.extract;
    card.querySelector('.card-price').innerHTML = money(data.price);
    card.querySelector('.card-views').textContent =
      data.views ? t('viewsPerMonth', { views: formatViews(data.views) }) : '';
    card.querySelector('.giant-facts').innerHTML = [
      `<span class="chip" style="color:${rarity.color};border-color:${rarity.color}">${tx(rarity.name)}</span>`,
      entry && entry.count > 1 ? `<span class="chip">${t('copiesOwned', { n: entry.count })}</span>` : ''
    ].filter(Boolean).join('');

    const read = card.querySelector('a');
    read.href = data.url;
    read.textContent = t('read');
    press(read, { sound: null });

    // Selling only makes sense for a card actually in the binder.
    const sell = card.querySelector('.sell');
    sell.hidden = !entry;
    if (entry) {
      state.detail.sellButton = sell;
      paintSellButton();
      press(sell, { sound: null });
      sell.addEventListener('click', handleSell);
    }
  }, { onClose: () => { state.detail = null; } });

  synth.playCardOpen();
}

function paintSellButton() {
  const detail = state.detail;
  if (!detail?.sellButton) return;
  const entry = state.collection.entries[detail.key];
  if (!entry) { detail.sellButton.hidden = true; return; }
  const amount = sellPriceFor(entry.price);
  detail.sellButton.classList.toggle('btn-danger', detail.sellArmed);
  detail.sellButton.classList.toggle('is-armed', detail.sellArmed);
  detail.sellButton.innerHTML = detail.sellArmed ? t('sellConfirm') : t('sell', { amount: money(amount) });
}

function handleSell() {
  const detail = state.detail;
  if (!detail) return;
  const entry = state.collection.entries[detail.key];
  if (!entry) return;

  // First tap arms, second confirms: the button is its own dialog.
  if (!detail.sellArmed) {
    detail.sellArmed = true;
    paintSellButton();
    synth.playArm();
    setTimeout(() => {
      if (state.detail === detail && detail.sellArmed) {
        detail.sellArmed = false;
        paintSellButton();
      }
    }, 4000);
    return;
  }

  const amount = sellPriceFor(entry.price);
  store.sellCopy(state.collection, detail.key);
  store.saveWallet(store.loadWallet() + amount);
  refreshWallet();
  updateBadges();
  synth.playCoins();
  toast(t('sold', { amount: money(amount) }), 'ok');
  sheet.hide();
  renderBinder();
}

/** Hold and move to lean the card: it turns on its axes, it does not travel. */
function attachTilt(card) {
  card.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    card.classList.add('is-tilting');
    trackDrag(event, {
      onMove: (dx, dy) => {
        card.style.transform =
          `rotateY(${clamp(dx * 0.16, -TILT_MAX, TILT_MAX)}deg) ` +
          `rotateX(${clamp(-dy * 0.16, -TILT_MAX, TILT_MAX)}deg)`;
      },
      onEnd: () => {
        card.classList.remove('is-tilting');
        card.style.transform = '';
      }
    });
  });
}

/* --- binder ------------------------------------------------------------------------------------------ */

const option = (value, label) => {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  return opt;
};

function activeFilterCount() {
  const f = state.filters;
  return [f.search, f.pack, f.rarity, f.band, f.minPrice].filter(Boolean).length
    + (f.favoritesOnly ? 1 : 0) + (f.sort !== 'recent' ? 1 : 0);
}

/*
 * The collection is a shelf of albums. renderBinder paints whichever of the
 * two views is live: the shelf, or one open book.
 */
function renderBinder() {
  if (state.album) return renderAlbum();

  el.binderTitle.textContent = t('tabCollection');
  el.albumView.hidden = true;
  el.albumShelf.hidden = false;
  el.binderStats.hidden = false;

  const entries = store.allEntries(state.collection);
  const stats = store.collectionStats(entries);
  const albums = buildAlbums(entries, state.customPacks);
  const done = albums.filter((a) => a.complete).length;

  el.binderStats.innerHTML = `
    <span class="stat-pill"><b>${stats.copies}</b> ${t('copies')}</span>
    <span class="stat-pill"><b>${money(stats.value)}</b> ${t('total')}</span>
    <span class="stat-pill"><b>${done}</b> ${t('albumsDone')}</span>`;

  el.binderEmpty.hidden = entries.length > 0;
  if (!entries.length) {
    el.binderEmptyMark.innerHTML = iconSvg('collection', { size: 46 });
    el.binderEmptyText.textContent = t('emptyCollection');
  }

  el.albumShelf.replaceChildren(...albums.map(buildAlbumCover));
  reveal(el.albumShelf.children, { step: 22, from: 10 });
}

function buildAlbumCover(album) {
  const cover = document.createElement('button');
  cover.type = 'button';
  cover.className = `album-cover${album.unlocked ? '' : ' is-locked'}${album.complete ? ' is-complete' : ''}`;
  cover.dataset.family = album.style.family ?? 'roundel';
  cover.style.setProperty('--accent', album.style.accent);
  cover.style.setProperty('--accent2', album.style.accent2);
  const emblem = album.style.emblem?.kind === 'monogram'
    ? monogramSvg(album.style.emblem.letter, album.style.emblem.spin, { size: 54 })
    : emblemSvg(album.style.emblem?.id ?? 'open', { size: 54 });
  cover.innerHTML = `
    <span class="album-spine" aria-hidden="true"></span>
    <span class="album-cover-emblem" aria-hidden="true">${emblem}</span>
    <b class="album-cover-name"></b>
    <span class="album-cover-count tabular"></span>
    <span class="album-cover-bar"><i></i></span>
    ${album.complete ? `<span class="album-cover-done">${iconSvg('spark', { size: 13 })}</span>` : ''}`;
  cover.querySelector('.album-cover-name').textContent = album.name;
  cover.querySelector('.album-cover-count').textContent =
    album.unlocked ? `${Math.min(album.owned, album.total)}/${album.total}` : t('albumLocked');
  cover.querySelector('.album-cover-bar i').style.width =
    `${Math.min(100, (album.owned / album.total) * 100)}%`;
  press(cover, { sound: null });
  cover.addEventListener('click', () => {
    if (!album.unlocked) { toast(t('albumLockedHint', { name: album.name }), 'error'); return; }
    synth.playSheet(true);
    state.album = { key: album.key, spread: 0 };
    renderBinder();
  });
  return cover;
}

/* --- one open album ------------------------------------------------------- */

function currentAlbum() {
  const entries = store.allEntries(state.collection);
  return buildAlbums(entries, state.customPacks).find((a) => a.key === state.album?.key) ?? null;
}

function renderAlbum() {
  const album = currentAlbum();
  if (!album) { state.album = null; return renderBinder(); }

  el.albumShelf.hidden = true;
  el.binderStats.hidden = true;
  el.binderEmpty.hidden = true;
  el.albumView.hidden = false;
  el.binderTitle.textContent = t('tabCollection');

  el.albumBack.innerHTML = iconSvg('chevronLeft', { size: 18 });
  el.albumName.textContent = album.name;
  el.albumProgress.textContent = `${Math.min(album.owned, album.total)}/${album.total}`
    + (album.complete ? ` · ${t('albumComplete')}` : '');
  el.filterOpen.textContent = t('filters');
  const active = activeFilterCount();
  el.filterCount.textContent = String(active);
  el.filterCount.hidden = !active;

  // The book takes the album's palette so every album reads as its own book.
  el.albumBook.style.setProperty('--accent', album.style.accent);
  el.albumBook.style.setProperty('--accent2', album.style.accent2);

  const visible = store.filterEntries(album.entries, { ...state.filters, pack: '' });
  const spreads = Math.max(album.spreads, 1);
  const spread = Math.min(state.album.spread, spreads - 1);
  state.album.spread = spread;

  fillAlbumPage(el.pageLeft, visible, spread * CARDS_PER_SPREAD, album);
  fillAlbumPage(el.pageRight, visible, spread * CARDS_PER_SPREAD + CARDS_PER_PAGE, album);
  el.pagenoLeft.textContent = String(spread * 2 + 1);
  el.pagenoRight.textContent = String(spread * 2 + 2);

  el.albumDots.replaceChildren(...Array.from({ length: spreads }, (_, i) => {
    const dot = document.createElement('span');
    dot.className = `album-dot${i === spread ? ' is-on' : ''}`;
    return dot;
  }));
  el.albumHint.textContent = t('albumSwipeHint');
}

function fillAlbumPage(node, entries, offset, album) {
  const slots = [];
  for (let i = 0; i < CARDS_PER_PAGE; i++) {
    const entry = entries[offset + i];
    if (entry) {
      const card = buildStaticCard(entry, rarityById(entry.rarityId), entry.key);
      if (entry.count > 1) {
        const badge = document.createElement('span');
        badge.className = 'copy-badge';
        badge.textContent = `×${entry.count}`;
        card.appendChild(badge);
      }
      slots.push(card);
    } else {
      const empty = document.createElement('div');
      empty.className = 'album-slot-empty';
      empty.innerHTML = `<span class="tabular">${offset + i + 1}</span>`;
      slots.push(empty);
    }
  }
  node.replaceChildren(...slots);
}

/** Turn the page: the book folds at the spine, then opens on the new spread. */
function turnAlbumPage(dir) {
  const album = currentAlbum();
  if (!album || state.albumTurning) return;
  const spreads = Math.max(album.spreads, 1);
  const next = state.album.spread + dir;
  if (next < 0 || next >= spreads) {
    // The cover thuds: there is nothing further.
    el.albumBook.classList.remove('turn-bump-l', 'turn-bump-r');
    void el.albumBook.offsetWidth;
    el.albumBook.classList.add(dir > 0 ? 'turn-bump-r' : 'turn-bump-l');
    return;
  }
  state.albumTurning = true;
  synth.playPageTurn();
  const folding = dir > 0 ? el.albumBook.querySelector('.album-page.is-right')
                          : el.albumBook.querySelector('.album-page.is-left');
  folding.classList.add(dir > 0 ? 'is-folding-r' : 'is-folding-l');
  setTimeout(() => {
    state.album.spread = next;
    renderAlbum();
    folding.classList.remove('is-folding-r', 'is-folding-l');
    folding.classList.add(dir > 0 ? 'is-unfolding-r' : 'is-unfolding-l');
    setTimeout(() => {
      folding.classList.remove('is-unfolding-r', 'is-unfolding-l');
      state.albumTurning = false;
    }, 240);
  }, 230);
}

function openFilters() {
  openSheet(t('filters'), (body) => {
    const entries = store.allEntries(state.collection);
    const packs = [...new Map(entries.map((e) => [e.packId, e.packName])).entries()]
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])));

    const wrap = document.createElement('div');
    wrap.className = 'filters';
    wrap.innerHTML = `
      <input class="filter-input" type="search" data-key="search" />
      <div class="filter-row">
        <select class="filter-select" data-key="pack"></select>
        <select class="filter-select" data-key="rarity"></select>
      </div>
      <div class="filter-row">
        <select class="filter-select" data-key="band"></select>
        <select class="filter-select" data-key="minPrice"></select>
      </div>
      <select class="filter-select" data-key="sort"></select>
      <div style="display:flex;gap:10px;flex-wrap:wrap;padding-top:4px">
        <button class="chip" type="button" data-fav></button>
        <button class="btn btn-ghost btn-sm" type="button" data-reset></button>
      </div>`;

    const search = wrap.querySelector('[data-key="search"]');
    search.placeholder = t('searchTitles');
    search.value = state.filters.search;

    const sel = (key) => wrap.querySelector(`[data-key="${key}"]`);
    sel('pack').replaceChildren(option('', t('allPacks')), ...packs.map(([id, name]) => option(id, name ?? id)));
    sel('rarity').replaceChildren(option('', t('allRarities')), ...RARITIES.map((r) => option(r.id, tx(r.name))));
    sel('band').replaceChildren(option('', t('anyPopularity')), ...POPULARITY_BANDS.map((b) => option(b.id, b.name)));
    sel('minPrice').replaceChildren(option('', t('anyPrice')),
      ...[100, 500, 1500, 5000, 12000].map((p) => option(String(p), t('priceOver', { amount: formatAmount(p) }))));
    sel('sort').replaceChildren(...store.SORTS.map((s) => option(s.id, store.sortLabel(s))));
    ['pack', 'rarity', 'band', 'minPrice', 'sort'].forEach((key) => { sel(key).value = state.filters[key]; });

    const apply = () => { renderBinder(); paintFav(); };
    wrap.querySelectorAll('select').forEach((node) => {
      node.addEventListener('change', (e) => { state.filters[e.target.dataset.key] = e.target.value; apply(); });
    });
    search.addEventListener('input', (e) => { state.filters.search = e.target.value; apply(); });

    const fav = wrap.querySelector('[data-fav]');
    const paintFav = () => {
      fav.classList.toggle('is-on', state.filters.favoritesOnly);
      fav.innerHTML = `${iconSvg(state.filters.favoritesOnly ? 'starFilled' : 'star', { size: 14 })}<span>${t('favourites')}</span>`;
      el.filterCount.textContent = String(activeFilterCount());
      el.filterCount.hidden = !activeFilterCount();
    };
    paintFav();
    fav.addEventListener('click', () => {
      state.filters.favoritesOnly = !state.filters.favoritesOnly;
      synth.playTap();
      apply();
    });

    const resetBtn = wrap.querySelector('[data-reset]');
    resetBtn.textContent = t('reset');
    press(resetBtn, { sound: null });
    resetBtn.addEventListener('click', () => {
      state.filters = { search: '', pack: '', rarity: '', band: '', minPrice: '', sort: 'rarity', favoritesOnly: false };
      sheet.hide();
      renderBinder();
    });

    body.appendChild(wrap);
  });
}

/* --- profile ------------------------------------------------------------------------------------------- */

function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function renderProfile() {
  const { progress, rarityCounts } = state.profile;
  const level = progress.level ?? 1;
  const rank = rankFor(level);
  const atMax = level >= MAX_LEVEL;

  profileRing.set(levelFraction(progress), String(level));
  el.profileLevel.textContent = atMax ? t('profileMax') : t('profileLevel', { n: level });
  el.profileRank.textContent = tx(rank.name);
  xpBar.set(levelFraction(progress));
  el.xpLine.textContent = atMax ? t('profileMax') : t('profileXpLine', {
    have: (progress.xp ?? 0).toLocaleString(), need: xpForLevel(level).toLocaleString()
  });

  el.nextRewardLabel.textContent = t('profileNextReward');
  el.nextReward.replaceChildren(
    atMax ? document.createTextNode(t('profileMax'))
      : rewardCard(rewardForLevel(level + 1), { art: false })
  );

  el.statsLabel.textContent = t('profileStats');
  const entries = store.allEntries(state.collection);
  const pulled = Object.values(rarityCounts).reduce((sum, n) => sum + n, 0);

  const stats = [
    [t('statPlaytime'), formatDuration(state.profile.playMs ?? 0)],
    [t('statAccountAge'), new Date(state.profile.createdAt ?? Date.now())
      .toLocaleDateString(getLanguage(), { year: 'numeric', month: 'short', day: 'numeric' })],
    [t('statBoosters'), (state.profile.boostersOpened ?? 0).toLocaleString()],
    [t('statCards'), pulled.toLocaleString()],
    [t('statValue'), formatAmount(entries.reduce((sum, e) => sum + e.price * e.count, 0))],
    [t('statAlbums'), String(albumsCompleted(entries, state.customPacks))],
    [t('statAchievements'), String(evaluateAchievements(achFacts(),
      state.profile.achievements?.redeemed ?? []).filter((a) => a.unlocked).length)],
    ...(account.configured ? [[t('statFriends'), String(state.social.friends.length)]] : [])
  ];
  el.statGrid.replaceChildren(...stats.map(([label, value]) => {
    const cell = document.createElement('div');
    cell.className = 'stat-cell';
    cell.innerHTML = '<b></b><span></span>';
    cell.querySelector('b').textContent = value;
    cell.querySelector('span').textContent = label;
    return cell;
  }));

  el.rarityLabel.textContent = t('statRarity');
  const peak = Math.max(1, ...RARITIES.map((r) => rarityCounts[r.id] ?? 0));
  el.rarityBars.replaceChildren(...RARITIES.map((rarity) => {
    const count = rarityCounts[rarity.id] ?? 0;
    const row = document.createElement('div');
    row.className = 'rarity-row';
    row.innerHTML = `<span class="rarity-name"></span><span class="rarity-track"></span><span class="rarity-count"></span>`;
    const name = row.querySelector('.rarity-name');
    name.textContent = tx(rarity.name);
    name.style.color = rarity.color;
    const bar = new Bar(row.querySelector('.rarity-track'));
    bar.set(count / peak, { animate: false });
    bar.fill.style.background = rarity.color;
    row.querySelector('.rarity-count').textContent = count.toLocaleString();
    return row;
  }));

}

/* --- achievements ------------------------------------------------------------------------ */

function achFacts() {
  return measureAchievements({
    profile: state.profile,
    entries: store.allEntries(state.collection),
    albumsDone: albumsCompleted(store.allEntries(state.collection), state.customPacks),
    customPacks: state.customPacks ?? [],
    friends: state.social.friends.length
  });
}

function achRedeemableCount() {
  return redeemableCount(achFacts(), state.profile.achievements?.redeemed ?? []);
}

function renderAchievements() {
  el.achTitle.textContent = t('achTitle');
  const list = evaluateAchievements(achFacts(), state.profile.achievements?.redeemed ?? []);
  const done = list.filter((a) => a.unlocked).length;
  el.achSub.textContent = t('achSub', { done, total: list.length });

  // Redeemable first, then in-progress by closeness, then redeemed.
  const order = (a) => (a.redeemable ? 0 : !a.unlocked ? 1 : 2);
  list.sort((a, b) => order(a) - order(b)
    || (b.have / b.need) - (a.have / a.need));

  el.achList.replaceChildren(...list.map((a) => {
    const row = document.createElement('div');
    row.className = `ach${a.redeemable ? ' is-ready' : ''}${a.redeemed ? ' is-done' : ''}`;
    row.innerHTML = `
      <span class="ach-icon">${iconSvg(a.icon, { size: 20 })}</span>
      <span class="ach-copy">
        <b></b><span class="ach-desc"></span>
        <span class="ach-track"><i></i></span>
      </span>
      <span class="ach-side"></span>`;
    row.querySelector('b').textContent = a.name;
    row.querySelector('.ach-desc').textContent = a.desc;
    row.querySelector('.ach-track i').style.width = `${Math.round((a.have / a.need) * 100)}%`;

    const side = row.querySelector('.ach-side');
    if (a.redeemed) {
      side.innerHTML = `<span class="ach-claimed">${iconSvg('check', { size: 16 })}</span>`;
    } else if (a.redeemable) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary btn-sm';
      btn.innerHTML = t('achRedeem');
      press(btn, { sound: null });
      btn.addEventListener('click', () => redeemAchievement(a, btn));
      side.appendChild(btn);
    } else {
      side.innerHTML = `<span class="ach-progress tabular">${
        a.stat === 'value' ? money(a.have) : Math.floor(a.have)
      }/<b>${a.stat === 'value' ? money(a.need) : a.need}</b></span>`;
    }

    const label = document.createElement('span');
    label.className = 'ach-reward';
    label.innerHTML = a.reward.kind === 'coins'
      ? t('achRewardCoins', { amount: money(a.reward.coins) })
      : t('achRewardPack', { name: specName(a.reward.spec) });
    row.querySelector('.ach-copy').appendChild(label);
    return row;
  }));
  reveal(el.achList.children, { step: 18, from: 8 });
}

function redeemAchievement(a, btn) {
  const redeemed = state.profile.achievements.redeemed;
  if (redeemed.includes(a.id)) return;
  redeemed.push(a.id);
  if (a.reward.kind === 'coins') {
    store.saveWallet(store.loadWallet() + a.reward.coins);
    refreshWallet();
  } else {
    store.addBooster(state.inventory, a.reward.spec, 1);
    renderPacks();
  }
  store.saveProfile(state.profile);
  synth.playAchievement();
  const rect = btn.getBoundingClientRect();
  spawnBurst({ shapes: ['star4', 'orb'], colors: ['#fbbf24', '#ffffff'],
    count: 14, spread: 1.1, gravity: 0.3 },
    { x: rect.left + rect.width / 2, y: rect.top }, { scale: 0.6 });
  toast(t('achRedeemed', { name: a.name }), 'ok');
  renderAchievements();
  paintDrawerLinks();
}

/* --- the account gate -------------------------------------------------------------------------------------- */

/*
 * Signing in is required, so this sits in front of everything until there is a
 * session. The one exception is a build with no backend configured at all
 * (see account.configured): shipping a gate no key can open would be a brick,
 * so those builds play offline and say so in Settings.
 */

const signedIn = () => Boolean(state.account.session);
const userId = () => state.account.session?.user?.id ?? null;

function gateStatus(key, kind = '', vars = {}) {
  el.gateStatus.textContent = key ? t(key, vars) : '';
  el.gateStatus.className = `gate-status${kind ? ` is-${kind}` : ''}`;
}

/**
 * What to show for a failure.
 *
 * A message this build recognises is translated; anything else is shown as the
 * server wrote it. Passing an unrecognised failure off as a known one is worse
 * than being technical: it sends the reader looking in the wrong place.
 */
function describeError(error) {
  const key = account.readableError(error);
  if (key) return t(key);
  const raw = String(error?.message ?? error ?? '').trim();
  return raw || t('authUnknown');
}

function gateMessage(text, kind = 'error') {
  el.gateStatus.textContent = text;
  el.gateStatus.className = `gate-status${kind ? ` is-${kind}` : ''}`;
}

/** One labelled input, built here rather than in the HTML because the set changes. */
function field(name, labelKey, { type = 'text', icon = 'profile', hintKey = null, autocomplete = '' } = {}) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.innerHTML = `
    <span class="field-label"></span>
    <span class="field-box"><span>${iconSvg(icon, { size: 17 })}</span>
      <input name="${name}" type="${type}" autocomplete="${autocomplete}" spellcheck="false" />
    </span>
    ${hintKey ? '<span class="field-hint"></span>' : ''}`;
  wrap.querySelector('.field-label').textContent = t(labelKey);
  if (hintKey) wrap.querySelector('.field-hint').textContent = t(hintKey);
  return wrap;
}

function buildGateForm() {
  const creating = state.account.mode === 'signup';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn-primary btn-block';
  submit.textContent = t(creating ? 'gateSignUp' : 'gateSignIn');
  press(submit, { sound: null });

  // Email and password only. The username is its own step, after the account
  // exists — see showNameGate().
  el.gateForm.replaceChildren(
    field('email', 'gateEmail', { type: 'email', icon: 'mail', autocomplete: 'email' }),
    field('password', 'gatePassword', {
      type: 'password', icon: 'key',
      hintKey: creating ? 'gatePasswordHint' : null,
      autocomplete: creating ? 'new-password' : 'current-password'
    }),
    submit
  );

  el.gateAlt.textContent = t(creating ? 'gateHaveAccount' : 'gateForgot');
  gateStatus(null);
}

function setGateMode(mode) {
  state.account.mode = mode;
  gateSeg?.select(mode, { silent: true });
  buildGateForm();
}

function showGate() {
  el.gateMark.innerHTML = logoSvg({ size: 56 });
  el.gateTitle.textContent = t('gateTitle');
  el.gateBody.textContent = t('gateBody');
  el.gateFoot.textContent = t('gateFoot');
  // showNameGate() borrows this card; put back what it changed.
  el.gateSeg.parentElement.hidden = false;
  el.gateForm.onsubmit = submitGate;
  el.gateAlt.onclick = gateAltAction;

  if (!gateSeg) {
    gateSeg = new Segmented(el.gateSeg, [
      { id: 'signin', label: t('gateSignIn') },
      { id: 'signup', label: t('gateSignUp') }
    ], (mode) => setGateMode(mode));
  }
  setGateMode(state.account.mode);
  el.gate.hidden = false;
}

const hideGate = () => { el.gate.hidden = true; };

const fieldValue = (name) => el.gateForm.elements[name]?.value ?? '';

let gateBusy = false;

async function submitGate(event) {
  event.preventDefault();
  if (gateBusy) return;

  const email = fieldValue('email').trim();
  const password = fieldValue('password');
  const creating = state.account.mode === 'signup';

  if (!email || !password) return gateStatus('authUnknown', 'error');

  gateBusy = true;
  gateStatus('gateWorking', 'working');
  synth.playTap();
  try {
    if (creating) {
      const result = await account.signUp(email, password);
      if (result.needsConfirmation) {
        gateStatus('gateConfirm', 'ok');
        setGateMode('signin');
        return;
      }
      gateStatus('gateSignedUp', 'ok');
      // onSession finds an account with no profile and asks for a username.
    } else {
      await account.signIn(email, password);
    }
    synth.playFanfare();
    // onAuthChange takes it from here: it pulls the save and starts the app.
  } catch (error) {
    gateMessage(describeError(error));
    synth.playDenied();
  } finally {
    gateBusy = false;
  }
}

/** The alternate action under the form: reset a password, or go and sign in. */
async function gateAltAction() {
  if (state.account.mode === 'signup') { setGateMode('signin'); synth.playTap(); return; }

  const email = fieldValue('email').trim();
  if (!email) return gateStatus('gateResetNeedEmail', 'error');
  try {
    gateStatus('gateWorking', 'working');
    await account.sendReset(email);
  } catch { /* deliberately not reported: it would say whether the address exists */ }
  // Always the same answer, for the same reason.
  gateStatus('gateResetSent', 'ok');
}

/**
 * Step two of creating an account: take a username.
 *
 * Reached whenever a signed-in account has no profile — which is every new
 * account, and also an older one whose chosen name was taken while its email
 * was being confirmed. There is no way past it but to pick a name or sign out,
 * because everything social is keyed on having one.
 */
function showNameGate() {
  el.gateMark.innerHTML = logoSvg({ size: 56 });
  el.gateTitle.textContent = t('gateNameTitle');
  el.gateBody.textContent = t('gateNameBody');
  el.gateFoot.textContent = t('gateFoot');
  el.gateSeg.parentElement.hidden = true;
  el.gateAlt.textContent = t('accountSignOut');

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn-primary btn-block';
  submit.textContent = t('gateNameSave');
  press(submit, { sound: null });
  el.gateForm.replaceChildren(
    field('username', 'gateUsername', { hintKey: 'gateUsernameHint', autocomplete: 'username' }),
    submit
  );
  gateStatus(null);
  el.gate.hidden = false;

  el.gateForm.onsubmit = async (event) => {
    event.preventDefault();
    const name = fieldValue('username').trim();
    if (!account.USERNAME_RE.test(name)) return gateStatus('authBadName', 'error');
    gateStatus('gateWorking', 'working');
    try {
      const profile = await account.claimUsername(userId(), name);
      if (!profile) return gateStatus('authNameTaken', 'error');
      state.account.profile = profile;
      synth.playFanfare();
      await enterApp();
    } catch (error) {
      gateMessage(describeError(error));
    }
  };
  el.gateAlt.onclick = () => leaveAccount();
}

/* --- session and cloud sync --------------------------------------------------------------------------------- */

const SYNC_DEBOUNCE = 4000;
let syncTimer = null;
let syncQueued = false;

/** What a friend is allowed to see about you. Published with every push. */
function currentStats() {
  const entries = store.allEntries(state.collection);
  const counts = state.profile.rarityCounts ?? {};
  const best = RARITIES.filter((r) => (counts[r.id] ?? 0) > 0).pop();
  return {
    level: state.profile.progress.level ?? 1,
    rank: rankFor(state.profile.progress.level ?? 1).name.en,
    cards: entries.reduce((sum, e) => sum + e.count, 0),
    uniqueCards: entries.length,
    boostersOpened: state.profile.boostersOpened ?? 0,
    value: entries.reduce((sum, e) => sum + e.price * e.count, 0),
    bestRarity: best?.id ?? null,
    playMs: state.profile.playMs ?? 0
  };
}

/**
 * Push the save and the public stats.
 *
 * Debounced hard: opening a booster writes storage half a dozen times in a
 * second, and every one of those is the same save a moment apart. A failure is
 * recorded and left for the next change or the next foreground to retry —
 * losing a sync is survivable, and blocking the game on one is not.
 */
async function flushSync() {
  if (!signedIn() || !state.account.profile) return;
  clearTimeout(syncTimer);
  syncTimer = null;
  if (state.account.syncing) { syncQueued = true; return; }

  state.account.syncing = true;
  renderAccountRow();
  try {
    await account.pushSave(userId());
    await account.publishStats(userId(), currentStats());
    state.account.syncedAt = Date.now();
    state.account.failed = false;
  } catch {
    state.account.failed = true;
  } finally {
    state.account.syncing = false;
    renderAccountRow();
    if (syncQueued) { syncQueued = false; syncSoon(); }
  }
}

function syncSoon() {
  if (!signedIn() || !state.account.profile) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(flushSync, SYNC_DEBOUNCE);
}

/*
 * A slow poll for anything that arrives from someone else.
 *
 * A friend request is the one thing in the app that happens without you doing
 * it, so waiting until you next open the Friends screen to find out is no use
 * — the bell would only ever be right by accident. One read a minute while the
 * app is actually on screen is cheap, and it stops entirely in the background.
 */
const SOCIAL_POLL = 60000;
let socialTimer = null;

function startSocialPoll() {
  stopSocialPoll();
  if (!signedIn() || document.visibilityState !== 'visible') return;
  socialTimer = setInterval(syncSocial, SOCIAL_POLL);
}

function stopSocialPoll() {
  clearInterval(socialTimer);
  socialTimer = null;
}

/**
 * Foregrounding the app: pick up the profile if the last attempt failed, push
 * anything that has not landed, and refresh the friend lists.
 */
async function resumeAccount() {
  if (!signedIn()) return;
  // The database may have been updated while we were away.
  account.forgetSchemaProbe();
  const had = Boolean(state.account.profile);
  await fetchAccountProfile();
  // A profile that only just arrived means nothing has ever been pushed on
  // this run, so push rather than waiting for the next change.
  if (state.account.failed || !had) syncSoon();
  syncSocial();
  startSocialPoll();
}

/**
 * Sign in has happened. Pull the account's save over the local one, then start
 * the app on whatever that turns out to contain — which is what makes a fresh
 * install on a new phone come up with the collection already in it.
 */
async function enterApp() {
  try {
    await account.syncOnLogin(userId());
  } catch {
    // Offline at sign-in: play on what is on the device and push when it
    // reconnects, rather than refusing to start.
    state.account.failed = true;
  }
  hideGate();
  reloadFromStorage();
  if (!state.account.failed) state.account.syncedAt = Date.now();
  syncSocial();
  startSocialPoll();

  if (!languageChosen() || !state.profile.started) showWelcome();
  else {
    payStipend();
    if (canClaim(state.profile.daily)) openDaily({ auto: true });
  }
}

/** Re-read everything from storage, after an import or a sign-in pull. */
function reloadFromStorage() {
  state.collection = store.loadCollection();
  state.inventory = store.loadInventory();
  state.profile = store.loadProfile();
  state.customPacks = store.loadCustomPacks();
  state.wallet = store.loadWallet();
  applySettings();
  applyStrings();
  refreshWallet();
  refreshLevelBadge();
  renderPacks();
  renderShop();
  renderBinder();
  updateBadges();
}

/** Sign out, and put the gate back. Local state is left for the next sign-in. */
async function leaveAccount() {
  await flushSync().catch(() => {});
  try { await account.signOut(); } catch { /* already gone */ }
  state.account.session = null;
  state.account.profile = null;
  // Cleared here rather than waiting on the sign-out event, so signing back
  // in as the same account is not mistaken for a repeat of the same session.
  handledUser = null;
  state.social = { friends: [], incoming: [], outgoing: [], results: [], loaded: false, unread: new Map(), trades: [] };
  stopSocialPoll();
  el.welcome.hidden = true;
  showScreen('packs');
  showGate();
}

/**
 * Called on every auth change, including the one that restores a stored
 * session at launch.
 *
 * Idempotent by user id, because a token refresh reports the same session
 * again and must not re-run the sign-in pull over live play. That also makes
 * it safe to drive from both the listener and an explicit session check.
 */
let handledUser;

async function onSession(session) {
  const id = session?.user?.id ?? null;
  if (handledUser === id) return;
  handledUser = id;

  state.account.session = session ?? null;
  if (!session) { showGate(); endSplash(); return; }

  const ready = await fetchAccountProfile();
  if (ready === 'no-name') { showNameGate(); endSplash(); return; }
  await enterApp();
  endSplash();
}

/**
 * Load the profile for the current session.
 *
 * Everything that talks to the server needs it, so a failure here (which
 * offline at launch is) would otherwise leave the app signed in but unable to
 * sync or list friends for the rest of the session. It is retried whenever the
 * app comes back to the foreground.
 */
async function fetchAccountProfile() {
  if (!signedIn() || state.account.profile) return 'ok';
  try {
    const profile = await account.profileForSession(state.account.session);
    if (!profile) return 'no-name';
    state.account.profile = profile;
    state.account.failed = false;
    return 'ok';
  } catch {
    state.account.failed = true;
    return 'offline';
  }
}

/* --- friends -------------------------------------------------------------------------------------------------- */

/** One person, however they are related to you: result, friend or request. */
function personRow(profile, actions, { onOpen = null, note = null } = {}) {
  const row = document.createElement(onOpen ? 'button' : 'div');
  if (onOpen) row.type = 'button';
  row.className = 'person';
  row.innerHTML = `
    <span class="person-mark"></span>
    <span class="person-copy"><b></b><span></span></span>
    <span class="person-actions"></span>`;

  const mark = row.querySelector('.person-mark');
  paintAvatarInto(mark, profile);
  const live = account.isOnline(profile);
  if (live !== null) {
    const dot = document.createElement('span');
    dot.className = `presence-dot${live ? ' is-online' : ''}`;
    mark.appendChild(dot);
  }
  row.querySelector('b').textContent = profile.username ?? '';
  row.querySelector('.person-copy span').textContent = t('friendsLevelLine', {
    n: profile.level ?? 1,
    rank: tx(rankFor(profile.level ?? 1).name)
  });

  const bay = row.querySelector('.person-actions');
  for (const [labelKey, kind, run] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn btn-sm ${kind}`;
    button.textContent = t(labelKey);
    press(button, { sound: null });
    button.addEventListener('click', (event) => {
      event.stopPropagation();          // the row itself may be a link
      run(button);
    });
    bay.appendChild(button);
  }
  if (note) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `${iconSvg('hourglass', { size: 13 })}<span></span>`;
    chip.querySelector('span').textContent = t(note);
    bay.appendChild(chip);
  } else if (!actions.length) {
    bay.innerHTML = `<span class="muted">${iconSvg('chevron', { size: 18 })}</span>`;
  }

  if (onOpen) {
    press(row, { sound: null });
    row.addEventListener('click', () => { synth.playTap(); onOpen(); });
  }
  return row;
}

/**
 * Guard every network action behind one place that reports what went wrong.
 *
 * Names are escaped on the way into a toast. The database constrains a
 * username to letters, digits and underscores, so there is nothing to escape
 * in practice — but toast() takes markup, and a value that came off the
 * network should not be the one place that relies on a constraint holding.
 */
async function socialAction(run, doneKey = null, vars = {}) {
  const safe = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, esc(v)]));
  try {
    await run();
    await loadFriends();
    if (doneKey) toast(t(doneKey, safe));
  } catch (error) {
    toast(esc(describeError(error)), 'error');
    synth.playDenied();
  }
}

async function loadFriends() {
  if (!signedIn() || !state.account.profile) return;
  try {
    const lists = await account.listFriendships(userId());
    Object.assign(state.social, lists, { loaded: true });
  } catch {
    state.social.loaded = false;
  }
  updateBadges();
  if (state.tab === 'friends') renderFriends();
  if (state.tab === 'profile') renderProfile();
}

/**
 * The full social heartbeat: friendships, presence, post, trades, unread.
 * Runs on resume and once a minute. Every part is best-effort — a dead
 * network costs freshness, never state.
 */
async function syncSocial() {
  if (!signedIn() || !state.account.profile) return;
  await loadFriends();
  account.heartbeat(userId()).catch(() => {});
  try { await collectDeliveries(); } catch { /* next pass */ }
  try { state.social.unread = await account.unreadBySender(userId()); } catch { /* keep old */ }
  try {
    state.social.trades = await account.openTrades(userId());
    await reconcileTrades();
  } catch { /* keep old */ }
  updateBadges();
  if (state.tab === 'friends') renderFriends();
  if (state.tab === 'chat' && state.chat) refreshChat();
}

/**
 * Claim everything in my postbox: gifted cards, gifted boosters, and the
 * goods side of accepted trades. Each item lands in the local save first and
 * is marked claimed second, so a crash in between duplicates rather than
 * destroys — the kinder failure.
 */
async function collectDeliveries() {
  const waiting = await account.pendingDeliveries(userId());
  if (!waiting.length) return;
  for (const item of waiting) {
    const from = state.social.friends.find((f) => f.otherId === item.sender)?.profile?.username
      ?? t('friendSomeone');
    if (item.kind === 'booster' && item.payload?.spec) {
      store.addBooster(state.inventory, item.payload.spec, item.payload.count ?? 1);
      pushNote('gift', t('notifGiftBooster', { name: esc(from) }), 'packs');
    } else if (item.kind === 'card' && item.payload?.key) {
      store.receiveCardEntry(state.collection, item.payload);
      pushNote('gift', t('notifGiftCard', { name: esc(from), card: esc(item.payload.title) }), 'binder');
    } else if (item.kind === 'trade-return' && Array.isArray(item.payload?.cards)) {
      for (const card of item.payload.cards) store.receiveCardEntry(state.collection, card);
      pushNote('trade', t('notifTradeDone', { name: esc(from) }), 'binder');
    }
    await account.claimDelivery(item.id);
  }
  synth.playTrade();
  renderPacks();
  if (state.tab === 'binder') renderBinder();
  syncSoon();
}

/**
 * The proposer's side of a finished trade: an accepted one just needs
 * closing (the goods arrive by delivery); a declined one hands the escrowed
 * cards back.
 */
async function reconcileTrades() {
  for (const trade of state.social.trades) {
    if (trade.proposer !== userId()) continue;
    if (trade.status === 'declined' || trade.status === 'cancelled') {
      for (const card of trade.offer ?? []) store.receiveCardEntry(state.collection, card);
      await account.setTradeStatus(trade.id, 'closed');
      const who = state.social.friends.find((f) => f.otherId === trade.recipient)?.profile?.username ?? '?';
      pushNote('trade', t('notifTradeDeclined', { name: esc(who) }), 'binder');
      syncSoon();
    } else if (trade.status === 'accepted') {
      await account.setTradeStatus(trade.id, 'closed');
      // The cards arrive as a delivery; the note for that is written there.
    }
  }
  state.social.trades = state.social.trades.filter((tr) => tr.status === 'pending');
}

/* --- favourites (local) ------------------------------------------------------ */

const isFavFriend = (id) => (state.profile.favFriends ?? []).includes(id);
function toggleFavFriend(id) {
  const list = state.profile.favFriends ??= [];
  const at = list.indexOf(id);
  if (at >= 0) list.splice(at, 1); else list.push(id);
  store.saveProfile(state.profile);
}

/* --- gifting ------------------------------------------------------------------ */

/** Pick one of my cards; hand it over. The card leaves my save first. */
function openGiftCard(entry) {
  const mine = store.allEntries(state.collection)
    .sort((a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId));
  openSheet(t('giftCardTitle', { name: entry.profile.username }), (body) => {
    if (!mine.length) {
      body.innerHTML = '<p class="muted"></p>';
      body.querySelector('p').textContent = t('giftNothing');
      return;
    }
    const list = document.createElement('div');
    list.className = 'pick-list';
    list.replaceChildren(...mine.map((card) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'pick-row';
      row.innerHTML = `
        <span class="pick-thumb"></span>
        <span class="pick-copy"><b></b><span></span></span>
        <span class="chip tabular">×${card.count}</span>`;
      if (card.thumbnail) row.querySelector('.pick-thumb').style.backgroundImage = `url("${card.thumbnail}")`;
      row.querySelector('b').textContent = card.title;
      const tier = row.querySelector('.pick-copy span');
      tier.textContent = tx(rarityById(card.rarityId).name);
      tier.style.color = rarityById(card.rarityId).color;
      press(row, { sound: null });
      row.addEventListener('click', async () => {
        row.disabled = true;
        const snapshot = store.takeCardCopy(state.collection, card.key);
        if (!snapshot) return;
        try {
          await account.sendDelivery(userId(), entry.otherId, 'card', snapshot);
          toast(t('giftSent', { name: esc(entry.profile.username) }));
          synth.playTrade();
          sheet.hide();
          renderBinder();
          syncSoon();
        } catch (error) {
          store.receiveCardEntry(state.collection, snapshot);   // undo
          toast(esc(describeError(error)), 'error');
          row.disabled = false;
        }
      });
      return row;
    }));
    body.appendChild(list);
  });
}

/** Pick one of my unopened boosters; hand it over. */
function openGiftBooster(entry) {
  const owned = store.ownedBoosters(state.inventory);
  openSheet(t('giftBoosterTitle', { name: entry.profile.username }), (body) => {
    if (!owned.length) {
      body.innerHTML = '<p class="muted"></p>';
      body.querySelector('p').textContent = t('giftNoBoosters');
      return;
    }
    const list = document.createElement('div');
    list.className = 'pick-list';
    list.replaceChildren(...owned.map((slot) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'pick-row';
      row.innerHTML = `
        <span class="pick-art"></span>
        <span class="pick-copy"><b></b><span></span></span>
        <span class="chip tabular">×${slot.count}</span>`;
      row.querySelector('.pick-art').appendChild(buildBooster(slot.spec, { size: 'is-tiny' }));
      row.querySelector('b').textContent = specName(slot.spec);
      row.querySelector('.pick-copy span').textContent = `${slot.spec.cards} ${t('cards')}`;
      press(row, { sound: null });
      row.addEventListener('click', async () => {
        row.disabled = true;
        if (!store.takeBooster(state.inventory, specId(slot.spec))) return;
        try {
          await account.sendDelivery(userId(), entry.otherId, 'booster', { spec: slot.spec });
          toast(t('giftSent', { name: esc(entry.profile.username) }));
          synth.playTrade();
          sheet.hide();
          renderPacks();
          syncSoon();
        } catch (error) {
          store.addBooster(state.inventory, slot.spec, 1);      // undo
          toast(esc(describeError(error)), 'error');
          row.disabled = false;
        }
      });
      return row;
    }));
    body.appendChild(list);
  });
}

/* --- trading ------------------------------------------------------------------- */

/**
 * Propose a trade: pick up to three of my cards to give and up to three of
 * theirs to ask for. My cards go into escrow the moment the trade is posted.
 */
async function openTradeSheet(entry) {
  let theirs = [];
  try { theirs = (await account.friendCollection(entry.otherId)) ?? []; } catch { theirs = []; }
  const mine = store.allEntries(state.collection)
    .sort((a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId));
  theirs.sort((a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId));

  const give = new Set();
  const ask = new Set();

  openSheet(t('tradeTitle', { name: entry.profile.username }), (body) => {
    body.innerHTML = `
      <p class="label" data-give-label style="margin-bottom:8px"></p>
      <div class="pick-list is-short" data-give></div>
      <p class="label" data-ask-label style="margin:16px 0 8px"></p>
      <div class="pick-list is-short" data-ask></div>
      <button class="btn btn-primary btn-block" type="button" data-send style="margin-top:16px"></button>`;
    body.querySelector('[data-give-label]').textContent = t('tradeGive');
    body.querySelector('[data-ask-label]').textContent = t('tradeAsk');
    const sendBtn = body.querySelector('[data-send]');

    const paintSend = () => {
      sendBtn.textContent = t('tradeSend', { give: give.size, ask: ask.size });
      sendBtn.disabled = give.size === 0 || ask.size === 0;
    };
    const pickRow = (card, bag, cap = 3) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'pick-row is-tick';
      row.innerHTML = `
        <span class="pick-thumb"></span>
        <span class="pick-copy"><b></b><span></span></span>
        <span class="pick-tick">${iconSvg('check', { size: 15 })}</span>`;
      if (card.thumbnail) row.querySelector('.pick-thumb').style.backgroundImage = `url("${card.thumbnail}")`;
      row.querySelector('b').textContent = card.title;
      const tier = row.querySelector('.pick-copy span');
      tier.textContent = tx(rarityById(card.rarityId).name);
      tier.style.color = rarityById(card.rarityId).color;
      press(row, { sound: null });
      row.addEventListener('click', () => {
        if (bag.has(card.key)) bag.delete(card.key);
        else if (bag.size < cap) bag.add(card.key);
        row.classList.toggle('is-on', bag.has(card.key));
        paintSend();
      });
      return row;
    };

    body.querySelector('[data-give]').replaceChildren(...mine.slice(0, 60).map((c) => pickRow(c, give)));
    const askBay = body.querySelector('[data-ask]');
    if (!theirs.length) {
      askBay.innerHTML = '<p class="muted" style="font-size:.84rem"></p>';
      askBay.querySelector('p').textContent = t('tradeTheirsHidden');
    } else {
      askBay.replaceChildren(...theirs.slice(0, 60).map((c) => pickRow(c, ask)));
    }

    paintSend();
    press(sendBtn, { sound: null });
    sendBtn.addEventListener('click', async () => {
      sendBtn.disabled = true;
      // Escrow: the offered cards leave my save now.
      const offer = [...give].map((key) => store.takeCardCopy(state.collection, key)).filter(Boolean);
      const askList = [...ask].map((key) => {
        const card = theirs.find((c) => c.key === key);
        return card ? { key: card.key, title: card.title, rarityId: card.rarityId } : null;
      }).filter(Boolean);
      try {
        await account.proposeTrade(userId(), entry.otherId, offer, askList);
        toast(t('tradeSentToast', { name: esc(entry.profile.username) }));
        synth.playTrade();
        sheet.hide();
        renderBinder();
        syncSoon();
        syncSocial();
      } catch (error) {
        for (const card of offer) store.receiveCardEntry(state.collection, card);   // undo escrow
        toast(esc(describeError(error)), 'error');
        sendBtn.disabled = false;
      }
    });
  });
}

/** The recipient's view of a pending trade: what changes hands, and the answer. */
function openTradeAnswer(trade) {
  const who = state.social.friends.find((f) => f.otherId === trade.proposer);
  const name = who?.profile?.username ?? '?';
  openSheet(t('tradeFromTitle', { name }), (body) => {
    const line = (cards, labelKey) => `
      <p class="label" style="margin:10px 0 6px">${esc(t(labelKey))}</p>
      ${cards.map((c) => `<p class="trade-line"><b>${esc(c.title)}</b>
        <span style="color:${rarityById(c.rarityId).color}">${esc(tx(rarityById(c.rarityId).name))}</span></p>`).join('')}`;
    body.innerHTML = `
      ${line(trade.offer ?? [], 'tradeYouGet')}
      ${line(trade.ask ?? [], 'tradeYouGive')}
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="btn btn-primary" type="button" data-accept style="flex:1"></button>
        <button class="btn btn-ghost" type="button" data-decline style="flex:1"></button>
      </div>
      <p class="find-status" data-status role="status"></p>`;
    const acceptBtn = body.querySelector('[data-accept]');
    const declineBtn = body.querySelector('[data-decline]');
    acceptBtn.textContent = t('tradeAccept');
    declineBtn.textContent = t('tradeDecline');

    // Can I actually pay? Every asked card must still be in my collection.
    const missing = (trade.ask ?? []).filter((c) => !state.collection.entries[c.key]);
    if (missing.length) {
      acceptBtn.disabled = true;
      body.querySelector('[data-status]').textContent = t('tradeMissing');
    }

    press(acceptBtn, { sound: null });
    acceptBtn.addEventListener('click', async () => {
      acceptBtn.disabled = true; declineBtn.disabled = true;
      const paid = (trade.ask ?? []).map((c) => store.takeCardCopy(state.collection, c.key)).filter(Boolean);
      try {
        await account.sendDelivery(userId(), trade.proposer, 'trade-return', { cards: paid });
        for (const card of trade.offer ?? []) store.receiveCardEntry(state.collection, card);
        await account.setTradeStatus(trade.id, 'accepted');
        toast(t('tradeDone', { name: esc(name) }));
        synth.playTrade();
        sheet.hide();
        renderBinder();
        syncSoon();
        syncSocial();
      } catch (error) {
        for (const card of paid) store.receiveCardEntry(state.collection, card);   // undo
        toast(esc(describeError(error)), 'error');
        acceptBtn.disabled = false; declineBtn.disabled = false;
      }
    });
    press(declineBtn, { sound: null });
    declineBtn.addEventListener('click', async () => {
      acceptBtn.disabled = true; declineBtn.disabled = true;
      try {
        await account.setTradeStatus(trade.id, 'declined');
        sheet.hide();
        syncSocial();
      } catch (error) {
        toast(esc(describeError(error)), 'error');
        acceptBtn.disabled = false; declineBtn.disabled = false;
      }
    });
  });
}

/* --- chat ---------------------------------------------------------------------- */

let chatTimer = null;

function openChat(entry) {
  state.chat = entry;
  renderChatFrame();
  showScreen('chat');
  refreshChat({ markRead: true });
  clearInterval(chatTimer);
  chatTimer = setInterval(() => { if (state.tab === 'chat') refreshChat(); }, 10000);
}

function renderChatFrame() {
  const person = state.chat?.profile;
  if (!person) return;
  el.chatBack.innerHTML = iconSvg('chevronLeft', { size: 18 });
  el.chatName.textContent = person.username ?? '';
  paintAvatarInto(el.chatAvatar, person);
  const online = account.isOnline(person);
  el.chatPresence.textContent = online === null ? ''
    : (online ? t('friendOnline') : t('friendOffline'));
  el.chatPresence.className = `chat-presence${online ? ' is-online' : ''}`;
  el.chatInput.placeholder = t('chatPlaceholder');
  el.chatSend.textContent = t('chatSend');
}

async function refreshChat({ markRead = false } = {}) {
  const entry = state.chat;
  if (!entry) return;
  try {
    const rows = await account.listMessages(userId(), entry.otherId);
    if (state.chat !== entry) return;
    paintChat(rows);
    if (markRead || rows.some((m) => m.recipient === userId() && !m.read_at)) {
      await account.markConversationRead(userId(), entry.otherId);
      state.social.unread.delete(entry.otherId);
      updateBadges();
    }
  } catch { /* next poll */ }
}

function paintChat(rows) {
  const mine = userId();
  const atBottom = el.chatLog.scrollHeight - el.chatLog.scrollTop - el.chatLog.clientHeight < 60;
  el.chatLog.replaceChildren(...rows.map((m) => {
    const bubble = document.createElement('div');
    bubble.className = `bubble${m.sender === mine ? ' is-mine' : ''}`;
    bubble.textContent = m.body;
    const when = document.createElement('span');
    when.className = 'bubble-when';
    when.textContent = whenText(m.created_at);
    bubble.appendChild(when);
    return bubble;
  }));
  if (atBottom || rows.length) el.chatLog.scrollTop = el.chatLog.scrollHeight;
}

async function sendChat(event) {
  event.preventDefault();
  const entry = state.chat;
  const text = el.chatInput.value.trim();
  if (!entry || !text) return;
  el.chatInput.value = '';
  try {
    await account.sendChatMessage(userId(), entry.otherId, text);
    synth.playMessage();
    refreshChat();
  } catch (error) {
    el.chatInput.value = text;   // let them retry
    toast(esc(describeError(error)), 'error');
  }
}

/* --- avatars -------------------------------------------------------------------- */

/** Paint a person's avatar (their chosen card art, at their chosen crop)
 *  into a .person-mark-style circle, or fall back to their initial. */
function paintAvatarInto(node, profile) {
  const avatar = profile?.avatar;
  if (avatar?.url) {
    node.textContent = '';
    node.style.backgroundImage = `url("${String(avatar.url).replace(/"/g, '%22')}")`;
    node.style.backgroundSize = 'cover';
    node.style.backgroundPosition = `${Number(avatar.x) || 50}% ${Number(avatar.y) || 50}%`;
    node.classList.add('has-avatar');
  } else {
    node.style.backgroundImage = '';
    node.classList.remove('has-avatar');
    node.textContent = String(profile?.username ?? '?').slice(0, 1);
  }
}

/**
 * Choose a card as your face. Step one: pick any card you own that has a
 * picture. Step two: drag the picture behind a fixed circle to choose the
 * crop, exactly like every other app does it.
 */
function openAvatarPicker() {
  const mine = store.allEntries(state.collection).filter((c) => c.thumbnail);
  openSheet(t('avatarTitle'), (body) => {
    if (!mine.length) {
      body.innerHTML = '<p class="muted"></p>';
      body.querySelector('p').textContent = t('avatarNoCards');
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'avatar-grid';
    grid.replaceChildren(...mine.slice(0, 60).map((card) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'avatar-cell';
      cell.style.backgroundImage = `url("${String(card.thumbnail).replace(/"/g, '%22')}")`;
      cell.setAttribute('aria-label', card.title);
      press(cell, { sound: null });
      cell.addEventListener('click', () => openAvatarCrop(card));
      return cell;
    }));
    body.appendChild(grid);
  });
}

function openAvatarCrop(card) {
  openSheet(t('avatarCropTitle'), (body) => {
    body.innerHTML = `
      <p class="muted" style="font-size:.84rem;margin-bottom:12px" data-hint></p>
      <div class="crop-stage" data-stage>
        <div class="crop-img" data-img></div>
        <div class="crop-ring" aria-hidden="true"></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn btn-primary" type="button" data-save style="flex:1"></button>
      </div>`;
    body.querySelector('[data-hint]').textContent = t('avatarCropHint');
    const saveBtn = body.querySelector('[data-save]');
    saveBtn.textContent = t('avatarSave');

    const img = body.querySelector('[data-img]');
    const stage = body.querySelector('[data-stage]');
    img.style.backgroundImage = `url("${String(card.thumbnail).replace(/"/g, '%22')}")`;
    let x = 50, y = 50;
    const paint = () => { img.style.backgroundPosition = `${x}% ${y}%`; };
    paint();
    stage.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const x0 = x, y0 = y;
      const rect = stage.getBoundingClientRect();
      trackDrag(event, {
        onMove: (dx, dy) => {
          x = Math.min(100, Math.max(0, x0 - (dx / rect.width) * 100));
          y = Math.min(100, Math.max(0, y0 - (dy / rect.height) * 100));
          paint();
        },
        onEnd: () => {}
      });
    });

    press(saveBtn, { sound: null });
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      const avatar = { url: card.thumbnail, x: Math.round(x), y: Math.round(y) };
      try {
        await account.updateProfileFields(userId(), { avatar });
        state.account.profile.avatar = avatar;
        toast(t('avatarSaved'));
        synth.playResolved();
        sheet.hide();
        if (state.tab === 'profile') renderProfile();
      } catch (error) {
        toast(esc(describeError(error)), 'error');
        saveBtn.disabled = false;
      }
    });
  });
}

function findStatus(key, kind = 'muted', vars = {}) {
  el.findStatus.textContent = key ? t(key, vars) : '';
  el.findStatus.className = `find-status${kind ? ` is-${kind}` : ''}`;
}

function findMessage(text, kind = 'error') {
  el.findStatus.textContent = text;
  el.findStatus.className = `find-status${kind ? ` is-${kind}` : ''}`;
}

async function runSearch(event) {
  event?.preventDefault();
  const term = el.findInput.value.trim();
  if (term.length < 2) {
    state.social.results = [];
    el.findResults.replaceChildren();
    return findStatus('friendsTypeMore');
  }
  findStatus('friendsSearching', 'working');
  synth.playTap();
  try {
    state.social.results = await account.searchPlayers(term, userId());
    findStatus(state.social.results.length ? null : 'friendsNoResults');
    renderFriends();
  } catch (error) {
    findMessage(describeError(error));
  }
}

function renderFriends() {
  el.friendsTitle.textContent = t('tabFriends');
  el.friendsIntro.textContent = t('friendsIntro');
  el.findMark.innerHTML = iconSvg('search', { size: 18 });
  el.findInput.placeholder = t('friendsFindPlaceholder');
  el.findInput.setAttribute('aria-label', t('friendsFind'));
  el.findGo.textContent = t('friendsSearch');
  el.resultsLabel.textContent = t('friendsResults');
  el.incomingLabel.textContent = t('friendsIncoming');
  el.friendsLabel.textContent = t('friendsYours');
  el.outgoingLabel.textContent = t('friendsOutgoing');
  el.tradesLabel.textContent = t('friendsTrades');

  const { friends, incoming, outgoing, results } = state.social;
  // Someone you are already connected to still appears in a search, showing
  // what the connection is. Hiding them would read as the search being broken.
  const known = new Map();
  for (const entry of friends) known.set(entry.otherId, { kind: 'friend', entry });
  for (const entry of incoming) known.set(entry.otherId, { kind: 'incoming', entry });
  for (const entry of outgoing) known.set(entry.otherId, { kind: 'outgoing', entry });

  el.findResults.replaceChildren(...results.map((person) => {
    const link = known.get(person.id);
    if (link?.kind === 'friend') {
      return personRow(person, [], { onOpen: () => openFriend(link.entry) });
    }
    if (link?.kind === 'incoming') {
      return personRow(person, [['friendsAccept', 'btn-primary', () => socialAction(
        () => account.acceptRequest(link.entry.id), 'friendsAccepted', { name: person.username })]]);
    }
    if (link?.kind === 'outgoing') return personRow(person, [], { note: 'friendsPending' });
    return personRow(person, [['friendsAdd', 'btn-primary', () => socialAction(
      () => account.sendRequest(userId(), person.id), 'friendsSent', { name: person.username })]]);
  }));

  el.incomingList.replaceChildren(...incoming.map((entry) =>
    personRow(entry.profile, [
      ['friendsAccept', 'btn-primary', () => socialAction(
        () => account.acceptRequest(entry.id), 'friendsAccepted', { name: entry.profile.username })],
      ['friendsDecline', 'btn-ghost', () => socialAction(
        () => account.removeFriendship(entry.id), 'friendsRemoved')]
    ])));

  // Favourites first, then whoever is online now, then the alphabet.
  const orderedFriends = [...friends].sort((a, b) =>
    (isFavFriend(b.otherId) - isFavFriend(a.otherId))
    || ((account.isOnline(b.profile) === true) - (account.isOnline(a.profile) === true))
    || a.profile.username.localeCompare(b.profile.username));

  el.friendsList.replaceChildren(...orderedFriends.map((entry) => {
    const row = personRow(entry.profile, [], { onOpen: () => openFriend(entry) });
    const bay = row.querySelector('.person-actions');
    bay.innerHTML = '';

    const unread = state.social.unread?.get?.(entry.otherId) ?? 0;
    const chatBtn = document.createElement('button');
    chatBtn.type = 'button';
    chatBtn.className = 'icon-btn is-mini';
    chatBtn.setAttribute('aria-label', t('chatOpen'));
    chatBtn.innerHTML = `${iconSvg('chat', { size: 17 })}${unread ? `<span class="count">${unread > 9 ? '9+' : unread}</span>` : ''}`;
    chatBtn.addEventListener('click', (e) => { e.stopPropagation(); synth.playTap(); openChat(entry); });

    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.className = `icon-btn is-mini fav-friend${isFavFriend(entry.otherId) ? ' is-on' : ''}`;
    favBtn.setAttribute('aria-label', t('friendFavourite'));
    favBtn.innerHTML = iconSvg(isFavFriend(entry.otherId) ? 'starFilled' : 'star', { size: 16 });
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      synth.playTap();
      toggleFavFriend(entry.otherId);
      renderFriends();
    });

    const dropBtn = document.createElement('button');
    dropBtn.type = 'button';
    dropBtn.className = 'icon-btn is-mini drop-friend';
    dropBtn.setAttribute('aria-label', t('friendsRemove'));
    dropBtn.innerHTML = iconSvg('trash', { size: 15 });
    dropBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!dropBtn.classList.contains('is-armed')) {
        dropBtn.classList.add('is-armed');
        toast(t('deleteArmed'));
        setTimeout(() => dropBtn.classList.remove('is-armed'), 3500);
        return;
      }
      socialAction(() => account.removeFriendship(entry.id), 'friendsRemoved');
    });

    bay.append(chatBtn, favBtn, dropBtn);
    return row;
  }));

  // Trades waiting on my answer sit above the friend list.
  const myTrades = (state.social.trades ?? [])
    .filter((tr) => tr.status === 'pending' && tr.recipient === userId());
  el.tradesHead.hidden = !myTrades.length;
  el.tradesList.replaceChildren(...myTrades.map((trade) => {
    const who = friends.find((f) => f.otherId === trade.proposer)?.profile
      ?? { username: '?' };
    return personRow(who, [
      ['tradeView', 'btn-primary', () => openTradeAnswer(trade)]
    ]);
  }));

  el.outgoingList.replaceChildren(...outgoing.map((entry) =>
    personRow(entry.profile, [
      ['friendsCancel', 'btn-ghost', () => socialAction(
        () => account.removeFriendship(entry.id), 'friendsRemoved')]
    ])));

  el.resultsHead.hidden = !results.length;
  el.incomingHead.hidden = !incoming.length;
  el.friendsHead.hidden = !friends.length;
  el.outgoingHead.hidden = !outgoing.length;

  // One honest line when chat/trades/gifts cannot work yet.
  el.friendsStale.hidden = account.socialTablesReady();
  if (!account.socialTablesReady()) {
    el.friendsStale.textContent = t('schemaOldNote');
  }

  const nothing = !friends.length && !incoming.length && !outgoing.length && !results.length;
  el.friendsEmpty.hidden = !nothing;
  if (nothing) {
    el.friendsEmptyMark.innerHTML = iconSvg('friends', { size: 46 });
    el.friendsEmptyText.textContent = t('friendsEmpty');
  }
  reveal(el.friendsList.children, { step: 26, from: 10 });
}

/* --- a friend's profile ----------------------------------------------------------------------------------------- */

function openFriend(entry) {
  state.viewing = entry;
  renderFriend();
  showScreen('friend');
  loadFriendCards(entry);
}

function renderFriend() {
  const entry = state.viewing;
  if (!entry) return;
  const person = entry.profile;
  const level = person.level ?? 1;
  const online = account.isOnline(person);

  el.friendBack.innerHTML = iconSvg('chevronLeft', { size: 18 });
  el.friendName.textContent = person.username ?? '';
  friendRing.set(0, String(level));
  el.friendLevel.textContent = t('profileLevel', { n: level });
  el.friendRank.innerHTML = (online === null ? ''
    : `<span class="presence-dot is-inline${online ? ' is-online' : ''}"></span> `
      + esc(online ? t('friendOnline') : t('friendOffline')) + ' · ')
    + esc(tx(rankFor(level).name));
  el.friendCardsLabel.textContent = t('friendAlbums');
  el.friendRemove.textContent = t('friendsRemove');

  // What you can do with a friend, in one row.
  const actionBtn = (icon, labelKey, run, kind = 'btn-ghost') => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-sm ${kind}`;
    btn.innerHTML = `${iconSvg(icon, { size: 15 })}<span style="margin-left:6px">${esc(t(labelKey))}</span>`;
    press(btn, { sound: null });
    btn.addEventListener('click', () => { synth.playTap(); run(); });
    return btn;
  };
  el.friendActions.replaceChildren(
    actionBtn('chat', 'chatOpen', () => openChat(entry), 'btn-primary'),
    actionBtn('trade', 'tradeOpen', () => openTradeSheet(entry)),
    actionBtn('gift', 'giftCardOpen', () => openGiftCard(entry)),
    actionBtn('packs', 'giftBoosterOpen', () => openGiftBooster(entry))
  );

  const best = rarityById(person.best_rarity);
  const stats = [
    [t('statCards'), (person.cards ?? 0).toLocaleString()],
    [t('statBoosters'), (person.boosters_opened ?? 0).toLocaleString()],
    [t('statValue'), formatAmount(person.collection_value ?? 0)],
    [t('statBest'), person.best_rarity && best ? tx(best.name) : t('none')],
    [t('statPlaytime'), formatDuration(person.play_ms ?? 0)],
    [t('statAccountAge'), new Date(person.created_at ?? Date.now())
      .toLocaleDateString(getLanguage(), { year: 'numeric', month: 'short', day: 'numeric' })]
  ];
  el.friendStats.replaceChildren(...stats.map(([label, value]) => {
    const cell = document.createElement('div');
    cell.className = 'stat-cell';
    cell.innerHTML = '<b></b><span></span>';
    cell.querySelector('b').textContent = value;
    cell.querySelector('span').textContent = label;
    return cell;
  }));
}

/**
 * Their cards. The server hands back the collection key alone, so this cannot
 * see their wallet or their settings even though they are in the same blob.
 */
async function loadFriendCards(entry) {
  el.friendAlbums.replaceChildren();
  el.friendCardsStatus.textContent = t('friendLoading');
  el.friendCardsStatus.className = 'find-status is-working';
  try {
    const cards = await account.friendCollection(entry.otherId);
    // Guard against a slow read landing after the player has moved on.
    if (state.viewing !== entry) return;
    if (cards === null) {
      el.friendCardsStatus.textContent = t('friendPrivate');
      el.friendCardsStatus.className = 'find-status is-muted';
      return;
    }
    el.friendCardsStatus.textContent = cards.length ? '' : t('friendNoCards');
    el.friendCardsStatus.className = 'find-status is-muted';

    // Their collection, shown the way yours is: as albums. Tapping an
    // unlocked one lists its cards in a sheet.
    const albums = buildAlbums(cards, []).filter((a) => a.unlocked);
    el.friendAlbums.replaceChildren(...albums.map((album) => {
      // cloneNode drops buildAlbumCover's own click (which drives YOUR
      // collection); this cover opens the friend's album instead.
      const cover = buildAlbumCover(album).cloneNode(true);
      press(cover, { sound: null });
      cover.addEventListener('click', () => {
        synth.playTap();
        openFriendAlbum(entry, album);
      });
      return cover;
    }));
    reveal(el.friendAlbums.children, { step: 22, from: 10 });
  } catch (error) {
    if (state.viewing !== entry) return;
    el.friendCardsStatus.textContent = describeError(error);
    el.friendCardsStatus.className = 'find-status is-error';
  }
}

/** One of a friend's albums, as a sheet of its cards. */
function openFriendAlbum(entry, album) {
  openSheet(`${album.name} · ${entry.profile.username}`, (body) => {
    const grid = document.createElement('div');
    grid.className = 'sheet-card-grid';
    const sorted = [...album.entries]
      .sort((a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId));
    grid.replaceChildren(...sorted.map((card) => {
      const node = buildStaticCard(card, rarityById(card.rarityId), null, { fav: false });
      if ((card.count ?? 1) > 1) {
        const badge = document.createElement('span');
        badge.className = 'copy-badge';
        badge.textContent = `×${card.count}`;
        node.appendChild(badge);
      }
      return node;
    }));
    body.appendChild(grid);
  });
}

/* --- settings ------------------------------------------------------------------------------------------- */

function settingRow(key, titleKey, noteKey) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="switch row-action" type="button" role="switch"><span class="switch-knob"></span></button>`;
  row.querySelector('h4').textContent = t(titleKey);
  row.querySelector('p').textContent = t(noteKey);

  const button = row.querySelector('.switch');
  const paint = () => {
    const on = Boolean(settings()[key]);
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-checked', String(on));
    button.setAttribute('aria-label', `${t(titleKey)}: ${on ? t('on') : t('off')}`);
  };
  paint();
  button.addEventListener('click', () => {
    settings()[key] = !settings()[key];
    store.saveProfile(state.profile);
    applySettings();
    paint();
    // Fires after the setting is applied, so turning sound on is audible and
    // turning it off is the last thing you hear.
    if (settings()[key] || key !== 'sound') { synth.resume(); synth.playToggle(Boolean(settings()[key])); }
  });
  return row;
}

function renderSettings() {
  el.settingsTitle.textContent = t('tabSettings');
  el.themeLabel.textContent = t('themeTitle');
  el.prefsLabel.textContent = t('prefsTitle');
  el.dataLabel.textContent = t('settingsData');

  // The theme picker previews each theme rather than naming it.
  const current = storedTheme();
  el.themeGrid.replaceChildren(...THEMES.map((theme) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `theme-card${theme.id === current ? ' is-on' : ''}`;
    card.dataset.theme = theme.id;
    card.innerHTML = `
      <span class="theme-swatch">${theme.swatch.map((c) => `<span style="background:${c}"></span>`).join('')}</span>
      <h4></h4><p></p>
      <span class="theme-check">${iconSvg('check', { size: 14 })}</span>`;
    card.querySelector('h4').textContent = tx(theme.name);
    card.querySelector('p').textContent = tx(theme.blurb);
    press(card, { sound: null });
    card.addEventListener('click', () => {
      if (theme.id === storedTheme()) return;
      useTheme(theme.id, { announce: true });
      renderSettings();
      // Everything already on screen has to be rebuilt in the new shape.
      renderPacks();
      renderShop();
      renderBinder();
    });
    return card;
  }));

  el.settingsList.replaceChildren(
    settingRow('sound', 'settingsSound', 'settingsSoundNote'),
    settingRow('flash', 'settingsFlash', 'settingsFlashNote'),
    settingRow('lowPower', 'settingsLowPower', 'settingsLowPowerNote'),
    settingRow('hints', 'settingsHints', 'settingsHintsNote')
  );

  const language = document.createElement('div');
  language.className = 'row';
  language.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <span class="chip row-action"></span>`;
  language.querySelector('h4').textContent = t('settingsLanguage');
  language.querySelector('p').textContent = t('settingsLanguageNote');
  language.querySelector('.chip').innerHTML =
    `${iconSvg('lock', { size: 13 })}<span>${LANGUAGES.find((l) => l.id === getLanguage())?.label ?? ''}</span>`;

  // Transferring a save is the only bridge across a reinstall or a new phone,
  // so it sits above the button that destroys one.
  const transferRow = document.createElement('div');
  transferRow.className = 'row';
  transferRow.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="btn btn-sm btn-ghost row-action" type="button"></button>`;
  transferRow.querySelector('h4').textContent = t('saveTitle');
  transferRow.querySelector('p').textContent = t('saveNote');
  const transferBtn = transferRow.querySelector('button');
  transferBtn.textContent = t('saveOpen');
  press(transferBtn, { sound: null });
  transferBtn.addEventListener('click', openTransfer);

  const resetRow = document.createElement('div');
  resetRow.className = 'row';
  resetRow.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="btn btn-sm btn-danger row-action" type="button"></button>`;
  resetRow.querySelector('h4').textContent = t('settingsReset');
  resetRow.querySelector('p').textContent = t('settingsResetNote');
  const resetBtn = resetRow.querySelector('button');
  press(resetBtn, { sound: null });
  paintResetButton(resetBtn);
  resetBtn.addEventListener('click', () => handleReset(resetBtn));

  el.dataList.replaceChildren(...accountRows(), language, transferRow, resetRow);
}

/**
 * The account block at the top of Data: who you are, whether the last change
 * reached the server, and the way out.
 *
 * A build with no backend says so plainly instead of pretending to have one:
 * there is nothing the player can do about it, but knowing their collection is
 * device-only is what tells them to use the save transfer below.
 */
function accountRows() {
  if (!account.configured) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div class="row-copy"><h4></h4><p></p></div>
      <span class="chip row-action">${iconSvg('cloud', { size: 13 })}</span>`;
    row.querySelector('h4').textContent = t('accountOfflineTitle');
    row.querySelector('p').textContent = t('accountOfflineNote');
    return [row];
  }

  const who = document.createElement('div');
  who.className = 'row';
  who.dataset.account = 'sync';
  who.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="btn btn-sm btn-ghost row-action" type="button"></button>`;
  who.querySelector('h4').textContent = t('accountSyncTitle');
  const syncBtn = who.querySelector('button');
  syncBtn.textContent = t('accountSyncNow');
  press(syncBtn, { sound: null });
  syncBtn.addEventListener('click', () => { synth.playTap(); flushSync(); });

  const out = document.createElement('div');
  out.className = 'row';
  out.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="btn btn-sm btn-ghost row-action" type="button"></button>`;
  out.querySelector('h4').textContent =
    t('accountSignedInAs', { name: state.account.profile?.username ?? '' });
  out.querySelector('p').textContent = t('accountSignOutNote');
  const outBtn = out.querySelector('button');
  outBtn.textContent = t('accountSignOut');
  press(outBtn, { sound: null });
  outBtn.addEventListener('click', () => { synth.playTap(); leaveAccount(); });

  paintSyncLine(who);

  // --- identity: avatar, username, who can see you, whether you look online.
  const rowShell = (titleKey, noteKey) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div class="row-copy"><h4></h4><p></p></div>`;
    row.querySelector('h4').textContent = t(titleKey);
    row.querySelector('p').textContent = t(noteKey);
    return row;
  };
  const rowButton = (row, label, run) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm btn-ghost row-action';
    btn.textContent = label;
    press(btn, { sound: null });
    btn.addEventListener('click', () => { synth.playTap(); run(btn); });
    row.appendChild(btn);
    return btn;
  };

  const avatarRow = rowShell('avatarTitle', 'avatarNote');
  const face = document.createElement('span');
  face.className = 'person-mark row-action';
  paintAvatarInto(face, state.account.profile);
  face.style.cursor = 'pointer';
  face.addEventListener('click', () => { synth.playTap(); openAvatarPicker(); });
  avatarRow.appendChild(face);

  const nameRow = rowShell('usernameTitle', 'usernameNote');
  rowButton(nameRow, t('usernameChange'), () => openUsernameChange());

  const visRow = rowShell('visibilityTitle', 'visibilityNote');
  const visOrder = ['public', 'friends', 'private'];
  const visLabel = (v) => t(`visibility_${v}`);
  rowButton(visRow, visLabel(state.account.profile?.visibility ?? 'public'), async (btn) => {
    const current = state.account.profile?.visibility ?? 'public';
    const next = visOrder[(visOrder.indexOf(current) + 1) % visOrder.length];
    btn.disabled = true;
    try {
      await account.updateProfileFields(userId(), { visibility: next });
      state.account.profile.visibility = next;
      btn.textContent = visLabel(next);
    } catch (error) { toast(esc(describeError(error)), 'error'); }
    btn.disabled = false;
  });

  const presRow = rowShell('presenceTitle', 'presenceNote');
  const presLabel = (v) => (v === 'hidden' ? t('presence_hidden') : t('presence_online'));
  rowButton(presRow, presLabel(state.account.profile?.presence ?? 'online'), async (btn) => {
    const next = (state.account.profile?.presence ?? 'online') === 'online' ? 'hidden' : 'online';
    btn.disabled = true;
    try {
      await account.updateProfileFields(userId(), { presence: next });
      state.account.profile.presence = next;
      btn.textContent = presLabel(next);
    } catch (error) { toast(esc(describeError(error)), 'error'); }
    btn.disabled = false;
  });

  // A project still on the older schema cannot store a picture, a visibility
  // or a presence — so rather than offering controls that fail on tap, say
  // plainly what is missing and what fixes it. Changing your name works on
  // every schema, so that row always stays.
  if (!account.socialSchemaReady()) {
    const stale = document.createElement('div');
    stale.className = 'row is-warning';
    stale.innerHTML = `<div class="row-copy"><h4></h4><p></p></div>
      <span class="chip row-action">${iconSvg('cloud', { size: 13 })}</span>`;
    stale.querySelector('h4').textContent = t('schemaOldTitle');
    stale.querySelector('p').textContent = t('schemaOldNote');
    return [who, stale, nameRow, out];
  }

  return [who, avatarRow, nameRow, visRow, presRow, out];
}

/** A new name, checked and claimed. */
function openUsernameChange() {
  openSheet(t('usernameTitle'), (body) => {
    body.innerHTML = `
      <p class="muted" style="font-size:.86rem;margin-bottom:14px" data-note></p>
      <input class="creator-input" type="text" maxlength="20" data-name
        autocapitalize="off" autocomplete="off" spellcheck="false" />
      <p class="find-status" data-status role="status" style="margin-top:8px"></p>
      <button class="btn btn-primary btn-block" type="button" data-save style="margin-top:12px"></button>`;
    body.querySelector('[data-note]').textContent = t('usernameSheetNote');
    const input = body.querySelector('[data-name]');
    input.value = state.account.profile?.username ?? '';
    const status = body.querySelector('[data-status]');
    const saveBtn = body.querySelector('[data-save]');
    saveBtn.textContent = t('usernameSave');
    press(saveBtn, { sound: null });
    saveBtn.addEventListener('click', async () => {
      const name = input.value.trim();
      if (!account.USERNAME_RE.test(name)) {
        status.textContent = t('usernameRules');
        status.className = 'find-status is-error';
        return;
      }
      saveBtn.disabled = true;
      status.textContent = t('usernameChecking');
      status.className = 'find-status is-working';
      try {
        const updated = await account.changeUsername(userId(), name);
        if (!updated) {
          status.textContent = t('authNameTaken');
          status.className = 'find-status is-error';
          saveBtn.disabled = false;
          return;
        }
        state.account.profile = updated;
        toast(t('usernameChanged', { name: esc(name) }));
        synth.playResolved();
        sheet.hide();
        renderSettings();
      } catch (error) {
        status.textContent = describeError(error);
        status.className = 'find-status is-error';
        saveBtn.disabled = false;
      }
    });
  });
}

/** When the save last reached the server, in words. */
function paintSyncLine(row) {
  const line = row?.querySelector('p');
  if (!line) return;
  if (state.account.syncing) { line.textContent = t('accountSyncing'); return; }
  if (state.account.failed) { line.textContent = t('accountSyncFailed'); return; }
  if (!state.account.syncedAt) { line.textContent = t('accountSyncNote'); return; }
  const mins = Math.floor((Date.now() - state.account.syncedAt) / 60000);
  line.textContent = t('accountSynced', {
    when: mins < 1 ? t('accountJustNow') : t('accountMinsAgo', { n: mins })
  });
}

/** Repaint just the sync line, which changes without the screen being rebuilt. */
const renderAccountRow = () => paintSyncLine(el.dataList.querySelector('[data-account="sync"]'));

/**
 * Copy the save out, or paste one back in.
 *
 * Presented as text rather than a file because a WebView cannot reliably hand
 * the player a download, and because text survives being pasted into a note,
 * a message to yourself, or anywhere else that will still be there after the
 * app is gone.
 */
function openTransfer() {
  openSheet(t('saveTitle'), (body) => {
    body.innerHTML = `
      <p style="margin-bottom:16px" data-intro></p>

      <div class="row" style="display:grid;gap:12px">
        <div class="row-copy"><h4 data-out-t></h4><p data-out-n></p></div>
        <textarea class="filter-input no-drag" data-out rows="4" readonly spellcheck="false"
                  style="font-family:ui-monospace,monospace;font-size:.7rem;resize:none"></textarea>
        <button class="btn btn-sm btn-primary" type="button" data-copy></button>
      </div>

      <div class="row" style="display:grid;gap:12px;margin-top:10px">
        <div class="row-copy"><h4 data-in-t></h4><p data-in-n></p></div>
        <textarea class="filter-input no-drag" data-in rows="4" spellcheck="false"
                  style="font-family:ui-monospace,monospace;font-size:.7rem;resize:none"></textarea>
        <p class="muted" style="font-size:.76rem;min-height:1.2em" data-status></p>
        <button class="btn btn-sm btn-ghost" type="button" data-load></button>
      </div>`;

    body.querySelector('[data-intro]').textContent = t('saveIntro');
    body.querySelector('[data-out-t]').textContent = t('saveExport');
    body.querySelector('[data-out-n]').textContent = t('saveExportNote');
    body.querySelector('[data-in-t]').textContent = t('saveImport');
    body.querySelector('[data-in-n]').textContent = t('saveImportNote');

    const out = body.querySelector('[data-out]');
    out.value = exportSave();
    out.addEventListener('focus', () => out.select());

    const copy = body.querySelector('[data-copy]');
    copy.textContent = t('saveCopy');
    press(copy, { sound: null });
    copy.addEventListener('click', async () => {
      const ok = await copyText(out.value);
      copy.textContent = ok ? t('saveCopied') : t('saveCopyManually');
      if (ok) synth.playCoins(); else { out.focus(); out.select(); synth.playDenied(); }
      setTimeout(() => { copy.textContent = t('saveCopy'); }, 2600);
    });

    const input = body.querySelector('[data-in]');
    input.placeholder = t('savePastePlaceholder');
    const status = body.querySelector('[data-status]');
    const load = body.querySelector('[data-load]');
    load.textContent = t('saveLoad');
    press(load, { sound: null });

    let armed = false;
    const paint = () => {
      load.textContent = armed ? t('saveLoadConfirm') : t('saveLoad');
      load.classList.toggle('btn-danger', armed);
      load.classList.toggle('is-armed', armed);
    };

    // Offer to fill it from the clipboard where the WebView allows it.
    readText().then((text) => {
      if (text && parseSave(text) && !input.value) {
        input.value = text;
        input.dispatchEvent(new Event('input'));
      }
    });

    input.addEventListener('input', () => {
      armed = false;
      paint();
      const text = input.value.trim();
      if (!text) { status.textContent = ''; status.style.color = ''; return; }
      const summary = describeSave(text);
      if (!summary) {
        status.textContent = t('saveUnreadable');
        status.style.color = 'var(--negative)';
        return;
      }
      status.innerHTML = t('saveFound', {
        cards: summary.cards.toLocaleString(),
        level: summary.level,
        amount: money(summary.wallet)
      });
      status.style.color = 'var(--positive)';
    });

    // Arm then confirm: importing replaces everything already here.
    load.addEventListener('click', async () => {
      const text = input.value.trim();
      if (!describeSave(text)) {
        status.textContent = t('saveUnreadable');
        status.style.color = 'var(--negative)';
        synth.playDenied();
        return;
      }
      if (!armed) {
        armed = true;
        paint();
        synth.playArm();
        setTimeout(() => { armed = false; paint(); }, 5000);
        return;
      }
      const before = exportSave();
      if (!importSave(text)) {
        status.textContent = t('saveUnreadable');
        synth.playDenied();
        return;
      }
      // Signed in, the account is what gets read on the next launch, so an
      // import that only reached the device would be overwritten by it. Take
      // the imported save up before reloading, and put the old one back if
      // that fails rather than leaving a save that is about to be discarded.
      if (signedIn() && state.account.profile) {
        clearTimeout(syncTimer);
        status.textContent = t('accountSyncing');
        status.style.color = '';
        try {
          await account.pushSave(userId());
        } catch (error) {
          importSave(before);
          status.textContent = describeError(error);
          status.style.color = 'var(--negative)';
          synth.playDenied();
          return;
        }
      }
      location.reload();
    });
    paint();
  });
}

let resetArmed = false;
let resetTimer = null;

function paintResetButton(button) {
  button.textContent = resetArmed ? t('settingsResetConfirm') : t('settingsReset');
  button.classList.toggle('is-armed', resetArmed);
}

/** Same arm-then-confirm shape as selling a card: the button is the dialog. */
function handleReset(button) {
  if (!resetArmed) {
    resetArmed = true;
    paintResetButton(button);
    synth.playArm();
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => { resetArmed = false; paintResetButton(button); }, 5000);
    return;
  }
  wipeEverything();
}

/**
 * Erase everything — including the copy on the server.
 *
 * Clearing only the device would erase nothing: the account's save would be
 * pulled straight back down on the next launch. The server goes first, so a
 * failure there leaves the player exactly where they were rather than
 * half-erased.
 */
async function wipeEverything() {
  if (signedIn() && state.account.profile) {
    clearTimeout(syncTimer);
    try {
      await account.clearSave(userId());
    } catch (error) {
      toast(esc(describeError(error)), 'error');
      synth.playDenied();
      return;
    }
  }
  ['packywiki.collection.v3', 'packywiki.wallet.v1', 'packywiki.inventory.v1',
   'packywiki.profile.v1', 'packywiki.customPacks.v2', 'packywiki.language',
   'packywiki.ripDirection', THEME_KEY].forEach((key) => {
    try { localStorage.removeItem(key); } catch { /* nothing to remove */ }
  });
  location.reload();
}

function applySettings() {
  const s = settings();
  document.documentElement.dataset.lowpower = s.lowPower ? '1' : '0';
  document.documentElement.dataset.hints = s.hints ? '1' : '0';
  synth.setMuted(!s.sound);
  backdrop.setLowPower(s.lowPower);
}

/* --- daily gift -------------------------------------------------------------------------------------------- */

/**
 * A gift's one-line description. Returns MARKUP, not text: the coins case
 * embeds the drawn Buckarooz glyph. Every caller renders it as HTML.
 */
function giftLabel(gift) {
  if (gift.kind === 'coins') return t('giftCoins', { amount: money(gift.coins) });
  if (gift.kind === 'card') return t('giftCard');
  return t('giftBooster');
}

/** One stop on the month's trail. */
function giftStop(slot, status) {
  const { gift } = slot;
  const milestone = slot.day % 7 === 0 || slot.day === BOARD_SIZE;
  const stop = document.createElement('div');
  stop.className = `gift-stop is-${status} is-${gift.kind}${milestone ? ' is-milestone' : ''}`;
  stop.innerHTML = `
    <span class="gift-stop-node"><span class="gift-stop-art"></span></span>
    <span class="gift-stop-day tabular"></span>`;
  stop.querySelector('.gift-stop-day').textContent = String(slot.day);
  const art = stop.querySelector('.gift-stop-art');
  if (status === 'claimed') art.innerHTML = iconSvg('check', { size: milestone ? 18 : 14 });
  else if (gift.kind === 'coins') art.innerHTML = buckSvg({ size: milestone ? 18 : 13 });
  else if (gift.kind === 'card') art.innerHTML = iconSvg('collection', { size: milestone ? 19 : 14 });
  else art.innerHTML = iconSvg('packs', { size: milestone ? 19 : 14 });
  return stop;
}

function openDaily({ auto = false } = {}) {
  // Auto-opening happens once a day. Dismissing without claiming leaves the
  // gift waiting and the badge lit, without the dialog reappearing every time
  // the app is reopened.
  if (auto) {
    const today = dayNumber();
    if (state.profile.daily.shownDay === today) return;
    state.profile.daily.shownDay = today;
    store.saveProfile(state.profile);
  }
  openSheet(t('dailyTitle'), buildDailyBody);
}

function buildDailyBody(body) {
  const daily = state.profile.daily;
  const board = generateBoard(daily.board ?? 0);
  const next = nextGiftIndex(daily);
  const ready = canClaim(daily);
  const today = board[next];

  body.innerHTML = `
    <div class="daily-hero${ready ? ' is-ready' : ''}">
      <button class="present" type="button" data-claim aria-label="">
        <span class="present-glow" aria-hidden="true"></span>
        <span class="present-lid" aria-hidden="true"></span>
        <span class="present-box" aria-hidden="true">
          <span class="present-ribbon-v"></span>
        </span>
      </button>
      <div class="daily-copy">
        <b data-headline></b>
        <span data-status class="tabular"></span>
      </div>
    </div>
    <div class="gift-trail-wrap">
      <p class="label" data-board style="margin-bottom:8px"></p>
      <div class="gift-trail"></div>
    </div>`;

  body.querySelector('[data-board]').textContent = t('dailyBoard', { n: (daily.board ?? 0) + 1 });

  const headline = body.querySelector('[data-headline]');
  const status = body.querySelector('[data-status]');
  const present = body.querySelector('.present');
  if (ready) {
    headline.innerHTML = t('dailyTapToOpen');
    status.innerHTML = `${t('dailyDayN', { n: today.day })} · ${giftLabel(today.gift)}`;
    present.setAttribute('aria-label', t('dailyClaim'));
    press(present, { sound: null });
    present.addEventListener('click', () => {
      if (present.classList.contains('is-opening')) return;
      synth.resume();
      present.classList.add('is-opening');
      // The lid pops, the reward bursts out, then the sheet repaints claimed.
      const rect = present.getBoundingClientRect();
      spawnBurst({ shapes: ['star4', 'orb'], colors: ['#fbbf24', '#f8fafc', '#f472b6'],
        count: 22, spread: 1.15, gravity: 0.3 },
        { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.35 }, { scale: 0.9 });
      fireFlash(0.25, '#fbbf24');
      setTimeout(() => claimGift(body), 420);
    }, { once: true });
  } else {
    headline.textContent = t('dailyClaimed');
    status.textContent = t('dailyNextIn', { time: formatCountdown(msUntilNextDay()) });
  }

  const trail = body.querySelector('.gift-trail');
  trail.replaceChildren(...board.map((slot) => giftStop(
    slot,
    slot.index < next ? 'claimed' : slot.index === next ? (ready ? 'ready' : 'next') : 'locked'
  )));
  // Bring the current stop into view, roughly centred.
  const current = trail.children[next];
  if (current) trail.scrollLeft = Math.max(0, current.offsetLeft - trail.clientWidth / 2 + 20);
}

function grantGift(gift) {
  if (gift.kind === 'coins') {
    store.saveWallet(store.loadWallet() + gift.coins);
    refreshWallet();
  } else {
    store.addBooster(state.inventory, gift.spec, 1);
    renderPacks();
  }
  synth.playGift();
}

function claimGift(body) {
  const slot = claimDaily(state.profile.daily);
  if (!slot) return;
  store.saveProfile(state.profile);
  grantGift(slot.gift);
  toast(t('dailyGot', { reward: giftLabel(slot.gift) }), 'ok');
  buildDailyBody(body);
  updateBadges();
}

/* --- wallet and odds ------------------------------------------------------------------------------------------ */

function openWallet() {
  openSheet(t('walletTitle'), (body) => {
    body.innerHTML = `
      <p style="font-size:2rem;font-weight:800;color:var(--positive);display:flex;align-items:baseline;gap:3px;margin-bottom:8px" data-balance></p>
      <p style="margin-bottom:16px" data-what></p>
      <div class="row"><div class="row-copy"><h4 data-earn-t></h4><p data-earn></p></div></div>
      <div class="row"><div class="row-copy"><h4 data-spend-t></h4><p data-spend></p></div></div>
      <p class="muted" style="font-size:.78rem;line-height:1.55;margin-top:16px" data-note></p>`;
    body.querySelector('[data-balance]').innerHTML = money(state.wallet);
    body.querySelector('[data-what]').textContent = t('walletWhat');
    body.querySelector('[data-earn-t]').textContent = t('walletEarnTitle');
    body.querySelector('[data-earn]').textContent = t('walletEarn');
    body.querySelector('[data-spend-t]').textContent = t('walletSpendTitle');
    body.querySelector('[data-spend]').textContent = t('walletSpend');
    body.querySelector('[data-note]').textContent = t('walletNote');
  });
}

function openOdds() {
  openSheet(t('pullRates'), (body) => {
    const pct = (n) => (n >= 1 ? `${n.toFixed(1)}%` : `${n.toFixed(2)}%`);
    body.innerHTML = `
      <p style="margin-bottom:16px" data-note></p>
      <table class="odds-table">
        <thead><tr><th></th><th></th></tr></thead>
        <tbody></tbody>
      </table>`;
    body.querySelector('[data-note]').textContent = t('oddsNote');
    const [h1, h2] = body.querySelectorAll('th');
    h1.textContent = t('rarity');
    h2.textContent = t('chance');
    body.querySelector('tbody').replaceChildren(...oddsTable().map(({ rarity, percent }) => {
      const row = document.createElement('tr');
      row.innerHTML = `<td><span class="odds-name"><span class="odds-swatch"></span><span></span></span></td><td class="odds-pct"></td>`;
      const swatch = row.querySelector('.odds-swatch');
      swatch.style.color = rarity.color;
      swatch.style.background = rarity.color;
      const label = row.querySelector('.odds-name span:last-child');
      label.textContent = tx(rarity.name);
      label.style.color = rarity.color;
      row.querySelector('.odds-pct').textContent = pct(percent);
      return row;
    }));
  });
}

/* --- first run --------------------------------------------------------------------------------------------------- */

function showWelcome() {
  el.welcomeMark.innerHTML = logoSvg({ size: 62 });
  el.welcomeTitle.textContent = t('welcomeTitle');
  el.welcomeBody.textContent = t('welcomeBody');
  el.langChoices.replaceChildren(...LANGUAGES.map((lang) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `choice lang-choice${lang.id === getLanguage() ? ' is-on' : ''}`;
    button.dataset.lang = lang.id;
    button.innerHTML = `<span>${lang.label}</span><span>${iconSvg('chevron', { size: 16 })}</span>`;
    press(button, { sound: null });
    button.addEventListener('click', () => {
      setLanguage(lang.id);
      synth.resume();
      synth.playTap();
      showStarter();
    });
    return button;
  }));
  el.starter.hidden = true;
  el.welcome.hidden = false;
}

function showStarter() {
  applyStrings();
  el.welcomeTitle.textContent = t('welcomeTitle');
  el.welcomeBody.textContent = t('welcomeBody');
  el.langChoices.querySelectorAll('.lang-choice').forEach((b) =>
    b.classList.toggle('is-on', b.dataset.lang === getLanguage()));

  store.grantStarter(state.profile);
  const starters = shuffle(THEME_PACKS).slice(0, STARTER_PACKS).map((theme) => ({
    kind: 'theme', themeId: theme.id, rarityId: null, cards: STARTER_PACK_CARDS
  }));
  starters.forEach((spec) => store.addBooster(state.inventory, spec, 1));
  refreshWallet();

  el.starterTitle.textContent = t('starterTitle');
  el.starterBody.innerHTML = t('starterBody', { coins: money(STARTER_COINS), packs: STARTER_PACKS });
  el.starterLoot.replaceChildren(...starters.map((spec) => buildBooster(spec, { size: 'is-tiny' })));
  el.starterGo.textContent = t('letsGo');
  el.starter.hidden = false;
  synth.playFanfare();

  renderPacks();
  renderShop();
  renderBinder();
  updateBadges();
}

/* --- strings --------------------------------------------------------------------------------------------------------- */

function applyStrings() {
  document.documentElement.lang = getLanguage();
  el.menuIcon.innerHTML = iconSvg('menu', { size: 20 });
  el.bellIcon.innerHTML = iconSvg('bell', { size: 19 });
  el.giftIcon.innerHTML = iconSvg('gift', { size: 19 });
  el.walletMark.innerHTML = buckSvg({ size: 12 });
  el.sheetClose.innerHTML = iconSvg('close', { size: 17 });
  el.openBack.innerHTML = iconSvg('chevronLeft', { size: 18 });
  el.oddsLabel.textContent = t('pullRates');
  el.packsEmptyCta.textContent = t('goShop');
  el.menuBtn.setAttribute('aria-label', t('menu'));
  el.bell.setAttribute('aria-label', t('notifTitle'));

  nav?.setLabels({
    packs: t('tabBoosters'), timed: t('tabTimed'), shop: t('tabShop'),
    binder: t('tabCollection'), profile: t('tabProfile')
  });
  packsSeg?.relabel([{ label: t('owned') }, { label: t('tabCustom') }]);
  gateSeg?.relabel([{ label: t('gateSignIn') }, { label: t('gateSignUp') }]);
  if (!el.gate.hidden) showGate();
}

/* --- wiring ------------------------------------------------------------------------------------------------------------ */

function init() {
  useTheme(storedTheme());
  el.splashMark.innerHTML = logoSvg({ size: 78 });
  backdrop.mount(el.backdrop).setTheme(storedTheme());

  // Cards without a picture no longer exist: draws refuse them now, and any
  // already in the collection are swept out once here.
  const pruned = store.pruneImagelessCards(state.collection);
  if (pruned) console.info(`Removed ${pruned} pictureless card(s) from the collection`);

  walletOdo = new Odometer(el.walletAmount);
  levelRing = new Ring(el.levelBadge, { size: 40, width: 3 });
  profileRing = new Ring(el.profileRing, { size: 62, width: 4 });
  friendRing = new Ring(el.friendRing, { size: 62, width: 4 });
  freeRing = new Ring(el.freeRing, { size: 132, width: 8 });
  xpBar = new Bar(el.xpBar);
  trackBar = new Bar(el.trackBar);

  packsRail = new Rail(el.packsRail, { onFocus: paintPackCaption });
  sheet = new Sheet(el.sheet);

  packsSeg = new Segmented(el.packsSeg, [
    { id: 'owned', label: t('owned') },
    { id: 'custom', label: t('tabCustom') }
  ], (mode) => { state.packMode = mode; renderPacks(); });

  nav = new NavBar(el.navbar, [
    { id: 'shop', icon: iconSvg('gem', { size: 21 }) },
    { id: 'timed', icon: iconSvg('clock', { size: 21 }) },
    { id: 'packs', icon: iconSvg('packs', { size: 21 }) },
    { id: 'binder', icon: iconSvg('collection', { size: 21 }) },
    { id: 'profile', icon: iconSvg('profile', { size: 21 }) }
  ], (id) => {
    // Every destination repaints on arrival: the shelf, the wallet and the
    // counters can all have changed while the player was somewhere else.
    if (id === 'packs') renderPacks();
    if (id === 'binder') renderBinder();
    if (id === 'shop') { payStipend(); renderShop(); }
    if (id === 'timed') renderTimed();
    // A friend request arrives while you are elsewhere, so the count on the
    // way past the Profile is refreshed rather than remembered.
    if (id === 'profile') { renderProfile(); loadFriends(); }
    showScreen(id);
  });

  applySettings();
  applyStrings();
  refreshWallet();
  refreshLevelBadge();
  updateBadges();
  initSwipe();

  renderPacks();
  renderShop();
  renderBinder();
  // Pack art is language-specific, so it waits until a language exists.

  [el.wallet, el.menuBtn, el.bell, el.giftBtn, el.levelBadge, el.packsOpen, el.timedOpen,
   el.filterOpen, el.openBack, el.openDone, el.sheetClose, el.starterGo,
   el.packsEmptyCta, el.creatorGo, el.findGo, el.friendBack,
   el.friendRemove, el.gateAlt, el.oddsBtn].forEach((node) => press(node, { sound: null }));

  el.wallet.addEventListener('click', openWallet);
  el.bell.addEventListener('click', openNotifications);
  el.giftBtn.addEventListener('click', () => openDaily());
  el.menuBtn.addEventListener('click', () => (el.drawer.hidden ? openDrawer() : closeDrawer()));
  el.drawerScrim.addEventListener('click', closeDrawer);
  el.levelBadge.addEventListener('click', () => { renderProfile(); showScreen('profile'); });

  el.oddsIcon.innerHTML = iconSvg('gem', { size: 15 });
  el.oddsBtn.addEventListener('click', openOdds);
  document.querySelectorAll('.help-btn').forEach((button) => {
    press(button, { sound: null });
    button.addEventListener('click', () => { synth.playTap(); openHelp(button.dataset.help); });
  });
  el.filterOpen.addEventListener('click', openFilters);
  el.chatBack.addEventListener('click', () => {
    clearInterval(chatTimer);
    state.chat = null;
    renderFriends();
    showScreen('friends');
  });
  el.chatForm.addEventListener('submit', sendChat);
  el.albumBack.addEventListener('click', () => {
    synth.playSheet(false);
    state.album = null;
    renderBinder();
  });
  // Turning pages is a swipe across the open book.
  el.albumBook.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.card')) { /* a tap on a card still opens it */ }
    trackDrag(event, {
      onMove: () => {},
      onEnd: (dx) => { if (Math.abs(dx) > 42) turnAlbumPage(dx < 0 ? 1 : -1); }
    });
  });
  el.packsEmptyCta.addEventListener('click', () => { payStipend(); renderShop(); showScreen('shop'); });
  el.creator.addEventListener('submit', createCustomPack);

  const leaveOpen = () => {
    const home = homeTabFor(state.spec);
    if (home === 'timed') renderTimed();
    else renderPacks();
    showScreen(home);
  };
  el.openBack.addEventListener('click', leaveOpen);
  el.openDone.addEventListener('click', leaveOpen);

  el.sheetClose.addEventListener('click', () => sheet.hide());
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!el.drawer.hidden) closeDrawer();
    else if (sheet.open) sheet.hide();
  });

  // Accounts and friends.
  el.gateForm.onsubmit = submitGate;
  el.gateAlt.onclick = gateAltAction;
  el.find.addEventListener('submit', runSearch);
  el.friendBack.addEventListener('click', () => {
    state.viewing = null;
    synth.playTap();
    renderFriends();
    showScreen('friends');
  });
  el.friendRemove.addEventListener('click', () => {
    const entry = state.viewing;
    if (!entry) return;
    // Armed the same way selling a card is: the second tap is the one that acts.
    if (el.friendRemove.dataset.armed !== '1') {
      el.friendRemove.dataset.armed = '1';
      el.friendRemove.textContent = t('friendsRemoveConfirm');
      el.friendRemove.classList.add('btn-danger');
      synth.playArm();
      setTimeout(() => {
        el.friendRemove.dataset.armed = '';
        el.friendRemove.textContent = t('friendsRemove');
        el.friendRemove.classList.remove('btn-danger');
      }, 4000);
      return;
    }
    el.friendRemove.dataset.armed = '';
    el.friendRemove.textContent = t('friendsRemove');
    el.friendRemove.classList.remove('btn-danger');
    state.viewing = null;
    showScreen('friends');
    socialAction(() => account.removeFriendship(entry.id), 'friendsRemoved');
  });

  el.starterGo.addEventListener('click', () => {
    el.welcome.hidden = true;
    synth.playTap();
    showScreen('packs');
    if (canClaim(state.profile.daily)) openDaily({ auto: true });
  });

  // Playtime is measured between visibility changes, and both the clock and
  // the backdrop are parked entirely while the app is in the background.
  document.addEventListener('visibilitychange', () => {
    const visible = document.visibilityState === 'visible';
    if (visible) {
      visibleSince = Date.now();
      syncTimed();
      updateBadges();
      // Coming back is the natural moment to retry anything that did not land,
      // and to pick up what happened while the app was away.
      resumeAccount();
    } else {
      stopSocialPoll();
      flushPlaytime();
      visibleSince = null;
      synth.suspend();
      // Leaving is the last chance to get the save up before the WebView is
      // frozen, so this one does not wait out the debounce.
      flushSync();
    }
    backdrop.setPaused(!visible || document.documentElement.classList.contains('is-immersive'));
    syncTicker();
  });
  window.addEventListener('pagehide', () => { flushPlaytime(); flushSync(); });

  backdrop.start();
  startSession();
}

/**
 * Decide what the player sees first.
 *
 * With a backend: nothing until there is a session, because the account is
 * what everything else is filed under. Without one, the app is exactly what it
 * was before accounts existed — local, and honest about it in Settings.
 */
async function startSession() {
  if (!account.configured) {
    if (!languageChosen() || !state.profile.started) showWelcome();
    else {
      payStipend();
      if (canClaim(state.profile.daily)) openDaily({ auto: true });
    }
    return endSplash();
  }

  onSaveChanged(syncSoon);
  // Fires on every sign-in and sign-out, so there is one path into the app
  // rather than two. It also reports the stored session at launch, but that
  // is not guaranteed across client versions, so the session is read directly
  // as well; onSession() ignores the second of the two.
  account.onAuthChange((session) => { onSession(session); });

  /*
   * Read the stored session BEFORE deciding what to show.
   *
   * The gate used to be painted immediately and taken away once the session
   * came back, which meant a sign-in card flashed up on every single launch
   * for anyone already signed in. Reading the session is a local, fast
   * operation, so the splash covers it and nothing else is shown until the
   * answer is known.
   */
  try {
    await onSession(await account.currentSession());
  } catch {
    showGate();
    endSplash();
  }
}

/* --- the splash ---------------------------------------------------------------------
 *
 * Covers the first moment of a launch: the mark draws itself in while the
 * stored session is read, so the app appears already decided rather than
 * flickering through the gate on its way to the shelf.
 */
const SPLASH_MIN = 900;
const splashStart = performance.now();
let splashDone = false;

function endSplash() {
  if (splashDone) return;
  splashDone = true;
  // Hold it long enough to be an entrance rather than a flash of colour, but
  // never add waiting on a launch that was already slow.
  const wait = Math.max(0, SPLASH_MIN - (performance.now() - splashStart));
  setTimeout(() => {
    el.splash.classList.add('is-going');
    setTimeout(() => { el.splash.hidden = true; }, 460);
  }, wait);
}

let packsRail;
init();

window.__packywiki = {
  state, store, debug, RARITIES, synth, backdrop, THEMES,
  draw: drawArticles, generateShop, syncSocial,
  setTheme: (id) => { useTheme(id); renderPacks(); renderShop(); renderBinder(); renderSettings(); },
  debugRarity(id) {
    const forced = rarityById(id);
    document.querySelectorAll('.card').forEach((card) => {
      applyRarityVars(card, forced);
      const badge = card.querySelector('.rarity-badge');
      if (badge) badge.textContent = tx(forced.name);
    });
    return forced;
  },
  grant(amount = 10000) { store.saveWallet(store.loadWallet() + amount); refreshWallet(); },
  giveBooster(spec) { store.addBooster(state.inventory, spec, 1); renderPacks(); },
  giveTimed(n = 5) { state.profile.timed.count += n; store.saveProfile(state.profile); renderTimed(); updateBadges(); },
  addXp(amount = 5000) {
    const levels = addXp(state.profile.progress, amount);
    if (levels.length) state.profile.pendingLevels.push(...levels);
    store.saveProfile(state.profile);
    refreshLevelBadge();
    drainLevelUps();
    return state.profile.progress;
  },
  timedScarcity: timedTopScarcity,
  resetAll: wipeEverything
};
