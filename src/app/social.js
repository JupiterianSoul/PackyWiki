/* social: split out of main.js */

import * as account from '../account.js';
import { getLanguage, t, tx } from '../i18n.js';
import { rankFor } from '../progression.js';
import { Bar, Segmented, press, reveal } from '../ui/components.js';
import { iconSvg } from '../data/icons.js';
import { synth } from '../ui/sound.js';
import * as store from '../collection.js';
import { RARITIES, rarityById, rarityRank } from '../data/rarities.js';
import { specId, specName } from '../booster.js';
import { frameTier } from '../frames.js';
import { isSensitive } from '../sensitive.js';
import { CURRENCY_NAME, formatAmount } from '../pricing.js';
import { albumsDeep, buildAlbums } from '../albums.js';
import { reportQuest } from './arcade.js';
import { buildAlbumCover, classicSections, renderBinder } from './binder.js';
import { el, esc, openSheet, refreshWallet, showScreen, state, toast } from './core.js';
import { buildStaticCard, openCardDetail, refreshWishes } from './detail.js';
import { pushNote, whenText } from './drawer.js';
import { describeError, signedIn, syncSoon, userId } from './gate.js';
import { live } from './live.js';
import { gainBooster } from './open.js';
import { buildBooster, renderPacks } from './packs.js';
import { formatDuration, renderProfile } from './profile.js';
import { paintFrameInto, updateBadges } from './regalia.js';
import { renderCustomize } from './settings.js';

/* --- friends -------------------------------------------------------------------------------------------------- */

/** One person, however they are related to you: result, friend or request. */

