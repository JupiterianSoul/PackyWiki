/**
 * PackyWiki — app controller.
 *
 * Four tabs: the boosters you own, custom boosters you've built, the shop that
 * sells them, and the collection binder. Opening a booster happens on its own
 * screen which runs through four phases — idle, opening, reveal, summary —
 * without ever swapping screens, so there is no loading gap.
 */

import { THEME_PACKS, themeById, heroTitles } from './data/packs.js';
import { RARITIES, rarityById, rarityRank, rollRarity, oddsTable } from './data/rarities.js';
import { iconSvg, logoSvg, buckSvg } from './data/icons.js';
import { drawArticles, resolveCustomWiki, fetchPackArt, fetchCustomPackArt } from './wiki.js';
import { priceFor, formatAmount, formatViews, bandFor, POPULARITY_BANDS } from './pricing.js';
import {
  boosterPrice, rollOptionsFor, sellPriceFor, nextRefreshAt, windowIndexAt,
  STARTER_PACKS, STARTER_PACK_CARDS, STARTER_COINS
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
  BOARD_SIZE, generateBoard, canClaim, claim as claimDaily, nextIndex as nextGiftIndex,
  msUntilNextDay, dayNumber
} from './daily.js';
import {
  MAX_TIMED_LEVEL, accrue, msToNext, timedLevel, timedSpec, maxHeld, regenMs,
  levelBounds, levelProgress, timedRollOptions
} from './timed.js';
import { rarityChances } from './data/rarities.js';
import { t, tx, getLanguage, setLanguage, languageChosen, LANGUAGES } from './i18n.js';
import { synth } from './audio.js';

/* --- tuning --------------------------------------------------------------- */
const RIP_COMMIT = 0.62;
const RIP_TICK_STEP = 0.055;
const RIP_LOCK_SLOP = 10;
const SWIPE_COMMIT = 78;
const EMERGE_STAGGER = 110;
const EMERGE_DURATION = 820;
const PREFETCH_DELAY = 350;
const TILT_MAX = 16;      // degrees a held card leans by

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

/**
 * Run a drag from a pointerdown. Move and release are tracked on `window`
 * because a drag almost always ends outside the element it started on.
 */
function trackDrag(event, { onMove, onEnd }) {
  const x0 = event.clientX;
  const y0 = event.clientY;
  const move = (e) => onMove(e.clientX - x0, e.clientY - y0, e);
  const end = (e) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    onEnd(e.clientX - x0, e.clientY - y0, e);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

const el = {};
const bind = (map) => Object.assign(el, map);
bind({
  screens: {
    boosters: $('#screen-boosters'), timed: $('#screen-timed'), custom: $('#screen-custom'),
    shop: $('#screen-shop'), open: $('#screen-open'), collection: $('#screen-collection'),
    profile: $('#screen-profile'), settings: $('#screen-settings')
  },
  brandMark: $('#brand-mark'), brandSub: $('#brand-sub'),
  tabs: [...document.querySelectorAll('.tab')], tabCount: $('#tab-count'),
  wallet: $('#wallet'), oddsButton: $('#odds-button'),
  dailyButton: $('#daily-button'), dailyButtonLabel: $('#daily-button-label'),
  giftIcon: $('#gift-icon'), giftDot: $('#gift-dot'), timedCount: $('#timed-count'),

  rail: $('#pack-rail'), railPrev: $('#rail-prev'), railNext: $('#rail-next'),
  railName: $('#rail-name'), railTagline: $('#rail-tagline'), railOwned: $('#rail-owned'),
  railOpen: $('#rail-open'), railHint: $('#rail-hint'), railCaption: $('#rail-caption'),
  boostersEmpty: $('#boosters-empty'),

  customRail: $('#custom-rail'), customCaption: $('#custom-caption'),
  customName: $('#custom-name'), customTagline: $('#custom-tagline'),
  customOwned: $('#custom-owned'), customOpen: $('#custom-open'), customEmpty: $('#custom-empty'),
  customForm: $('#custom-form'), customIntro: $('#custom-intro'),
  customInput: $('#custom-input'), customSubmit: $('#custom-submit'), customStatus: $('#custom-status'),

  shopIntro: $('#shop-intro'), restock: $('#restock'), shopRows: $('#shop-rows'),

  openScreen: $('#screen-open'), openTitle: $('#open-title'), openProgress: $('#open-progress'),
  boosterSlot: $('#booster-slot'), cardStack: $('#card-stack'), packSummary: $('#pack-summary'),
  openHint: $('#open-hint'), revealActions: $('#reveal-actions'),
  backToShelf: $('#back-to-shelf'), backButton: $('#back-button'),

  collectionStats: $('#collection-stats'), collectionGrid: $('#collection-grid'),
  collectionEmpty: $('#collection-empty'),
  filterToggle: $('#filter-toggle'), filterIcon: $('#filter-icon'),
  filterToggleLabel: $('#filter-toggle-label'), filterSummary: $('#filter-summary'),
  filters: $('#filters'), filterSearch: $('#filter-search'), filterPack: $('#filter-pack'),
  filterRarity: $('#filter-rarity'), filterBand: $('#filter-band'), filterPrice: $('#filter-price'),
  filterSort: $('#filter-sort'), filterFav: $('#filter-fav'), filterFavLabel: $('#filter-fav-label'),
  filterReset: $('#filter-reset'),

  cardModal: $('#card-modal'), cardModalClose: $('#card-modal-close'), cardDetail: $('#card-detail'),
  detailTitle: $('#detail-title'), detailSub: $('#detail-sub'), detailFacts: $('#detail-facts'),
  detailExtract: $('#detail-extract'), detailRead: $('#detail-read'), detailSell: $('#detail-sell'),

  walletModal: $('#wallet-modal'), walletClose: $('#wallet-close'), walletTitle: $('#wallet-title'),
  walletBalance: $('#wallet-balance'), walletWhat: $('#wallet-what'), walletNote: $('#wallet-note'),
  walletEarnTitle: $('#wallet-earn-title'), walletEarn: $('#wallet-earn'),
  walletSpendTitle: $('#wallet-spend-title'), walletSpend: $('#wallet-spend'),

  oddsModal: $('#odds-modal'), oddsClose: $('#odds-close'), oddsBody: $('#odds-body'),
  oddsHeading: $('#odds-heading'), oddsNote: $('#odds-note'), oddsH1: $('#odds-h1'), oddsH2: $('#odds-h2'),

  welcomeModal: $('#welcome-modal'), welcomeTitle: $('#welcome-title'), welcomeBody: $('#welcome-body'),
  langChoices: $('#lang-choices'), starterPanel: $('#starter-panel'), starterTitle: $('#starter-title'),
  starterBody: $('#starter-body'), starterLoot: $('#starter-loot'), starterGo: $('#starter-go'),

  timedTitle: $('#timed-title'), timedIntro: $('#timed-intro'),
  timedBoosterSlot: $('#timed-booster'), timedHeld: $('#timed-held'),
  timedNext: $('#timed-next'), timedOpen: $('#timed-open'),
  trackLevel: $('#track-level'), trackRemaining: $('#track-remaining'),
  trackFill: $('#track-fill'), trackPerks: $('#track-perks'), trackNext: $('#track-next'),

  profileAvatar: $('#profile-avatar'), profileLevel: $('#profile-level'),
  profileRank: $('#profile-rank'), xpFill: $('#xp-fill'), xpLine: $('#xp-line'),
  nextRewardTitle: $('#next-reward-title'), nextRewardBody: $('#next-reward-body'),
  profileStatsTitle: $('#profile-stats-title'), profileStatGrid: $('#profile-stat-grid'),
  profileRarityTitle: $('#profile-rarity-title'), profileRarity: $('#profile-rarity'),

  settingsTitle: $('#settings-title'), settingsList: $('#settings-list'),
  settingsDataTitle: $('#settings-data-title'),
  settingsLanguageTitle: $('#settings-language-title'),
  settingsLanguageNote: $('#settings-language-note'),
  settingsLanguageValue: $('#settings-language-value'),
  settingsResetTitle: $('#settings-reset-title'), settingsResetNote: $('#settings-reset-note'),
  settingsReset: $('#settings-reset'),

  dailyModal: $('#daily-modal'), dailyTitle: $('#daily-title'), dailyClose: $('#daily-close'),
  dailyBody: $('#daily-body'), dailyClaim: $('#daily-claim'), dailyStatus: $('#daily-status'),
  dailyBoardLabel: $('#daily-board-label'), giftBoard: $('#gift-board'),

  levelModal: $('#level-modal'), levelTitle: $('#level-title'), levelBody: $('#level-body'),
  levelFrom: $('#level-from'), levelTo: $('#level-to'), levelFill: $('#level-fill'),
  levelReward: $('#level-reward'), levelClaim: $('#level-claim'),

  xpPop: $('#xp-pop'),
  flash: $('#flash'), toast: $('#toast')
});

const RIP_DIR_KEY = 'packywiki.ripDirection';

const state = {
  tab: 'boosters',
  rails: {},                 // per-tab { items, focusIndex }
  spec: null,                // booster being opened
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
  filtersOpen: false,
  filters: { search: '', pack: '', rarity: '', band: '', minPrice: '', sort: 'recent', favoritesOnly: false }
};

const money = (amount) => `${buckSvg({ size: 12 })}${formatAmount(amount)}`;

function toast(message, kind = 'ok') {
  el.toast.innerHTML = message;
  el.toast.className = `toast is-${kind} is-showing`;
  el.toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.toast.classList.remove('is-showing'); }, 2600);
}

