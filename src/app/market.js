/* market: split out of main.js */

import { getLanguage, t, tx } from '../i18n.js';
import * as store from '../collection.js';
import * as account from '../account.js';
import { press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import { rarityById, rarityOfCard } from '../data/rarities.js';
import { formatAmount } from '../pricing.js';
import { renderBinder } from './binder.js';
import { el, esc, money, openSheet, refreshWallet, state, toast } from './core.js';
import { buildStaticCard } from './detail.js';
import { pushNote } from './drawer.js';
import { describeError, signedIn, syncSoon, userId } from './gate.js';
import { live } from './live.js';
import { collectDeliveries } from './social.js';

/* --- the market: every player's auction floor --------------------------------------------
 * The rules live in the database (supabase/schema.sql, V3): the 15% floor,
 * the anti-snipe clock, the no-cancel-once-bid rule and settlement are all
 * server-side, so this file only ASKS. Money moves the way it always has:
 * a bid debits the local wallet before the call; refunds and payouts come
 * back as deliveries, like gifts. While the screen is open it listens on
 * Realtime and polls at a slow beat as well, so a project without Realtime
 * loses immediacy, never correctness.
 */

export const AUCTION_MINUTES = [10, 30, 60, 180, 360, 720, 1440];

export function minutesLabel(m) {
  return (m < 60 ? `${m} min` : `${m / 60} h`);
}

export function auctionFloor(a) {
  return (a.current_bid == null ? a.start_price : Math.ceil(a.current_bid * 1.15));
}

export function auctionLeftMs(a) {
  return (new Date(a.ends_at).getTime() - Date.now());
}

export function fmtLeft(ms) {
  if (ms <= 0) return t('marketEnded');
  const sec = Math.ceil(ms / 1000);
  if (sec < 100) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${String(sec % 60).padStart(2, '0')}s`;
  const h = Math.floor(min / 60);
  return `${h}h ${String(min % 60).padStart(2, '0')}m`;
}

export function rememberBid(id) {
  const mine = state.market.myBids;
  if (!mine.includes(id)) { mine.push(id); store.saveMyBids(mine); }
}
/* One second of housekeeping: countdowns tick, and whichever app first sees
 * a timer at zero rings the settlement bell for everyone. The loops shut
 * themselves down one tick after the player leaves the screen. */

export function marketLoopsOn() {
  const m = state.market;
  if (m.timer) return;
  m.timer = setInterval(marketTick, 1000);
  m.poll = setInterval(() => {
    if (state.tab === 'market') refreshMarket({ quiet: true });
  }, 5000);
  m.unsub = account.subscribeAuctions((row) => {
    if (state.tab !== 'market') return;
    if (row?.id) {
      const i = m.auctions.findIndex((a) => a.id === row.id);
      if (i >= 0) m.auctions[i] = row; else m.auctions.unshift(row);
      renderMarketList();
    } else {
      refreshMarket({ quiet: true });
    }
  });
}

export function marketLoopsOff() {
  const m = state.market;
  clearInterval(m.timer); clearInterval(m.poll);
  m.timer = m.poll = null;
  m.unsub?.(); m.unsub = null;
}

export function marketTick() {
  if (state.tab !== 'market') { marketLoopsOff(); return; }
  for (const cell of el.marketList.querySelectorAll('[data-ends]')) {
    const left = new Date(cell.dataset.ends).getTime() - Date.now();
    cell.textContent = fmtLeft(left);
    cell.classList.toggle('is-closing', left > 0 && left < 60000);
  }
  for (const a of state.market.auctions) {
    if (a.status === 'open' && auctionLeftMs(a) <= 0) maybeSettle(a);
  }
}

export function maybeSettle(a) {
  const m = state.market;
  if (m.settling.has(a.id)) return;
  m.settling.add(a.id);
  account.settleAuction(a.id)
    .catch(() => { /* someone else rang the bell first, or it is not over on the server clock */ })
    .then(async () => {
      await collectDeliveries().catch(() => {});
      if (state.tab === 'market') refreshMarket({ quiet: true });
    });
}

export async function refreshMarket({ quiet = false } = {}) {
  const m = state.market;
  if (!quiet) { el.marketStatus.textContent = t('marketLoading'); el.marketStatus.className = 'find-status is-working'; }
  try {
    m.auctions = await account.listAuctions(userId());
    // A wished card walking onto the floor rings the bell, once per auction.
    let rang = false;
    for (const a of m.auctions) {
      if (a.status !== 'open' || a.seller === userId()) continue;
      if (!state.wishlist.has(a.card?.key) || state.wishSeen.has(a.id)) continue;
      state.wishSeen.add(a.id);
      rang = true;
      pushNote('wish', t('notifWishAuction', { card: esc(a.card?.title ?? '?') }), 'market');
    }
    if (rang) store.saveWishSeen([...state.wishSeen]);
    el.marketStatus.textContent = '';
    renderMarketList();
  } catch (error) {
    el.marketStatus.textContent = error?.message === 'MARKET_UNSET' ? t('marketUnset') : describeError(error);
    el.marketStatus.className = 'find-status is-error';
  }
}

export const MARKET_VIEWS = ['browse', 'selling', 'bidding', 'won', 'history'];

export const MARKET_SORTS = ['ending', 'newest', 'lowest', 'highest'];

export function renderMarket() {
  el.marketTitle.textContent = t('tabMarket');
  el.marketIntro.textContent = t('marketIntro');
  el.marketSell.textContent = t('marketSell');

  if (!account.configured || !signedIn()) {
    el.marketStatus.textContent = account.configured ? t('marketSignIn') : t('marketOffline');
    el.marketStatus.className = 'find-status';
    el.marketList.replaceChildren();
    el.marketSell.hidden = true;
    el.marketSeg.parentElement.hidden = true;
    return;
  }
  el.marketSell.hidden = false;
  el.marketSeg.parentElement.hidden = false;

  // Five rooms, as a scrollable chip row: a five-way segment control does
  // not fit a phone.
  el.marketSeg.className = 'market-views';
  el.marketSeg.replaceChildren(...MARKET_VIEWS.map((view) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip market-view${state.market.view === view ? ' is-on' : ''}`;
    chip.textContent = t(`marketView_${view}`);
    press(chip, { sound: null });
    chip.addEventListener('click', () => {
      if (state.market.view === view) return;
      synth.playTap();
      state.market.view = view;
      renderMarket();
    });
    return chip;
  }));

  // Browse gets the finding tools; the other rooms are short lists.
  let tools = el.marketList.parentElement.querySelector('.market-tools');
  if (!tools) {
    tools = document.createElement('div');
    tools.className = 'market-tools';
    el.marketList.before(tools);
  }
  if (state.market.view === 'browse') {
    tools.hidden = false;
    tools.innerHTML = `
      <input class="creator-input market-search" type="search" data-search
        autocomplete="off" spellcheck="false">
      <div class="market-sorts" data-sorts></div>`;
    const input = tools.querySelector('[data-search]');
    input.placeholder = t('marketSearch');
    input.value = state.market.search;
    input.addEventListener('input', () => {
      state.market.search = input.value;
      renderMarketList();
    });
    tools.querySelector('[data-sorts]').replaceChildren(...MARKET_SORTS.map((sort) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `chip market-sort${state.market.sort === sort ? ' is-on' : ''}`;
      chip.textContent = t(`marketSort_${sort}`);
      press(chip, { sound: null });
      chip.addEventListener('click', () => {
        if (state.market.sort === sort) return;
        synth.playTap();
        state.market.sort = sort;
        renderMarket();
      });
      return chip;
    }));
  } else {
    tools.hidden = true;
  }

  marketLoopsOn();
  refreshMarket();
}

