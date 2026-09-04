/* core: split out of main.js */

import * as store from '../collection.js';
import { DEFAULT_FRAME_STYLE } from '../frames.js';
import { buckSvg, iconSvg } from '../data/icons.js';
import { formatAmount, popularityFromViews } from '../pricing.js';
import { DEFAULT_THEME, applyTheme } from '../ui/themes.js';
import { backdrop } from '../ui/backdrop.js';
import { synth } from '../ui/sound.js';
import { getLanguage, t } from '../i18n.js';
import { fetchViewsFor, refreshTitleCard, translateCard } from '../wiki.js';
import { codeById, codeCardFor, codeLook } from '../codes.js';
import * as account from '../account.js';
import { BUILD, checkForUpdate, goToLatest } from '../version.js';
import { reportQuest } from './arcade.js';
import { renderAlbum, renderBinder } from './binder.js';
import { regradeCollection } from './boot.js';
import { paintDrawerLinks } from './drawer.js';
import { showGate, userId } from './gate.js';
import { live } from './live.js';
import { tickTimed } from './packs.js';
import { holdWakeLock, releaseWakeLock } from './settings.js';
import { tickRestock } from './shop.js';
import { closeChatWire } from './social.js';

/* --- tuning ---------------------------------------------------------------- */

export const RIP_COMMIT = 0.62;

export const RIP_TICK_STEP = 0.055;

export const RIP_LOCK_SLOP = 10;

export const SWIPE_COMMIT = 78;

export const EMERGE_STAGGER = 130;

export const EMERGE_DURATION = 820;
/** Nothing waits on the network longer than this before the booster comes back. */

export const DRAW_HARD_LIMIT = 18000;

export const PREFETCH_DELAY = 350;
/** How long the last card stays up before the summary takes over. */

export const LAST_CARD_HOLD = 2000;

export const TILT_REACH = 110;
 // pixels of drag for a full lean

export function $(sel) {
  return (document.querySelector(sel));
}

export function clamp(n, lo, hi) {
  return (Math.min(hi, Math.max(lo, n)));
}

export function clamp01(n) {
  return (clamp(n, 0, 1));
}

export function wait(ms) {
  return (new Promise((r) => setTimeout(r, ms)));
}

export function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const THEME_KEY = 'wikster.theme';

export const RIP_DIR_KEY = 'wikster.ripDirection';
/* --- state ----------------------------------------------------------------- */

export const state = {
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
  friendView: 'albums',                 // how a friend's cards are laid out

  // Who is signed in, and what the server last told us about them.
  account: { session: null, profile: null, mode: 'signin', syncing: false, syncedAt: null, failed: false },
  // The friends screen, and whichever friend is being looked at.
  social: { friends: [], incoming: [], outgoing: [], results: [], loaded: false, unread: new Map(), trades: [] },
  viewing: null
};
/** Test-only switches, reachable through window.__wikster. */

export const debug = { failNextOpen: false };

export function settings() {
  return (state.profile.settings);
}

export function money(amount) {
  return (`${buckSvg({ size: 12 })}${formatAmount(amount)}`);
}
/** For the few places that put a value into markup rather than textContent. */

