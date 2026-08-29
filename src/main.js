/**
 * PackyWiki — app controller.
 *
 * Screens: packs -> open -> reveal, plus a collection binder on its own tab.
 * Data tables live in src/data/, network in src/wiki.js, money in
 * src/pricing.js, persistence in src/collection.js, sound in src/audio.js.
 */

import { THEME_PACKS, RARITY_PACKS, CUSTOM_KINDS, customKindById, packById, packRollOptions } from './data/packs.js';
import { RARITIES, rollRarity, rarityById, rarityRank, oddsFor } from './data/rarities.js';
import { iconSvg, logoSvg } from './data/icons.js';
import { drawArticles, resolveCustomWiki } from './wiki.js';
import { priceFor, formatPrice, formatViews, bandFor, POPULARITY_BANDS } from './pricing.js';
import * as store from './collection.js';
import { synth } from './audio.js';

/* --- timing / thresholds -------------------------------------------------- */
const RIP_COMMIT = 0.6;      // drag past this and the pack tears the rest of the way
const RIP_TICK_STEP = 0.06;  // how often the tearing sound fires while dragging
const SWIPE_COMMIT = 78;     // px before a card swipe counts
const TAP_SLOP = 7;          // below this a pointer gesture is a tap, not a drag

const $ = (sel) => document.querySelector(sel);
const clamp01 = (n) => Math.min(1, Math.max(0, n));

/**
 * Pointer capture keeps a drag alive when the pointer leaves the element, but
 * it throws if the pointer is no longer active (an interrupted or synthetic
 * touch). Losing capture is survivable; an exception mid-`pointerdown` is not.
 */