export function personRow(profile, actions, { onOpen = null, note = null } = {}) {
  const row = document.createElement(onOpen ? 'button' : 'div');
  if (onOpen) row.type = 'button';
  row.className = 'person';
  row.innerHTML = `
    <span class="person-mark"></span>
    <span class="person-copy"><b></b><span></span></span>
    <span class="person-actions"></span>`;

  const mark = row.querySelector('.person-mark');
  paintAvatarInto(mark, profile);
  const live = account.isOnline(profile);
  if (live !== null) {
    const dot = document.createElement('span');
    dot.className = `presence-dot${live ? ' is-online' : ''}`;
    mark.appendChild(dot);
  }
  row.querySelector('b').textContent = profile.username ?? '';
  row.querySelector('.person-copy span').textContent = t('friendsLevelLine', {
    n: profile.level ?? 1,
    rank: tx(rankFor(profile.level ?? 1).name)
  });

  const bay = row.querySelector('.person-actions');
  for (const [labelKey, kind, run] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn btn-sm ${kind}`;
    button.textContent = t(labelKey);
    press(button, { sound: null });
    button.addEventListener('click', (event) => {
      event.stopPropagation();          // the row itself may be a link
      run(button);
    });
    bay.appendChild(button);
  }
  if (note) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `${iconSvg('hourglass', { size: 13 })}<span></span>`;
    chip.querySelector('span').textContent = t(note);
    bay.appendChild(chip);
  } else if (!actions.length) {
    bay.innerHTML = `<span class="muted">${iconSvg('chevron', { size: 18 })}</span>`;
  }

  if (onOpen) {
    press(row, { sound: null });
    row.addEventListener('click', () => { synth.playTap(); onOpen(); });
  }
  return row;
}
/**
 * Guard every network action behind one place that reports what went wrong.
 *
 * Names are escaped on the way into a toast. The database constrains a
 * username to letters, digits and underscores, so there is nothing to escape
 * in practice - but toast() takes markup, and a value that came off the
 * network should not be the one place that relies on a constraint holding.
 */

export async function socialAction(run, doneKey = null, vars = {}) {
  const safe = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, esc(v)]));
  try {
    await run();
    await loadFriends();
    if (doneKey) toast(t(doneKey, safe));
  } catch (error) {
    toast(esc(describeError(error)), 'error');
    synth.playDenied();
  }
}

export async function loadFriends() {
  if (!signedIn() || !state.account.profile) return;
  try {
    const lists = await account.listFriendships(userId());
    Object.assign(state.social, lists, { loaded: true });
  } catch {
    state.social.loaded = false;
  }
  updateBadges();
  if (state.tab === 'friends') renderFriends();
  if (state.tab === 'profile') renderProfile();
  refreshWishes();
}
/**
 * The full social heartbeat: friendships, presence, post, trades, unread.
 * Runs on resume and once a minute. Every part is best-effort - a dead
 * network costs freshness, never state.
 */

export async function syncSocial() {
  if (!signedIn() || !state.account.profile) return;
  await loadFriends();
  account.heartbeat(userId()).catch(() => {});
  try { await collectDeliveries(); } catch { /* next pass */ }
  try { state.social.unread = await account.unreadBySender(userId()); } catch { /* keep old */ }
  try {
    state.social.trades = await account.openTrades(userId());
    await reconcileTrades();
  } catch { /* keep old */ }
  updateBadges();
  if (state.tab === 'friends') renderFriends();
  if (state.tab === 'chat' && state.chat) refreshChat();
}
/**
 * Claim everything in my postbox: gifted cards, gifted boosters, and the
 * goods side of accepted trades. Each item lands in the local save first and
 * is marked claimed second, so a crash in between duplicates rather than
 * destroys - the kinder failure.
 */

export async function collectDeliveries() {
  const waiting = await account.pendingDeliveries(userId());
  if (!waiting.length) return;
  for (const item of waiting) {
    const from = state.social.friends.find((f) => f.otherId === item.sender)?.profile?.username
      ?? t('friendSomeone');
    if (item.kind === 'booster' && item.payload?.spec) {
      gainBooster(item.payload.spec, item.payload.count ?? 1);
      pushNote('gift', t('notifGiftBooster', { name: from }), 'packs');
    } else if (item.kind === 'card' && item.payload?.key) {
      store.receiveCardEntry(state.collection, item.payload);
      pushNote('gift', t('notifGiftCard', { name: from, card: item.payload.title }), 'binder');
    } else if (item.kind === 'trade-return' && Array.isArray(item.payload?.cards)) {
      for (const card of item.payload.cards) store.receiveCardEntry(state.collection, card);
      reportQuest('trade');
      pushNote('trade', t('notifTradeDone', { name: from }), 'binder');
    } else if (item.kind === 'auction-card' && item.payload?.key) {
      store.receiveCardEntry(state.collection, item.payload);
      // A card from someone ELSE is a card won at auction; my own sender
      // means my card walking home unsold or withdrawn.
      if (item.sender !== userId()) {
        state.profile.auctionsWon = (state.profile.auctionsWon ?? 0) + 1;
        store.saveProfile(state.profile);
      }
      pushNote('trade', t('notifAuctionCard', { card: item.payload.title ?? '?' }), 'binder');
    } else if (item.kind === 'auction-money' && Number.isFinite(item.payload?.amount)) {
      store.saveWallet(store.loadWallet() + item.payload.amount);
      refreshWallet();
      if (item.payload.reason === 'sale') {
        state.profile.auctionsSold = (state.profile.auctionsSold ?? 0) + 1;
        store.saveProfile(state.profile);
      }
      pushNote('trade', t(item.payload.reason === 'sale' ? 'notifAuctionSold' : 'notifAuctionRefund',
        { amount: `${formatAmount(item.payload.amount)} ${CURRENCY_NAME}`, card: item.payload.title ?? '?' }), 'shop');
    }
    await account.claimDelivery(item.id);
  }
  synth.playTrade();
  renderPacks();
  if (state.tab === 'binder') renderBinder();
  syncSoon();
}
/**
 * The proposer's side of a finished trade: an accepted one just needs
 * closing (the goods arrive by delivery); a declined one hands the escrowed
 * cards back.
 */

export async function reconcileTrades() {
  for (const trade of state.social.trades) {
    if (trade.proposer !== userId()) continue;
    if (trade.status === 'declined' || trade.status === 'cancelled') {
      for (const card of trade.offer ?? []) store.receiveCardEntry(state.collection, card);
      await account.setTradeStatus(trade.id, 'closed');
      const who = state.social.friends.find((f) => f.otherId === trade.recipient)?.profile?.username ?? '?';
      pushNote('trade', t('notifTradeDeclined', { name: who }), 'binder');
      syncSoon();
    } else if (trade.status === 'accepted') {
      await account.setTradeStatus(trade.id, 'closed');
      // Closing is what makes this run once, so the counter is safe here.
      state.profile.tradesDone = (state.profile.tradesDone ?? 0) + 1;
      store.saveProfile(state.profile);
      // The cards arrive as a delivery; the note for that is written there.
    }
  }
  state.social.trades = state.social.trades.filter((tr) => tr.status === 'pending');
}
/* --- favourites (local) ------------------------------------------------------ */

export function isFavFriend(id) {
  return ((state.profile.favFriends ?? []).includes(id));
}

export function toggleFavFriend(id) {
  const list = state.profile.favFriends ??= [];
  const at = list.indexOf(id);
  if (at >= 0) list.splice(at, 1); else list.push(id);
  store.saveProfile(state.profile);
}
/* --- gifting ------------------------------------------------------------------ */

/** Pick one of my cards; hand it over. The card leaves my save first. */
/**
 * One Gift button, asked what kind. Two buttons sitting side by side made the
 * row long and the choice look like two different features, when it is one
 * thing with two shapes.
 */

export function openGiftChooser(entry) {
  openSheet(t('giftChooseTitle', { name: entry.profile.username }), (body) => {
    const note = document.createElement('p');
    note.textContent = t('giftChooseNote');

    const choices = document.createElement('div');
    choices.className = 'gift-choices';
    const choice = (icon, labelKey, run) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ghost gift-choice';
      btn.innerHTML = `${iconSvg(icon, { size: 20 })}<span>${esc(t(labelKey))}</span>`;
      press(btn, { sound: null });
      btn.addEventListener('click', () => { synth.playTap(); live.sheet.hide(); run(); });
      return btn;
    };
    choices.append(
      choice('gift', 'giftCardOpen', () => openGiftCard(entry)),
      choice('packs', 'giftBoosterOpen', () => openGiftBooster(entry))
    );
    body.append(note, choices);
  });
}

export function openGiftCard(entry) {
  const mine = store.allEntries(state.collection)
    .filter((c) => !store.isLocked(c))
    .sort((a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId));
  openSheet(t('giftCardTitle', { name: entry.profile.username }), (body) => {
    if (!mine.length) {
      body.innerHTML = '<p class="muted"></p>';
      body.querySelector('p').textContent = t('giftNothing');
      return;
    }
    const list = document.createElement('div');
    list.className = 'pick-list';
    list.replaceChildren(...mine.map((card) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'pick-row';
      row.innerHTML = `
        <span class="pick-thumb"></span>
        <span class="pick-copy"><b></b><span></span></span>
        <span class="chip tabular">×${card.count}</span>`;
      if (card.thumbnail) row.querySelector('.pick-thumb').style.backgroundImage = `url("${card.thumbnail}")`;
      row.querySelector('b').textContent = card.title;
      const tier = row.querySelector('.pick-copy span');
      tier.textContent = tx(rarityById(card.rarityId).name);
      tier.style.color = rarityById(card.rarityId).color;
      press(row, { sound: null });
      row.addEventListener('click', async () => {
        row.disabled = true;
        const snapshot = store.takeCardCopy(state.collection, card.key);
        if (!snapshot) return;
        try {
          await account.sendDelivery(userId(), entry.otherId, 'card', snapshot);
          reportQuest('gift');
          state.profile.giftsSent = (state.profile.giftsSent ?? 0) + 1;
          store.saveProfile(state.profile);
          toast(t('giftSent', { name: esc(entry.profile.username) }));
          synth.playTrade();
          live.sheet.hide();
          renderBinder();
          syncSoon();
        } catch (error) {
          store.receiveCardEntry(state.collection, snapshot);   // undo
          toast(esc(describeError(error)), 'error');
          row.disabled = false;
        }
      });
      return row;
    }));
    body.appendChild(list);
  });
}
/** Pick one of my unopened boosters; hand it over. */

export function openGiftBooster(entry) {
  // A special booster (a secret code's) stays with whoever redeemed it.
  const owned = store.ownedBoosters(state.inventory).filter((slot) => slot.spec.kind !== 'code');
  openSheet(t('giftBoosterTitle', { name: entry.profile.username }), (body) => {
    if (!owned.length) {
      body.innerHTML = '<p class="muted"></p>';
      body.querySelector('p').textContent = t('giftNoBoosters');
      return;
    }
    const list = document.createElement('div');
    list.className = 'pick-list';
    list.replaceChildren(...owned.map((slot) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'pick-row';
      row.innerHTML = `
        <span class="pick-art"></span>
        <span class="pick-copy"><b></b><span></span></span>
        <span class="chip tabular">×${slot.count}</span>`;
      row.querySelector('.pick-art').appendChild(buildBooster(slot.spec, { size: 'is-tiny' }));
      row.querySelector('b').textContent = specName(slot.spec);
      row.querySelector('.pick-copy span').textContent = `${slot.spec.cards} ${t('cards')}`;
      press(row, { sound: null });
      row.addEventListener('click', async () => {
        row.disabled = true;
        if (!store.takeBooster(state.inventory, specId(slot.spec))) return;
        try {
          await account.sendDelivery(userId(), entry.otherId, 'booster', { spec: slot.spec });
          reportQuest('gift');
          state.profile.giftsSent = (state.profile.giftsSent ?? 0) + 1;
          store.saveProfile(state.profile);
          toast(t('giftSent', { name: esc(entry.profile.username) }));
          synth.playTrade();
          live.sheet.hide();
          renderPacks();
          syncSoon();
        } catch (error) {
          gainBooster(slot.spec, 1);      // undo
          toast(esc(describeError(error)), 'error');
          row.disabled = false;
        }
      });
      return row;
    }));
    body.appendChild(list);
  });
}
/* --- trading ------------------------------------------------------------------- */

/**
 * Propose a trade: pick up to three of my cards to give and up to three of
 * theirs to ask for. My cards go into escrow the moment the trade is posted.
 */

export async function openTradeSheet(entry) {
  let theirs = [];
  try { theirs = (await account.friendCollection(entry.otherId)) ?? []; } catch { theirs = []; }
  const mine = store.allEntries(state.collection)
    .filter((c) => !store.isLocked(c))
    .sort((a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId));
  theirs = theirs.filter((c) => !store.isLocked(c));
  theirs.sort((a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId));

  const give = new Set();
  const ask = new Set();

  openSheet(t('tradeTitle', { name: entry.profile.username }), (body) => {
    body.innerHTML = `
      <p class="label" data-give-label style="margin-bottom:8px"></p>
      <div class="pick-list is-short" data-give></div>
      <p class="label" data-ask-label style="margin:16px 0 8px"></p>
      <div class="pick-list is-short" data-ask></div>
      <button class="btn btn-primary btn-block" type="button" data-send style="margin-top:16px"></button>`;
    body.querySelector('[data-give-label]').textContent = t('tradeGive');
    body.querySelector('[data-ask-label]').textContent = t('tradeAsk');
    const sendBtn = body.querySelector('[data-send]');

    const paintSend = () => {
      sendBtn.textContent = t('tradeSend', { give: give.size, ask: ask.size });
      sendBtn.disabled = give.size === 0 || ask.size === 0;
    };
    const pickRow = (card, bag, cap = 3) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'pick-row is-tick';
      row.innerHTML = `
        <span class="pick-thumb"></span>
        <span class="pick-copy"><b></b><span></span></span>
        <span class="pick-tick">${iconSvg('check', { size: 15 })}</span>`;
      if (card.thumbnail) row.querySelector('.pick-thumb').style.backgroundImage = `url("${card.thumbnail}")`;
      row.querySelector('b').textContent = card.title;
      const tier = row.querySelector('.pick-copy span');
      tier.textContent = tx(rarityById(card.rarityId).name);
      tier.style.color = rarityById(card.rarityId).color;
      press(row, { sound: null });
      row.addEventListener('click', () => {
        if (bag.has(card.key)) bag.delete(card.key);
        else if (bag.size < cap) bag.add(card.key);
        row.classList.toggle('is-on', bag.has(card.key));
        paintSend();
      });
      return row;
    };

    body.querySelector('[data-give]').replaceChildren(...mine.slice(0, 60).map((c) => pickRow(c, give)));
    const askBay = body.querySelector('[data-ask]');
    if (!theirs.length) {
      askBay.innerHTML = '<p class="muted" style="font-size:.84rem"></p>';
      askBay.querySelector('p').textContent = t('tradeTheirsHidden');
    } else {
      askBay.replaceChildren(...theirs.slice(0, 60).map((c) => pickRow(c, ask)));
    }

    paintSend();
    press(sendBtn, { sound: null });
    sendBtn.addEventListener('click', async () => {
      sendBtn.disabled = true;
      // Escrow: the offered cards leave my save now.
      const offer = [...give].map((key) => store.takeCardCopy(state.collection, key)).filter(Boolean);
      const askList = [...ask].map((key) => {
        const card = theirs.find((c) => c.key === key);
        return card ? { key: card.key, title: card.title, rarityId: card.rarityId } : null;
      }).filter(Boolean);
      try {
        await account.proposeTrade(userId(), entry.otherId, offer, askList);
        toast(t('tradeSentToast', { name: esc(entry.profile.username) }));
        synth.playTrade();
        live.sheet.hide();
        renderBinder();
        syncSoon();
        syncSocial();
      } catch (error) {
        for (const card of offer) store.receiveCardEntry(state.collection, card);   // undo escrow
        toast(esc(describeError(error)), 'error');
        sendBtn.disabled = false;
      }
    });
  });
}
/** The recipient's view of a pending trade: what changes hands, and the answer. */

export function openTradeAnswer(trade) {
  const who = state.social.friends.find((f) => f.otherId === trade.proposer);
  const name = who?.profile?.username ?? '?';
  openSheet(t('tradeFromTitle', { name }), (body) => {
    const line = (cards, labelKey) => `
      <p class="label" style="margin:10px 0 6px">${esc(t(labelKey))}</p>
      ${cards.map((c) => `<p class="trade-line"><b>${esc(c.title)}</b>
        <span style="color:${rarityById(c.rarityId).color}">${esc(tx(rarityById(c.rarityId).name))}</span></p>`).join('')}`;
    body.innerHTML = `
      ${line(trade.offer ?? [], 'tradeYouGet')}
      ${line(trade.ask ?? [], 'tradeYouGive')}
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="btn btn-primary" type="button" data-accept style="flex:1"></button>
        <button class="btn btn-ghost" type="button" data-decline style="flex:1"></button>
      </div>
      <p class="find-status" data-status role="status"></p>`;
    const acceptBtn = body.querySelector('[data-accept]');
    const declineBtn = body.querySelector('[data-decline]');
    acceptBtn.textContent = t('tradeAccept');
    declineBtn.textContent = t('tradeDecline');

    // Can I actually pay? Every asked card must still be in my collection,
    // and a special card is never on the table.
    const missing = (trade.ask ?? []).filter((c) => !state.collection.entries[c.key] || store.isLocked(state.collection.entries[c.key]));
    if (missing.length) {
      acceptBtn.disabled = true;
      body.querySelector('[data-status]').textContent = t('tradeMissing');
    }

    press(acceptBtn, { sound: null });
    acceptBtn.addEventListener('click', async () => {
      acceptBtn.disabled = true; declineBtn.disabled = true;
      const paid = (trade.ask ?? []).map((c) => store.takeCardCopy(state.collection, c.key)).filter(Boolean);
      try {
        await account.sendDelivery(userId(), trade.proposer, 'trade-return', { cards: paid });
        for (const card of trade.offer ?? []) store.receiveCardEntry(state.collection, card);
        await account.setTradeStatus(trade.id, 'accepted');
        state.profile.tradesDone = (state.profile.tradesDone ?? 0) + 1;
        toast(t('tradeDone', { name: esc(name) }));
        synth.playTrade();
        live.sheet.hide();
        renderBinder();
        syncSoon();
        syncSocial();
      } catch (error) {
        for (const card of paid) store.receiveCardEntry(state.collection, card);   // undo
        toast(esc(describeError(error)), 'error');
        acceptBtn.disabled = false; declineBtn.disabled = false;
      }
    });
    press(declineBtn, { sound: null });
    declineBtn.addEventListener('click', async () => {
      acceptBtn.disabled = true; declineBtn.disabled = true;
      try {
        await account.setTradeStatus(trade.id, 'declined');
        live.sheet.hide();
        syncSocial();
      } catch (error) {
        toast(esc(describeError(error)), 'error');
        acceptBtn.disabled = false; declineBtn.disabled = false;
      }
    });
  });
}
/* --- chat ---------------------------------------------------------------------- */

live.chatTimer = null;
/** The live wire of the open conversation (typing, sent, read), or null. */

export let chatWire = null;

export let typingTimer = null;
/** When we last told the other side we were typing. */

export let typedAt = 0;

export function openChat(entry) {
  state.chat = entry;
  state.chatRows = [];
  renderChatFrame();
  showScreen('chat');
  refreshChat({ markRead: true });
  clearInterval(live.chatTimer);
  live.chatTimer = setInterval(() => { if (state.tab === 'chat') refreshChat(); }, 10000);
  closeChatWire();
  chatWire = account.openChatChannel(userId(), entry.otherId, onChatEvent);
}

export function closeChatWire() {
  chatWire?.close();
  chatWire = null;
  typedAt = 0;
  showTyping(false);
}
/** What the other person's phone just said, live. */

export function onChatEvent(payload) {
  if (state.tab !== 'chat' || !state.chat || payload.from !== state.chat.otherId) return;
  if (payload.kind === 'typing') showTyping(true);
  else if (payload.kind === 'sent') { showTyping(false); refreshChat({ markRead: true }); }
  else if (payload.kind === 'read') {
    // Their receipt, applied to what is on screen without waiting for the poll.
    const at = new Date(payload.at ?? Date.now()).toISOString();
    const mine = userId();
    for (const m of state.chatRows) if (m.sender === mine && !m.read_at) m.read_at = at;
    paintChat(state.chatRows);
  }
}
/** The "typing…" line under the log: shown on every keystroke heard, gone
 *  four seconds after the last one. */

export function showTyping(on) {
  clearTimeout(typingTimer);
  const person = state.chat?.profile;
  const wasHidden = el.chatTyping.hidden;
  el.chatTyping.hidden = !on;
  if (on) {
    el.chatTyping.innerHTML = `<span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span></span>`;
    el.chatTyping.lastElementChild.textContent = t('chatTyping', { name: person?.username ?? '' });
    if (wasHidden) keepChatBottom();
    typingTimer = setTimeout(() => showTyping(false), 4000);
  }
}
/** Keep the newest message in view: after the keyboard rises, after a
 *  bubble lands, after the typing line appears. */

export function keepChatBottom() {
  if (state.tab !== 'chat') return;
  requestAnimationFrame(() => { el.chatLog.scrollTop = el.chatLog.scrollHeight; });
}

export function renderChatFrame() {
  const entry = state.chat;
  const person = entry?.profile;
  if (!person) return;
  el.chatBack.innerHTML = iconSvg('chevronLeft', { size: 18 });
  el.chatName.textContent = person.username ?? '';
  paintAvatarInto(el.chatAvatar, person);
  const online = account.isOnline(person);
  el.chatPresence.textContent = online === null ? ''
    : (online ? t('friendOnline') : t('friendOffline'));
  el.chatPresence.className = `chat-presence${online ? ' is-online' : ''}`;
  el.chatWho.setAttribute('aria-label', t('chatSeeProfile', { name: person.username ?? '' }));
  el.chatInput.placeholder = t('chatPlaceholder');
  el.chatSend.textContent = t('chatSend');

  // Gift and trade, right where the conversation about them happens.
  const tool = (icon, labelKey, run) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn is-mini chat-tool';
    btn.setAttribute('aria-label', t(labelKey));
    btn.title = t(labelKey);
    btn.innerHTML = iconSvg(icon, { size: 16 });
    press(btn, { sound: null });
    btn.addEventListener('click', () => { synth.playTap(); run(); });
    return btn;
  };
  el.chatTools.replaceChildren(
    tool('gift', 'giftOpen', () => openGiftChooser(entry)),
    tool('trade', 'tradeOpen', () => openTradeSheet(entry))
  );
}

export async function refreshChat({ markRead = false } = {}) {
  const entry = state.chat;
  if (!entry) return;
  try {
    const rows = await account.listMessages(userId(), entry.otherId);
    if (state.chat !== entry) return;
    paintChat(rows);
    if (markRead || rows.some((m) => m.recipient === userId() && !m.read_at)) {
      await account.markConversationRead(userId(), entry.otherId);
      state.social.unread.delete(entry.otherId);
      updateBadges();
      chatWire?.send('read');
    }
  } catch { /* next poll */ }
}
/**
 * The bubbles. Yours carry a receipt: one tick once it is on the server, two
 * once the other person has opened the conversation, and the last one you
 * sent says it in words as well.
 */

export function paintChat(rows) {
  const mine = userId();
  state.chatRows = rows;
  const atBottom = el.chatLog.scrollHeight - el.chatLog.scrollTop - el.chatLog.clientHeight < 60;
  const lastMine = [...rows].reverse().find((m) => m.sender === mine);
  el.chatLog.replaceChildren(...rows.flatMap((m) => {
    const own = m.sender === mine;
    const bubble = document.createElement('div');
    bubble.className = `bubble${own ? ' is-mine' : ''}${own && m.read_at ? ' is-read' : ''}`;
    bubble.textContent = m.body;
    const when = document.createElement('span');
    when.className = 'bubble-when';
    when.textContent = whenText(m.created_at);
    if (own) {
      const ticks = document.createElement('span');
      ticks.className = 'bubble-ticks';
      ticks.innerHTML = iconSvg(m.read_at ? 'checks' : 'check', { size: 13 });
      ticks.title = t(m.read_at ? 'chatSeen' : 'chatSent');
      when.appendChild(ticks);
    }
    bubble.appendChild(when);
    if (own && m === lastMine) {
      const receipt = document.createElement('span');
      receipt.className = `chat-receipt${m.read_at ? ' is-read' : ''}`;
      receipt.textContent = m.read_at ? t('chatSeenAt', { when: whenText(m.read_at) }) : t('chatSent');
      return [bubble, receipt];
    }
    return [bubble];
  }));
  if (atBottom || rows.length) el.chatLog.scrollTop = el.chatLog.scrollHeight;
}
/** A keystroke in the composer: tell the other side, no more than once
 *  every two seconds, and only while there is something in the box. */

export function chatTyped() {
  if (!el.chatInput.value.trim()) return;
  const now = Date.now();
  if (now - typedAt < 2000) return;
  typedAt = now;
  chatWire?.send('typing');
}

export async function sendChat(event) {
  event.preventDefault();
  const entry = state.chat;
  const text = el.chatInput.value.trim();
  if (!entry || !text) return;
  el.chatInput.value = '';
  typedAt = 0;
  try {
    await account.sendChatMessage(userId(), entry.otherId, text);
    synth.playMessage();
    chatWire?.send('sent');
    refreshChat();
  } catch (error) {
    el.chatInput.value = text;   // let them retry
    toast(esc(describeError(error)), 'error');
  }
}
/* --- avatars -------------------------------------------------------------------- */

/**
 * Where a crop lands on a round mark. A crop is the centre of the circle as
 * a percentage of the picture (x, y), the circle's diameter as a fraction of
 * the picture's shorter side (z), and the picture's aspect ratio (r); the
 * background is then sized and placed so exactly that circle fills the mark.
 * Crops saved before z existed carry only x and y, and keep the old
 * "cover, then nudge" placement.
 */

export function avatarPlacement(avatar) {
  const x = Number(avatar?.x), y = Number(avatar?.y);
  const z = Number(avatar?.z), r = Number(avatar?.r);
  if (!(z > 0) || !(r > 0)) {
    return { size: 'cover', position: `${Number.isFinite(x) ? x : 50}% ${Number.isFinite(y) ? y : 50}%` };
  }
  // The picture, in units of the mark's diameter.
  const short = 1 / z;
  const w = r >= 1 ? short * r : short;
  const h = r >= 1 ? short : short / r;
  // Where the picture's top-left has to sit so the crop centre is the mark's
  // centre, then turned into the percentage background-position speaks in.
  const ox = 0.5 - (x / 100) * w;
  const oy = 0.5 - (y / 100) * h;
  const px = Math.abs(1 - w) < 1e-6 ? 0 : (ox / (1 - w)) * 100;
  const py = Math.abs(1 - h) < 1e-6 ? 0 : (oy / (1 - h)) * 100;
  return { size: `${(w * 100).toFixed(3)}% ${(h * 100).toFixed(3)}%`, position: `${px.toFixed(3)}% ${py.toFixed(3)}%` };
}
/** Paint a person's avatar (their chosen card art, at their chosen crop)
 *  into a .person-mark-style circle, or fall back to their initial. */

export function paintAvatarInto(node, profile, { frame = null } = {}) {
  const avatar = profile?.avatar;
  if (avatar?.url) {
    node.textContent = '';
    const place = avatarPlacement(avatar);
    node.style.backgroundImage = `url("${String(avatar.url).replace(/"/g, '%22')}")`;
    node.style.backgroundSize = place.size;
    node.style.backgroundPosition = place.position;
    node.style.backgroundRepeat = 'no-repeat';
    node.classList.add('has-avatar');
  } else {
    node.style.backgroundImage = '';
    node.classList.remove('has-avatar');
    node.textContent = String(profile?.username ?? '?').slice(0, 1);
  }
  // The frame travels with the picture: whatever profile object is being
  // painted carries its owner's style, and the tier is read off their level.
  const worn = frame ?? { style: avatar?.frame?.style, tier: frameTier(profile?.level) };
  paintFrameInto(node, worn.style ?? null, worn.style ? worn.tier : 0);
}
/**
 * Choose a card as your face. Step one: pick any card you own that has a
 * picture. Step two: move the picture behind a fixed circle, and zoom it,
 * until the circle holds what you want; that circle is the picture.
 */

