/**
 * PackyWiki — app controller.
 *
 * Owns the three screens (pick a pack -> rip it open -> reveal the pulls) and
 * the timing of the reveal sequence. The data tables it renders from live in
 * src/data/, the network calls in src/wiki.js, the sound in src/audio.js.
 */

import { PACKS, packById } from './data/packs.js';
import { RARITIES, rollRarity, rarityById, rarityRank, rarityOdds } from './data/rarities.js';
import { drawArticles } from './wiki.js';
import { synth } from './audio.js';

/* --- Reveal choreography (ms) -------------------------------------------- */
const TIMING = {
  minShake: 900,      // pack shakes at least this long, even on a fast network
  rip: 720,           // must match the .is-ripping animations in style.css
  afterRip: 260,
  dealToFlip: 240,    // card slides in, then flips
  betweenCards: 620,  // base gap between reveals
  rarityDwell: 90,    // extra pause per rarity rank, so big pulls breathe
  imagePreloadCap: 1400
};

const $ = (sel) => document.querySelector(sel);

const el = {
  screens: {
    select: $('#screen-select'),
    open: $('#screen-open'),
    reveal: $('#screen-reveal')
  },
  packGrid: $('#pack-grid'),
  packVisual: $('#pack-visual'),
  openStatus: $('#open-status'),
  openButton: $('#open-button'),
  backButton: $('#back-button'),
  cardRow: $('#card-row'),
  revealTitle: $('#reveal-title'),
  revealActions: $('#reveal-actions'),
  againButton: $('#again-button'),
  changePackButton: $('#change-pack-button'),
  flash: $('#flash'),
  muteButton: $('#mute-button'),
  oddsButton: $('#odds-button'),
  oddsModal: $('#odds-modal'),
  oddsClose: $('#odds-close'),
  oddsBody: $('#odds-table tbody')
};

const state = {
  pack: PACKS[0],
  opening: false
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function showScreen(name) {
  Object.entries(el.screens).forEach(([key, node]) => {
    node.classList.toggle('is-active', key === name);
  });
}

/** Point the accent CSS variables at the active pack. */
function applyPackAccent(pack) {
  document.documentElement.style.setProperty('--accent', pack.accent);
  document.documentElement.style.setProperty('--accent2', pack.accent2);
}

/* --- Screen 1: pack picker ----------------------------------------------- */
function renderPackGrid() {
  el.packGrid.replaceChildren(
    ...PACKS.map((pack) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'pack-tile';
      tile.dataset.pack = pack.id;
      tile.style.setProperty('--accent', pack.accent);
      tile.innerHTML = `
        <span class="pack-tile-icon"></span>
        <span class="pack-tile-name"></span>
        <span class="pack-tile-tagline"></span>
        <span class="pack-tile-foot">
          <span class="pack-tile-count"></span>
          <span class="pack-tile-go">Open →</span>
        </span>`;
      tile.querySelector('.pack-tile-icon').textContent = pack.icon;
      tile.querySelector('.pack-tile-name').textContent = pack.name;
      tile.querySelector('.pack-tile-tagline').textContent = pack.tagline;
      tile.querySelector('.pack-tile-count').textContent = `${pack.cards} cards`;
      tile.addEventListener('click', () => selectPack(pack.id));
      return tile;
    })
  );
}

function selectPack(packId) {
  state.pack = packById(packId);
  applyPackAccent(state.pack);
  synth.resume(); // first gesture — unlock audio for the rip that follows

  el.packVisual.querySelector('.pack-visual-icon').textContent = state.pack.icon;
  el.packVisual.querySelector('.pack-visual-name').textContent = state.pack.name;
  el.packVisual.querySelector('.pack-visual-count').textContent = `${state.pack.cards} cards`;
  el.openStatus.textContent = '';
  el.openStatus.classList.remove('is-error');
  el.openButton.disabled = false;

  showScreen('open');
}

