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
    boosters: $('#screen-boosters'), custom: $('#screen-custom'),
    shop: $('#screen-shop'), open: $('#screen-open'), collection: $('#screen-collection')
  },
  brandMark: $('#brand-mark'), brandSub: $('#brand-sub'),
  tabs: [...document.querySelectorAll('.tab')], tabCount: $('#tab-count'),
  wallet: $('#wallet'), oddsButton: $('#odds-button'),
  muteButton: $('#mute-button'),

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

  oddsModal: $('#odds-modal'), oddsClose: $('#odds-close'), oddsBody: $('#odds-body'),
  oddsHeading: $('#odds-heading'), oddsNote: $('#odds-note'), oddsH1: $('#odds-h1'), oddsH2: $('#odds-h2'),

  welcomeModal: $('#welcome-modal'), welcomeTitle: $('#welcome-title'), welcomeBody: $('#welcome-body'),
  langChoices: $('#lang-choices'), starterPanel: $('#starter-panel'), starterTitle: $('#starter-title'),
  starterBody: $('#starter-body'), starterLoot: $('#starter-loot'), starterGo: $('#starter-go'),

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

/* --- shell ---------------------------------------------------------------- */

function showScreen(name) {
  Object.entries(el.screens).forEach(([key, node]) => node.classList.toggle('is-active', key === name));
  if (name !== 'open') state.tab = name;
  el.tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tab === state.tab));
  window.scrollTo({ top: 0 });
}

function applyAccent(colours) {
  document.documentElement.style.setProperty('--accent', colours.accent);
  document.documentElement.style.setProperty('--accent2', colours.accent2);
}

function refreshWallet() {
  state.wallet = store.loadWallet();
  el.wallet.innerHTML = money(state.wallet);
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

let shopTimer = null;

function renderShop() {
  el.shopIntro.textContent = t('shopIntro');
  const rows = generateShop(windowIndexAt(), state.customPacks);

  el.shopRows.replaceChildren(...rows.map((row) => {
    const section = document.createElement('section');
    section.className = 'shop-row';
    section.innerHTML = `<h3 class="shop-row-title"></h3><div class="shop-shelf"></div>`;
    section.querySelector('.shop-row-title').textContent = row.title;
    const shelf = section.querySelector('.shop-shelf');

    shelf.replaceChildren(...row.specs.map(({ id, spec, price }) => {
      const item = document.createElement('div');
      item.className = 'shop-item';
      item.dataset.spec = id;
      item.appendChild(buildBooster(spec, { size: 'is-small' }));

      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = 'buy-button';
      buy.innerHTML = `<span class="buy-label">${t('buy')}</span><span class="buy-price">${money(price)}</span>`;
      buy.addEventListener('click', () => purchase(spec, price, buy));
      item.appendChild(buy);
      return item;
    }));
    return section;
  }));

  tickRestock();
  clearInterval(shopTimer);
  shopTimer = setInterval(tickRestock, 1000);
}

function tickRestock() {
  const remaining = nextRefreshAt() - Date.now();
  el.restock.textContent = t('restockIn', { time: formatCountdown(remaining) });
  if (remaining <= 0) {
    payStipend();
    renderShop();
  }
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
  el.backButton.textContent = `← ${t('allBoosters')}`;
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
  el.flash.style.setProperty('--flash-peak', String(intensity));
  el.flash.classList.remove('is-firing');
  void el.flash.offsetWidth;
  el.flash.classList.add('is-firing');
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
    <span class="stat"><b>${stats.unique}</b> ${t('unique')}</span>
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

    // A newly built booster is free — you designed it.
    store.addBooster(state.inventory, {
      kind: 'custom', themeId: null, rarityId: null, cards: 5,
      wiki, customName: pack.name, customTagline: pack.tagline, customId: pack.id,
      icon: pack.icon, accent: pack.accent, accent2: pack.accent2, art: pack.art
    }, 1);

    renderRail('custom');
    setCustomStatus(t('createOk', {
      name: pack.name, n: wiki.articles.toLocaleString(), wiki: wiki.sitename
    }), 'ok');
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
  loadPackArt();
}

/* --- strings -------------------------------------------------------------- */

function applyStrings() {
  document.documentElement.lang = getLanguage();
  el.brandSub.textContent = t('tagline');
  el.oddsButton.textContent = t('odds');
  const muted = el.muteButton.getAttribute('aria-pressed') === 'true';
  el.muteButton.textContent = muted ? t('soundOff') : t('soundOn');
  const TAB_KEYS = { boosters: 'tabBoosters', custom: 'tabCustom', shop: 'tabShop', collection: 'tabCollection' };
  el.tabs.forEach((tab) => {
    tab.querySelector('.tab-label').textContent = t(TAB_KEYS[tab.dataset.tab]);
  });
  el.railHint.textContent = t('swipeShelf');
  el.customIntro.textContent = t('customIntro');
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
  applyStrings();
  refreshWallet();
  updateTabCount();
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
  el.backButton.addEventListener('click', () => showScreen(state.spec?.kind === 'custom' ? 'custom' : 'boosters'));
  el.backToShelf.addEventListener('click', () => showScreen(state.spec?.kind === 'custom' ? 'custom' : 'boosters'));

  el.tabs.forEach((tab) => tab.addEventListener('click', () => {
    const name = tab.dataset.tab;
    synth.playTap();
    if (name === 'collection') renderCollection();
    if (name === 'shop') { payStipend(); renderShop(); }
    showScreen(name);
  }));

  el.oddsButton.addEventListener('click', () => { el.oddsModal.hidden = false; synth.playTap(); });
  el.oddsClose.addEventListener('click', () => { el.oddsModal.hidden = true; });
  el.oddsModal.addEventListener('click', (e) => { if (e.target === el.oddsModal) el.oddsModal.hidden = true; });

  el.cardModalClose.addEventListener('click', closeCardDetail);
  el.cardModal.addEventListener('click', (e) => { if (e.target === el.cardModal) closeCardDetail(); });
  el.detailSell.addEventListener('click', handleSell);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    el.oddsModal.hidden = true;
    if (!el.cardModal.hidden) closeCardDetail();
  });

  el.muteButton.addEventListener('click', () => {
    const next = el.muteButton.getAttribute('aria-pressed') !== 'true';
    synth.resume();
    synth.setMuted(next);
    el.muteButton.setAttribute('aria-pressed', String(next));
    el.muteButton.textContent = next ? t('soundOff') : t('soundOn');
  });

  el.starterGo.addEventListener('click', () => {
    el.welcomeModal.hidden = true;
    synth.playTap();
    showScreen('boosters');
  });

  if (!languageChosen() || !state.profile.started) showWelcome();
  else payStipend();
}

init();

window.__packywiki = {
  state, store, RARITIES,
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
  resetAll() {
    ['packywiki.collection.v3', 'packywiki.wallet.v1', 'packywiki.inventory.v1',
     'packywiki.profile.v1', 'packywiki.customPacks.v2', 'packywiki.language',
     'packywiki.ripDirection'].forEach((k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
    location.reload();
  }
};
