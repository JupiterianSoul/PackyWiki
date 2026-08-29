/**
 * PackyWiki — app controller.
 *
 * Screens: a horizontal booster shelf, one combined open+reveal screen, and a
 * collection binder. Open and reveal are deliberately ONE screen: the cards
 * fly out of the pack and settle into the stack in place, so there is never a
 * blank loading screen between tearing a pack and seeing its cards.
 */

import { THEME_PACKS, CUSTOM_KINDS, customKindById, packById, heroTitles } from './data/packs.js';
import { RARITIES, rollRarity, rarityById, rarityRank, oddsTable } from './data/rarities.js';
import { iconSvg, logoSvg, buckSvg } from './data/icons.js';
import { drawArticles, resolveCustomWiki, fetchPackArt, fetchCustomPackArt } from './wiki.js';
import { priceFor, formatAmount, formatViews, bandFor, POPULARITY_BANDS } from './pricing.js';
import * as store from './collection.js';
import { synth } from './audio.js';

/* --- tuning --------------------------------------------------------------- */
const RIP_COMMIT = 0.62;      // drag past this and the pack tears the rest of the way
const RIP_TICK_STEP = 0.055;  // how often the tearing sound fires while dragging
const RIP_LOCK_SLOP = 10;     // px of drag before the tear direction is decided
const SWIPE_COMMIT = 78;
const TAP_SLOP = 7;
const EMERGE_STAGGER = 110;   // ms between cards flying out of the pack
const EMERGE_DURATION = 820;  // must match card-emerge in style.css
const PREFETCH_DELAY = 350;   // ms after the shelf settles before pulling cards

const $ = (sel) => document.querySelector(sel);
const clamp01 = (n) => Math.min(1, Math.max(0, n));
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
 * Run a drag from a pointerdown.
 *
 * Move and release are tracked on `window`, not on the element: a drag almost
 * always ends outside the thing you grabbed (you swipe a card right past its
 * own edge), and setPointerCapture is not dependable enough to rely on — when
 * it silently fails the release is delivered elsewhere and the gesture just
 * dies. Window listeners cannot miss it.
 */
function trackDrag(event, { onMove, onEnd }) {
  const startX = event.clientX;
  const startY = event.clientY;

  const move = (e) => onMove(e.clientX - startX, e.clientY - startY, e);
  const end = (e) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    onEnd(e.clientX - startX, e.clientY - startY, e);
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

const el = {
  screens: {
    packs: $('#screen-packs'),
    open: $('#screen-open'),
    collection: $('#screen-collection')
  },
  brandMark: $('#brand-mark'),
  tabs: document.querySelectorAll('.tab'),
  tabCount: $('#tab-count'),

  rail: $('#pack-rail'),
  railPrev: $('#rail-prev'),
  railNext: $('#rail-next'),
  railName: $('#rail-name'),
  railTagline: $('#rail-tagline'),
  railOpen: $('#rail-open'),

  customForm: $('#custom-form'),
  customKinds: $('#custom-kinds'),
  customInput: $('#custom-input'),
  customSubmit: $('#custom-submit'),
  customStatus: $('#custom-status'),

  openScreen: $('#screen-open'),
  openTitle: $('#open-title'),
  openProgress: $('#open-progress'),
  boosterSlot: $('#booster-slot'),
  cardStack: $('#card-stack'),
  openHint: $('#open-hint'),
  packSummary: $('#pack-summary'),
  revealActions: $('#reveal-actions'),
  backToShelf: $('#back-to-shelf'),
  backButton: $('#back-button'),

  collectionStats: $('#collection-stats'),
  collectionGrid: $('#collection-grid'),
  collectionEmpty: $('#collection-empty'),
  filterSearch: $('#filter-search'),
  filterPack: $('#filter-pack'),
  filterRarity: $('#filter-rarity'),
  filterBand: $('#filter-band'),
  filterPrice: $('#filter-price'),
  filterSort: $('#filter-sort'),
  filterFav: $('#filter-fav'),
  filterReset: $('#filter-reset'),

  flash: $('#flash'),
  muteButton: $('#mute-button'),
  muteLabel: $('#mute-label'),
  oddsButton: $('#odds-button'),
  oddsModal: $('#odds-modal'),
  oddsClose: $('#odds-close'),
  oddsBody: $('#odds-body')
};

const RIP_DIR_KEY = 'packywiki.ripDirection';

const state = {
  packs: [],
  focusIndex: 0,
  pack: null,
  customPacks: store.loadCustomPacks(),
  customKind: CUSTOM_KINDS[0].id,
  collection: store.loadCollection(),
  art: new Map(),
  /** Locked after the player's first tear: 1 = rip rightwards, -1 = leftwards. */
  ripDir: Number(localStorage.getItem?.(RIP_DIR_KEY)) || 0,
  prefetch: null,        // { packId, promise }
  prefetchTimer: null,
  busy: false,
  pulls: [],
  cards: [],
  index: 0,
  seen: new Set(),
  filters: { search: '', pack: '', rarity: '', band: '', minPrice: '', sort: 'recent', favoritesOnly: false }
};

const priceHtml = (amount) => `${buckSvg({ size: 12 })}${formatAmount(amount)}`;

/* --- shell ---------------------------------------------------------------- */

function showScreen(name) {
  Object.entries(el.screens).forEach(([key, node]) => node.classList.toggle('is-active', key === name));
  const tabFor = name === 'collection' ? 'collection' : 'packs';
  el.tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tab === tabFor));
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function applyAccent(pack) {
  document.documentElement.style.setProperty('--accent', pack.accent);
  document.documentElement.style.setProperty('--accent2', pack.accent2);
}