/* --- Screen 2: open the pack --------------------------------------------- */
async function openPack() {
  if (state.opening) return;
  state.opening = true;

  el.openButton.disabled = true;
  el.openStatus.classList.remove('is-error');
  el.openStatus.textContent = 'Pulling cards from Wikipedia…';
  el.packVisual.classList.remove('is-ripping');
  el.packVisual.classList.add('is-shaking');

  // Fetch and shake at the same time, so a fast network still feels dramatic
  // and a slow one just shakes for longer.
  const shakeFloor = wait(TIMING.minShake);
  let articles;
  try {
    [articles] = await Promise.all([drawArticles(state.pack), shakeFloor]);
  } catch (err) {
    el.packVisual.classList.remove('is-shaking');
    el.openStatus.classList.add('is-error');
    el.openStatus.textContent = `${err.message}. Check your connection and try again.`;
    el.openButton.disabled = false;
    state.opening = false;
    return;
  }

  // Roll rarity per card, then sort worst -> best so the reveal builds.
  const pulls = articles
    .map((article) => ({ article, rarity: rollRarity() }))
    .sort((a, b) => rarityRank(a.rarity.id) - rarityRank(b.rarity.id));

  el.openStatus.textContent = '';
  el.packVisual.classList.remove('is-shaking');
  el.packVisual.classList.add('is-ripping');
  synth.playRip();

  // Use the rip as cover to warm the image cache.
  await Promise.all([
    wait(TIMING.rip + TIMING.afterRip),
    preloadImages(pulls, TIMING.imagePreloadCap)
  ]);

  el.packVisual.classList.remove('is-ripping');
  await revealPulls(pulls);

  state.opening = false;
}

/** Best-effort image warm-up; never blocks longer than `cap`. */
function preloadImages(pulls, cap) {
  const loads = pulls
    .filter((p) => p.article.thumbnail)
    .map(
      (p) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = img.onerror = resolve;
          img.src = p.article.thumbnail;
        })
    );
  return Promise.race([Promise.all(loads), wait(cap)]);
}

/* --- Screen 3: the reveal ------------------------------------------------ */
function buildCard(pull, index) {
  const { article, rarity } = pull;

  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.rarity = rarity.id;
  card.dataset.index = String(index);
  card.style.setProperty('--rarity', rarity.color);
  card.style.setProperty('--rarity-glow', rarity.glow);
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `${rarity.name}: ${article.title}. Activate to flip.`);

  card.innerHTML = `
    <div class="card-aura" aria-hidden="true"></div>
    <div class="card-inner">
      <div class="card-face card-back">
        <div class="back-art"></div>
        <div class="back-logo">🃏</div>
      </div>
      <div class="card-face card-front">
        <div class="card-art"></div>
        <div class="card-body">
          <h3 class="card-title"></h3>
          <p class="card-desc"></p>
          <p class="card-extract"></p>
        </div>
        <div class="card-footer">
          <span class="rarity-badge"></span>
          <a class="card-link" target="_blank" rel="noopener noreferrer">Read →</a>
        </div>
        <div class="fx fx-a" aria-hidden="true"></div>
        <div class="fx fx-b" aria-hidden="true"></div>
      </div>
    </div>`;

  const art = card.querySelector('.card-art');
  if (article.thumbnail) {
    const img = document.createElement('img');
    img.src = article.thumbnail;
    img.alt = '';
    img.loading = 'eager';
    img.addEventListener('error', () => {
      img.remove();
      art.insertAdjacentHTML('afterbegin', '<div class="card-art-fallback">📄</div>');
    });
    art.appendChild(img);
  } else {
    art.insertAdjacentHTML('afterbegin', `<div class="card-art-fallback">${state.pack.icon}</div>`);
  }

  // textContent everywhere: article text is remote data, never markup.
  card.querySelector('.card-title').textContent = article.title;
  card.querySelector('.card-desc').textContent = article.description || state.pack.name;
  card.querySelector('.card-extract').textContent = article.extract;
  card.querySelector('.rarity-badge').textContent = rarity.name;
  card.querySelector('.card-link').href = article.url;

  return card;
}