/* --- the one timer -------------------------------------------------------- */

/**
 * Everything that needs a clock shares a single interval, and that interval
 * only runs when the tab is visible AND something on screen actually wants it.
 *
 * The old code left a 1 Hz interval running for the life of the session the
 * moment the shop rendered once, which kept the phone awake redrawing a
 * countdown nobody was looking at. Waking once a second is cheap; waking once
 * a second forever, in the background, is what warms a handset up.
 */
const ticker = { id: null, jobs: new Map() };

function runTicker() {
  for (const job of ticker.jobs.values()) job();
}

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

/* --- settings ------------------------------------------------------------- */

const settings = () => state.profile.settings;

/**
 * Push the settings into the document. Everything visual is driven by data
 * attributes on <html> so CSS can switch whole families of animation off at
 * once rather than the app having to know about each one.
 */
function applySettings() {
  const s = settings();
  document.documentElement.dataset.lowpower = s.lowPower ? '1' : '0';
  document.documentElement.dataset.hints = s.hints ? '1' : '0';
  synth.setMuted(!s.sound);
}

/* --- playtime ------------------------------------------------------------- */

/**
 * Counted in chunks. A stopwatch ticking every second purely to add one to a
 * number is exactly the sort of background work this app should not be doing,
 * so time is measured between visibility changes instead.
 */
let visibleSince = document.visibilityState === 'visible' ? Date.now() : null;

function flushPlaytime() {
  if (visibleSince == null) return;
  store.addPlaytime(state.profile, Date.now() - visibleSince);
  visibleSince = Date.now();
}

/* --- shell ---------------------------------------------------------------- */

/** Which screens want the shared clock, and what they want it to do. */
function screenTicker(name) {
  setTickerJob('shop', name === 'shop' ? tickRestock : null);
  setTickerJob('timed', name === 'timed' ? tickTimed : null);
}

function showScreen(name) {
  Object.entries(el.screens).forEach(([key, node]) => node.classList.toggle('is-active', key === name));
  if (name !== 'open') state.tab = name;
  el.tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tab === state.tab));
  // Seven tabs do not fit across a phone, so bring the current one into view
  // rather than leaving it off the end of the strip.
  const active = el.tabs.find((tab) => tab.dataset.tab === state.tab);
  active?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  screenTicker(name);
  window.scrollTo({ top: 0 });
}

function applyAccent(colours) {
  document.documentElement.style.setProperty('--accent', colours.accent);
  document.documentElement.style.setProperty('--accent2', colours.accent2);
}

function refreshWallet() {
  state.wallet = store.loadWallet();
  el.wallet.innerHTML = money(state.wallet);
  el.wallet.setAttribute('aria-label', `${t('walletTitle')}: ${formatAmount(state.wallet)}`);
}

/* --- booster art ---------------------------------------------------------- */

/**
 * Booster art. A rarity booster keeps its subject's colours and photo and
 * wears the tier as an effect on top; a booster with no subject falls back to
 * the tier's own colour.
 */
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
    `<div class="booster-photo-fallback">${iconSvg(specIcon(spec), { size: 56 })}</div>`);
  if (!src) return fallback();

  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.loading = 'lazy';
  img.addEventListener('error', () => { img.remove(); fallback(); });
  node.appendChild(img);
}

/* --- shelves (owned boosters + custom) ------------------------------------ */

function railFor(tab) {
  return tab === 'custom'
    ? { node: el.customRail, name: el.customName, tagline: el.customTagline, owned: el.customOwned,
        open: el.customOpen, caption: el.customCaption, empty: el.customEmpty }
    : { node: el.rail, name: el.railName, tagline: el.railTagline, owned: el.railOwned,
        open: el.railOpen, caption: el.railCaption, empty: el.boostersEmpty };
}

/** Owned boosters, split into the two shelves. */
function ownedFor(tab) {
  return store.ownedBoosters(state.inventory)
    .filter((slot) => (tab === 'custom') === (slot.spec.kind === 'custom'))
    .sort((a, b) => specName(a.spec).localeCompare(specName(b.spec)));
}

function renderRail(tab) {
  const ui = railFor(tab);
  const slots = ownedFor(tab);
  state.rails[tab] = { slots, focusIndex: Math.min(state.rails[tab]?.focusIndex ?? 0, Math.max(0, slots.length - 1)) };

  ui.node.replaceChildren(...slots.map((slot, index) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'rail-item';
    item.dataset.index = String(index);
    item.setAttribute('role', 'option');
    item.setAttribute('aria-label', specName(slot.spec));
    item.appendChild(buildBooster(slot.spec));

    const badge = document.createElement('span');
    badge.className = 'own-badge';
    badge.textContent = `×${slot.count}`;
    item.appendChild(badge);

    item.addEventListener('click', () => {
      if (index === state.rails[tab].focusIndex) openScreenFor(slot.spec);
      else scrollRailTo(tab, index);
    });
    return item;
  }));

  const has = slots.length > 0;
  ui.caption.hidden = !has;
  ui.node.parentElement.hidden = !has;
  ui.empty.hidden = has;
  ui.empty.textContent = tab === 'custom' ? t('shelfEmptyCustom') : t('shelfEmpty');
  if (tab === 'boosters') {
    el.railPrev.hidden = !has;
    el.railNext.hidden = !has;
  }
  if (has) requestAnimationFrame(() => { scrollRailTo(tab, state.rails[tab].focusIndex, 'auto'); updateFocus(tab); });
}

function scrollRailTo(tab, index, behavior = 'smooth') {
  const rail = railFor(tab).node;
  const item = rail.querySelectorAll('.rail-item')[index];
  if (!item) return;
  rail.scrollTo({ left: item.offsetLeft - (rail.clientWidth - item.offsetWidth) / 2, behavior });
}

