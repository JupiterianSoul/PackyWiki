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

import { THEME_PACKS, themeById as packById, heroTitles } from './data/packs.js';
import { RARITIES, rarityById, rarityRank, rollRarity, oddsTable, rarityChances } from './data/rarities.js';
import { iconSvg, logoSvg, buckSvg } from './data/icons.js';
import { drawArticles, resolveCustomWiki, fetchPackArt, fetchCustomPackArt } from './wiki.js';
import { priceFor, formatAmount, formatViews, bandFor, POPULARITY_BANDS } from './pricing.js';
import {
  boosterPrice, rollOptionsFor, sellPriceFor, nextRefreshAt, windowIndexAt,
  nextFreeAt, freeWindowAt, STARTER_PACKS, STARTER_PACK_CARDS, STARTER_COINS
} from './economy.js';
import { generateShop, formatCountdown } from './shop.js';
import {
  specId, specName, specTagline, specColours, specIcon, specHero, toDrawPack
} from './booster.js';
import * as store from './collection.js';
import {
  MAX_LEVEL, xpForCard, xpForLevel, rankFor, rewardForLevel, addXp, levelFraction
} from './progression.js';
import {
  generateBoard, canClaim, claim as claimDaily, nextIndex as nextGiftIndex,
  msUntilNextDay, dayNumber
} from './daily.js';
import {
  MAX_TIMED_LEVEL, accrue, msToNext, timedLevel, timedSpec, maxHeld, regenMs,
  levelBounds, levelProgress, timedRollOptions
} from './timed.js';
import { t, tx, getLanguage, setLanguage, languageChosen, LANGUAGES } from './i18n.js';
import { exportSave, importSave, describeSave, parseSave, copyText, readText } from './save.js';

import { THEMES, DEFAULT_THEME, applyTheme, themeById } from './ui/themes.js';
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
const EMERGE_STAGGER = 110;
const EMERGE_DURATION = 820;
const PREFETCH_DELAY = 350;
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
  spec: null,
  customPacks: store.loadCustomPacks(),
  collection: store.loadCollection(),
  inventory: store.loadInventory(),
  profile: store.loadProfile(),
  wallet: store.loadWallet(),
  art: new Map(),
  ripDir: Number(localStorage.getItem?.(RIP_DIR_KEY)) || 0,
  prefetch: null,
  prefetchTimer: null,
  busy: false,
  pulls: [], cards: [], index: 0, seen: new Set(),
  detail: null,
  packSlots: [],
  filters: { search: '', pack: '', rarity: '', band: '', minPrice: '', sort: 'recent', favoritesOnly: false }
};

const settings = () => state.profile.settings;
const money = (amount) => `${buckSvg({ size: 12 })}${formatAmount(amount)}`;

/* --- elements --------------------------------------------------------------- */

