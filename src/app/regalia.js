/* regalia: split out of main.js */

import { DEFAULT_FRAME_STYLE, frameSvg, frameTier } from '../frames.js';
import * as store from '../collection.js';
import * as account from '../account.js';
import { levelFraction } from '../progression.js';
import { t } from '../i18n.js';
import { canClaim } from '../daily.js';
import { evaluate as evaluateAchievements, measure as measureAchievements, redeemableCount } from '../achievements.js';
import { badgeStates, badgeSvg, romanRank } from '../badges.js';
import { press, reveal } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import { iconSvg } from '../data/icons.js';
import { albumsDeep, albumsStarted } from '../albums.js';
import { formatViews } from '../pricing.js';
import { specName } from '../booster.js';
import { el, money, openSheet, refreshWallet, showScreen, state, toast } from './core.js';
import { paintBell, paintDrawerLinks, pushNote } from './drawer.js';
import { signedIn, userId } from './gate.js';
import { live } from './live.js';
import { gainBooster, spawnBurst } from './open.js';
import { renderPacks } from './packs.js';
import { renderProfile } from './profile.js';

/* --- level frames ------------------------------------------------------------------------
 * The equipped style follows the account when there is one (so a second
 * device and your friends see the same frame) and falls back to the local
 * choice; the tier always comes from the level itself. */

export function frameStyle() {
  return (state.account?.profile?.avatar?.frame?.style ?? state.frameStyle ?? DEFAULT_FRAME_STYLE);
}
/** Wrap (or unwrap) a circular element with a frame overlay. */

export function paintFrameInto(node, styleId, tier) {
  let overlay = node.querySelector(':scope > .frame-overlay');
  const svg = tier >= 1 ? frameSvg(styleId, tier) : '';
  if (!svg) { overlay?.remove(); return; }
  if (!overlay) {
    overlay = document.createElement('span');
    overlay.className = 'frame-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    node.appendChild(overlay);
  }
  const stamp = `${styleId}:${tier}`;
  if (overlay.dataset.frame === stamp) return;
  overlay.dataset.frame = stamp;
  overlay.innerHTML = svg;
}
/** Equip a style: locally at once, and onto the account profile when it can
 *  carry it, riding in the avatar column so friends' apps receive it with
 *  the picture they already fetch. */

export function pickFrameStyle(styleId) {
  state.frameStyle = styleId;
  store.saveFrameStyle(styleId);
  // The appbar paints the ACCOUNT's copy of the choice when there is one, so
  // adopt it there first; the server write below then just confirms it.
  if (state.account?.profile) {
    state.account.profile.avatar = { ...(state.account.profile.avatar ?? {}), frame: { style: styleId } };
  }
  refreshLevelBadge();
  if (signedIn() && account.socialSchemaReady()) {
    const merged = { ...(state.account.profile?.avatar ?? {}), frame: { style: styleId } };
    account.updateProfileFields(userId(), { avatar: merged })
      .then(() => { if (state.account.profile) state.account.profile.avatar = merged; })
      .catch((error) => console.error('frame sync failed:', error?.message ?? error));
  }
}

export function refreshLevelBadge() {
  const level = state.profile.progress.level ?? 1;
  live.levelRing.set(levelFraction(state.profile.progress), String(level));
  el.levelBadge.setAttribute('aria-label', `${t('profileLevel', { n: level })}`);
  paintFrameInto(el.levelBadge, frameStyle(), frameTier(level));
}