function updateFocus(tab) {
  const ui = railFor(tab);
  const rail = ui.node;
  const items = [...rail.querySelectorAll('.rail-item')];
  const entry = state.rails[tab];
  if (!items.length || !entry) return;

  const mid = rail.scrollLeft + rail.clientWidth / 2;
  let best = 0;
  let bestDist = Infinity;
  items.forEach((item, i) => {
    const dist = Math.abs(item.offsetLeft + item.offsetWidth / 2 - mid);
    if (dist < bestDist) { bestDist = dist; best = i; }
  });
  items.forEach((item, i) => item.classList.toggle('is-focused', i === best));

  entry.focusIndex = best;
  const slot = entry.slots[best];
  if (!slot) return;
  ui.name.textContent = specName(slot.spec);
  ui.tagline.textContent = specTagline(slot.spec);
  ui.owned.innerHTML = `${t('youOwn', { n: slot.count })} · ${slot.spec.cards} ${t('cards')}`;
  ui.open.textContent = t('openPack');
  ui.open.onclick = () => openScreenFor(slot.spec);
  applyAccent(specColours(slot.spec));
  if (tab === 'boosters') {
    el.railPrev.disabled = best === 0;
    el.railNext.disabled = best === items.length - 1;
  }
  schedulePrefetch(slot.spec);
}

function initRail(tab) {
  const rail = railFor(tab).node;
  let ticking = false;
  rail.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { updateFocus(tab); ticking = false; });
  });

  rail.addEventListener('keydown', (event) => {
    const entry = state.rails[tab];
    if (!entry) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); scrollRailTo(tab, entry.focusIndex + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); scrollRailTo(tab, entry.focusIndex - 1); }
    if (event.key === 'Enter' && entry.slots[entry.focusIndex]) {
      event.preventDefault();
      openScreenFor(entry.slots[entry.focusIndex].spec);
    }
  });

  // Drag-to-scroll for mice; touch scrolls the rail natively.
  let dragging = false;
  let left0 = 0;
  let moved = 0;
  rail.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') return;
    dragging = true; left0 = rail.scrollLeft; moved = 0;
    rail.classList.add('is-dragging');
    trackDrag(event, {
      onMove: (dx) => { if (!dragging) return; moved = Math.max(moved, Math.abs(dx)); rail.scrollLeft = left0 - dx; },
      onEnd: () => {
        dragging = false;
        rail.classList.remove('is-dragging');
        scrollRailTo(tab, state.rails[tab]?.focusIndex ?? 0);
      }
    });
  });
  rail.addEventListener('click', (event) => {
    if (moved > 8) { event.stopPropagation(); event.preventDefault(); }
  }, true);
}

/* --- shop ----------------------------------------------------------------- */