const el = {};
const bind = (map) => Object.assign(el, map);
bind({
  screens: {
    packs: $('#screen-packs'), timed: $('#screen-timed'), shop: $('#screen-shop'),
    binder: $('#screen-binder'), profile: $('#screen-profile'),
    settings: $('#screen-settings'), open: $('#screen-open')
  },
  backdrop: $('#backdrop'), navbar: $('#navbar'),
  levelBadge: $('#level-badge'), appbarTitle: $('#appbar-title'), appbarSub: $('#appbar-sub'),
  wallet: $('#wallet'), walletMark: $('#wallet-mark'), walletAmount: $('#wallet-amount'),
  gift: $('#gift'), giftIcon: $('#gift-icon'), giftDot: $('#gift-dot'),

  packsSeg: $('#packs-seg'), packsRail: $('#packs-rail'), packsCaption: $('#packs-caption'),
  packsName: $('#packs-name'), packsSub: $('#packs-sub'), packsOwn: $('#packs-own'),
  packsActions: $('#packs-actions'), packsOpen: $('#packs-open'), packsHint: $('#packs-hint'),
  packsEmpty: $('#packs-empty'), packsEmptyMark: $('#packs-empty-mark'),
  packsEmptyText: $('#packs-empty-text'), packsEmptyCta: $('#packs-empty-cta'),
  creator: $('#creator'), creatorLabel: $('#creator-label'), creatorNote: $('#creator-note'),
  creatorInput: $('#creator-input'), creatorGo: $('#creator-go'), creatorStatus: $('#creator-status'),

  timedTitle: $('#timed-title'), timedIntro: $('#timed-intro'), timedPack: $('#timed-pack'),
  timedCount: $('#timed-count'), timedNext: $('#timed-next'), timedOpen: $('#timed-open'),
  trackLevel: $('#track-level'), trackRemaining: $('#track-remaining'), trackBar: $('#track-bar'),
  trackPerks: $('#track-perks'), trackNext: $('#track-next'),

  shopTitle: $('#shop-title'), shopIntro: $('#shop-intro'), restock: $('#restock'), shopRows: $('#shop-rows'),

  binderTitle: $('#binder-title'), binderStats: $('#binder-stats'), binderGrid: $('#binder-grid'),
  binderEmpty: $('#binder-empty'), binderEmptyMark: $('#binder-empty-mark'),
  binderEmptyText: $('#binder-empty-text'),
  filterOpen: $('#filter-open'), filterCount: $('#filter-count'),

  profileRing: $('#profile-ring'), profileLevel: $('#profile-level'), profileRank: $('#profile-rank'),
  xpBar: $('#xp-bar'), xpLine: $('#xp-line'), nextRewardLabel: $('#next-reward-label'),
  nextReward: $('#next-reward'), statsLabel: $('#stats-label'), statGrid: $('#stat-grid'),
  rarityLabel: $('#rarity-label'), rarityBars: $('#rarity-bars'),
  moreLabel: $('#more-label'), profileLinks: $('#profile-links'),

  settingsTitle: $('#settings-title'), themeLabel: $('#theme-label'), themeGrid: $('#theme-grid'),
  prefsLabel: $('#prefs-label'), settingsList: $('#settings-list'),
  dataLabel: $('#data-label'), dataList: $('#data-list'),

  openScreen: $('#screen-open'), openBack: $('#open-back'), openTitle: $('#open-title'),
  openProgress: $('#open-progress'), openStage: $('#open-stage'), boosterSlot: $('#booster-slot'),
  cardStack: $('#card-stack'), summary: $('#summary'), openHint: $('#open-hint'), openDone: $('#open-done'),

  sheet: $('#sheet'), sheetTitle: $('#sheet-title'), sheetBody: $('#sheet-body'), sheetClose: $('#sheet-close'),

  welcome: $('#welcome'), welcomeMark: $('#welcome-mark'), welcomeTitle: $('#welcome-title'),
  welcomeBody: $('#welcome-body'), langChoices: $('#lang-choices'), starter: $('#starter'),
  starterTitle: $('#starter-title'), starterBody: $('#starter-body'),
  starterLoot: $('#starter-loot'), starterGo: $('#starter-go'),

  flash: $('#flash'), toast: $('#toast'), xpPop: $('#xp-pop')
});

let nav, sheet, walletOdo, levelRing, profileRing, xpBar, trackBar, packsSeg;

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
  binder: 'tabCollection', profile: 'tabProfile', settings: 'tabSettings'
};

function showScreen(name) {
  Object.entries(el.screens).forEach(([key, node]) => node.classList.toggle('is-active', key === name));
  if (name !== 'open') {
    state.tab = name;
    nav?.select(navTabFor(name), { silent: true });
    el.appbarTitle.textContent = t(SCREEN_TITLES[name] ?? 'tabBoosters');
  }

  // Opening a pack is a takeover: the frame gets out of the way, and the
  // backdrop stops so the whole GPU budget goes to the cards.
  const immersive = name === 'open';
  document.documentElement.classList.toggle('is-immersive', immersive);
  backdrop.setPaused(immersive);

  setTickerJob('shop', name === 'shop' ? tickRestock : null);
  setTickerJob('timed', name === 'timed' ? tickTimed : null);
  window.scrollTo({ top: 0 });
}

/** Settings has no destination of its own; it lives under Profile. */
const navTabFor = (screen) => (screen === 'settings' ? 'profile' : screen);

function refreshWallet() {
  state.wallet = store.loadWallet();
  walletOdo.set(state.wallet);
  el.wallet.setAttribute('aria-label', `${t('walletTitle')}: ${formatAmount(state.wallet)}`);
}

function refreshLevelBadge() {
  const level = state.profile.progress.level ?? 1;
  levelRing.set(levelFraction(state.profile.progress), String(level));
  el.levelBadge.setAttribute('aria-label', `${t('profileLevel', { n: level })}`);
  // The strap line said the same thing on every screen and was too long for
  // the bar. The rank is short, and it changes as you play.
  el.appbarSub.textContent = tx(rankFor(level).name);
}

