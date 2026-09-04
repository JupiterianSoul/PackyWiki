/* detail: split out of main.js */

import * as store from '../collection.js';
import { renderPacks } from './packs.js';
import { RARITIES, rarityRank } from '../data/rarities.js';
import { repairCard } from '../wiki.js';
import { synth } from '../ui/sound.js';
import * as account from '../account.js';
import { t, tx } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import { isSensitive } from '../sensitive.js';
import { press, reveal, trackDrag } from '../ui/components.js';
import { bandFor, formatViews } from '../pricing.js';
import { sellPriceFor } from '../economy.js';
import { reportQuest } from './arcade.js';
import { renderBinder } from './binder.js';
import { TILT_REACH, clamp, esc, money, openSheet, refreshWallet, settings, state, toast } from './core.js';
import { signedIn, userId } from './gate.js';
import { live } from './live.js';
import { CARD_FRONT_MARKUP, applyRarityVars, dressFront, favButtonNode, fillFront, gainBooster, wireFavButton } from './open.js';
import { updateBadges } from './regalia.js';

/* --- card detail ---------------------------------------------------------------------------------- */

/** A face-up card with no back and no flip: summary, binder and detail. */
/* --- the wishlist ------------------------------------------------------------------------
 * A wish is a card you want, whoever holds it. It lives on the server (so
 * friends can see it and the auction floor can ring a bell for it) with a
 * local cache for instant paint. Offline builds keep the cache alone. */

export function wishSnapshot(data) {
  return {
    key: data.key, title: data.title, rarityId: data.rarityId ?? null,
    price: data.price ?? null, views: data.views ?? null,
    thumbnail: data.thumbnail ?? null, lang: data.lang ?? null
  };
}