export function normalise(text) {
  return (String(text ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, ''));
}
/** What each room shows, from the one fetched pool. */

export function marketRows() {
  const m = state.market;
  const me = userId();
  const open = (a) => a.status === 'open';
  switch (m.view) {
    case 'selling':
      return m.auctions.filter((a) => a.seller === me && open(a))
        .sort((a, b) => new Date(a.ends_at) - new Date(b.ends_at));
    case 'bidding':
      return m.auctions.filter((a) => open(a) && a.seller !== me && m.myBids.includes(a.id))
        .sort((a, b) => new Date(a.ends_at) - new Date(b.ends_at));
    case 'won':
      return m.auctions.filter((a) => a.status === 'settled' && a.bidder === me)
        .sort((a, b) => new Date(b.ends_at) - new Date(a.ends_at));
    case 'history':
      return m.auctions.filter((a) => a.seller === me && !open(a))
        .sort((a, b) => new Date(b.ends_at) - new Date(a.ends_at));
    default: {
      let rows = m.auctions.filter(open);
      const q = normalise(m.search.trim());
      if (q) rows = rows.filter((a) => normalise(a.card?.title).includes(q));
      const bid = (a) => a.current_bid ?? a.start_price;
      const sorts = {
        ending: (a, b) => new Date(a.ends_at) - new Date(b.ends_at),
        newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
        lowest: (a, b) => bid(a) - bid(b),
        highest: (a, b) => bid(b) - bid(a)
      };
      return [...rows].sort(sorts[m.sort] ?? sorts.ending);
    }
  }
}