function renderShop() {
  el.shopIntro.textContent = t('shopIntro');
  const rows = generateShop(windowIndexAt(), state.customPacks);

  el.shopRows.replaceChildren(...rows.map((row) => {
    const section = document.createElement('section');
    section.className = `shop-row${row.free ? ' is-free' : ''}`;
    section.innerHTML = `<h3 class="shop-row-title"></h3><div class="shop-shelf"></div>`;
    section.querySelector('.shop-row-title').textContent = row.title;
    if (row.free) {
      const note = document.createElement('p');
      note.className = 'shop-row-note';
      note.textContent = t('freeNote');
      section.insertBefore(note, section.querySelector('.shop-shelf'));
    }
    const shelf = section.querySelector('.shop-shelf');

    shelf.replaceChildren(...row.specs.map(({ id, spec, price }) => {
      const item = document.createElement('div');
      item.className = 'shop-item';
      item.dataset.spec = id;
      item.appendChild(buildBooster(spec, { size: 'is-small' }));

      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = row.free ? 'buy-button is-free' : 'buy-button';
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

  tickRestock();
}

function tickRestock() {
  const remaining = nextRefreshAt() - Date.now();
  el.restock.textContent = t('restockIn', { time: formatCountdown(remaining) });
  if (remaining <= 0) {
    payStipend();
    renderShop();
  }
}

/**
 * The free shelf. Each slot can be taken once per restock, which is what keeps
 * it a safety net rather than an income: come back in two hours and there are
 * two more, but standing in front of it does nothing.
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
  renderRail('boosters');
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
  renderRail('boosters');
  renderRail('custom');
}

function payStipend() {
  const paid = store.claimStipend(state.profile, store.loadWallet());
  if (paid > 0) {
    refreshWallet();
    synth.playFanfare();
    toast(t('stipendPaid', { amount: money(paid) }), 'ok');
  }
}

/* --- timed boosters ------------------------------------------------------- */

/** Save whatever `accrue` decided, so the timer survives a reload. */
function syncTimed() {
  accrue(state.profile.timed);
  store.saveProfile(state.profile);
  return state.profile.timed;
}

function currentTimedSpec() {
  return timedSpec(timedLevel(state.profile.timed.opened ?? 0));
}

function renderTimed() {
  const timed = syncTimed();
  const level = timedLevel(timed.opened ?? 0);
  const cap = maxHeld(level);
  const spec = currentTimedSpec();

  el.timedTitle.textContent = t('timedTitle');
  el.timedIntro.textContent = t('timedIntro', { minutes: Math.round(regenMs(level) / 60000) });

  const booster = buildBooster(spec, { size: 'is-small' });
  booster.classList.toggle('is-empty', timed.count <= 0);
  el.timedBoosterSlot.replaceChildren(booster);

  el.timedOpen.textContent = t('timedOpen');
  el.timedOpen.disabled = timed.count <= 0;
  el.timedOpen.onclick = () => openTimed();

  // The track. Levelling it is meant to be a long haul, so the bar shows the
  // exact number still to go rather than a vague percentage.
  const { from, to } = levelBounds(timed.opened ?? 0);
  const atMax = level >= MAX_TIMED_LEVEL;
  el.trackLevel.textContent = atMax ? t('timedTrackMax', { level }) : t('timedTrack', { level });
  el.trackRemaining.textContent = atMax ? '' : t('timedToNext', { n: to - (timed.opened ?? 0), level: level + 1 });
  el.trackFill.style.width = `${(levelProgress(timed.opened ?? 0) * 100).toFixed(1)}%`;
  const scarcity = timedTopScarcity(level);
  el.trackPerks.textContent = scarcity <= 1.05
    ? t('timedPerksMax', { minutes: Math.round(regenMs(level) / 60000), max: cap })
    : t('timedPerks', {
        minutes: Math.round(regenMs(level) / 60000),
        max: cap,
        factor: scarcity >= 10 ? Math.round(scarcity) : scarcity.toFixed(1)
      });
  el.trackNext.textContent = atMax ? '' : t('timedNextPerks', {
    minutes: Math.round(regenMs(level + 1) / 60000),
    max: maxHeld(level + 1)
  });
  el.trackNext.hidden = atMax;

  tickTimed();
}

/**
 * How good a timed booster's odds are, as a share of a normal booster's, by
 * expected value. Derived rather than asserted, so it stays true if the rarity
 * table is ever retuned.
 */
function timedOddsShare(level) {
  const value = (options) => rarityChances(options)
    .reduce((sum, { rarity, chance }) => sum + chance * (1 + rarity.bonusPct / 100), 0);
  return value(timedRollOptions(level)) / value({});
}

/**
 * How much scarcer the best tier is on the timed table. This, not the value
 * share, is the number worth showing: expected value barely moves because
 * commons dominate it, while an Artifact goes from one in 667 to one in
 * 28,000. The nerf is entirely at the top, which is where it should be.
 */
function timedTopScarcity(level) {
  const top = (options) => rarityChances(options).at(-1).chance;
  const timed = top(timedRollOptions(level));
  return timed > 0 ? top({}) / timed : Infinity;
}

/** The 1 Hz part: counters only, and only while this tab is on screen. */
function tickTimed() {
  const timed = state.profile.timed;
  const before = timed.count;
  accrue(timed);
  if (timed.count !== before) {
    store.saveProfile(state.profile);
    renderTimed();
    return;
  }

  const level = timedLevel(timed.opened ?? 0);
  const cap = maxHeld(level);
  el.timedHeld.textContent = t('timedHeld', { n: timed.count, max: cap });
  const remaining = msToNext(timed);
  el.timedNext.textContent = remaining == null
    ? t('timedFull')
    : t('timedNext', { time: formatCountdown(remaining) });
  el.timedOpen.disabled = timed.count <= 0;
  updateTimedBadge();
}

function updateTimedBadge() {
  const count = state.profile.timed.count ?? 0;
  el.timedCount.textContent = String(count);
  el.timedCount.classList.toggle('is-hot', count > 0);
}

function openTimed() {
  const timed = syncTimed();
  if ((timed.count ?? 0) <= 0) { synth.playDenied(); return; }
  const spec = currentTimedSpec();
  // The booster is spent when it is torn, like any other; put one in the
  // inventory so the whole opening flow works unchanged. Track progress is
  // credited when the pack actually produces cards, not here — a failed draw
  // refunds the booster and should not also count as an opening.
  store.addBooster(state.inventory, spec, 1);
  timed.count -= 1;
  timed.last = Number.isFinite(timed.last) ? timed.last : Date.now();
  store.saveProfile(state.profile);
  updateTimedBadge();
  openScreenFor(spec);
}

/* --- opening: the rip ----------------------------------------------------- */

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

/** The torn-off piece, which tumbles away instead of fading out. */
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

/* --- opening: drawing ----------------------------------------------------- */

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

/** Where "back" goes from the opening screen, for each kind of booster. */
const homeTabFor = (spec) =>
  spec?.kind === 'custom' ? 'custom' : spec?.kind === 'timed' ? 'timed' : 'boosters';

function openScreenFor(spec) {
  state.spec = spec;
  applyAccent(specColours(spec));
  synth.resume();

  el.openScreen.className = 'screen is-active phase-idle';
  el.openTitle.textContent = specName(spec);
  el.openProgress.textContent = '';
  el.openHint.textContent = t('slideToRip');
  el.openHint.className = 'open-hint';
  el.packSummary.replaceChildren();
  el.revealActions.classList.remove('is-ready');
  el.cardStack.replaceChildren();
  el.backButton.textContent = `← ${spec.kind === 'timed' ? t('tabTimed') : t('allBoosters')}`;
  el.backToShelf.textContent = t('back');
  state.pulls = []; state.cards = []; state.index = 0; state.seen = new Set();

  const booster = buildBooster(spec, { interactive: true });
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

  // Consume the booster the moment it is torn.
  if (!store.takeBooster(state.inventory, specId(state.spec))) {
    state.busy = false;
    return;
  }
  renderRail('boosters');
  renderRail('custom');

  const drawing = drawFor(state.spec);

  // The animation runs on card BACKS, which need no data — so it starts the
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
    renderRail('boosters');
    renderRail('custom');
    el.openScreen.className = 'screen is-active phase-idle';
    el.openHint.textContent = t('openFailed', { error: articles?.error?.message ?? 'Network error' });
    el.openHint.className = 'open-hint is-error';
    el.cardStack.replaceChildren();
    const fresh = buildBooster(state.spec, { interactive: true });
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
  updateTabCount();

  // Stats, the timed track and XP are all credited here — after the draw has
  // actually produced cards, so a failed pack costs nothing and counts for
  // nothing.
  store.recordOpening(state.profile, pulls);
  if (state.spec.kind === 'timed') {
    state.profile.timed.opened = (state.profile.timed.opened ?? 0) + 1;
    store.saveProfile(state.profile);
  }
  awardXp(pulls);

  state.pulls = pulls;
  bindCards(pulls);
  el.openScreen.classList.replace('phase-opening', 'phase-reveal');
  state.index = 0;
  layoutDeck();
  revealCurrent();
  state.busy = false;
}

/* --- cards ---------------------------------------------------------------- */

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
 * A face-down card. The back takes the booster's colour and icon, so a card
 * looks like it came from the pack it came from — but it carries no rarity,
 * so nothing here can give the pull away.
 */
function buildPlaceholderCard(index, total) {
  const colours = specColours(state.spec);
  const card = document.createElement('div');
  card.className = 'card stack-card';
  card.style.zIndex = String(total - index);
  card.style.setProperty('--depth', String(Math.min(3, index)));
  card.style.setProperty('--back-accent', colours.accent);
  card.style.setProperty('--back-accent2', colours.accent2);
  card.innerHTML = `
    <div class="card-inner">
      <div class="card-face card-back">
        <div class="back-art"></div>
        <div class="back-icon">${iconSvg(specIcon(state.spec), { size: 54 })}</div>
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
    `<div class="card-art-fallback">${iconSvg(data.packIcon ?? 'packs', { size: 40 })}</div>`);

  if (data.thumbnail) {
    const img = document.createElement('img');
    img.src = data.thumbnail;
    img.alt = '';
    img.addEventListener('error', () => { img.remove(); fallback(); });
    // A picture smaller than the frame would be stretched into a blur by
    // object-fit: cover, which is what a custom wiki's stray icons looked
    // like. Fit those inside the frame instead of magnifying them.
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
    button.innerHTML = iconSvg(on ? 'starFilled' : 'star', { size: 17 });
  };
  paint();
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    store.toggleFavorite(state.collection, entryKey);
    paint();
    synth.playTap();
    if (el.screens.collection.classList.contains('is-active')) renderCollection();
  });
}

/** Attach the drawn data. Rarity is only set here, on the hidden front face. */
function bindCards(pulls) {
  state.cards.forEach((card, i) => {
    const pull = pulls[i];
    if (!pull) return;
    applyRarityVars(card, pull.rarity);
    const front = card.querySelector('.card-front');
    fillFront(front, { ...pull.article, price: pull.price, packIcon: pull.packIcon }, pull.rarity);
    wireFavButton(front.querySelector('.fav-button'), pull.article.key);
    card.addEventListener('click', () => {
      if (!card.classList.contains('is-revealed')) return;
      openCardDetail(pull.article.key, { ...pull.article, price: pull.price, packIcon: pull.packIcon }, pull.rarity);
    });
  });
}

/* --- reveal: a deck you can page through both ways ------------------------ */

/**
 * Position every card from its offset to the current index. A held card only
 * *leans* — tilting on its own axes rather than sliding around the screen.
 */
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

function updateRevealProgress() {
  el.openProgress.textContent = state.pulls.length
    ? t('cardOf', { i: Math.min(state.index + 1, state.pulls.length), n: state.pulls.length })
    : '';
}

async function revealCurrent() {
  const card = state.cards[state.index];
  const pull = state.pulls[state.index];
  if (!card || !pull) return;

  updateRevealProgress();
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
  el.packSummary.replaceChildren(...state.pulls.map((pull, i) => {
    const data = { ...pull.article, price: pull.price, packIcon: pull.packIcon };
    const card = buildStaticCard(data, pull.rarity, pull.article.key);
    card.classList.add('summary-card');
    card.style.animationDelay = `${i * 70}ms`;
    return card;
  }));
  el.openScreen.classList.replace('phase-reveal', 'phase-summary');
  el.openProgress.textContent = t('packSummary', { n: state.pulls.length });
  el.openHint.textContent = t('packDone');
  el.revealActions.classList.add('is-ready');

  // Levels earned by this pack are celebrated now the cards have all been
  // seen, rather than interrupting the reveal.
  setTimeout(drainLevelUps, 700);
}

function initSwipe() {
  el.cardStack.addEventListener('pointerdown', (event) => {
    if (!el.openScreen.classList.contains('phase-reveal') || !state.cards.length) return;
    const card = state.cards[state.index];
    card?.classList.add('is-dragging');
    synth.resume();

    trackDrag(event, {
      // Lean, don't travel: the card turns on its axes and stays put.
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

/* --- experience and levels ------------------------------------------------ */

/**
 * XP comes from the cards themselves, so opening is the only way to level.
 * The gain is shown as a small rising number rather than a dialog, and the
 * level-up itself waits for a quiet moment — walking a player through a
 * level-up while cards are still flipping would step on the reveal.
 */
function awardXp(pulls) {
  const gained = pulls.reduce((sum, pull) => sum + xpForCard(pull.rarity.id), 0);
  const levels = addXp(state.profile.progress, gained);
  if (levels.length) state.profile.pendingLevels.push(...levels);
  store.saveProfile(state.profile);
  showXpPop(gained);
  return { gained, levels };
}

let xpPopTimer = null;
function showXpPop(amount) {
  if (amount <= 0) return;
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

/** Show the next queued level-up, if any. Called once the pack is done. */
function drainLevelUps() {
  const level = state.profile.pendingLevels[0];
  if (level == null) return false;
  showLevelUp(level);
  return true;
}

function showLevelUp(level) {
  const reward = rewardForLevel(level);
  const rank = rankFor(level);

  el.levelTitle.textContent = t('levelUpTitle');
  el.levelBody.textContent = t('levelUpBody', { level, rank: tx(rank.name) });
  el.levelFrom.textContent = String(level - 1);
  el.levelTo.textContent = String(level);
  el.levelReward.replaceChildren(rewardCard(reward));
  el.levelClaim.textContent = t('claimReward');
  el.levelClaim.onclick = () => claimLevel(level, reward);

  el.levelFill.style.transition = 'none';
  el.levelFill.style.width = '0%';
  el.levelModal.hidden = false;
  requestAnimationFrame(() => {
    el.levelFill.style.transition = '';
    el.levelFill.style.width = '100%';
  });
  synth.playFanfare();
}

/** A little panel describing a reward, used by both levels and daily gifts. */
function rewardCard(reward) {
  const wrap = document.createElement('div');
  wrap.className = 'reward-card';

  if (reward.spec) {
    const art = document.createElement('div');
    art.className = 'reward-art';
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

function claimLevel(level, reward) {
  if (reward.coins) store.saveWallet(store.loadWallet() + reward.coins);
  if (reward.spec) store.addBooster(state.inventory, reward.spec, 1);

  state.profile.pendingLevels = state.profile.pendingLevels.filter((l) => l !== level);
  store.saveProfile(state.profile);
  refreshWallet();
  renderRail('boosters');
  synth.playCoins();
  el.levelModal.hidden = true;

  // More than one level at once is possible on a very good pack.
  if (!drainLevelUps() && state.tab === 'profile') renderProfile();
}

/* --- profile -------------------------------------------------------------- */

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

  el.profileAvatar.innerHTML = iconSvg('profile', { size: 26 });
  el.profileLevel.textContent = atMax ? t('profileMax') : t('profileLevel', { n: level });
  el.profileRank.textContent = tx(rank.name);
  el.xpFill.style.width = `${(levelFraction(progress) * 100).toFixed(1)}%`;
  el.xpLine.textContent = atMax
    ? t('profileMax')
    : t('profileXpLine', {
        have: (progress.xp ?? 0).toLocaleString(),
        need: xpForLevel(level).toLocaleString()
      });

  el.nextRewardTitle.textContent = t('profileNextReward');
  el.nextRewardBody.replaceChildren(
    atMax ? document.createTextNode(t('profileMax')) : rewardCard(rewardForLevel(level + 1))
  );

  el.profileStatsTitle.textContent = t('profileStats');
  const entries = store.allEntries(state.collection);
  const pulled = Object.values(rarityCounts).reduce((sum, n) => sum + n, 0);
  const best = RARITIES.filter((r) => (rarityCounts[r.id] ?? 0) > 0).pop();

  const stats = [
    [t('statPlaytime'), formatDuration(state.profile.playMs ?? 0)],
    [t('statAccountAge'), new Date(state.profile.createdAt ?? Date.now())
      .toLocaleDateString(getLanguage(), { year: 'numeric', month: 'long', day: 'numeric' })],
    [t('statBoosters'), (state.profile.boostersOpened ?? 0).toLocaleString()],
    [t('statCards'), pulled.toLocaleString()],
    [t('statValue'), formatAmount(entries.reduce((sum, e) => sum + e.price * e.count, 0))],
    [t('statBest'), best ? tx(best.name) : t('none')]
  ];
  el.profileStatGrid.replaceChildren(...stats.map(([label, value]) => {
    const cell = document.createElement('div');
    cell.className = 'stat-cell';
    cell.innerHTML = '<b></b><span></span>';
    cell.querySelector('b').textContent = value;
    cell.querySelector('span').textContent = label;
    return cell;
  }));

  // Rarity breakdown: bars against the commonest tier, so the shape of a
  // collection reads at a glance rather than as eight numbers.
  el.profileRarityTitle.textContent = t('statRarity');
  const peak = Math.max(1, ...RARITIES.map((r) => rarityCounts[r.id] ?? 0));
  el.profileRarity.replaceChildren(...RARITIES.map((rarity) => {
    const count = rarityCounts[rarity.id] ?? 0;
    const row = document.createElement('div');
    row.className = 'rarity-row';
    row.innerHTML = `
      <span class="rarity-name"></span>
      <span class="rarity-track"><span class="rarity-fill"></span></span>
      <span class="rarity-count"></span>`;
    const name = row.querySelector('.rarity-name');
    name.textContent = tx(rarity.name);
    name.style.color = rarity.color;
    const fill = row.querySelector('.rarity-fill');
    fill.style.width = `${((count / peak) * 100).toFixed(1)}%`;
    fill.style.background = rarity.color;
    row.querySelector('.rarity-count').textContent = count.toLocaleString();
    return row;
  }));
}

/* --- card detail ---------------------------------------------------------- */

/** A face-up card with no back and no flip — summary, binder and detail. */
function buildStaticCard(data, rarity, entryKey = null, { fav = true } = {}) {
  const card = document.createElement('article');
  card.className = 'card collection-card is-revealed is-lit';
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

function openCardDetail(entryKey, data, rarity) {
  const entry = state.collection.entries[entryKey] ?? null;
  state.detail = { key: entryKey, data, rarity, sellArmed: false };

  const card = buildStaticCard(data, rarity, null, { fav: false });
  card.classList.add('detail-card');
  el.cardDetail.replaceChildren(card);
  attachTilt(card);

  el.detailTitle.textContent = data.title;
  el.detailSub.textContent = data.description || data.sourceName || '';
  el.detailFacts.innerHTML = [
    `<span class="fact rarity-badge">${tx(rarity.name)}</span>`,
    `<span class="fact">${money(data.price)}</span>`,
    data.views ? `<span class="fact">${t('viewsPerMonth', { views: formatViews(data.views) })}</span>` : '',
    entry && entry.count > 1 ? `<span class="fact">${t('copiesOwned', { n: entry.count })}</span>` : ''
  ].filter(Boolean).join('');
  el.detailExtract.textContent = data.extract;
  el.detailRead.href = data.url;
  el.detailRead.textContent = t('read');

  // Selling only makes sense for a card that is actually in the binder.
  el.detailSell.hidden = !entry;
  if (entry) paintSellButton();

  el.cardModal.hidden = false;
  synth.playWhoosh(true);
}

function paintSellButton() {
  const { key, sellArmed } = state.detail;
  const entry = state.collection.entries[key];
  if (!entry) { el.detailSell.hidden = true; return; }
  const amount = sellPriceFor(entry.price);
  el.detailSell.classList.toggle('is-armed', sellArmed);
  el.detailSell.innerHTML = sellArmed ? t('sellConfirm') : t('sell', { amount: money(amount) });
}

function handleSell() {
  const detail = state.detail;
  if (!detail) return;
  const entry = state.collection.entries[detail.key];
  if (!entry) return;

  // First tap arms, second confirms — the button becomes its own dialog.
  if (!detail.sellArmed) {
    detail.sellArmed = true;
    paintSellButton();
    synth.playTap();
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
  updateTabCount();
  synth.playCoins();
  toast(t('sold', { amount: money(amount) }), 'ok');
  closeCardDetail();
  renderCollection();
}

function closeCardDetail() {
  el.cardModal.hidden = true;
  state.detail = null;
  synth.playWhoosh(false);
}

/** Hold and move to lean the card — it turns on its axes, it doesn't travel. */
function attachTilt(card) {
  card.addEventListener('pointerdown', (event) => {
    event.preventDefault();
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

/* --- collection ----------------------------------------------------------- */

const option = (value, label) => {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  return opt;
};

function renderFilterControls() {
  const entries = store.allEntries(state.collection);
  const packs = [...new Map(entries.map((e) => [e.packId, e.packName])).entries()]
    .sort((a, b) => String(a[1]).localeCompare(String(b[1])));

  el.filterSearch.placeholder = t('searchTitles');
  el.filterPack.replaceChildren(option('', t('allPacks')), ...packs.map(([id, name]) => option(id, name ?? id)));
  el.filterPack.value = state.filters.pack;
  el.filterRarity.replaceChildren(option('', t('allRarities')), ...RARITIES.map((r) => option(r.id, tx(r.name))));
  el.filterRarity.value = state.filters.rarity;
  el.filterBand.replaceChildren(option('', t('anyPopularity')), ...POPULARITY_BANDS.map((b) => option(b.id, b.name)));
  el.filterBand.value = state.filters.band;
  el.filterPrice.replaceChildren(option('', t('anyPrice')),
    ...[100, 500, 1500, 5000, 12000].map((p) => option(String(p), t('priceOver', { amount: formatAmount(p) }))));
  el.filterPrice.value = state.filters.minPrice;
  el.filterSort.replaceChildren(...store.SORTS.map((s) => option(s.id, store.sortLabel(s))));
  el.filterSort.value = state.filters.sort;

  el.filterFav.classList.toggle('is-on', state.filters.favoritesOnly);
  el.filterFav.setAttribute('aria-pressed', String(state.filters.favoritesOnly));
  el.filterFavLabel.textContent = t('favourites');
  el.filterFav.querySelector('.chip-star').innerHTML =
    iconSvg(state.filters.favoritesOnly ? 'starFilled' : 'star', { size: 15 });
  el.filterReset.textContent = t('reset');
}

function activeFilterCount() {
  const f = state.filters;
  return [f.search, f.pack, f.rarity, f.band, f.minPrice].filter(Boolean).length
    + (f.favoritesOnly ? 1 : 0) + (f.sort !== 'recent' ? 1 : 0);
}

function renderCollection() {
  const entries = store.allEntries(state.collection);
  const stats = store.collectionStats(entries);

  el.collectionStats.innerHTML = `
    <span class="stat"><b>${stats.copies}</b> ${t('copies')}</span>
    <span class="stat"><b>${money(stats.value)}</b> ${t('total')}</span>
    <span class="stat"><b>${stats.favorites}</b> ${t('favourites')}</span>`;

  renderFilterControls();
  el.filterToggleLabel.textContent = state.filtersOpen ? t('hideFilters') : t('filters');
  el.filterIcon.innerHTML = iconSvg('filter', { size: 15 });
  const active = activeFilterCount();
  el.filterSummary.textContent = active ? `${active}` : '';
  el.filterSummary.hidden = !active;

  const visible = store.filterEntries(entries, state.filters);
  if (!entries.length) {
    el.collectionEmpty.hidden = false;
    el.collectionEmpty.textContent = t('emptyCollection');
  } else if (!visible.length) {
    el.collectionEmpty.hidden = false;
    el.collectionEmpty.textContent = t('noMatches');
  } else {
    el.collectionEmpty.hidden = true;
  }

  el.collectionGrid.replaceChildren(...visible.map((entry) => {
    const card = buildStaticCard(entry, rarityById(entry.rarityId), entry.key);
    if (entry.count > 1) {
      const badge = document.createElement('span');
      badge.className = 'copy-badge';
      badge.textContent = `×${entry.count}`;
      card.appendChild(badge);
    }
    return card;
  }));
}

const updateTabCount = () => {
  el.tabCount.textContent = String(store.allEntries(state.collection).length);
};

function initFilters() {
  const update = (key) => (event) => { state.filters[key] = event.target.value; renderCollection(); };
  el.filterPack.addEventListener('change', update('pack'));
  el.filterRarity.addEventListener('change', update('rarity'));
  el.filterBand.addEventListener('change', update('band'));
  el.filterPrice.addEventListener('change', update('minPrice'));
  el.filterSort.addEventListener('change', update('sort'));
  el.filterSearch.addEventListener('input', (e) => { state.filters.search = e.target.value; renderCollection(); });
  el.filterFav.addEventListener('click', () => {
    state.filters.favoritesOnly = !state.filters.favoritesOnly;
    synth.playTap();
    renderCollection();
  });
  el.filterReset.addEventListener('click', () => {
    state.filters = { search: '', pack: '', rarity: '', band: '', minPrice: '', sort: 'recent', favoritesOnly: false };
    el.filterSearch.value = '';
    renderCollection();
  });
  el.filterToggle.addEventListener('click', () => {
    state.filtersOpen = !state.filtersOpen;
    el.filters.hidden = !state.filtersOpen;
    el.filterToggle.setAttribute('aria-expanded', String(state.filtersOpen));
    synth.playWhoosh(state.filtersOpen);
    renderCollection();
  });
}

/* --- custom boosters ------------------------------------------------------ */

function customPackName(typed, sitename) {
  const trimmed = (sitename ?? '').replace(/\s*(fandom|wiki|wikia)\s*$/i, '').trim();
  return trimmed.length >= 2 ? trimmed : typed.replace(/\s+/g, ' ').trim();
}

function setCustomStatus(text, kind) {
  el.customStatus.textContent = text;
  el.customStatus.className = `custom-status is-${kind}`;
}

async function createCustomPack(event) {
  event.preventDefault();
  if (state.busy) return;

  const raw = el.customInput.value.trim();
  if (!raw) { setCustomStatus(t('typeNameFirst'), 'error'); return; }

  state.busy = true;
  el.customSubmit.disabled = true;
  el.customInput.disabled = true;
  setCustomStatus(t('creating'), 'working');

  try {
    const wiki = await resolveCustomWiki(raw);
    const host = new URL(wiki.apiUrl).host + new URL(wiki.apiUrl).pathname.replace('/api.php', '');
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

    // Building a pack does NOT hand over a booster. It used to, which meant a
    // free openable pack out of thin air for anyone who typed a name — and
    // the cards inside could be sold. Creating a pack now puts it on sale in
    // the Shop, on its own shelf, where it is bought like anything else.
    renderRail('custom');
    renderShop();
    setCustomStatus(t('createdGoShop', { name: pack.name }), 'ok');
    el.customInput.value = '';
    synth.playPurchase();
  } catch (err) {
    setCustomStatus(t('createFailed'), 'error');
    synth.playDenied();
  } finally {
    state.busy = false;
    el.customSubmit.disabled = false;
    el.customInput.disabled = false;
  }
}

/* --- daily gift ----------------------------------------------------------- */

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
  // The coins label carries the Buckarooz glyph, which is drawn SVG from
  // icons.js — our own markup, never anything remote.
  tile.querySelector('.gift-label').innerHTML = giftLabel(gift);

  const art = tile.querySelector('.gift-art');
  if (gift.kind === 'coins') art.innerHTML = buckSvg({ size: 22 });
  else if (gift.kind === 'card') art.innerHTML = iconSvg('collection', { size: 22 });
  else art.innerHTML = iconSvg('packs', { size: 22 });

  // A claimed day is replaced by its tick: the board is a record as well as
  // a preview, so you can see at a glance how far in you are.
  if (status === 'claimed') tile.querySelector('.gift-check').innerHTML = iconSvg('check', { size: 18 });
  return tile;
}

function renderDaily() {
  const daily = state.profile.daily;
  const board = generateBoard(daily.board ?? 0);
  const next = nextGiftIndex(daily);
  const ready = canClaim(daily);

  el.dailyTitle.textContent = t('dailyTitle');
  el.dailyClose.textContent = t('close');
  el.dailyBody.textContent = t('dailyBody');
  el.dailyBoardLabel.textContent = t('dailyBoard', { n: (daily.board ?? 0) + 1 });

  el.dailyClaim.textContent = t('dailyClaim');
  el.dailyClaim.disabled = !ready;
  el.dailyClaim.hidden = !ready;
  el.dailyStatus.textContent = ready
    ? ''
    : `${t('dailyClaimed')} ${t('dailyNextIn', { time: formatCountdown(msUntilNextDay()) })}`;

  el.giftBoard.replaceChildren(...board.map((slot) => giftTile(
    slot,
    slot.index < next ? 'claimed' : slot.index === next ? (ready ? 'ready' : 'next') : 'locked'
  )));
}

function grantGift(gift) {
  if (gift.kind === 'coins') {
    store.saveWallet(store.loadWallet() + gift.coins);
    refreshWallet();
    synth.playCoins();
  } else {
    store.addBooster(state.inventory, gift.spec, 1);
    renderRail('boosters');
    synth.playFanfare();
  }
}

function claimGift() {
  const slot = claimDaily(state.profile.daily);
  if (!slot) return;
  store.saveProfile(state.profile);
  grantGift(slot.gift);
  toast(t('dailyGot', { reward: giftLabel(slot.gift) }), 'ok');
  renderDaily();
  updateDailyBadge();
}

function updateDailyBadge() {
  const ready = canClaim(state.profile.daily);
  el.giftDot.hidden = !ready;
  el.dailyButton.classList.toggle('is-ready', ready);
}

function openDaily({ auto = false } = {}) {
  // Auto-opening happens once a day. Dismissing without claiming leaves the
  // gift waiting and the badge lit, but the dialog does not keep reappearing
  // every time the app is reopened.
  if (auto) {
    const today = dayNumber();
    if (state.profile.daily.shownDay === today) return;
    state.profile.daily.shownDay = today;
    store.saveProfile(state.profile);
  }
  renderDaily();
  el.dailyModal.hidden = false;
  synth.playTap();
}

/* --- settings ------------------------------------------------------------- */

/** One switch. The label says what it is; the note says why you'd touch it. */
function settingRow(key, titleKey, noteKey) {
  const row = document.createElement('div');
  row.className = 'setting-row';
  row.innerHTML = `
    <div class="setting-copy"><h4></h4><p></p></div>
    <button class="switch" type="button" role="switch"><span class="switch-knob"></span></button>`;
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
    if (settings().sound) synth.playTap();
  });
  return row;
}

function renderSettings() {
  el.settingsTitle.textContent = t('settingsTitle');
  el.settingsList.replaceChildren(
    settingRow('sound', 'settingsSound', 'settingsSoundNote'),
    settingRow('flash', 'settingsFlash', 'settingsFlashNote'),
    settingRow('lowPower', 'settingsLowPower', 'settingsLowPowerNote'),
    settingRow('hints', 'settingsHints', 'settingsHintsNote')
  );

  el.settingsDataTitle.textContent = t('settingsData');
  el.settingsLanguageTitle.textContent = t('settingsLanguage');
  el.settingsLanguageNote.textContent = t('settingsLanguageNote');
  el.settingsLanguageValue.innerHTML =
    `${iconSvg('lock', { size: 14 })}<span>${LANGUAGES.find((l) => l.id === getLanguage())?.label ?? ''}</span>`;
  el.settingsResetTitle.textContent = t('settingsReset');
  el.settingsResetNote.textContent = t('settingsResetNote');
  paintResetButton();
}

let resetArmed = false;
let resetTimer = null;

function paintResetButton() {
  el.settingsReset.textContent = resetArmed ? t('settingsResetConfirm') : t('settingsReset');
  el.settingsReset.classList.toggle('is-armed', resetArmed);
}

/** Same arm-then-confirm shape as selling a card: the button is the dialog. */
function handleReset() {
  if (!resetArmed) {
    resetArmed = true;
    paintResetButton();
    synth.playTap();
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => { resetArmed = false; paintResetButton(); }, 5000);
    return;
  }
  wipeEverything();
}

function wipeEverything() {
  ['packywiki.collection.v3', 'packywiki.wallet.v1', 'packywiki.inventory.v1',
   'packywiki.profile.v1', 'packywiki.customPacks.v2', 'packywiki.language',
   'packywiki.ripDirection'].forEach((key) => {
    try { localStorage.removeItem(key); } catch { /* nothing to remove */ }
  });
  location.reload();
}

/* --- odds ----------------------------------------------------------------- */

function renderOdds() {
  el.oddsHeading.textContent = t('pullRates');
  el.oddsNote.textContent = t('oddsNote');
  el.oddsH1.textContent = t('rarity');
  el.oddsH2.textContent = t('chance');
  el.oddsClose.textContent = t('close');

  const pct = (n) => (n >= 1 ? `${n.toFixed(1)}%` : `${n.toFixed(2)}%`);
  el.oddsBody.replaceChildren(...oddsTable().map(({ rarity, percent }) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td><span class="odds-name"><span class="odds-swatch"></span><span class="odds-label"></span></span></td><td class="odds-pct"></td>`;
    const swatch = row.querySelector('.odds-swatch');
    swatch.style.color = rarity.color;
    swatch.style.background = rarity.color;
    const label = row.querySelector('.odds-label');
    label.textContent = tx(rarity.name);
    label.style.color = rarity.color;
    row.querySelector('.odds-pct').textContent = pct(percent);
    return row;
  }));
}

/** What the currency is, where it comes from and what it buys. */
function showWalletInfo() {
  el.walletTitle.textContent = t('walletTitle');
  el.walletClose.textContent = t('close');
  el.walletBalance.innerHTML = money(state.wallet);
  el.walletWhat.textContent = t('walletWhat');
  el.walletEarnTitle.textContent = t('walletEarnTitle');
  el.walletEarn.textContent = t('walletEarn');
  el.walletSpendTitle.textContent = t('walletSpendTitle');
  el.walletSpend.textContent = t('walletSpend');
  el.walletNote.textContent = t('walletNote');
  el.walletModal.hidden = false;
  synth.playTap();
}

/* --- first run ------------------------------------------------------------ */

function showWelcome() {
  el.welcomeTitle.textContent = t('welcomeTitle');
  el.welcomeBody.textContent = t('welcomeBody');
  el.langChoices.replaceChildren(...LANGUAGES.map((lang) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `lang-choice${lang.id === getLanguage() ? ' is-active' : ''}`;
    button.dataset.lang = lang.id;
    button.textContent = lang.label;
    button.addEventListener('click', () => {
      setLanguage(lang.id);
      synth.playTap();
      showStarter();
    });
    return button;
  }));
  el.starterPanel.hidden = true;
  el.welcomeModal.hidden = false;
}

function showStarter() {
  // Re-label everything now that a language is set.
  applyStrings();
  el.welcomeTitle.textContent = t('welcomeTitle');
  el.welcomeBody.textContent = t('welcomeBody');
  el.langChoices.querySelectorAll('.lang-choice').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.lang === getLanguage()));

  store.grantStarter(state.profile);
  const starters = shuffle(THEME_PACKS).slice(0, STARTER_PACKS).map((theme) => ({
    kind: 'theme', themeId: theme.id, rarityId: null, cards: STARTER_PACK_CARDS
  }));
  starters.forEach((spec) => store.addBooster(state.inventory, spec, 1));
  refreshWallet();

  el.starterTitle.textContent = t('starterTitle');
  el.starterBody.innerHTML = t('starterBody', { coins: money(STARTER_COINS), packs: STARTER_PACKS });
  el.starterLoot.replaceChildren(
    ...starters.map((spec) => {
      const wrap = document.createElement('div');
      wrap.className = 'loot-item';
      wrap.appendChild(buildBooster(spec, { size: 'is-tiny' }));
      return wrap;
    })
  );
  el.starterGo.textContent = t('letsGo');
  el.starterPanel.hidden = false;
  synth.playFanfare();

  renderRail('boosters');
  renderRail('custom');
  renderShop();
  updateTimedBadge();
  updateDailyBadge();
  loadPackArt();
}