export function toggleWish(data) {
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

export function wireWishButton(button, data) {
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

export async function refreshWishes() {
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

export const litWatcher = typeof IntersectionObserver === 'function'
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

export function lightWhenVisible(card) {
  if (!litWatcher) { card.classList.add('is-lit'); return; }
  litWatcher.observe(card);
}

export function buildStaticCard(data, rarity, entryKey = null, { fav = true, lit = 'auto', ownedTag = false, wish = true } = {}) {
  // `lit` runs the tier's animations: `true` always (the one card in a
  // sheet), `'auto'` while it is on screen (every grid), `false` never.
  const card = document.createElement('article');
  card.className = `card is-revealed${lit === true ? ' is-lit' : ''}`;
  applyRarityVars(card, rarity);
  card.innerHTML = `<div class="card-inner"><div class="card-face card-front">${CARD_FRONT_MARKUP}</div></div>`;
  const front = card.querySelector('.card-front');
  fillFront(front, data, rarity, { ownedTag });
  // The star and the bookmark sit on the CARD, above the leaning face: a
  // face turned in 3D stops answering taps in Chrome, and a button nobody
  // can press is a card that opens instead.
  if (fav && entryKey) wireFavButton(card.appendChild(favButtonNode()), entryKey);
  // The wish bookmark sits under the star, on every card that can name
  // itself - your own, a friend's, a stranger's at auction.
  if (wish && data.key && !data.creator) {
    const wishButton = document.createElement('button');
    wishButton.type = 'button';
    wishButton.className = `wish-button${fav && entryKey ? '' : ' is-alone'}`;
    card.appendChild(wishButton);
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

export function openCardDetail(entryKey, data, rarity) {
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
    if (isSensitive(data)) card.toggleAttribute('data-adult', true);
    card.innerHTML = `
      <div class="card-inner">
        <div class="card-face card-front">
          <div class="fx fx-a" aria-hidden="true"></div>
          <div class="fx-code" aria-hidden="true"></div>
          <div class="fx-art" aria-hidden="true"></div>
          <div class="card-art"></div>
          <button class="fav-button is-giant" type="button" aria-pressed="false"></button>
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
            <button class="btn btn-ghost btn-sm fuse" type="button" hidden></button>
            <button class="btn btn-ghost btn-sm sell" type="button" hidden></button>
          </div>
          <div class="fx-p" aria-hidden="true"></div>
          <div class="fx fx-b" aria-hidden="true"></div>
          <div class="fx-ring" aria-hidden="true"></div>
        </div>
      </div>`;
    body.appendChild(card);

    // The same star as on the small face, for a card that is actually yours.
    const giantFav = card.querySelector('.fav-button');
    if (entry) wireFavButton(giantFav, entryKey, { size: 20 });
    else giantFav.remove();

    // The tag that answers "do I have this?" wherever the card was met.
    if (state.collection.entries[entryKey]) {
      const tag = document.createElement('span');
      tag.className = 'owned-tag';
      tag.textContent = t('ownedTag');
      card.querySelector('.card-title').appendChild(tag);
    }
    // A card of yours is checked against its article now and then: renamed
    // pages bring the card up to date, deleted ones are said to be gone.
    if (entry) checkArticle(card, entryKey, entry);

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
    // A hidden picture can be asked for, once, here: the card is open because
    // the player chose to open it.
    if (card.hasAttribute('data-adult') && settings().blurAdult) {
      const reveal = document.createElement('button');
      reveal.type = 'button';
      reveal.className = 'adult-reveal';
      reveal.innerHTML = `${iconSvg('spark', { size: 15 })}<span>${esc(t('adultReveal'))}</span>`;
      press(reveal, { sound: null });
      reveal.addEventListener('click', (event) => {
        event.stopPropagation();
        card.removeAttribute('data-adult');
        reveal.remove();
      });
      card.querySelector('.card-art').appendChild(reveal);
    }
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
    // Three spare copies fuse into a one-card booster a tier up: a use for
    // the fourth Cat that is not selling it for a third of its price.
    const fuse = card.querySelector('.fuse');
    fuse.hidden = !canFuse(entry);
    if (!fuse.hidden) {
      state.detail.fuseButton = fuse;
      paintFuseButton();
      press(fuse, { sound: null });
      fuse.addEventListener('click', handleFuse);
    }

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

/** Says, on the giant card, that the article behind it is gone. */
function noteGone(card) {
  if (card.querySelector('.giant-gone')) return;
  const line = document.createElement('p');
  line.className = 'giant-gone';
  line.textContent = t('detailGone');
  card.querySelector('.giant-facts').after(line);
}

/**
 * Looks the card's article up (see wiki/repair.js), writes what it learns
 * into the entry, and repaints the card if it is still the one on screen.
 * The check itself is recorded whatever it found, so a card is looked at
 * once a week and not on every open.
 */
function checkArticle(card, entryKey, entry) {
  if (entry.gone) noteGone(card);
  repairCard(entry).then((fix) => {
    if (!fix) return;
    entry.checkedAt = Date.now();
    if (fix.gone) entry.gone = true;
    else {
      delete entry.gone;
      for (const field of ['title', 'description', 'extract', 'thumbnail']) if (fix[field]) entry[field] = fix[field];
    }
    store.saveCollection(state.collection);
    if (state.detail?.key !== entryKey || !card.isConnected) return;
    if (fix.gone) { noteGone(card); return; }
    card.querySelector('.giant-gone')?.remove();
    if (fix.title) {
      const title = card.querySelector('.card-title');
      const tag = title.querySelector('.owned-tag');
      title.textContent = entry.title;
      if (tag) title.appendChild(tag);
    }
    if (fix.description) card.querySelector('.card-desc').textContent = entry.description;
    if (fix.extract) card.querySelector('.giant-extract').textContent = entry.extract;
  }).catch(() => { /* the line, not the card: try another day */ });
}

export function paintSellButton() {
  const detail = state.detail;
  if (!detail?.sellButton) return;
  const entry = state.collection.entries[detail.key];
  if (!entry) { detail.sellButton.hidden = true; return; }
  const amount = sellPriceFor(entry.price);
  detail.sellButton.classList.toggle('btn-danger', detail.sellArmed);
  detail.sellButton.classList.toggle('is-armed', detail.sellArmed);
  detail.sellButton.innerHTML = detail.sellArmed ? t('sellConfirm') : t('sell', { amount: money(amount) });
}

/** Copies to spare, a tier above to reach, and nothing locked about it. */
/** Copies a fusion takes; the card keeps at least one. */
export const FUSE_COPIES = 3;

export function canFuse(entry) {
  if (!entry || store.isLocked(entry) || entry.special) return false;
  const rank = rarityRank(entry.rarityId);
  return (entry.count ?? 1) >= FUSE_COPIES + 1 && rank >= 0 && rank < RARITIES.length - 1;
}

/** The tier a fused booster is guaranteed: one above the card's. */
export const fuseTierFor = (entry) => RARITIES[Math.min(RARITIES.length - 1, rarityRank(entry.rarityId) + 1)];

export function paintFuseButton() {
  const detail = state.detail;
  const btn = detail?.fuseButton;
  if (!btn) return;
  const entry = state.collection.entries[detail.key];
  if (!entry || !canFuse(entry)) { btn.hidden = true; return; }
  btn.textContent = detail.fuseArmed
    ? t('fuseConfirm', { tier: tx(fuseTierFor(entry).name) })
    : t('fuse', { n: FUSE_COPIES, tier: tx(fuseTierFor(entry).name) });
  btn.classList.toggle('is-armed', Boolean(detail.fuseArmed));
}

export function handleFuse() {
  const detail = state.detail;
  if (!detail) return;
  const entry = state.collection.entries[detail.key];
  if (!canFuse(entry)) { synth.playDenied(); return; }

  if (!detail.fuseArmed) {
    detail.fuseArmed = true;
    paintFuseButton();
    synth.playArm();
    setTimeout(() => {
      if (state.detail === detail && detail.fuseArmed) { detail.fuseArmed = false; paintFuseButton(); }
    }, 4000);
    return;
  }

  const tier = fuseTierFor(entry);
  for (let i = 0; i < FUSE_COPIES; i++) store.takeCardCopy(state.collection, detail.key);
  const spec = { kind: 'open', themeId: null, rarityId: tier.id, cards: 1 };
  gainBooster(spec);
  state.profile.fused = (state.profile.fused ?? 0) + 1;
  store.saveProfile(state.profile);
  reportQuest('fuse');
  updateBadges();
  synth.playCoins();
  toast(t('fused', { n: FUSE_COPIES, tier: tx(tier.name) }), 'ok');
  detail.fuseArmed = false;
  // The card is still yours, with fewer copies: the sheet is rebuilt on it.
  const left = state.collection.entries[detail.key];
  if (left) openCardDetail(detail.key, detail.data, detail.rarity);
  else live.sheet.hide();
  renderBinder();
  renderPacks();
}

export function handleSell() {
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
  live.sheet.hide();
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

export const tilt = {
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

export const flareTimers = new WeakMap();

export function flare(card) {
  card.classList.add('is-hot');
  clearTimeout(flareTimers.get(card));
  flareTimers.set(card, setTimeout(() => card.classList.remove('is-hot'), 900));
}
/** Hold and move to lean the card and slide its light. It does not travel. */

export function attachTilt(card) {
  card.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button, a')) return;
    trackDrag(event, {
      onMove: (dx, dy) => tilt.hold(card, dx / TILT_REACH, dy / TILT_REACH),
      onEnd: () => tilt.release(card)
    });
  });
}