export function updateBadges() {
  // The collection count is deliberately not badged: it only ever grows, so it
  // is a number that is always there and never means anything has happened.
  const timed = state.profile.timed.count ?? 0;
  live.nav.setBadge('timed', timed ? String(timed) : '');
  const held = Object.values(state.inventory ?? {})
    .reduce((n, slot) => n + (slot.count ?? 0), 0);
  live.nav.setBadge('packs', held ? String(held) : '');
  // A newly finished achievement rings once, when the count first rises.
  const achReady = achRedeemableCount();
  if (state.lastAchReady != null && achReady > state.lastAchReady) {
    pushNote('trophy', t('notifAchReady', { n: achReady }), 'ach');
  }
  state.lastAchReady = achReady;
  const ready = canClaim(state.profile.daily);
  el.giftDot.hidden = !ready;
  paintBell();
}
/* --- badges ------------------------------------------------------------------------------
 * Holographic chips for the hard end of the achievement chains, between the
 * level card and the statistics. Locked chips stay visible in grey: a shelf
 * of things to want is worth more than a blank space. */

export function allBadgeStates() {
  const evaluated = evaluateAchievements(achFacts(), state.profile.achievements?.redeemed ?? []);
  return badgeStates(evaluated, state.profile.codesRedeemed ?? {});
}
/** Put a badge on the profile without asking: the code's own, the moment it is redeemed. */

export function wearBadge(id) {
  const states = allBadgeStates();
  if (state.badgeLoadout === null) state.badgeLoadout = wornBadges(states).map((w) => w.badge.id);
  const worn = state.badgeLoadout;
  if (!worn.includes(id)) {
    if (worn.length >= 4) worn.shift();
    worn.push(id);
  }
  // Saved even when the automatic shelf already had it: from now on the
  // choice is explicit, so nothing later can quietly drop the badge.
  store.saveBadgeLoadout(worn);
}
/** The chips actually on the profile: the chosen four, or, before anyone has
 *  chosen, the best-ranked earned ones. */

export function wornBadges(states) {
  const earned = states.filter((st) => st.rank > 0);
  // A choice, empty included, is shown as made. Only the absence of any
  // choice falls back to the automatic shelf.
  if (state.badgeLoadout !== null) {
    return state.badgeLoadout
      .map((id) => earned.find((st) => st.badge.id === id))
      .filter(Boolean)
      .slice(0, 4);
  }
  return [...earned]
    .sort((a, b) => (b.rank / b.max) - (a.rank / a.max) || b.rank - a.rank)
    .slice(0, 4);
}

export function badgeChip(st, { worn = false } = {}) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `badge-chip${st.rank > 0 ? '' : ' is-locked'}`;
  chip.innerHTML = `${badgeSvg(st.badge, st.rank, st.max, { size: 62 })}<b></b><span class="badge-rank"></span>`;
  chip.querySelector('b').textContent = st.name;
  const sub = chip.querySelector('.badge-rank');
  if (worn) {
    sub.replaceWith(Object.assign(document.createElement('span'),
      { className: 'badge-equipped-tag', textContent: `${st.max > 1 && st.rank > 0 ? romanRank(st.rank) + ' · ' : ''}${t('badgeWornTag')}` }));
  } else {
    sub.textContent = st.max > 1 && st.rank > 0 ? romanRank(st.rank) : '';
  }
  press(chip, { sound: null });
  chip.addEventListener('click', () => { synth.playTap(); openBadgeSheet(st); });
  return chip;
}

export function renderBadges() {
  const states = allBadgeStates();
  const earned = states.filter((st) => st.rank > 0).length;
  el.badgesLabel.textContent = `${t('badgesTitle')} · ${earned}/${states.length}`;

  // The way to the full shelf lives in the section head.
  const head = el.badgesLabel.parentElement;
  head.style.display = 'flex';
  head.style.alignItems = 'center';
  let manage = head.querySelector('.badges-manage');
  if (!manage) {
    manage = document.createElement('button');
    manage.type = 'button';
    manage.className = 'btn btn-sm btn-ghost badges-manage';
    press(manage, { sound: null });
    manage.addEventListener('click', () => { synth.playTap(); renderBadgesScreen(); showScreen('badges'); });
    head.appendChild(manage);
  }
  manage.textContent = t('badgesAll');

  const worn = wornBadges(states);
  if (!worn.length) {
    const note = document.createElement('p');
    note.className = 'empty-note';
    note.textContent = t('badgesNone');
    el.badgeGrid.replaceChildren(note);
    return;
  }
  el.badgeGrid.replaceChildren(...worn.map((st) => badgeChip(st)));
}
/** The Badges screen: every chip, with what is worn marked, four at most. */