/* --- strings -------------------------------------------------------------- */

function applyStrings() {
  document.documentElement.lang = getLanguage();
  el.brandSub.textContent = t('tagline');
  el.oddsButton.textContent = t('odds');
  el.dailyButtonLabel.textContent = t('dailyOpen');
  el.giftIcon.innerHTML = iconSvg('gift', { size: 15 });
  const TAB_KEYS = {
    boosters: 'tabBoosters', timed: 'tabTimed', custom: 'tabCustom', shop: 'tabShop',
    collection: 'tabCollection', profile: 'tabProfile', settings: 'tabSettings'
  };
  el.tabs.forEach((tab) => {
    tab.querySelector('.tab-label').textContent = t(TAB_KEYS[tab.dataset.tab]);
  });
  el.railHint.textContent = t('swipeShelf');
  el.customIntro.textContent = `${t('customIntro')} ${t('customOwnNote')}`;
  el.customInput.placeholder = t('customPlaceholder');
  el.customSubmit.textContent = t('create');
  el.customOpen.textContent = t('openPack');
  el.backButton.textContent = `← ${t('allBoosters')}`;
  el.backToShelf.textContent = t('back');
  el.cardModalClose.innerHTML = iconSvg('close', { size: 18 });
  el.shopIntro.textContent = t('shopIntro');
  renderOdds();
}

