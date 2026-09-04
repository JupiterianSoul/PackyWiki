/* shop: split out of main.js */

import { t, tx } from '../i18n.js';
import { crateReel, formatCountdown, generateShop, rollCrate } from '../shop.js';
import { CUSTOM_CARD_RANGE, boosterPrice, cratePriceAt, freeWindowAt, nextFreeAt, nextRefreshAt, windowIndexAt } from '../economy.js';
import { press, reveal } from '../ui/components.js';
import * as store from '../collection.js';
import { rarityById, rarityRank } from '../data/rarities.js';
import { specColours, specId, specName } from '../booster.js';
import { iconSvg } from '../data/icons.js';
import { synth } from '../ui/sound.js';
import { reportQuest } from './arcade.js';
import { el, esc, money, openSheet, refreshWallet, settings, state, toast } from './core.js';
import { live } from './live.js';
import { gainBooster } from './open.js';
import { buildBooster, renderPacks } from './packs.js';

/* --- shop -------------------------------------------------------------------------------- */

export function freeNoteText() {
  return (`${t('freeShelfNote')} ${t('freeAgainIn', { time: formatCountdown(nextFreeAt() - Date.now()) })}`);
}
/*
 * THE SHOP
 * ----------------------------------------------------------------------------
 * A market of fixed stalls, laid out for a phone: the spotlight deal on top,
 * then the free shelf, a two-column grid of subject boosters, the tier vault,
 * and the packs you built. Nothing scrolls sideways and nothing hides off the
 * edge of the screen; every item is a full tile that says what it is, what is
 * inside and what it costs.
 */