export function renderBadgesScreen() {
  const states = allBadgeStates();
  el.badgesTitle.textContent = t('badgesTitle');
  el.badgesIntro.textContent = t('badgesIntro');
  const wornIds = new Set(wornBadges(states).map((st) => st.badge.id));
  el.badgesAll.replaceChildren(...states.map((st) => badgeChip(st, { worn: wornIds.has(st.badge.id) })));
}
/** Put a chip on the profile, or take it off. A first explicit choice adopts
 *  the automatic shelf as its starting point, so the tag and the button never
 *  disagree about what "worn" means. */

export function toggleBadgeEquip(st) {
  const states = allBadgeStates();
  if (state.badgeLoadout === null) {
    state.badgeLoadout = wornBadges(states).map((w) => w.badge.id);
  }
  const worn = state.badgeLoadout;
  const i = worn.indexOf(st.badge.id);
  if (i >= 0) worn.splice(i, 1);
  else {
    if (worn.length >= 4) { toast(t('badgeLoadoutFull'), 'error'); synth.playDenied(); return false; }
    worn.push(st.badge.id);
  }
  store.saveBadgeLoadout(worn);
  synth.playResolved();
  return true;
}

export function openBadgeSheet(st) {
  openSheet(st.name, (body) => {
    const wrap = document.createElement('div');
    wrap.className = 'badge-sheet';
    wrap.innerHTML = `<div class="badge-sheet-chip"></div><p class="badge-sheet-line"></p><div class="badge-rungs"></div>`;
    if (st.rank > 0) {
      const wornNow = wornBadges(allBadgeStates()).some((w) => w.badge.id === st.badge.id);
      const equip = document.createElement('button');
      equip.type = 'button';
      equip.className = `btn ${wornNow ? 'btn-ghost' : 'btn-primary'}`;
      equip.textContent = wornNow ? t('badgeUnequip') : t('badgeEquip');
      press(equip, { sound: null });
      equip.addEventListener('click', () => {
        if (!toggleBadgeEquip(st)) return;
        live.sheet.hide();
        if (state.tab === 'badges') renderBadgesScreen();
        if (state.tab === 'profile') renderProfile();
      });
      wrap.insertBefore(equip, wrap.querySelector('.badge-rungs'));
    }
    wrap.querySelector('.badge-sheet-chip').innerHTML = badgeSvg(st.badge, st.rank, st.max, { size: 120 });
    wrap.querySelector('.badge-sheet-line').textContent = st.rank > 0
      ? (st.max > 1 ? t('badgeRank', { n: romanRank(st.rank), max: romanRank(st.max) }) : t('badgeEarned'))
      : t('badgeLockedLine');
    wrap.querySelector('.badge-rungs').replaceChildren(...st.rungs.map((rung) => {
      const row = document.createElement('div');
      row.className = `badge-rung${rung.unlocked ? ' is-done' : ''}`;
      row.innerHTML = `<span class="badge-rung-mark">${iconSvg(rung.unlocked ? 'check' : 'lock', { size: 14 })}</span>
        <span class="badge-rung-copy"><b></b><span></span></span>`;
      row.querySelector('b').textContent = rung.name;
      row.querySelector('.badge-rung-copy span').textContent = rung.desc;
      return row;
    }));
    body.appendChild(wrap);
  });
}
/* --- achievements ------------------------------------------------------------------------ */

export function achFacts() {
  // Special cards are outside every ladder: they count for no achievement,
  // no album milestone, no total.
  const entries = store.allEntries(state.collection).filter((e) => !e.special);
  return measureAchievements({
    profile: state.profile,
    entries,
    albumsDeep: albumsDeep(entries, state.customPacks),
    albumsStarted: albumsStarted(entries, state.customPacks),
    customPacks: state.customPacks ?? [],
    friends: state.social.friends.length,
    wallet: state.wallet
  });
}