const allPacks = () => [...THEME_PACKS, ...state.customPacks];

/* --- the booster --------------------------------------------------------- */

/**
 * Booster art. `interactive` adds the tear strip, the mouth behind it and the
 * rip line; the shelf uses the same body without any of that.
 */
function buildBooster(pack, { interactive = false } = {}) {
  const booster = document.createElement('div');
  booster.className = 'booster';
  booster.dataset.pack = pack.id;
  booster.style.setProperty('--accent', pack.accent);
  booster.style.setProperty('--accent2', pack.accent2);

  booster.innerHTML = `
    <div class="booster-body">
      ${interactive ? '<div class="booster-mouth" aria-hidden="true"></div>' : ''}
      <div class="booster-crimp is-top" aria-hidden="true"></div>
      <div class="booster-crimp is-bottom" aria-hidden="true"></div>
      <div class="booster-face">
        <span class="booster-logo">${logoSvg({ size: 34 })}</span>
        <div class="booster-photo"></div>
        <div class="booster-banner"><span class="booster-name"></span></div>
        <span class="booster-count"></span>
      </div>
      ${interactive ? `
        <div class="booster-tear" aria-hidden="true"></div>
        <div class="rip-front" aria-hidden="true"></div>
        <div class="rip-zone" role="slider" tabindex="0"
             aria-label="Slide the rip line sideways to tear the pack open"
             aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="rip-line"></div>
          <div class="rip-grip is-left"></div>
          <div class="rip-grip is-right"></div>
        </div>` : ''}
    </div>`;

  booster.querySelector('.booster-name').textContent = pack.name;
  booster.querySelector('.booster-count').textContent = `${pack.cards} cards`;
  paintPackPhoto(booster.querySelector('.booster-photo'), pack);
  if (interactive && state.ripDir) booster.dataset.ripDir = String(state.ripDir);
  return booster;
}

/** Real photograph if we have one, the pack's drawn icon if we don't. */
function paintPackPhoto(node, pack) {
  const src = pack.art ?? state.art.get(pack.hero);
  node.replaceChildren();
  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      img.remove();
      node.insertAdjacentHTML('afterbegin',
        `<div class="booster-photo-fallback">${iconSvg(pack.icon, { size: 54 })}</div>`);
    });
    node.appendChild(img);
  } else {
    node.insertAdjacentHTML('afterbegin',
      `<div class="booster-photo-fallback">${iconSvg(pack.icon, { size: 54 })}</div>`);
  }
}

/* --- the shelf ------------------------------------------------------------ */

function renderRail() {
  state.packs = allPacks();
  el.rail.replaceChildren(
    ...state.packs.map((pack, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'rail-item';
      item.dataset.index = String(index);
      item.setAttribute('role', 'option');
      item.setAttribute('aria-label', `${pack.name} booster`);
      item.appendChild(buildBooster(pack));
      item.addEventListener('click', () => {
        if (index === state.focusIndex) openScreenFor(pack.id);
        else scrollToIndex(index);
      });
      return item;
    })
  );
  state.focusIndex = Math.min(state.focusIndex, state.packs.length - 1);
  requestAnimationFrame(() => scrollToIndex(state.focusIndex, 'auto'));
}