function updateBadges() {
  const cards = store.allEntries(state.collection).length;
  nav.setBadge('binder', cards ? String(cards) : '');
  const timed = state.profile.timed.count ?? 0;
  nav.setBadge('timed', timed ? String(timed) : '');
  const ready = canClaim(state.profile.daily);
  el.giftDot.hidden = !ready;
  el.gift.classList.toggle('is-hot', ready);
}

/* --- booster art ------------------------------------------------------------------ */

function buildBooster(spec, { interactive = false, size = '' } = {}) {
  const colours = specColours(spec);
  const booster = document.createElement('div');
  booster.className = `booster ${size}`.trim();
  booster.dataset.spec = specId(spec);
  booster.style.setProperty('--accent', colours.accent);
  booster.style.setProperty('--accent2', colours.accent2);
  if (spec.rarityId) {
    const rarity = rarityById(spec.rarityId);
    booster.dataset.rarity = rarity.id;
    booster.classList.add('is-lit');
    booster.style.setProperty('--rarity', rarity.color);
    booster.style.setProperty('--rarity-glow', rarity.glow);
  }

  booster.innerHTML = `
    <div class="booster-body">
      ${interactive ? '<div class="booster-mouth" aria-hidden="true"></div>' : ''}
      <div class="booster-crimp is-top" aria-hidden="true"></div>
      <div class="booster-crimp is-bottom" aria-hidden="true"></div>
      <div class="booster-face">
        <div class="booster-photo"></div>
        <div class="booster-banner"><span class="booster-name"></span></div>
        <span class="booster-count"></span>
      </div>
      <div class="fx fx-a" aria-hidden="true"></div>
      <div class="fx fx-b" aria-hidden="true"></div>
      ${interactive ? `
        <div class="booster-tear" aria-hidden="true"></div>
        <div class="rip-front" aria-hidden="true"></div>
        <div class="rip-zone" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="rip-line"></div>
          <div class="rip-grip is-left"></div>
          <div class="rip-grip is-right"></div>
        </div>` : ''}
    </div>`;

  booster.querySelector('.booster-name').textContent = specName(spec);
  booster.querySelector('.booster-count').textContent = `${spec.cards} ${t('cards')}`;
  paintPackPhoto(booster.querySelector('.booster-photo'), spec);
  if (interactive && state.ripDir) booster.dataset.ripDir = String(state.ripDir);
  return booster;
}

