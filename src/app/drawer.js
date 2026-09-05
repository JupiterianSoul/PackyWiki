/* drawer: split out of main.js */

import { canClaim } from '../daily.js';
import * as quests from '../quests.js';
import * as account from '../account.js';
import { iconSvg, logoSvg } from '../data/icons.js';
import { t } from '../i18n.js';
import { dur, press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import * as store from '../collection.js';
import { questUserKey, renderGames } from './arcade.js';
import { renderBinder } from './binder.js';
import { el, esc, navTabFor, openSheet, placeDrawerLinks, plainText, showScreen, state } from './core.js';
import { openDaily } from './daily.js';
import { userId } from './gate.js';
import { live } from './live.js';
import { renderPacks, renderTimed } from './packs.js';
import { renderProfile } from './profile.js';
import { renderLeaderboard, renderQuests } from './quests.js';
import { achRedeemableCount, renderAchievements, renderBadgesScreen } from './regalia.js';
import { renderCustomize, renderSettings } from './settings.js';
import { payStipend, renderShop } from './shop.js';
import { loadFriends, openChat, renderFriends } from './social.js';

/* --- the drawer --------------------------------------------------------------------
 *
 * Everything you can go to, in one list. The bottom bar holds five; the app has
 * more than five places, and the ones that did not fit were previously hidden
 * behind a "More" heading on the Profile - which is a strange place to keep the
 * way to Settings.
 */

/** id, icon, label key, and what opening it does. */

export function drawerItems() {
  // A painter may be async: the screens few sessions visit (the market, the
  // index, the quiz, the timeline) live in chunks of their own and are
  // fetched the first time they are opened. The screen is shown once the
  // paint is done, so the player never sees it half-built.
  const go = (screen, paint) => async () => { await paint?.(); showScreen(screen); };
  const lazy = (load, name) => () => load().then((m) => m[name]());
  return [
    { id: 'packs',  icon: 'packs',      key: 'tabBoosters',    run: go('packs', renderPacks) },
    { id: 'timed',  icon: 'hourglass',  key: 'tabTimed',       run: go('timed', renderTimed) },
    { id: 'shop',   icon: 'gem',        key: 'tabShop',        run: go('shop', () => { payStipend(); renderShop(); }) },
    { id: 'binder', icon: 'collection', key: 'tabCollection',  run: go('binder', renderBinder) },
    { id: 'market', icon: 'trade',      key: 'tabMarket',      run: go('market', lazy(() => import('./market.js'), 'renderMarket')) },
    { id: 'cardindex', icon: 'search',  key: 'tabIndex',       run: go('cardindex', lazy(() => import('./cardindex.js'), 'renderCardIndex')) },
    { id: 'glossary', icon: 'filter',   key: 'tabGlossary',    run: go('glossary', lazy(() => import('./cardindex.js'), 'renderGlossary')) },
    { id: 'daily',  icon: 'gift',       key: 'dailyTitle', dot: () => canClaim(state.profile.daily),
      run: () => openDaily() },
    { id: 'ach',    icon: 'trophy',     key: 'achTitle',
      badge: () => achRedeemableCount(),
      run: go('ach', renderAchievements) },
    { id: 'badges', icon: 'star',       key: 'badgesTitle',    run: go('badges', renderBadgesScreen) },
    { id: 'quiz',   icon: 'quiz',       key: 'tabQuiz',        run: go('quiz', lazy(() => import('./quiz.js'), 'renderQuiz')) },
    { id: 'games',  icon: 'dice',       key: 'tabGames',       run: go('games', renderGames) },
    { id: 'quests', icon: 'scroll',     key: 'tabQuests',
      badge: () => quests.claimableCount(questUserKey()),
      run: go('quests', renderQuests) },
    { id: 'leaderboard', icon: 'podium', key: 'tabLeaderboard', run: go('leaderboard', renderLeaderboard) },
    { sep: true },
    ...(account.configured
      ? [{ id: 'friends', icon: 'friends', key: 'tabFriends',
           badge: () => state.social.incoming.length,
           run: go('friends', () => { renderFriends(); loadFriends(); }) }]
      : []),
    { id: 'bell', icon: 'bell', key: 'notifTitle',
      badge: () => unreadCount(),
      run: () => openNotifications() },
    { id: 'profile',  icon: 'profile',  key: 'tabProfile',  run: go('profile', renderProfile) },
    { id: 'updates',   icon: 'spark',    key: 'tabUpdates',   run: go('updates', lazy(() => import('./updates.js'), 'renderUpdates')) },
    { id: 'customize', icon: 'wand',     key: 'tabCustomize', run: go('customize', renderCustomize) },
    { id: 'settings',  icon: 'settings', key: 'tabSettings',  run: go('settings', renderSettings) }
  ];
}

export function buildDrawer() {
  el.drawerMark.innerHTML = logoSvg({ size: 34 });
  el.drawerLinks.replaceChildren(...drawerItems().map((item) => {
    if (item.sep) {
      const rule = document.createElement('div');
      rule.className = 'drawer-sep';
      return rule;
    }
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'drawer-link';
    row.dataset.link = item.id;
    row.innerHTML = `<span class="drawer-icon">${iconSvg(item.icon, { size: 20 })}</span>
      <span></span><span class="chip" hidden></span>`;
    row.querySelector('span:nth-child(2)').textContent = t(item.key);
    press(row, { sound: null });
    row.addEventListener('click', () => {
      synth.playTap();
      closeDrawer();
      item.run();
    });
    return row;
  }));
  // Built into the drawer, then put wherever this width wants it.
  placeDrawerLinks();
  paintDrawerLinks();
}
/** Keep the drawer's highlight and counts honest without rebuilding it. */

export function paintDrawerLinks() {
  const items = new Map(drawerItems().filter((i) => !i.sep).map((i) => [i.id, i]));
  el.drawerLinks.querySelectorAll('.drawer-link').forEach((row) => {
    const item = items.get(row.dataset.link);
    row.classList.toggle('is-current', row.dataset.link === navTabFor(state.tab));
    const chip = row.querySelector('.chip');
    const n = item?.badge?.() ?? 0;
    const dot = item?.dot?.() ?? false;
    chip.textContent = n ? String(n) : (dot ? '!' : '');
    chip.hidden = !n && !dot;
  });
}

export function openDrawer() {
  buildDrawer();
  el.drawer.hidden = false;
  el.menuBtn.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => el.drawer.classList.add('is-open'));
  synth.resume();
  synth.playDrawer(true);
}