function railItems() {
  return [...el.rail.querySelectorAll('.rail-item')];
}

function scrollToIndex(index, behavior = 'smooth') {
  const items = railItems();
  const item = items[index];
  if (!item) return;
  const left = item.offsetLeft - (el.rail.clientWidth - item.offsetWidth) / 2;
  el.rail.scrollTo({ left, behavior });
}

/** Whichever pack is nearest the centre of the shelf is the focused one. */
function updateFocus() {
  const items = railItems();
  if (!items.length) return;
  const mid = el.rail.scrollLeft + el.rail.clientWidth / 2;

  let best = 0;
  let bestDist = Infinity;
  items.forEach((item, i) => {
    const centre = item.offsetLeft + item.offsetWidth / 2;
    const dist = Math.abs(centre - mid);
    if (dist < bestDist) { bestDist = dist; best = i; }
  });

  items.forEach((item, i) => item.classList.toggle('is-focused', i === best));
  if (best === state.focusIndex && el.railName.textContent) return;

  state.focusIndex = best;
  const pack = state.packs[best];
  if (!pack) return;
  el.railName.textContent = pack.name;
  el.railTagline.textContent = pack.tagline;
  applyAccent(pack);
  el.railPrev.disabled = best === 0;
  el.railNext.disabled = best === state.packs.length - 1;
  schedulePrefetch(pack);
}

/**
 * Start pulling cards for the pack the player is looking at, before they open
 * it. By the time the tear animation finishes the data is usually already
 * here, which is what removes the wait.
 */
function schedulePrefetch(pack) {
  clearTimeout(state.prefetchTimer);
  if (state.prefetch?.packId === pack.id) return;
  state.prefetchTimer = setTimeout(() => {
    state.prefetch = { packId: pack.id, promise: drawArticles(pack).catch((err) => ({ error: err })) };
  }, PREFETCH_DELAY);
}

function initRail() {
  let ticking = false;
  el.rail.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { updateFocus(); ticking = false; });
  });

  el.railPrev.addEventListener('click', () => scrollToIndex(state.focusIndex - 1));
  el.railNext.addEventListener('click', () => scrollToIndex(state.focusIndex + 1));
  el.railOpen.addEventListener('click', () => {
    const pack = state.packs[state.focusIndex];
    if (pack) openScreenFor(pack.id);
  });

  el.rail.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); scrollToIndex(state.focusIndex + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); scrollToIndex(state.focusIndex - 1); }
    if (event.key === 'Enter') {
      event.preventDefault();
      const pack = state.packs[state.focusIndex];
      if (pack) openScreenFor(pack.id);
    }
  });

  // Drag-to-scroll for mice; touch already scrolls the rail natively.
  const drag = { active: false, x0: 0, left0: 0, moved: 0 };
  el.rail.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') return;
    drag.active = true;
    drag.x0 = event.clientX;
    drag.left0 = el.rail.scrollLeft;
    drag.moved = 0;
    el.rail.classList.add('is-dragging');
  });
  el.rail.addEventListener('pointermove', (event) => {
    if (!drag.active) return;
    const dx = event.clientX - drag.x0;
    drag.moved = Math.max(drag.moved, Math.abs(dx));
    el.rail.scrollLeft = drag.left0 - dx;
  });
  const endDrag = () => {
    if (!drag.active) return;
    drag.active = false;
    el.rail.classList.remove('is-dragging');
    // Re-snap to whatever ended up nearest the middle.
    scrollToIndex(state.focusIndex);
  };
  el.rail.addEventListener('pointerup', endDrag);
  el.rail.addEventListener('pointercancel', endDrag);
  el.rail.addEventListener('pointerleave', endDrag);
  // Suppress the click that follows a real drag.
  el.rail.addEventListener('click', (event) => {
    if (drag.moved > TAP_SLOP) { event.stopPropagation(); event.preventDefault(); }
  }, true);
}

/* --- opening: the rip ----------------------------------------------------- */

const rip = { progress: 0, dragging: false, startX: 0, lastTick: 0, done: false, booster: null, zone: null };