export function auctionTile(a) {
  const me = userId();
  const m = state.market;
  const rarity = rarityOfCard(a.card);

  const tile = document.createElement('div');
  tile.className = 'auction-tile';

  // The band above the card: your standing in the fight, or the outcome.
  let band = null;
  if (m.view === 'bidding') {
    const leading = a.bidder === me;
    band = { text: t(leading ? 'marketLead' : 'marketOutbidBand'), cls: leading ? 'is-good' : 'is-bad' };
  } else if (m.view === 'won') {
    band = {
      text: t('marketWonBand', {
        amount: formatAmount(a.current_bid ?? 0),
        date: new Date(a.ends_at).toLocaleDateString(getLanguage() === 'fr' ? 'fr-FR' : 'en-GB')
      }),
      cls: 'is-good'
    };
  } else if (m.view === 'history') {
    const sold = a.status === 'settled' && a.bidder != null;
    band = {
      text: a.status === 'cancelled'
        ? t('marketHistWithdrawn', { amount: formatAmount(a.start_price) })
        : sold
          ? t('marketHistSold', { amount: formatAmount(a.current_bid ?? 0) })
          : t('marketHistUnsold', { amount: formatAmount(a.start_price) }),
      cls: sold ? 'is-good' : ''
    };
  } else if (a.seller === me) {
    band = { text: t('marketYours'), cls: '' };
  }
  if (band) {
    const strip = document.createElement('span');
    strip.className = `auction-band ${band.cls}`;
    strip.textContent = band.text;
    tile.appendChild(strip);
  }

  const card = buildStaticCard(a.card, rarity, null, { fav: false, ownedTag: true });
  card.addEventListener('click', () => { synth.playTap(); openAuctionSheet(a.id); });
  tile.appendChild(card);

  const info = document.createElement('div');
  info.className = 'auction-info';
  const open = a.status === 'open';
  info.innerHTML = `
    <span class="auction-bid">${money(a.current_bid ?? a.start_price)}</span>
    ${open ? `<span class="auction-time market-time" data-ends="${esc(a.ends_at)}">${esc(fmtLeft(auctionLeftMs(a)))}</span>` : ''}
    <span class="auction-sub">${esc(a.bid_count > 0 ? t('marketBids', { n: a.bid_count }) : t('marketNoBids'))}</span>
    <span class="auction-sub is-seller">${esc(a.seller === me ? t('marketYours') : (a.seller_name || '?'))}</span>`;
  tile.appendChild(info);
  return tile;
}

export function renderMarketList() {
  const rows = marketRows();
  if (!rows.length) {
    const note = document.createElement('p');
    note.className = 'empty-note';
    note.textContent = t(`marketEmpty_${state.market.view}`);
    el.marketList.replaceChildren(note);
    return;
  }
  el.marketList.replaceChildren(...rows.map(auctionTile));
}
/** One auction, up close: the card, the clock, and the way to bid on it -
 *  or, for the seller, the way out while nobody has bid yet. */