export function openAvatarPicker() {
  // Every card with a picture, best first: a face is chosen from the whole
  // collection, not from the first handful of it.
  const mine = store.allEntries(state.collection)
    .filter((c) => c.thumbnail)
    .sort((a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId));
  openSheet(t('avatarTitle'), (body) => {
    if (!mine.length) {
      body.innerHTML = '<p class="muted"></p>';
      body.querySelector('p').textContent = t('avatarNoCards');
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'avatar-grid';
    grid.replaceChildren(...mine.map((card) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'avatar-cell';
      cell.style.backgroundImage = `url("${String(card.thumbnail).replace(/"/g, '%22')}")`;
      cell.toggleAttribute('data-adult', isSensitive(card));
      cell.setAttribute('aria-label', card.title);
      press(cell, { sound: null });
      cell.addEventListener('click', () => openAvatarCrop(card));
      return cell;
    }));
    body.appendChild(grid);
  });
}
/** The circle's share of the crop stage. */

export const CROP_CIRCLE = 0.72;

export const CROP_ZOOM = [0.3, 1];
   // z: the circle's diameter over the picture's short side

export function openAvatarCrop(card) {
  openSheet(t('avatarCropTitle'), (body) => {
    body.innerHTML = `
      <p class="muted" style="font-size:.84rem;margin-bottom:12px" data-hint></p>
      <div class="crop-stage" data-stage>
        <div class="crop-img" data-img></div>
        <div class="crop-shade" aria-hidden="true"></div>
        <div class="crop-circle" aria-hidden="true"></div>
      </div>
      <div class="crop-zoom">
        <span class="crop-zoom-mark" aria-hidden="true"></span>
        <input class="crop-zoom-range" type="range" min="100" max="333" step="1" data-zoom />
        <span class="crop-zoom-mark" aria-hidden="true"></span>
      </div>
      <div class="crop-preview-row">
        <span class="person-mark crop-preview" data-preview aria-hidden="true"></span>
        <span class="muted" data-preview-label></span>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn btn-primary" type="button" data-save style="flex:1"></button>
      </div>`;
    body.querySelector('[data-hint]').textContent = t('avatarCropHint');
    body.querySelector('[data-preview-label]').textContent = t('avatarPreview');
    const saveBtn = body.querySelector('[data-save]');
    saveBtn.textContent = t('avatarSave');

    const stage = body.querySelector('[data-stage]');
    const img = body.querySelector('[data-img]');
    const zoom = body.querySelector('[data-zoom]');
    const preview = body.querySelector('[data-preview]');
    const marks = body.querySelectorAll('.crop-zoom-mark');
    marks[0].innerHTML = iconSvg('minus', { size: 14 });
    marks[1].innerHTML = iconSvg('plus', { size: 14 });
    zoom.setAttribute('aria-label', t('avatarZoom'));
    const url = String(card.thumbnail);
    img.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;

    // The crop: the same picture as before keeps its crop, a new one starts
    // centred and a little zoomed in.
    const saved = state.account.profile?.avatar;
    const same = saved?.url === url && Number(saved.z) > 0;
    let x = same ? Number(saved.x) : 50;
    let y = same ? Number(saved.y) : 50;
    let z = same ? Number(saved.z) : 0.85;
    let ratio = same && Number(saved.r) > 0 ? Number(saved.r) : 1;
    if (!Number.isFinite(x)) x = 50;
    if (!Number.isFinite(y)) y = 50;

    // The displayed picture, in stage pixels.
    const size = () => {
      const L = stage.clientWidth || 300;
      const C = L * CROP_CIRCLE;
      const short = C / z;
      return { L, C, W: ratio >= 1 ? short * ratio : short, H: ratio >= 1 ? short : short / ratio };
    };
    const clampAll = () => {
      z = Math.min(CROP_ZOOM[1], Math.max(CROP_ZOOM[0], z));
      const { C, W, H } = size();
      const minX = (C / 2 / W) * 100, minY = (C / 2 / H) * 100;
      x = Math.min(100 - minX, Math.max(minX, x));
      y = Math.min(100 - minY, Math.max(minY, y));
    };
    const current = () => ({ url, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, z: Math.round(z * 1000) / 1000, r: Math.round(ratio * 1000) / 1000 });
    const paint = () => {
      clampAll();
      const { L, W, H } = size();
      img.style.width = `${W}px`;
      img.style.height = `${H}px`;
      img.style.transform = `translate(${(L / 2 - (x / 100) * W).toFixed(2)}px, ${(L / 2 - (y / 100) * H).toFixed(2)}px)`;
      zoom.value = String(Math.round(100 / z));
      paintAvatarInto(preview, { avatar: current(), username: '' }, { frame: { style: null, tier: 0 } });
    };
    paint();

    // The real shape of the picture decides how far it can travel.
    const probe = new Image();
    probe.addEventListener('load', () => {
      if (probe.naturalWidth && probe.naturalHeight) ratio = probe.naturalWidth / probe.naturalHeight;
      paint();
    });
    probe.src = url;

    // Drag moves the picture under the circle; a second finger, the wheel or
    // the slider zoom it about the circle's centre.
    const pointers = new Map();
    let pinch = null;
    stage.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      stage.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      stage.classList.add('is-held');
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z };
      }
    });
    stage.addEventListener('pointermove', (event) => {
      const was = pointers.get(event.pointerId);
      if (!was) return;
      const now = { x: event.clientX, y: event.clientY };
      pointers.set(event.pointerId, now);
      if (pointers.size >= 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 0 && pinch.d > 0) z = pinch.z * (pinch.d / d);
      } else {
        const { W, H } = size();
        x -= ((now.x - was.x) / W) * 100;
        y -= ((now.y - was.y) / H) * 100;
      }
      paint();
    });
    const lift = (event) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!pointers.size) stage.classList.remove('is-held');
    };
    stage.addEventListener('pointerup', lift);
    stage.addEventListener('pointercancel', lift);
    stage.addEventListener('wheel', (event) => {
      event.preventDefault();
      z *= 1 + Math.sign(event.deltaY) * 0.06;
      paint();
    }, { passive: false });
    zoom.addEventListener('input', () => {
      z = 100 / Number(zoom.value || 100);
      paint();
    });

    press(saveBtn, { sound: null });
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      const avatar = current();
      // The frame rides in this same column; a new picture must not undress it.
      if (state.account.profile?.avatar?.frame) avatar.frame = state.account.profile.avatar.frame;
      try {
        await account.updateProfileFields(userId(), { avatar });
        state.account.profile.avatar = avatar;
        toast(t('avatarSaved'));
        synth.playResolved();
        live.sheet.hide();
        if (state.tab === 'profile') renderProfile();
        if (state.tab === 'customize') renderCustomize();
      } catch (error) {
        toast(esc(describeError(error)), 'error');
        saveBtn.disabled = false;
      }
    });
  });
}