export function renderShop() {
  el.shopTitle.textContent = t('tabShop');
  el.shopPurseLabel.textContent = t('shopPurse');
  el.shopRestockLabel.textContent = t('shopRestockIn');
  el.shopPurse.innerHTML = money(state.wallet);

  shopPainters.length = 0;
  const market = generateShop(windowIndexAt(), state.customPacks, freeWindowAt());
  const sections = [
    buildFeatured(market.featured),
    buildShopSection({
      title: t('shopFreeRow'), note: freeNoteText(), noteAttr: 'data-free-note',
      body: shopGrid(market.free.map((item) => shopTile(item, { free: true })))
    }),
    buildShopSection({
      title: t('shopSubjects'), note: t('shopSubjectsNote'),
      body: shopGrid(market.subjects.map((item) => shopTile(item)))
    }),
    buildShopSection({ title: t('shopPress'), note: t('shopPressNote'), body: buildPress(market.press) }),
    buildShopSection({
      title: t('shopBundles'), note: t('shopBundlesNote'),
      body: shopGrid(market.bundles.map((item) => bundleTile(item)))
    }),
    buildShopSection({ title: t('shopCrate'), note: t('shopCrateNote'), body: buildCrateStall() }),
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
/** Every tile's stock and price repaints itself after a purchase; these are the repainters. */

export const shopPainters = [];

export function repaintShop() { for (const paint of shopPainters) { try { paint(); } catch { /* a tile that is gone */ } } }
/** How many copies of a shelf item this save can still buy in this restock. */

export function stockLeft(item) {
  if (!item || item.stock == null || item.stock === Infinity) return Infinity;
  return Math.max(0, item.stock - store.shopBought(state.profile, item.id));
}

export function buildShopSection({ title, note = '', noteAttr = '', body }) {
  const sec = document.createElement('section');
  sec.className = 'shop-sec';
  sec.innerHTML = `<div class="shop-sec-head"><h3></h3></div>${note ? `<p class="shop-sec-note" ${noteAttr}></p>` : ''}`;
  sec.querySelector('h3').textContent = title;
  if (note) sec.querySelector('.shop-sec-note').textContent = note;
  sec.appendChild(body);
  return sec;
}

export function shopGrid(tiles) {
  const grid = document.createElement('div');
  grid.className = 'shop-grid';
  grid.replaceChildren(...tiles);
  return grid;
}
/** The little "2 left" or "Sold out" mark a shelf item wears. */

export function stockPill(item) {
  const pill = document.createElement('span');
  pill.className = 'shop-stock';
  const paint = () => {
    const left = stockLeft(item);
    pill.hidden = left === Infinity;
    pill.classList.toggle('is-out', left === 0);
    pill.classList.toggle('is-last', left === 1);
    pill.textContent = left === 0 ? t('shopSoldOut') : left === 1 ? t('shopOnlyOne') : t('shopStockLeft', { n: left });
  };
  paint();
  shopPainters.push(paint);
  return pill;
}
/**
 * The one price control everywhere in the market. Knows its shelf item, so
 * it goes grey and says so when the last copy is gone.
 */

export function buyButton(spec, price, { count = 1, after = null, item = null, label = null } = {}) {
  const buy = document.createElement('button');
  buy.type = 'button';
  buy.className = 'buy';
  press(buy, { sound: null });
  const paint = () => {
    const left = stockLeft(item);
    buy.disabled = left <= 0;
    buy.classList.toggle('is-out', left <= 0);
    buy.classList.toggle('is-poor', left > 0 && price > state.wallet);
    buy.innerHTML = left <= 0
      ? `<span class="buy-label">${esc(t('shopSoldOut'))}</span>`
      : `<span class="buy-label">${esc(label ?? t('buy'))}</span><span class="buy-price">${money(price)}</span>`;
  };
  paint();
  shopPainters.push(paint);
  buy.addEventListener('click', () => { if (purchase(spec, price, buy, count, item)) after?.(); });
  return buy;
}
/** What a booster holds, coloured by its tier when it has one. */

export function paintTileMeta(node, spec) {
  const tier = spec.rarityId ? rarityById(spec.rarityId) : null;
  node.textContent = tier
    ? `${t('shopItemMeta', { n: spec.cards })} · ${tx(tier.name)}`
    : t('shopItemMeta', { n: spec.cards });
  if (tier) node.style.color = tier.color;
}
/** One booster as a tile: art, name, contents, stock, then the price. */

export function shopTile(item, { free = false } = {}) {
  const { id, spec, price } = item;
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
    tile.appendChild(stockPill(item));
    tile.appendChild(buyButton(spec, price, { item }));
  }
  return tile;
}
/**
 * The spotlight: one discounted booster, presented like a poster. The poster
 * says what the discount is worth in coins, that there is exactly one, and
 * how long it stays; the shine that crosses it is what pulls the eye.
 */

export function buildFeatured(item) {
  const { spec, price, fullPrice, pct } = item;
  const colours = specColours(spec);
  const sec = document.createElement('section');
  sec.className = 'shop-feature panel';
  sec.style.setProperty('--accent', colours.accent);
  sec.style.setProperty('--accent2', colours.accent2);
  sec.innerHTML = `
    <span class="shop-feature-shine" aria-hidden="true"></span>
    <span class="shop-feature-tag">-${pct}%</span>
    <div class="shop-feature-art"></div>
    <div class="shop-feature-copy">
      <span class="label"></span>
      <h3></h3>
      <p class="shop-feature-meta"></p>
      <p class="shop-feature-prices"><s></s><b class="shop-feature-save"></b></p>
      <p class="shop-feature-foot"><span class="shop-feature-clock" data-feature-clock></span></p>
    </div>`;
  sec.querySelector('.shop-feature-art').appendChild(buildBooster(spec, { size: 'is-small' }));
  sec.querySelector('.label').textContent = t('shopDeal');
  sec.querySelector('h3').textContent = specName(spec);
  paintTileMeta(sec.querySelector('.shop-feature-meta'), spec);
  sec.querySelector('s').innerHTML = money(fullPrice);
  sec.querySelector('.shop-feature-save').innerHTML = t('shopSave', { amount: money(fullPrice - price) });
  sec.querySelector('.shop-feature-foot').prepend(stockPill(item));
  sec.appendChild(buyButton(spec, price, { item }));
  return sec;
}
/**
 * The press: a plate per tier on the run. A plate says exactly what it
 * promises (at least one card of the tier, every print rolled on that
 * tier's row), how big the run is and what is left of it, and its price,
 * which carries the premium the guarantee is worth.
 */

export function buildPress(items) {
  const list = document.createElement('div');
  list.className = 'press';
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'shop-sec-note';
    empty.textContent = t('shopPressEmpty');
    list.appendChild(empty);
    return list;
  }
  list.replaceChildren(...items.map((item) => {
    const { id, spec, price, plain, rarity } = item;
    const row = document.createElement('div');
    row.className = 'press-plate';
    row.dataset.spec = id;
    row.style.setProperty('--tier', rarity.color);
    row.innerHTML = `
      <span class="press-foil" aria-hidden="true"></span>
      <div class="press-head">
        <span class="press-gem">${iconSvg('gem', { size: 20 })}</span>
        <div class="press-copy"><b></b><span class="press-tier"></span></div>
      </div>
      <ul class="press-facts">
        <li class="is-promise"><span class="press-dot"></span><span></span></li>
        <li><span class="press-dot"></span><span></span></li>
        <li><span class="press-dot"></span><span></span></li>
      </ul>
      <div class="press-foot"><span class="press-run"></span></div>`;
    row.querySelector('b').textContent = specName(spec);
    row.querySelector('.press-tier').textContent = tx(rarity.name).toUpperCase();
    const facts = row.querySelectorAll('.press-facts li > span:last-child');
    facts[0].textContent = t('shopPressGuarantee', { rarity: tx(rarity.name) });
    facts[1].textContent = t('shopPressRow', { n: spec.cards, rarity: tx(rarity.name) });
    facts[2].textContent = t('shopPressWorth', { x: String(Math.round((1 + rarity.bonusPct / 100) * 10) / 10).replace(/\.0$/, '') });
    const run = row.querySelector('.press-run');
    run.textContent = t('shopPressRun', { n: item.stock });
    row.querySelector('.press-foot').appendChild(stockPill(item));
    const buy = buyButton(spec, price, { item });
    if (price > plain) buy.title = t('shopPressPremium', { pct: Math.round(((price - plain) / plain) * 100) });
    row.appendChild(buy);
    return row;
  }));
  return list;
}
/**
 * A bundle: several boosters, one price, one tap, and the saving on the
 * label. The wrappers fan out sideways behind the copy, never upward.
 */