function paintPackPhoto(node, spec) {
  const src = spec.art ?? state.art.get(specHero(spec));
  node.replaceChildren();
  const fallback = () => node.insertAdjacentHTML('afterbegin',
    `<div class="booster-photo-fallback">${iconSvg(specIcon(spec), { size: 54 })}</div>`);
  if (!src) return fallback();

  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.loading = 'lazy';
  img.addEventListener('error', () => { img.remove(); fallback(); });
  node.appendChild(img);
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

  el.creator.hidden = state.packMode !== 'custom';
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
    el.packsEmptyMark.innerHTML = iconSvg(state.packMode === 'custom' ? 'wand' : 'packs', { size: 46 });
    el.packsEmptyText.textContent = state.packMode === 'custom' ? t('shelfEmptyCustom') : t('shelfEmpty');
    el.packsEmptyCta.textContent = t('goShop');
    el.packsEmptyCta.hidden = state.packMode === 'custom';
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
      wiki,
      art: await fetchCustomPackArt(wiki)
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

function renderTimed() {
  const timed = syncTimed();
  const level = timedLevel(timed.opened ?? 0);
  const cap = maxHeld(level);

  el.timedTitle.textContent = t('timedTitle');
  el.timedIntro.textContent = t('timedIntro', { minutes: Math.round(regenMs(level) / 60000) });

  const pack = buildBooster(currentTimedSpec(), { size: 'is-small' });
  pack.classList.toggle('is-empty', timed.count <= 0);
  el.timedPack.replaceChildren(pack);

  el.timedOpen.textContent = t('timedOpen');
  el.timedOpen.onclick = openTimed;

  const { to } = levelBounds(timed.opened ?? 0);
  const atMax = level >= MAX_TIMED_LEVEL;
  el.trackLevel.textContent = atMax ? t('timedTrackMax', { level }) : t('timedTrack', { level });
  el.trackRemaining.textContent = atMax ? '' : t('timedToNext', { n: to - (timed.opened ?? 0), level: level + 1 });
  trackBar.set(levelProgress(timed.opened ?? 0));

  const scarcity = timedTopScarcity(level);
  el.trackPerks.textContent = scarcity <= 1.05
    ? t('timedPerksMax', { minutes: Math.round(regenMs(level) / 60000), max: cap })
    : t('timedPerks', {
        minutes: Math.round(regenMs(level) / 60000), max: cap,
        factor: scarcity >= 10 ? Math.round(scarcity) : scarcity.toFixed(1)
      });
  el.trackNext.textContent = atMax ? '' : t('timedNextPerks', {
    minutes: Math.round(regenMs(level + 1) / 60000), max: maxHeld(level + 1)
  });
  el.trackNext.hidden = atMax;

  tickTimed();
}

/** The 1 Hz part: counters only, and only while this screen is on display. */
function tickTimed() {
  const timed = state.profile.timed;
  const before = timed.count;
  accrue(timed);
  if (timed.count !== before) {
    store.saveProfile(state.profile);
    if (timed.count > before) synth.playReady();
    renderTimed();
    updateBadges();
    return;
  }
  const level = timedLevel(timed.opened ?? 0);
  el.timedCount.textContent = t('timedHeld', { n: timed.count, max: maxHeld(level) });
  const remaining = msToNext(timed);
  el.timedNext.textContent = remaining == null
    ? t('timedFull')
    : t('timedNext', { time: formatCountdown(remaining) });
  el.timedOpen.disabled = timed.count <= 0;
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
  `${t('freeNote')} ${t('freeAgainIn', { time: formatCountdown(nextFreeAt() - Date.now()) })}`;

function renderShop() {
  el.shopTitle.textContent = t('tabShop');
  el.shopIntro.textContent = t('shopIntro');
  const rows = generateShop(windowIndexAt(), state.customPacks, freeWindowAt());

  el.shopRows.replaceChildren(...rows.map((row) => {
    const section = document.createElement('section');
    section.className = `shop-row${row.free ? ' is-free' : ''}`;
    section.innerHTML = `
      <div class="shop-row-head"><h3></h3></div>
      ${row.free ? '<p class="shop-note"></p>' : ''}
      <div class="shelf"></div>`;
    section.querySelector('h3').textContent = row.title;
    if (row.free) section.querySelector('.shop-note').textContent = freeNoteText();

    const shelf = section.querySelector('.shelf');
    shelf.replaceChildren(...row.specs.map(({ id, spec, price }) => {
      const item = document.createElement('div');
      item.className = 'shop-item';
      item.dataset.spec = id;
      item.appendChild(buildBooster(spec, { size: 'is-small' }));

      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = row.free ? 'buy is-free' : 'buy';
      press(buy, { sound: null });
      if (row.free) paintFreeButton(buy, id, spec);
      else {
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
  el.restock.textContent = t('restockIn', { time: formatCountdown(remaining) });
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

/* --- opening: the rip ---------------------------------------------------------------------- */

const rip = { progress: 0, dragging: false, lastTick: 0, done: false, booster: null, zone: null };

function paintRip() {
  const dir = state.ripDir || 1;
  const pct = rip.progress * 100;
  const tear = rip.booster?.querySelector('.booster-tear');
  if (!tear) return;
  const clip = dir > 0 ? `inset(0 0 0 ${pct}%)` : `inset(0 ${pct}% 0 0)`;
  tear.style.clipPath = clip;
  const line = rip.booster.querySelector('.rip-line');
  if (line) line.style.clipPath = clip;
  const front = rip.booster.querySelector('.rip-front');
  if (front) {
    front.style.left = `${dir > 0 ? pct : 100 - pct}%`;
    front.style.opacity = rip.progress > 0.02 && rip.progress < 0.99 ? '1' : '0';
  }
  rip.zone?.setAttribute('aria-valuenow', String(Math.round(pct)));
}

function setRip(progress) {
  rip.progress = clamp01(progress);
  paintRip();
  if (Math.abs(rip.progress - rip.lastTick) >= RIP_TICK_STEP) {
    rip.lastTick = rip.progress;
    synth.playRipTick(rip.progress);
  }
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

function initRip(booster) {
  rip.booster = booster;
  rip.zone = booster.querySelector('.rip-zone');
  rip.progress = 0; rip.lastTick = 0; rip.done = false; rip.dragging = false;
  paintRip();

  const zone = rip.zone;
  if (!zone) return;

  zone.addEventListener('pointerdown', (event) => {
    if (rip.done) return;
    rip.dragging = true;
    rip.lastTick = rip.progress;
    booster.classList.add('is-tearing');
    synth.resume();
    event.preventDefault();

    trackDrag(event, {
      onMove: (dx) => {
        if (!rip.dragging || Math.abs(dx) < RIP_LOCK_SLOP) return;
        lockRipDirection(dx);
        const span = Math.max(120, zone.getBoundingClientRect().width * 0.72);
        setRip((dx * state.ripDir) / span);
      },
      onEnd: async () => {
        if (!rip.dragging) return;
        rip.dragging = false;
        booster.classList.remove('is-tearing');
        if (rip.progress >= RIP_COMMIT) completeRip();
        else if (rip.progress > 0.01) {
          await animateRip(rip.progress, 0, 300);
          synth.playRipTick(0.35);
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
  const scrap = document.createElement('div');
  scrap.className = 'tear-scrap';
  scrap.style.setProperty('--drift', `${dir * (70 + Math.random() * 50)}px`);
  scrap.style.setProperty('--spin', `${dir * (150 + Math.random() * 120)}deg`);
  booster.querySelector('.booster-body').appendChild(scrap);
  scrap.addEventListener('animationend', () => scrap.remove(), { once: true });
}

async function completeRip() {
  if (rip.done) return;
  rip.done = true;
  const booster = rip.booster;
  await animateRip(rip.progress, 1, 220);
  synth.playRip();
  booster.classList.add('is-open');
  dropScrap(booster);
  openPack(booster);
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

async function openPack(booster) {
  if (state.busy) return;
  state.busy = true;
  clearTimeout(state.prefetchTimer);

  if (!store.takeBooster(state.inventory, specId(state.spec))) {
    state.busy = false;
    return;
  }
  renderPacks();

  const drawing = drawFor(state.spec);

  // The animation runs on card BACKS, which need no data, so it starts the
  // instant the pack tears and the fetch happens underneath it.
  el.openScreen.classList.replace('phase-idle', 'phase-opening');
  el.openHint.textContent = '';
  booster.classList.remove('is-idle');

  const count = state.spec.cards;
  state.cards = Array.from({ length: count }, (_, i) => buildPlaceholderCard(i, count));
  el.cardStack.replaceChildren(...state.cards);
  state.cards.forEach((card, i) => {
    card.style.setProperty('--spin', `${(Math.random() * 34 - 17).toFixed(1)}deg`);
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
    state.busy = false;
    return;
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
  state.busy = false;
}

/* --- cards --------------------------------------------------------------------------------- */

const CARD_FRONT_MARKUP = `
  <div class="card-art"></div>
  <button class="fav-button" type="button" aria-pressed="false"></button>
  <div class="card-body">
    <h3 class="card-title"></h3>
    <p class="card-desc"></p>
    <p class="card-extract"></p>
  </div>
  <div class="card-stats"><span class="card-price"></span><span class="card-views"></span></div>
  <div class="card-footer"><span class="rarity-badge"></span></div>
  <div class="fx fx-a" aria-hidden="true"></div>
  <div class="fx fx-b" aria-hidden="true"></div>`;

/**
 * A face-down card. The back takes the booster's colour and icon so a card
 * looks like it came from the pack it came from, but it carries no rarity, so
 * nothing here can give the pull away.
 */
function buildPlaceholderCard(index, total) {
  const colours = specColours(state.spec);
  const card = document.createElement('div');
  card.className = 'card stack-card';
  card.style.zIndex = String(total - index);
  card.style.setProperty('--back-accent', colours.accent);
  card.style.setProperty('--back-accent2', colours.accent2);
  card.innerHTML = `
    <div class="card-inner">
      <div class="card-face card-back">
        <div class="back-art"></div>
        <div class="back-icon">${iconSvg(specIcon(state.spec), { size: 52 })}</div>
      </div>
      <div class="card-face card-front">${CARD_FRONT_MARKUP}</div>
    </div>`;
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
    if (pull.rarity.flash > 0) fireFlash(pull.rarity.flash);
  }

  if (state.seen.size >= state.pulls.length) {
    el.openHint.textContent = '';
    await wait(950);
    if (state.seen.size >= state.pulls.length) showSummary();
  } else {
    el.openHint.textContent = state.index === 0 ? t('swipeToReveal') : t('swipeEitherWay');
  }
}

function goTo(index) {
  const next = clamp(index, 0, state.pulls.length - 1);
  if (next === state.index) { layoutDeck(); return; }
  state.index = next;
  layoutDeck();
  synth.playFlip();
  revealCurrent();
}

function showSummary() {
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

function fireFlash(intensity) {
  if (!settings().flash) return;
  el.flash.style.setProperty('--flash-peak', String(intensity));
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

function rewardCard(reward) {
  const wrap = document.createElement('div');
  wrap.className = 'reward-card';
  if (reward.spec) {
    const art = document.createElement('div');
    art.appendChild(buildBooster(reward.spec, { size: 'is-tiny' }));
    wrap.appendChild(art);
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
function buildStaticCard(data, rarity, entryKey = null, { fav = true } = {}) {
  const card = document.createElement('article');
  card.className = 'card is-revealed is-lit';
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
    body.innerHTML = `
      <div class="detail-body">
        <div class="detail-card-wrap"></div>
        <div class="detail-side">
          <p class="detail-sub"></p>
          <div class="detail-facts"></div>
          <p class="detail-text"></p>
          <div class="detail-actions">
            <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer"></a>
            <button class="btn btn-ghost btn-sm sell" type="button" hidden></button>
          </div>
        </div>
      </div>`;

    const card = buildStaticCard(data, rarity, null, { fav: false });
    card.classList.add('detail-card');
    body.querySelector('.detail-card-wrap').appendChild(card);
    attachTilt(card);
    card.style.setProperty('--rarity', rarity.color);

    body.querySelector('.detail-sub').textContent = data.description || data.sourceName || '';
    body.querySelector('.detail-side').style.setProperty('--rarity', rarity.color);
    body.querySelector('.detail-facts').innerHTML = [
      `<span class="chip" style="color:${rarity.color};border-color:${rarity.color}">${tx(rarity.name)}</span>`,
      `<span class="chip">${money(data.price)}</span>`,
      data.views ? `<span class="chip">${t('viewsPerMonth', { views: formatViews(data.views) })}</span>` : '',
      entry && entry.count > 1 ? `<span class="chip">${t('copiesOwned', { n: entry.count })}</span>` : ''
    ].filter(Boolean).join('');
    body.querySelector('.detail-text').textContent = data.extract;

    const read = body.querySelector('a');
    read.href = data.url;
    read.textContent = t('read');
    press(read, { sound: null });

    // Selling only makes sense for a card actually in the binder.
    const sell = body.querySelector('.sell');
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

function renderBinder() {
  el.binderTitle.textContent = t('tabCollection');
  const entries = store.allEntries(state.collection);
  const stats = store.collectionStats(entries);

  el.binderStats.innerHTML = `
    <span class="stat-pill"><b>${stats.copies}</b> ${t('copies')}</span>
    <span class="stat-pill"><b>${money(stats.value)}</b> ${t('total')}</span>
    <span class="stat-pill"><b>${stats.favorites}</b> ${t('favourites')}</span>`;

  el.filterOpen.textContent = t('filters');
  const active = activeFilterCount();
  el.filterCount.textContent = String(active);
  el.filterCount.hidden = !active;

  const visible = store.filterEntries(entries, state.filters);
  el.binderEmpty.hidden = visible.length > 0;
  if (!visible.length) {
    el.binderEmptyMark.innerHTML = iconSvg('collection', { size: 46 });
    el.binderEmptyText.textContent = entries.length ? t('noMatches') : t('emptyCollection');
  }

  el.binderGrid.replaceChildren(...visible.map((entry) => {
    const card = buildStaticCard(entry, rarityById(entry.rarityId), entry.key);
    if (entry.count > 1) {
      const badge = document.createElement('span');
      badge.className = 'copy-badge';
      badge.textContent = `×${entry.count}`;
      card.appendChild(badge);
    }
    return card;
  }));
  reveal(el.binderGrid.children, { step: 26, from: 10 });
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
      state.filters = { search: '', pack: '', rarity: '', band: '', minPrice: '', sort: 'recent', favoritesOnly: false };
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
    atMax ? document.createTextNode(t('profileMax')) : rewardCard(rewardForLevel(level + 1))
  );

  el.statsLabel.textContent = t('profileStats');
  const entries = store.allEntries(state.collection);
  const pulled = Object.values(rarityCounts).reduce((sum, n) => sum + n, 0);
  const best = RARITIES.filter((r) => (rarityCounts[r.id] ?? 0) > 0).pop();

  const stats = [
    [t('statPlaytime'), formatDuration(state.profile.playMs ?? 0)],
    [t('statAccountAge'), new Date(state.profile.createdAt ?? Date.now())
      .toLocaleDateString(getLanguage(), { year: 'numeric', month: 'short', day: 'numeric' })],
    [t('statBoosters'), (state.profile.boostersOpened ?? 0).toLocaleString()],
    [t('statCards'), pulled.toLocaleString()],
    [t('statValue'), formatAmount(entries.reduce((sum, e) => sum + e.price * e.count, 0))],
    [t('statBest'), best ? tx(best.name) : t('none')]
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

  // Everything that is not a destination of its own hangs off the profile.
  el.moreLabel.textContent = t('moreTitle');
  const links = [
    ['settings', 'tabSettings', () => { renderSettings(); showScreen('settings'); }],
    ['gift', 'dailyTitle', () => openDaily()],
    ['gem', 'pullRates', () => openOdds()],
    ['spark', 'walletTitle', () => openWallet()]
  ];
  el.profileLinks.replaceChildren(...links.map(([icon, key, go]) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'row';
    row.style.alignItems = 'center';
    row.innerHTML = `<span style="display:flex;align-items:center;gap:12px">
      <span style="color:var(--accent)">${iconSvg(icon, { size: 20 })}</span>
      <span style="font-weight:700">${t(key)}</span></span>
      <span class="muted">${iconSvg('chevron', { size: 18 })}</span>`;
    press(row, { sound: null });
    row.addEventListener('click', () => { synth.playTap(); go(); });
    return row;
  }));
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

  el.dataList.replaceChildren(language, transferRow, resetRow);
}

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
    load.addEventListener('click', () => {
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
      if (importSave(text)) location.reload();
      else { status.textContent = t('saveUnreadable'); synth.playDenied(); }
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

function wipeEverything() {
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

function giftTile(slot, status) {
  const { gift } = slot;
  const tile = document.createElement('div');
  tile.className = `gift-tile is-${status} is-${gift.kind}`;
  tile.innerHTML = `
    <span class="gift-day"></span>
    <span class="gift-art"></span>
    <span class="gift-label"></span>
    <span class="gift-check"></span>`;
  tile.querySelector('.gift-day').textContent = String(slot.day);
  tile.querySelector('.gift-label').innerHTML = giftLabel(gift);
  const art = tile.querySelector('.gift-art');
  if (gift.kind === 'coins') art.innerHTML = buckSvg({ size: 20 });
  else if (gift.kind === 'card') art.innerHTML = iconSvg('collection', { size: 20 });
  else art.innerHTML = iconSvg('packs', { size: 20 });
  if (status === 'claimed') tile.querySelector('.gift-check').innerHTML = iconSvg('check', { size: 18 });
  return tile;
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

  body.innerHTML = `
    <p style="margin-bottom:16px"></p>
    <div style="display:grid;gap:10px;margin-bottom:18px">
      <button class="btn btn-primary btn-block" type="button" data-claim></button>
      <p class="muted tabular" style="font-size:.82rem;text-align:center" data-status></p>
    </div>
    <p class="label" style="margin-bottom:10px" data-board></p>
    <div class="gift-board"></div>`;

  body.querySelector('p').textContent = t('dailyBody');
  body.querySelector('[data-board]').textContent = t('dailyBoard', { n: (daily.board ?? 0) + 1 });

  const claim = body.querySelector('[data-claim]');
  claim.textContent = t('dailyClaim');
  claim.hidden = !ready;
  press(claim, { sound: null });
  claim.addEventListener('click', () => { synth.resume(); claimGift(body); });

  const status = body.querySelector('[data-status]');
  status.textContent = ready ? '' :
    `${t('dailyClaimed')} ${t('dailyNextIn', { time: formatCountdown(msUntilNextDay()) })}`;

  body.querySelector('.gift-board').replaceChildren(...board.map((slot) => giftTile(
    slot,
    slot.index < next ? 'claimed' : slot.index === next ? (ready ? 'ready' : 'next') : 'locked'
  )));
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
  loadPackArt();
}

/* --- strings --------------------------------------------------------------------------------------------------------- */

function applyStrings() {
  document.documentElement.lang = getLanguage();
  el.appbarTitle.textContent = t(SCREEN_TITLES[state.tab] ?? 'tabBoosters');
  el.giftIcon.innerHTML = iconSvg('gift', { size: 18 });
  el.walletMark.innerHTML = buckSvg({ size: 12 });
  el.sheetClose.innerHTML = iconSvg('close', { size: 17 });
  el.openBack.innerHTML = iconSvg('chevronLeft', { size: 18 });
  el.creatorLabel.textContent = t('tabCustom');
  el.creatorNote.textContent = `${t('customIntro')} ${t('customOwnNote')}`;
  el.creatorInput.placeholder = t('customPlaceholder');
  el.creatorGo.textContent = t('create');
  el.packsEmptyCta.textContent = t('goShop');

  nav?.setLabels({
    packs: t('tabBoosters'), timed: t('tabTimed'), shop: t('tabShop'),
    binder: t('tabCollection'), profile: t('tabProfile')
  });
  packsSeg?.relabel([{ label: t('owned') }, { label: t('tabCustom') }]);
}

/* --- wiring ------------------------------------------------------------------------------------------------------------ */

async function loadPackArt() {
  try {
    state.art = await fetchPackArt(heroTitles(getLanguage()));
    document.querySelectorAll('.booster').forEach((booster) => {
      const id = booster.dataset.spec;
      const slot = state.inventory[id];
      const spec = slot?.spec ?? specFromId(id);
      if (spec) paintPackPhoto(booster.querySelector('.booster-photo'), spec);
    });
  } catch {
    /* offline: every booster keeps its drawn fallback */
  }
}

/** Rebuild a minimal spec from an id, to repaint art after a late load. */
function specFromId(id) {
  const [kind, theme, rarity, cards] = String(id).split('|');
  if (kind === 'custom' || kind === 'timed') return null;
  return {
    kind, themeId: theme === 'any' ? null : theme,
    rarityId: rarity === 'std' ? null : rarity, cards: Number(cards) || 5
  };
}

function init() {
  useTheme(storedTheme());
  backdrop.mount(el.backdrop).setTheme(storedTheme());

  walletOdo = new Odometer(el.walletAmount);
  levelRing = new Ring(el.levelBadge, { size: 40, width: 3 });
  profileRing = new Ring(el.profileRing, { size: 62, width: 4 });
  xpBar = new Bar(el.xpBar);
  trackBar = new Bar(el.trackBar);

  packsRail = new Rail(el.packsRail, { onFocus: paintPackCaption });
  sheet = new Sheet(el.sheet);

  packsSeg = new Segmented(el.packsSeg, [
    { id: 'owned', label: t('owned') },
    { id: 'custom', label: t('tabCustom') }
  ], (mode) => { state.packMode = mode; renderPacks(); });

  nav = new NavBar(el.navbar, [
    { id: 'packs', icon: iconSvg('packs', { size: 21 }) },
    { id: 'timed', icon: iconSvg('clock', { size: 21 }) },
    { id: 'shop', icon: iconSvg('gem', { size: 21 }) },
    { id: 'binder', icon: iconSvg('collection', { size: 21 }) },
    { id: 'profile', icon: iconSvg('profile', { size: 21 }) }
  ], (id) => {
    // Every destination repaints on arrival: the shelf, the wallet and the
    // counters can all have changed while the player was somewhere else.
    if (id === 'packs') renderPacks();
    if (id === 'binder') renderBinder();
    if (id === 'shop') { payStipend(); renderShop(); }
    if (id === 'timed') renderTimed();
    if (id === 'profile') renderProfile();
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
  if (languageChosen()) loadPackArt();

  [el.wallet, el.gift, el.levelBadge, el.packsOpen, el.timedOpen,
   el.filterOpen, el.openBack, el.openDone, el.sheetClose, el.starterGo,
   el.packsEmptyCta, el.creatorGo].forEach((node) => press(node, { sound: null }));

  el.wallet.addEventListener('click', openWallet);
  el.gift.addEventListener('click', () => openDaily());
  el.levelBadge.addEventListener('click', () => { renderProfile(); showScreen('profile'); });
  el.filterOpen.addEventListener('click', openFilters);
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
    if (e.key === 'Escape' && sheet.open) sheet.hide();
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
    } else {
      flushPlaytime();
      visibleSince = null;
      synth.suspend();
    }
    backdrop.setPaused(!visible || document.documentElement.classList.contains('is-immersive'));
    syncTicker();
  });
  window.addEventListener('pagehide', flushPlaytime);

  backdrop.start();

  if (!languageChosen() || !state.profile.started) showWelcome();
  else {
    payStipend();
    if (canClaim(state.profile.daily)) openDaily({ auto: true });
  }
}

let packsRail;
init();

window.__packywiki = {
  state, store, RARITIES, synth, backdrop, THEMES,
  draw: drawArticles, generateShop,
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