export function findStatus(key, kind = 'muted', vars = {}) {
  el.findStatus.textContent = key ? t(key, vars) : '';
  el.findStatus.className = `find-status${kind ? ` is-${kind}` : ''}`;
}

export function findMessage(text, kind = 'error') {
  el.findStatus.textContent = text;
  el.findStatus.className = `find-status${kind ? ` is-${kind}` : ''}`;
}

export async function runSearch(event) {
  event?.preventDefault();
  const term = el.findInput.value.trim();
  if (term.length < 2) {
    state.social.results = [];
    el.findResults.replaceChildren();
    return findStatus('friendsTypeMore');
  }
  findStatus('friendsSearching', 'working');
  synth.playTap();
  try {
    state.social.results = await account.searchPlayers(term, userId());
    findStatus(state.social.results.length ? null : 'friendsNoResults');
    renderFriends();
  } catch (error) {
    findMessage(describeError(error));
  }
}

export function renderFriends() {
  el.friendsTitle.textContent = t('tabFriends');
  el.friendsIntro.textContent = t('friendsIntro');
  el.findMark.innerHTML = iconSvg('search', { size: 18 });
  el.findInput.placeholder = t('friendsFindPlaceholder');
  el.findInput.setAttribute('aria-label', t('friendsFind'));
  el.findGo.textContent = t('friendsSearch');
  el.resultsLabel.textContent = t('friendsResults');
  el.incomingLabel.textContent = t('friendsIncoming');
  el.friendsLabel.textContent = t('friendsYours');
  el.outgoingLabel.textContent = t('friendsOutgoing');
  el.tradesLabel.textContent = t('friendsTrades');

  const { friends, incoming, outgoing, results } = state.social;
  // Someone you are already connected to still appears in a search, showing
  // what the connection is. Hiding them would read as the search being broken.
  const known = new Map();
  for (const entry of friends) known.set(entry.otherId, { kind: 'friend', entry });
  for (const entry of incoming) known.set(entry.otherId, { kind: 'incoming', entry });
  for (const entry of outgoing) known.set(entry.otherId, { kind: 'outgoing', entry });

  el.findResults.replaceChildren(...results.map((person) => {
    const link = known.get(person.id);
    if (link?.kind === 'friend') {
      return personRow(person, [], { onOpen: () => openFriend(link.entry) });
    }
    if (link?.kind === 'incoming') {
      return personRow(person, [['friendsAccept', 'btn-primary', () => socialAction(
        () => account.acceptRequest(link.entry.id), 'friendsAccepted', { name: person.username })]]);
    }
    if (link?.kind === 'outgoing') return personRow(person, [], { note: 'friendsPending' });
    return personRow(person, [['friendsAdd', 'btn-primary', () => socialAction(
      () => account.sendRequest(userId(), person.id), 'friendsSent', { name: person.username })]]);
  }));

  el.incomingList.replaceChildren(...incoming.map((entry) =>
    personRow(entry.profile, [
      ['friendsAccept', 'btn-primary', () => socialAction(
        () => account.acceptRequest(entry.id), 'friendsAccepted', { name: entry.profile.username })],
      ['friendsDecline', 'btn-ghost', () => socialAction(
        () => account.removeFriendship(entry.id), 'friendsRemoved')]
    ])));

  // Favourites first, then whoever is online now, then the alphabet.
  const orderedFriends = [...friends].sort((a, b) =>
    (isFavFriend(b.otherId) - isFavFriend(a.otherId))
    || ((account.isOnline(b.profile) === true) - (account.isOnline(a.profile) === true))
    || a.profile.username.localeCompare(b.profile.username));

  el.friendsList.replaceChildren(...orderedFriends.map((entry) => {
    const row = personRow(entry.profile, [], { onOpen: () => openFriend(entry) });
    const bay = row.querySelector('.person-actions');
    bay.innerHTML = '';

    const unread = state.social.unread?.get?.(entry.otherId) ?? 0;
    const chatBtn = document.createElement('button');
    chatBtn.type = 'button';
    chatBtn.className = 'icon-btn is-mini';
    chatBtn.setAttribute('aria-label', t('chatOpen'));
    chatBtn.innerHTML = `${iconSvg('chat', { size: 17 })}${unread ? `<span class="count">${unread > 9 ? '9+' : unread}</span>` : ''}`;
    chatBtn.addEventListener('click', (e) => { e.stopPropagation(); synth.playTap(); openChat(entry); });

    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.className = `icon-btn is-mini fav-friend${isFavFriend(entry.otherId) ? ' is-on' : ''}`;
    favBtn.setAttribute('aria-label', t('friendFavourite'));
    favBtn.innerHTML = iconSvg(isFavFriend(entry.otherId) ? 'starFilled' : 'star', { size: 16 });
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      synth.playTap();
      toggleFavFriend(entry.otherId);
      renderFriends();
    });

    const dropBtn = document.createElement('button');
    dropBtn.type = 'button';
    dropBtn.className = 'icon-btn is-mini drop-friend';
    dropBtn.setAttribute('aria-label', t('friendsRemove'));
    dropBtn.innerHTML = iconSvg('trash', { size: 15 });
    dropBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!dropBtn.classList.contains('is-armed')) {
        dropBtn.classList.add('is-armed');
        toast(t('deleteArmed'));
        setTimeout(() => dropBtn.classList.remove('is-armed'), 3500);
        return;
      }
      socialAction(() => account.removeFriendship(entry.id), 'friendsRemoved');
    });

    bay.append(chatBtn, favBtn, dropBtn);
    return row;
  }));

  // Trades waiting on my answer sit above the friend list.
  const myTrades = (state.social.trades ?? [])
    .filter((tr) => tr.status === 'pending' && tr.recipient === userId());
  el.tradesHead.hidden = !myTrades.length;
  el.tradesList.replaceChildren(...myTrades.map((trade) => {
    const who = friends.find((f) => f.otherId === trade.proposer)?.profile
      ?? { username: '?' };
    return personRow(who, [
      ['tradeView', 'btn-primary', () => openTradeAnswer(trade)]
    ]);
  }));

  el.outgoingList.replaceChildren(...outgoing.map((entry) =>
    personRow(entry.profile, [
      ['friendsCancel', 'btn-ghost', () => socialAction(
        () => account.removeFriendship(entry.id), 'friendsRemoved')]
    ])));

  el.resultsHead.hidden = !results.length;
  el.incomingHead.hidden = !incoming.length;
  el.friendsHead.hidden = !friends.length;
  el.outgoingHead.hidden = !outgoing.length;

  // One honest line when chat/trades/gifts cannot work yet.
  el.friendsStale.hidden = account.socialTablesReady();
  if (!account.socialTablesReady()) {
    el.friendsStale.textContent = t('schemaOldNote');
  }

  const nothing = !friends.length && !incoming.length && !outgoing.length && !results.length;
  el.friendsEmpty.hidden = !nothing;
  if (nothing) {
    el.friendsEmptyMark.innerHTML = iconSvg('friends', { size: 46 });
    el.friendsEmptyText.textContent = t('friendsEmpty');
  }
  reveal(el.friendsList.children, { step: 26, from: 10 });
}
/* --- a friend's profile ----------------------------------------------------------------------------------------- */