export function bundleTile(item) {
  const { id, specs, mixed, pct, full, price } = item;
  const tile = document.createElement('div');
  tile.className = 'shop-tile is-bundle';
  tile.dataset.spec = id;
  const art = document.createElement('div');
  art.className = 'shop-tile-art shop-tile-stack';
  // Three wrappers at most, fanned; a fourth is a number, never a fourth
  // sleeve poking out of the pile.
  const shown = specs.slice(0, 3);
  art.style.setProperty('--n', String(shown.length));
  shown.forEach((spec, i) => {
    const wrap = document.createElement('span');
    wrap.className = 'shop-tile-stack-item';
    wrap.style.setProperty('--i', String(i));
    wrap.appendChild(buildBooster(spec, { size: 'is-tiny' }));
    art.appendChild(wrap);
  });
  if (specs.length > shown.length) {
    const more = document.createElement('span');
    more.className = 'shop-tile-stack-more tabular';
    more.textContent = `+${specs.length - shown.length}`;
    art.appendChild(more);
  }
  tile.appendChild(art);
  const name = document.createElement('p');
  name.className = 'shop-tile-name';
  name.textContent = mixed ? t('shopBundleMixed', { n: specs.length }) : t('shopBundleSame', { name: specName(specs[0]), n: specs.length });
  tile.appendChild(name);
  const list = document.createElement('ul');
  list.className = 'shop-bundle-list';
  const seen = new Map();
  for (const spec of specs) {
    const key = specId(spec);
    seen.set(key, { spec, n: (seen.get(key)?.n ?? 0) + 1 });
  }
  list.replaceChildren(...[...seen.values()].map(({ spec, n }) => {
    const li = document.createElement('li');
    const tier = spec.rarityId ? rarityById(spec.rarityId) : null;
    li.innerHTML = `<b></b><span></span>`;
    li.querySelector('b').textContent = `${n > 1 ? `${n}× ` : ''}${specName(spec)}`;
    li.querySelector('span').textContent = tier ? `${t('shopItemMeta', { n: spec.cards })} · ${tx(tier.name)}` : t('shopItemMeta', { n: spec.cards });
    if (tier) li.querySelector('span').style.color = tier.color;
    return li;
  }));
  tile.appendChild(list);
  const deal = document.createElement('p');
  deal.className = 'shop-bundle-deal';
  deal.innerHTML = `<s>${money(full)}</s><b>${t('shopSave', { amount: money(full - price) })}</b>`;
  tile.appendChild(deal);
  const tag = document.createElement('span');
  tag.className = 'shop-tile-tag';
  tag.textContent = `-${pct}%`;
  tile.appendChild(tag);
  tile.appendChild(stockPill(item));
  const buy = document.createElement('button');
  buy.type = 'button';
  buy.className = 'buy';
  press(buy, { sound: null });
  const paint = () => {
    const left = stockLeft(item);
    buy.disabled = left <= 0;
    buy.classList.toggle('is-out', left <= 0);
    buy.classList.toggle('is-poor', left > 0 && price > state.wallet);
    buy.innerHTML = left <= 0
      ? `<span class="buy-label">${esc(t('shopSoldOut'))}</span>`
      : `<span class="buy-label">${esc(t('buy'))}</span><span class="buy-price">${money(price)}</span>`;
  };
  paint();
  shopPainters.push(paint);
  buy.addEventListener('click', () => purchaseBundle(item, buy));
  tile.appendChild(buy);
  return tile;
}
/* --- the crate ----------------------------------------------------------------------------------
 * One price, whatever comes out, and every crate bought in a restock makes
 * the next one dearer. Buying one rolls a reel of the whole shop across the
 * screen, slowing until it stops on the booster that is yours; the booster
 * is on the shelf before the reel even starts, so closing the sheet early
 * loses nothing. */