function capturePointer(node, pointerId) {
  try {
    node.setPointerCapture?.(pointerId);
  } catch {
    /* drag still works, it just won't track outside the element */
  }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const el = {
  screens: {
    packs: $('#screen-packs'),
    open: $('#screen-open'),
    reveal: $('#screen-reveal'),
    collection: $('#screen-collection')
  },
  brandMark: $('#brand-mark'),
  tabs: document.querySelectorAll('.tab'),
  tabCount: $('#tab-count'),

  themeList: $('#theme-list'),
  rarityList: $('#rarity-list'),
  customList: $('#custom-list'),
  customForm: $('#custom-form'),
  customKinds: $('#custom-kinds'),
  customInput: $('#custom-input'),
  customSubmit: $('#custom-submit'),
  customStatus: $('#custom-status'),

  packVisual: $('#pack-visual'),
  packFoil: $('#pack-foil'),
  tearFront: $('#pack-tear-front'),
  zip: $('#zip'),
  zipTab: $('#zip-tab'),
  packLogo: $('#pack-logo'),
  packArtIcon: $('#pack-art-icon'),
  packArtName: $('#pack-art-name'),
  packArtCount: $('#pack-art-count'),
  openHint: $('#open-hint'),
  openStatus: $('#open-status'),
  backButton: $('#back-button'),

  revealTitle: $('#reveal-title'),
  revealProgress: $('#reveal-progress'),
  cardStack: $('#card-stack'),
  revealHint: $('#reveal-hint'),
  revealedTray: $('#revealed-tray'),
  revealActions: $('#reveal-actions'),
  againButton: $('#again-button'),
  changePackButton: $('#change-pack-button'),

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

const state = {
  pack: THEME_PACKS[0],
  customPacks: store.loadCustomPacks(),
  customKind: CUSTOM_KINDS[0].id,
  collection: store.loadCollection(),
  busy: false,
  pulls: [],
  cards: [],
  revealed: 0,
  filters: { search: '', pack: '', rarity: '', band: '', minPrice: '', sort: 'recent', favoritesOnly: false }
};

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

const allPacks = () => [...THEME_PACKS, ...RARITY_PACKS, ...state.customPacks];

/* --- pack lists ----------------------------------------------------------- */

function buildPackRow(pack) {
  const row = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pack-row';
  button.dataset.pack = pack.id;
  button.style.setProperty('--accent', pack.accent);
  button.innerHTML = `
    <span class="pack-row-icon">${iconSvg(pack.icon, { size: 22 })}</span>
    <span class="pack-row-text">
      <span class="pack-row-name"></span>
      <span class="pack-row-tagline"></span>
    </span>
    <span class="pack-row-meta">
      <span class="pack-row-count"></span>
      <span class="pack-row-go">›</span>
    </span>`;
  button.querySelector('.pack-row-name').textContent = pack.name;
  button.querySelector('.pack-row-tagline').textContent = pack.tagline;
  button.querySelector('.pack-row-count').textContent = `${pack.cards}`;
  button.addEventListener('click', () => selectPack(pack.id));
  row.appendChild(button);

  if (pack.group === 'custom') {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'pack-row-delete';
    remove.title = `Delete the ${pack.name} booster`;
    remove.setAttribute('aria-label', `Delete the ${pack.name} booster`);
    remove.innerHTML = iconSvg('close', { size: 15 });
    remove.addEventListener('click', () => {
      state.customPacks = store.deleteCustomPack(pack.id);
      renderCustomPacks();
    });
    row.appendChild(remove);
    row.className = 'pack-row-wrap';
  }
  return row;
}

function renderPackLists() {
  el.themeList.replaceChildren(...THEME_PACKS.map(buildPackRow));
  el.rarityList.replaceChildren(...RARITY_PACKS.map(buildPackRow));
  renderCustomPacks();
}

function renderCustomPacks() {
  el.customList.replaceChildren(...state.customPacks.map(buildPackRow));
}

function renderCustomKinds() {
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

/* --- custom pack creation ------------------------------------------------- */

/**
 * Prefer the resolved wiki's own name over whatever the player typed, so
 * "TERRARIA", "terraria" and "Terraria" all produce a pack called Terraria.
 * Falls back to the typed text if the sitename is unhelpful.
 */
function customPackName(typed, sitename) {
  const trimmed = (sitename ?? '').replace(/\s*(fandom|wiki|wikia)\s*$/i, '').trim();
  if (trimmed.length >= 2) return trimmed;
  return typed.replace(/\s+/g, ' ').trim();
}

async function createCustomPack(event) {
  event.preventDefault();
  if (state.busy) return;

  const raw = el.customInput.value.trim();
  if (!raw) {
    setCustomStatus('Type a name first.', 'error');
    return;
  }

  const kind = customKindById(state.customKind);
  state.busy = true;
  el.customSubmit.disabled = true;
  el.customInput.disabled = true;
  // Resolving a wiki takes a few round trips, so say so rather than hanging.
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
      wiki
    };
    state.customPacks = store.saveCustomPack(pack);
    renderCustomPacks();
    setCustomStatus(
      `“${pack.name}” booster ready — ${wiki.articles.toLocaleString('en-US')} pages on ${wiki.sitename}.`,
      'ok'
    );
    el.customInput.value = '';
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

function setCustomStatus(text, kind) {
  el.customStatus.textContent = text;
  el.customStatus.className = `custom-status is-${kind}`;
}

/* --- opening: the zipper -------------------------------------------------- */

const rip = { progress: 0, dir: 1, dragging: false, startX: 0, lastTick: 0, done: false };

function paintRip() {
  const pct = rip.progress * 100;
  // Dragging right tears the strip away from the left, and vice versa: the
  // torn-off portion is the part BEHIND the tear front.
  el.packFoil.style.clipPath =
    rip.dir > 0 ? `inset(0 0 0 ${pct}%)` : `inset(0 ${pct}% 0 0)`;
  const frontPct = rip.dir > 0 ? pct : 100 - pct;
  el.tearFront.style.left = `${frontPct}%`;
  el.tearFront.style.opacity = rip.progress > 0.02 && rip.progress < 0.99 ? '1' : '0';
  el.packVisual.style.setProperty('--rip', String(rip.progress));
  el.zipTab.setAttribute('aria-valuenow', String(Math.round(pct)));
}

function setRip(progress) {
  rip.progress = clamp01(progress);
  paintRip();
  if (rip.progress - rip.lastTick >= RIP_TICK_STEP) {
    rip.lastTick = rip.progress;
    synth.playRipTick(rip.progress);
  }
}

function resetRip() {
  rip.progress = 0; rip.dir = 1; rip.lastTick = 0; rip.done = false; rip.dragging = false;
  el.packVisual.classList.remove('is-ripping', 'is-tearing');
  el.zipTab.style.transform = '';
  paintRip();
}

function initZipper() {
  const onDown = (event) => {
    if (rip.done || state.busy) return;
    rip.dragging = true;
    rip.startX = event.clientX;
    rip.lastTick = rip.progress;
    el.packVisual.classList.add('is-tearing');
    capturePointer(el.zipTab, event.pointerId);
    synth.resume();
    event.preventDefault();
  };

  const onMove = (event) => {
    if (!rip.dragging) return;
    const dx = event.clientX - rip.startX;
    if (Math.abs(dx) > 2) rip.dir = dx > 0 ? 1 : -1;
    const span = Math.max(120, el.zip.getBoundingClientRect().width * 0.62);
    setRip(Math.abs(dx) / span);
    el.zipTab.style.transform = `translateX(${dx}px) rotate(${dx * 0.06}deg)`;
  };

  const onUp = () => {
    if (!rip.dragging) return;
    rip.dragging = false;
    el.packVisual.classList.remove('is-tearing');
    if (rip.progress >= RIP_COMMIT) {
      completeRip();
    } else {
      // Not far enough: the strip springs back shut.
      el.zipTab.style.transform = '';
      animateRip(rip.progress, 0, 220);
    }
  };

  el.zipTab.addEventListener('pointerdown', onDown);
  el.zipTab.addEventListener('pointermove', onMove);
  el.zipTab.addEventListener('pointerup', onUp);
  el.zipTab.addEventListener('pointercancel', onUp);

  // Keyboard equivalent, so the pack is openable without a pointer.
  el.zipTab.addEventListener('keydown', (event) => {
    if (rip.done || state.busy) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      rip.dir = event.key === 'ArrowRight' ? 1 : -1;
      setRip(rip.progress + 0.12);
      if (rip.progress >= RIP_COMMIT) completeRip();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      completeRip();
    }
  });
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

async function completeRip() {
  if (rip.done) return;
  rip.done = true;
  el.zipTab.style.transform = '';
  el.zip.classList.add('is-spent');

  await animateRip(rip.progress, 1, 260);
  synth.playRip();
  el.packVisual.classList.add('is-ripping');
  openPack();
}

/* --- opening: drawing the cards ------------------------------------------ */

function selectPack(packId) {
  state.pack = packById(packId, state.customPacks);
  applyAccent(state.pack);
  synth.resume();

  el.packLogo.innerHTML = logoSvg({ size: 54 });
  el.packArtIcon.innerHTML = iconSvg(state.pack.icon, { size: 40 });
  el.packArtName.textContent = state.pack.name;
  el.packArtCount.textContent = `${state.pack.cards} cards`;
  el.packVisual.dataset.group = state.pack.group;
  el.openStatus.textContent = '';
  el.openStatus.className = 'open-status';
  el.openHint.hidden = false;
  el.zip.classList.remove('is-spent');
  resetRip();

  showScreen('open');
}

async function openPack() {
  if (state.busy) return;
  state.busy = true;
  el.openHint.hidden = true;
  el.openStatus.textContent = 'Pulling cards…';

  let articles;
  try {
    articles = await drawArticles(state.pack);
  } catch (err) {
    el.openStatus.textContent = `${err.message}. Check your connection and try again.`;
    el.openStatus.className = 'open-status is-error';
    el.packVisual.classList.remove('is-ripping');
    el.zip.classList.remove('is-spent');
    resetRip();
    state.busy = false;
    return;
  }

  const rollOptions = packRollOptions(state.pack);
  const pulls = articles
    .map((article) => {
      const rarity = rollRarity({ ...rollOptions, popularity: article.popularity });
      return { article, rarity, price: priceFor(article.popularity, rarity) };
    })
    .sort((a, b) => rarityRank(a.rarity.id) - rarityRank(b.rarity.id));

  // Bank the pulls before revealing, so favouriting works from the reveal
  // screen and a mid-reveal reload doesn't lose the pack.
  const recorded = store.recordPulls(state.collection, pulls, state.pack);
  pulls.forEach((pull, i) => { pull.entry = recorded[i].entry; pull.isNew = recorded[i].isNew; });
  updateTabCount();

  await Promise.all([wait(560), preloadImages(pulls)]);
  el.openStatus.textContent = '';
  startReveal(pulls);
  state.busy = false;
}

function preloadImages(pulls) {
  const loads = pulls.filter((p) => p.article.thumbnail).map((p) => new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = resolve;
    img.src = p.article.thumbnail;
  }));
  return Promise.race([Promise.all(loads), wait(1400)]);
}

/* --- card rendering ------------------------------------------------------- */

function fillFront(front, data, rarity) {
  const art = front.querySelector('.card-art');
  if (data.thumbnail) {
    const img = document.createElement('img');
    img.src = data.thumbnail;
    img.alt = '';
    img.addEventListener('error', () => {
      img.remove();
      art.insertAdjacentHTML('afterbegin', `<div class="card-art-fallback">${iconSvg(data.packIcon ?? state.pack.icon, { size: 40 })}</div>`);
    });
    art.appendChild(img);
  } else {
    art.insertAdjacentHTML('afterbegin', `<div class="card-art-fallback">${iconSvg(data.packIcon ?? state.pack.icon, { size: 40 })}</div>`);
  }

  front.querySelector('.card-title').textContent = data.title;
  front.querySelector('.card-desc').textContent = data.description || data.sourceName || '';
  front.querySelector('.card-extract').textContent = data.extract;
  front.querySelector('.rarity-badge').textContent = rarity.name;
  front.querySelector('.card-price').textContent = formatPrice(data.price);
  front.querySelector('.card-views').textContent =
    data.views ? `${formatViews(data.views)}/mo` : bandFor(data.popularity ?? 0).name;
  const link = front.querySelector('.card-link');
  if (link) link.href = data.url;
}

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

function applyRarityVars(node, rarity) {
  node.dataset.rarity = rarity.id;
  node.style.setProperty('--rarity', rarity.color);
  node.style.setProperty('--rarity-glow', rarity.glow);
}

function wireFavButton(button, entryKey) {
  const paint = () => {
    const entry = state.collection.entries[entryKey];
    const on = Boolean(entry?.favorite);
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
  return paint;
}

function buildRevealCard(pull, index, total) {
  const rarity = pull.rarity;
  const card = document.createElement('div');
  card.className = 'card stack-card';
  applyRarityVars(card, rarity);
  card.style.zIndex = String(total - index);
  card.style.setProperty('--depth', String(index));
  card.innerHTML = `
    <div class="card-aura" aria-hidden="true"></div>
    <div class="card-inner">
      <div class="card-face card-back">
        <div class="back-art"></div>
        <div class="back-logo">${logoSvg({ size: 62 })}</div>
      </div>
      <div class="card-face card-front">${CARD_FRONT_MARKUP}</div>
    </div>`;
  fillFront(card.querySelector('.card-front'), {
    ...pull.article, price: pull.price, packIcon: state.pack.icon
  }, rarity);
  wireFavButton(card.querySelector('.fav-button'), pull.article.key);
  return card;
}

/* --- reveal: swipe through the pack -------------------------------------- */

function startReveal(pulls) {
  state.pulls = pulls;
  state.revealed = 0;
  el.revealTitle.textContent = state.pack.name;
  el.revealActions.classList.remove('is-ready');
  el.revealedTray.replaceChildren();
  el.revealHint.hidden = false;
  el.revealHint.textContent = 'Swipe the card to reveal it.';

  state.cards = pulls.map((pull, i) => buildRevealCard(pull, i, pulls.length));
  el.cardStack.replaceChildren(...state.cards);
  restack();
  updateRevealProgress();
  showScreen('reveal');
}

/**
 * Re-seat the stack. The actionable card sits at depth 0 and everything still
 * to come fans out behind it, so the pile visibly shrinks as it's dealt.
 */
function restack() {
  const front = Math.max(0, state.revealed - 1);
  state.cards.forEach((card, i) => {
    if (!card.isConnected) return;
    card.style.setProperty('--depth', String(Math.max(0, Math.min(3, i - front))));
  });
}

function updateRevealProgress() {
  el.revealProgress.textContent = `${state.revealed} of ${state.pulls.length} revealed`;
}

function topCard() {
  // The card the player can act on: the last revealed one if there is one
  // (swipe it away), otherwise the next face-down card.
  const index = state.revealed > 0 ? state.revealed - 1 : 0;
  return state.cards[index] ?? null;
}

function retireCard(card, direction) {
  const pull = state.pulls[state.cards.indexOf(card)];
  card.classList.add('is-retiring');
  card.style.setProperty('--fly', String(direction));
  card.addEventListener('animationend', function onEnd(event) {
    // Effect layers inside the card animate too; only the fly-out ends it.
    if (event.target !== card) return;
    card.removeEventListener('animationend', onEnd);
    card.remove();
  });

  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'tray-chip';
  applyRarityVars(chip, pull.rarity);
  chip.innerHTML = `<span class="tray-chip-name"></span><span class="tray-chip-price"></span>`;
  chip.querySelector('.tray-chip-name').textContent = pull.article.title;
  chip.querySelector('.tray-chip-price').textContent = formatPrice(pull.price);
  chip.title = `${pull.rarity.name} · ${pull.article.title}`;
  el.revealedTray.appendChild(chip);
}

async function advanceReveal(direction = 1) {
  if (state.revealed >= state.pulls.length) return;

  // Retire whatever is currently face up before flipping the next one.
  if (state.revealed > 0) retireCard(state.cards[state.revealed - 1], direction);

  const card = state.cards[state.revealed];
  const pull = state.pulls[state.revealed];
  card.style.transform = '';
  card.classList.add('is-revealed');
  synth.playReveal(rarityRank(pull.rarity.id));
  if (pull.rarity.flash > 0) fireFlash(pull.rarity.flash);

  state.revealed += 1;
  restack();
  updateRevealProgress();

  if (state.revealed >= state.pulls.length) {
    el.revealHint.textContent = 'That’s the pack. Cards are saved to your collection.';
    await wait(650);
    el.revealActions.classList.add('is-ready');
  } else {
    el.revealHint.textContent = 'Swipe it away to see the next card.';
  }
}

function initSwipe() {
  const drag = { active: false, card: null, x0: 0, y0: 0, dx: 0, dy: 0 };

  const onDown = (event) => {
    // Whole pack revealed — nothing left to swipe to.
    if (state.revealed >= state.pulls.length) return;
    const card = topCard();
    if (!card) return;
    drag.active = true;
    drag.card = card;
    drag.x0 = event.clientX;
    drag.y0 = event.clientY;
    drag.dx = 0; drag.dy = 0;
    card.classList.add('is-dragging');
    capturePointer(el.cardStack, event.pointerId);
    synth.resume();
  };

  const onMove = (event) => {
    if (!drag.active) return;
    drag.dx = event.clientX - drag.x0;
    drag.dy = event.clientY - drag.y0;
    drag.card.style.transform =
      `translate(${drag.dx}px, ${drag.dy * 0.25}px) rotate(${drag.dx * 0.045}deg)`;
  };

  const onUp = () => {
    if (!drag.active) return;
    drag.active = false;
    const card = drag.card;
    card.classList.remove('is-dragging');

    const moved = Math.abs(drag.dx);
    if (moved >= SWIPE_COMMIT || moved < TAP_SLOP) {
      // A committed swipe, or a plain tap — both advance.
      card.style.transform = '';
      advanceReveal(drag.dx < 0 ? -1 : 1);
    } else {
      card.style.transform = '';
    }
    drag.card = null;
  };

  el.cardStack.addEventListener('pointerdown', onDown);
  el.cardStack.addEventListener('pointermove', onMove);
  el.cardStack.addEventListener('pointerup', onUp);
  el.cardStack.addEventListener('pointercancel', onUp);

  document.addEventListener('keydown', (event) => {
    if (!el.screens.reveal.classList.contains('is-active')) return;
    if (['ArrowRight', 'ArrowLeft', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      advanceReveal(event.key === 'ArrowLeft' ? -1 : 1);
    }
  });
}

function fireFlash(intensity) {
  el.flash.style.setProperty('--flash-peak', String(intensity));
  el.flash.classList.remove('is-firing');
  void el.flash.offsetWidth;
  el.flash.classList.add('is-firing');
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
    ...[100, 500, 1000, 5000, 20000].map((p) => option(String(p), `${formatPrice(p)}+`))
  );
  el.filterPrice.value = state.filters.minPrice;

  el.filterSort.replaceChildren(...store.SORTS.map((s) => option(s.id, s.name)));
  el.filterSort.value = state.filters.sort;

  el.filterFav.classList.toggle('is-on', state.filters.favoritesOnly);
  el.filterFav.setAttribute('aria-pressed', String(state.filters.favoritesOnly));
  el.filterFav.querySelector('.chip-star').innerHTML =
    iconSvg(state.filters.favoritesOnly ? 'starFilled' : 'star', { size: 15 });
}

function buildCollectionCard(entry) {
  const rarity = rarityById(entry.rarityId);
  const card = document.createElement('article');
  card.className = 'card collection-card is-revealed';
  applyRarityVars(card, rarity);
  card.innerHTML = `
    <div class="card-aura" aria-hidden="true"></div>
    <div class="card-inner">
      <div class="card-face card-front">${CARD_FRONT_MARKUP}</div>
    </div>`;
  fillFront(card.querySelector('.card-front'), entry, rarity);
  wireFavButton(card.querySelector('.fav-button'), entry.key);

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
    <span class="stat"><b>${formatPrice(stats.value)}</b> total value</span>
    <span class="stat"><b>${stats.favorites}</b> favourites</span>`;

  renderFilterControls();

  const visible = store.filterEntries(entries, state.filters);
  el.collectionEmpty.hidden = entries.length > 0;
  if (entries.length > 0 && visible.length === 0) {
    el.collectionEmpty.hidden = false;
    el.collectionEmpty.textContent = 'No cards match these filters.';
  } else if (entries.length > 0) {
    el.collectionEmpty.textContent = '';
  }
  el.collectionGrid.replaceChildren(...visible.map(buildCollectionCard));
}

function updateTabCount() {
  el.tabCount.textContent = String(store.allEntries(state.collection).length);
}

function initFilters() {
  const update = (key) => (event) => {
    state.filters[key] = event.target.value;
    renderCollection();
  };
  el.filterPack.addEventListener('change', update('pack'));
  el.filterRarity.addEventListener('change', update('rarity'));
  el.filterBand.addEventListener('change', update('band'));
  el.filterPrice.addEventListener('change', update('minPrice'));
  el.filterSort.addEventListener('change', update('sort'));
  el.filterSearch.addEventListener('input', (event) => {
    state.filters.search = event.target.value;
    renderCollection();
  });
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
  const obscure = oddsFor({ popularity: 0 });
  const famous = oddsFor({ popularity: 1 });
  const pct = (n) => (n >= 1 ? `${n.toFixed(1)}%` : n >= 0.01 ? `${n.toFixed(2)}%` : `${n.toFixed(3)}%`);

  el.oddsBody.replaceChildren(
    ...RARITIES.map((rarity, i) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><span class="odds-name"><span class="odds-swatch"></span><span class="odds-label"></span></span></td>
        <td class="odds-pct"></td><td class="odds-pct"></td><td class="odds-effect"></td>`;
      const swatch = row.querySelector('.odds-swatch');
      swatch.style.color = rarity.color;
      swatch.style.background = rarity.color;
      const label = row.querySelector('.odds-label');
      label.textContent = rarity.name;
      label.style.color = rarity.color;
      const cells = row.querySelectorAll('.odds-pct');
      cells[0].textContent = pct(obscure[i].percent);
      cells[1].textContent = pct(famous[i].percent);
      row.querySelector('.odds-effect').textContent = rarity.effect;
      return row;
    })
  );
}

const toggleOdds = (open) => { el.oddsModal.hidden = !open; };

/* --- wiring --------------------------------------------------------------- */

function init() {
  el.brandMark.innerHTML = logoSvg({ size: 30 });
  renderPackLists();
  renderCustomKinds();
  renderOdds();
  applyAccent(state.pack);
  updateTabCount();
  renderCollection();
  initZipper();
  initSwipe();
  initFilters();

  el.customForm.addEventListener('submit', createCustomPack);
  el.backButton.addEventListener('click', () => showScreen('packs'));
  el.changePackButton.addEventListener('click', () => showScreen('packs'));
  el.againButton.addEventListener('click', () => selectPack(state.pack.id));

  el.tabs.forEach((tab) => tab.addEventListener('click', () => {
    if (tab.dataset.tab === 'collection') {
      renderCollection();
      showScreen('collection');
    } else {
      showScreen('packs');
    }
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

// Console helpers for tuning effects without grinding for pulls.
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
  }
};