export function esc(value) {
  return (String(value ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
}
/* --- elements --------------------------------------------------------------- */

export const el = {};

export function bind(map) {
  return (Object.assign(el, map));
}

live.nav = undefined;
live.sheet = undefined;
live.walletOdo = undefined;
live.levelRing = undefined;
live.profileRing = undefined;
live.xpBar = undefined;
live.trackBar = undefined;
live.packsSeg = undefined;
live.gateSeg = undefined;
live.friendRing = undefined;
live.freeRing = undefined;
/* --- the one timer ----------------------------------------------------------- */

/**
 * Everything that needs a clock shares one interval, and it only runs when the
 * document is visible AND a screen that wants it is on display. A 1 Hz timer
 * left running in the background is the cheapest way to warm a phone up for
 * nothing.
 */

export const ticker = { id: null, jobs: new Map() };

export function runTicker() { for (const job of ticker.jobs.values()) job(); }

export function setTickerJob(name, job) {
  if (job) ticker.jobs.set(name, job);
  else ticker.jobs.delete(name);
  syncTicker();
}

export function syncTicker() {
  const wanted = document.visibilityState === 'visible' && ticker.jobs.size > 0;
  if (wanted && ticker.id == null) ticker.id = setInterval(runTicker, 1000);
  if (!wanted && ticker.id != null) { clearInterval(ticker.id); ticker.id = null; }
}
/* --- playtime ---------------------------------------------------------------- */

live.visibleSince = document.visibilityState === 'visible' ? Date.now() : null;

export let playtimeCarry = 0;

export function flushPlaytime() {
  if (live.visibleSince == null) return;
  const ms = Date.now() - live.visibleSince;
  store.addPlaytime(state.profile, ms);
  live.visibleSince = Date.now();
  // Whole minutes reach the day's quests; the remainder waits for the next flush.
  playtimeCarry += ms;
  const minutes = Math.floor(playtimeCarry / 60000);
  if (minutes > 0) { playtimeCarry -= minutes * 60000; for (let i = 0; i < minutes; i++) reportQuest('playtime'); }
}
/* --- toast -------------------------------------------------------------------- */

/** 6,912,930 reads as 6.9M: album totals are real category sizes now. */

export function compactCount(n) {
  if (!Number.isFinite(n)) return '?';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
/**
 * The small word at the bottom of the screen: a mark for the kind of news,
 * the news itself, and a bar that drains while it is shown. A tap sends it
 * away early; a new one replaces the old on the spot.
 */

export const TOAST_MARKS = { ok: 'check', error: 'close', bought: 'gem', info: 'bell' };

export function toast(markup, kind = 'ok') {
  const node = el.toast;
  if (!node.dataset.bound) {
    node.dataset.bound = '1';
    node.addEventListener('click', () => node.classList.remove('is-showing'));
  }
  node.hidden = false;
  node.className = `toast is-${kind}`;
  node.innerHTML = `<span class="toast-mark" aria-hidden="true">${iconSvg(TOAST_MARKS[kind] ?? 'check', { size: 15 })}</span><span class="toast-text">${markup}</span><i class="toast-bar" aria-hidden="true"></i>`;
  void node.offsetWidth;   // restart the entrance and the bar
  node.classList.add('is-showing');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.classList.remove('is-showing'); }, 3200);
}
/* --- theming -------------------------------------------------------------------- */

export function storedTheme() {
  try { return localStorage.getItem(THEME_KEY) ?? DEFAULT_THEME; } catch { return DEFAULT_THEME; }
}
/**
 * Switch theme. The document attribute repaints every token; the backdrop and
 * the synthesiser are told separately because neither lives in CSS.
 */

export function useTheme(id, { announce = false } = {}) {
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

export const SCREEN_TITLES = {
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

export const WIDE = matchMedia('(min-width: 1024px)');

export function placeDrawerLinks() {
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

export function showScreen(name) {
  Object.entries(el.screens).forEach(([key, node]) => node.classList.toggle('is-active', key === name));
  if (name !== 'open') {
    state.tab = name;
    live.nav?.select(navTabFor(name), { silent: true });
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
  if (name !== 'chat' && live.chatTimer) { clearInterval(live.chatTimer); live.chatTimer = null; }
  if (name !== 'chat') closeChatWire();
  // #app is the scroll container now, not the document.
  document.getElementById('app')?.scrollTo({ top: 0 });
}
/**
 * Settings and Friends have no destination of their own; both hang off the
 * Profile, so the bottom bar stays at five.
 */

export function navTabFor(screen) {
  return (screen === 'market' ? 'shop'
    : screen === 'cardindex' ? 'binder'
      : screen === 'glossary' ? 'packs'
        : ['wikdle', 'slots'].includes(screen) ? 'games'
          : (['settings', 'customize', 'badges', 'friends', 'friend', 'chat', 'ach', 'updates', 'quiz', 'games', 'quests', 'leaderboard'].includes(screen) ? 'profile' : screen));
}

export function refreshWallet() {
  state.wallet = store.loadWallet();
  live.walletOdo.set(state.wallet);
  if (el.shopPurse) el.shopPurse.innerHTML = money(state.wallet);
  el.wallet.setAttribute('aria-label', `${t('walletTitle')}: ${formatAmount(state.wallet)}`);
}
/* --- the sheet ------------------------------------------------------------------------------------ */

/**
 * Every panel in the app is this one component: the wallet, the odds, the
 * card, the filters, the daily board, a level-up. One sheet means one set of
 * gestures, one entrance, one dismissal, and no dialog anywhere that behaves
 * unlike the others.
 */

export function openSheet(title, build, { dismissible = true, onClose = null } = {}) {
  el.sheetTitle.textContent = title;
  el.sheetClose.hidden = !dismissible;
  el.sheetBody.replaceChildren();
  build(el.sheetBody);
  live.sheet.show(onClose, { locked: !dismissible });
  el.sheet.classList.toggle('is-locked', !dismissible);
}
/* --- strings --------------------------------------------------------------------------------------------------------- */

export function applyStrings() {
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

  live.nav?.setLabels({
    packs: t('tabBoosters'), timed: t('tabTimed'), shop: t('tabShop'),
    binder: t('tabCollection'), profile: t('tabProfile')
  });
  live.packsSeg?.relabel([{ label: t('owned') }, { label: t('tabCustom') }]);
  live.gateSeg?.relabel([{ label: t('gateSignIn') }, { label: t('gateSignUp') }]);
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

export const NO_TWIN_KEY = 'wikster.noTranslation.v1';
/** At most this many per launch, and never longer than the budget below. */

export const MIGRATE_PER_LAUNCH = 40;

export const MIGRATE_BUDGET_MS = 20000;

export function loadNoTwin() {
  try {
    const list = JSON.parse(localStorage.getItem(NO_TWIN_KEY) ?? '[]');
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

export function saveNoTwin(set) {
  // Only the most recent few hundred matter; the list is a courtesy, not a record.
  try { localStorage.setItem(NO_TWIN_KEY, JSON.stringify([...set].slice(-400))); }
  catch { /* storage unavailable */ }
}

export async function migrateLanguages() {
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

export const SPECIAL_FIX_KEY = 'wikster.specialCards.v2';
/** A picture that is really just the booster's colour with a name on it. */

export function isPlate(src) {
  return (!src || String(src).startsWith('data:image/svg'));
}

export async function migrateSpecialCards() {
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

export const VIEWS_FIX_KEY = 'wikster.viewsRepair.v1';

export async function migrateViews() {
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

export let updateBar = null;

export function showUpdateBar(why, latest = null) {
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

export let lastUpdateLook = 0;

export async function lookForUpdate() {
  if (!navigator.onLine || Date.now() - lastUpdateLook < 30 * 60 * 1000) return;
  lastUpdateLook = Date.now();
  const latest = await checkForUpdate();
  if (!latest) return;
  console.info(`Wikster ${BUILD.sha}: a newer build (${latest.sha}) is published`);
  showUpdateBar('update', latest);
}