async function revealPulls(pulls) {
  el.revealTitle.textContent = `${state.pack.icon} ${state.pack.name}`;
  el.revealActions.classList.remove('is-ready');

  const cards = pulls.map((pull, i) => buildCard(pull, i));
  el.cardRow.replaceChildren(...cards);
  showScreen('reveal');

  // Let layout settle so the deal-in transition actually animates.
  await wait(60);

  for (let i = 0; i < pulls.length; i++) {
    const { rarity } = pulls[i];
    const card = cards[i];
    const rank = rarityRank(rarity.id);

    card.classList.add('is-dealt');
    synth.playFlip();
    await wait(TIMING.dealToFlip);

    card.classList.add('is-revealed');
    synth.playReveal(rank);
    if (rarity.flash > 0) fireFlash(rarity.flash);

    await wait(TIMING.betweenCards + rank * TIMING.rarityDwell);
  }

  cards.forEach(enableFlipping);
  el.revealActions.classList.add('is-ready');
}

function enableFlipping(card) {
  card.classList.add('is-flippable');
  const toggle = () => {
    card.classList.toggle('is-revealed');
    synth.playFlip();
  };
  card.addEventListener('click', (event) => {
    // Let the "Read →" link do its own thing.
    if (event.target.closest('.card-link')) return;
    toggle();
  });
  card.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target.closest('.card-link')) return;
    event.preventDefault();
    toggle();
  });
}

/** Screen white-out, scaled by the rarity's `flash` value. */
function fireFlash(intensity) {
  el.flash.style.setProperty('--flash-peak', String(intensity));
  el.flash.classList.remove('is-firing');
  void el.flash.offsetWidth; // restart the animation
  el.flash.classList.add('is-firing');
}

/* --- Odds modal ----------------------------------------------------------- */
function renderOddsTable() {
  el.oddsBody.replaceChildren(
    ...RARITIES.map((rarity) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><span class="odds-name"><span class="odds-swatch"></span><span class="odds-label"></span></span></td>
        <td class="odds-pct"></td>
        <td class="odds-effect"></td>`;
      const swatch = row.querySelector('.odds-swatch');
      swatch.style.color = rarity.color;
      swatch.style.background = rarity.color;
      row.querySelector('.odds-label').textContent = rarity.name;
      row.querySelector('.odds-label').style.color = rarity.color;

      const pct = rarityOdds(rarity);
      row.querySelector('.odds-pct').textContent =
        pct >= 1 ? `${pct.toFixed(1)}%` : `${pct.toFixed(2)}%`;
      row.querySelector('.odds-effect').textContent = rarity.effect;
      return row;
    })
  );
}

function toggleOdds(open) {
  el.oddsModal.hidden = !open;
}

/* --- Wiring --------------------------------------------------------------- */
function init() {
  renderPackGrid();
  renderOddsTable();
  applyPackAccent(state.pack);

  el.openButton.addEventListener('click', openPack);
  el.backButton.addEventListener('click', () => showScreen('select'));
  el.changePackButton.addEventListener('click', () => showScreen('select'));

  // No cooldown in this debug build: straight back to a fresh rip.
  el.againButton.addEventListener('click', () => {
    selectPack(state.pack.id);
    openPack();
  });

  el.oddsButton.addEventListener('click', () => toggleOdds(true));
  el.oddsClose.addEventListener('click', () => toggleOdds(false));
  el.oddsModal.addEventListener('click', (event) => {
    if (event.target === el.oddsModal) toggleOdds(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') toggleOdds(false);
  });

  el.muteButton.addEventListener('click', () => {
    const muted = el.muteButton.getAttribute('aria-pressed') === 'true';
    const next = !muted;
    synth.resume();
    synth.setMuted(next);
    el.muteButton.setAttribute('aria-pressed', String(next));
    el.muteButton.textContent = next ? '🔇 Muted' : '🔊 Sound';
  });
}

init();

// Handy in the console while tuning effects:
//   __packywiki.debugRarity('artifact')  -> force the next pack to one tier
window.__packywiki = {
  PACKS,
  RARITIES,
  rarityById,
  debugRarity(id) {
    const forced = rarityById(id);
    document.querySelectorAll('.card').forEach((card) => {
      card.dataset.rarity = forced.id;
      card.style.setProperty('--rarity', forced.color);
      card.style.setProperty('--rarity-glow', forced.glow);
      card.querySelector('.rarity-badge').textContent = forced.name;
    });
    return forced;
  }
};