export function achRedeemableCount() {
  return redeemableCount(achFacts(), state.profile.achievements?.redeemed ?? []);
}

export function renderAchievements() {
  el.achTitle.textContent = t('achTitle');
  const list = evaluateAchievements(achFacts(), state.profile.achievements?.redeemed ?? []);
  const done = list.filter((a) => a.unlocked).length;
  el.achSub.textContent = t('achSub', { done, total: list.length });

  // Redeemable first, then in-progress by closeness, then redeemed.
  const order = (a) => (a.redeemable ? 0 : !a.unlocked ? 1 : 2);
  list.sort((a, b) => order(a) - order(b)
    || (b.have / b.need) - (a.have / a.need));

  el.achList.replaceChildren(...list.map((a) => {
    const row = document.createElement('div');
    row.className = `ach${a.redeemable ? ' is-ready' : ''}${a.redeemed ? ' is-done' : ''}`;
    row.innerHTML = `
      <span class="ach-icon">${iconSvg(a.icon, { size: 20 })}</span>
      <span class="ach-copy">
        <b></b><span class="ach-desc"></span>
        <span class="ach-track"><i></i></span>
      </span>
      <span class="ach-side"></span>`;
    row.querySelector('b').textContent = a.name;
    row.querySelector('.ach-desc').textContent = a.desc;
    row.querySelector('.ach-track i').style.width = `${Math.round((a.have / a.need) * 100)}%`;

    const side = row.querySelector('.ach-side');
    if (a.redeemed) {
      side.innerHTML = `<span class="ach-claimed">${iconSvg('check', { size: 16 })}</span>`;
    } else if (a.redeemable) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary btn-sm';
      btn.innerHTML = t('achRedeem');
      press(btn, { sound: null });
      btn.addEventListener('click', () => redeemAchievement(a, btn));
      side.appendChild(btn);
    } else {
      // Money-shaped stats read as money, fame reads compact; a raw
      // 10000000 in a 60px column helps nobody.
      const inMoney = a.stat === 'value' || a.stat === 'wallet' || a.stat === 'maxCardPrice';
      const fmt = (v) => inMoney ? money(v) : a.stat === 'maxViews' ? formatViews(v) : String(Math.floor(v));
      side.innerHTML = `<span class="ach-progress tabular">${fmt(a.have)}/<b>${fmt(a.need)}</b></span>`;
    }

    const label = document.createElement('span');
    label.className = 'ach-reward';
    label.innerHTML = a.reward.kind === 'coins'
      ? t('achRewardCoins', { amount: money(a.reward.coins) })
      : t('achRewardPack', { name: specName(a.reward.spec) });
    row.querySelector('.ach-copy').appendChild(label);
    return row;
  }));
  // A hundred rows now: a tighter stagger, or the tail waits two seconds.
  reveal(el.achList.children, { step: 6, from: 8 });
}

export function redeemAchievement(a, btn) {
  const redeemed = state.profile.achievements.redeemed;
  if (redeemed.includes(a.id)) return;
  redeemed.push(a.id);
  if (a.reward.kind === 'coins') {
    store.saveWallet(store.loadWallet() + a.reward.coins);
    refreshWallet();
  } else {
    gainBooster(a.reward.spec, 1);
    renderPacks();
  }
  store.saveProfile(state.profile);
  synth.playAchievement();
  const rect = btn.getBoundingClientRect();
  spawnBurst({ shapes: ['star4', 'orb'], colors: ['#fbbf24', '#ffffff'],
    count: 14, spread: 1.1, gravity: 0.3 },
    { x: rect.left + rect.width / 2, y: rect.top }, { scale: 0.6 });
  toast(t('achRedeemed', { name: a.name }), 'ok');
  renderAchievements();
  paintDrawerLinks();
}