export const CRATE_ID = 'crate';

export function crateBoughtNow() {
  return (store.shopBought(state.profile, CRATE_ID));
}

export function cratePriceNow() {
  return (cratePriceAt(crateBoughtNow()));
}

export function buildCrateStall() {
  const stall = document.createElement('div');
  stall.className = 'shop-crate panel';
  stall.innerHTML = `
    <div class="shop-crate-art"><span class="shop-crate-box">${iconSvg('gift', { size: 40 })}</span></div>
    <div class="shop-crate-copy">
      <h3></h3>
      <p class="shop-tile-meta"></p>
      <p class="shop-crate-next tabular"></p>
    </div>`;
  stall.querySelector('h3').textContent = t('shopCrateName');
  stall.querySelector('.shop-tile-meta').textContent = t('shopCrateAny');
  const next = stall.querySelector('.shop-crate-next');
  const buy = document.createElement('button');
  buy.type = 'button';
  buy.className = 'buy is-crate';
  press(buy, { sound: null });
  const paint = () => {
    const price = cratePriceNow();
    const bought = crateBoughtNow();
    buy.classList.toggle('is-poor', price > state.wallet);
    buy.innerHTML = `<span class="buy-label">${esc(t('shopCrateRoll'))}</span><span class="buy-price">${money(price)}</span>`;
    next.innerHTML = bought
      ? t('shopCrateBoughtNext', { n: bought, amount: money(cratePriceAt(bought + 1)) })
      : t('shopCrateNext', { amount: money(cratePriceAt(1)) });
  };
  paint();
  shopPainters.push(paint);
  buy.addEventListener('click', () => openCrate(buy));
  stall.appendChild(buy);
  return stall;
}
/** Buy a crate and roll it. The booster is granted before anything moves. */

export function openCrate(button) {
  const price = cratePriceNow();
  if (state.wallet < price) { synth.playDenied(); toast(t('cantAfford'), 'error'); return; }
  store.saveWallet(state.wallet - price);
  refreshWallet();
  store.markShopBought(state.profile, CRATE_ID, 1);
  const winner = rollCrate(state.customPacks);
  gainBooster({ ...winner }, 1);
  reportQuest('buy', { price, kind: 'crate' });
  synth.playPurchase();
  button?.classList.add('is-bought');
  setTimeout(() => button?.classList.remove('is-bought'), 700);
  repaintShop();
  renderPacks();
  showCrateRoll(winner);
}
/** The reel: the whole shop going by, slowing onto the booster that is yours. */