function paintRip() {
  const dir = state.ripDir || 1;
  const pct = rip.progress * 100;
  const tear = rip.booster?.querySelector('.booster-tear');
  const front = rip.booster?.querySelector('.rip-front');
  if (!tear) return;

  // The torn-off part is the side BEHIND the tear front, so a rightward pull
  // clips the strip away from the left.
  const clip = dir > 0 ? `inset(0 0 0 ${pct}%)` : `inset(0 ${pct}% 0 0)`;
  tear.style.clipPath = clip;
  // The dashed line lives on the strip, so it has to go with it.
  const line = rip.booster?.querySelector('.rip-line');
  if (line) line.style.clipPath = clip;
  if (front) {
    const frontPct = dir > 0 ? pct : 100 - pct;
    front.style.left = `${frontPct}%`;
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
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setRip(from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(step);
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

  const onDown = (event) => {
    if (rip.done) return;
    rip.dragging = true;
    rip.lastTick = rip.progress;
    booster.classList.add('is-tearing');
    synth.resume();
    event.preventDefault();

    trackDrag(event, {
      onMove: (dx) => {
        if (!rip.dragging) return;
        if (Math.abs(dx) < RIP_LOCK_SLOP) return;
        lockRipDirection(dx);
        // Once a direction is locked, only pulls that way tear the pack.
        const travel = dx * state.ripDir;
        const span = Math.max(120, zone.getBoundingClientRect().width * 0.72);
        setRip(travel / span);
      },
      onEnd: async () => {
        if (!rip.dragging) return;
        rip.dragging = false;
        booster.classList.remove('is-tearing');
        if (rip.progress >= RIP_COMMIT) {
          completeRip();
        } else if (rip.progress > 0.01) {
          // Springs shut — and the foil complains on the way back.
          await animateRip(rip.progress, 0, 300);
          synth.playRipTick(0.35);
        }
      }
    });
  };

  zone.addEventListener('pointerdown', onDown);

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
  scrap.style.left = '0';
  scrap.style.right = '0';
  scrap.style.top = '0';
  scrap.style.height = '15%';
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

/* --- opening: cards out of the pack --------------------------------------- */

function openScreenFor(packId) {
  state.pack = packById(packId, state.customPacks);
  applyAccent(state.pack);
  synth.resume();

  el.openScreen.className = 'screen is-active phase-idle';
  el.openTitle.textContent = state.pack.name;
  el.openProgress.textContent = '';
  el.openHint.textContent = 'Slide the rip line sideways to tear it open.';
  el.openHint.className = 'open-hint';
  el.packSummary.replaceChildren();
  el.revealActions.classList.remove('is-ready');
  el.cardStack.replaceChildren();
  state.pulls = []; state.cards = []; state.index = 0; state.seen = new Set();

  const booster = buildBooster(state.pack, { interactive: true });
  booster.classList.add('is-idle');
  el.boosterSlot.replaceChildren(booster);
  initRip(booster);

  schedulePrefetch(state.pack);
  showScreen('open');
}

/** Draw the pack, reusing the prefetch when it's for this same pack. */
function drawFor(pack) {
  if (state.prefetch?.packId === pack.id) {
    const { promise } = state.prefetch;
    state.prefetch = null;
    return promise;
  }
  return drawArticles(pack).catch((err) => ({ error: err }));
}

async function openPack(booster) {
  if (state.busy) return;
  state.busy = true;
  clearTimeout(state.prefetchTimer);

  const drawing = drawFor(state.pack);

  // The animation runs on card BACKS, which need no data at all — so it starts
  // immediately and the fetch happens underneath it.
  el.openScreen.classList.replace('phase-idle', 'phase-opening');
  el.openHint.textContent = '';
  booster.classList.remove('is-idle');

  const count = state.pack.cards;
  state.cards = Array.from({ length: count }, (_, i) => buildPlaceholderCard(i, count));
  el.cardStack.replaceChildren(...state.cards);

  state.cards.forEach((card, i) => {
    card.style.setProperty('--spin', `${(Math.random() * 34 - 17).toFixed(1)}deg`);
    card.style.animationDelay = `${i * EMERGE_STAGGER}ms`;
    card.classList.add('is-emerging');
    // Drop the class once it has played so it can't shadow later animations.
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
    el.openScreen.className = 'screen is-active phase-idle';
    el.openHint.textContent =
      `${articles?.error?.message ?? 'Could not reach the wiki'}. Check your connection and try again.`;
    el.openHint.className = 'open-hint is-error';
    el.cardStack.replaceChildren();
    openScreenForRetry();
    state.busy = false;
    return;
  }

  // Random order: a Legendary can land first and a Common last.
  const pulls = shuffle(articles.map((article) => {
    const rarity = rollRarity();
    return { article, rarity, price: priceFor(article.popularity, rarity) };
  }));

  const recorded = store.recordPulls(state.collection, pulls, state.pack);
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

/** Put a fresh, unopened booster back so the player can try again. */
function openScreenForRetry() {
  const booster = buildBooster(state.pack, { interactive: true });
  booster.classList.add('is-idle');
  el.boosterSlot.replaceChildren(booster);
  initRip(booster);
}

/* --- cards ---------------------------------------------------------------- */

const CARD_FRONT_MARKUP = `
  <div class="card-art"></div>
  <button class="fav-button" type="button" aria-pressed="false" aria-label="Add to favourites"></button>
  <div class="card-body">
    <h3 class="card-title"></h3>
    <p class="card-desc"></p>
    <p class="card-extract"></p>
  </div>
  <div class="card-stats">
    <span class="card-price"></span>
    <span class="card-views"></span>
  </div>
  <div class="card-footer">
    <span class="rarity-badge"></span>
    <a class="card-link" target="_blank" rel="noopener noreferrer">Read →</a>
  </div>
  <div class="fx fx-a" aria-hidden="true"></div>
  <div class="fx fx-b" aria-hidden="true"></div>`;

/** A face-down card with no rarity yet — nothing here can leak the pull. */
function buildPlaceholderCard(index, total) {
  const card = document.createElement('div');
  card.className = 'card stack-card';
  card.style.zIndex = String(total - index);
  card.style.setProperty('--depth', String(Math.min(3, index)));
  card.innerHTML = `
    <div class="card-inner">
      <div class="card-face card-back">
        <div class="back-art"></div>
        <div class="back-logo">${logoSvg({ size: 62 })}</div>
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
    `<div class="card-art-fallback">${iconSvg(data.packIcon ?? state.pack?.icon ?? 'packs', { size: 40 })}</div>`);

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
  front.querySelector('.rarity-badge').textContent = rarity.name;
  front.querySelector('.card-price').innerHTML = priceHtml(data.price);
  front.querySelector('.card-views').textContent =
    data.views ? `${formatViews(data.views)}/mo` : bandFor(data.popularity ?? 0).name;
  const link = front.querySelector('.card-link');
  if (link) link.href = data.url;
}

function wireFavButton(button, entryKey) {
  const paint = () => {
    const on = Boolean(state.collection.entries[entryKey]?.favorite);
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? 'Remove from favourites' : 'Add to favourites');
    button.innerHTML = iconSvg(on ? 'starFilled' : 'star', { size: 17 });
  };
  paint();
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    store.toggleFavorite(state.collection, entryKey);
    paint();
    synth.playFlip();
    if (el.screens.collection.classList.contains('is-active')) renderCollection();
  });
}

/**
 * Attach the drawn data to the already-airborne cards. Rarity variables are
 * only set here, on the hidden front face, so nothing was visible earlier.
 */
function bindCards(pulls) {
  state.cards.forEach((card, i) => {
    const pull = pulls[i];
    if (!pull) return;
    card.classList.remove('is-waiting');
    applyRarityVars(card, pull.rarity);
    const front = card.querySelector('.card-front');
    fillFront(front, { ...pull.article, price: pull.price, packIcon: state.pack.icon }, pull.rarity);
    wireFavButton(front.querySelector('.fav-button'), pull.article.key);
  });
}

/* --- reveal: a deck you can page through both ways ------------------------ */

/**
 * Position every card from its offset to the current index.
 *
 *   offset 0   the card you're looking at
 *   offset > 0 still to come, fanned out behind it
 *   offset < 0 already seen, parked off to the right so a backwards swipe can
 *              bring it straight back
 */
function layoutDeck(dragOffset = 0) {
  const total = state.cards.length;
  state.cards.forEach((card, i) => {
    const offset = i - state.index;

    if (offset < 0) {
      // Seen cards sit above the deck so they slide back over the top.
      card.style.zIndex = String(100 + offset);
      card.style.transform = 'translateX(128%) rotate(13deg) scale(0.94)';
      card.style.opacity = '0';
      return;
    }

    const depth = Math.min(3, offset);
    card.style.zIndex = String(50 - offset);
    card.style.opacity = '1';
    const shift = offset === 0 ? dragOffset : dragOffset * 0.25;
    card.style.transform =
      `translate(calc(${depth * 5}px + ${shift}px), ${depth * 9}px) ` +
      `rotate(${depth * 1.3 + shift * 0.05}deg) scale(${(1 - depth * 0.04).toFixed(3)})`;
  });
}

function updateRevealProgress() {
  el.openProgress.textContent = state.pulls.length
    ? `Card ${Math.min(state.index + 1, state.pulls.length)} of ${state.pulls.length}`
    : '';
}

/** Turn the current card over, if this is the first time we've reached it. */
async function revealCurrent() {
  const card = state.cards[state.index];
  const pull = state.pulls[state.index];
  if (!card || !pull) return;

  updateRevealProgress();
  const isNew = !state.seen.has(state.index);
  card.classList.add('is-revealed');

  if (isNew) {
    state.seen.add(state.index);
    synth.playReveal(rarityRank(pull.rarity.id));
    if (pull.rarity.flash > 0) fireFlash(pull.rarity.flash);
  }

  if (state.seen.size >= state.pulls.length) {
    el.openHint.textContent = '';
    await wait(950);
    // Guard: the player may have swiped back while we waited.
    if (state.seen.size >= state.pulls.length) showSummary();
  } else {
    el.openHint.textContent = state.index === 0
      ? 'Swipe right to left for the next card.'
      : 'Swipe either way to move through the pack.';
  }
}

function goTo(index) {
  const next = Math.max(0, Math.min(state.pulls.length - 1, index));
  if (next === state.index) { layoutDeck(); return; }
  state.index = next;
  layoutDeck();
  synth.playFlip();
  revealCurrent();
}

/** The whole pack, laid out together, once every card has been turned. */
function showSummary() {
  el.packSummary.replaceChildren(
    ...state.pulls.map((pull, i) => {
      const card = buildStaticCard(
        { ...pull.article, price: pull.price, packIcon: state.pack.icon },
        pull.rarity,
        pull.article.key
      );
      card.classList.add('summary-card');
      card.style.animationDelay = `${i * 70}ms`;
      return card;
    })
  );
  el.openScreen.classList.replace('phase-reveal', 'phase-summary');
  el.openProgress.textContent = `${state.pulls.length} cards · saved to your collection`;
  el.openHint.textContent = '';
  el.revealActions.classList.add('is-ready');
}

function initSwipe() {
  const MAX_PULL = 70;   // how far a card follows the finger before it stops

  el.cardStack.addEventListener('pointerdown', (event) => {
    if (!el.openScreen.classList.contains('phase-reveal')) return;
    if (!state.cards.length) return;

    const card = state.cards[state.index];
    card?.classList.add('is-dragging');
    synth.resume();

    trackDrag(event, {
      onMove: (dx) => {
        // Damped: the card follows your finger a little, it isn't thrown.
        layoutDeck(Math.max(-MAX_PULL, Math.min(MAX_PULL, dx * 0.34)));
      },
      onEnd: (dx) => {
        card?.classList.remove('is-dragging');
        // Right-to-left goes forward, left-to-right goes back. A tap does nothing.
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

/* --- custom packs --------------------------------------------------------- */

function renderCustomKinds() {
  const active = customKindById(state.customKind);
  el.customForm.style.setProperty('--accent', active.accent);
  el.customForm.style.setProperty('--accent2', active.accent2);

  el.customKinds.replaceChildren(
    ...CUSTOM_KINDS.map((kind) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `kind-chip${kind.id === state.customKind ? ' is-active' : ''}`;
      button.dataset.kind = kind.id;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(kind.id === state.customKind));
      button.innerHTML = `${iconSvg(kind.icon, { size: 17 })}<span>${kind.label}</span>`;
      button.addEventListener('click', () => {
        state.customKind = kind.id;
        el.customInput.placeholder = kind.placeholder;
        renderCustomKinds();
      });
      return button;
    })
  );
}

/**
 * Prefer the resolved wiki's own name over whatever the player typed, so
 * "TERRARIA", "terraria" and "Terraria" all produce a pack called Terraria.
 */
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
  if (!raw) { setCustomStatus('Type a name first.', 'error'); return; }

  const kind = customKindById(state.customKind);
  state.busy = true;
  el.customSubmit.disabled = true;
  el.customInput.disabled = true;
  setCustomStatus('Booster Pack is being created…', 'working');

  try {
    const wiki = await resolveCustomWiki(raw);
    const id = `custom-${new URL(wiki.apiUrl).host.replace(/\W+/g, '-')}`;
    const pack = {
      id,
      name: customPackName(raw, wiki.sitename),
      tagline: `Straight from ${wiki.sitename}.`,
      icon: kind.icon,
      accent: kind.accent,
      accent2: kind.accent2,
      group: 'custom',
      source: 'custom',
      kind: kind.id,
      cards: 5,
      queries: [],
      wiki,
      art: await fetchCustomPackArt(wiki)
    };
    state.customPacks = store.saveCustomPack(pack);
    renderRail();
    setCustomStatus(
      `“${pack.name}” booster ready — ${wiki.articles.toLocaleString('en-US')} pages on ${wiki.sitename}.`,
      'ok'
    );
    el.customInput.value = '';
    // Bring the new pack to the middle of the shelf.
    const index = state.packs.findIndex((p) => p.id === pack.id);
    if (index >= 0) requestAnimationFrame(() => scrollToIndex(index));
  } catch (err) {
    setCustomStatus(
      err.message === 'NO_WIKI'
        ? 'Booster cannot be created, try something else.'
        : `Booster cannot be created, try something else. (${err.message})`,
      'error'
    );
  } finally {
    state.busy = false;
    el.customSubmit.disabled = false;
    el.customInput.disabled = false;
  }
}

/* --- collection ----------------------------------------------------------- */

function option(value, label) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  return opt;
}

function renderFilterControls() {
  const entries = store.allEntries(state.collection);
  const packs = [...new Map(entries.map((e) => [e.packId, e.packName])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));

  el.filterPack.replaceChildren(option('', 'All packs'), ...packs.map(([id, name]) => option(id, name)));
  el.filterPack.value = state.filters.pack;
  el.filterRarity.replaceChildren(option('', 'All rarities'), ...RARITIES.map((r) => option(r.id, r.name)));
  el.filterRarity.value = state.filters.rarity;
  el.filterBand.replaceChildren(option('', 'Any popularity'), ...POPULARITY_BANDS.map((b) => option(b.id, b.name)));
  el.filterBand.value = state.filters.band;
  el.filterPrice.replaceChildren(
    option('', 'Any price'),
    ...[100, 500, 1500, 5000, 12000].map((p) => option(String(p), `${formatAmount(p)}+`))
  );
  el.filterPrice.value = state.filters.minPrice;
  el.filterSort.replaceChildren(...store.SORTS.map((s) => option(s.id, s.name)));
  el.filterSort.value = state.filters.sort;

  el.filterFav.classList.toggle('is-on', state.filters.favoritesOnly);
  el.filterFav.setAttribute('aria-pressed', String(state.filters.favoritesOnly));
  el.filterFav.querySelector('.chip-star').innerHTML =
    iconSvg(state.filters.favoritesOnly ? 'starFilled' : 'star', { size: 15 });
}

/** A face-up card with no back and no flip — for the summary and the binder. */
function buildStaticCard(data, rarity, entryKey = null) {
  const card = document.createElement('article');
  card.className = 'card collection-card is-revealed';
  applyRarityVars(card, rarity);
  card.innerHTML = `
    <div class="card-inner">
      <div class="card-face card-front">${CARD_FRONT_MARKUP}</div>
    </div>`;
  const front = card.querySelector('.card-front');
  fillFront(front, data, rarity);
  const fav = front.querySelector('.fav-button');
  if (entryKey) wireFavButton(fav, entryKey);
  else fav.remove();
  return card;
}

function buildCollectionCard(entry) {
  const rarity = rarityById(entry.rarityId);
  const card = buildStaticCard(entry, rarity, entry.key);

  if (entry.count > 1) {
    const badge = document.createElement('span');
    badge.className = 'copy-badge';
    badge.textContent = `×${entry.count}`;
    card.appendChild(badge);
  }
  return card;
}

function renderCollection() {
  const entries = store.allEntries(state.collection);
  const stats = store.collectionStats(entries);

  el.collectionStats.innerHTML = `
    <span class="stat"><b>${stats.unique}</b> unique</span>
    <span class="stat"><b>${stats.copies}</b> cards</span>
    <span class="stat"><b>${priceHtml(stats.value)}</b> total</span>
    <span class="stat"><b>${stats.favorites}</b> favourites</span>`;

  renderFilterControls();

  const visible = store.filterEntries(entries, state.filters);
  if (!entries.length) {
    el.collectionEmpty.hidden = false;
    el.collectionEmpty.textContent = 'Nothing here yet — open a pack and your pulls will land in this binder.';
  } else if (!visible.length) {
    el.collectionEmpty.hidden = false;
    el.collectionEmpty.textContent = 'No cards match these filters.';
  } else {
    el.collectionEmpty.hidden = true;
  }
  el.collectionGrid.replaceChildren(...visible.map(buildCollectionCard));
}

function updateTabCount() {
  el.tabCount.textContent = String(store.allEntries(state.collection).length);
}

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
    renderCollection();
  });
  el.filterReset.addEventListener('click', () => {
    state.filters = { search: '', pack: '', rarity: '', band: '', minPrice: '', sort: 'recent', favoritesOnly: false };
    el.filterSearch.value = '';
    renderCollection();
  });
}

/* --- odds ----------------------------------------------------------------- */

function renderOdds() {
  const pct = (n) => (n >= 1 ? `${n.toFixed(1)}%` : `${n.toFixed(2)}%`);
  el.oddsBody.replaceChildren(
    ...oddsTable().map(({ rarity, percent }) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><span class="odds-name"><span class="odds-swatch"></span><span class="odds-label"></span></span></td>
        <td class="odds-pct"></td>`;
      const swatch = row.querySelector('.odds-swatch');
      swatch.style.color = rarity.color;
      swatch.style.background = rarity.color;
      const label = row.querySelector('.odds-label');
      label.textContent = rarity.name;
      label.style.color = rarity.color;
      row.querySelector('.odds-pct').textContent = pct(percent);
      return row;
    })
  );
}

const toggleOdds = (open) => { el.oddsModal.hidden = !open; };

/* --- wiring --------------------------------------------------------------- */

async function loadPackArt() {
  try {
    state.art = await fetchPackArt(heroTitles());
    // Repaint whatever is already on screen with the real photographs.
    document.querySelectorAll('.booster').forEach((booster) => {
      const pack = packById(booster.dataset.pack, state.customPacks);
      paintPackPhoto(booster.querySelector('.booster-photo'), pack);
    });
  } catch {
    /* offline: every pack keeps its drawn fallback */
  }
}

function init() {
  el.brandMark.innerHTML = logoSvg({ size: 30 });
  renderRail();
  renderCustomKinds();
  renderOdds();
  updateTabCount();
  renderCollection();
  initRail();
  initSwipe();
  initFilters();
  updateFocus();
  loadPackArt();

  el.customForm.addEventListener('submit', createCustomPack);
  el.backButton.addEventListener('click', () => showScreen('packs'));
  el.backToShelf.addEventListener('click', () => showScreen('packs'));

  el.tabs.forEach((tab) => tab.addEventListener('click', () => {
    if (tab.dataset.tab === 'collection') { renderCollection(); showScreen('collection'); }
    else showScreen('packs');
  }));

  el.oddsButton.addEventListener('click', () => toggleOdds(true));
  el.oddsClose.addEventListener('click', () => toggleOdds(false));
  el.oddsModal.addEventListener('click', (e) => { if (e.target === el.oddsModal) toggleOdds(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleOdds(false); });

  el.muteButton.addEventListener('click', () => {
    const next = el.muteButton.getAttribute('aria-pressed') !== 'true';
    synth.resume();
    synth.setMuted(next);
    el.muteButton.setAttribute('aria-pressed', String(next));
    el.muteLabel.textContent = next ? 'Muted' : 'Sound on';
  });
}

init();

window.__packywiki = {
  state,
  RARITIES,
  debugRarity(id) {
    const forced = rarityById(id);
    document.querySelectorAll('.card').forEach((card) => {
      applyRarityVars(card, forced);
      const badge = card.querySelector('.rarity-badge');
      if (badge) badge.textContent = forced.name;
    });
    return forced;
  },
  clearCollection() {
    state.collection = { entries: {} };
    store.saveCollection(state.collection);
    updateTabCount();
    renderCollection();
  },
  resetRipDirection() {
    state.ripDir = 0;
    try { localStorage.removeItem(RIP_DIR_KEY); } catch { /* ignore */ }
  }
};