export function openFriend(entry) {
  state.viewing = entry;
  renderFriend();
  showScreen('friend');
  loadFriendCards(entry);
}

export let friendSeg;

export function renderFriend() {
  const entry = state.viewing;
  if (!entry) return;
  const person = entry.profile;
  const level = person.level ?? 1;
  const online = account.isOnline(person);

  el.friendBack.innerHTML = iconSvg('chevronLeft', { size: 18 });
  el.friendName.textContent = person.username ?? '';
  live.friendRing.set(0, String(level));
  paintFrameInto(el.friendRing, person.avatar?.frame?.style ?? null, person.avatar?.frame?.style ? frameTier(level) : 0);
  el.friendLevel.textContent = t('profileLevel', { n: level });
  el.friendRank.innerHTML = (online === null ? ''
    : `<span class="presence-dot is-inline${online ? ' is-online' : ''}"></span> `
      + esc(online ? t('friendOnline') : t('friendOffline')) + ' · ')
    + esc(tx(rankFor(level).name));
  el.friendStatsLabel.textContent = t('profileStats');
  el.friendRarityLabel.textContent = t('statRarity');
  el.friendCardsLabel.textContent = t('friendCollection');
  el.friendRemove.textContent = t('friendsRemove');

  // What you can do with a friend, in one row.
  const actionBtn = (icon, labelKey, run, kind = 'btn-ghost') => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-sm ${kind}`;
    btn.innerHTML = `${iconSvg(icon, { size: 15 })}<span style="margin-left:6px">${esc(t(labelKey))}</span>`;
    press(btn, { sound: null });
    btn.addEventListener('click', () => { synth.playTap(); run(); });
    return btn;
  };
  el.friendActions.replaceChildren(
    actionBtn('chat', 'chatOpen', () => openChat(entry), 'btn-primary'),
    actionBtn('trade', 'tradeOpen', () => openTradeSheet(entry)),
    actionBtn('gift', 'giftOpen', () => openGiftChooser(entry)),
    actionBtn('wish', 'wishTitle', () => openFriendWishlist(entry))
  );

  // Their cards, the two ways yours are shown: albums, or every card at once.
  if (!friendSeg) {
    friendSeg = new Segmented(el.friendSeg, [
      { id: 'albums', label: t('viewAlbums') },
      { id: 'classic', label: t('viewClassic') }
    ], (view) => {
      state.friendView = view;
      paintFriendCards();
    });
  }
  friendSeg.relabel([{ label: t('viewAlbums') }, { label: t('viewClassic') }]);
  friendSeg.select(state.friendView, { silent: true });

  paintFriendStats(entry);
}
/**
 * The same stats block as your own profile, from what the profile row says
 * and, once their cards have arrived, from the cards themselves: albums
 * started and the count per tier are read off the collection, not stored.
 */

export function paintFriendStats(entry) {
  const person = entry.profile;
  const cards = Array.isArray(entry.cards) ? entry.cards : null;
  const best = rarityById(person.best_rarity);
  const stats = [
    [t('statPlaytime'), formatDuration(person.play_ms ?? 0)],
    [t('statAccountAge'), new Date(person.created_at ?? Date.now())
      .toLocaleDateString(getLanguage(), { year: 'numeric', month: 'short', day: 'numeric' })],
    [t('statBoosters'), (person.boosters_opened ?? 0).toLocaleString()],
    [t('statCards'), (person.cards ?? 0).toLocaleString()],
    [t('statValue'), formatAmount(person.collection_value ?? 0)],
    [t('statAlbums'), cards ? String(albumsDeep(cards, [])) : '…'],
    [t('statBest'), person.best_rarity && best ? tx(best.name) : t('none')]
  ];
  el.friendStats.replaceChildren(...stats.map(([label, value]) => {
    const cell = document.createElement('div');
    cell.className = 'stat-cell';
    cell.innerHTML = '<b></b><span></span>';
    cell.querySelector('b').textContent = value;
    cell.querySelector('span').textContent = label;
    return cell;
  }));

  const counts = {};
  for (const card of cards ?? []) counts[card.rarityId] = (counts[card.rarityId] ?? 0) + (card.count ?? 1);
  const peak = Math.max(1, ...RARITIES.map((r) => counts[r.id] ?? 0));
  el.friendRarityLabel.parentElement.hidden = !cards;
  el.friendRarityBars.hidden = !cards;
  el.friendRarityBars.replaceChildren(...(cards ? RARITIES : []).map((rarity) => {
    const count = counts[rarity.id] ?? 0;
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
}
/** A friend's wishlist: what they want, whether they already found it, and
 *  whether you happen to be holding it. */

export function openFriendWishlist(entry) {
  const person = entry.profile;
  openSheet(t('friendWishTitle', { name: person.username ?? '?' }), async (body) => {
    body.innerHTML = `<p class="find-status is-working">${esc(t('friendLoading'))}</p>`;
    let wishes = [];
    let theirs = new Set();
    try {
      const [rows, cards] = await Promise.all([
        account.wishlistOf(entry.otherId),
        account.friendCollection(entry.otherId).catch(() => null)
      ]);
      wishes = rows;
      theirs = new Set((cards ?? []).map((card) => card.key));
    } catch (error) {
      body.innerHTML = `<p class="find-status is-error"></p>`;
      body.querySelector('p').textContent =
        error?.message === 'INDEX_UNSET' ? t('indexUnset') : describeError(error);
      return;
    }
    if (!wishes.length) {
      body.innerHTML = `<p class="empty-note"></p>`;
      body.querySelector('p').textContent = t('friendWishEmpty', { name: person.username ?? '?' });
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'market-list';
    grid.replaceChildren(...wishes.map((row) => {
      const card = row.card ?? {};
      const tile = document.createElement('div');
      tile.className = 'auction-tile';
      if (theirs.has(card.key)) {
        const band = document.createElement('span');
        band.className = 'auction-band is-good';
        band.textContent = t('friendOwnsBand', { name: person.username ?? '?' });
        tile.appendChild(band);
      }
      const rarity = rarityById(card.rarityId) ?? RARITIES[0];
      tile.appendChild(buildStaticCard({ ...card, description: '', extract: '' }, rarity, null,
        { fav: false, ownedTag: true }));
      return tile;
    }));
    body.replaceChildren(grid);
  });
}
/**
 * Their cards. The server hands back the collection key alone, so this cannot
 * see their wallet or their settings even though they are in the same blob.
 * The cards are kept on the entry so switching views never fetches twice.
 */

export async function loadFriendCards(entry) {
  entry.cards = undefined;
  paintFriendCards();
  try {
    const cards = await account.friendCollection(entry.otherId);
    // Guard against a slow read landing after the player has moved on.
    if (state.viewing !== entry) return;
    entry.cards = cards;          // null when their collection is private
    paintFriendCards();
    paintFriendStats(entry);
  } catch (error) {
    if (state.viewing !== entry) return;
    entry.cards = null;
    paintFriendCards();
    el.friendCardsStatus.textContent = describeError(error);
    el.friendCardsStatus.className = 'find-status is-error';
  }
}
/** A friend's cards in whichever layout the switch says. */

export function paintFriendCards() {
  const entry = state.viewing;
  if (!entry) return;
  const classic = state.friendView === 'classic';
  const cards = entry.cards;
  el.friendAlbums.replaceChildren();
  el.friendClassic.replaceChildren();
  el.friendAlbums.hidden = classic;
  el.friendClassic.hidden = !classic;
  el.friendSegWrap.hidden = !Array.isArray(cards) || !cards.length;

  if (cards === undefined) {
    el.friendCardsStatus.textContent = t('friendLoading');
    el.friendCardsStatus.className = 'find-status is-working';
    return;
  }
  if (cards === null) {
    el.friendCardsStatus.textContent = t('friendPrivate');
    el.friendCardsStatus.className = 'find-status is-muted';
    return;
  }
  el.friendCardsStatus.textContent = cards.length ? '' : t('friendNoCards');
  el.friendCardsStatus.className = 'find-status is-muted';

  const albums = buildAlbums(cards, []).filter((a) => a.unlocked);
  if (classic) {
    // Best card first inside each album, the way your own classic view reads.
    const sorted = [...cards].sort((a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId));
    el.friendClassic.replaceChildren(...classicSections(sorted, albums, (card) => {
      const rarity = rarityById(card.rarityId) ?? RARITIES[0];
      const node = buildStaticCard(card, rarity, null, { fav: false });
      node.addEventListener('click', () => { synth.playTap(); openCardDetail(card.key, card, rarity); });
      return node;
    }));
    reveal(el.friendClassic.children, { step: 40 });
    return;
  }

  // Their collection, shown the way yours is: as albums. Tapping an
  // unlocked one lists its cards in a sheet.
  el.friendAlbums.replaceChildren(...albums.map((album) => {
    // cloneNode drops buildAlbumCover's own click (which drives YOUR
    // collection); this cover opens the friend's album instead.
    const cover = buildAlbumCover(album).cloneNode(true);
    press(cover, { sound: null });
    cover.addEventListener('click', () => {
      synth.playTap();
      openFriendAlbum(entry, album);
    });
    return cover;
  }));
  reveal(el.friendAlbums.children, { step: 22, from: 10 });
}
/** One of a friend's albums, as a sheet of its cards. */

export function openFriendAlbum(entry, album) {
  openSheet(`${album.name} · ${entry.profile.username}`, (body) => {
    const grid = document.createElement('div');
    grid.className = 'sheet-card-grid';
    const sorted = [...album.entries]
      .sort((a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId));
    grid.replaceChildren(...sorted.map((card) => {
      const node = buildStaticCard(card, rarityById(card.rarityId), null, { fav: false });
      if ((card.count ?? 1) > 1) {
        const badge = document.createElement('span');
        badge.className = 'copy-badge';
        badge.textContent = `×${card.count}`;
        node.appendChild(badge);
      }
      return node;
    }));
    body.appendChild(grid);
  });
}
