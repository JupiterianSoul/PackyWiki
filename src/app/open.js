/* open: split out of main.js */

import { rarityBurst, styleForSpec } from '../packstyle.js';
import { synth } from '../ui/sound.js';
import { Bar, dur, press, reveal, trackDrag } from '../ui/components.js';
import * as store from '../collection.js';
import { specColours, specIcon, specId, specName, toDrawPack } from '../booster.js';
import { drawArticles } from '../wiki.js';
import { t, tx } from '../i18n.js';
import { rarityById, rarityOfCard, rarityRank } from '../data/rarities.js';
import { SPECIAL_RARITY_ID } from '../codes.js';
import { bandFor, formatViews, priceFor } from '../pricing.js';
import * as account from '../account.js';
import { buildCardBack } from '../packview.js';
import { DEFAULT_FX } from '../data/fx.js';
import { isSensitive } from '../sensitive.js';
import { iconSvg } from '../data/icons.js';
import { addXp, rankFor, rewardForLevel, xpForCard } from '../progression.js';
import { reportAlbums, reportQuest } from './arcade.js';
import { renderBinder } from './binder.js';
import { DRAW_HARD_LIMIT, EMERGE_DURATION, EMERGE_STAGGER, LAST_CARD_HOLD, PREFETCH_DELAY, RIP_COMMIT, RIP_DIR_KEY, RIP_LOCK_SLOP, RIP_TICK_STEP, SWIPE_COMMIT, TILT_REACH, clamp, clamp01, debug, el, money, openSheet, refreshWallet, settings, showScreen, shuffle, state, wait } from './core.js';
import { buildStaticCard, openCardDetail, tilt } from './detail.js';
import { signedIn, userId } from './gate.js';
import { live } from './live.js';
import { buildBooster, renderPacks } from './packs.js';
import { renderProfile } from './profile.js';
import { refreshLevelBadge, updateBadges } from './regalia.js';
import { buzz } from './settings.js';

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

export function mouthPoint(booster) {
  const stage = el.burstLayer.getBoundingClientRect();
  const rect = booster.getBoundingClientRect();
  return { x: rect.left + rect.width / 2 - stage.left, y: rect.top + rect.height * 0.15 - stage.top };
}
/**
 * Throw one round of particles. `style.particles` is the pack's own language;
 * `lift` biases the cone upward (the mouth points up).
 */