export function showCrateRoll(winner) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || settings().lowPower;
  const reel = crateReel(winner, state.customPacks);
  const WINNER_AT = 22;
  openSheet(t('shopCrate'), (body) => {
    body.classList.add('crate-body');
    const stage = document.createElement('div');
    stage.className = 'crate-stage';
    stage.innerHTML = `
      <div class="crate-window">
        <span class="crate-marker" aria-hidden="true"></span>
        <span class="crate-shade is-l" aria-hidden="true"></span><span class="crate-shade is-r" aria-hidden="true"></span>
        <div class="crate-strip"></div>
        <span class="crate-flash" aria-hidden="true"></span>
      </div>
      <p class="crate-status"></p>`;
    const strip = stage.querySelector('.crate-strip');
    strip.replaceChildren(...reel.map((spec, i) => {
      const item = document.createElement('div');
      item.className = 'crate-item';
      item.dataset.i = String(i);
      const tier = spec.rarityId ? rarityById(spec.rarityId) : null;
      item.style.setProperty('--tier', tier ? tier.color : 'var(--line-strong)');
      item.appendChild(buildBooster(spec, { size: 'is-tiny' }));
      const cap = document.createElement('span');
      cap.className = 'crate-cap';
      cap.textContent = tier ? `${spec.cards} · ${tx(tier.name)}` : String(spec.cards);
      item.appendChild(cap);
      return item;
    }));
    const status = stage.querySelector('.crate-status');
    status.textContent = t('shopCrateRolling');
    body.appendChild(stage);

    const result = document.createElement('div');
    result.className = 'crate-result';
    result.hidden = true;
    body.appendChild(result);

    const finish = () => {
      const tier = winner.rarityId ? rarityById(winner.rarityId) : null;
      const item = strip.children[WINNER_AT];
      item?.classList.add('is-won');
      stage.querySelector('.crate-flash').classList.add('is-on');
      status.textContent = t('shopCrateWon');
      const high = tier && rarityRank(tier.id) >= rarityRank('legendary');
      if (high) synth.playFanfare?.(); else synth.playResolved?.();
      if (winner.cards >= 6 || high) synth.playCoins?.();
      result.innerHTML = `
        <div class="crate-result-art"></div>
        <div class="crate-result-copy">
          <b></b>
          <p class="crate-result-meta"></p>
          <p class="crate-result-note"></p>
        </div>
        <div class="crate-result-actions"></div>`;
      result.querySelector('.crate-result-art').appendChild(buildBooster(winner, { size: 'is-small' }));
      result.querySelector('b').textContent = specName(winner);
      paintTileMeta(result.querySelector('.crate-result-meta'), winner);
      result.querySelector('.crate-result-note').textContent = t('shopCrateAdded');
      if (tier) result.style.setProperty('--tier', tier.color);
      result.classList.toggle('is-high', Boolean(high));
      const actions = result.querySelector('.crate-result-actions');
      const again = document.createElement('button');
      again.type = 'button';
      again.className = 'btn btn-primary';
      again.innerHTML = `${esc(t('shopCrateAgain'))} · ${money(cratePriceNow())}`;
      press(again, { sound: null });
      again.addEventListener('click', () => { synth.playTap(); live.sheet.hide(); setTimeout(() => openCrate(null), 250); });
      again.disabled = cratePriceNow() > state.wallet;
      const done = document.createElement('button');
      done.type = 'button';
      done.className = 'btn btn-ghost';
      done.textContent = t('done');
      press(done, { sound: null });
      done.addEventListener('click', () => { synth.playTap(); live.sheet.hide(); });
      actions.append(again, done);
      result.hidden = false;
      reveal([result], { step: 0 });
    };

    if (reduced) {
      // No motion: the reel is parked on the winner and the result is shown at once.
      requestAnimationFrame(() => {
        const item = strip.children[WINNER_AT];
        const win = stage.querySelector('.crate-window').getBoundingClientRect();
        const box = item.getBoundingClientRect();
        strip.style.transition = 'none';
        strip.style.transform = `translateX(${-(box.left - win.left + box.width / 2 - win.width / 2)}px)`;
        finish();
      });
      return;
    }

    // Roll: from the start of the reel to the winner, a long ease-out, with a
    // tick every time a new booster passes under the marker.
    const DURATION = 5200;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const win = stage.querySelector('.crate-window').getBoundingClientRect();
      const first = strip.children[0].getBoundingClientRect();
      const second = strip.children[1].getBoundingClientRect();
      const step = second.left - first.left;
      const jitter = (Math.random() - 0.5) * first.width * 0.5;
      const target = -(first.width / 2 + WINNER_AT * step - win.width / 2 + jitter);
      strip.style.transition = `transform ${DURATION}ms cubic-bezier(0.12, 0.84, 0.16, 1)`;
      strip.style.transform = `translateX(${target}px)`;
      let last = -1;
      const start = performance.now();
      const watch = (now) => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(strip).transform);
        const under = Math.floor((win.width / 2 - matrix.m41) / step);
        if (under !== last) { last = under; synth.playRipTick?.(); }
        if (now - start < DURATION + 60) requestAnimationFrame(watch);
        else { synth.playSnap?.(); finish(); }
      };
      requestAnimationFrame(watch);
    }));
  }, { dismissible: true });
}
/**
 * A booster the player built, sized by the player: a stepper from one card
 * to ten, the price following live. The wrapper (economy.WRAPPER_CARDS) is
 * what keeps the sizes honest against each other: the per-card price
 * shown falls as the booster grows, and two of one card always cost more
 * than one of two.
 */