/* --- wiring --------------------------------------------------------------- */

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

/** Rebuild a minimal spec from an id, for repainting art after a late load. */
function specFromId(id) {
  const [kind, theme, rarity, cards] = String(id).split('|');
  if (kind === 'custom') return null;
  return {
    kind, themeId: theme === 'any' ? null : theme,
    rarityId: rarity === 'std' ? null : rarity, cards: Number(cards) || 5
  };
}

function init() {
  el.brandMark.innerHTML = logoSvg({ size: 30 });
  applySettings();
  applyStrings();
  refreshWallet();
  updateTabCount();
  updateTimedBadge();
  updateDailyBadge();
  initRail('boosters');
  initRail('custom');
  initSwipe();
  initFilters();
  renderRail('boosters');
  renderRail('custom');
  renderCollection();
  renderShop();
  // Pack art is language-specific, so it waits until a language exists —
  // otherwise the first run fetches English images and keeps them.
  if (languageChosen()) loadPackArt();

  el.railPrev.addEventListener('click', () => scrollRailTo('boosters', (state.rails.boosters?.focusIndex ?? 0) - 1));
  el.railNext.addEventListener('click', () => scrollRailTo('boosters', (state.rails.boosters?.focusIndex ?? 0) + 1));
  el.customForm.addEventListener('submit', createCustomPack);
  const leaveOpenScreen = () => {
    const home = homeTabFor(state.spec);
    if (home === 'timed') renderTimed();
    showScreen(home);
  };
  el.backButton.addEventListener('click', leaveOpenScreen);
  el.backToShelf.addEventListener('click', leaveOpenScreen);

  el.tabs.forEach((tab) => tab.addEventListener('click', () => {
    const name = tab.dataset.tab;
    synth.playTap();
    if (name === 'collection') renderCollection();
    if (name === 'shop') { payStipend(); renderShop(); }
    if (name === 'timed') renderTimed();
    if (name === 'profile') renderProfile();
    if (name === 'settings') renderSettings();
    showScreen(name);
  }));

  el.wallet.addEventListener('click', showWalletInfo);
  el.walletClose.addEventListener('click', () => { el.walletModal.hidden = true; });
  el.walletModal.addEventListener('click', (e) => { if (e.target === el.walletModal) el.walletModal.hidden = true; });

  el.oddsButton.addEventListener('click', () => { el.oddsModal.hidden = false; synth.playTap(); });
  el.oddsClose.addEventListener('click', () => { el.oddsModal.hidden = true; });
  el.oddsModal.addEventListener('click', (e) => { if (e.target === el.oddsModal) el.oddsModal.hidden = true; });

  el.cardModalClose.addEventListener('click', closeCardDetail);
  el.cardModal.addEventListener('click', (e) => { if (e.target === el.cardModal) closeCardDetail(); });
  el.detailSell.addEventListener('click', handleSell);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    el.oddsModal.hidden = true;
    el.walletModal.hidden = true;
    el.dailyModal.hidden = true;
    if (!el.cardModal.hidden) closeCardDetail();
  });

  el.dailyButton.addEventListener('click', openDaily);
  el.dailyClose.addEventListener('click', () => { el.dailyModal.hidden = true; });
  el.dailyModal.addEventListener('click', (e) => { if (e.target === el.dailyModal) el.dailyModal.hidden = true; });
  el.dailyClaim.addEventListener('click', () => { synth.resume(); claimGift(); });
  el.settingsReset.addEventListener('click', handleReset);

  // Playtime is measured between visibility changes, and the shared clock is
  // parked entirely while the app is in the background.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      visibleSince = Date.now();
      syncTimed();
      updateTimedBadge();
      updateDailyBadge();
    } else {
      flushPlaytime();
      visibleSince = null;
      // Nothing is playing in the background, so let the audio hardware go.
      synth.suspend();
    }
    syncTicker();
  });
  window.addEventListener('pagehide', flushPlaytime);

  el.starterGo.addEventListener('click', () => {
    el.welcomeModal.hidden = true;
    synth.playTap();
    showScreen('boosters');
    if (canClaim(state.profile.daily)) openDaily({ auto: true });
  });

  if (!languageChosen() || !state.profile.started) showWelcome();
  else {
    payStipend();
    // A gift waiting is the first thing a returning player should see.
    if (canClaim(state.profile.daily)) openDaily({ auto: true });
  }
}

init();

window.__packywiki = {
  state, store, RARITIES, synth, draw: drawArticles,
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
  giveBooster(spec) { store.addBooster(state.inventory, spec, 1); renderRail('boosters'); renderRail('custom'); },
  resetAll: wipeEverything,
  addXp(amount = 5000) {
    const levels = addXp(state.profile.progress, amount);
    if (levels.length) state.profile.pendingLevels.push(...levels);
    store.saveProfile(state.profile);
    drainLevelUps();
    return state.profile.progress;
  },
  timedShare: timedOddsShare,
  timedScarcity: timedTopScarcity,
  giveTimed(n = 5) {
    state.profile.timed.count += n;
    store.saveProfile(state.profile);
    renderTimed();
  }
};