export function closeDrawer() {
  if (el.drawer.hidden) return;
  synth.playDrawer(false);
  el.drawer.classList.remove('is-open');
  el.menuBtn.setAttribute('aria-expanded', 'false');
  setTimeout(() => { el.drawer.hidden = true; }, dur(300));
}
/* --- notifications -----------------------------------------------------------------
 *
 * One list, one unread count. The only thing that raises a notification today
 * is a friend request; the shape is general so the next one has somewhere to
 * go. Read state lives in the profile, keyed by the id of the thing that
 * caused it, so it survives a restart and syncs with everything else.
 */

/**
 * A persistent local feed for one-off events (a gift arrived, a trade was
 * answered), capped so it cannot grow forever. Live rows - friend requests,
 * unread chats, trades awaiting your answer - are derived fresh every time.
 */

export function pushNote(icon, title, screen = 'friends') {
  const feed = state.profile.notifFeed ??= [];
  feed.unshift({ id: `note-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    icon, title: plainText(title), when: new Date().toISOString(), screen });
  if (feed.length > 30) feed.length = 30;
  store.saveProfile(state.profile);
  paintBell();
}
/**
 * Where a note leads. Every screen is reached the way the drawer reaches
 * it, renderer included, so a note about a quest lands on a quests screen
 * painted with the progress the note is about, not on whatever the screen
 * showed the last time it was open.
 */

export function goToScreen(screen) {
  const item = drawerItems().find((entry) => entry.id === screen);
  if (item?.run) { item.run(); return; }
  showScreen(screen);
}
/**
 * What kind of thing a note is, from where it leads and what it wears. The
 * kind picks the colour of its mark and the small label under the title.
 */

export function noteKind(icon, screen) {
  if (icon === 'addFriend') return 'request';
  if (icon === 'trade') return 'trade';
  if (icon === 'chat') return 'message';
  if (icon === 'gift') return 'gift';
  if (screen === 'quests') return 'quest';
  if (screen === 'ach') return 'achievement';
  if (screen === 'market' || icon === 'bell') return 'auction';
  if (screen === 'packs' || icon === 'packs') return 'booster';
  return 'news';
}

export function notifications() {
  const go = (screen) => () => goToScreen(screen);
  const rows = [];

  for (const entry of state.social.incoming) {
    rows.push({ id: entry.id, icon: 'addFriend', kind: 'request',
      title: t('notifRequest', { name: entry.profile.username }),
      when: entry.created_at, run: go('friends') });
  }
  // Trades waiting on my answer.
  for (const trade of state.social.trades ?? []) {
    if (trade.status !== 'pending' || trade.recipient !== userId()) continue;
    const who = state.social.friends.find((f) => f.otherId === trade.proposer)?.profile?.username ?? '?';
    rows.push({ id: `trade-${trade.id}`, icon: 'trade', kind: 'trade',
      title: t('notifTrade', { name: who }), when: trade.created_at, run: go('friends') });
  }
  // Unread chats, one row per sender.
  for (const [sender, n] of state.social.unread ?? []) {
    const who = state.social.friends.find((f) => f.otherId === sender);
    if (!who) continue;
    rows.push({ id: `chat-${sender}-${n}`, icon: 'chat', kind: 'message',
      title: t('notifMessages', { n, name: who.profile.username }),
      when: null, run: () => openChat(who) });
  }
  // The stored feed (gifts received, trades resolved, quests done).
  for (const note of state.profile.notifFeed ?? []) {
    rows.push({ id: note.id, icon: note.icon, kind: noteKind(note.icon, note.screen), title: note.title,
      when: note.when, run: go(note.screen) });
  }
  return rows;
}

export function isRead(id) {
  return ((state.profile.notifRead ?? []).includes(id));
}

export function unreadCount() {
  return (notifications().filter((n) => !isRead(n.id)).length);
}

export function markRead(ids) {
  const seen = new Set(state.profile.notifRead ?? []);
  const live = new Set(notifications().map((n) => n.id));
  ids.forEach((id) => seen.add(id));
  // Drop ids for things that no longer exist, or the list grows forever.
  state.profile.notifRead = [...seen].filter((id) => live.has(id));
  store.saveProfile(state.profile);
  paintBell();
}

export function paintBell() {
  const n = unreadCount();
  el.bellCount.textContent = n > 9 ? '9+' : String(n);
  el.bellCount.hidden = n === 0;
  el.bell.classList.toggle('is-hot', n > 0);
}
/**
 * The notifications sheet. Two shelves: what is new (unread when the sheet
 * was opened) and what came earlier. Each row wears the colour of its kind,
 * says in a word what kind of thing it is and how long ago, and leads to
 * the screen it is about, painted fresh. Opening the sheet reads it; a
 * button clears the read notes that are only notes (a request, a trade or
 * an unread chat stays until it is answered).
 */

export function openNotifications() {
  const list = notifications();
  // Opening the list reads it, at the end of this function. The shelves and
  // the sweep have to work off what was already read BEFORE that, or the
  // button would count four and quietly take away six.
  const readBefore = new Set(state.profile.notifRead ?? []);
  const fresh = list.filter((n) => !readBefore.has(n.id));
  const earlier = list.filter((n) => readBefore.has(n.id));
  openSheet(t('notifTitle'), (body) => {
    body.classList.add('notes-body');
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'notes-empty';
      empty.innerHTML = `<span class="notes-empty-mark">${iconSvg('bell', { size: 30 })}</span><b></b><p></p>`;
      empty.querySelector('b').textContent = t('notifEmptyTitle');
      empty.querySelector('p').textContent = t('notifEmpty');
      body.appendChild(empty);
      return;
    }
    const head = document.createElement('div');
    head.className = 'notes-head';
    head.innerHTML = `<span class="notes-count"></span>`;
    head.querySelector('.notes-count').textContent = fresh.length
      ? t('notifNewCount', { n: fresh.length }) : t('notifAllRead');
    body.appendChild(head);

    const shelf = (label, notes, unread) => {
      if (!notes.length) return;
      const title = document.createElement('p');
      title.className = 'notes-shelf';
      title.textContent = label;
      body.appendChild(title);
      const wrap = document.createElement('div');
      wrap.className = 'notes';
      wrap.replaceChildren(...notes.map((note) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = `note-row is-${note.kind}${unread ? ' is-unread' : ''}`;
        row.innerHTML = `<span class="note-mark">${iconSvg(note.icon, { size: 18 })}</span>
          <span class="note-copy"><b></b><span class="note-sub"><em></em><i></i></span></span>
          <span class="note-go">${iconSvg('chevron', { size: 16 })}</span>`;
        row.querySelector('b').textContent = plainText(note.title);
        row.querySelector('em').textContent = t(`notifKind_${note.kind}`);
        const when = whenText(note.when);
        row.querySelector('i').textContent = when ? ` · ${when}` : '';
        press(row, { sound: null });
        row.addEventListener('click', () => { synth.playTap(); live.sheet.hide(); note.run(); });
        return row;
      }));
      body.appendChild(wrap);
    };
    shelf(t('notifNew'), fresh, true);
    shelf(t('notifEarlier'), earlier, false);

    // Read notes from the stored feed can be swept away; live rows are not
    // notes and stay until answered.
    const sweepable = (state.profile.notifFeed ?? []).filter((note) => readBefore.has(note.id)).length;
    if (sweepable) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'btn btn-ghost btn-sm btn-block notes-clear';
      clear.textContent = t('notifClearRead', { n: sweepable });
      press(clear, { sound: null });
      clear.addEventListener('click', () => {
        state.profile.notifFeed = (state.profile.notifFeed ?? []).filter((note) => !readBefore.has(note.id));
        store.saveProfile(state.profile);
        synth.playTap();
        paintBell();
        openNotifications();
      });
      body.appendChild(clear);
    }
  });
  // Opening the list is reading it.
  markRead(list.map((n) => n.id));
}
/** "3 min ago", "2 days ago" - enough to place it, no more. */

export function whenText(iso) {
  const at = Date.parse(iso ?? '');
  if (!Number.isFinite(at)) return '';
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (mins < 1) return t('accountJustNow');
  if (mins < 60) return t('accountMinsAgo', { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t('notifHoursAgo', { n: hours });
  return t('notifDaysAgo', { n: Math.round(hours / 24) });
}
/* --- help ---------------------------------------------------------------------------
 *
 * A "?" on each screen that explains what the screen is for, in the fewest
 * words that actually answer the question. Numbered steps rather than prose,
 * because the answer is nearly always "here is the loop".
 */

export const HELP = {
  packs:   { steps: 3, tip: true },
  timed:   { steps: 3, tip: true },
  shop:    { steps: 3, tip: true },
  binder:  { steps: 3, tip: true },
  friends: { steps: 3, tip: true },
  quiz:    { steps: 3, tip: true },
  market:  { steps: 3, tip: true },
  index:   { steps: 3, tip: true },
  games:   { steps: 3, tip: true },
  wikdle:  { steps: 3, tip: true },
  slots:   { steps: 3, tip: true },
  duel:    { steps: 3, tip: true },
  reveal:  { steps: 3, tip: true },
  quests:  { steps: 3, tip: true },
  leaderboard: { steps: 3, tip: true }
};

export function openHelp(topic) {
  const shape = HELP[topic];
  if (!shape) return;
  openSheet(t(`help_${topic}_title`), (body) => {
    const wrap = document.createElement('div');
    wrap.className = 'help-body';

    const lead = document.createElement('p');
    lead.className = 'help-lead';
    lead.textContent = t(`help_${topic}_lead`);
    wrap.appendChild(lead);

    for (let i = 1; i <= shape.steps; i++) {
      const step = document.createElement('div');
      step.className = 'help-step';
      step.innerHTML = `<span class="help-num">${i}</span><p></p>`;
      // The copy marks one phrase per step with *stars*; that phrase is the
      // thing you actually do, so it is the thing that should stand out.
      step.querySelector('p').innerHTML = esc(t(`help_${topic}_${i}`))
        .replace(/\*([^*]+)\*/g, '<b>$1</b>');
      wrap.appendChild(step);
    }

    if (shape.tip) {
      const tip = document.createElement('p');
      tip.className = 'help-tip';
      tip.textContent = t(`help_${topic}_tip`);
      wrap.appendChild(tip);
    }
    body.appendChild(wrap);
  });
}