export function spawnBurst(style, { x, y }, { scale = 1 } = {}) {
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

export function raiseBeam(booster, accent) {
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

export function eruptPack(booster) {
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

export const rip = {
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

export function endRipDrag() {
  rip.release?.();
  rip.release = null;
  rip.dragging = false;
}

export function paintRip() {
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

export function applyRipProgress(progress) {
  rip.progress = clamp01(progress);
  paintRip();
  if (Math.abs(rip.progress - rip.lastTick) >= RIP_TICK_STEP) {
    rip.lastTick = rip.progress;
    synth.playRipTick(rip.progress);
  }
}
/** Authoritative set: target and tear move together, no spring in between. */

export function setRip(progress) {
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

export function ripFrame(now) {
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

export function startRipLoop() {
  if (rip.raf) return;
  rip.frameAt = 0;
  rip.raf = requestAnimationFrame(ripFrame);
}

export function stopRipLoop() {
  if (rip.raf) cancelAnimationFrame(rip.raf);
  rip.raf = 0;
  rip.booster?.style.removeProperty('--strain');
  rip.booster?.style.removeProperty('--shear');
}

export function animateRip(from, to, duration) {
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

export function lockRipDirection(dx) {
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

export function rollSnags() {
  const count = 3 + Math.floor(Math.random() * 3);
  const lane = (0.55 - 0.1) / count;
  return Array.from({ length: count }, (_, i) => ({
    at: 0.1 + lane * (i + 0.2 + Math.random() * 0.6),
    give: 0.045 + Math.random() * 0.035,
    popped: false
  }));
}

export function initRip(booster) {
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

export function dropScrap(booster) {
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

export async function completeRip() {
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

export function warmPictures(cards) {
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

export const READY_TTL_MS = 30 * 60 * 1000;

export const READY_WARM_AT_LAUNCH = 6;

export const readyDraws = new Map();
/**
 * Every way a booster is gained: bought, gifted, won, refunded, redeemed.
 * The pack is put on the shelf AND drawn ahead at once, so that by the time
 * a player has walked to the shelf and torn it, the cards have been in hand
 * for a while. A gain is the earliest possible moment to start.
 */

export function gainBooster(spec, count = 1) {
  store.addBooster(state.inventory, spec, count);
  ensureReady(spec);
}
/** The ready draw for this kind, started now if there is none fresh. */

export function ensureReady(spec) {
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

export function dropReady(id) { readyDraws.delete(id); }
/**
 * Point the open screen at the ready draw for this pack. From the shelf
 * this waits a moment, so flicking through the shelf does not start a draw
 * per pack flicked past; from the open screen it is immediate.
 */

export function schedulePrefetch(spec, { delay = PREFETCH_DELAY } = {}) {
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

export function warmDrawer() {
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

export function openReadiness() {
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

export function paintOpenHint() {
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

export function drawFor(spec) {
  const id = specId(spec);
  const held = readyDraws.get(id) ?? (state.prefetch?.id === id ? state.prefetch : null);
  state.prefetch = null;
  dropReady(id);
  if (held && !held.failed && Date.now() - held.at < READY_TTL_MS) return held.promise;
  return drawArticles(toDrawPack(spec)).catch((error) => ({ error }));
}

export function homeTabFor(spec) {
  return (spec?.kind === 'timed' ? 'timed' : 'packs');
}

export function openScreenFor(spec) {
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

export async function openPack(booster) {
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

export async function runOpen(booster) {
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

export const CARD_FRONT_MARKUP = `
  <div class="fx fx-a" aria-hidden="true"></div>
  <div class="fx-code" aria-hidden="true"></div>
  <div class="fx-art" aria-hidden="true"></div>
  <div class="card-art"></div>
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

export function buildPlaceholderCard(index, total) {
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

export function applyRarityVars(node, rarity) {
  node.dataset.rarity = rarity.id;
  node.style.setProperty('--rarity', rarity.color);
  node.style.setProperty('--rarity-glow', rarity.glow);
  // The look its owner chose for this tier, if they chose one. Special sits
  // outside the picker and keeps the treatment its code gave it.
  const chosen = rarity.id === SPECIAL_RARITY_ID ? DEFAULT_FX : (state.cardFx[rarity.id] ?? DEFAULT_FX);
  if (chosen && chosen !== DEFAULT_FX) node.dataset.fx = chosen;
  else delete node.dataset.fx;
}

export function fillFront(front, data, rarity, { ownedTag = false } = {}) {
  const art = front.querySelector('.card-art');
  // What the card is about, marked once here; whether the mark hides the
  // picture is the setting's business, not the card's.
  front.closest('.card')?.toggleAttribute('data-adult', isSensitive(data));
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

export function dressFront(front, data, rarity) {
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

export function sparks(n, { d, s = null, c = null }) {
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

export function wikitextLines(data) {
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
/** The star, unwired. */

export function favButtonNode() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fav-button';
  button.setAttribute('aria-pressed', 'false');
  return button;
}

export function wireFavButton(button, entryKey, { size = 16 } = {}) {
  const paint = () => {
    const on = Boolean(state.collection.entries[entryKey]?.favorite);
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', t('favourites'));
    button.innerHTML = iconSvg(on ? 'starFilled' : 'star', { size });
  };
  paint();
  // The card under the star opens on click; the star's whole reach (it is
  // drawn small and hit large) must never let that through.
  button.addEventListener('pointerdown', (event) => event.stopPropagation());
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

export function bindCards(pulls) {
  state.cards.forEach((card, i) => {
    const pull = pulls[i];
    if (!pull) return;
    applyRarityVars(card, pull.rarity);
    const front = card.querySelector('.card-front');
    const data = { ...pull.article, price: pull.price, packIcon: pull.packIcon };
    fillFront(front, data, pull.rarity);
    // The star lives on the card, not on the face: a face that leans in 3D
    // stops answering taps in Chrome, and a star nobody can press is a card
    // that opens instead. It shows once the card is face up (CSS).
    card.querySelector(':scope > .fav-button')?.remove();
    wireFavButton(card.appendChild(favButtonNode()), pull.article.key);
    card.addEventListener('click', () => {
      if (!card.classList.contains('is-revealed')) return;
      openCardDetail(pull.article.key, data, pull.rarity);
    });
  });
}
/* --- reveal ---------------------------------------------------------------------------------- */

/* The fan of the deck. The held card's lean is not here: it is the tilt
   engine's, written as custom properties the front face reads. */

export function layoutDeck() {
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

export async function revealCurrent() {
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

export function goTo(index) {
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

export function showSummary() {
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

export function initSwipe() {
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

export function fireFlash(intensity, tint = null) {
  if (!settings().flash) return;
  el.flash.style.setProperty('--flash-peak', String(intensity));
  if (tint) el.flash.style.setProperty('--flash-tint', tint);
  el.flash.classList.remove('is-firing');
  void el.flash.offsetWidth;
  el.flash.classList.add('is-firing');
}
/* --- experience and levels ---------------------------------------------------------------------- */

export function awardXp(pulls) {
  const gained = pulls.reduce((sum, pull) => sum + xpForCard(pull.rarity.id), 0);
  const levels = addXp(state.profile.progress, gained);
  if (levels.length) state.profile.pendingLevels.push(...levels);
  store.saveProfile(state.profile);
  showXpPop(gained);
  refreshLevelBadge();
}

export let xpPopTimer = null;

export function showXpPop(amount) {
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

export function drainLevelUps() {
  const level = state.profile.pendingLevels[0];
  if (level == null) return false;
  showLevelUp(level);
  return true;
}

export function rewardCard(reward, { art = true } = {}) {
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

export function showLevelUp(level) {
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

export function claimLevel(level, reward) {
  if (reward.coins) store.saveWallet(store.loadWallet() + reward.coins);
  if (reward.spec) gainBooster(reward.spec, 1);

  state.profile.pendingLevels = state.profile.pendingLevels.filter((l) => l !== level);
  store.saveProfile(state.profile);
  refreshWallet();
  refreshLevelBadge();
  renderPacks();
  synth.playCoins();
  live.sheet.hide({ silent: true, force: true });

  // More than one level at once is possible on a very good pack.
  setTimeout(() => {
    if (!drainLevelUps() && state.tab === 'profile') renderProfile();
  }, dur(360));
}