export function openAuctionSheet(auctionId) {
  const a = state.market.auctions.find((x) => x.id === auctionId);
  if (!a) return;
  const me = userId();
  const mine = a.seller === me;
  const floor = auctionFloor(a);

  openSheet(a.card?.title ?? '?', (body) => {
    const wrap = document.createElement('div');
    wrap.className = 'market-sheet';
    wrap.innerHTML = `
      <div class="market-head">
        <span class="market-art is-big"></span>
        <div class="market-lines"></div>
      </div>
      <div class="market-actions"></div>`;
    const art = wrap.querySelector('.market-art');
    if (a.card?.thumbnail) art.style.backgroundImage = `url("${String(a.card.thumbnail).replace(/"/g, '%22')}")`;
    art.style.borderColor = rarityOfCard(a.card).color;

    const line = (label, html) =>
      `<p class="market-line"><span>${esc(label)}</span><b>${html}</b></p>`;
    const open = a.status === 'open';
    wrap.querySelector('.market-lines').innerHTML = [
      rarity ? line(tx(rarity.name), `<span style="color:${rarity.color}">${money(a.card?.price ?? 0)}</span>`) : '',
      open ? line(t('marketTimeLeft'), `<span data-ends="${esc(a.ends_at)}">${esc(fmtLeft(auctionLeftMs(a)))}</span>`) : '',
      a.current_bid != null
        ? line(t('marketCurrent'), `${money(a.current_bid)}${a.bidder_name ? ` · ${esc(a.bidder_name)}` : ''}`)
        : line(t('marketStartAt'), money(a.start_price)),
      !open && a.status === 'settled' && a.bidder
        ? line(t('marketSoldLine'), `${money(a.current_bid)} · ${esc(a.bidder_name ?? '?')}`)
        : '',
      !open && a.status === 'settled' && !a.bidder ? line('', esc(t('marketHistUnsold', { amount: formatAmount(a.start_price) }))) : '',
      !open && a.status === 'cancelled' ? line('', esc(t('marketCancelled'))) : '',
      mine || !open ? '' : line('', esc(t('marketFloorLine', { amount: formatAmount(floor) })))
    ].filter(Boolean).join('');

    const actions = wrap.querySelector('.market-actions');
    if (mine) {
      if (a.bid_count === 0 && a.status === 'open') {
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'btn btn-danger btn-block';
        cancel.textContent = t('marketCancel');
        press(cancel, { sound: null });
        cancel.addEventListener('click', async () => {
          if (state.market.busy) return;
          state.market.busy = true;
          cancel.disabled = true;
          try {
            await account.cancelAuction(a.id);
            toast(t('marketCancelled'), 'ok');
            synth.playResolved();
            live.sheet.hide();
            await collectDeliveries().catch(() => {});
            refreshMarket({ quiet: true });
          } catch (error) {
            toast(esc(marketError(error)), 'error');
            cancel.disabled = false;
          }
          state.market.busy = false;
        });
        actions.appendChild(cancel);
      } else if (a.status === 'open') {
        actions.innerHTML = `<p class="frames-note">${esc(t('marketCancelLocked'))}</p>`;
      }
    } else if (a.status === 'open') {
      actions.innerHTML = `
        <label class="label" style="display:block;margin-bottom:6px">${esc(t('marketBidLabel'))}</label>
        <input class="creator-input" type="number" inputmode="numeric" min="${floor}" step="1" value="${floor}" data-bid>
        <button class="btn btn-primary btn-block" type="button" style="margin-top:10px" data-go></button>
        <p class="frames-note" style="margin-top:10px">${esc(t('marketSnipeNote'))}</p>`;
      const input = actions.querySelector('[data-bid]');
      const go = actions.querySelector('[data-go]');
      const paint = () => {
        const amount = Math.floor(Number(input.value) || 0);
        go.innerHTML = t('marketBidGo', { amount: money(Math.max(amount, floor)) });
      };
      paint();
      input.addEventListener('input', paint);
      press(go, { sound: null });
      go.addEventListener('click', () => placeBidFlow(a, Math.floor(Number(input.value) || 0), go));
    }
    body.appendChild(wrap);
  });
}

export function marketError(error, auction = null) {
  const code = String(error?.message ?? '');
  if (code.includes('TOO_LOW')) {
    const fresh = auction && state.market.auctions.find((x) => x.id === auction.id);
    return t('marketTooLow', { amount: formatAmount(auctionFloor(fresh ?? auction ?? { start_price: 0 })) });
  }
  if (code.includes('ENDED') || code.includes('NOT_OVER')) return t('marketEndedToast');
  if (code.includes('HAS_BIDS')) return t('marketCancelLocked');
  if (code.includes('TOO_MANY')) return t('marketTooMany');
  if (code.includes('OWN_AUCTION')) return t('marketOwn');
  if (code.includes('MARKET_UNSET')) return t('marketUnset');
  return describeError(error);
}

export async function placeBidFlow(a, amount, btn) {
  const m = state.market;
  if (m.busy) return;
  const floor = auctionFloor(a);
  if (!Number.isFinite(amount) || amount < floor) {
    toast(t('marketTooLow', { amount: formatAmount(floor) }), 'error');
    synth.playDenied();
    return;
  }
  if (amount > store.loadWallet()) {
    toast(t('marketNoFunds'), 'error');
    synth.playDenied();
    return;
  }
  m.busy = true;
  btn.disabled = true;
  // The money leaves first; a failed call puts it straight back. Winning
  // means it is already paid; being outbid brings it home as a delivery.
  store.saveWallet(store.loadWallet() - amount);
  refreshWallet();
  syncSoon();
  try {
    const updated = await account.placeBid(a.id, amount);
    rememberBid(a.id);
    const i = m.auctions.findIndex((x) => x.id === a.id);
    if (i >= 0 && updated?.id) m.auctions[i] = updated;
    toast(t('marketBidPlaced', { amount: money(amount) }), 'ok');
    synth.playPurchase();
    live.sheet.hide();
    renderMarketList();
  } catch (error) {
    store.saveWallet(store.loadWallet() + amount);
    refreshWallet();
    toast(esc(marketError(error, a)), 'error');
    synth.playDenied();
    btn.disabled = false;
    refreshMarket({ quiet: true });
  }
  m.busy = false;
}
/** Sell: pick a card, price it, pick a clock, and it leaves your binder. */