export function customTile({ id, spec, price }) {
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
  shopPainters.push(paint);
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

export function paintFreeButton(button, id, spec) {
  const available = store.freeAvailable(state.profile, id);
  button.disabled = !available;
  button.classList.toggle('is-taken', !available);
  button.innerHTML = available
    ? `<span class="buy-label">${t('claimFree')}</span><span class="buy-price">${t('free')}</span>`
    : `<span class="buy-label">${t('freeTaken')}</span>`;
  button.onclick = available ? () => takeFree(id, spec, button) : null;
}

export function takeFree(id, spec, button) {
  if (!store.freeAvailable(state.profile, id)) return;
  store.markFreeTaken(state.profile, id);
  gainBooster(spec, 1);
  synth.playPurchase();
  toast(`${t('bought')} ${specName(spec)}`, 'ok');
  paintFreeButton(button, id, spec);
  renderPacks();
}
/** One purchase: the wallet, the shelf's stock, the booster, the quests, the sound. */

export function purchase(spec, price, button, count = 1, item = null) {
  if (item && stockLeft(item) <= 0) { synth.playDenied(); toast(t('shopSoldOut'), 'error'); return false; }
  if (state.wallet < price) {
    synth.playDenied();
    toast(t('cantAfford'), 'error');
    return false;
  }
  store.saveWallet(state.wallet - price);
  gainBooster(spec, count);
  if (item) store.markShopBought(state.profile, item.id, 1);
  refreshWallet();
  for (let i = 0; i < count; i++) reportQuest('buy', { price: price / count, kind: spec.kind });
  synth.playPurchase();
  button.classList.add('is-bought');
  setTimeout(() => button.classList.remove('is-bought'), 700);
  toast(`${t('bought')} ${count > 1 ? `${count} × ` : ''}${specName(spec)}`, 'ok');
  repaintShop();
  renderPacks();
  return true;
}
/** A bundle: every booster in it, for one price. */

export function purchaseBundle(item, button) {
  if (stockLeft(item) <= 0) { synth.playDenied(); toast(t('shopSoldOut'), 'error'); return false; }
  if (state.wallet < item.price) { synth.playDenied(); toast(t('cantAfford'), 'error'); return false; }
  store.saveWallet(state.wallet - item.price);
  for (const spec of item.specs) gainBooster({ ...spec }, 1);
  store.markShopBought(state.profile, item.id, 1);
  refreshWallet();
  for (const spec of item.specs) reportQuest('buy', { price: item.price / item.specs.length, kind: spec.kind });
  synth.playPurchase();
  button.classList.add('is-bought');
  setTimeout(() => button.classList.remove('is-bought'), 700);
  toast(`${t('bought')} ${t('shopBundleOf', { n: item.specs.length })}`, 'ok');
  repaintShop();
  renderPacks();
  return true;
}

export function tickRestock() {
  const remaining = nextRefreshAt() - Date.now();
  el.restock.textContent = formatCountdown(remaining);
  const note = el.shopMarket.querySelector('[data-free-note]');
  if (note) note.textContent = freeNoteText();
  if (remaining <= 0) { payStipend(); renderShop(); }
}

export function payStipend() {
  const paid = store.claimStipend(state.profile, store.loadWallet());
  if (paid > 0) {
    refreshWallet();
    synth.playFanfare();
    toast(t('stipendPaid', { amount: money(paid) }), 'ok');
  }
}
