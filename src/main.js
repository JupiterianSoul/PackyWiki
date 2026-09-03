/**
 * WIKSTER - application shell.
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
import { RARITIES, rarityById, rarityRank, rarityFromPopularity, rarityOfCard } from './data/rarities.js';
import { oddsRows } from './data/odds.js';
import { FX_STYLES, DEFAULT_FX, fxById, fxCost, fxUnlocked } from './data/fx.js';
import * as odds from './data/odds.js';
import { iconSvg, logoSvg, buckSvg } from './data/icons.js';
import { drawArticles, resolveCustomWiki, fetchArticleText, translateCard, refreshTitleCard, fetchViewsFor } from './wiki.js';
import {
  priceFor, formatAmount, formatViews, bandFor, POPULARITY_BANDS,
  popularityFromViews, popularityFromWordCount
} from './pricing.js';
import {
  boosterPrice, sellPriceFor, nextRefreshAt, windowIndexAt, drawCapsFor,
  nextFreeAt, freeWindowAt, STARTER_PACKS, STARTER_PACK_CARDS, STARTER_COINS
} from './economy.js';
import { generateShop, formatCountdown } from './shop.js';
import { CUSTOM_CARD_RANGE, BUNDLE_SIZE, BUNDLE_OFF_PCT } from './economy.js';
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
  regenMs, levelBounds, levelProgress, timedTopTier
} from './timed.js';
import { t, tx, getLanguage, setLanguage, languageChosen, LANGUAGES } from './i18n.js';
import {
  exportSave, importSave, describeSave, parseSave, copyText, readText, onSaveChanged
} from './save.js';
import * as account from './account.js';
import { BUILD, checkForUpdate, goToLatest } from './version.js';

import { THEMES, DEFAULT_THEME, applyTheme, themeById } from './ui/themes.js';
import { buildPackElement, buildCardBack } from './packview.js';
import { buildAlbums, albumsDeep, albumsStarted, fetchAlbumTotal, albumKeyOf, customSlug, CARDS_PER_PAGE } from './albums.js';
import { RELEASES } from './data/releases.js';
import { music } from './ui/music.js';
import * as wikdle from './wikdle.js';
import { spinSlots, casinoOpen, SPIN_COST, REEL_STOP_MS, BONUS_STOP_MS, REEL_EASE } from './slots.js';
import { SYMBOLS, REEL, PAYLINES, PAYTABLE, LINE_BETS, WILD, SCATTER, SCATTER_MIN, BONUS_SPINS, symbolById, winTier } from './data/slots.js';
import * as quests from './quests.js';
import { QUEST_TIERS } from './data/quests.js';
import * as leaderboard from './leaderboard.js';
import { canRedeem, codeByInput, codeById, codeCardFor, codeLook, codeSpec, codeTitles, timesRedeemed, hasRedeemed, CREATOR, SPECIAL_RARITY_ID, RETIRED_CODES } from './codes.js';
import {
  quizAvailable, buildQuiz, questionCountFor, quizRewards,
  quizPlaysLeft, recordQuizPlay, QUIZ_PER_DAY
} from './quiz.js';
import { evaluate as evaluateAchievements, measure as measureAchievements, redeemableCount } from './achievements.js';
import { FRAME_STYLES, DEFAULT_FRAME_STYLE, frameStyleById, frameTier, frameSvg, frameUnlocked } from './frames.js';
import { BADGES, badgeStates, romanRank, badgeSvg } from './badges.js';
import { emblemSvg, monogramSvg } from './data/emblems.js';
import { proceduralStyle } from './packstyle.js';
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
const EMERGE_DURATION = 820;
/** Nothing waits on the network longer than this before the booster comes back. */
const DRAW_HARD_LIMIT = 18000;
const PREFETCH_DELAY = 350;
/** How long the last card stays up before the summary takes over. */
const LAST_CARD_HOLD = 2000;
const TILT_REACH = 110; // pixels of drag for a full lean

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

const THEME_KEY = 'wikster.theme';
const RIP_DIR_KEY = 'wikster.ripDirection';

/* --- state ----------------------------------------------------------------- */

const state = {
  tab: 'packs',
  packMode: 'owned',           // 'owned' | 'custom'
  spec: null,
  customPacks: store.loadCustomPacks(),
  collection: store.loadCollection(),
  inventory: store.loadInventory(),
  profile: store.loadProfile(),
  wallet: store.loadWallet(),
  frameStyle: store.loadFrameStyle() ?? DEFAULT_FRAME_STYLE,
  badgeLoadout: store.loadBadgeLoadout(),
  cardFx: store.loadCardFx(),
  market: {
    view: 'browse', auctions: [], myBids: store.loadMyBids(),
    search: '', sort: 'ending',
    timer: null, poll: null, unsub: null, settling: new Set(), busy: false
  },
  cardIndex: {
    rows: [], counts: null, search: '', rarity: null, sort: 'recent',
    page: 0, more: false, wishMode: false, busy: false
  },
  wishlist: new Map(store.loadWishlist().map((card) => [card.key, card])),
  wishSeen: new Set(store.loadWishSeen()),
  friendWishes: new Map(),
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
  binderView: store.loadBinderView(),   // 'albums' | 'classic'

  // Who is signed in, and what the server last told us about them.
  account: { session: null, profile: null, mode: 'signin', syncing: false, syncedAt: null, failed: false },
  // The friends screen, and whichever friend is being looked at.
  social: { friends: [], incoming: [], outgoing: [], results: [], loaded: false, unread: new Map(), trades: [] },
  viewing: null
};

/** Test-only switches, reachable through window.__wikster. */
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
    friend: $('#screen-friend'), chat: $('#screen-chat'), ach: $('#screen-ach'),
    updates: $('#screen-updates'), quiz: $('#screen-quiz'),
    customize: $('#screen-customize'), badges: $('#screen-badges'),
    market: $('#screen-market'), cardindex: $('#screen-cardindex'),
    glossary: $('#screen-glossary'), open: $('#screen-open'),
    games: $('#screen-games'), wikdle: $('#screen-wikdle'), slots: $('#screen-slots'),
    quests: $('#screen-quests'), leaderboard: $('#screen-leaderboard')
  },
  gamesTitle: $('#games-title'), gamesSub: $('#games-sub'), gamesList: $('#games-list'),
  wikdleTitle: $('#wikdle-title'), wikdleBody: $('#wikdle-body'), wikdleBack: $('#wikdle-back'),
  slotsTitle: $('#slots-title'), slotsBody: $('#slots-body'), slotsBack: $('#slots-back'),
  questsTitle: $('#quests-title'), questsSub: $('#quests-sub'), questsBody: $('#quests-body'),
  leaderboardTitle: $('#leaderboard-title'), leaderboardSeg: $('#leaderboard-seg'),
  leaderboardBody: $('#leaderboard-body'), leaderboardMe: $('#leaderboard-me'),
  backdrop: $('#backdrop'), navbar: $('#navbar'),
  menuBtn: $('#menu-btn'), menuIcon: $('#menu-icon'),
  giftBtn: $('#gift-btn'), giftIcon: $('#gift-icon'), giftDot: $('#gift-dot'),
  levelBadge: $('#level-badge'),
  wallet: $('#wallet'), walletMark: $('#wallet-mark'), walletAmount: $('#wallet-amount'),
  bell: $('#bell'), bellIcon: $('#bell-icon'), bellCount: $('#bell-count'),

  drawer: $('#drawer'), drawerScrim: $('#drawer .drawer-scrim'), drawerPanel: $('#drawer .drawer-panel'),
  drawerMark: $('#drawer-mark'), drawerWho: $('#drawer-who'), drawerLinks: $('#drawer-links'),
  updatesTitle: $('#updates-title'), updatesSub: $('#updates-sub'), updatesList: $('#updates-list'),
  quizTitle: $('#quiz-title'), quizBody: $('#quiz-body'), quizBack: $('#quiz-back'),
  splash: $('#splash'), splashMark: $('#splash-mark'),

  packsSeg: $('#packs-seg'), packsRail: $('#packs-rail'), packsCaption: $('#packs-caption'),
  packsName: $('#packs-name'), packsSub: $('#packs-sub'), packsOwn: $('#packs-own'),
  packsActions: $('#packs-actions'), packsOpen: $('#packs-open'), packsHint: $('#packs-hint'),
  packsEmpty: $('#packs-empty'), packsEmptyMark: $('#packs-empty-mark'),
  packsEmptyText: $('#packs-empty-text'), packsEmptyCta: $('#packs-empty-cta'),
  creatorWrap: $('#creator-wrap'), creator: $('#creator'), forgeSeal: $('#forge-seal'),
  forgeTitle: $('#forge-title'), forgeNote: $('#forge-note'), forgeIdeas: $('#forge-ideas'),
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

  shopTitle: $('#shop-title'), restock: $('#restock'), shopMarket: $('#shop-market'),
  shopPurse: $('#shop-purse'), shopPurseLabel: $('#shop-purse-label'),
  shopRestockLabel: $('#shop-restock-label'),

  oddsBtn: $('#odds-btn'), oddsIcon: $('#odds-icon'),

  binderTitle: $('#binder-title'), binderStats: $('#binder-stats'),
  albumShelf: $('#album-shelf'), albumView: $('#album-view'), albumBack: $('#album-back'),
  albumName: $('#album-name'), albumProgress: $('#album-progress'),
  binderSeg: $('#binder-seg'), binderSegWrap: $('#binder-seg-wrap'),
  binderTools: $('#binder-tools'), classicView: $('#classic-view'),
  classicFilter: $('#classic-filter'), classicFilterCount: $('#classic-filter-count'),
  classicCount: $('#classic-count'),
  albumBook: $('#album-book'), albumLeaf: $('#album-leaf'),
  pageSlots: $('#page-slots'), pageno: $('#pageno'),
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
  customizeTitle: $('#customize-title'), identityLabel: $('#identity-label'), identityList: $('#identity-list'),
  framesLabel: $('#frames-label'), framesNote: $('#frames-note'), frameStyles: $('#frame-styles'),
  fxLabel: $('#fx-label'), fxNote: $('#fx-note'), fxTiers: $('#fx-tiers'),
  badgesLabel: $('#badges-label'), badgeGrid: $('#badge-grid'),
  badgesTitle: $('#badges-title'), badgesIntro: $('#badges-intro'), badgesAll: $('#badges-all'),
  indexTitle: $('#index-title'), indexIntro: $('#index-intro'), indexCounts: $('#index-counts'),
  indexSearch: $('#index-search'), indexRarities: $('#index-rarities'), indexSorts: $('#index-sorts'),
  indexStatus: $('#index-status'), indexList: $('#index-list'), indexMore: $('#index-more'),
  glossaryTitle: $('#glossary-title'), glossaryIntro: $('#glossary-intro'), glossaryList: $('#glossary-list'),
  marketTitle: $('#market-title'), marketIntro: $('#market-intro'), marketSeg: $('#market-seg'),
  marketStatus: $('#market-status'), marketList: $('#market-list'), marketSell: $('#market-sell'),
  openPrev: $('#open-prev'), openNext: $('#open-next'),
  prefsLabel: $('#prefs-label'), settingsList: $('#settings-list'),
  accountLabel: $('#account-label'), accountList: $('#account-list'),
  dataLabel: $('#data-label'), dataList: $('#data-list'),
  redeemLabel: $('#redeem-label'), redeemList: $('#redeem-list'),

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

let playtimeCarry = 0;
function flushPlaytime() {
  if (visibleSince == null) return;
  const ms = Date.now() - visibleSince;
  store.addPlaytime(state.profile, ms);
  visibleSince = Date.now();
  // Whole minutes reach the day's quests; the remainder waits for the next flush.
  playtimeCarry += ms;
  const minutes = Math.floor(playtimeCarry / 60000);
  if (minutes > 0) { playtimeCarry -= minutes * 60000; for (let i = 0; i < minutes; i++) reportQuest('playtime'); }
}

/* --- toast -------------------------------------------------------------------- */

/** 6,912,930 reads as 6.9M: album totals are real category sizes now. */
function compactCount(n) {
  if (!Number.isFinite(n)) return '?';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

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
  // Inside the APK, the launcher icon follows the theme. In a browser the
  // bridge simply is not there.
  try { window.WiksterIcon?.setIcon(theme.id); } catch { /* browser build */ }
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

/*
 * DESKTOP: the rail IS the menu.
 *
 * On a phone the bottom bar carries five destinations and a drawer holds the
 * rest. Standing that bar up as a rail on a wide screen left the drawer still
 * there behind a hamburger, which is a menu button next to a menu: everything
 * in the drawer had room to sit in the rail all along.
 *
 * So the drawer's list is MOVED into the rail rather than copied into it. One
 * list means one place keeps the unread counts, the daily dot and the
 * achievement badges up to date, and no state can drift between two copies.
 * The links the rail already shows as destinations are hidden by CSS rather
 * than filtered here, so nothing about the phone layout has to know.
 */
const WIDE = matchMedia('(min-width: 1024px)');

function placeDrawerLinks() {
  const links = el.drawerLinks;
  const rail = document.querySelector('.navbar');
  if (!links || !rail) return;
  if (WIDE.matches) {
    if (links.parentElement !== rail) rail.appendChild(links);
  } else {
    const panel = document.querySelector('.drawer-panel');
    if (panel && links.parentElement !== panel) panel.appendChild(links);
  }
  document.documentElement.classList.toggle('is-wide', WIDE.matches);
}

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
  // The screen stays lit for a pack and is let go the moment it is done.
  if (immersive) holdWakeLock(); else releaseWakeLock();

  setTickerJob('shop', name === 'shop' ? tickRestock : null);
  setTickerJob('timed', name === 'timed' ? tickTimed : null);
  // The chat poll used to survive every exit but the back button, ticking
  // every ten seconds for the rest of the session on a screen nobody is
  // looking at. Leaving the room stops it.
  if (name !== 'chat' && chatTimer) { clearInterval(chatTimer); chatTimer = null; }
  // #app is the scroll container now, not the document.
  document.getElementById('app')?.scrollTo({ top: 0 });
}

/**
 * Settings and Friends have no destination of their own; both hang off the
 * Profile, so the bottom bar stays at five.
 */
const navTabFor = (screen) =>
  screen === 'market' ? 'shop'
    : screen === 'cardindex' ? 'binder'
      : screen === 'glossary' ? 'packs'
        : ['wikdle', 'slots'].includes(screen) ? 'games'
          : (['settings', 'customize', 'badges', 'friends', 'friend', 'chat', 'ach', 'updates', 'quiz', 'games', 'quests', 'leaderboard'].includes(screen) ? 'profile' : screen);

function refreshWallet() {
  state.wallet = store.loadWallet();
  walletOdo.set(state.wallet);
  el.wallet.setAttribute('aria-label', `${t('walletTitle')}: ${formatAmount(state.wallet)}`);
}

/* --- level frames ------------------------------------------------------------------------
 * The equipped style follows the account when there is one (so a second
 * device and your friends see the same frame) and falls back to the local
 * choice; the tier always comes from the level itself. */
const frameStyle = () =>
  state.account?.profile?.avatar?.frame?.style ?? state.frameStyle ?? DEFAULT_FRAME_STYLE;

/** Wrap (or unwrap) a circular element with a frame overlay. */
function paintFrameInto(node, styleId, tier) {
  let overlay = node.querySelector(':scope > .frame-overlay');
  const svg = tier >= 1 ? frameSvg(styleId, tier) : '';
  if (!svg) { overlay?.remove(); return; }
  if (!overlay) {
    overlay = document.createElement('span');
    overlay.className = 'frame-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    node.appendChild(overlay);
  }
  const stamp = `${styleId}:${tier}`;
  if (overlay.dataset.frame === stamp) return;
  overlay.dataset.frame = stamp;
  overlay.innerHTML = svg;
}

/** Equip a style: locally at once, and onto the account profile when it can
 *  carry it, riding in the avatar column so friends' apps receive it with
 *  the picture they already fetch. */
function pickFrameStyle(styleId) {
  state.frameStyle = styleId;
  store.saveFrameStyle(styleId);
  // The appbar paints the ACCOUNT's copy of the choice when there is one, so
  // adopt it there first; the server write below then just confirms it.
  if (state.account?.profile) {
    state.account.profile.avatar = { ...(state.account.profile.avatar ?? {}), frame: { style: styleId } };
  }
  refreshLevelBadge();
  if (signedIn() && account.socialSchemaReady()) {
    const merged = { ...(state.account.profile?.avatar ?? {}), frame: { style: styleId } };
    account.updateProfileFields(userId(), { avatar: merged })
      .then(() => { if (state.account.profile) state.account.profile.avatar = merged; })
      .catch((error) => console.error('frame sync failed:', error?.message ?? error));
  }
}

function refreshLevelBadge() {
  const level = state.profile.progress.level ?? 1;
  levelRing.set(levelFraction(state.profile.progress), String(level));
  el.levelBadge.setAttribute('aria-label', `${t('profileLevel', { n: level })}`);
  paintFrameInto(el.levelBadge, frameStyle(), frameTier(level));
}

function updateBadges() {
  // The collection count is deliberately not badged: it only ever grows, so it
  // is a number that is always there and never means anything has happened.
  const timed = state.profile.timed.count ?? 0;
  nav.setBadge('timed', timed ? String(timed) : '');
  const held = Object.values(state.inventory ?? {})
    .reduce((n, slot) => n + (slot.count ?? 0), 0);
  nav.setBadge('packs', held ? String(held) : '');
  // A newly finished achievement rings once, when the count first rises.
  const achReady = achRedeemableCount();
  if (state.lastAchReady != null && achReady > state.lastAchReady) {
    pushNote('trophy', t('notifAchReady', { n: achReady }), 'ach');
  }
  state.lastAchReady = achReady;
  const ready = canClaim(state.profile.daily);
  el.giftDot.hidden = !ready;
  paintBell();
}

/* --- the drawer --------------------------------------------------------------------
 *
 * Everything you can go to, in one list. The bottom bar holds five; the app has
 * more than five places, and the ones that did not fit were previously hidden
 * behind a "More" heading on the Profile - which is a strange place to keep the
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
    { id: 'market', icon: 'trade',      key: 'tabMarket',      run: go('market', renderMarket) },
    { id: 'cardindex', icon: 'search',  key: 'tabIndex',       run: go('cardindex', renderCardIndex) },
    { id: 'glossary', icon: 'filter',   key: 'tabGlossary',    run: go('glossary', renderGlossary) },
    { id: 'daily',  icon: 'gift',       key: 'dailyTitle', dot: () => canClaim(state.profile.daily),
      run: () => openDaily() },
    { id: 'ach',    icon: 'trophy',     key: 'achTitle',
      badge: () => achRedeemableCount(),
      run: go('ach', renderAchievements) },
    { id: 'badges', icon: 'star',       key: 'badgesTitle',    run: go('badges', renderBadgesScreen) },
    { id: 'quiz',   icon: 'quiz',       key: 'tabQuiz',        run: go('quiz', renderQuiz) },
    { id: 'games',  icon: 'dice',       key: 'tabGames',       run: go('games', renderGames) },
    { id: 'quests', icon: 'scroll',     key: 'tabQuests',
      badge: () => quests.claimableCount(questUserKey()),
      run: go('quests', renderQuests) },
    { id: 'leaderboard', icon: 'podium', key: 'tabLeaderboard', run: go('leaderboard', renderLeaderboard) },
    { sep: true },
    ...(account.configured
      ? [{ id: 'friends', icon: 'friends', key: 'tabFriends',
           badge: () => state.social.incoming.length,
           run: go('friends', () => { renderFriends(); loadFriends(); }) }]
      : []),
    { id: 'bell', icon: 'bell', key: 'notifTitle',
      badge: () => unreadCount(),
      run: () => openNotifications() },
    { id: 'profile',  icon: 'profile',  key: 'tabProfile',  run: go('profile', renderProfile) },
    { id: 'updates',   icon: 'spark',    key: 'tabUpdates',   run: go('updates', renderUpdates) },
    { id: 'customize', icon: 'wand',     key: 'tabCustomize', run: go('customize', renderCustomize) },
    { id: 'settings',  icon: 'settings', key: 'tabSettings',  run: go('settings', renderSettings) }
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
  // Built into the drawer, then put wherever this width wants it.
  placeDrawerLinks();
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
  synth.resume();
  synth.playDrawer(true);
}

function closeDrawer() {
  if (el.drawer.hidden) return;
  synth.playDrawer(false);
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
 * answered), capped so it cannot grow forever. Live rows - friend requests,
 * unread chats, trades awaiting your answer - are derived fresh every time.
 */