export function openSellSheet() {
  const me = userId();
  const myOpen = state.market.auctions.filter((a) => a.seller === me && a.status === 'open').length;
  if (myOpen >= 10) {
    toast(t('marketTooMany'), 'error');
    synth.playDenied();
    return;
  }
  const mine = store.allEntries(state.collection).filter((c) => c.count > 0 && !store.isLocked(c));
  openSheet(t('marketPickCard'), (body) => {
    if (!mine.length) {
      body.innerHTML = `<p class="muted">${esc(t('marketNoCards'))}</p>`;
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'market-pick';
    grid.replaceChildren(...mine.slice(0, 200).map((entry) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'market-cell';
      cell.innerHTML = `<span class="market-cell-art"></span><b></b>`;
      const art = cell.querySelector('.market-cell-art');
      if (entry.thumbnail) art.style.backgroundImage = `url("${String(entry.thumbnail).replace(/"/g, '%22')}")`;
      art.style.borderColor = rarityById(entry.rarityId)?.color ?? 'transparent';
      cell.querySelector('b').textContent = entry.title;
      press(cell, { sound: null });
      cell.addEventListener('click', () => { synth.playTap(); openListSheet(entry); });
      return cell;
    }));
    body.appendChild(grid);
  });
}

export function openListSheet(entry) {
  openSheet(entry.title, (body) => {
    let minutes = 60;
    body.innerHTML = `
      <div class="market-sheet">
        <div class="market-head">
          <span class="market-art is-big" style="border-color:${rarityById(entry.rarityId)?.color ?? 'transparent'}"></span>
          <div class="market-lines">
            <p class="market-line"><span>${esc(t('marketStartPrice'))}</span></p>
            <input class="creator-input" type="number" inputmode="numeric" min="1" step="1" value="${entry.price}" data-price>
            <p class="market-line" style="margin-top:10px"><span>${esc(t('marketDuration'))}</span></p>
            <div class="market-durations" data-durations></div>
          </div>
        </div>
        <button class="btn btn-primary btn-block" type="button" data-go></button>
        <p class="frames-note" style="margin-top:10px">${esc(t('marketSnipeNote'))}</p>
      </div>`;
    const art = body.querySelector('.market-art');
    if (entry.thumbnail) art.style.backgroundImage = `url("${String(entry.thumbnail).replace(/"/g, '%22')}")`;
    const durations = body.querySelector('[data-durations]');
    durations.replaceChildren(...AUCTION_MINUTES.map((m) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `chip market-duration${m === minutes ? ' is-on' : ''}`;
      chip.textContent = minutesLabel(m);
      press(chip, { sound: null });
      chip.addEventListener('click', () => {
        minutes = m;
        synth.playTap();
        durations.querySelectorAll('.market-duration').forEach((c) => c.classList.toggle('is-on', c === chip));
      });
      return chip;
    }));
    const go = body.querySelector('[data-go]');
    go.textContent = t('marketListGo');
    press(go, { sound: null });
    go.addEventListener('click', async () => {
      if (state.market.busy) return;
      const price = Math.floor(Number(body.querySelector('[data-price]').value) || 0);
      if (price < 1) { synth.playDenied(); return; }
      state.market.busy = true;
      go.disabled = true;
      // Escrow first: the card leaves the binder, and comes back by delivery
      // if the call fails, the sale is withdrawn, or nobody bids.
      const snapshot = { ...entry, count: 1, favorite: false };
      store.sellCopy(state.collection, entry.key);
      syncSoon();
      try {
        await account.createAuction(snapshot, price, minutes);
        toast(t('marketListed', { card: esc(entry.title) }), 'ok');
        synth.playResolved();
        live.sheet.hide();
        renderBinder();
        refreshMarket({ quiet: true });
      } catch (error) {
        store.receiveCardEntry(state.collection, snapshot);
        syncSoon();
        toast(esc(marketError(error)), 'error');
        synth.playDenied();
        go.disabled = false;
      }
      state.market.busy = false;
    });
  });
}