function pushNote(icon, title, screen = 'friends') {
  const feed = state.profile.notifFeed ??= [];
  feed.unshift({ id: `note-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    icon, title, when: new Date().toISOString(), screen });
  if (feed.length > 30) feed.length = 30;
  store.saveProfile(state.profile);
  paintBell();
}

/**
 * Where a note leads. Every screen is reached the way the drawer reaches
 * it, renderer included, so a note about a quest lands on a quests screen
 * painted with the progress the note is about, not on whatever the screen
 * showed the last time it was open.
 */
function goToScreen(screen) {
  const item = drawerItems().find((entry) => entry.id === screen);
  if (item?.run) { item.run(); return; }
  showScreen(screen);
}

/**
 * What kind of thing a note is, from where it leads and what it wears. The
 * kind picks the colour of its mark and the small label under the title.
 */
function noteKind(icon, screen) {
  if (icon === 'addFriend') return 'request';
  if (icon === 'trade') return 'trade';
  if (icon === 'chat') return 'message';
  if (icon === 'gift') return 'gift';
  if (screen === 'quests') return 'quest';
  if (screen === 'ach') return 'achievement';
  if (screen === 'market' || icon === 'bell') return 'auction';
  if (screen === 'packs' || icon === 'packs') return 'booster';
  return 'news';
}

function notifications() {
  const go = (screen) => () => goToScreen(screen);
  const rows = [];

  for (const entry of state.social.incoming) {
    rows.push({ id: entry.id, icon: 'addFriend', kind: 'request',
      title: t('notifRequest', { name: entry.profile.username }),
      when: entry.created_at, run: go('friends') });
  }
  // Trades waiting on my answer.
  for (const trade of state.social.trades ?? []) {
    if (trade.status !== 'pending' || trade.recipient !== userId()) continue;
    const who = state.social.friends.find((f) => f.otherId === trade.proposer)?.profile?.username ?? '?';
    rows.push({ id: `trade-${trade.id}`, icon: 'trade', kind: 'trade',
      title: t('notifTrade', { name: who }), when: trade.created_at, run: go('friends') });
  }
  // Unread chats, one row per sender.
  for (const [sender, n] of state.social.unread ?? []) {
    const who = state.social.friends.find((f) => f.otherId === sender);
    if (!who) continue;
    rows.push({ id: `chat-${sender}-${n}`, icon: 'chat', kind: 'message',
      title: t('notifMessages', { n, name: who.profile.username }),
      when: null, run: () => openChat(who) });
  }
  // The stored feed (gifts received, trades resolved, quests done).
  for (const note of state.profile.notifFeed ?? []) {
    rows.push({ id: note.id, icon: note.icon, kind: noteKind(note.icon, note.screen), title: note.title,
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

/**
 * The notifications sheet. Two shelves: what is new (unread when the sheet
 * was opened) and what came earlier. Each row wears the colour of its kind,
 * says in a word what kind of thing it is and how long ago, and leads to
 * the screen it is about, painted fresh. Opening the sheet reads it; a
 * button clears the read notes that are only notes (a request, a trade or
 * an unread chat stays until it is answered).
 */
function openNotifications() {
  const list = notifications();
  // Opening the list reads it, at the end of this function. The shelves and
  // the sweep have to work off what was already read BEFORE that, or the
  // button would count four and quietly take away six.
  const readBefore = new Set(state.profile.notifRead ?? []);
  const fresh = list.filter((n) => !readBefore.has(n.id));
  const earlier = list.filter((n) => readBefore.has(n.id));
  openSheet(t('notifTitle'), (body) => {
    body.classList.add('notes-body');
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'notes-empty';
      empty.innerHTML = `<span class="notes-empty-mark">${iconSvg('bell', { size: 30 })}</span><b></b><p></p>`;
      empty.querySelector('b').textContent = t('notifEmptyTitle');
      empty.querySelector('p').textContent = t('notifEmpty');
      body.appendChild(empty);
      return;
    }
    const head = document.createElement('div');
    head.className = 'notes-head';
    head.innerHTML = `<span class="notes-count"></span>`;
    head.querySelector('.notes-count').textContent = fresh.length
      ? t('notifNewCount', { n: fresh.length }) : t('notifAllRead');
    body.appendChild(head);

    const shelf = (label, notes, unread) => {
      if (!notes.length) return;
      const title = document.createElement('p');
      title.className = 'notes-shelf';
      title.textContent = label;
      body.appendChild(title);
      const wrap = document.createElement('div');
      wrap.className = 'notes';
      wrap.replaceChildren(...notes.map((note) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = `note-row is-${note.kind}${unread ? ' is-unread' : ''}`;
        row.innerHTML = `<span class="note-mark">${iconSvg(note.icon, { size: 18 })}</span>
          <span class="note-copy"><b></b><span class="note-sub"><em></em><i></i></span></span>
          <span class="note-go">${iconSvg('chevron', { size: 16 })}</span>`;
        row.querySelector('b').textContent = note.title;
        row.querySelector('em').textContent = t(`notifKind_${note.kind}`);
        const when = whenText(note.when);
        row.querySelector('i').textContent = when ? ` · ${when}` : '';
        press(row, { sound: null });
        row.addEventListener('click', () => { synth.playTap(); sheet.hide(); note.run(); });
        return row;
      }));
      body.appendChild(wrap);
    };
    shelf(t('notifNew'), fresh, true);
    shelf(t('notifEarlier'), earlier, false);

    // Read notes from the stored feed can be swept away; live rows are not
    // notes and stay until answered.
    const sweepable = (state.profile.notifFeed ?? []).filter((note) => readBefore.has(note.id)).length;
    if (sweepable) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'btn btn-ghost btn-sm btn-block notes-clear';
      clear.textContent = t('notifClearRead', { n: sweepable });
      press(clear, { sound: null });
      clear.addEventListener('click', () => {
        state.profile.notifFeed = (state.profile.notifFeed ?? []).filter((note) => !readBefore.has(note.id));
        store.saveProfile(state.profile);
        synth.playTap();
        paintBell();
        openNotifications();
      });
      body.appendChild(clear);
    }
  });
  // Opening the list is reading it.
  markRead(list.map((n) => n.id));
}

/** "3 min ago", "2 days ago" - enough to place it, no more. */
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
  friends: { steps: 3, tip: true },
  quiz:    { steps: 3, tip: true },
  market:  { steps: 3, tip: true },
  index:   { steps: 3, tip: true },
  games:   { steps: 3, tip: true },
  wikdle:  { steps: 3, tip: true },
  slots:   { steps: 3, tip: true },
  quests:  { steps: 3, tip: true },
  leaderboard: { steps: 3, tip: true }
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
    // The special boosters (a secret code's) live on the Custom shelf too.
    .filter((slot) => (mode === 'custom') === (slot.spec.kind === 'custom' || slot.spec.kind === 'code'))
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
 * THE FORGE
 * ----------------------------------------------------------------------------
 * The custom tab, rebuilt from nothing for a phone. One centred column,
 * everything full width, nothing beside anything: a seal that LIVE-PREVIEWS
 * the pack being typed (it runs the same procedural identity a finished pack
 * gets, so the letter, palette and spin on screen are the ones you will own),
 * a big input, tappable ideas for anyone unsure what counts as a subject, one
 * big button, and the packs already built as tiles underneath.
 */
const FORGE_IDEAS = ['Minecraft', 'Naruto', 'Pokémon', 'Star Wars', 'Zelda', 'One Piece'];

function paintForgeSeal(text) {
  const subject = text.trim();
  const style = proceduralStyle((subject || 'wikster').toLowerCase());
  el.forgeSeal.style.setProperty('--accent', style.accent);
  el.forgeSeal.style.setProperty('--accent2', style.accent2);
  const letter = (subject.charAt(0) || 'W').toUpperCase();
  el.forgeSeal.innerHTML = monogramSvg(letter, subject.length * 3, { size: 86 });
  el.forgeSeal.classList.toggle('is-live', subject.length > 0);
}

function renderCreator() {
  el.forgeTitle.textContent = t('creatorTitle');
  el.forgeNote.textContent = t('creatorNote');
  el.creatorInput.placeholder = t('customPlaceholder');
  el.creatorGo.textContent = t('create');
  el.creatorMineLabel.textContent = t('creatorMine');
  el.creatorStatus.hidden = !el.creatorStatus.textContent;
  paintForgeSeal(el.creatorInput.value);

  el.forgeIdeas.replaceChildren(...FORGE_IDEAS.map((idea) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'forge-idea';
    chip.textContent = idea;
    press(chip, { sound: null });
    chip.addEventListener('click', () => {
      el.creatorInput.value = idea;
      paintForgeSeal(idea);
      synth.playTap();
    });
    return chip;
  }));

  const made = state.customPacks ?? [];
  el.creatorEmpty.hidden = made.length > 0;
  if (!made.length) {
    el.creatorEmptyMark.innerHTML = iconSvg('wand', { size: 40 });
    el.creatorEmptyText.textContent = t('creatorNoneYet');
  }

  el.creatorMine.replaceChildren(...made.map((pack) => {
    const spec = {
      kind: 'custom', themeId: null, rarityId: null, cards: 5,
      customName: pack.name, customId: pack.id, wiki: pack.wiki,
      icon: pack.icon, accent: pack.accent, accent2: pack.accent2
    };
    const tile = document.createElement('div');
    tile.className = 'forge-made';
    tile.innerHTML = `
      <button type="button" class="forge-made-main">
        <span class="forge-made-art"></span>
        <b></b><span class="forge-made-sub"></span>
      </button>
      <button type="button" class="forge-made-delete" aria-label="${esc(t('deleteBoosterNamed', { name: pack.name }))}">
        ${iconSvg('trash', { size: 16 })}
      </button>`;
    tile.querySelector('.forge-made-art').appendChild(buildBooster(spec, { size: 'is-tiny' }));
    tile.querySelector('b').textContent = pack.name;
    tile.querySelector('.forge-made-sub').textContent = t('creatorInShop');

    const main = tile.querySelector('.forge-made-main');
    press(main, { sound: null });
    main.addEventListener('click', () => {
      synth.playTap();
      payStipend();
      renderShop();
      showScreen('shop');
    });

    // Deleting is two taps: the first arms the button, the second commits.
    // Walking away (or tapping anything else) disarms it.
    const del = tile.querySelector('.forge-made-delete');
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
    return tile;
  }));
}


function customPackName(typed, sitename) {
  const trimmed = (sitename ?? '').replace(/\s*(fandom|wiki|wikia)\s*$/i, '').trim();
  return trimmed.length >= 2 ? trimmed : typed.replace(/\s+/g, ' ').trim();
}

function setCreatorStatus(text, kind) {
  el.creatorStatus.textContent = text;
  el.creatorStatus.className = `forge-status is-${kind}`;
  el.creatorStatus.hidden = !text;
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
    state.profile.packsBuilt = (state.profile.packsBuilt ?? 0) + 1;

    // Building a pack does NOT hand over a booster: it goes on sale in the
    // Shop, on its own shelf. It used to be free, which was a free openable
    // pack out of thin air for anyone who typed a name.
    renderPacks();
    renderShop();
    setCreatorStatus(t('createdGoShop', { name: pack.name }), 'ok');
    reportQuest('custom');
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
  const before = state.profile.timed.count ?? 0;
  accrue(state.profile.timed);
  const after = state.profile.timed.count ?? 0;
  const cap = maxHeld(timedLevel(state.profile.timed.opened ?? 0));
  // The shelf just filled: worth a bell, once per fill.
  if (after > before && after >= cap) pushNote('clock', t('notifTimedFull'), 'timed');
  store.saveProfile(state.profile);
  return state.profile.timed;
}

const currentTimedSpec = () => timedSpec(timedLevel(state.profile.timed.opened ?? 0));

/*
 * FREE PACKS
 * ----------------------------------------------------------------------------
 * Rebuilt around the only two things anyone comes to this screen for: how many
 * are waiting, and when the next one lands. The dial answers both at once -
 * the number is the count, the ring is the fill towards the next - and the
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
  const topTier = timedTopTier(level);
  const atCeiling = topTier.id === RARITIES[RARITIES.length - 1].id;
  const perks = [
    ['clock', t('freePerkSpeed', { minutes: Math.round(regenMs(level) / 60000) })],
    ['packs', t('freePerkCap', { max: cap })],
    ['gem', atCeiling ? t('freePerkTierMax') : t('freePerkTier', { tier: tx(topTier.name) })]
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
  gainBooster(spec, 1);
  timed.count -= 1;
  if (!Number.isFinite(timed.last)) timed.last = Date.now();
  store.saveProfile(state.profile);
  updateBadges();
  openScreenFor(spec);
}

/* --- shop -------------------------------------------------------------------------------- */

const freeNoteText = () =>
  `${t('freeShelfNote')} ${t('freeAgainIn', { time: formatCountdown(nextFreeAt() - Date.now()) })}`;

/*
 * THE SHOP
 * ----------------------------------------------------------------------------
 * A market of fixed stalls, laid out for a phone: the spotlight deal on top,
 * then the free shelf, a two-column grid of subject boosters, the tier vault,
 * and the packs you built. Nothing scrolls sideways and nothing hides off the
 * edge of the screen; every item is a full tile that says what it is, what is
 * inside and what it costs.
 */
function renderShop() {
  el.shopTitle.textContent = t('tabShop');
  el.shopPurseLabel.textContent = t('shopPurse');
  el.shopRestockLabel.textContent = t('shopRestockIn');
  el.shopPurse.innerHTML = money(state.wallet);

  const market = generateShop(windowIndexAt(), state.customPacks, freeWindowAt());
  const sections = [
    buildFeatured(market.featured),
    buildShopSection({
      title: t('shopFreeRow'), note: freeNoteText(), noteAttr: 'data-free-note',
      body: shopGrid(market.free.map((item) => shopTile(item, { free: true })))
    }),
    buildShopSection({
      title: t('shopSubjects'),
      body: shopGrid(market.subjects.map((item) => shopTile(item)))
    }),
    buildShopSection({ title: t('shopPress'), note: t('shopPressNote'), body: buildPress(market.vault) }),
    buildShopSection({
      title: t('shopBundles'), note: t('shopBundlesNote', { pct: BUNDLE_OFF_PCT }),
      body: shopGrid(market.bundles.map((item) => bundleTile(item)))
    }),
    buildShopSection({ title: t('shopCrate'), note: t('shopCrateNote'), body: buildCrate(market.crate) }),
    market.customs.length
      ? buildShopSection({
          title: t('shopCustomRow'), note: t('shopSizeNote'),
          body: shopGrid(market.customs.map((item) => customTile(item)))
        })
      : null
  ];
  el.shopMarket.replaceChildren(...sections.filter(Boolean));
  reveal(el.shopMarket.children, { step: 60 });
  tickRestock();
}

function buildShopSection({ title, note = '', noteAttr = '', body }) {
  const sec = document.createElement('section');
  sec.className = 'shop-sec';
  sec.innerHTML = `<div class="shop-sec-head"><h3></h3></div>${note ? `<p class="shop-sec-note" ${noteAttr}></p>` : ''}`;
  sec.querySelector('h3').textContent = title;
  if (note) sec.querySelector('.shop-sec-note').textContent = note;
  sec.appendChild(body);
  return sec;
}

function shopGrid(tiles) {
  const grid = document.createElement('div');
  grid.className = 'shop-grid';
  grid.replaceChildren(...tiles);
  return grid;
}

/** The one price control everywhere in the market. */
function buyButton(spec, price, { count = 1, after = null } = {}) {
  const buy = document.createElement('button');
  buy.type = 'button';
  buy.className = 'buy';
  press(buy, { sound: null });
  buy.classList.toggle('is-poor', price > state.wallet);
  buy.innerHTML = `<span class="buy-label">${t('buy')}</span><span class="buy-price">${money(price)}</span>`;
  buy.addEventListener('click', () => { if (purchase(spec, price, buy, count)) after?.(); });
  return buy;
}

/** What a booster holds, coloured by its tier when it has one. */
function paintTileMeta(node, spec) {
  const tier = spec.rarityId ? rarityById(spec.rarityId) : null;
  node.textContent = tier
    ? `${t('shopItemMeta', { n: spec.cards })} · ${tx(tier.name)}`
    : t('shopItemMeta', { n: spec.cards });
  if (tier) node.style.color = tier.color;
}

/** One booster as a tile: art, name, contents, then the price. */
function shopTile({ id, spec, price }, { free = false } = {}) {
  const tile = document.createElement('div');
  tile.className = 'shop-tile';
  tile.dataset.spec = id;

  const art = document.createElement('div');
  art.className = 'shop-tile-art';
  art.appendChild(buildBooster(spec, { size: 'is-tiny' }));
  tile.appendChild(art);

  const name = document.createElement('p');
  name.className = 'shop-tile-name';
  name.textContent = specName(spec);
  tile.appendChild(name);

  const meta = document.createElement('p');
  meta.className = 'shop-tile-meta';
  paintTileMeta(meta, spec);
  tile.appendChild(meta);

  if (free) {
    const buy = document.createElement('button');
    buy.type = 'button';
    buy.className = 'buy is-free';
    press(buy, { sound: null });
    paintFreeButton(buy, id, spec);
    tile.appendChild(buy);
  } else {
    tile.appendChild(buyButton(spec, price));
  }
  return tile;
}

/** The spotlight: one discounted booster, presented like a poster. */
function buildFeatured({ spec, price, fullPrice, pct }) {
  const colours = specColours(spec);
  const sec = document.createElement('section');
  sec.className = 'shop-feature panel';
  sec.style.setProperty('--accent', colours.accent);
  sec.style.setProperty('--accent2', colours.accent2);
  sec.innerHTML = `
    <span class="shop-feature-tag">-${pct}%</span>
    <div class="shop-feature-art"></div>
    <div class="shop-feature-copy">
      <span class="label"></span>
      <h3></h3>
      <p class="shop-feature-meta"></p>
      <p class="shop-feature-old"></p>
    </div>`;
  sec.querySelector('.shop-feature-art').appendChild(buildBooster(spec, { size: 'is-small' }));
  sec.querySelector('.label').textContent = t('shopDeal');
  sec.querySelector('h3').textContent = specName(spec);
  paintTileMeta(sec.querySelector('.shop-feature-meta'), spec);
  sec.querySelector('.shop-feature-old').innerHTML = `<s>${money(fullPrice)}</s>`;
  sec.appendChild(buyButton(spec, price));
  return sec;
}

/** The press: one row per tier on offer, sold with its real chance. */
function buildPress(items) {
  const list = document.createElement('div');
  list.className = 'vault';
  list.replaceChildren(...items.map(({ id, spec, price, rarity, chance }) => {
    const row = document.createElement('div');
    row.className = 'vault-row';
    row.dataset.spec = id;
    row.style.setProperty('--tier', rarity.color);
    row.innerHTML = `
      <span class="vault-gem">${iconSvg('gem', { size: 19 })}</span>
      <div class="vault-copy"><b></b><p class="tabular"></p><p class="tabular vault-chance"></p></div>`;
    row.querySelector('b').textContent = specName(spec);
    row.querySelector('p').textContent =
      `${t('shopItemMeta', { n: spec.cards })} · ${t('shopGuarantee', { rarity: tx(rarity.name) })}`;
    row.querySelector('.vault-chance').textContent =
      t('shopPressChance', { pct: Math.round(chance * 100), rarity: tx(rarity.name) });
    row.appendChild(buyButton(spec, price));
    return row;
  }));
  return list;
}

/** A bundle: three of one booster, one price, one tap. */
function bundleTile({ id, spec, price, each }) {
  const tile = document.createElement('div');
  tile.className = 'shop-tile is-bundle';
  tile.dataset.spec = id;
  const art = document.createElement('div');
  art.className = 'shop-tile-art shop-tile-stack';
  for (let i = 0; i < BUNDLE_SIZE; i++) art.appendChild(buildBooster(spec, { size: 'is-tiny' }));
  tile.appendChild(art);
  const name = document.createElement('p');
  name.className = 'shop-tile-name';
  name.textContent = specName(spec);
  tile.appendChild(name);
  const meta = document.createElement('p');
  meta.className = 'shop-tile-meta';
  meta.innerHTML = t('shopBundleMeta', { n: BUNDLE_SIZE, each: money(each) });
  tile.appendChild(meta);
  const tag = document.createElement('span');
  tag.className = 'shop-tile-tag';
  tag.textContent = `-${BUNDLE_OFF_PCT}%`;
  tile.appendChild(tag);
  tile.appendChild(buyButton(spec, price, { count: BUNDLE_SIZE }));
  return tile;
}

/** The crate: a booster with its label sealed until it is bought. */
function buildCrate({ id, spec, price }) {
  const tile = document.createElement('div');
  tile.className = 'shop-crate panel';
  tile.dataset.spec = id;
  tile.innerHTML = `
    <div class="shop-crate-art">${iconSvg('gift', { size: 44 })}</div>
    <div class="shop-crate-copy"><h3></h3><p class="shop-tile-meta"></p></div>`;
  tile.querySelector('h3').textContent = t('shopCrateName');
  tile.querySelector('.shop-tile-meta').textContent = t('shopCrateMeta', { n: spec.cards });
  const buy = buyButton(spec, price, {
    after: () => {
      toast(esc(t('shopCrateOpened', { name: specName(spec) })), 'ok');
      // The label comes off: the crate shows what it was, until the restock.
      tile.classList.add('is-opened');
      tile.querySelector('h3').textContent = specName(spec);
      paintTileMeta(tile.querySelector('.shop-tile-meta'), spec);
      tile.querySelector('.shop-crate-art').replaceChildren(buildBooster(spec, { size: 'is-tiny' }));
    }
  });
  tile.appendChild(buy);
  return tile;
}

/**
 * A booster the player built, sized by the player: a stepper from one card
 * to ten, the price following live. The wrapper (economy.WRAPPER_CARDS) is
 * what keeps the sizes honest against each other: the per-card price
 * shown falls as the booster grows, and two of one card always cost more
 * than one of two.
 */
function customTile({ id, spec, price }) {
  const tile = document.createElement('div');
  tile.className = 'shop-tile is-sized';
  tile.dataset.spec = id;
  const chosen = { ...spec, cards: Math.min(CUSTOM_CARD_RANGE[1], Math.max(CUSTOM_CARD_RANGE[0], spec.cards ?? 5)) };

  const art = document.createElement('div');
  art.className = 'shop-tile-art';
  art.appendChild(buildBooster(chosen, { size: 'is-tiny' }));
  tile.appendChild(art);
  const name = document.createElement('p');
  name.className = 'shop-tile-name';
  name.textContent = specName(chosen);
  tile.appendChild(name);

  const sizer = document.createElement('div');
  sizer.className = 'sizer';
  sizer.innerHTML = `
    <span class="sizer-label"></span>
    <div class="sizer-row">
      <button type="button" class="sizer-btn" data-step="-1" aria-label="-">${iconSvg('minus', { size: 14 })}</button>
      <b class="sizer-count tabular"></b>
      <button type="button" class="sizer-btn" data-step="1" aria-label="+">${iconSvg('plus', { size: 14 })}</button>
    </div>
    <p class="sizer-per tabular"></p>`;
  sizer.querySelector('.sizer-label').textContent = t('shopSizeLabel');
  tile.appendChild(sizer);

  const buy = document.createElement('button');
  buy.type = 'button';
  buy.className = 'buy';
  press(buy, { sound: null });
  tile.appendChild(buy);

  const paint = () => {
    const cost = boosterPrice(chosen);
    sizer.querySelector('.sizer-count').textContent = t('shopItemMeta', { n: chosen.cards });
    sizer.querySelector('.sizer-per').innerHTML = t('shopPerCard', { amount: money(Math.round(cost / chosen.cards)) });
    sizer.querySelector('[data-step="-1"]').disabled = chosen.cards <= CUSTOM_CARD_RANGE[0];
    sizer.querySelector('[data-step="1"]').disabled = chosen.cards >= CUSTOM_CARD_RANGE[1];
    buy.classList.toggle('is-poor', cost > state.wallet);
    buy.innerHTML = `<span class="buy-label">${t('buy')}</span><span class="buy-price">${money(cost)}</span>`;
    buy.onclick = () => purchase({ ...chosen }, cost, buy);
  };
  sizer.querySelectorAll('.sizer-btn').forEach((btn) => {
    press(btn, { sound: null });
    btn.addEventListener('click', () => {
      const next = chosen.cards + Number(btn.dataset.step);
      if (next < CUSTOM_CARD_RANGE[0] || next > CUSTOM_CARD_RANGE[1]) return;
      chosen.cards = next;
      synth.playTap();
      paint();
    });
  });
  paint();
  return tile;
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
  gainBooster(spec, 1);
  synth.playPurchase();
  toast(`${t('bought')} ${specName(spec)}`, 'ok');
  paintFreeButton(button, id, spec);
  renderPacks();
}

function purchase(spec, price, button, count = 1) {
  if (state.wallet < price) {
    synth.playDenied();
    toast(t('cantAfford'), 'error');
    return false;
  }
  store.saveWallet(state.wallet - price);
  gainBooster(spec, count);
  refreshWallet();
  for (let i = 0; i < count; i++) reportQuest('buy', { price: price / count, kind: spec.kind });
  synth.playPurchase();
  button.classList.add('is-bought');
  setTimeout(() => button.classList.remove('is-bought'), 700);
  toast(`${t('bought')} ${count > 1 ? `${count} × ` : ''}${specName(spec)}`, 'ok');
  renderPacks();
  return true;
}

function tickRestock() {
  const remaining = nextRefreshAt() - Date.now();
  el.restock.textContent = formatCountdown(remaining);
  const note = el.shopMarket.querySelector('[data-free-note]');
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
 * subject's particles - checker confetti for F1, pages for Books, stars for
 * Space, whatever packstyle.js says this pack throws - blow outward. Then the
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
 * the finger keeps going, strain builds (the pack tilts and lifts - CSS reads
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
  buzz(18);
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

/**
 * Start every card's picture downloading the moment the draw has chosen it.
 *
 * The draw is a few requests now; what a player on a slow line still waits
 * for is the PICTURE of each card, which only began loading when the card
 * was bound, one reveal at a time. Warmed here, the pictures are already in
 * the browser's cache when the reveal asks for them, and the booster was
 * usually prefetched while the pack was still whole, so they had the whole
 * tear to arrive.
 */
function warmPictures(cards) {
  if (!Array.isArray(cards)) return;
  for (const card of cards) {
    const src = card?.thumbnail;
    if (typeof src !== 'string' || src.startsWith('data:')) continue;
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
  }
}

/*
 * THE DRAWER: packs drawn ahead of the tear.
 *
 * Every wait a player felt after the rip was the network: one search and
 * the pictures. The only way to make that zero is to have done it already,
 * so a draw is now kept ready for every kind of booster the player is about
 * to open: the one on the open screen, the one under the finger on the
 * shelf, the next copy of the pack just opened, and, at launch, a few of
 * the most-owned kinds. A ready draw is one set of cards for one kind of
 * booster, held in memory and used by the next tear of that kind; it costs
 * a few requests at a quiet moment and is thrown away after half an hour,
 * or if it failed, so a stale or broken one never reaches a pack.
 */
const READY_TTL_MS = 30 * 60 * 1000;
const READY_WARM_AT_LAUNCH = 6;
const readyDraws = new Map();

/**
 * Every way a booster is gained: bought, gifted, won, refunded, redeemed.
 * The pack is put on the shelf AND drawn ahead at once, so that by the time
 * a player has walked to the shelf and torn it, the cards have been in hand
 * for a while. A gain is the earliest possible moment to start.
 */
function gainBooster(spec, count = 1) {
  store.addBooster(state.inventory, spec, count);
  ensureReady(spec);
}

/** The ready draw for this kind, started now if there is none fresh. */
function ensureReady(spec) {
  const id = specId(spec);
  const held = readyDraws.get(id);
  if (held && !held.failed && Date.now() - held.at < READY_TTL_MS) return held;
  if (navigator.onLine === false) return held ?? null;
  const record = { id, settled: false, failed: false, at: Date.now() };
  record.promise = drawArticles(toDrawPack(spec))
    .catch((error) => ({ error }))
    // Whether the cards are already in hand decides whether a booster can
    // be opened with no connection at all, and whether they came back at
    // all decides what the idle screen is allowed to promise.
    .then((value) => {
      record.settled = true;
      record.failed = Boolean(value?.error);
      if (!record.failed) warmPictures(value);
      if (state.prefetch === record) paintOpenHint();
      return value;
    });
  readyDraws.set(id, record);
  return record;
}

/** A draw was used, or went stale: forget it. */
function dropReady(id) { readyDraws.delete(id); }

/**
 * Point the open screen at the ready draw for this pack. From the shelf
 * this waits a moment, so flicking through the shelf does not start a draw
 * per pack flicked past; from the open screen it is immediate.
 */
function schedulePrefetch(spec, { delay = PREFETCH_DELAY } = {}) {
  clearTimeout(state.prefetchTimer);
  const id = specId(spec);
  if (state.prefetch?.id === id && !state.prefetch.failed) return;
  const point = () => { state.prefetch = ensureReady(spec); paintOpenHint(); };
  if (delay) state.prefetchTimer = setTimeout(point, delay);
  else point();
}

/**
 * At a quiet moment, draw ahead for the kinds the player owns most of, so
 * the first tear of the session is as instant as the ones after it.
 */
function warmDrawer() {
  if (navigator.onLine === false || navigator.connection?.saveData) return;
  // Every kind on the shelf, most-owned first, up to the limit: enough that
  // whatever is torn next is ready, few enough that a big shelf does not
  // turn launch into a storm of requests.
  const owned = Object.values(state.inventory ?? {})
    .filter((slot) => slot?.spec && slot.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, READY_WARM_AT_LAUNCH);
  owned.forEach((slot, i) => setTimeout(() => ensureReady(slot.spec), i * 1200));
}

/**
 * What the open screen may promise while the pack is still whole. Cards come
 * off the network, so tearing a pack with a dead connection buys the player an
 * animation and a refund. The prefetch already ran the exact request the open
 * will run, so if it came back broken, so will the open: say so on the idle
 * screen instead of after the booster is spent.
 */
function openReadiness() {
  // The open screen carries `phase-idle` in the markup, so this can be asked
  // before any booster has been chosen: at startup, and again after the screen
  // is left. There is nothing to promise about a booster that does not exist.
  if (!state.spec) return 'ready';
  const pre = state.prefetch?.id === specId(state.spec) ? state.prefetch : null;
  // Cards already in hand open fine with no connection at all.
  if (pre?.settled && !pre.failed) return 'ready';
  if (navigator.onLine === false) return 'offline';
  if (pre?.settled && pre.failed) return 'unreachable';
  return 'ready';
}

/** Paint the idle screen's line, warning included. Safe to call any time. */
function paintOpenHint() {
  if (!state.spec) return;
  if (!el.openScreen?.classList.contains('phase-idle')) return;
  const readiness = openReadiness();
  if (readiness === 'ready') {
    el.openHint.textContent = t('slideToRip');
    el.openHint.className = 'open-hint';
    return;
  }
  el.openHint.textContent = readiness === 'offline' ? t('openWarnOffline') : t('openWarnUnreachable');
  el.openHint.className = 'open-hint is-warn';
}

function drawFor(spec) {
  const id = specId(spec);
  const held = readyDraws.get(id) ?? (state.prefetch?.id === id ? state.prefetch : null);
  state.prefetch = null;
  dropReady(id);
  if (held && !held.failed && Date.now() - held.at < READY_TTL_MS) return held.promise;
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

  schedulePrefetch(spec, { delay: 0 });
  paintOpenHint();
  showScreen('open');
}

/**
 * Open the torn pack. Returns whether it actually opened.
 *
 * The whole body runs inside a try/finally for one reason: `state.busy` used
 * to be cleared on the happy path and on the one handled error, so ANY other
 * throw left it set for the rest of the session. Nothing clears it again, and
 * every later open returns at the guard above - so no booster could be opened
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

  // Cards come off the network, so an offline open can only ever end in a
  // refund. Say so before the booster is spent rather than after. Cards that
  // were already fetched ahead of the tear are fine to hand over.
  const inHand = state.prefetch?.id === specId(state.spec) && state.prefetch.settled;
  if (!navigator.onLine && !inHand) {
    el.openHint.textContent = t('openOffline');
    el.openHint.className = 'open-hint is-error';
    synth.playDenied();
    return false;
  }

  if (!store.takeBooster(state.inventory, specId(state.spec))) return false;
  // Written down BEFORE it is spent: if this open never finishes, the next
  // launch hands the booster back instead of swallowing it.
  store.markOpenInFlight(state.spec);
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

  // A draw that never comes back is worse than one that fails: the pack sits
  // torn open forever and the booster is in limbo. Whatever happens to the
  // network, this resolves, and an open that resolves can be refunded.
  const guarded = Promise.race([
    drawing,
    wait(DRAW_HARD_LIMIT).then(() => ({ error: new Error('TIMEOUT') }))
  ]);
  // The reveal waits for the draw and for the FIRST cards to have flown in,
  // not for the whole fountain: the last card of a big pack is still
  // landing when the first one turns, which reads as eagerness rather than
  // a wait.
  const [articles] = await Promise.all([
    guarded,
    wait(EMERGE_DURATION + EMERGE_STAGGER)
  ]);

  if (!articles || articles.error) {
    // Refund: the booster was consumed but produced nothing. It goes back
    // through the same path the next launch would use, so the record is spent
    // in the act of refunding and the booster can never be handed back twice.
    // If the record did not survive (storage refused it), hand it back
    // directly rather than swallow it.
    if (!store.reclaimOpenInFlight(state.inventory)) {
      gainBooster(state.spec, 1);
    }
    renderPacks();
    el.openScreen.className = 'screen is-active phase-idle';
    const why = articles?.error?.message;
    el.openHint.textContent = why === 'OFFLINE' || navigator.onLine === false
      ? t('openOffline')
      : why === 'TIMEOUT'
        ? t('openSlow')
        : t('openFailed', { error: why ?? 'Network error' });
    el.openHint.className = 'open-hint is-error';
    el.cardStack.replaceChildren();
    const fresh = buildBooster(state.spec, { interactive: true, size: 'is-hero' });
    fresh.classList.add('is-idle');
    el.boosterSlot.replaceChildren(fresh);
    initRip(fresh);
    return false;
  }

  warmPictures(articles);

  const colours = specColours(state.spec);
  // Random order: a Legendary can come first and a Common last.
  // A special booster keeps its order: the five things, then The Creator.
  const ordered = state.spec.kind === 'code' ? articles : shuffle(articles);
  const pulls = ordered.map((article) => {
    // The print is what the booster rolled; the article's fame sets the
    // price. A card from a secret code is Special, whatever was rolled.
    const rarity = article.special ? rarityById(SPECIAL_RARITY_ID) : rarityOfCard(article);
    return {
      article, rarity,
      price: priceFor(article.popularity, article.special ? rarityById('prismatic') : rarity),
      packName: specName(state.spec),
      packIcon: specIcon(state.spec),
      packAccent: colours.accent
    };
  });

  const recorded = store.recordPulls(state.collection, pulls, state.spec);
  // The shared codex learns every real card as it is first pulled; custom
  // wikis stay private to their maker, and so does a special booster.
  if (signedIn() && state.spec?.kind !== 'custom' && state.spec?.kind !== 'code') {
    const found = pulls.map((pull) => ({ ...pull.article, price: pull.price, rarityId: pull.rarity.id }))
      .filter((card) => card.key && !String(card.packId ?? '').startsWith('custom'));
    account.codexAdd(userId(), found).catch(() => { /* the next opener adds it */ });
  }
  pulls.forEach((pull, i) => { pull.entry = recorded[i].entry; });
  // The cards are in the collection now, so the booster is honestly gone.
  store.clearOpenInFlight();
  // The day's quests hear about it: the booster, then every card.
  reportQuest('open', { kind: state.spec.kind, themeId: state.spec.themeId ?? null, rarityId: state.spec.rarityId ?? null });
  for (const pull of pulls) {
    reportQuest('pull', {
      rarityId: pull.rarity.id, themeId: state.spec.themeId ?? null,
      isNew: Boolean(recorded.find((r) => r.entry === pull.entry)?.isNew),
      popularity: pull.article.popularity ?? 0
    });
  }
  reportAlbums();

  // A special booster is a gift, not progress: no opening counted, no
  // rarity tally, no experience. Everything else about it is untouched.
  if (state.spec.kind !== 'code') {
    store.recordOpening(state.profile, pulls);
    if (state.spec.kind === 'timed') {
      state.profile.timed.opened = (state.profile.timed.opened ?? 0) + 1;
      store.saveProfile(state.profile);
    }
    awardXp(pulls);
  }
  updateBadges();

  state.pulls = pulls;
  bindCards(pulls);
  // The next copy of this pack, if there is one, is drawn while this one is
  // being read: the next tear is then instant.
  if ((state.inventory[specId(state.spec)]?.count ?? 0) > 0) ensureReady(state.spec);
  el.openScreen.classList.replace('phase-opening', 'phase-reveal');
  state.index = 0;
  layoutDeck();
  revealCurrent();
  return true;
}

/* --- cards --------------------------------------------------------------------------------- */

const CARD_FRONT_MARKUP = `
  <div class="fx fx-a" aria-hidden="true"></div>
  <div class="fx-code" aria-hidden="true"></div>
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
  <div class="fx-p" aria-hidden="true"></div>
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
  // The look its owner chose for this tier, if they chose one. Special sits
  // outside the picker and keeps the treatment its code gave it.
  const chosen = rarity.id === SPECIAL_RARITY_ID ? DEFAULT_FX : (state.cardFx[rarity.id] ?? DEFAULT_FX);
  if (chosen && chosen !== DEFAULT_FX) node.dataset.fx = chosen;
  else delete node.dataset.fx;
}

function fillFront(front, data, rarity, { ownedTag = false } = {}) {
  const art = front.querySelector('.card-art');
  art.replaceChildren();
  art.classList.remove('is-small-art', 'is-no-art');
  const fallback = () => {
    art.classList.add('is-no-art');
    art.insertAdjacentHTML('afterbegin',
      `<div class="card-art-fallback">${iconSvg(data.packIcon ?? 'packs', { size: 38 })}</div>`);
  };

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
  dressFront(front, data, rarity);
  const shell = front.closest('.card');
  if (shell) {
    if (data.special) shell.dataset.special = data.creator ? 'creator' : data.special;
    else delete shell.dataset.special;
  }

  front.querySelector('.card-title').textContent = data.title;
  // In the rooms where you browse cards that are not necessarily yours (the
  // index, the auction floor, a friend's shelf), the green tag answers the
  // only question that matters before bidding: do I already have this?
  if (ownedTag && data.key && state.collection.entries[data.key]) {
    const tag = document.createElement('span');
    tag.className = 'owned-tag';
    tag.textContent = t('ownedTag');
    front.querySelector('.card-title').appendChild(tag);
  }
  front.querySelector('.card-desc').textContent = data.description || data.sourceName || '';
  front.querySelector('.card-extract').textContent = data.extract;
  front.querySelector('.rarity-badge').textContent = tx(rarity.name);
  front.querySelector('.card-price').innerHTML = money(data.price);
  // The Creator is not read on Wikipedia: no readership line for that one.
  front.querySelector('.card-views').textContent = data.creator ? ''
    : data.views ? t('viewsPerMonth', { views: formatViews(data.views) }) : bandFor(data.popularity ?? 0).name;
}

/*
 * The pieces a treatment cannot draw in CSS alone: the sparks and embers
 * (one element each, so they can rise on their own clocks), the hologram's
 * scrolling wikitext, written from the card's own article, and the picture
 * as a custom property so the mythic glitch can tear a copy of it.
 */
function dressFront(front, data, rarity) {
  const particles = front.querySelector('.fx-p');
  const code = front.querySelector('.fx-code');
  particles?.replaceChildren();
  code?.replaceChildren();
  front.style.setProperty('--art',
    data.thumbnail ? `url("${String(data.thumbnail).replace(/["\\]/g, '\\$&')}")` : 'none');
  if (rarity.id === 'legendary' && particles) {
    particles.replaceChildren(...sparks(6, { d: [4.5, 7.5] }));
  } else if (rarity.id === 'mythic' && particles) {
    particles.replaceChildren(...sparks(8, { d: [3, 5.5], s: [2, 3], c: ['#ffb347', '#ff5a1f'] }));
  } else if (rarity.id === 'exotic' && code) {
    const lines = wikitextLines(data);
    code.replaceChildren(...[['6%', '14s'], ['38%', '19s'], ['70%', '11s']].map(([x, d], i) => {
      const col = document.createElement('span');
      col.className = 'col';
      col.style.setProperty('--x', x);
      col.style.setProperty('--d', d);
      const text = Array.from({ length: 14 }, (_, k) => lines[(k * 5 + i * 3) % lines.length]).join('\n');
      // The text twice over: the loop scrolls exactly half its height.
      col.textContent = `${text}\n${text}`;
      return col;
    }));
  }
}

function sparks(n, { d, s = null, c = null }) {
  const between = (a, b, dp = 1) => (a + Math.random() * (b - a)).toFixed(dp);
  return Array.from({ length: n }, (_, i) => {
    const spark = document.createElement('i');
    spark.style.setProperty('--x', `${between(6, 94, 0)}%`);
    spark.style.setProperty('--d', `${between(d[0], d[1])}s`);
    spark.style.setProperty('--delay', `-${between(0, 8)}s`);
    spark.style.setProperty('--sx', `${between(-6, 6, 0)}px`);
    if (s) spark.style.setProperty('--s', `${between(s[0], s[1])}px`);
    if (c) spark.style.setProperty('--c', c[i % c.length]);
    return spark;
  });
}

/** The article as its editors see it: the source of the hologram's code. */
function wikitextLines(data) {
  const title = String(data.title ?? '');
  const desc = String(data.description || data.sourceName || '');
  const words = String(data.extract ?? '').split(/\s+/).filter(Boolean);
  const run = (i, n = 3) => words.slice(i, i + n).join(' ') || title;
  const cut = (line) => (line.length > 22 ? `${line.slice(0, 21)}\u2026` : line);
  return [
    '{{Infobox', `| name = ${title}`, `| type = ${desc}`, `| views = ${data.views ?? '?'}`, '}}',
    `'''${title}''' is`, run(3), `<ref name="${title.toLowerCase().replace(/\s+/g, '')}">`,
    `{{cite web|url=${data.url ?? ''}}}`, '</ref>', '== History ==', run(8),
    `[[Category:${desc}]]`, `{{Main|${title}}}`, `[[File:${title}.jpg|thumb]]`, run(13),
    '== See also ==', `* [[${run(18, 2)}]]`
  ].map(cut);
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
    const on = store.toggleFavorite(state.collection, entryKey);
    synth.playFav(on);
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

/* The fan of the deck. The held card's lean is not here: it is the tilt
   engine's, written as custom properties the front face reads. */
function layoutDeck() {
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
    card.style.transform =
      `translate(${depth * 5}px, ${depth * 9}px) rotate(${depth * 1.3}deg) ` +
      `scale(${(1 - depth * 0.04).toFixed(3)})`;
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
  tilt.watch(card);

  if (isNew) {
    state.seen.add(state.index);
    synth.playReveal(rarityRank(pull.rarity.id));
    // The rarer the card, the longer the pulse: the phone says so before the
    // eye has read the badge.
    buzz(8 + rarityRank(pull.rarity.id) * 6);
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
    const card = buildStaticCard(data, pull.rarity, pull.article.key);
    card.classList.add('is-mini');
    return card;
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
  // The arrows under the deck do exactly what a swipe does; some thumbs
  // simply prefer a button.
  el.openPrev.innerHTML = iconSvg('chevronLeft', { size: 20 });
  el.openNext.innerHTML = `<span style="display:inline-block;transform:scaleX(-1)">${iconSvg('chevronLeft', { size: 20 })}</span>`;
  [el.openPrev, el.openNext].forEach((btn) => press(btn, { sound: null }));
  el.openPrev.addEventListener('click', () => { synth.resume(); goTo(state.index - 1); });
  el.openNext.addEventListener('click', () => { synth.resume(); goTo(state.index + 1); });

  el.cardStack.addEventListener('pointerdown', (event) => {
    if (!el.openScreen.classList.contains('phase-reveal') || !state.cards.length) return;
    const card = state.cards[state.index];
    card?.classList.add('is-dragging');
    synth.resume();

    trackDrag(event, {
      onMove: (dx, dy) => { if (card) tilt.hold(card, dx / TILT_REACH, dy / TILT_REACH); },
      onEnd: (dx) => {
        card?.classList.remove('is-dragging');
        if (card) tilt.release(card);
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
  if (reward.spec) gainBooster(reward.spec, 1);

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
/* --- the wishlist ------------------------------------------------------------------------
 * A wish is a card you want, whoever holds it. It lives on the server (so
 * friends can see it and the auction floor can ring a bell for it) with a
 * local cache for instant paint. Offline builds keep the cache alone. */

function wishSnapshot(data) {
  return {
    key: data.key, title: data.title, rarityId: data.rarityId ?? null,
    price: data.price ?? null, views: data.views ?? null,
    thumbnail: data.thumbnail ?? null, lang: data.lang ?? null
  };
}

function toggleWish(data) {
  if (!data?.key) return false;
  const on = !state.wishlist.has(data.key);
  if (on) state.wishlist.set(data.key, wishSnapshot(data));
  else state.wishlist.delete(data.key);
  store.saveWishlist([...state.wishlist.values()]);
  synth.playFav(on);
  if (signedIn()) {
    account.wishlistSet(userId(), wishSnapshot(data), on).catch(() => { /* cache still holds it */ });
  }
  return on;
}

function wireWishButton(button, data) {
  const paint = () => {
    const on = state.wishlist.has(data.key);
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', t('wishTitle'));
    button.innerHTML = iconSvg('wish', { size: 15 });
  };
  paint();
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const on = toggleWish(data);
    toast(t(on ? 'wishAdded' : 'wishRemoved', { card: esc(data.title) }), 'ok');
    paint();
  });
}

/** Pull the server copy over the cache, and learn what friends wish for. */
async function refreshWishes() {
  if (!signedIn() || !account.indexSchemaReady()) return;
  try {
    const mine = await account.wishlistMine(userId());
    state.wishlist = new Map(mine.map((row) => [row.key, row.card]));
    store.saveWishlist([...state.wishlist.values()]);
  } catch { /* the cache stands */ }
  try {
    const ids = state.social.friends.map((f) => f.otherId);
    state.friendWishes = await account.friendsWishes(ids,
      (id) => state.social.friends.find((f) => f.otherId === id)?.profile?.username ?? null);
  } catch { /* no friend wishes today */ }
}

/*
 * A card is LIT while it is on screen. Lit means its tier's animations run
 * and it answers the tilt of the phone: the full treatment a card gets in
 * the reveal. Everywhere else used to show cards unlit for the phone's sake,
 * forty looping animations being a hot pocket, but a collection of dead
 * cards is a sad collection. The compromise is the screen itself: a card is
 * lit the moment it scrolls into view and put out the moment it leaves, so
 * only what is actually being looked at is ever animating.
 */
const litWatcher = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting) {
        target.classList.add('is-lit');
        if (!target.dataset.tilted) { target.dataset.tilted = '1'; attachTilt(target); }
        tilt.watch(target);
      } else {
        target.classList.remove('is-lit');
        tilt.forget(target);
      }
    }
  }, { rootMargin: '80px 0px', threshold: 0.05 })
  : null;

function lightWhenVisible(card) {
  if (!litWatcher) { card.classList.add('is-lit'); return; }
  litWatcher.observe(card);
}

function buildStaticCard(data, rarity, entryKey = null, { fav = true, lit = 'auto', ownedTag = false, wish = true } = {}) {
  // `lit` runs the tier's animations: `true` always (the one card in a
  // sheet), `'auto'` while it is on screen (every grid), `false` never.
  const card = document.createElement('article');
  card.className = `card is-revealed${lit === true ? ' is-lit' : ''}`;
  applyRarityVars(card, rarity);
  card.innerHTML = `<div class="card-inner"><div class="card-face card-front">${CARD_FRONT_MARKUP}</div></div>`;
  const front = card.querySelector('.card-front');
  fillFront(front, data, rarity, { ownedTag });
  const favButton = front.querySelector('.fav-button');
  if (fav && entryKey) wireFavButton(favButton, entryKey);
  else favButton.remove();
  // The wish bookmark sits under the star, on every card that can name
  // itself - your own, a friend's, a stranger's at auction.
  if (wish && data.key && !data.creator) {
    const wishButton = document.createElement('button');
    wishButton.type = 'button';
    wishButton.className = `wish-button${fav && entryKey ? '' : ' is-alone'}`;
    front.appendChild(wishButton);
    wireWishButton(wishButton, data);
  }
  if (entryKey) card.addEventListener('click', () => openCardDetail(entryKey, data, rarity));
  if (lit === true) { attachTilt(card); queueMicrotask(() => tilt.watch(card)); }
  else if (lit === 'auto') lightWhenVisible(card);
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
  reportQuest('view');

  openSheet(data.title, (body) => {
    // The detail IS the card, blown up: same frame, same tier treatment,
    // with the full text and the actions living inside it - not a small
    // card floating over a separate description.
    const card = document.createElement('article');
    card.className = 'card giant-card is-revealed is-lit';
    applyRarityVars(card, rarity);
    if (data.special) card.dataset.special = data.creator ? 'creator' : data.special;
    card.innerHTML = `
      <div class="card-inner">
        <div class="card-face card-front">
          <div class="fx fx-a" aria-hidden="true"></div>
          <div class="fx-code" aria-hidden="true"></div>
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
            <button class="btn btn-ghost btn-sm wish-giant" type="button"></button>
            <button class="btn btn-ghost btn-sm sell" type="button" hidden></button>
          </div>
          <div class="fx-p" aria-hidden="true"></div>
          <div class="fx fx-b" aria-hidden="true"></div>
          <div class="fx-ring" aria-hidden="true"></div>
        </div>
      </div>`;
    body.appendChild(card);

    // The tag that answers "do I have this?" wherever the card was met.
    if (state.collection.entries[entryKey]) {
      const tag = document.createElement('span');
      tag.className = 'owned-tag';
      tag.textContent = t('ownedTag');
      card.querySelector('.card-title').appendChild(tag);
    }

    // The wish toggle, and who else at the table wants this card.
    const wishBtn = card.querySelector('.wish-giant');
    const paintWish = () => {
      const on = state.wishlist.has(entryKey);
      wishBtn.innerHTML = `${iconSvg('wish', { size: 14 })}<span style="margin-left:6px">${esc(t(on ? 'wishOn' : 'wishTitle'))}</span>`;
      wishBtn.classList.toggle('is-wished', on);
    };
    paintWish();
    press(wishBtn, { sound: null });
    wishBtn.addEventListener('click', () => {
      toggleWish({ ...data, key: entryKey });
      paintWish();
    });
    const wishers = state.friendWishes.get(entryKey) ?? [];
    if (wishers.length) {
      const line = document.createElement('p');
      line.className = 'wish-friends';
      line.textContent = t('wishFriends', { names: wishers.join(', ') });
      card.querySelector('.giant-facts').after(line);
    }

    const art = card.querySelector('.card-art');
    if (data.thumbnail) {
      const img = document.createElement('img');
      img.src = data.thumbnail;
      img.alt = '';
      img.addEventListener('error', () => {
        img.remove();
        art.classList.add('is-no-art');
        art.insertAdjacentHTML('afterbegin', `<div class="card-art-fallback">${iconSvg(data.packIcon ?? 'packs', { size: 54 })}</div>`);
      });
      art.appendChild(img);
    } else {
      art.classList.add('is-no-art');
      art.innerHTML = `<div class="card-art-fallback">${iconSvg(data.packIcon ?? 'packs', { size: 54 })}</div>`;
    }

    card.querySelector('.card-title').textContent = data.title;
    card.querySelector('.card-desc').textContent = data.description || data.sourceName || '';
    card.querySelector('.giant-extract').textContent = data.extract;
    dressFront(card.querySelector('.card-front'), data, rarity);
    attachTilt(card);
    tilt.watch(card);
    if (rarity.id === 'rare') setTimeout(() => flare(card), 350);
    card.querySelector('.card-price').innerHTML = money(data.price);
    // How read the article is decides its tier now, so the number that earned
    // the card its rarity belongs on the card, not just on the small face.
    const readership = data.creator ? ''
      : data.views ? t('viewsPerMonth', { views: formatViews(data.views) })
        : bandFor(data.popularity ?? 0).name;
    card.querySelector('.card-views').textContent = readership;
    card.querySelector('.giant-facts').innerHTML = [
      `<span class="chip" style="color:${rarity.color};border-color:${rarity.color}">${tx(rarity.name)}</span>`,
      readership ? `<span class="chip">${esc(readership)}</span>` : '',
      entry && entry.count > 1 ? `<span class="chip">${t('copiesOwned', { n: entry.count })}</span>` : ''
    ].filter(Boolean).join('');

    const read = card.querySelector('a');
    if (data.url) {
      read.href = data.url;
      read.textContent = t('read');
      press(read, { sound: null });
    } else {
      // The Creator has no article to read and is nobody's to wish for.
      read.remove();
      wishBtn.remove();
    }

    // Selling only makes sense for a card actually in the binder, and never
    // for a special card: that one says so in its facts instead.
    const sell = card.querySelector('.sell');
    sell.hidden = !entry || store.isLocked(entry);
    if (store.isLocked(entry ?? data)) {
      const lock = document.createElement('span');
      lock.className = 'chip is-lock';
      lock.innerHTML = `${iconSvg('lock', { size: 12 })}<span>${esc(t('specialLockedShort'))}</span>`;
      lock.title = t('specialLocked');
      card.querySelector('.giant-facts').appendChild(lock);
    }
    if (entry && !store.isLocked(entry)) {
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
  if (store.isLocked(entry)) { synth.playDenied(); toast(t('specialLocked'), 'error'); return; }

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
  reportQuest('sell', { amount });
  state.profile.cardsSold = (state.profile.cardsSold ?? 0) + 1;
  store.saveProfile(state.profile);
  store.saveWallet(store.loadWallet() + amount);
  refreshWallet();
  updateBadges();
  synth.playCoins();
  toast(t('sold', { amount: money(amount) }), 'ok');
  sheet.hide();
  renderBinder();
}

/* --- tilt and light ---------------------------------------------------------------------------- */

/*
 * Every lit card carries --tx/--ty (how it leans, -1..1) and --lx/--ly (where
 * the light sits, the opposite way). The treatments read them: the foil
 * sheens slide, the gold ring catches the light, the aurora parallaxes. One
 * small loop writes them, from whichever source is loudest - a held finger,
 * then the phone's gyroscope, then a slow idle sway so a card on a desk still
 * looks alive. Values ease toward their target, so a released finger or a
 * jittery sensor never snaps the card. The loop sleeps as soon as every card
 * has settled and nothing is pushing it.
 */
const tilt = {
  cards: new Map(),
  gyro: null,
  raf: 0,
  asked: false,
  listening: false,
  reduce: matchMedia('(prefers-reduced-motion: reduce)'),

  watch(card) {
    if (this.cards.has(card)) return;
    this.cards.set(card, { tx: 0, ty: 0, drag: null, phase: Math.random() * Math.PI * 2 });
    this.wake();
  },
  /** A card that left the screen, or the page: no frame is spent on it. */
  forget(card) {
    this.cards.delete(card);
    card.style.removeProperty('--tilt-x');
    card.style.removeProperty('--tilt-y');
  },
  hold(card, tx, ty) {
    const c = this.cards.get(card);
    if (!c) return;
    c.drag = { tx: clamp(tx, -1, 1), ty: clamp(ty, -1, 1) };
    this.wake();
  },
  release(card) {
    const c = this.cards.get(card);
    if (c) c.drag = null;
    this.wake();
  },
  wake() {
    if (!this.raf && !document.hidden && this.cards.size) {
      this.raf = requestAnimationFrame((now) => this.frame(now));
    }
  },
  frame(now) {
    this.raf = 0;
    const lowPower = document.documentElement.dataset.lowpower === '1';
    const sway = !lowPower && !this.reduce.matches;
    const t = now / 1000;
    let busy = false;
    for (const [card, c] of this.cards) {
      if (!card.isConnected || !card.classList.contains('is-lit')) {
        this.cards.delete(card);
        continue;
      }
      let tx = 0;
      let ty = 0;
      if (c.drag) ({ tx, ty } = c.drag);
      else if (this.gyro && !lowPower) ({ tx, ty } = this.gyro);
      else if (sway) {
        tx = Math.sin(t * 0.9 + c.phase) * 0.45;
        ty = Math.sin(t * 1.3 + c.phase) * 0.3;
      }
      c.tx += (tx - c.tx) * 0.16;
      c.ty += (ty - c.ty) * 0.16;
      if (!tx && !ty && Math.abs(c.tx) < 0.002 && Math.abs(c.ty) < 0.002) { c.tx = 0; c.ty = 0; }
      else busy = true;
      card.style.setProperty('--tx', c.tx.toFixed(3));
      card.style.setProperty('--ty', c.ty.toFixed(3));
      card.style.setProperty('--lx', (-c.tx).toFixed(3));
      card.style.setProperty('--ly', (-c.ty).toFixed(3));
    }
    if (busy) this.wake();
  },

  /* The gyroscope. Android hands it over freely; iOS wants to be asked from a
     tap, so the first touch on a lit card asks. A slowly following baseline
     makes the card answer movement and settle flat however the phone is held. */
  listen() {
    if (this.listening) return;
    this.listening = true;
    let base = null;
    window.addEventListener('deviceorientation', (event) => {
      // Switched off in Settings: the card keeps its own slow sway, which is
      // what a desk gets anyway, and the phone stops waking for the sensor.
      if (settings().tilt === false) return;
      if (event.gamma == null || event.beta == null) return;
      if (!base) base = { beta: event.beta, gamma: event.gamma };
      base.beta += (event.beta - base.beta) * 0.012;
      base.gamma += (event.gamma - base.gamma) * 0.012;
      this.gyro = {
        tx: clamp((event.gamma - base.gamma) / 22, -1, 1),
        ty: clamp((event.beta - base.beta) / 22, -1, 1)
      };
      this.wake();
    });
  },
  async arm() {
    if (this.asked || !('DeviceOrientationEvent' in window)) return;
    this.asked = true;
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        if (await DeviceOrientationEvent.requestPermission() !== 'granted') return;
      } else if (!matchMedia('(pointer: coarse)').matches) {
        return;
      }
      this.listen();
    } catch { /* no gyroscope: the sway stands in */ }
  },
  init() {
    if ('DeviceOrientationEvent' in window && typeof DeviceOrientationEvent.requestPermission !== 'function'
      && matchMedia('(pointer: coarse)').matches) {
      this.asked = true;
      this.listen();
    }
    document.addEventListener('visibilitychange', () => this.wake());
    // The first touch on a lit card wakes the gyroscope where it needs
    // asking, and a tap on a rare card lights its title.
    document.addEventListener('pointerdown', (event) => {
      const card = event.target.closest?.('.card.is-lit');
      if (!card) return;
      this.arm();
      if (card.dataset.rarity === 'rare') flare(card);
    }, { passive: true });
  }
};

/** The rare card's title lights up electric blue for a moment. */
const flareTimers = new WeakMap();
function flare(card) {
  card.classList.add('is-hot');
  clearTimeout(flareTimers.get(card));
  flareTimers.set(card, setTimeout(() => card.classList.remove('is-hot'), 900));
}

/** Hold and move to lean the card and slide its light. It does not travel. */
function attachTilt(card) {
  card.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button, a')) return;
    trackDrag(event, {
      onMove: (dx, dy) => tilt.hold(card, dx / TILT_REACH, dy / TILT_REACH),
      onEnd: () => tilt.release(card)
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
  el.binderStats.hidden = false;
  el.binderSegWrap.hidden = false;

  const entries = store.allEntries(state.collection);
  const stats = store.collectionStats(entries.filter((e) => !e.special));
  const albums = buildAlbums(entries, state.customPacks);
  // Nobody completes an album against a real category, so the shelf reports
  // how many books are open instead of how many are finished.
  const started = albums.filter((a) => a.unlocked).length;

  el.binderStats.innerHTML = `
    <span class="stat-pill"><b>${stats.copies}</b> ${t('copies')}</span>
    <span class="stat-pill"><b>${money(stats.value)}</b> ${t('total')}</span>
    <span class="stat-pill"><b>${started}</b> ${t('albumsStarted')}</span>`;

  el.binderEmpty.hidden = entries.length > 0;
  if (!entries.length) {
    el.binderEmptyMark.innerHTML = iconSvg('collection', { size: 46 });
    el.binderEmptyText.textContent = t('emptyCollection');
  }

  if (!binderSeg) {
    binderSeg = new Segmented(el.binderSeg, [
      { id: 'albums', label: t('viewAlbums') },
      { id: 'classic', label: t('viewClassic') }
    ], (view) => {
      state.binderView = view;
      store.saveBinderView(view);
      renderBinder();
    });
    binderSeg.select(state.binderView, { silent: true });
  }

  const classic = state.binderView === 'classic';
  el.albumShelf.hidden = classic;
  el.classicView.hidden = !classic;
  el.binderTools.hidden = !classic || !entries.length;
  if (classic) return renderClassic(entries, albums);

  el.albumShelf.replaceChildren(...albums.map(buildAlbumCover));
  reveal(el.albumShelf.children, { step: 22, from: 10 });
  refreshAlbumTotals(albums.filter((a) => a.unlocked));
}

/*
 * THE CLASSIC VIEW
 * ----------------------------------------------------------------------------
 * Every card at once, for when you want to see the whole collection rather
 * than one category's book: grouped by category in shelf order, and inside
 * each group sorted from the rarest card down. The filters are the same ones
 * the albums use, so switching view keeps whatever you had narrowed down.
 */
function renderClassic(entries, albums) {
  el.classicFilter.textContent = t('filters');
  const active = activeFilterCount();
  el.classicFilterCount.textContent = String(active);
  el.classicFilterCount.hidden = !active;

  // The filter sheet's own sort is respected inside each category; rarity is
  // the default because a classic binder is read from the best card down.
  const visible = store.filterEntries(entries, state.filters);
  el.classicCount.textContent = t('classicShowing', { n: visible.length });

  const byAlbum = new Map();
  for (const entry of visible) {
    const key = albumKeyOf(entry);
    if (!byAlbum.has(key)) byAlbum.set(key, []);
    byAlbum.get(key).push(entry);
  }

  const sections = [];
  for (const album of albums) {
    const group = byAlbum.get(album.key);
    if (!group?.length) continue;
    const section = document.createElement('section');
    section.className = 'classic-group';
    section.style.setProperty('--accent', album.style.accent);
    section.innerHTML = `
      <div class="classic-group-head">
        <span class="classic-group-mark" aria-hidden="true"></span>
        <h3></h3><span class="classic-group-n tabular"></span>
      </div>
      <div class="classic-grid"></div>`;
    const emblem = album.style.emblem?.kind === 'monogram'
      ? monogramSvg(album.style.emblem.letter, album.style.emblem.spin, { size: 24 })
      : emblemSvg(album.style.emblem?.id ?? 'open', { size: 24 });
    const mark = section.querySelector('.classic-group-mark');
    mark.innerHTML = emblem;
    mark.style.setProperty('--e1', `color-mix(in srgb, ${album.style.accent} 55%, #ffffff)`);
    mark.style.setProperty('--e2', album.style.accent);
    mark.style.setProperty('--e3', album.style.accent2);
    section.querySelector('h3').textContent = album.name;
    section.querySelector('.classic-group-n').textContent = String(group.length);

    section.querySelector('.classic-grid').replaceChildren(...group.map((entry) => {
      const card = buildStaticCard(entry, rarityById(entry.rarityId), entry.key);
      card.classList.add('is-mini');
      if (entry.count > 1) {
        const badge = document.createElement('span');
        badge.className = 'copy-badge';
        badge.textContent = `\u00d7${entry.count}`;
        card.appendChild(badge);
      }
      return card;
    }));
    sections.push(section);
  }

  if (!sections.length) {
    const empty = document.createElement('p');
    empty.className = 'muted classic-empty';
    empty.textContent = t('noMatches');
    sections.push(empty);
  }
  el.classicView.replaceChildren(...sections);
  reveal(el.classicView.children, { step: 40 });
}

/**
 * Real category sizes arrive from the network after the shelf has painted.
 * Fetch whatever is missing or stale, then repaint once, if the player is
 * still looking at the collection.
 */
function refreshAlbumTotals(albums) {
  if (!albums.length) return;
  const before = albums.map((a) => `${a.key}:${a.total}`).join('|');
  Promise.all(albums.map((album) => fetchAlbumTotal(album))).then(() => {
    if (state.tab !== 'binder') return;
    const after = albums.map((a) => `${a.key}:${knownTotalOf(a)}`).join('|');
    if (after !== before) renderBinder();
  });
}

const knownTotalOf = (album) => {
  const fresh = buildAlbums(store.allEntries(state.collection), state.customPacks)
    .find((a) => a.key === album.key);
  return fresh?.total ?? null;
};

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
    album.unlocked ? `${album.owned}/${album.total == null ? '?' : compactCount(album.total)}` : t('albumLocked');
  cover.querySelector('.album-cover-bar i').style.width =
    `${album.total ? Math.min(100, (album.owned / album.total) * 100) : 0}%`;
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
  el.albumProgress.textContent = `${album.owned}/${album.total == null ? '?' : compactCount(album.total)}`
    + (album.complete ? ` · ${t('albumComplete')}` : '');
  if (album.total == null) refreshAlbumTotals([album]);
  el.filterOpen.textContent = t('filters');
  const active = activeFilterCount();
  el.filterCount.textContent = String(active);
  el.filterCount.hidden = !active;

  // The book takes the album's palette so every album reads as its own book.
  el.albumBook.style.setProperty('--accent', album.style.accent);
  el.albumBook.style.setProperty('--accent2', album.style.accent2);

  const visible = album.kind === 'code'
    // A special album shows every one of its cards, whatever the binder's
    // filters say (a rarity, a band or a search set elsewhere must not empty
    // it), in the order the booster dealt them: the things, then The Creator.
    ? [...album.entries].sort((a, b) => (a.creator ? 1 : 0) - (b.creator ? 1 : 0) || (a.firstPulledAt ?? 0) - (b.firstPulledAt ?? 0))
    : store.filterEntries(album.entries, { ...state.filters, pack: '' });
  const pages = Math.max(pageCount(album, visible.length), 1);
  const page = Math.min(state.album.spread, pages - 1);
  state.album.spread = page;

  fillAlbumPage(el.pageSlots, visible, page * CARDS_PER_PAGE, album);
  el.pageno.textContent = String(page + 1);

  if (pages <= 12) {
    el.albumDots.replaceChildren(...Array.from({ length: pages }, (_, i) => {
      const dot = document.createElement('span');
      dot.className = `album-dot${i === page ? ' is-on' : ''}`;
      return dot;
    }));
  } else {
    const counter = document.createElement('span');
    counter.className = 'album-dot-count tabular';
    counter.textContent = `${page + 1} / ${pages}`;
    el.albumDots.replaceChildren(counter);
  }
  el.albumHint.textContent = t('albumSwipeHint');
}

function fillAlbumPage(node, entries, offset, album) {
  const slots = [];
  for (let i = 0; i < CARDS_PER_PAGE; i++) {
    const entry = entries[offset + i];
    if (entry) {
      const card = buildStaticCard(entry, rarityById(entry.rarityId), entry.key);
      card.classList.add('is-mini');
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

/** How many pages this album's book holds, given what the filters let through. */
function pageCount(album, visibleCount) {
  const filled = Math.max(1, Math.ceil(visibleCount / CARDS_PER_PAGE));
  // One blank page at the back says there is more of this category out there,
  // unless you have actually finished it.
  return album.complete ? filled : filled + 1;
}

/** Turn the page: the leaf folds away at the spine, then the next one opens. */
function turnAlbumPage(dir) {
  const album = currentAlbum();
  if (!album || state.albumTurning) return;
  const visible = album.kind === 'code'
    // A special album shows every one of its cards, whatever the binder's
    // filters say (a rarity, a band or a search set elsewhere must not empty
    // it), in the order the booster dealt them: the things, then The Creator.
    ? [...album.entries].sort((a, b) => (a.creator ? 1 : 0) - (b.creator ? 1 : 0) || (a.firstPulledAt ?? 0) - (b.firstPulledAt ?? 0))
    : store.filterEntries(album.entries, { ...state.filters, pack: '' });
  const pages = Math.max(pageCount(album, visible.length), 1);
  const next = state.album.spread + dir;
  if (next < 0 || next >= pages) {
    // The cover thuds: there is nothing further.
    el.albumBook.classList.remove('turn-bump-l', 'turn-bump-r');
    void el.albumBook.offsetWidth;
    el.albumBook.classList.add(dir > 0 ? 'turn-bump-r' : 'turn-bump-l');
    return;
  }
  state.albumTurning = true;
  synth.playPageTurn();
  const leaf = el.albumLeaf;
  leaf.classList.add(dir > 0 ? 'is-folding-r' : 'is-folding-l');
  setTimeout(() => {
    state.album.spread = next;
    renderAlbum();
    leaf.classList.remove('is-folding-r', 'is-folding-l');
    leaf.classList.add(dir > 0 ? 'is-unfolding-r' : 'is-unfolding-l');
    setTimeout(() => {
      leaf.classList.remove('is-unfolding-r', 'is-unfolding-l');
      state.albumTurning = false;
    }, dur(240));
  }, dur(230));
}

function openFilters() {
  openSheet(t('filters'), (body) => {
    const entries = store.allEntries(state.collection);
    // Categories, in shelf order, and only the ones actually owned: a filter
    // that offers you empty categories is a filter that wastes a tap.
    const packs = buildAlbums(entries, state.customPacks)
      .filter((album) => album.owned > 0)
      .map((album) => [album.key, album.name]);

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
    // Both views read the same filters, so both repaint from one place.
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
  paintFrameInto(el.profileRing, frameStyle(), frameTier(level));
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

  renderBadges();

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
    [t('statAlbums'), String(albumsDeep(entries, state.customPacks))],
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

/* --- the card index: everything anyone has found ------------------------------------------
 * The shared codex, browsable: search, tier filters, three sorts, and the
 * wishlist view. Cards here are knowledge, not property - the Owned tag is
 * what separates the two at a glance.
 */

const INDEX_SORTS = ['recent', 'name', 'value'];

function codexCardData(row) {
  const lang = row.lang ?? String(row.key).split(':')[0] ?? 'en';
  const title = String(row.key).split(':').slice(1).join(':');
  return {
    key: row.key, title: row.title, rarityId: row.rarity, price: row.price ?? 0,
    views: row.views ?? null, thumbnail: row.thumbnail, lang,
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    description: '', extract: ''
  };
}

function indexTile(row) {
  const data = codexCardData(row);
  const rarity = rarityOfCard(data);
  const card = buildStaticCard(data, rarity, null, { fav: false, ownedTag: true });
  card.addEventListener('click', () => { synth.playTap(); openCardDetail(data.key, data, rarity, { fromIndex: true }); });
  return card;
}

function renderCardIndex() {
  const ci = state.cardIndex;
  el.indexTitle.textContent = t('tabIndex');
  el.indexIntro.textContent = t('indexIntro');
  el.indexSearch.placeholder = t('marketSearch');
  el.indexSearch.value = ci.search;

  if (!account.configured || !signedIn()) {
    el.indexStatus.textContent = account.configured ? t('marketSignIn') : t('marketOffline');
    el.indexStatus.className = 'find-status';
    el.indexCounts.replaceChildren();
    el.indexList.replaceChildren();
    el.indexMore.hidden = true;
    return;
  }
  el.indexStatus.textContent = '';

  if (!el.indexSearch.dataset.bound) {
    el.indexSearch.dataset.bound = '1';
    let debounce = null;
    el.indexSearch.addEventListener('input', () => {
      ci.search = el.indexSearch.value;
      clearTimeout(debounce);
      debounce = setTimeout(() => loadIndexPage(true), 280);
    });
    el.indexMore.addEventListener('click', () => { synth.playTap(); loadIndexPage(false); });
    press(el.indexMore, { sound: null });
  }

  // The wishlist toggle leads the tier row; the tiers follow.
  const wishChip = document.createElement('button');
  wishChip.type = 'button';
  wishChip.className = `chip market-sort${ci.wishMode ? ' is-on' : ''}`;
  wishChip.innerHTML = `${iconSvg('wish', { size: 12 })}<span style="margin-left:5px">${esc(t('wishTitle'))}</span>`;
  press(wishChip, { sound: null });
  wishChip.addEventListener('click', () => {
    synth.playTap();
    ci.wishMode = !ci.wishMode;
    renderCardIndex();
  });
  el.indexRarities.replaceChildren(wishChip, ...[null, ...RARITIES.map((r) => r.id)].map((id) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip market-sort${!ci.wishMode && ci.rarity === id ? ' is-on' : ''}`;
    const rarity = id ? rarityById(id) : null;
    chip.textContent = rarity ? tx(rarity.name) : t('filterAll');
    if (rarity && !(ci.rarity === id)) chip.style.color = rarity.color;
    press(chip, { sound: null });
    chip.addEventListener('click', () => {
      synth.playTap();
      ci.wishMode = false;
      ci.rarity = id;
      renderCardIndex();
    });
    return chip;
  }));

  el.indexSorts.replaceChildren(...INDEX_SORTS.map((sort) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip market-sort${ci.sort === sort ? ' is-on' : ''}`;
    chip.textContent = t(`indexSort_${sort}`);
    press(chip, { sound: null });
    chip.addEventListener('click', () => {
      if (ci.sort === sort) return;
      synth.playTap();
      ci.sort = sort;
      renderCardIndex();
    });
    return chip;
  }));
  el.indexSorts.hidden = ci.wishMode;

  if (ci.wishMode) {
    el.indexCounts.replaceChildren(Object.assign(document.createElement('span'),
      { className: 'stat-pill',
        textContent: state.wishlist.size === 1
          ? t('wishCountOne')
          : t('wishCount', { n: state.wishlist.size }) }));
    const rows = [...state.wishlist.values()].map((card) => ({
      key: card.key, title: card.title, rarity: card.rarityId,
      price: card.price, views: card.views, thumbnail: card.thumbnail, lang: card.lang
    }));
    el.indexMore.hidden = true;
    if (!rows.length) {
      el.indexList.replaceChildren(Object.assign(document.createElement('p'),
        { className: 'empty-note', textContent: t('wishEmpty') }));
    } else {
      el.indexList.replaceChildren(...rows.map(indexTile));
    }
    refreshWishes().then(() => { if (state.tab === 'cardindex' && ci.wishMode) renderCardIndex(); });
    return;
  }

  paintIndexCounts();
  loadIndexPage(true);
}

async function paintIndexCounts() {
  const ci = state.cardIndex;
  try {
    ci.counts = await account.codexCounts();
  } catch (error) {
    if (error?.message === 'INDEX_UNSET') {
      el.indexStatus.textContent = t('indexUnset');
      el.indexStatus.className = 'find-status is-error';
    }
    return;
  }
  if (state.tab !== 'cardindex') return;
  const pills = [Object.assign(document.createElement('span'),
    { className: 'stat-pill', innerHTML: `<b>${Number(ci.counts.total ?? 0).toLocaleString()}</b> ${esc(t('indexDiscovered'))}` })];
  for (const rarity of RARITIES) {
    const n = ci.counts.byRarity?.[rarity.id] ?? 0;
    if (!n) continue;
    const pill = document.createElement('span');
    pill.className = 'stat-pill';
    pill.innerHTML = `<b style="color:${rarity.color}">${Number(n).toLocaleString()}</b> ${esc(tx(rarity.name))}`;
    pills.push(pill);
  }
  el.indexCounts.replaceChildren(...pills);
}

async function loadIndexPage(reset) {
  const ci = state.cardIndex;
  if (ci.busy) return;
  ci.busy = true;
  if (reset) { ci.page = 0; ci.rows = []; }
  const PAGE = 40;
  try {
    const rows = await account.codexPage({
      search: ci.search, rarity: ci.rarity, sort: ci.sort,
      offset: ci.page * PAGE, limit: PAGE
    });
    ci.rows = reset ? rows : [...ci.rows, ...rows];
    ci.more = rows.length === PAGE;
    ci.page += 1;
    if (state.tab === 'cardindex' && !ci.wishMode) {
      el.indexStatus.textContent = '';
      if (!ci.rows.length) {
        el.indexList.replaceChildren(Object.assign(document.createElement('p'),
          { className: 'empty-note', textContent: t('indexEmpty') }));
      } else {
        el.indexList.replaceChildren(...ci.rows.map(indexTile));
      }
      el.indexMore.hidden = !ci.more;
      el.indexMore.textContent = t('indexMore');
    }
  } catch (error) {
    el.indexStatus.textContent = error?.message === 'INDEX_UNSET' ? t('indexUnset') : describeError(error);
    el.indexStatus.className = 'find-status is-error';
  }
  ci.busy = false;
}

/* --- the glossary: every booster category, sealed --------------------------------------- */

function renderGlossary() {
  el.glossaryTitle.textContent = t('tabGlossary');
  el.glossaryIntro.textContent = t('glossaryIntro');
  el.glossaryList.replaceChildren(...THEME_PACKS.map((theme) => {
    const spec = { kind: 'theme', themeId: theme.id, rarityId: null, cards: 5 };
    const row = document.createElement('div');
    row.className = 'glossary-row';
    row.style.setProperty('--ga', theme.accent);
    row.innerHTML = `
      <span class="glossary-mark">${emblemSvg(theme.id, { size: 34 })}</span>
      <span class="glossary-copy"><b></b><span></span></span>`;
    row.querySelector('b').textContent = specName(spec);
    row.querySelector('.glossary-copy span').textContent = specTagline(spec);
    return row;
  }));
}

/* --- the market: every player's auction floor --------------------------------------------
 * The rules live in the database (supabase/schema.sql, V3): the 15% floor,
 * the anti-snipe clock, the no-cancel-once-bid rule and settlement are all
 * server-side, so this file only ASKS. Money moves the way it always has:
 * a bid debits the local wallet before the call; refunds and payouts come
 * back as deliveries, like gifts. While the screen is open it listens on
 * Realtime and polls at a slow beat as well, so a project without Realtime
 * loses immediacy, never correctness.
 */

const AUCTION_MINUTES = [10, 30, 60, 180, 360, 720, 1440];
const minutesLabel = (m) => (m < 60 ? `${m} min` : `${m / 60} h`);
const auctionFloor = (a) =>
  (a.current_bid == null ? a.start_price : Math.ceil(a.current_bid * 1.15));
const auctionLeftMs = (a) => new Date(a.ends_at).getTime() - Date.now();

function fmtLeft(ms) {
  if (ms <= 0) return t('marketEnded');
  const sec = Math.ceil(ms / 1000);
  if (sec < 100) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${String(sec % 60).padStart(2, '0')}s`;
  const h = Math.floor(min / 60);
  return `${h}h ${String(min % 60).padStart(2, '0')}m`;
}

const rememberBid = (id) => {
  const mine = state.market.myBids;
  if (!mine.includes(id)) { mine.push(id); store.saveMyBids(mine); }
};

/* One second of housekeeping: countdowns tick, and whichever app first sees
 * a timer at zero rings the settlement bell for everyone. The loops shut
 * themselves down one tick after the player leaves the screen. */
function marketLoopsOn() {
  const m = state.market;
  if (m.timer) return;
  m.timer = setInterval(marketTick, 1000);
  m.poll = setInterval(() => {
    if (state.tab === 'market') refreshMarket({ quiet: true });
  }, 5000);
  m.unsub = account.subscribeAuctions((row) => {
    if (state.tab !== 'market') return;
    if (row?.id) {
      const i = m.auctions.findIndex((a) => a.id === row.id);
      if (i >= 0) m.auctions[i] = row; else m.auctions.unshift(row);
      renderMarketList();
    } else {
      refreshMarket({ quiet: true });
    }
  });
}

function marketLoopsOff() {
  const m = state.market;
  clearInterval(m.timer); clearInterval(m.poll);
  m.timer = m.poll = null;
  m.unsub?.(); m.unsub = null;
}

function marketTick() {
  if (state.tab !== 'market') { marketLoopsOff(); return; }
  for (const cell of el.marketList.querySelectorAll('[data-ends]')) {
    const left = new Date(cell.dataset.ends).getTime() - Date.now();
    cell.textContent = fmtLeft(left);
    cell.classList.toggle('is-closing', left > 0 && left < 60000);
  }
  for (const a of state.market.auctions) {
    if (a.status === 'open' && auctionLeftMs(a) <= 0) maybeSettle(a);
  }
}

function maybeSettle(a) {
  const m = state.market;
  if (m.settling.has(a.id)) return;
  m.settling.add(a.id);
  account.settleAuction(a.id)
    .catch(() => { /* someone else rang the bell first, or it is not over on the server clock */ })
    .then(async () => {
      await collectDeliveries().catch(() => {});
      if (state.tab === 'market') refreshMarket({ quiet: true });
    });
}

async function refreshMarket({ quiet = false } = {}) {
  const m = state.market;
  if (!quiet) { el.marketStatus.textContent = t('marketLoading'); el.marketStatus.className = 'find-status is-working'; }
  try {
    m.auctions = await account.listAuctions(userId());
    // A wished card walking onto the floor rings the bell, once per auction.
    let rang = false;
    for (const a of m.auctions) {
      if (a.status !== 'open' || a.seller === userId()) continue;
      if (!state.wishlist.has(a.card?.key) || state.wishSeen.has(a.id)) continue;
      state.wishSeen.add(a.id);
      rang = true;
      pushNote('wish', t('notifWishAuction', { card: esc(a.card?.title ?? '?') }), 'market');
    }
    if (rang) store.saveWishSeen([...state.wishSeen]);
    el.marketStatus.textContent = '';
    renderMarketList();
  } catch (error) {
    el.marketStatus.textContent = error?.message === 'MARKET_UNSET' ? t('marketUnset') : describeError(error);
    el.marketStatus.className = 'find-status is-error';
  }
}

const MARKET_VIEWS = ['browse', 'selling', 'bidding', 'won', 'history'];
const MARKET_SORTS = ['ending', 'newest', 'lowest', 'highest'];

function renderMarket() {
  el.marketTitle.textContent = t('tabMarket');
  el.marketIntro.textContent = t('marketIntro');
  el.marketSell.textContent = t('marketSell');

  if (!account.configured || !signedIn()) {
    el.marketStatus.textContent = account.configured ? t('marketSignIn') : t('marketOffline');
    el.marketStatus.className = 'find-status';
    el.marketList.replaceChildren();
    el.marketSell.hidden = true;
    el.marketSeg.parentElement.hidden = true;
    return;
  }
  el.marketSell.hidden = false;
  el.marketSeg.parentElement.hidden = false;

  // Five rooms, as a scrollable chip row: a five-way segment control does
  // not fit a phone.
  el.marketSeg.className = 'market-views';
  el.marketSeg.replaceChildren(...MARKET_VIEWS.map((view) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip market-view${state.market.view === view ? ' is-on' : ''}`;
    chip.textContent = t(`marketView_${view}`);
    press(chip, { sound: null });
    chip.addEventListener('click', () => {
      if (state.market.view === view) return;
      synth.playTap();
      state.market.view = view;
      renderMarket();
    });
    return chip;
  }));

  // Browse gets the finding tools; the other rooms are short lists.
  let tools = el.marketList.parentElement.querySelector('.market-tools');
  if (!tools) {
    tools = document.createElement('div');
    tools.className = 'market-tools';
    el.marketList.before(tools);
  }
  if (state.market.view === 'browse') {
    tools.hidden = false;
    tools.innerHTML = `
      <input class="creator-input market-search" type="search" data-search
        autocomplete="off" spellcheck="false">
      <div class="market-sorts" data-sorts></div>`;
    const input = tools.querySelector('[data-search]');
    input.placeholder = t('marketSearch');
    input.value = state.market.search;
    input.addEventListener('input', () => {
      state.market.search = input.value;
      renderMarketList();
    });
    tools.querySelector('[data-sorts]').replaceChildren(...MARKET_SORTS.map((sort) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `chip market-sort${state.market.sort === sort ? ' is-on' : ''}`;
      chip.textContent = t(`marketSort_${sort}`);
      press(chip, { sound: null });
      chip.addEventListener('click', () => {
        if (state.market.sort === sort) return;
        synth.playTap();
        state.market.sort = sort;
        renderMarket();
      });
      return chip;
    }));
  } else {
    tools.hidden = true;
  }

  marketLoopsOn();
  refreshMarket();
}

const normalise = (text) => String(text ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

/** What each room shows, from the one fetched pool. */
function marketRows() {
  const m = state.market;
  const me = userId();
  const open = (a) => a.status === 'open';
  switch (m.view) {
    case 'selling':
      return m.auctions.filter((a) => a.seller === me && open(a))
        .sort((a, b) => new Date(a.ends_at) - new Date(b.ends_at));
    case 'bidding':
      return m.auctions.filter((a) => open(a) && a.seller !== me && m.myBids.includes(a.id))
        .sort((a, b) => new Date(a.ends_at) - new Date(b.ends_at));
    case 'won':
      return m.auctions.filter((a) => a.status === 'settled' && a.bidder === me)
        .sort((a, b) => new Date(b.ends_at) - new Date(a.ends_at));
    case 'history':
      return m.auctions.filter((a) => a.seller === me && !open(a))
        .sort((a, b) => new Date(b.ends_at) - new Date(a.ends_at));
    default: {
      let rows = m.auctions.filter(open);
      const q = normalise(m.search.trim());
      if (q) rows = rows.filter((a) => normalise(a.card?.title).includes(q));
      const bid = (a) => a.current_bid ?? a.start_price;
      const sorts = {
        ending: (a, b) => new Date(a.ends_at) - new Date(b.ends_at),
        newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
        lowest: (a, b) => bid(a) - bid(b),
        highest: (a, b) => bid(b) - bid(a)
      };
      return [...rows].sort(sorts[m.sort] ?? sorts.ending);
    }
  }
}

function auctionTile(a) {
  const me = userId();
  const m = state.market;
  const rarity = rarityOfCard(a.card);

  const tile = document.createElement('div');
  tile.className = 'auction-tile';

  // The band above the card: your standing in the fight, or the outcome.
  let band = null;
  if (m.view === 'bidding') {
    const leading = a.bidder === me;
    band = { text: t(leading ? 'marketLead' : 'marketOutbidBand'), cls: leading ? 'is-good' : 'is-bad' };
  } else if (m.view === 'won') {
    band = {
      text: t('marketWonBand', {
        amount: formatAmount(a.current_bid ?? 0),
        date: new Date(a.ends_at).toLocaleDateString(getLanguage() === 'fr' ? 'fr-FR' : 'en-GB')
      }),
      cls: 'is-good'
    };
  } else if (m.view === 'history') {
    const sold = a.status === 'settled' && a.bidder != null;
    band = {
      text: a.status === 'cancelled'
        ? t('marketHistWithdrawn', { amount: formatAmount(a.start_price) })
        : sold
          ? t('marketHistSold', { amount: formatAmount(a.current_bid ?? 0) })
          : t('marketHistUnsold', { amount: formatAmount(a.start_price) }),
      cls: sold ? 'is-good' : ''
    };
  } else if (a.seller === me) {
    band = { text: t('marketYours'), cls: '' };
  }
  if (band) {
    const strip = document.createElement('span');
    strip.className = `auction-band ${band.cls}`;
    strip.textContent = band.text;
    tile.appendChild(strip);
  }

  const card = buildStaticCard(a.card, rarity, null, { fav: false, ownedTag: true });
  card.addEventListener('click', () => { synth.playTap(); openAuctionSheet(a.id); });
  tile.appendChild(card);

  const info = document.createElement('div');
  info.className = 'auction-info';
  const open = a.status === 'open';
  info.innerHTML = `
    <span class="auction-bid">${money(a.current_bid ?? a.start_price)}</span>
    ${open ? `<span class="auction-time market-time" data-ends="${esc(a.ends_at)}">${esc(fmtLeft(auctionLeftMs(a)))}</span>` : ''}
    <span class="auction-sub">${esc(a.bid_count > 0 ? t('marketBids', { n: a.bid_count }) : t('marketNoBids'))}</span>
    <span class="auction-sub is-seller">${esc(a.seller === me ? t('marketYours') : (a.seller_name || '?'))}</span>`;
  tile.appendChild(info);
  return tile;
}

function renderMarketList() {
  const rows = marketRows();
  if (!rows.length) {
    const note = document.createElement('p');
    note.className = 'empty-note';
    note.textContent = t(`marketEmpty_${state.market.view}`);
    el.marketList.replaceChildren(note);
    return;
  }
  el.marketList.replaceChildren(...rows.map(auctionTile));
}

/** One auction, up close: the card, the clock, and the way to bid on it -
 *  or, for the seller, the way out while nobody has bid yet. */
function openAuctionSheet(auctionId) {
  const a = state.market.auctions.find((x) => x.id === auctionId);
  if (!a) return;
  const me = userId();
  const mine = a.seller === me;
  const floor = auctionFloor(a);

  openSheet(a.card?.title ?? '?', (body) => {
    const wrap = document.createElement('div');
    wrap.className = 'market-sheet';
    wrap.innerHTML = `
      <div class="market-head">
        <span class="market-art is-big"></span>
        <div class="market-lines"></div>
      </div>
      <div class="market-actions"></div>`;
    const art = wrap.querySelector('.market-art');
    if (a.card?.thumbnail) art.style.backgroundImage = `url("${String(a.card.thumbnail).replace(/"/g, '%22')}")`;
    art.style.borderColor = rarityOfCard(a.card).color;

    const line = (label, html) =>
      `<p class="market-line"><span>${esc(label)}</span><b>${html}</b></p>`;
    const open = a.status === 'open';
    wrap.querySelector('.market-lines').innerHTML = [
      rarity ? line(tx(rarity.name), `<span style="color:${rarity.color}">${money(a.card?.price ?? 0)}</span>`) : '',
      open ? line(t('marketTimeLeft'), `<span data-ends="${esc(a.ends_at)}">${esc(fmtLeft(auctionLeftMs(a)))}</span>`) : '',
      a.current_bid != null
        ? line(t('marketCurrent'), `${money(a.current_bid)}${a.bidder_name ? ` · ${esc(a.bidder_name)}` : ''}`)
        : line(t('marketStartAt'), money(a.start_price)),
      !open && a.status === 'settled' && a.bidder
        ? line(t('marketSoldLine'), `${money(a.current_bid)} · ${esc(a.bidder_name ?? '?')}`)
        : '',
      !open && a.status === 'settled' && !a.bidder ? line('', esc(t('marketHistUnsold', { amount: formatAmount(a.start_price) }))) : '',
      !open && a.status === 'cancelled' ? line('', esc(t('marketCancelled'))) : '',
      mine || !open ? '' : line('', esc(t('marketFloorLine', { amount: formatAmount(floor) })))
    ].filter(Boolean).join('');

    const actions = wrap.querySelector('.market-actions');
    if (mine) {
      if (a.bid_count === 0 && a.status === 'open') {
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'btn btn-danger btn-block';
        cancel.textContent = t('marketCancel');
        press(cancel, { sound: null });
        cancel.addEventListener('click', async () => {
          if (state.market.busy) return;
          state.market.busy = true;
          cancel.disabled = true;
          try {
            await account.cancelAuction(a.id);
            toast(t('marketCancelled'), 'ok');
            synth.playResolved();
            sheet.hide();
            await collectDeliveries().catch(() => {});
            refreshMarket({ quiet: true });
          } catch (error) {
            toast(esc(marketError(error)), 'error');
            cancel.disabled = false;
          }
          state.market.busy = false;
        });
        actions.appendChild(cancel);
      } else if (a.status === 'open') {
        actions.innerHTML = `<p class="frames-note">${esc(t('marketCancelLocked'))}</p>`;
      }
    } else if (a.status === 'open') {
      actions.innerHTML = `
        <label class="label" style="display:block;margin-bottom:6px">${esc(t('marketBidLabel'))}</label>
        <input class="creator-input" type="number" inputmode="numeric" min="${floor}" step="1" value="${floor}" data-bid>
        <button class="btn btn-primary btn-block" type="button" style="margin-top:10px" data-go></button>
        <p class="frames-note" style="margin-top:10px">${esc(t('marketSnipeNote'))}</p>`;
      const input = actions.querySelector('[data-bid]');
      const go = actions.querySelector('[data-go]');
      const paint = () => {
        const amount = Math.floor(Number(input.value) || 0);
        go.innerHTML = t('marketBidGo', { amount: money(Math.max(amount, floor)) });
      };
      paint();
      input.addEventListener('input', paint);
      press(go, { sound: null });
      go.addEventListener('click', () => placeBidFlow(a, Math.floor(Number(input.value) || 0), go));
    }
    body.appendChild(wrap);
  });
}

const marketError = (error, auction = null) => {
  const code = String(error?.message ?? '');
  if (code.includes('TOO_LOW')) {
    const fresh = auction && state.market.auctions.find((x) => x.id === auction.id);
    return t('marketTooLow', { amount: formatAmount(auctionFloor(fresh ?? auction ?? { start_price: 0 })) });
  }
  if (code.includes('ENDED') || code.includes('NOT_OVER')) return t('marketEndedToast');
  if (code.includes('HAS_BIDS')) return t('marketCancelLocked');
  if (code.includes('TOO_MANY')) return t('marketTooMany');
  if (code.includes('OWN_AUCTION')) return t('marketOwn');
  if (code.includes('MARKET_UNSET')) return t('marketUnset');
  return describeError(error);
};

async function placeBidFlow(a, amount, btn) {
  const m = state.market;
  if (m.busy) return;
  const floor = auctionFloor(a);
  if (!Number.isFinite(amount) || amount < floor) {
    toast(t('marketTooLow', { amount: formatAmount(floor) }), 'error');
    synth.playDenied();
    return;
  }
  if (amount > store.loadWallet()) {
    toast(t('marketNoFunds'), 'error');
    synth.playDenied();
    return;
  }
  m.busy = true;
  btn.disabled = true;
  // The money leaves first; a failed call puts it straight back. Winning
  // means it is already paid; being outbid brings it home as a delivery.
  store.saveWallet(store.loadWallet() - amount);
  refreshWallet();
  syncSoon();
  try {
    const updated = await account.placeBid(a.id, amount);
    rememberBid(a.id);
    const i = m.auctions.findIndex((x) => x.id === a.id);
    if (i >= 0 && updated?.id) m.auctions[i] = updated;
    toast(t('marketBidPlaced', { amount: money(amount) }), 'ok');
    synth.playPurchase();
    sheet.hide();
    renderMarketList();
  } catch (error) {
    store.saveWallet(store.loadWallet() + amount);
    refreshWallet();
    toast(esc(marketError(error, a)), 'error');
    synth.playDenied();
    btn.disabled = false;
    refreshMarket({ quiet: true });
  }
  m.busy = false;
}

/** Sell: pick a card, price it, pick a clock, and it leaves your binder. */
function openSellSheet() {
  const me = userId();
  const myOpen = state.market.auctions.filter((a) => a.seller === me && a.status === 'open').length;
  if (myOpen >= 10) {
    toast(t('marketTooMany'), 'error');
    synth.playDenied();
    return;
  }
  const mine = store.allEntries(state.collection).filter((c) => c.count > 0 && !store.isLocked(c));
  openSheet(t('marketPickCard'), (body) => {
    if (!mine.length) {
      body.innerHTML = `<p class="muted">${esc(t('marketNoCards'))}</p>`;
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'market-pick';
    grid.replaceChildren(...mine.slice(0, 200).map((entry) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'market-cell';
      cell.innerHTML = `<span class="market-cell-art"></span><b></b>`;
      const art = cell.querySelector('.market-cell-art');
      if (entry.thumbnail) art.style.backgroundImage = `url("${String(entry.thumbnail).replace(/"/g, '%22')}")`;
      art.style.borderColor = rarityById(entry.rarityId)?.color ?? 'transparent';
      cell.querySelector('b').textContent = entry.title;
      press(cell, { sound: null });
      cell.addEventListener('click', () => { synth.playTap(); openListSheet(entry); });
      return cell;
    }));
    body.appendChild(grid);
  });
}

function openListSheet(entry) {
  openSheet(entry.title, (body) => {
    let minutes = 60;
    body.innerHTML = `
      <div class="market-sheet">
        <div class="market-head">
          <span class="market-art is-big" style="border-color:${rarityById(entry.rarityId)?.color ?? 'transparent'}"></span>
          <div class="market-lines">
            <p class="market-line"><span>${esc(t('marketStartPrice'))}</span></p>
            <input class="creator-input" type="number" inputmode="numeric" min="1" step="1" value="${entry.price}" data-price>
            <p class="market-line" style="margin-top:10px"><span>${esc(t('marketDuration'))}</span></p>
            <div class="market-durations" data-durations></div>
          </div>
        </div>
        <button class="btn btn-primary btn-block" type="button" data-go></button>
        <p class="frames-note" style="margin-top:10px">${esc(t('marketSnipeNote'))}</p>
      </div>`;
    const art = body.querySelector('.market-art');
    if (entry.thumbnail) art.style.backgroundImage = `url("${String(entry.thumbnail).replace(/"/g, '%22')}")`;
    const durations = body.querySelector('[data-durations]');
    durations.replaceChildren(...AUCTION_MINUTES.map((m) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `chip market-duration${m === minutes ? ' is-on' : ''}`;
      chip.textContent = minutesLabel(m);
      press(chip, { sound: null });
      chip.addEventListener('click', () => {
        minutes = m;
        synth.playTap();
        durations.querySelectorAll('.market-duration').forEach((c) => c.classList.toggle('is-on', c === chip));
      });
      return chip;
    }));
    const go = body.querySelector('[data-go]');
    go.textContent = t('marketListGo');
    press(go, { sound: null });
    go.addEventListener('click', async () => {
      if (state.market.busy) return;
      const price = Math.floor(Number(body.querySelector('[data-price]').value) || 0);
      if (price < 1) { synth.playDenied(); return; }
      state.market.busy = true;
      go.disabled = true;
      // Escrow first: the card leaves the binder, and comes back by delivery
      // if the call fails, the sale is withdrawn, or nobody bids.
      const snapshot = { ...entry, count: 1, favorite: false };
      store.sellCopy(state.collection, entry.key);
      syncSoon();
      try {
        await account.createAuction(snapshot, price, minutes);
        toast(t('marketListed', { card: esc(entry.title) }), 'ok');
        synth.playResolved();
        sheet.hide();
        renderBinder();
        refreshMarket({ quiet: true });
      } catch (error) {
        store.receiveCardEntry(state.collection, snapshot);
        syncSoon();
        toast(esc(marketError(error)), 'error');
        synth.playDenied();
        go.disabled = false;
      }
      state.market.busy = false;
    });
  });
}

/* --- badges ------------------------------------------------------------------------------
 * Holographic chips for the hard end of the achievement chains, between the
 * level card and the statistics. Locked chips stay visible in grey: a shelf
 * of things to want is worth more than a blank space. */

function allBadgeStates() {
  const evaluated = evaluateAchievements(achFacts(), state.profile.achievements?.redeemed ?? []);
  return badgeStates(evaluated, state.profile.codesRedeemed ?? {});
}

/** Put a badge on the profile without asking: the code's own, the moment it is redeemed. */
function wearBadge(id) {
  const states = allBadgeStates();
  if (state.badgeLoadout === null) state.badgeLoadout = wornBadges(states).map((w) => w.badge.id);
  const worn = state.badgeLoadout;
  if (!worn.includes(id)) {
    if (worn.length >= 4) worn.shift();
    worn.push(id);
  }
  // Saved even when the automatic shelf already had it: from now on the
  // choice is explicit, so nothing later can quietly drop the badge.
  store.saveBadgeLoadout(worn);
}

/** The chips actually on the profile: the chosen four, or, before anyone has
 *  chosen, the best-ranked earned ones. */
function wornBadges(states) {
  const earned = states.filter((st) => st.rank > 0);
  // A choice, empty included, is shown as made. Only the absence of any
  // choice falls back to the automatic shelf.
  if (state.badgeLoadout !== null) {
    return state.badgeLoadout
      .map((id) => earned.find((st) => st.badge.id === id))
      .filter(Boolean)
      .slice(0, 4);
  }
  return [...earned]
    .sort((a, b) => (b.rank / b.max) - (a.rank / a.max) || b.rank - a.rank)
    .slice(0, 4);
}

function badgeChip(st, { worn = false } = {}) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `badge-chip${st.rank > 0 ? '' : ' is-locked'}`;
  chip.innerHTML = `${badgeSvg(st.badge, st.rank, st.max, { size: 62 })}<b></b><span class="badge-rank"></span>`;
  chip.querySelector('b').textContent = st.name;
  const sub = chip.querySelector('.badge-rank');
  if (worn) {
    sub.replaceWith(Object.assign(document.createElement('span'),
      { className: 'badge-equipped-tag', textContent: `${st.max > 1 && st.rank > 0 ? romanRank(st.rank) + ' · ' : ''}${t('badgeWornTag')}` }));
  } else {
    sub.textContent = st.max > 1 && st.rank > 0 ? romanRank(st.rank) : '';
  }
  press(chip, { sound: null });
  chip.addEventListener('click', () => { synth.playTap(); openBadgeSheet(st); });
  return chip;
}

function renderBadges() {
  const states = allBadgeStates();
  const earned = states.filter((st) => st.rank > 0).length;
  el.badgesLabel.textContent = `${t('badgesTitle')} · ${earned}/${states.length}`;

  // The way to the full shelf lives in the section head.
  const head = el.badgesLabel.parentElement;
  head.style.display = 'flex';
  head.style.alignItems = 'center';
  let manage = head.querySelector('.badges-manage');
  if (!manage) {
    manage = document.createElement('button');
    manage.type = 'button';
    manage.className = 'btn btn-sm btn-ghost badges-manage';
    press(manage, { sound: null });
    manage.addEventListener('click', () => { synth.playTap(); renderBadgesScreen(); showScreen('badges'); });
    head.appendChild(manage);
  }
  manage.textContent = t('badgesAll');

  const worn = wornBadges(states);
  if (!worn.length) {
    const note = document.createElement('p');
    note.className = 'empty-note';
    note.textContent = t('badgesNone');
    el.badgeGrid.replaceChildren(note);
    return;
  }
  el.badgeGrid.replaceChildren(...worn.map((st) => badgeChip(st)));
}

/** The Badges screen: every chip, with what is worn marked, four at most. */
function renderBadgesScreen() {
  const states = allBadgeStates();
  el.badgesTitle.textContent = t('badgesTitle');
  el.badgesIntro.textContent = t('badgesIntro');
  const wornIds = new Set(wornBadges(states).map((st) => st.badge.id));
  el.badgesAll.replaceChildren(...states.map((st) => badgeChip(st, { worn: wornIds.has(st.badge.id) })));
}

/** Put a chip on the profile, or take it off. A first explicit choice adopts
 *  the automatic shelf as its starting point, so the tag and the button never
 *  disagree about what "worn" means. */
function toggleBadgeEquip(st) {
  const states = allBadgeStates();
  if (state.badgeLoadout === null) {
    state.badgeLoadout = wornBadges(states).map((w) => w.badge.id);
  }
  const worn = state.badgeLoadout;
  const i = worn.indexOf(st.badge.id);
  if (i >= 0) worn.splice(i, 1);
  else {
    if (worn.length >= 4) { toast(t('badgeLoadoutFull'), 'error'); synth.playDenied(); return false; }
    worn.push(st.badge.id);
  }
  store.saveBadgeLoadout(worn);
  synth.playResolved();
  return true;
}

function openBadgeSheet(st) {
  openSheet(st.name, (body) => {
    const wrap = document.createElement('div');
    wrap.className = 'badge-sheet';
    wrap.innerHTML = `<div class="badge-sheet-chip"></div><p class="badge-sheet-line"></p><div class="badge-rungs"></div>`;
    if (st.rank > 0) {
      const wornNow = wornBadges(allBadgeStates()).some((w) => w.badge.id === st.badge.id);
      const equip = document.createElement('button');
      equip.type = 'button';
      equip.className = `btn ${wornNow ? 'btn-ghost' : 'btn-primary'}`;
      equip.textContent = wornNow ? t('badgeUnequip') : t('badgeEquip');
      press(equip, { sound: null });
      equip.addEventListener('click', () => {
        if (!toggleBadgeEquip(st)) return;
        sheet.hide();
        if (state.tab === 'badges') renderBadgesScreen();
        if (state.tab === 'profile') renderProfile();
      });
      wrap.insertBefore(equip, wrap.querySelector('.badge-rungs'));
    }
    wrap.querySelector('.badge-sheet-chip').innerHTML = badgeSvg(st.badge, st.rank, st.max, { size: 120 });
    wrap.querySelector('.badge-sheet-line').textContent = st.rank > 0
      ? (st.max > 1 ? t('badgeRank', { n: romanRank(st.rank), max: romanRank(st.max) }) : t('badgeEarned'))
      : t('badgeLockedLine');
    wrap.querySelector('.badge-rungs').replaceChildren(...st.rungs.map((rung) => {
      const row = document.createElement('div');
      row.className = `badge-rung${rung.unlocked ? ' is-done' : ''}`;
      row.innerHTML = `<span class="badge-rung-mark">${iconSvg(rung.unlocked ? 'check' : 'lock', { size: 14 })}</span>
        <span class="badge-rung-copy"><b></b><span></span></span>`;
      row.querySelector('b').textContent = rung.name;
      row.querySelector('.badge-rung-copy span').textContent = rung.desc;
      return row;
    }));
    body.appendChild(wrap);
  });
}

/* --- achievements ------------------------------------------------------------------------ */

function achFacts() {
  // Special cards are outside every ladder: they count for no achievement,
  // no album milestone, no total.
  const entries = store.allEntries(state.collection).filter((e) => !e.special);
  return measureAchievements({
    profile: state.profile,
    entries,
    albumsDeep: albumsDeep(entries, state.customPacks),
    albumsStarted: albumsStarted(entries, state.customPacks),
    customPacks: state.customPacks ?? [],
    friends: state.social.friends.length,
    wallet: state.wallet
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
      // Money-shaped stats read as money, fame reads compact; a raw
      // 10000000 in a 60px column helps nobody.
      const inMoney = a.stat === 'value' || a.stat === 'wallet' || a.stat === 'maxCardPrice';
      const fmt = (v) => inMoney ? money(v) : a.stat === 'maxViews' ? formatViews(v) : String(Math.floor(v));
      side.innerHTML = `<span class="ach-progress tabular">${fmt(a.have)}/<b>${fmt(a.need)}</b></span>`;
    }

    const label = document.createElement('span');
    label.className = 'ach-reward';
    label.innerHTML = a.reward.kind === 'coins'
      ? t('achRewardCoins', { amount: money(a.reward.coins) })
      : t('achRewardPack', { name: specName(a.reward.spec) });
    row.querySelector('.ach-copy').appendChild(label);
    return row;
  }));
  // A hundred rows now: a tighter stagger, or the tail waits two seconds.
  reveal(el.achList.children, { step: 6, from: 8 });
}

function redeemAchievement(a, btn) {
  const redeemed = state.profile.achievements.redeemed;
  if (redeemed.includes(a.id)) return;
  redeemed.push(a.id);
  if (a.reward.kind === 'coins') {
    store.saveWallet(store.loadWallet() + a.reward.coins);
    refreshWallet();
  } else {
    gainBooster(a.reward.spec, 1);
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
  // exists - see showNameGate().
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
 * Reached whenever a signed-in account has no profile - which is every new
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
 * recorded and left for the next change or the next foreground to retry -
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
    const pushed = await account.pushSave(userId());
    // An older build than the one that last saved this account: play on,
    // never write. Said once, on screen, with the way out.
    if (pushed === 'outdated') { state.account.outdated = true; showUpdateBar('outdated'); return; }
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
 * - the bell would only ever be right by accident. One read a minute while the
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
 * the app on whatever that turns out to contain - which is what makes a fresh
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
  // The shelf may have just arrived from the account: draw ahead for it.
  setTimeout(warmDrawer, 1500);
  if (!state.account.failed) state.account.syncedAt = Date.now();
  // A save last written by an OLDER build (or one from before builds were
  // stamped) may carry back what this build already repaired on another
  // device, so the repairs are allowed to run again here.
  if (!state.account.failed && account.saveFromOlderBuild()) {
    for (const key of [SPECIAL_FIX_KEY, VIEWS_FIX_KEY]) { try { localStorage.removeItem(key); } catch { /* storage unavailable */ } }
  }
  if (!state.account.failed && account.saveFromNewerBuild()) { state.account.outdated = true; showUpdateBar('outdated'); }
  syncSocial();
  startSocialPoll();

  if (!languageChosen() || !state.profile.started) showWelcome();
  else {
    payStipend();
    if (canClaim(state.profile.daily)) openDaily({ auto: true });
  }
}

/**
 * A withdrawn code leaves nothing behind. Everything it handed over goes:
 * its cards, its booster on the shelf, its badge from the loadout, its
 * theme and frame if they are worn, and the redemption itself, so the save
 * reads as if the code had never been typed. Runs on what is in memory,
 * so it is called after every load, local or from the cloud. Returns
 * whether anything was removed.
 */
function purgeRetiredCodes() {
  let changed = false;
  const retired = new Set(RETIRED_CODES);
  try {
    const entries = state.collection?.entries ?? {};
    for (const [key, entry] of Object.entries(entries)) {
      if (entry?.special && retired.has(entry.special)) { delete entries[key]; changed = true; }
    }
    if (changed) store.saveCollection(state.collection);
    let shelf = false;
    for (const [id, slot] of Object.entries(state.inventory ?? {})) {
      if (slot?.spec?.kind === 'code' && retired.has(slot.spec.codeId)) { delete state.inventory[id]; dropReady(id); shelf = true; }
    }
    if (shelf) { store.saveInventory(state.inventory); changed = true; }
    const profile = state.profile ?? {};
    for (const id of retired) {
      if (profile.codesRedeemed?.[id] != null) { delete profile.codesRedeemed[id]; changed = true; }
    }
    if (Array.isArray(state.badgeLoadout) && state.badgeLoadout.some((b) => retired.has(String(b).replace(/^special-/, '')))) {
      state.badgeLoadout = state.badgeLoadout.filter((b) => !retired.has(String(b).replace(/^special-/, '')));
      store.saveBadgeLoadout(state.badgeLoadout);
      changed = true;
    }
    if (changed) store.saveProfile(profile);
    // A theme or a frame the code brought is taken off; the picker no longer offers them.
    const worn = THEMES.find((th) => th.id === storedTheme());
    if (!worn || (worn.code && retired.has(worn.code))) { useTheme(DEFAULT_THEME); changed = true; }
    const frame = FRAME_STYLES.find((f) => f.id === state.frameStyle);
    if (!frame || (frame.code && retired.has(frame.code))) { state.frameStyle = DEFAULT_FRAME_STYLE; store.saveFrameStyle(DEFAULT_FRAME_STYLE); changed = true; }
    if (changed) { console.info('A withdrawn code was removed from this save'); syncSoon(); }
  } catch (error) {
    console.warn('purge failed', error);
  }
  return changed;
}

/** Re-read everything from storage, after an import or a sign-in pull. */
function reloadFromStorage() {
  state.collection = store.loadCollection();
  state.inventory = store.loadInventory();
  state.profile = store.loadProfile();
  state.frameStyle = store.loadFrameStyle() ?? DEFAULT_FRAME_STYLE;
  state.badgeLoadout = store.loadBadgeLoadout();
  state.customPacks = store.loadCustomPacks();
  state.wallet = store.loadWallet();
  purgeRetiredCodes();
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

  // Every path into the app comes through here, so this is where a session
  // is shown to the server before it is believed: the client restores the
  // last one from storage without asking anyone, and an account deleted on
  // the server would otherwise walk straight in until its token expired.
  if (session) {
    session = await account.verifySession(session);
    if (!session) {
      handledUser = null;
      // The account behind the stored session is gone from the server. The
      // device is emptied with it: what it holds belonged to that account,
      // and left in place it would be adopted, level and badges and all, by
      // the next account created on this device, which is exactly what a
      // deleted account must not come back as.
      try { localStorage.clear(); sessionStorage.clear(); } catch { /* storage unavailable */ }
      reloadFromStorage();
    }
  }
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
 * in practice - but toast() takes markup, and a value that came off the
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
  refreshWishes();
}

/**
 * The full social heartbeat: friendships, presence, post, trades, unread.
 * Runs on resume and once a minute. Every part is best-effort - a dead
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
 * destroys - the kinder failure.
 */
async function collectDeliveries() {
  const waiting = await account.pendingDeliveries(userId());
  if (!waiting.length) return;
  for (const item of waiting) {
    const from = state.social.friends.find((f) => f.otherId === item.sender)?.profile?.username
      ?? t('friendSomeone');
    if (item.kind === 'booster' && item.payload?.spec) {
      gainBooster(item.payload.spec, item.payload.count ?? 1);
      pushNote('gift', t('notifGiftBooster', { name: esc(from) }), 'packs');
    } else if (item.kind === 'card' && item.payload?.key) {
      store.receiveCardEntry(state.collection, item.payload);
      pushNote('gift', t('notifGiftCard', { name: esc(from), card: esc(item.payload.title) }), 'binder');
    } else if (item.kind === 'trade-return' && Array.isArray(item.payload?.cards)) {
      for (const card of item.payload.cards) store.receiveCardEntry(state.collection, card);
      reportQuest('trade');
      pushNote('trade', t('notifTradeDone', { name: esc(from) }), 'binder');
    } else if (item.kind === 'auction-card' && item.payload?.key) {
      store.receiveCardEntry(state.collection, item.payload);
      // A card from someone ELSE is a card won at auction; my own sender
      // means my card walking home unsold or withdrawn.
      if (item.sender !== userId()) {
        state.profile.auctionsWon = (state.profile.auctionsWon ?? 0) + 1;
        store.saveProfile(state.profile);
      }
      pushNote('trade', t('notifAuctionCard', { card: esc(item.payload.title ?? '?') }), 'binder');
    } else if (item.kind === 'auction-money' && Number.isFinite(item.payload?.amount)) {
      store.saveWallet(store.loadWallet() + item.payload.amount);
      refreshWallet();
      if (item.payload.reason === 'sale') {
        state.profile.auctionsSold = (state.profile.auctionsSold ?? 0) + 1;
        store.saveProfile(state.profile);
      }
      pushNote('trade', t(item.payload.reason === 'sale' ? 'notifAuctionSold' : 'notifAuctionRefund',
        { amount: money(item.payload.amount), card: esc(item.payload.title ?? '?') }), 'shop');
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
      // Closing is what makes this run once, so the counter is safe here.
      state.profile.tradesDone = (state.profile.tradesDone ?? 0) + 1;
      store.saveProfile(state.profile);
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
/**
 * One Gift button, asked what kind. Two buttons sitting side by side made the
 * row long and the choice look like two different features, when it is one
 * thing with two shapes.
 */
function openGiftChooser(entry) {
  openSheet(t('giftChooseTitle', { name: entry.profile.username }), (body) => {
    const note = document.createElement('p');
    note.textContent = t('giftChooseNote');

    const choices = document.createElement('div');
    choices.className = 'gift-choices';
    const choice = (icon, labelKey, run) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ghost gift-choice';
      btn.innerHTML = `${iconSvg(icon, { size: 20 })}<span>${esc(t(labelKey))}</span>`;
      press(btn, { sound: null });
      btn.addEventListener('click', () => { synth.playTap(); sheet.hide(); run(); });
      return btn;
    };
    choices.append(
      choice('gift', 'giftCardOpen', () => openGiftCard(entry)),
      choice('packs', 'giftBoosterOpen', () => openGiftBooster(entry))
    );
    body.append(note, choices);
  });
}

function openGiftCard(entry) {
  const mine = store.allEntries(state.collection)
    .filter((c) => !store.isLocked(c))
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
          reportQuest('gift');
          state.profile.giftsSent = (state.profile.giftsSent ?? 0) + 1;
          store.saveProfile(state.profile);
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
  // A special booster (a secret code's) stays with whoever redeemed it.
  const owned = store.ownedBoosters(state.inventory).filter((slot) => slot.spec.kind !== 'code');
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
          reportQuest('gift');
          state.profile.giftsSent = (state.profile.giftsSent ?? 0) + 1;
          store.saveProfile(state.profile);
          toast(t('giftSent', { name: esc(entry.profile.username) }));
          synth.playTrade();
          sheet.hide();
          renderPacks();
          syncSoon();
        } catch (error) {
          gainBooster(slot.spec, 1);      // undo
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
    .filter((c) => !store.isLocked(c))
    .sort((a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId));
  theirs = theirs.filter((c) => !store.isLocked(c));
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

    // Can I actually pay? Every asked card must still be in my collection,
    // and a special card is never on the table.
    const missing = (trade.ask ?? []).filter((c) => !state.collection.entries[c.key] || store.isLocked(state.collection.entries[c.key]));
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
        state.profile.tradesDone = (state.profile.tradesDone ?? 0) + 1;
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
function paintAvatarInto(node, profile, { frame = null } = {}) {
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
  // The frame travels with the picture: whatever profile object is being
  // painted carries its owner's style, and the tier is read off their level.
  const worn = frame ?? { style: avatar?.frame?.style, tier: frameTier(profile?.level) };
  paintFrameInto(node, worn.style ?? null, worn.style ? worn.tier : 0);
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
        <div class="crop-shade" aria-hidden="true"></div>
        <div class="crop-circle" data-circle aria-hidden="true"></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn btn-primary" type="button" data-save style="flex:1"></button>
      </div>`;
    body.querySelector('[data-hint]').textContent = t('avatarCropHint');
    const saveBtn = body.querySelector('[data-save]');
    saveBtn.textContent = t('avatarSave');

    const stage = body.querySelector('[data-stage]');
    const img = body.querySelector('[data-img]');
    const circle = body.querySelector('[data-circle]');
    const shade = body.querySelector('.crop-shade');
    img.style.backgroundImage = `url("${String(card.thumbnail).replace(/"/g, '%22')}")`;

    // The picture stays put; the CIRCLE is what you move over it. Its centre,
    // as a percentage of the stage, is exactly what avatars store.
    let x = Number(state.account.profile?.avatar?.x);
    let y = Number(state.account.profile?.avatar?.y);
    if (!Number.isFinite(x)) x = 50;
    if (!Number.isFinite(y)) y = 50;

    // The circle's radius, as a percentage of the stage, sets how far the
    // centre may travel before the ring leaves the picture.
    const R = 27;
    const clampPos = () => {
      x = Math.min(100 - R, Math.max(R, x));
      y = Math.min(100 - R, Math.max(R, y));
    };
    const paint = () => {
      clampPos();
      circle.style.left = `${x}%`;
      circle.style.top = `${y}%`;
      shade.style.setProperty('--cx', `${x}%`);
      shade.style.setProperty('--cy', `${y}%`);
    };
    paint();

    stage.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      // The circle jumps under the finger, then follows it.
      x = ((event.clientX - rect.left) / rect.width) * 100;
      y = ((event.clientY - rect.top) / rect.height) * 100;
      paint();
      circle.classList.add('is-held');
      trackDrag(event, {
        onMove: (dx, dy, _moved, e) => {
          x = ((e.clientX - rect.left) / rect.width) * 100;
          y = ((e.clientY - rect.top) / rect.height) * 100;
          paint();
        },
        onEnd: () => circle.classList.remove('is-held')
      });
    });

    press(saveBtn, { sound: null });
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      const avatar = { url: card.thumbnail, x: Math.round(x), y: Math.round(y) };
      // The frame rides in this same column; a new picture must not undress it.
      if (state.account.profile?.avatar?.frame) avatar.frame = state.account.profile.avatar.frame;
      try {
        await account.updateProfileFields(userId(), { avatar });
        state.account.profile.avatar = avatar;
        toast(t('avatarSaved'));
        synth.playResolved();
        sheet.hide();
        if (state.tab === 'profile') renderProfile();
        if (state.tab === 'customize') renderCustomize();
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
    actionBtn('gift', 'giftOpen', () => openGiftChooser(entry)),
    actionBtn('wish', 'wishTitle', () => openFriendWishlist(entry))
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

/** A friend's wishlist: what they want, whether they already found it, and
 *  whether you happen to be holding it. */
function openFriendWishlist(entry) {
  const person = entry.profile;
  openSheet(t('friendWishTitle', { name: person.username ?? '?' }), async (body) => {
    body.innerHTML = `<p class="find-status is-working">${esc(t('friendLoading'))}</p>`;
    let wishes = [];
    let theirs = new Set();
    try {
      const [rows, cards] = await Promise.all([
        account.wishlistOf(entry.otherId),
        account.friendCollection(entry.otherId).catch(() => null)
      ]);
      wishes = rows;
      theirs = new Set((cards ?? []).map((card) => card.key));
    } catch (error) {
      body.innerHTML = `<p class="find-status is-error"></p>`;
      body.querySelector('p').textContent =
        error?.message === 'INDEX_UNSET' ? t('indexUnset') : describeError(error);
      return;
    }
    if (!wishes.length) {
      body.innerHTML = `<p class="empty-note"></p>`;
      body.querySelector('p').textContent = t('friendWishEmpty', { name: person.username ?? '?' });
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'market-list';
    grid.replaceChildren(...wishes.map((row) => {
      const card = row.card ?? {};
      const tile = document.createElement('div');
      tile.className = 'auction-tile';
      if (theirs.has(card.key)) {
        const band = document.createElement('span');
        band.className = 'auction-band is-good';
        band.textContent = t('friendOwnsBand', { name: person.username ?? '?' });
        tile.appendChild(band);
      }
      const rarity = rarityById(card.rarityId) ?? RARITIES[0];
      tile.appendChild(buildStaticCard({ ...card, description: '', extract: '' }, rarity, null,
        { fav: false, ownedTag: true }));
      return tile;
    }));
    body.replaceChildren(grid);
  });
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

/* --- the updates timeline ------------------------------------------------------------------------- */

/**
 * Every release since the first, newest on top, no dates: the order is the
 * story. Content lives in src/data/releases.js, bilingual.
 */
/**
 * What a release is called on the timeline. The newest four, and every one
 * after them, are simply numbered: "The 14th update". A themed name ages
 * badly as the list grows, and by the time the list is long nobody can tell
 * which came when from names alone. The oldest keep their names as history.
 */
const NUMBERED_RELEASES = 4;

function ordinal(n) {
  if (getLanguage() === 'fr') return n === 1 ? '1re' : `${n}e`;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

function releaseTitle(release) {
  const index = RELEASES.indexOf(release);
  if (index < 0 || index < RELEASES.length - NUMBERED_RELEASES) return tx(release.title);
  return t('updateNumbered', { n: ordinal(index + 1) });
}

function renderUpdates() {
  el.updatesTitle.textContent = t('tabUpdates');
  el.updatesSub.textContent = t('updatesIntro');
  const list = [...RELEASES].reverse();
  el.updatesList.replaceChildren(...list.map((release, i) => {
    const item = document.createElement('div');
    item.className = 'tl-item';
    item.style.setProperty('--tl', release.accent);
    item.innerHTML = `
      <span class="tl-node">${iconSvg(release.icon, { size: 16 })}</span>
      <div class="tl-head"><h3></h3>${i === 0 ? '<span class="tl-latest"></span>' : ''}</div>
      <ul class="tl-points"></ul>`;
    item.querySelector('h3').textContent = releaseTitle(release);
    if (i === 0) item.querySelector('.tl-latest').textContent = t('updatesLatest');
    item.querySelector('.tl-points').replaceChildren(...release.points.map((point) => {
      const li = document.createElement('li');
      li.textContent = tx(point);
      return li;
    }));
    if (release.changelog?.length) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'btn btn-ghost btn-sm tl-more';
      more.textContent = t('updatesChangelog');
      press(more, { sound: null });
      more.addEventListener('click', () => { synth.playTap(); openChangelog(release); });
      item.appendChild(more);
    }
    return item;
  }));
  reveal(el.updatesList.children, { step: 50 });
}

/** Everything that release changed, in one sheet. */
function openChangelog(release) {
  openSheet(releaseTitle(release), (body) => {
    const list = document.createElement('ul');
    list.className = 'tl-points is-full';
    list.replaceChildren(...release.changelog.map((line) => {
      const li = document.createElement('li');
      li.textContent = tx(line);
      return li;
    }));
    body.appendChild(list);
  });
}

/* --- the quiz ------------------------------------------------------------------------------------- */

/*
 * One subject, one card you probably do not own, three to five questions
 * written on the spot from the article's own text, and a reward ladder that
 * tops out at the card, big money and a Rare booster. No feedback until the
 * end: the recap is where you learn what was right.
 */

function resetQuiz() {
  state.quiz = { step: quizAvailable() ? 'pick' : 'nokey' };
}

/** Whose daily allowance is being spent: the account's, or this device's. */
const quizUserKey = () => userId() ?? 'device';

/** The quiz card as a collection-shaped entry (bare = no article text). */
function quizEntry(q, { bare = false } = {}) {
  const spec = { kind: 'theme', themeId: q.themeId, rarityId: null, cards: 1 };
  return {
    key: q.card.key, title: q.card.title,
    description: bare ? '' : (q.card.description ?? ''),
    extract: bare ? '' : (q.card.extract ?? ''),
    thumbnail: q.card.thumbnail, url: q.card.url, lang: q.card.lang,
    sourceId: q.card.sourceId, sourceName: q.card.sourceName,
    views: q.card.views, popularity: q.card.popularity,
    rarityId: q.rarity.id, price: priceFor(q.card.popularity, q.rarity),
    packId: specId(spec), packName: specName(spec), packIcon: specIcon(spec),
    packAccent: specColours(spec).accent,
    count: 1, favorite: false, firstPulledAt: Date.now(), lastPulledAt: Date.now()
  };
}

async function startQuiz(themeId) {
  if (quizPlaysLeft(quizUserKey()) <= 0) {
    toast(t('quizNoneLeft'), 'error');
    synth.playDenied();
    return;
  }
  const q = state.quiz = { step: 'draw', themeId };
  renderQuiz();
  try {
    const spec = { kind: 'theme', themeId, rarityId: null, cards: 1 };
    let article = null;
    // Prefer a card the player does NOT own; three draws, then take what came.
    for (let i = 0; i < 3; i++) {
      const [drawn] = await drawArticles(toDrawPack(spec));
      article = drawn;
      if (!state.collection.entries[drawn.key]) break;
    }
    if (state.quiz !== q) return;
    q.card = article;
    q.rarity = rarityOfCard(article);
    q.count = questionCountFor(q.rarity.id);
    q.step = 'preview';
    renderQuiz();
  } catch {
    if (state.quiz !== q) return;
    toast(t('quizFailed'), 'error');
    synth.playDenied();
    resetQuiz();
    renderQuiz();
  }
}

async function beginQuizQuestions() {
  const q = state.quiz;
  if (quizPlaysLeft(quizUserKey()) <= 0) {
    q.error = t('quizNoneLeft');
    q.step = 'preview';
    renderQuiz();
    return;
  }
  q.error = null;
  q.step = 'writing';
  renderQuiz();
  try {
    const text = await fetchArticleText(q.card.title, { limit: 3500 }).catch(() => '');
    const questions = await buildQuiz({
      title: q.card.title,
      text: text || q.card.extract,
      rarityId: q.rarity.id
    });
    if (state.quiz !== q) return;
    recordQuizPlay(quizUserKey());
    q.questions = questions;
    q.index = 0;
    q.answers = [];
    q.step = 'ask';
    renderQuiz();
  } catch (err) {
    if (state.quiz !== q) return;
    // The reason travels with the error: "try again" is useless advice when
    // the function is simply not deployed under the name the app calls. It
    // stays on the screen too, since a toast is gone before anyone can read
    // a status code off it.
    const detail = err?.detail ? ` (${err.detail})` : '';
    q.error = err?.message === 'QUIZ_UNAVAILABLE' ? t('quizNoKey') : `${t('quizFailed')}${detail}`;
    toast(q.error, 'error');
    synth.playDenied();
    q.step = 'preview';
    renderQuiz();
  }
}

function answerQuiz(choice) {
  const q = state.quiz;
  if (q.step !== 'ask') return;
  q.answers.push(choice);
  synth.playTap();
  if (q.answers.length >= q.questions.length) return finishQuiz();
  q.index += 1;
  renderQuiz();
}

function finishQuiz() {
  const q = state.quiz;
  q.correct = q.answers.filter((a, i) => a === q.questions[i].answer).length;
  state.profile.quizPlayed = (state.profile.quizPlayed ?? 0) + 1;
  if (q.correct >= 3) state.profile.quizWins = (state.profile.quizWins ?? 0) + 1;
  if (q.correct === q.questions.length) state.profile.quizPerfect = (state.profile.quizPerfect ?? 0) + 1;
  q.rewards = quizRewards(q.correct, q.themeId);
  reportQuest('quiz', { correct: q.correct });
  if (q.rewards.money > 0) {
    store.saveWallet(store.loadWallet() + q.rewards.money);
    refreshWallet();
  }
  if (q.rewards.card) store.receiveCardEntry(state.collection, quizEntry(q));
  if (q.rewards.booster) {
    gainBooster(q.rewards.booster, 1);
    renderPacks();
  }
  updateBadges();
  if (q.correct >= 2) synth.playFanfare(); else synth.playResolved();
  q.step = 'done';
  renderQuiz();
}

/**
 * Out of the quiz, one step at a time.
 *
 * From a card or a result the way back is the category list; from the list
 * itself it is out of the Quiz altogether. Backing out of a quiz already in
 * progress takes two taps, because the questions do not come back.
 */
function leaveQuiz() {
  const q = state.quiz;
  if (!q || q.step === 'pick' || q.step === 'nokey') {
    resetQuiz();
    renderPacks();
    showScreen('packs');
    return;
  }
  if (q.step === 'ask' && !q.leaving) {
    q.leaving = true;
    toast(t('quizLeaveArmed'), 'ok');
    setTimeout(() => { if (state.quiz === q) q.leaving = false; }, 3500);
    return;
  }
  resetQuiz();
  renderQuiz();
}

function renderQuiz() {
  // A finished quiz starts over on the next visit; a missing key un-blocks
  // itself the moment one is saved in Settings.
  if (!state.quiz || state.quiz.step === 'done' && state.tab !== 'quiz') resetQuiz();
  if (state.quiz.step === 'nokey' && quizAvailable()) resetQuiz();
  el.quizTitle.textContent = t('tabQuiz');
  el.quizBack.innerHTML = iconSvg('chevronLeft', { size: 18 });
  const q = state.quiz;
  const body = el.quizBody;
  const div = (cls, html = '') => {
    const node = document.createElement('div');
    node.className = cls;
    if (html) node.innerHTML = html;
    return node;
  };

  if (q.step === 'nokey') {
    const box = div('quiz-stage');
    box.innerHTML = `<span class="quiz-bigicon">${iconSvg('quiz', { size: 46 })}</span><p class="quiz-note"></p>`;
    box.querySelector('.quiz-note').textContent = t('quizNoKey');
    body.replaceChildren(box);
    return;
  }

  if (q.step === 'pick') {
    const left = quizPlaysLeft(quizUserKey());
    if (left <= 0) {
      const box = div('quiz-stage');
      box.innerHTML = `<span class="quiz-bigicon">${iconSvg('clock', { size: 46 })}</span><p class="quiz-note"></p>`;
      box.querySelector('.quiz-note').textContent = t('quizNoneLeft');
      body.replaceChildren(box);
      return;
    }
    const sub = div('quiz-sub');
    sub.textContent = t('quizIntro');
    const counter = div('quiz-allowance');
    counter.textContent = t('quizLeftToday', { n: left, max: QUIZ_PER_DAY });
    const grid = div('quiz-cats');
    grid.replaceChildren(...THEME_PACKS.map((theme) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'quiz-cat';
      tile.style.setProperty('--qa', theme.accent);
      tile.style.setProperty('--qa2', theme.accent2);
      tile.innerHTML = `<span class="quiz-cat-emblem">${emblemSvg(theme.id, { size: 40 })}</span><b></b>`;
      tile.querySelector('b').textContent = tx(theme.name);
      press(tile, { sound: null });
      tile.addEventListener('click', () => { synth.playTap(); startQuiz(theme.id); });
      return tile;
    }));
    body.replaceChildren(sub, counter, grid);
    reveal(grid.children, { step: 14, from: 8 });
    return;
  }

  if (q.step === 'draw' || q.step === 'writing') {
    const box = div('quiz-spin');
    box.innerHTML = `<span class="quiz-spin-mark">${iconSvg('hourglass', { size: 34 })}</span><p></p>`;
    box.querySelector('p').textContent = q.step === 'draw' ? t('quizDrawing') : t('quizWriting');
    body.replaceChildren(box);
    return;
  }

  if (q.step === 'preview') {
    const stage = div('quiz-stage');
    const label = div('quiz-progress');
    label.textContent = t('quizMeet');
    // The card WITHOUT its description: what it is stays the first question.
    const card = buildStaticCard(quizEntry(q, { bare: true }), q.rarity, null, { fav: false, lit: true });
    card.classList.add('quiz-mystery');
    const note = div('quiz-note');
    note.textContent = q.error ?? t('quizNotice', { n: q.count });
    if (q.error) note.classList.add('is-error');
    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'btn btn-primary quiz-start';
    start.textContent = t('quizStart');
    press(start, { sound: null });
    start.addEventListener('click', () => { synth.playTap(); beginQuizQuestions(); });
    stage.replaceChildren(label, card, note, start);
    body.replaceChildren(stage);
    return;
  }

  if (q.step === 'ask') {
    const item = q.questions[q.index];
    const progress = div('quiz-progress');
    progress.textContent = t('quizQuestionOf', { i: q.index + 1, n: q.questions.length });
    const question = div('quiz-q');
    question.textContent = item.question;
    const choices = div('quiz-choices');
    choices.replaceChildren(...item.choices.map((choice, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quiz-choice';
      btn.textContent = choice;
      press(btn, { sound: null });
      btn.addEventListener('click', () => answerQuiz(idx));
      return btn;
    }));
    body.replaceChildren(progress, question, choices);
    reveal(choices.children, { step: 40, from: 8 });
    return;
  }

  // done: the score, what it paid, and the full recap.
  const score = div('quiz-score');
  score.textContent = t('quizScore', { n: q.correct, total: q.questions.length });

  const rewards = div('quiz-rewards');
  const rewardRow = (icon, html) => {
    const row = div('quiz-reward');
    row.innerHTML = `<span class="quiz-reward-icon">${iconSvg(icon, { size: 18 })}</span><span></span>`;
    row.querySelector('span:last-child').innerHTML = html;
    return row;
  };
  if (q.rewards.money > 0) rewards.appendChild(rewardRow('gift', `${esc(t('quizRewardMoney'))} <b class="quiz-money">${money(q.rewards.money)}</b>`));
  if (q.rewards.card) rewards.appendChild(rewardRow('collection', esc(t('quizRewardCard'))));
  if (q.rewards.booster) rewards.appendChild(rewardRow('packs', esc(t('quizRewardBooster', { name: specName(q.rewards.booster) }))));
  if (!rewards.children.length) {
    const none = div('quiz-note');
    none.textContent = t('quizRewardNone');
    rewards.appendChild(none);
  }

  const recap = div('quiz-recap');
  recap.replaceChildren(...q.questions.map((item, i) => {
    const right = q.answers[i] === item.answer;
    const node = div('quiz-recap-item');
    node.innerHTML = `
      <p></p>
      <span class="quiz-recap-a ${right ? 'is-right' : 'is-wrong'}"><b></b><span data-mine></span></span>
      ${right ? '' : '<span class="quiz-recap-a is-answer"><b></b><span data-good></span></span>'}`;
    node.querySelector('p').textContent = `${i + 1}. ${item.question}`;
    node.querySelector('.quiz-recap-a b').textContent = t('quizYourAnswer');
    node.querySelector('[data-mine]').textContent = item.choices[q.answers[i]];
    if (!right) {
      node.querySelector('.is-answer b').textContent = t('quizCorrectAnswer');
      node.querySelector('[data-good]').textContent = item.choices[item.answer];
    }
    return node;
  }));

  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'btn btn-primary quiz-start';
  again.textContent = t('quizAgain');
  press(again, { sound: null });
  again.addEventListener('click', () => { synth.playTap(); resetQuiz(); renderQuiz(); });

  body.replaceChildren(score, rewards, recap, again);
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
  el.prefsLabel.textContent = t('prefsTitle');
  el.accountLabel.textContent = t('settingsAccount');
  el.dataLabel.textContent = t('settingsData');

  // --- preferences: how the app behaves -----------------------------------
  const language = document.createElement('div');
  language.className = 'row';
  language.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <span class="chip row-action"></span>`;
  language.querySelector('h4').textContent = t('settingsLanguage');
  language.querySelector('p').textContent = t('settingsLanguageNote');
  language.querySelector('.chip').innerHTML =
    `${iconSvg('lock', { size: 13 })}<span>${LANGUAGES.find((l) => l.id === getLanguage())?.label ?? ''}</span>`;

  el.settingsList.replaceChildren(
    settingRow('sound', 'settingsSound', 'settingsSoundNote'),
    sliderRow('volume', 'settingsVolume', 'settingsVolumeNote',
      { preview: () => { synth.resume(); synth.playTap(); } }),
    settingRow('music', 'settingsMusic', 'settingsMusicNote'),
    sliderRow('musicVolume', 'settingsMusicVolume', 'settingsMusicVolumeNote'),
    settingRow('flash', 'settingsFlash', 'settingsFlashNote'),
    settingRow('tilt', 'settingsTilt', 'settingsTiltNote'),
    settingRow('haptics', 'settingsHaptics', 'settingsHapticsNote'),
    settingRow('awake', 'settingsAwake', 'settingsAwakeNote'),
    settingRow('prices', 'settingsPrices', 'settingsPricesNote'),
    settingRow('lowPower', 'settingsLowPower', 'settingsLowPowerNote'),
    settingRow('hints', 'settingsHints', 'settingsHintsNote'),
    language
  );

  // --- account: who you are to the server ---------------------------------
  el.accountList.replaceChildren(...accountRows());

  // --- data: the save itself ----------------------------------------------
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

  // Two destructive buttons, mild first: one empties the collection, the other
  // ends the save. They are deliberately worded so the difference between them
  // is readable before either is armed.
  const wipeRow = document.createElement('div');
  wipeRow.className = 'row';
  wipeRow.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="btn btn-sm btn-danger row-action" type="button"></button>`;
  wipeRow.querySelector('h4').textContent = t('settingsCardWipe');
  wipeRow.querySelector('p').textContent = t('settingsCardWipeNote');
  const wipeBtn = wipeRow.querySelector('button');
  press(wipeBtn, { sound: null });
  paintResetButton(wipeBtn, 'cards');
  wipeBtn.addEventListener('click', () => handleReset(wipeBtn, 'cards'));

  const resetRow = document.createElement('div');
  resetRow.className = 'row';
  resetRow.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="btn btn-sm btn-danger row-action" type="button"></button>`;
  resetRow.querySelector('h4').textContent = t('settingsReset');
  resetRow.querySelector('p').textContent = t('settingsResetNote');
  const resetBtn = resetRow.querySelector('button');
  press(resetBtn, { sound: null });
  paintResetButton(resetBtn, 'all');
  resetBtn.addEventListener('click', () => handleReset(resetBtn, 'all'));

  // Deleting the account is a different kind of ending from erasing a save, so
  // it sits last and on its own: erasing leaves the address able to sign back
  // in, this takes the address with it.
  const accountRow = document.createElement('div');
  accountRow.className = 'row';
  accountRow.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="btn btn-sm btn-danger row-action" type="button"></button>`;
  accountRow.querySelector('h4').textContent = t('settingsDeleteAccount');
  accountRow.querySelector('p').textContent = t('settingsDeleteAccountNote');
  const accountBtn = accountRow.querySelector('button');
  press(accountBtn, { sound: null });
  paintResetButton(accountBtn, 'account');
  accountBtn.addEventListener('click', () => handleReset(accountBtn, 'account'));

  el.dataList.replaceChildren(transferRow, wipeRow, resetRow, ...(signedIn() ? [accountRow] : []));

  // --- secret codes: a booster someone handed you ---------------------------
  el.redeemLabel.textContent = t('redeemTitle');
  el.redeemList.replaceChildren(redeemRow());
}

/**
 * The redeem row: one field, one button, one line of news underneath. A code
 * is looked up in src/codes.js, spent once per save, and what it hands over
 * is an ordinary booster in the player's inventory, openable like any other.
 */
function redeemRow() {
  const row = document.createElement('div');
  row.className = 'row row-stack';
  row.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <form class="redeem-form" autocomplete="off">
      <input class="creator-input" type="text" maxlength="32" spellcheck="false" data-code>
      <button class="btn btn-sm btn-primary" type="submit"></button>
    </form>
    <p class="find-status" role="status" aria-live="polite" data-status></p>`;
  row.querySelector('h4').textContent = t('redeemTitle');
  row.querySelector('p').textContent = t('redeemNote');
  const form = row.querySelector('form');
  const input = row.querySelector('[data-code]');
  const status = row.querySelector('[data-status]');
  const button = row.querySelector('button');
  input.placeholder = t('redeemPlaceholder');
  button.textContent = t('redeemGo');
  press(button, { sound: null });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const entry = codeByInput(input.value);
    if (!entry) {
      synth.playDenied();
      status.textContent = t('redeemUnknown');
      status.className = 'find-status is-error';
      return;
    }
    if (!canRedeem(state.profile, entry)) {
      synth.playDenied();
      status.textContent = t('redeemUsed');
      status.className = 'find-status is-error';
      return;
    }
    state.profile.codesRedeemed = state.profile.codesRedeemed ?? {};
    state.profile.codesRedeemed[entry.id] = timesRedeemed(state.profile, entry.id) + 1;
    store.saveProfile(state.profile);
    // A regalia code carries no cards, so it puts no booster on the shelf. The
    // Creator's code is the only one of these: what it hands over is the badge,
    // the frame, the theme and the icon.
    if (!entry.regalia) gainBooster(codeSpec(entry), 1);
    // The theme goes on now, and the badge is worn now: the whole gift at
    // once, not a booster and a note saying there is more in the menus.
    const theme = THEMES.find((th) => th.code === entry.id);
    if (theme) useTheme(theme.id);
    const badge = BADGES.find((b) => b.code === entry.id);
    if (badge) wearBadge(badge.id);
    // A frame that arrives with a code goes on at once too, the same as the
    // theme and the badge: the whole gift, not a hint that there is more in
    // the menus.
    const frame = FRAME_STYLES.find((f) => f.code === entry.id);
    if (frame) pickFrameStyle(frame.id);
    syncSoon();
    input.value = '';
    status.textContent = t('redeemDone', { name: codeLook(entry).name });
    status.className = 'find-status is-ok';
    synth.playTheme();
    renderPacks();
    updateBadges();
    openReveal(entry, { theme, badge });
  });
  return row;
}

/**
 * The reveal: what a secret code just handed over, laid out as the event it
 * is. The person's message first, in their colour; then the booster, the six
 * cards by name, the theme that is now on, the badge now worn.
 */
function openReveal(entry, { theme, badge }) {
  const look = codeLook(entry);
  openSheet(t('revealTitle'), (body) => {
    const wrap = document.createElement('div');
    wrap.className = 'reveal';
    wrap.style.setProperty('--accent', look.accent);
    wrap.style.setProperty('--accent2', look.accent2);
    wrap.style.setProperty('--light', look.light);
    wrap.innerHTML = `
      <p class="reveal-message"></p>
      <div class="reveal-booster">
        <div class="reveal-pack"></div>
        <div class="reveal-copy"><span class="label"></span><h3></h3><p></p></div>
      </div>
      <div class="reveal-grants">
        <div class="reveal-grant" data-theme-grant hidden>
          <span class="reveal-swatch"></span>
          <span class="reveal-grant-copy"><span class="label"></span><b></b></span>
        </div>
        <div class="reveal-grant" data-badge-grant hidden>
          <span class="reveal-badge"></span>
          <span class="reveal-grant-copy"><span class="label"></span><b></b></span>
        </div>
      </div>
      <p class="reveal-where"></p>
      <div class="reveal-actions">
        <button class="btn btn-primary" type="button" data-go></button>
        <button class="btn btn-ghost" type="button" data-later></button>
      </div>`;
    wrap.querySelector('.reveal-message').textContent = tx(entry.message);
    // A regalia code has no booster to show, so the whole row goes rather than
    // standing there empty with a label over nothing.
    if (entry.regalia) {
      wrap.querySelector('.reveal-booster').remove();
    } else {
      wrap.querySelector('.reveal-pack').appendChild(buildBooster(codeSpec(entry), { size: 'is-small' }));
      wrap.querySelector('.reveal-copy .label').textContent = t('revealBooster');
      wrap.querySelector('.reveal-copy h3').textContent = look.name;
      wrap.querySelector('.reveal-copy p').textContent = look.tagline;
    }
    // What is inside stays a surprise until the pack is torn open.
    if (theme) {
      const grant = wrap.querySelector('[data-theme-grant]');
      grant.hidden = false;
      grant.querySelector('.reveal-swatch').innerHTML =
        theme.swatch.map((c) => `<span style="background:${c}"></span>`).join('');
      grant.querySelector('.label').textContent = t('revealTheme');
      grant.querySelector('b').textContent = tx(theme.name);
    }
    if (badge) {
      const grant = wrap.querySelector('[data-badge-grant]');
      grant.hidden = false;
      grant.querySelector('.reveal-badge').innerHTML = badgeSvg(badge, 1, 1, { size: 52 });
      grant.querySelector('.label').textContent = t('revealBadge');
      grant.querySelector('b').textContent = tx(badge.name);
    }
    wrap.querySelector('.reveal-where').textContent = t('revealWhere');
    const go = wrap.querySelector('[data-go]');
    const later = wrap.querySelector('[data-later]');
    go.textContent = t('revealTake');
    later.textContent = t('revealClose');
    press(go, { sound: null });
    press(later, { sound: null });
    go.textContent = entry.regalia ? t('revealSeeIt') : t('revealTake');
    go.addEventListener('click', () => {
      sheet.hide();
      // Regalia goes to Customization, where the frame and the theme now live.
      // Everything else goes to the shelf its booster is on.
      if (entry.regalia) { showScreen('customize'); renderCustomize(); return; }
      // The screen first: the segmented control measures its buttons when
      // it moves, and a hidden screen measures as nothing.
      showScreen('packs');
      state.packMode = 'custom';
      packsSeg?.select('custom', { silent: true });
      renderPacks();
    });
    later.addEventListener('click', () => sheet.hide());
    body.appendChild(wrap);
  });
}

/**
 * CUSTOMIZATION - everything about how things look, pulled out of Settings:
 * the theme, your picture, your name, and one day the frame around your
 * level. Settings keeps the switches; this screen keeps the mirror.
 */
function renderCustomize() {
  el.customizeTitle.textContent = t('tabCustomize');
  el.themeLabel.textContent = t('themeTitle');
  el.identityLabel.textContent = t('identityTitle');

  // The theme picker previews each theme rather than naming it.
  const current = storedTheme();
  el.themeGrid.replaceChildren(...THEMES.filter((theme) => !theme.code || hasRedeemed(state.profile, theme.code)).map((theme) => {
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
    if (theme.code) {
      const note = document.createElement('span');
      note.className = 'theme-note';
      note.textContent = t('themeLockedNote');
      card.querySelector('p').after(note);
    }
    press(card, { sound: null });
    card.addEventListener('click', () => {
      if (theme.id === storedTheme()) return;
      useTheme(theme.id, { announce: true });
      renderCustomize();
      // Everything already on screen has to be rebuilt in the new shape.
      renderPacks();
      renderShop();
      renderBinder();
    });
    return card;
  }));

  el.identityList.replaceChildren(...identityRows());

  // --- level frames: pick the style your level wears -----------------------
  el.framesLabel.textContent = t('framesTitle');
  const level = state.profile.progress.level ?? 1;
  const tier = frameTier(level);
  el.framesNote.hidden = true;
  const wearing = frameStyle();
  // A frame behind a secret code is not shown at all until that code is
  // redeemed: the same rule the special themes and badges follow, so nothing
  // in the picker hints at a code the player has not been given.
  const offered = FRAME_STYLES.filter((style) => !style.code || hasRedeemed(state.profile, style.code));
  el.frameStyles.replaceChildren(...offered.map((style) => {
    const open = style.code ? true : frameUnlocked(style, level);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `frame-card${style.id === wearing ? ' is-on' : ''}${tier < 1 ? ' is-dim' : ''}${open ? '' : ' is-locked'}`;
    card.dataset.frame = style.id;
    card.innerHTML = `
      <span class="frame-prev">
        <span class="frame-prev-core">${level}</span>
        <span class="frame-overlay" aria-hidden="true">${frameSvg(style.id, Math.max(tier, 1))}</span>
      </span>
      <span class="frame-copy"><h4></h4><small></small></span>
      <span class="theme-check">${iconSvg('check', { size: 14 })}</span>`;
    card.querySelector('h4').textContent = tx(style.name);
    card.querySelector('small').textContent = open ? '' : t('frameLocked', { level: style.minLevel });
    press(card, { sound: null });
    card.addEventListener('click', () => {
      if (!open) {
        synth.playDenied();
        toast(esc(t('frameLocked', { level: style.minLevel })), 'error');
        return;
      }
      if (style.id === frameStyle()) return;
      synth.playTap();
      pickFrameStyle(style.id);
      toast(t('frameEquipped', { name: tx(style.name) }));
      renderCustomize();
    });
    return card;
  }));

  renderCardFx();
}

/**
 * CARD EFFECTS: one row per rarity, one chip per style.
 *
 * The choice is per rarity on purpose. A single setting for the whole
 * collection would make every card look the same and take the ladder's
 * legibility with it; this way a player dresses the tiers they actually
 * collect, and a locked chip says exactly how many cards of that tier open it.
 */
function renderCardFx() {
  el.fxLabel.textContent = t('fxTitle');
  el.fxNote.textContent = t('fxNote');

  // How many of each tier are in the collection: what unlocks a style.
  const held = {};
  for (const entry of Object.values(state.collection.entries ?? {})) {
    if (entry?.special) continue;
    const id = entry.rarityId ?? rarityFromPopularity(entry.popularity ?? 0).id;
    held[id] = (held[id] ?? 0) + (entry.count ?? 1);
  }

  el.fxTiers.replaceChildren(...RARITIES.map((rarity) => {
    const owned = held[rarity.id] ?? 0;
    const row = document.createElement('div');
    row.className = 'fx-tier';
    row.innerHTML = `<div class="fx-tier-head"><span class="fx-tier-name"></span>
      <span class="fx-tier-count tabular"></span></div><div class="fx-chips"></div>`;
    const name = row.querySelector('.fx-tier-name');
    name.textContent = tx(rarity.name);
    name.style.color = rarity.color;
    row.querySelector('.fx-tier-count').textContent = t('fxOwned', { n: owned.toLocaleString() });

    row.querySelector('.fx-chips').replaceChildren(...FX_STYLES.map((style) => {
      const cost = fxCost(style.id, rarity.id);
      const open = fxUnlocked(style.id, rarity.id, owned);
      const worn = (state.cardFx[rarity.id] ?? DEFAULT_FX) === style.id;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `fx-chip${worn ? ' is-on' : ''}${open ? '' : ' is-locked'}`;
      chip.style.setProperty('--rarity', rarity.color);
      chip.innerHTML = `<span class="fx-chip-name"></span><span class="fx-chip-sub"></span>`;
      chip.querySelector('.fx-chip-name').textContent = tx(style.name);
      chip.querySelector('.fx-chip-sub').textContent = open
        ? tx(style.note)
        : t('fxLocked', { n: cost, rarity: tx(rarity.name) });
      press(chip, { sound: null });
      chip.addEventListener('click', () => {
        if (!open) { synth.playDenied(); toast(esc(t('fxLocked', { n: cost, rarity: tx(rarity.name) })), 'error'); return; }
        synth.playTap();
        if (style.id === DEFAULT_FX) delete state.cardFx[rarity.id];
        else state.cardFx[rarity.id] = style.id;
        store.saveCardFx(state.cardFx);
        reportQuest('fx');
        toast(esc(t('fxEquipped', { name: tx(style.name), rarity: tx(rarity.name) })));
        renderCardFx();
        // Anything already drawn is wearing the old look.
        renderBinder();
        renderCardIndex?.();
      });
      return chip;
    }));
    return row;
  }));
}

/* --- settings & customization rows ---------------------------------------- */

function settingsRowShell(titleKey, noteKey) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<div class="row-copy"><h4></h4><p></p></div>`;
  row.querySelector('h4').textContent = t(titleKey);
  row.querySelector('p').textContent = t(noteKey);
  return row;
}

function settingsRowButton(row, label, run) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-sm btn-ghost row-action';
  btn.textContent = label;
  press(btn, { sound: null });
  btn.addEventListener('click', () => { synth.playTap(); run(btn); });
  row.appendChild(btn);
  return btn;
}

/**
 * A build with no backend says so plainly instead of pretending to have one:
 * there is nothing the player can do about it, but knowing their collection is
 * device-only is what tells them to use the save transfer in Settings.
 */
function offlineAccountRow() {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<div class="row-copy"><h4></h4><p></p></div>
    <span class="chip row-action">${iconSvg('cloud', { size: 13 })}</span>`;
  row.querySelector('h4').textContent = t('accountOfflineTitle');
  row.querySelector('p').textContent = t('accountOfflineNote');
  return row;
}

/** The old-schema warning: the server cannot store what this row would edit. */
function staleSchemaRow() {
  const row = document.createElement('div');
  row.className = 'row is-warning';
  row.innerHTML = `<div class="row-copy"><h4></h4><p></p></div>
    <span class="chip row-action">${iconSvg('cloud', { size: 13 })}</span>`;
  row.querySelector('h4').textContent = t('schemaOldTitle');
  row.querySelector('p').textContent = t('schemaOldNote');
  return row;
}

/**
 * Who you look like: picture and name, on the Customization screen. A
 * project still on the older schema cannot store a picture, so rather than
 * offering a control that fails on tap, say plainly what is missing.
 * Changing your name works on every schema, so that row always stays.
 */
function identityRows() {
  if (!account.configured) return [offlineAccountRow()];

  const rows = [];
  if (account.socialSchemaReady()) {
    const avatarRow = settingsRowShell('avatarTitle', 'avatarNote');
    const face = document.createElement('span');
    face.className = 'person-mark row-action';
    paintAvatarInto(face, state.account.profile,
      { frame: { style: frameStyle(), tier: frameTier(state.profile.progress.level) } });
    face.style.cursor = 'pointer';
    face.addEventListener('click', () => { synth.playTap(); openAvatarPicker(); });
    avatarRow.appendChild(face);
    rows.push(avatarRow);
  } else {
    rows.push(staleSchemaRow());
  }

  const nameRow = settingsRowShell('usernameTitle', 'usernameNote');
  settingsRowButton(nameRow, t('usernameChange'), () => openUsernameChange());
  rows.push(nameRow);
  return rows;
}

/**
 * The account block in Settings: who you are, whether the last change
 * reached the server, who can see you, and the way out.
 */
function accountRows() {
  if (!account.configured) return [offlineAccountRow()];

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

  // Visibility and presence live on the newer schema only.
  if (!account.socialSchemaReady()) return [who, out];

  const visRow = settingsRowShell('visibilityTitle', 'visibilityNote');
  const visOrder = ['public', 'friends', 'private'];
  const visLabel = (v) => t(`visibility_${v}`);
  settingsRowButton(visRow, visLabel(state.account.profile?.visibility ?? 'public'), async (btn) => {
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

  const presRow = settingsRowShell('presenceTitle', 'presenceNote');
  const presLabel = (v) => (v === 'hidden' ? t('presence_hidden') : t('presence_online'));
  settingsRowButton(presRow, presLabel(state.account.profile?.presence ?? 'online'), async (btn) => {
    const next = (state.account.profile?.presence ?? 'online') === 'online' ? 'hidden' : 'online';
    btn.disabled = true;
    try {
      await account.updateProfileFields(userId(), { presence: next });
      state.account.profile.presence = next;
      btn.textContent = presLabel(next);
    } catch (error) { toast(esc(describeError(error)), 'error'); }
    btn.disabled = false;
  });

  return [who, visRow, presRow, out];
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
        renderCustomize();
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

/**
 * Two different destructive buttons, so two arming states. Sharing one would
 * let a tap that armed the mild button confirm the ruinous one.
 */
const resetArm = { cards: false, all: false, account: false };
const resetTimers = { cards: null, all: null, account: null };
const RESET_LABELS = { cards: 'settingsCardWipe', all: 'settingsReset', account: 'settingsDeleteAccount' };

function paintResetButton(button, which) {
  const armed = resetArm[which];
  button.textContent = armed ? t('settingsResetConfirm') : t(RESET_LABELS[which]);
  button.classList.toggle('is-armed', armed);
}

/** Same arm-then-confirm shape as selling a card: the button is the dialog. */
function handleReset(button, which) {
  if (!resetArm[which]) {
    resetArm[which] = true;
    paintResetButton(button, which);
    synth.playArm();
    clearTimeout(resetTimers[which]);
    resetTimers[which] = setTimeout(() => {
      resetArm[which] = false;
      paintResetButton(button, which);
    }, 5000);
    return;
  }
  if (which === 'cards') removeAllCards();
  else if (which === 'account') deleteAccountForGood(button);
  else wipeEverything();
}

/**
 * Remove the account, not just what is in it.
 *
 * Erasing a save empties the account and signs out; the address stays
 * registered, so signing in gets it back empty. This gets rid of the account
 * itself: the row in the auth table goes, the address stops working, and it is
 * free to sign up with again as a genuinely new player.
 *
 * The device is cleared FIRST-ish and unconditionally afterwards, because a
 * local save left behind would be pushed up under a brand new account the
 * moment somebody signed up with the same address.
 */
async function deleteAccountForGood(button) {
  if (!signedIn()) { toast(esc(t('settingsDeleteNoAccount')), 'error'); synth.playDenied(); return; }
  clearTimeout(syncTimer);
  button.disabled = true;
  try {
    await account.deleteAccount();
  } catch (error) {
    button.disabled = false;
    toast(esc(describeError(error)), 'error');
    synth.playDenied();
    return;
  }
  // The account is gone; the session token that named it is meaningless now.
  store.freezeWrites();
  await account.signOut().catch(() => { /* the row is already deleted */ });
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* nothing to clear */ }
  location.reload();
}

/**
 * Empty the collection without touching who the player is.
 *
 * The mild reset: cards, money, boosters, worn badges and the chosen theme go
 * back to the start, while level, experience, achievements and the codes this
 * save has redeemed stay exactly where they were. A special booster's cards
 * are the one thing here that belongs to the account rather than the run, so
 * they survive too, along with the unopened special boosters and the albums
 * built from them. Wiping those would take away something a code can only
 * hand over once.
 */
async function removeAllCards() {
  const kept = {};
  for (const [key, entry] of Object.entries(state.collection.entries ?? {})) {
    if (entry?.special) kept[key] = entry;
  }
  state.collection.entries = kept;
  store.saveCollection(state.collection);

  // Unopened special boosters stay; everything else on the shelf goes.
  for (const [id, slot] of Object.entries(state.inventory)) {
    if (slot?.spec?.kind !== 'code') delete state.inventory[id];
  }
  store.saveInventory(state.inventory);

  store.saveWallet(STARTER_COINS);
  store.saveBadgeLoadout(null);
  state.badgeLoadout = null;
  store.saveWishlist([]);
  try { localStorage.setItem(THEME_KEY, DEFAULT_THEME); } catch { /* session only */ }

  // The server holds the same save, so it has to hear about this BEFORE the
  // reload, or the next launch pulls the cards straight back down. That is
  // exactly what happened when this only queued a sync and reloaded: the
  // reload killed the queued push, and the wipe looked like it had done
  // nothing. If the push cannot be made now, the device keeps its wiped
  // save, the sync keeps trying, and the reload waits for it.
  if (signedIn()) {
    clearTimeout(syncTimer);
    let pushed = null;
    try { pushed = await account.pushSave(userId()); } catch { pushed = null; }
    if (pushed !== 'pushed') {
      if (pushed === 'outdated') showUpdateBar('outdated');
      else { toast(esc(t('syncFailedKept')), 'error'); syncSoon(); }
      renderPacks(); renderBinder(); refreshWallet();
      return;
    }
    account.publishStats(userId(), currentStats()).catch(() => {});
  }
  toast(esc(t('settingsCardWipeDone')), 'ok');
  location.reload();
}

/**
 * Erase everything - including the copy on the server.
 *
 * Clearing only the device would erase nothing: the account's save would be
 * pulled straight back down on the next launch. The server goes first, so a
 * failure there leaves the player exactly where they were rather than
 * half-erased.
 *
 * Every wikster key goes, not a hand-written list of them: the list had
 * already fallen behind the wishlist, the badge shelf, the frame and the
 * saved bids, all of which outlived an erase that claimed to remove
 * everything. Redeemed codes live in the profile, so they go too, and a
 * secret code can be redeemed again on the save that comes after this.
 */
async function wipeEverything() {
  clearTimeout(syncTimer);
  // Signed in is decided by the SESSION, not by whether the profile happens to
  // be loaded. Gating on the profile meant a reset run before it arrived left
  // the account untouched, and the next launch pulled the whole save back
  // down: the button looked like it had done nothing.
  // The device is wiped WHATEVER the server says. This used to stop at the
  // first refusal from the server and leave the device untouched, so a
  // player whose account could not be reached (a deleted account, a schema
  // behind the app, no connection) pressed Erase, saw an error or nothing,
  // and kept every level, badge and stat they were trying to be rid of.
  // Now the server is asked, its answer is remembered, and the device is
  // emptied and the app restarted regardless; if the server refused, the
  // next launch says so, because signing back into THAT account could pull
  // its old save down again.
  let serverFailed = false;
  // From here on nothing may be written back, whatever unload handlers run.
  store.freezeWrites();
  if (signedIn()) {
    try {
      await account.hardReset(userId());
    } catch {
      serverFailed = true;
    }
    // Signing out takes the session with it, so the app comes back at the
    // welcome screen the way a new install does. Signing in again finds an
    // account with nothing stored against it.
    await account.signOut().catch(() => { /* the local wipe still stands */ });
  }
  try {
    // EVERY key, not the app's own prefix. The prefix left the session token
    // behind, so the app woke up still signed in and half of "a new account"
    // was untrue the moment it launched.
    localStorage.clear();
    sessionStorage.clear();
    if (serverFailed) localStorage.setItem(WIPE_NOTE_KEY, 'server');
  } catch { /* storage unavailable: nothing to remove */ }
  location.reload();
}

/** Left behind by a wipe the server refused, so the next launch can say so. */
const WIPE_NOTE_KEY = 'wikster.wipeNote';

function sayWipeNote() {
  let note = null;
  try { note = localStorage.getItem(WIPE_NOTE_KEY); localStorage.removeItem(WIPE_NOTE_KEY); } catch { /* storage unavailable */ }
  if (note) setTimeout(() => toast(esc(t('wipeServerRefused')), 'error'), 1800);
}

/*
 * HAPTICS. A short pulse under the taps that already make a sound, so a phone
 * on silent still answers. Vibration is not on desktop and not on iOS Safari,
 * and asking for it there throws nothing, so no capability test is needed
 * beyond the one below.
 */
function buzz(ms = 12) {
  if (settings().haptics === false) return;
  try { navigator.vibrate?.(ms); } catch { /* no vibrator on this device */ }
}

/*
 * KEEP THE SCREEN AWAKE while a booster is being opened.
 *
 * A rip is a slow gesture followed by a card at a time, and a phone whose
 * screen times out mid-pack takes the reveal with it. The lock is held only
 * for the open screen and dropped everywhere else, because a lock held for a
 * whole session is a flat battery.
 */
let wakeLock = null;

async function holdWakeLock() {
  if (settings().awake === false || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock?.request('screen') ?? null;
    // The system drops it whenever the app leaves the screen; forget it so the
    // next open asks again rather than believing it still holds one.
    wakeLock?.addEventListener?.('release', () => { wakeLock = null; });
  } catch { /* unsupported, or refused while backgrounded */ }
}

function releaseWakeLock() {
  try { wakeLock?.release?.(); } catch { /* already gone */ }
  wakeLock = null;
}

function applySettings() {
  const s = settings();
  document.documentElement.dataset.lowpower = s.lowPower ? '1' : '0';
  document.documentElement.dataset.hints = s.hints ? '1' : '0';
  document.documentElement.dataset.prices = s.prices === false ? '0' : '1';
  if (s.awake === false) releaseWakeLock();
  synth.setMuted(!s.sound);
  synth.setVolume(s.volume ?? 1);
  music.setVolume(s.musicVolume ?? 0.4);
  music.setOn(s.music !== false);
  backdrop.setLowPower(s.lowPower);
}

/** A slider row for the Preferences list: 0..100 over a stored 0..1. */
function sliderRow(key, titleKey, noteKey, { preview = null } = {}) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <input class="row-slider row-action" type="range" min="0" max="100" step="5">`;
  row.querySelector('h4').textContent = t(titleKey);
  row.querySelector('p').textContent = t(noteKey);
  const slider = row.querySelector('input');
  slider.value = String(Math.round((settings()[key] ?? 1) * 100));
  slider.setAttribute('aria-label', t(titleKey));
  slider.addEventListener('input', () => {
    settings()[key] = Number(slider.value) / 100;
    applySettings();
  });
  slider.addEventListener('change', () => {
    store.saveProfile(state.profile);
    preview?.();
  });
  return row;
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
    gainBooster(gift.spec, 1);
    renderPacks();
  }
  synth.playGift();
}

function claimGift(body) {
  const slot = claimDaily(state.profile.daily);
  if (!slot) return;
  store.saveProfile(state.profile);
  grantGift(slot.gift);
  reportQuest('daily');
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

/**
 * The pull rates, for the booster in front of the player rather than in the
 * abstract: the odds sheet shows the row that booster actually rolls on, next
 * to what each rarity means in readership. A tier booster's row is visibly
 * better than the basic one, which is the whole point of paying for it.
 */
function openOdds(rarityId = null) {
  openSheet(t('pullRates'), (body) => {
    body.innerHTML = `
      <p style="margin-bottom:12px" data-note></p>
      <p style="margin-bottom:16px" data-row></p>
      <table class="odds-table">
        <thead><tr><th></th><th></th></tr></thead>
        <tbody></tbody>
      </table>`;
    body.querySelector('[data-note]').textContent = t('oddsNote');
    const rowNote = body.querySelector('[data-row]');
    rowNote.textContent = rarityId
      ? t('oddsRowTier', { rarity: tx(rarityById(rarityId).name) })
      : t('oddsRowBasic');
    const [h1, h2] = body.querySelectorAll('th');
    h1.textContent = t('rarity');
    h2.textContent = t('oddsChance');
    body.querySelector('tbody').replaceChildren(...oddsRows(rarityId).map(({ rarity, pct }) => {
      const row = document.createElement('tr');
      row.innerHTML = `<td><span class="odds-name"><span class="odds-swatch"></span><span></span></span></td><td class="odds-pct tabular"></td>`;
      const swatch = row.querySelector('.odds-swatch');
      swatch.style.color = rarity.color;
      swatch.style.background = rarity.color;
      const label = row.querySelector('.odds-name span:last-child');
      label.textContent = tx(rarity.name);
      label.style.color = rarity.color;
      const cells = row.querySelectorAll('.odds-pct');
      // Below a tenth of a percent, a rounded number reads as zero and looks
      // like the tier cannot happen at all.
      cells[0].textContent = pct >= 0.1 ? `${pct}%` : '< 0.1%';
      return row;
    }));
  });
}

/* --- the arcade: minigames, quests and the leaderboard ------------------------------------------------------------ */

/** Who the quests and the boards belong to: the account, or this device. */
const questUserKey = () => userId() ?? 'local';

/**
 * Something happened that a quest may count. Never throws: a quest that
 * cannot be credited is a quest missed, not a game stopped.
 */
function reportQuest(metric, detail = {}) {
  try {
    const done = quests.track(metric, detail, questUserKey());
    for (const id of done) {
      const quest = quests.describe(quests.loadBoard(questUserKey())).find((r) => r.id === id)?.quest;
      if (quest) { toast(esc(t('questDone', { name: tx(quest.name) })), 'ok'); pushNote('trophy', t('questDone', { name: tx(quest.name) }), 'quests'); }
    }
    paintDrawerLinks();
  } catch (error) {
    console.warn('quest report failed', error);
  }
}

/** Albums completed since the last look: one report each. */
let albumsDoneBefore = null;
function reportAlbums() {
  try {
    const done = buildAlbums(store.allEntries(state.collection), state.customPacks).filter((a) => a.complete).length;
    if (albumsDoneBefore !== null && done > albumsDoneBefore) for (let i = albumsDoneBefore; i < done; i++) reportQuest('album');
    albumsDoneBefore = done;
  } catch { /* an album that cannot be counted is not a crash */ }
}

/** The stage a game shows when it cannot run: an icon, a sentence, maybe a button. */
function gameStage(iconId, text, action = null) {
  const box = document.createElement('div');
  box.className = 'game-stage';
  box.innerHTML = `<span class="game-stage-icon">${iconSvg(iconId, { size: 46 })}</span><p class="game-note"></p>`;
  box.querySelector('.game-note').textContent = text;
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary';
    btn.textContent = action.label;
    press(btn, { sound: null });
    btn.addEventListener('click', () => { synth.playTap(); action.run(); });
    box.appendChild(btn);
  }
  return box;
}

/** What went wrong at the house, in the player's words. */
function houseError(error) {
  const code = String(error?.message ?? '');
  if (code === 'SIGN_IN') return t('gameSignIn');
  if (code === 'CLOSED') return t('gameClosed');
  if (code === 'TIMEOUT') return t('gameTimeout');
  if (code === 'TAMPER') return t('gameTamper');
  if (code === 'BAD_BET' || code === 'OVER_LIMIT') return t('gameBadBet');
  if (code === 'SCHEMA') return t('gameSchema');
  return t('gameFailed');
}

function renderGames() {
  el.gamesTitle.textContent = t('tabGames');
  el.gamesSub.textContent = t('gamesIntro');
  const tiles = [
    { id: 'wikdle', icon: 'grid', color: '#4ade80', title: t('wikdleTitle'), note: t('gamesWikdleNote'), run: () => { renderWikdle(); showScreen('wikdle'); } },
    { id: 'slots', icon: 'reel', color: '#fbbf24', title: t('slotsTitle'), note: t('gamesSlotsNote'), run: () => { renderSlots(); showScreen('slots'); } },
  ];
  const list = document.createElement('div');
  list.className = 'games-list';
  list.replaceChildren(...tiles.map((tile) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'game-tile';
    btn.style.setProperty('--game', tile.color);
    btn.innerHTML = `<span class="game-tile-art">${iconSvg(tile.icon, { size: 28 })}</span>
      <span class="game-tile-copy"><b></b><p></p></span>
      <span class="game-tile-go">${iconSvg('chevronRight', { size: 18 })}</span>`;
    btn.querySelector('b').textContent = tile.title;
    btn.querySelector('p').textContent = tile.note;
    press(btn, { sound: null });
    btn.addEventListener('click', () => { synth.playTap(); tile.run(); });
    return btn;
  }));
  const note = document.createElement('p');
  note.className = 'game-closed';
  note.textContent = casinoOpen(signedIn()) ? t('gamesCasinoOpen') : t('gamesCasinoNeedsAccount');
  el.gamesList.replaceChildren(list, note);
  reveal(list.children, { step: 60 });
}

/* --- Wikdle ------------------------------------------------------------------------------ */

const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', '⏎zxcvbnm⌫'];

/** Paper confetti over a node: a short burst from its middle, falling and tumbling. */
function confettiOver(node, count = 90) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'wikdle-confetti';
  node.appendChild(canvas);
  const box = node.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(box.width * dpr);
  canvas.height = Math.round(box.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = box.width, H = box.height;
  const colors = ['#4ade80', '#fbbf24', '#f472b6', '#60a5fa', '#a78bfa', '#fff'];
  const bits = Array.from({ length: count }, (_, i) => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.4, y: H * 0.45,
    vx: (Math.random() - 0.5) * 14, vy: -6 - Math.random() * 11,
    w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.35,
    color: colors[i % colors.length]
  }));
  const start = performance.now();
  const frame = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const b of bits) {
      b.vy += 0.35; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.a += b.va;
      if (b.y > H + 10) continue;
      alive++;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
      ctx.fillStyle = b.color; ctx.globalAlpha = Math.max(0, 1 - t / 2600);
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    }
    if (alive && t < 2800) requestAnimationFrame(frame); else canvas.remove();
  };
  requestAnimationFrame(frame);
}

function renderWikdle() {
  el.wikdleTitle.textContent = t('wikdleTitle');
  el.wikdleBack.innerHTML = iconSvg('chevronLeft', { size: 18 });
  let game = wikdle.loadGame();
  let typed = '';
  const body = el.wikdleBody;
  const wrap = document.createElement('div');
  wrap.className = 'wikdle';

  // The header: today's date, the streak, and how many hints are left.
  const head = document.createElement('div');
  head.className = 'wikdle-head';
  const stats0 = wikdle.loadStats();
  const streakNow = stats0.lastWonDay === game.day || stats0.lastWonDay === new Date(new Date(`${game.day}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10) ? stats0.streak : 0;
  head.innerHTML = `
    <span class="wikdle-pill"><span class="wikdle-pill-icon">${iconSvg('calendar', { size: 14 })}</span><span></span></span>
    <span class="wikdle-pill is-streak${streakNow >= 3 ? ' is-hot' : ''}"><span class="wikdle-pill-icon">${iconSvg('flame', { size: 14 })}</span><span></span></span>
    <span class="wikdle-pill is-hints"><span class="wikdle-pill-icon">${iconSvg('bulb', { size: 14 })}</span><span></span></span>`;
  head.children[0].lastElementChild.textContent = game.day;
  head.children[1].lastElementChild.textContent = t('wikdleStreakPill', { n: streakNow });
  const hintsPill = head.children[2].lastElementChild;

  const stage = document.createElement('div');
  stage.className = 'wikdle-stage';
  const grid = document.createElement('div');
  grid.className = 'wikdle-grid';
  stage.appendChild(grid);
  const status = document.createElement('p');
  status.className = 'wikdle-status';
  const hints = document.createElement('div');
  hints.className = 'wikdle-hints';
  const keys = document.createElement('div');
  keys.className = 'wikdle-keys';
  const done = document.createElement('div');
  done.className = 'wikdle-done';
  done.hidden = true;
  wrap.append(head, stage, status, hints, keys, done);
  body.replaceChildren(wrap);

  const paintGrid = (revealRow = -1, dance = false) => {
    grid.replaceChildren(...Array.from({ length: wikdle.ROWS }, (_, r) => {
      const row = document.createElement('div');
      row.className = 'wikdle-row';
      row.dataset.row = String(r);
      const played = game.rows[r];
      const current = !played && r === game.rows.length && game.status === 'playing';
      for (let c = 0; c < wikdle.COLUMNS; c++) {
        const cell = document.createElement('span');
        cell.className = 'wikdle-cell';
        if (played) {
          cell.textContent = played.guess[c];
          cell.classList.add(`is-${played.marks[c]}`);
          if (r === revealRow) { cell.classList.add('is-revealing'); cell.style.animationDelay = `${c * 130}ms`; }
          if (dance && r === game.rows.length - 1 && game.status === 'won') { cell.classList.add('is-dance'); cell.style.animationDelay = `${c * 90}ms`; }
        } else if (current && typed[c]) {
          cell.textContent = typed[c];
          cell.classList.add('is-filled');
          if (c === typed.length - 1) cell.classList.add('is-pop');
        } else if (current) {
          cell.classList.add('is-current');
        }
        row.appendChild(cell);
      }
      return row;
    }));
  };

  const paintKeys = () => {
    const marks = wikdle.keyMarks(game.rows);
    keys.replaceChildren(...KEYBOARD_ROWS.map((letters) => {
      const row = document.createElement('div');
      row.className = 'wikdle-keyrow';
      for (const ch of letters) {
        const key = document.createElement('button');
        key.type = 'button';
        key.className = 'wikdle-key';
        if (ch === '⏎') { key.classList.add('is-wide', 'is-enter'); key.textContent = t('wikdleEnter'); key.dataset.key = 'enter'; }
        else if (ch === '⌫') { key.classList.add('is-wide'); key.innerHTML = iconSvg('backspace', { size: 20 }); key.dataset.key = 'back'; key.setAttribute('aria-label', 'Backspace'); }
        else { key.textContent = ch; key.dataset.key = ch; if (marks[ch]) key.classList.add(`is-${marks[ch]}`); }
        key.disabled = game.status !== 'playing';
        key.addEventListener('pointerdown', (event) => { event.preventDefault(); press_(key.dataset.key); });
        row.appendChild(key);
      }
      return row;
    }));
  };

  // THE HINTS: two, from the word's own article, each for a hundred of the day's points.
  const paintHints = () => {
    const used = game.hints ?? [];
    hintsPill.textContent = t('wikdleHintsLeft', { n: Math.max(0, wikdle.HINTS_MAX - used.length) });
    hints.replaceChildren(...used.map((text, i) => {
      const line = document.createElement('p');
      line.className = 'wikdle-hint';
      line.innerHTML = `<span class="wikdle-hint-icon">${iconSvg('bulb', { size: 15 })}</span><b></b><span></span>`;
      line.querySelector('b').textContent = i === 0 ? t('wikdleHintDef') : t('wikdleHintSentence');
      line.querySelector('span:last-child').textContent = text;
      return line;
    }));
    if (game.status === 'playing' && used.length < wikdle.HINTS_MAX && game.rows.length >= 1) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ghost btn-sm wikdle-hint-btn';
      btn.innerHTML = `${iconSvg('bulb', { size: 15 })}<span></span><small></small>`;
      btn.querySelector('span').textContent = used.length === 0 ? t('wikdleHint') : t('wikdleHintMore');
      btn.querySelector('small').textContent = t('wikdleHintCost', { n: wikdle.HINT_COST });
      press(btn, { sound: null });
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.classList.add('is-busy');
        synth.playTap();
        const text = await wikdle.fetchHint(wikdle.wordForDay(game.day), used.length);
        if (game.status !== 'playing') return;
        if (!text) { btn.disabled = false; btn.classList.remove('is-busy'); toast(esc(t('wikdleHintNone')), 'error'); synth.playDenied(); return; }
        game = wikdle.takeHint(game, text);
        synth.playReveal?.();
        paintHints();
      });
      hints.appendChild(btn);
    } else if (game.status === 'playing' && used.length < wikdle.HINTS_MAX) {
      const note = document.createElement('p');
      note.className = 'wikdle-hint-note';
      note.textContent = t('wikdleHintAfter');
      hints.appendChild(note);
    }
  };

  const paintDone = () => {
    if (game.status === 'playing') { done.hidden = true; return; }
    const stats = wikdle.loadStats();
    const won = game.status === 'won';
    const word = wikdle.wordForDay(game.day);
    const points = wikdle.wikdlePoints(game);
    const base = wikdle.basePoints(game);
    const hintsUsed = game.hints?.length ?? 0;
    const bonus = won ? wikdle.streakBonus(stats.streak) : 0;
    const max = Math.max(1, ...stats.guesses);
    const tiles = [
      ['calendar', stats.played, t('wikdlePlayed')],
      ['target', `${stats.played ? Math.round(100 * stats.won / stats.played) : 0}%`, t('wikdleWinRate')],
      ['flame', stats.streak, t('wikdleStreak')],
      ['trophy', stats.best, t('wikdleBest')]
    ];
    done.innerHTML = `
      <div class="wikdle-verdict"><span class="wikdle-verdict-icon">${iconSvg(won ? 'trophy' : 'grid', { size: 26 })}</span><b></b></div>
      <p class="wikdle-answer"><span></span><a class="wikdle-read" target="_blank" rel="noopener"></a></p>
      <div class="wikdle-breakdown" ${won ? '' : 'hidden'}>
        <div><span></span><b class="tabular">${base}</b></div>
        <div ${hintsUsed ? '' : 'hidden'}><span></span><b class="tabular">−${hintsUsed * wikdle.HINT_COST}</b></div>
        <div ${bonus > 0 ? '' : 'hidden'}><span></span><b class="tabular">+${Math.round(bonus * 100)}%</b></div>
        <div class="is-total"><span></span><b class="tabular">${points}</b></div>
      </div>
      <div class="wikdle-stats">${tiles.map(([icon, n, label]) => `<div class="wikdle-stat"><span class="wikdle-stat-icon">${iconSvg(icon, { size: 16 })}</span><b class="tabular">${esc(String(n))}</b><span>${esc(label)}</span></div>`).join('')}</div>
      <div class="wikdle-bars">${stats.guesses.map((n, i) => `<div class="wikdle-bar${won && i === game.rows.length - 1 ? ' is-today' : ''}"><span>${i + 1}</span><i style="width:${Math.max(6, Math.round(100 * n / max))}%"><em>${n}</em></i></div>`).join('')}</div>
      <p class="wikdle-next"><span class="wikdle-next-icon">${iconSvg('hourglass', { size: 14 })}</span><span data-next></span></p>`;
    done.querySelector('.wikdle-verdict b').textContent = won ? t('wikdleWon', { n: game.rows.length, points }) : t('wikdleLost');
    done.querySelector('.wikdle-answer span').textContent = t('wikdleAnswer', { word: word.toUpperCase() });
    const read = done.querySelector('.wikdle-read');
    read.href = wikdle.articleUrl(word);
    read.textContent = t('wikdleRead');
    const rows = done.querySelectorAll('.wikdle-breakdown > div');
    rows[0].querySelector('span').textContent = t('wikdlePointsBase', { n: game.rows.length });
    rows[1].querySelector('span').textContent = t('wikdleHintsUsed', { n: hintsUsed });
    rows[2].querySelector('span').textContent = t('wikdleStreakBonus', { n: stats.streak });
    rows[3].querySelector('span').textContent = t('wikdlePointsTotal');
    const share = document.createElement('button');
    share.type = 'button';
    share.className = 'btn btn-ghost btn-sm wikdle-share';
    share.innerHTML = `${iconSvg('share', { size: 15 })}<span></span>`;
    share.querySelector('span').textContent = t('wikdleShare');
    press(share, { sound: null });
    share.addEventListener('click', async () => { synth.playTap(); const ok = await copyText(wikdle.shareText(game)); toast(ok ? t('wikdleCopied') : t('wikdleCopyFailed'), ok ? 'ok' : 'error'); });
    done.appendChild(share);
    const tick = () => { const next = done.querySelector('[data-next]'); if (next) next.textContent = t('wikdleNext', { time: formatCountdown(wikdle.msToNextDay()) }); };
    tick();
    clearInterval(state.wikdleTimer);
    state.wikdleTimer = setInterval(() => { if (state.tab !== 'wikdle') { clearInterval(state.wikdleTimer); return; } tick(); }, 1000);
    done.hidden = false;
    hints.hidden = true;
  };

  const settle = () => {
    // The finished board is worth points, once: on the day's board, into the
    // quests, the wallet and, signed in, the leaderboard. A streak pays a
    // bonus on the coins; a fast solve and every seventh day of a streak
    // hand over a booster on top.
    if (game.status === 'playing' || game.settled) return;
    game.settled = true;
    const points = wikdle.wikdlePoints(game);
    const stats = wikdle.loadStats();
    reportQuest('wikdle', { won: game.status === 'won', guesses: game.rows.length });
    if (points > 0) {
      reportQuest('points', { amount: points, game: 'wikdle' });
      const coins = Math.round((points / 2) * (1 + wikdle.streakBonus(stats.streak)));
      store.saveWallet(store.loadWallet() + coins);
      refreshWallet();
      toast(esc(t('wikdlePaid', { amount: coins })), 'ok');
      if (game.rows.length <= wikdle.FAST_SOLVE_ROWS) {
        gainBooster({ kind: 'open', themeId: null, rarityId: 'rare', cards: 1 }, 1);
        toast(esc(t('wikdleBoosterFast', { n: game.rows.length })), 'ok');
      }
      if (stats.streak > 0 && stats.streak % wikdle.STREAK_BOOSTER_EVERY === 0) {
        gainBooster({ kind: 'open', themeId: null, rarityId: 'uncommon', cards: 3 }, 1);
        toast(esc(t('wikdleBoosterStreak', { n: stats.streak })), 'ok');
      }
      if (signedIn()) leaderboard.submitWikdle(points, game.day).catch(() => { /* the board can miss one */ });
    }
  };

  const press_ = (key) => {
    if (game.status !== 'playing') return;
    if (key === 'enter') {
      const result = wikdle.playGuess(game, typed);
      if (result.error) {
        status.textContent = result.error === 'short' ? t('wikdleTooShort') : result.error === 'unknown' ? t('wikdleNotAWord') : '';
        status.classList.add('is-error');
        const row = grid.querySelector(`[data-row="${game.rows.length}"]`);
        row?.classList.add('is-shake');
        setTimeout(() => row?.classList.remove('is-shake'), 400);
        synth.playDenied();
        return;
      }
      game = result;
      typed = '';
      status.textContent = '';
      status.classList.remove('is-error');
      synth.playFlip?.() ?? synth.playTap();
      paintGrid(game.rows.length - 1);
      paintKeys();
      paintHints();
      if (game.status !== 'playing') {
        settle();
        setTimeout(() => {
          paintGrid(-1, true);
          paintDone();
          if (game.status === 'won') { confettiOver(stage, game.rows.length <= 2 ? 160 : 90); if (game.rows.length <= 2) synth.playFanfare?.(); else synth.playResolved?.(); }
          else synth.playDenied();
        }, 900);
      }
      return;
    }
    if (key === 'back') { typed = typed.slice(0, -1); paintGrid(); return; }
    if (/^[a-z]$/.test(key) && typed.length < wikdle.COLUMNS) { typed += key; synth.playTap(); paintGrid(); }
  };

  // A hardware keyboard works too.
  state.wikdleKeys?.abort?.();
  state.wikdleKeys = new AbortController();
  document.addEventListener('keydown', (event) => {
    if (state.tab !== 'wikdle' || event.metaKey || event.ctrlKey) return;
    const k = event.key.toLowerCase();
    if (k === 'enter') press_('enter'); else if (k === 'backspace') press_('back'); else if (/^[a-z]$/.test(k)) press_(k);
  }, { signal: state.wikdleKeys.signal });

  paintGrid();
  paintKeys();
  paintHints();
  paintDone();
  status.textContent = game.status === 'playing' ? t('wikdleIntro') : '';
}

/* --- the slot machine ----------------------------------------------------------------------- */

/** A symbol's drawing, at a size. */
function symbolSvg(sym, size = 40) {
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">${sym.art}</svg>`;
}

/**
 * Coins raining over the reels on a win. A short burst on a canvas laid over
 * the window: gold discs thrown up from the payline, falling under gravity,
 * spinning as they go. Bigger wins throw more. Reduced motion throws none.
 */
function rainCoins(canvas, count) {
  if (!count || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(box.width * dpr);
  canvas.height = Math.round(box.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = box.width, H = box.height;
  const coins = Array.from({ length: count }, (_, i) => ({
    x: W * (0.2 + Math.random() * 0.6), y: H * 0.55,
    vx: (Math.random() - 0.5) * 9, vy: -7 - Math.random() * 9,
    r: 5 + Math.random() * 4, spin: Math.random() * Math.PI, vs: (Math.random() - 0.5) * 0.4,
    hue: 40 + (i % 3) * 6, delay: Math.random() * 220
  }));
  const start = performance.now();
  canvas.hidden = false;
  const frame = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const c of coins) {
      if (t < c.delay) { alive++; continue; }
      c.vy += 0.42; c.x += c.vx; c.y += c.vy; c.spin += c.vs;
      if (c.y - c.r > H + 4) continue;
      alive++;
      const squash = Math.abs(Math.cos(c.spin));
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(Math.max(0.18, squash), 1);
      ctx.beginPath();
      ctx.arc(0, 0, c.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${c.hue} 92% ${52 + squash * 14}%)`;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `hsl(${c.hue} 80% 30%)`;
      ctx.stroke();
      ctx.restore();
    }
    if (alive && t < 2600) requestAnimationFrame(frame);
    else { ctx.clearRect(0, 0, W, H); canvas.hidden = true; }
  };
  requestAnimationFrame(frame);
}

function renderSlots() {
  el.slotsTitle.textContent = t('slotsTitle');
  el.slotsBack.innerHTML = iconSvg('chevronLeft', { size: 18 });
  const body = el.slotsBody;
  if (!casinoOpen(signedIn())) {
    body.replaceChildren(gameStage('reel', t('gameSignIn'), { label: t('gateSignIn'), run: () => showGate() }));
    return;
  }
  const machine = state.slots ??= { phase: 'idle', lineBet: LINE_BETS[1], last: null };
  machine.phase = 'idle';
  const CELL = 64;
  const COPIES = 3;

  const wrap = document.createElement('div');
  wrap.className = 'slots';

  // THE CABINET: a marquee of bulbs, the glass, the reels, and the pay line lamps.
  const cabinet = document.createElement('div');
  cabinet.className = 'slots-cabinet';
  const marquee = document.createElement('div');
  marquee.className = 'slots-marquee';
  marquee.innerHTML = `<span class="slots-bulbs" aria-hidden="true"></span><b></b><small></small><span class="slots-bulbs" aria-hidden="true"></span>`;
  marquee.querySelector('b').textContent = t('slotsTitle');
  marquee.querySelector('small').textContent = t('slotsMarquee', { x: PAYTABLE[WILD][3] });
  cabinet.appendChild(marquee);

  const glass = document.createElement('div');
  glass.className = 'slots-glass';
  const lampsL = document.createElement('div');
  lampsL.className = 'slots-lamps';
  const lampsR = document.createElement('div');
  lampsR.className = 'slots-lamps';
  for (const side of [lampsL, lampsR]) {
    side.replaceChildren(...PAYLINES.map((line, i) => {
      const lamp = document.createElement('span');
      lamp.className = 'slots-lamp';
      lamp.dataset.line = line.id;
      lamp.textContent = String(i + 1);
      return lamp;
    }));
  }
  const win = document.createElement('div');
  win.className = 'slots-window';
  win.style.height = `${CELL * 3}px`;
  const strips = [];
  for (let reel = 0; reel < 3; reel++) {
    const reelBox = document.createElement('div');
    reelBox.className = 'slots-reel';
    const strip = document.createElement('div');
    strip.className = 'slots-strip';
    const cells = [];
    for (let copy = 0; copy < COPIES; copy++) for (const id of REEL) cells.push(id);
    strip.replaceChildren(...cells.map((id) => {
      const cell = document.createElement('div');
      cell.className = `slots-cell is-${id}`;
      cell.style.height = `${CELL}px`;
      cell.innerHTML = symbolSvg(symbolById(id), 46);
      return cell;
    }));
    reelBox.appendChild(strip);
    win.appendChild(reelBox);
    strips.push({ box: reelBox, strip });
  }
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.setAttribute('class', 'slots-overlay');
  overlay.setAttribute('aria-hidden', 'true');
  win.appendChild(overlay);
  const coins = document.createElement('canvas');
  coins.className = 'slots-coins';
  coins.hidden = true;
  win.appendChild(coins);
  const banner = document.createElement('div');
  banner.className = 'slots-banner';
  banner.hidden = true;
  win.appendChild(banner);
  glass.append(lampsL, win, lampsR);
  cabinet.appendChild(glass);

  const result = document.createElement('p');
  result.className = 'slots-result';
  const bonusLine = document.createElement('div');
  bonusLine.className = 'slots-bonus';
  bonusLine.hidden = true;
  cabinet.append(result, bonusLine);
  wrap.appendChild(cabinet);

  // THE BETS and THE LEVER.
  const betRow = document.createElement('div');
  betRow.className = 'slots-betrow';
  const betLabel = document.createElement('span');
  betLabel.className = 'slots-betlabel';
  betLabel.textContent = t('slotsLineBet');
  const bets = document.createElement('div');
  bets.className = 'slots-bets';
  betRow.append(betLabel, bets);
  const lever = document.createElement('button');
  lever.type = 'button';
  lever.className = 'btn btn-primary slots-lever';
  press(lever, { sound: null });
  const paintBets = () => {
    bets.replaceChildren(...LINE_BETS.map((bet) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `slots-bet${machine.lineBet === bet ? ' is-on' : ''}`;
      btn.textContent = String(bet);
      btn.disabled = machine.phase !== 'idle';
      btn.addEventListener('click', () => { if (machine.phase !== 'idle') return; machine.lineBet = bet; synth.playTap(); paintBets(); });
      return btn;
    }));
    lever.innerHTML = `<span class="slots-lever-word">${esc(t('slotsSpin'))}</span><span class="slots-lever-cost">${money(SPIN_COST(machine.lineBet))}</span>`;
    lever.disabled = machine.phase !== 'idle';
    lever.classList.toggle('is-poor', SPIN_COST(machine.lineBet) > state.wallet);
  };
  wrap.append(betRow, lever);

  // THE BOOK: every symbol and what it pays, the wild and the bonus explained.
  const book = document.createElement('div');
  book.className = 'slots-book';
  const bookTitle = document.createElement('p');
  bookTitle.className = 'slots-book-title';
  bookTitle.textContent = t('slotsBookTitle');
  const bookGrid = document.createElement('div');
  bookGrid.className = 'slots-book-grid';
  bookGrid.replaceChildren(...SYMBOLS.filter((s) => PAYTABLE[s.id]).map((sym) => {
    const row = document.createElement('div');
    row.className = 'slots-book-row';
    const pays = Object.entries(PAYTABLE[sym.id]).map(([n, m]) => `<span><i>${n}×</i>${m}</span>`).join('');
    row.innerHTML = `${symbolSvg(sym, 30)}<b></b><span class="slots-book-pays tabular">${pays}</span>`;
    row.querySelector('b').textContent = tx(sym.name);
    return row;
  }));
  const notes = document.createElement('div');
  notes.className = 'slots-book-notes';
  const noteWild = document.createElement('p');
  noteWild.innerHTML = `${symbolSvg(symbolById(WILD), 22)}<span></span>`;
  noteWild.querySelector('span').textContent = t('slotsBookWild', { x: PAYTABLE[WILD][3] });
  const noteBonus = document.createElement('p');
  noteBonus.innerHTML = `${symbolSvg(symbolById(SCATTER), 22)}<span></span>`;
  noteBonus.querySelector('span').textContent = t('slotsBookBonus', { n: BONUS_SPINS, min: SCATTER_MIN });
  const noteHouse = document.createElement('p');
  noteHouse.className = 'game-closed';
  noteHouse.textContent = t('slotsBookNote', { lines: PAYLINES.length });
  notes.append(noteWild, noteBonus, noteHouse);
  book.append(bookTitle, bookGrid, notes);
  wrap.appendChild(book);
  body.replaceChildren(wrap);

  /* --- motion ------------------------------------------------------------- */

  // The strip's cell at `index` sits on the window's top row.
  const restAt = (stop) => -(stop + REEL.length) * CELL;
  const setStrip = (i, stop) => {
    const { strip, box } = strips[i];
    box.classList.remove('is-spinning');
    strip.style.transition = 'none';
    strip.style.transform = `translateY(${restAt(stop)}px)`;
  };
  const last = () => machine.last?.stops ?? [0, 0, 0];
  last().forEach((stop, i) => setStrip(i, stop));

  /** Roll every reel from where it is to the stops named, left to right. */
  const roll = (from, stops, durations) => new Promise((resolve) => {
    strips.forEach(({ strip, box }, i) => {
      // Jump one copy up (the same picture) so there is a whole strip to travel.
      strip.style.transition = 'none';
      strip.style.transform = `translateY(${-(from[i]) * CELL}px)`;
      box.classList.add('is-spinning');
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      strips.forEach(({ strip }, i) => {
        strip.style.transition = `transform ${durations[i]}ms ${REEL_EASE}`;
        strip.style.transform = `translateY(${-(stops[i] + 2 * REEL.length) * CELL}px)`;
      });
      durations.forEach((ms, i) => setTimeout(() => { strips[i].box.classList.remove('is-spinning'); strips[i].box.classList.add('is-landed'); synth.playSnap?.(); setTimeout(() => strips[i].box.classList.remove('is-landed'), 260); }, ms));
    }));
    setTimeout(() => {
      // Settle onto the middle copy, so the next roll has room again.
      stops.forEach((stop, i) => setStrip(i, stop));
      resolve();
    }, Math.max(...durations) + 80);
  });

  const cellCenter = (reel, row) => {
    const box = strips[reel].box.getBoundingClientRect();
    const frame = win.getBoundingClientRect();
    return { x: box.left - frame.left + box.width / 2, y: row * CELL + CELL / 2 };
  };
  const clearWins = () => {
    overlay.replaceChildren();
    win.querySelectorAll('.is-won').forEach((c) => c.classList.remove('is-won'));
    glass.querySelectorAll('.slots-lamp.is-on').forEach((l) => l.classList.remove('is-on'));
  };
  /** Light the cells and lamps of the lines that paid, and draw each line across the glass. */
  const showWins = (spun) => {
    clearWins();
    const frame = win.getBoundingClientRect();
    overlay.setAttribute('viewBox', `0 0 ${frame.width} ${frame.height}`);
    spun.lines.forEach((line, n) => {
      const pl = PAYLINES.find((p) => p.id === line.id);
      const color = symbolById(line.symbol)?.color ?? '#fbbf24';
      const points = [];
      pl.rows.forEach((row, reel) => {
        if (reel >= line.count) return;
        const cell = strips[reel].strip.children[spun.stops[reel] + REEL.length + row];
        if (cell) { cell.classList.add('is-won'); cell.style.setProperty('--won', color); }
        const c = cellCenter(reel, row);
        points.push(`${c.x.toFixed(1)},${c.y.toFixed(1)}`);
      });
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      path.setAttribute('points', points.join(' '));
      path.setAttribute('stroke', color);
      path.style.animationDelay = `${n * 120}ms`;
      overlay.appendChild(path);
      glass.querySelectorAll(`.slots-lamp[data-line="${line.id}"]`).forEach((l) => l.classList.add('is-on'));
    });
    // Bonus symbols glow wherever they landed when they opened the bonus.
    if (spun.bonus) spun.windows.forEach((column, reel) => column.forEach((id, row) => {
      if (id !== SCATTER) return;
      const cell = strips[reel].strip.children[spun.stops[reel] + REEL.length + row];
      if (cell) { cell.classList.add('is-won'); cell.style.setProperty('--won', symbolById(SCATTER).color); }
    }));
  };
  const showBanner = async (kind, text, ms) => {
    banner.className = `slots-banner is-${kind}`;
    banner.innerHTML = `<b></b><span></span>`;
    banner.querySelector('b').textContent = text.title;
    banner.querySelector('span').textContent = text.sub ?? '';
    banner.hidden = false;
    await wait(ms);
    banner.hidden = true;
  };
  const coinsFor = (tier) => ({ win: 14, big: 34, mega: 70, jackpot: 130 }[tier] ?? 0);
  const say = (text, tier) => {
    result.textContent = text;
    result.className = `slots-result${tier ? ` is-win is-${tier}` : ''}`;
  };

  /* --- the spin ------------------------------------------------------------ */

  const spin = async () => {
    if (machine.phase !== 'idle') return;
    const cost = SPIN_COST(machine.lineBet);
    if (state.wallet < cost) { synth.playDenied(); toast(t('cantAfford'), 'error'); lever.classList.add('is-poor'); return; }
    machine.phase = 'spinning';
    paintBets();
    say('', null);
    bonusLine.hidden = true;
    clearWins();
    store.saveWallet(state.wallet - cost);
    refreshWallet();
    synth.playArm?.();
    const from = last();
    // Ask the house while the reels are already turning: the answer is in
    // hand long before the first reel has to land.
    const asked = spinSlots(machine.lineBet);
    const rolled = roll(from, from, [700, 700, 700]).then(() => null);
    let spun;
    try {
      spun = await asked;
    } catch (error) {
      // The house did not answer: the coin comes back, nothing is shown.
      await rolled;
      store.saveWallet(store.loadWallet() + cost);
      refreshWallet();
      machine.phase = 'idle';
      paintBets();
      from.forEach((stop, i) => setStrip(i, stop));
      toast(esc(houseError(error)), 'error');
      synth.playDenied();
      return;
    }
    await rolled;
    machine.phase = 'settling';
    await roll(from, spun.stops, REEL_STOP_MS);
    machine.phase = 'paying';
    machine.last = spun;
    const tier = winTier(spun.total, cost);
    if (spun.total > 0) {
      store.saveWallet(store.loadWallet() + spun.total);
      refreshWallet();
      showWins(spun);
      say(t('slotsWon', { amount: formatAmount(spun.total) }), tier);
      rainCoins(coins, coinsFor(tier));
      synth.playCoins?.();
      if (tier === 'jackpot') { synth.playFanfare?.(); await showBanner('jackpot', { title: t('slotsJackpot'), sub: money(spun.total).replace(/<[^>]+>/g, '') }, 2200); }
      else if (tier === 'mega') { synth.playFanfare?.(); await showBanner('mega', { title: t('slotsMega'), sub: formatAmount(spun.total) }, 1700); }
      else if (tier === 'big') await showBanner('big', { title: t('slotsBig'), sub: formatAmount(spun.total) }, 1300);
    } else if (spun.bonus) {
      showWins(spun);
    } else {
      say(t('slotsLost'), null);
    }
    reportQuest('slots', { bet: cost, won: spun.grand > 0, lines: spun.lines, bonus: spun.bonus });

    // THE BONUS: the free spins the house already played, drawn one by one.
    if (spun.bonus) {
      machine.phase = 'bonus';
      synth.playFanfare?.();
      await showBanner('bonus', { title: t('slotsBonusOpen', { n: BONUS_SPINS }) }, 1800);
      bonusLine.hidden = false;
      // The free spins are paid as they land, from one exact sum: rounding
      // each half-coin on its own would pay a coin the book did not.
      const bank = store.loadWallet();
      let paid = 0;
      let at = spun.stops;
      for (let i = 0; i < spun.bonus.spins.length; i++) {
        const free = spun.bonus.spins[i];
        bonusLine.innerHTML = `<b></b><span class="tabular"></span>`;
        bonusLine.querySelector('b').textContent = t('slotsBonusRound', { i: i + 1, n: spun.bonus.spins.length });
        bonusLine.querySelector('span').innerHTML = money(paid);
        clearWins();
        await roll(at, free.stops, BONUS_STOP_MS);
        at = free.stops;
        if (free.total > 0) {
          paid += free.total;
          store.saveWallet(bank + paid);
          refreshWallet();
          showWins({ ...free, bonus: false });
          rainCoins(coins, 10);
          synth.playCoins?.();
          bonusLine.querySelector('span').innerHTML = money(paid);
          await wait(650);
        } else {
          await wait(220);
        }
      }
      machine.last = { ...spun, stops: at };
      bonusLine.querySelector('b').textContent = t('slotsBonusPaid', { amount: formatAmount(paid) });
      const bonusTier = winTier(paid, cost);
      say(t('slotsWon', { amount: formatAmount(spun.grand) }), bonusTier ?? tier);
      if (paid > 0) await showBanner(bonusTier === 'jackpot' || bonusTier === 'mega' ? 'mega' : 'big', { title: t('slotsBonusDone'), sub: formatAmount(paid) }, 1500);
    }
    if (spun.grand > 0) reportQuest('points', { amount: Math.round(spun.grand), game: 'slots' });
    await wait(300);
    machine.phase = 'idle';
    paintBets();
  };
  lever.addEventListener('click', spin);
  paintBets();
}

/* --- quests --------------------------------------------------------------------------------- */

function renderQuests() {
  el.questsTitle.textContent = t('tabQuests');
  el.questsSub.textContent = t('questsIntro');
  const paint = (board) => {
    const rows = quests.describe(board);
    const list = document.createElement('div');
    list.className = 'quests';
    list.replaceChildren(...rows.map((row) => {
      const tier = QUEST_TIERS[row.quest.tier];
      const card = document.createElement('div');
      card.className = `quest${row.progress >= row.target ? ' is-done' : ''}${row.claimed ? ' is-claimed' : ''}`;
      card.style.setProperty('--tier', tier.color);
      const rewardBits = [money(row.quest.reward.money)];
      if (row.quest.reward.booster) rewardBits.push(esc(specName(row.quest.reward.booster)));
      card.innerHTML = `
        <div class="quest-head"><b></b><span class="quest-tier"></span></div>
        <div class="quest-bar"><i style="width:${Math.round(100 * Math.min(1, row.progress / row.target))}%"></i></div>
        <div class="quest-foot"><span class="tabular">${row.progress} / ${row.target}</span><span class="quest-reward">${rewardBits.join(' + ')}</span></div>`;
      card.querySelector('b').textContent = tx(row.quest.name);
      card.querySelector('.quest-tier').textContent = tx(tier.name);
      if (row.claimed) {
        const tag = document.createElement('span');
        tag.className = 'game-closed';
        tag.textContent = t('questClaimed');
        card.appendChild(tag);
      } else if (row.progress >= row.target) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-primary';
        btn.textContent = t('questClaim');
        press(btn, { sound: null });
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const reward = await quests.claim(row.id, questUserKey());
            if (reward.money) { store.saveWallet(store.loadWallet() + reward.money); refreshWallet(); }
            if (reward.booster) gainBooster({ ...reward.booster }, 1);
            synth.playPurchase();
            toast(esc(t('questPaid', { name: tx(row.quest.name) })), 'ok');
            renderQuests();
            paintDrawerLinks();
          } catch (error) {
            btn.disabled = false;
            const code = String(error?.message ?? '');
            toast(esc(code === 'CLAIMED' ? t('questClaimed') : code === 'NOT_DONE' ? t('questNotDone') : houseError(error)), 'error');
            synth.playDenied();
          }
        });
        card.appendChild(btn);
      }
      return card;
    }));
    const reset = document.createElement('p');
    reset.className = 'quests-reset';
    const tick = () => { reset.textContent = t('questsReset', { time: formatCountdown(quests.msToReset(board)) }); };
    tick();
    clearInterval(state.questsTimer);
    state.questsTimer = setInterval(() => {
      if (state.tab !== 'quests') { clearInterval(state.questsTimer); return; }
      if (quests.msToReset(board) <= 0) { renderQuests(); return; }
      tick();
    }, 1000);
    el.questsBody.replaceChildren(list, reset);
    reveal(list.children, { step: 60 });
  };
  paint(quests.loadBoard(questUserKey()));
  // Signed in, the server's deal is the deal: fetched in the background, painted when it comes.
  if (signedIn()) quests.syncBoard(questUserKey()).then((board) => { if (state.tab === 'quests') paint(board); }).catch(() => { /* the device's board stands */ });
}

/* --- the leaderboard --------------------------------------------------------------------------- */

let leaderboardSeg = null;
function renderLeaderboard() {
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

async function loadLeaderboard() {
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
  const list = document.createElement('div');
  list.className = 'leaderboard';
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
  if (!view.rows.length) list.appendChild(gameStage('podium', t('lbEmpty')));
  else list.replaceChildren(...view.rows.map((r) => rowNode(r)));
  const reset = document.createElement('p');
  reset.className = 'lb-reset';
  const ms = leaderboard.msToReset(view.window);
  reset.textContent = ms == null ? t('lbForever') : t('lbReset', { time: formatCountdown(ms) });
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
  starters.forEach((spec) => gainBooster(spec, 1));
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
  el.oddsBtn.setAttribute('aria-label', t('pullRates'));
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

/**
 * Cards in the wrong language, swapped for the real thing.
 *
 * Draws are language-locked now, but a collection built before that still
 * holds English cards in a French binder and the other way round. Each one
 * is looked up through its article's interlanguage links and rebuilt around
 * the translated page, keeping its copies, its favourite star and the date
 * it was first pulled. An article with no version in that language is left
 * exactly where it is and never asked about again.
 */
const NO_TWIN_KEY = 'wikster.noTranslation.v1';
/** At most this many per launch, and never longer than the budget below. */
const MIGRATE_PER_LAUNCH = 40;
const MIGRATE_BUDGET_MS = 20000;

function loadNoTwin() {
  try {
    const list = JSON.parse(localStorage.getItem(NO_TWIN_KEY) ?? '[]');
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

function saveNoTwin(set) {
  // Only the most recent few hundred matter; the list is a courtesy, not a record.
  try { localStorage.setItem(NO_TWIN_KEY, JSON.stringify([...set].slice(-400))); }
  catch { /* storage unavailable */ }
}

async function migrateLanguages() {
  if (!navigator.onLine) return;
  const lang = getLanguage();
  const skip = loadNoTwin();
  // Keyed by the language we were looking for: an article with no French
  // twin may still have an English one, so switching language asks again.
  const skipKey = (entry) => `${lang}:${entry.key}`;
  const stale = Object.values(state.collection.entries ?? {})
    .filter((entry) => (entry.lang ?? 'en') !== lang && !skip.has(skipKey(entry)))
    .slice(0, MIGRATE_PER_LAUNCH);
  if (!stale.length) return;

  const deadline = Date.now() + MIGRATE_BUDGET_MS;
  let moved = 0;
  for (let i = 0; i < stale.length; i += 3) {
    if (Date.now() > deadline || !navigator.onLine) break;
    const batch = stale.slice(i, i + 3);
    const results = await Promise.all(batch.map((entry) =>
      translateCard(entry, lang).catch(() => null)));
    batch.forEach((entry, n) => {
      const card = results[n];
      if (!card) { skip.add(skipKey(entry)); return; }
      if (store.replaceEntryWithTranslation(state.collection, entry, card, lang)) moved++;
    });
  }
  saveNoTwin(skip);
  if (!moved) return;
  regradeCollection();
  if (state.tab === 'binder') renderBinder();
  toast(t('langMigrated', { n: moved }), 'ok');
}

/*
 * Cards from a secret code that were drawn from the wrong place.
 *
 * A code names five exact things, and some of them do not live on Wikipedia:
 * the Tardigrades CARD in Terraforming Mars, the neurotoxin turret, Sparkle.
 * An older build lost the name of the wiki on the way to the draw and read
 * the encyclopaedia article of the same name instead, so those collections
 * hold the real animal. A card cannot be pulled again once it is owned, so
 * the fix has to reach into what people already have: each one is redrawn
 * from the right source and swapped in, keeping the copies, the star, the
 * date and the album it belongs to.
 *
 * The same pass gives a picture to the ones that never got one.
 */
const SPECIAL_FIX_KEY = 'wikster.specialCards.v2';

/** A picture that is really just the booster's colour with a name on it. */
const isPlate = (src) => !src || String(src).startsWith('data:image/svg');

async function migrateSpecialCards() {
  if (!navigator.onLine) return;
  try { if (localStorage.getItem(SPECIAL_FIX_KEY) === 'done') return; } catch { /* storage unavailable */ }
  const owned = Object.values(state.collection.entries ?? {}).filter((entry) => entry.special && !entry.creator);
  let fixed = 0;
  let missed = 0;
  const deadline = Date.now() + MIGRATE_BUDGET_MS;
  for (const entry of owned) {
    if (Date.now() > deadline || !navigator.onLine) { missed++; break; }
    const want = codeCardFor(entry.special, entry);
    if (!want) continue;
    // Wrong source: the card names a wiki and was read off Wikipedia.
    const wrongSource = Boolean(want.wiki || want.wikiUrls) && !String(entry.sourceId ?? '').startsWith('wiki:');
    const noPicture = isPlate(entry.thumbnail);
    if (!wrongSource && !noPicture) continue;
    const card = await refreshTitleCard(want, {
      special: entry.special,
      fallbackArt: codeLook(codeById(entry.special)).accent
    }).catch(() => null);
    if (!card) { missed++; continue; }
    // A card that is merely missing its picture is not replaced by another
    // card with no picture: nothing was gained, and the entry stays as it is
    // so a later launch can try again.
    if (!wrongSource && isPlate(card.thumbnail)) { missed++; continue; }
    if (store.replaceSpecialCard(state.collection, entry, card)) fixed++;
  }
  // Only stop asking once there is nothing left that a better connection
  // could still repair.
  if (!missed) { try { localStorage.setItem(SPECIAL_FIX_KEY, 'done'); } catch { /* storage unavailable */ } }
  if (!fixed) return;
  regradeCollection();
  if (userId()) account.pushSave(userId()).catch(() => {});
  if (state.tab === 'binder') { if (state.album) renderAlbum(); else renderBinder(); }
  toast(t('specialFixed', { n: fixed }), 'ok');
}

/*
 * Wikipedia cards graded while their readership request failed.
 *
 * Rarity is readership, and readership used to come from a second request
 * per card that timed out whenever the connection was slow. A card whose
 * request failed was stamped Common (its popularity fell back to the word
 * count, which the draw never had) and stored that way for good: a Legendary
 * pack under a bad connection dealt five Commons. Those cards are recognised
 * by having no readership on record, asked about twenty at a time, and
 * re-graded to the tier the page has always deserved. Cards from other wikis
 * have no readership to ask about and are left alone.
 */
const VIEWS_FIX_KEY = 'wikster.viewsRepair.v1';

async function migrateViews() {
  if (!navigator.onLine) return;
  try { if (localStorage.getItem(VIEWS_FIX_KEY) === 'done') return; } catch { /* storage unavailable */ }
  const byLang = new Map();
  for (const entry of Object.values(state.collection.entries ?? {})) {
    if (entry.special || entry.views != null) continue;
    const source = String(entry.sourceId ?? '');
    if (!source.startsWith('wikipedia:')) continue;
    const lang = source.slice('wikipedia:'.length) || 'en';
    if (!byLang.has(lang)) byLang.set(lang, []);
    byLang.get(lang).push(entry);
  }
  let fixed = 0;
  let missed = 0;
  for (const [lang, entries] of byLang) {
    // Sixty cards a launch, three requests: the rest wait for the next one.
    const batch = entries.slice(0, 60);
    if (batch.length < entries.length) missed++;
    const views = await fetchViewsFor(batch.map((entry) => entry.title), lang).catch(() => null);
    if (!views) { missed++; continue; }
    for (const entry of batch) {
      const n = views.get(entry.title);
      // A page with no readership at all is a real answer: leave it be.
      if (n == null) continue;
      entry.views = n;
      entry.popularity = popularityFromViews(n);
      fixed++;
    }
  }
  if (!missed) { try { localStorage.setItem(VIEWS_FIX_KEY, 'done'); } catch { /* storage unavailable */ } }
  if (!fixed) return;
  store.saveCollection(state.collection);
  const regraded = regradeCollection();
  if (userId()) account.pushSave(userId()).catch(() => {});
  if (!regraded) return;
  if (state.tab === 'binder') { if (state.album) renderAlbum(); else renderBinder(); }
  toast(t('viewsRepaired', { n: regraded }), 'ok');
}

/*
 * The update bar.
 *
 * Two builds of different ages sign into the same account: the site the
 * moment it is published, an APK's bundled copy when it is opened offline,
 * a tab left open for days, a copy of the site left on another host for as
 * long as it stands. The bar is how a build finds out it is old, and it says
 * what that costs: an old build keeps playing but stops writing the
 * account's save (src/account.js). The way out is always one reload.
 */
let updateBar = null;

function showUpdateBar(why, latest = null) {
  if (!updateBar) {
    updateBar = document.createElement('div');
    updateBar.className = 'update-bar';
    updateBar.setAttribute('role', 'status');
    document.body.appendChild(updateBar);
  }
  // The APK opens the published site too, so the newest build is always one
  // reload away: the site reloads, the bundled offline copy hands over.
  const text = why === 'outdated' ? t('syncOutdated') : t('updateWeb');
  const action = `<button type="button" class="btn btn-primary" data-act="reload">${esc(t('updateReload'))}</button>`;
  updateBar.innerHTML = `<p>${esc(text)}</p>${action}<button type="button" class="btn btn-ghost" data-act="later">${esc(t('updateLater'))}</button>`;
  updateBar.querySelector('[data-act="reload"]').addEventListener('click', goToLatest);
  updateBar.querySelector('[data-act="later"]').addEventListener('click', () => { updateBar.hidden = true; });
  updateBar.hidden = false;
  updateBar.dataset.latest = latest?.sha ?? '';
}

/** Ask the published site whether it is newer than this build: at most every half hour. */
let lastUpdateLook = 0;
async function lookForUpdate() {
  if (!navigator.onLine || Date.now() - lastUpdateLook < 30 * 60 * 1000) return;
  lastUpdateLook = Date.now();
  const latest = await checkForUpdate();
  if (!latest) return;
  console.info(`Wikster ${BUILD.sha}: a newer build (${latest.sha}) is published`);
  showUpdateBar('update', latest);
}

/* --- wiring ------------------------------------------------------------------------------------------------------------ */

/**
 * The collection, priced. The print is the card's own and is never touched
 * here; a card written before prints existed, with no tier on it, is graded
 * once from its fame so it comes up with a tier at all. Prices follow fame
 * and print, and the profile's per-rarity tallies are rebuilt to match what
 * is owned.
 */
function regradeCollection() {
  let changed = 0;
  for (const entry of Object.values(state.collection.entries ?? {})) {
    // A special card keeps its tier for good.
    if (entry.special) { if (entry.rarityId !== SPECIAL_RARITY_ID) { entry.rarityId = SPECIAL_RARITY_ID; changed++; } continue; }
    let pop = entry.popularity;
    if (!Number.isFinite(pop)) {
      pop = Number.isFinite(entry.views) && entry.views > 0
        ? popularityFromViews(entry.views)
        : popularityFromWordCount(entry.wordCount);
      entry.popularity = pop;
    }
    const rarity = entry.rarityId ? rarityById(entry.rarityId) : rarityFromPopularity(pop);
    const price = priceFor(pop, rarity);
    if (entry.rarityId !== rarity.id || entry.price !== price) {
      entry.rarityId = rarity.id;
      entry.price = price;
      changed++;
    }
  }
  if (!changed) return 0;
  const counts = {};
  for (const entry of Object.values(state.collection.entries ?? {})) {
    counts[entry.rarityId] = (counts[entry.rarityId] ?? 0) + Math.max(1, entry.count ?? 1);
  }
  state.profile.rarityCounts = counts;
  store.saveCollection(state.collection);
  store.saveProfile(state.profile);
  return changed;
}

function init() {
  // The idle open screen carries a live connection warning, so it follows the
  // connection rather than whatever was true when the screen was built.
  window.addEventListener('online', paintOpenHint);
  window.addEventListener('offline', paintOpenHint);
  // The rail swallows the drawer on a wide screen, and hands it back on a
  // narrow one, including when a window is dragged across the threshold.
  // Built here rather than on first open, because on a wide screen there is no
  // button left to open it with: the rail IS it, so it has to exist from the
  // start rather than the first time somebody reaches for a menu.
  buildDrawer();
  WIDE.addEventListener('change', () => { buildDrawer(); });

  // A special theme belongs to whoever redeemed its code. A save that lost
  // the code (an erased save, a transfer that went the other way) wakes up
  // in the default theme rather than one it has no right to.
  const wanted = themeById(storedTheme());
  if (wanted.code && !hasRedeemed(state.profile, wanted.code)) {
    try { localStorage.setItem(THEME_KEY, DEFAULT_THEME); } catch { /* session only */ }
  }
  useTheme(storedTheme());
  el.splashMark.innerHTML = logoSvg({ size: 78 });
  backdrop.mount(el.backdrop).setTheme(storedTheme());

  // Cards without a picture no longer exist: draws refuse them now, and any
  // already in the collection are swept out once here.
  // A custom pack that goes missing takes its shop shelf with it, and the
  // player rebuilds it: two packs, two albums, one subject. Put back
  // whatever the collection still remembers, and collapse the duplicates.
  // An open that never finished (a lost connection, a phone that killed the
  // app mid-tear) gets its booster back rather than eating it.
  const owed = store.reclaimOpenInFlight(state.inventory);
  if (owed) setTimeout(() => toast(t('openRecovered', { name: specName(owed) }), 'ok'), 2400);

  const healed = store.healCustomPacks(state.collection);
  if (healed) state.customPacks = store.loadCustomPacks();

  const pruned = store.pruneImagelessCards(state.collection);
  if (pruned) console.info(`Removed ${pruned} pictureless card(s) from the collection`);

  // A withdrawn code leaves nothing behind, before anything else looks at
  // the collection.
  purgeRetiredCodes();
  // Prices follow fame and print; a card from before prints existed gets its
  // tier here. Silent on purpose: it runs on every launch and changes
  // nothing on a save that is already right.
  regradeCollection();

  // Cards in the wrong language are swapped for their translation in the
  // background, a few at a time, so launch is never held up by the network.
  setTimeout(migrateLanguages, 3200);
  // Special cards drawn from the wrong wiki are repaired in the same spirit:
  // in the background, after launch, and never more than once when it works.
  setTimeout(migrateSpecialCards, 1600);
  // Cards graded while their readership request failed are re-graded from
  // the readership they actually have. Same spirit: background, budgeted.
  setTimeout(migrateViews, 5200);
  // Whether a newer build is out: asked once at launch, and again whenever
  // the app comes back to the foreground after a while away.
  setTimeout(lookForUpdate, 4000);
  setTimeout(warmDrawer, 2500);
  sayWipeNote();
  // The arcade's back buttons, and the quests' chip in the drawer.
  el.wikdleBack.addEventListener('click', () => { synth.playTap(); showScreen('games'); });
  el.slotsBack.addEventListener('click', () => { synth.playTap(); showScreen('games'); });
  quests.onQuestsChange(() => paintDrawerLinks());
  reportAlbums();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') lookForUpdate();
  });

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

  // The rail exists now, so the drawer's list has somewhere to be moved to.
  // Called here as well as from buildDrawer because that runs before the
  // NavBar is constructed, and a rail that does not exist yet cannot be
  // filled.
  placeDrawerLinks();

  applySettings();
  applyStrings();
  refreshWallet();
  refreshLevelBadge();
  updateBadges();
  initSwipe();
  tilt.init();

  renderPacks();
  renderShop();
  renderBinder();
  // Pack art is language-specific, so it waits until a language exists.

  [el.wallet, el.menuBtn, el.bell, el.giftBtn, el.levelBadge, el.packsOpen, el.timedOpen,
   el.filterOpen, el.openBack, el.openDone, el.sheetClose, el.starterGo,
   el.packsEmptyCta, el.creatorGo, el.findGo, el.friendBack,
   el.friendRemove, el.gateAlt, el.oddsBtn, el.albumBack, el.chatBack, el.quizBack].forEach((node) => press(node));

  el.wallet.addEventListener('click', openWallet);
  el.bell.addEventListener('click', openNotifications);
  el.giftBtn.addEventListener('click', () => openDaily());
  el.menuBtn.addEventListener('click', () => (el.drawer.hidden ? openDrawer() : closeDrawer()));
  el.drawerScrim.addEventListener('click', closeDrawer);
  el.levelBadge.addEventListener('click', () => { renderProfile(); showScreen('profile'); });

  el.oddsIcon.innerHTML = iconSvg('gem', { size: 15 });
  // Wrapped: passed straight, the click event would arrive as the rarity.
  // The sheet shows the row for the booster on the open screen when there is
  // one, and the basic row while browsing.
  el.oddsBtn.addEventListener('click', () => {
    const onOpen = el.openScreen?.classList.contains('is-active');
    openOdds(onOpen ? (state.spec?.rarityId ?? null) : null);
  });
  el.marketSell.addEventListener('click', () => { synth.playTap(); openSellSheet(); });
  press(el.marketSell, { sound: null });
  document.querySelectorAll('.help-btn').forEach((button) => {
    press(button, { sound: null });
    button.addEventListener('click', () => { synth.playTap(); openHelp(button.dataset.help); });
  });
  el.filterOpen.addEventListener('click', openFilters);
  el.classicFilter.addEventListener('click', openFilters);
  el.quizBack.addEventListener('click', leaveQuiz);
  // Scrolling is the one moment the backdrop must get out of the way.
  document.getElementById('app')?.addEventListener('scroll', () => backdrop.markBusy(), { passive: true });
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
  el.creatorInput.addEventListener('input', () => paintForgeSeal(el.creatorInput.value));

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
  // Autoplay rules: music may only start inside a gesture, so every tap
  // offers it the chance. A playing track makes this a no-op.
  // Prime the first track while the splash is still up, then try to play at
  // once: the APK allows it outright, and a browser that holds out for a
  // gesture is caught by the listeners below rather than waiting for a tap
  // that may be seconds away.
  music.prime();
  music.poke();
  for (const gesture of ['pointerdown', 'keydown', 'touchstart']) {
    document.addEventListener(gesture, () => music.poke(), { passive: true });
  }

  document.addEventListener('visibilitychange', () => {
    const visible = document.visibilityState === 'visible';
    if (visible) {
      visibleSince = Date.now();
      syncTimed();
      updateBadges();
      music.unpark();
      // Coming back is the natural moment to retry anything that did not land,
      // and to pick up what happened while the app was away.
      resumeAccount();
    } else {
      stopSocialPoll();
      flushPlaytime();
      visibleSince = null;
      synth.suspend();
      music.park();
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
 * was before accounts existed - local, and honest about it in Settings.
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
let binderSeg;
init();

window.__wikster = {
  state, store, debug, RARITIES, synth, music, backdrop, THEMES, THEME_PACKS, regrade: regradeCollection,
  codeByInput,
  draw: drawArticles, generateShop, syncSocial, drawCaps: drawCapsFor, drawPack: toDrawPack, odds, specId,
  setTheme: (id) => { useTheme(id); renderPacks(); renderShop(); renderBinder(); renderCustomize(); },
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
  giveBooster(spec) { gainBooster(spec, 1); renderPacks(); },
  giveTimed(n = 5) { state.profile.timed.count += n; store.saveProfile(state.profile); renderTimed(); updateBadges(); },
  addXp(amount = 5000) {
    const levels = addXp(state.profile.progress, amount);
    if (levels.length) state.profile.pendingLevels.push(...levels);
    store.saveProfile(state.profile);
    refreshLevelBadge();
    drainLevelUps();
    return state.profile.progress;
  },
  timedTopTier,
  resetAll: wipeEverything
};
