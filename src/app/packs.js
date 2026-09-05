/* packs: split out of main.js */

import { buildPackElement } from '../packview.js';
import * as store from '../collection.js';
import { specName, specTagline } from '../booster.js';
import { iconSvg } from '../data/icons.js';
import { t, tx } from '../i18n.js';
import { proceduralStyle } from '../packstyle.js';
import { monogramSvg } from '../data/emblems.js';
import { press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import { resolveCustomWiki } from '../wiki.js';
import { MAX_TIMED_LEVEL, TIMED_CARDS, accrue, levelBounds, levelProgress, maxHeld, msToNext, regenMs, timedLevel, timedSpec, timedTopTier } from '../timed.js';
import { RARITIES } from '../data/rarities.js';
import { formatCountdown } from '../shop.js';
import { reportQuest } from './arcade.js';
import { packsRail } from './boot.js';
import { WIDE, el, esc, showScreen, state, toast } from './core.js';
import { pushNote } from './drawer.js';
import { live } from './live.js';
import { gainBooster, openScreenFor, schedulePrefetch } from './open.js';
import { updateBadges } from './regalia.js';
import { payStipend, renderShop } from './shop.js';

/* --- booster art ------------------------------------------------------------------ */

export function buildBooster(spec, { interactive = false, size = '' } = {}) {
  const booster = buildPackElement(spec, { interactive, size });
  if (interactive && state.ripDir) booster.dataset.ripDir = String(state.ripDir);
  return booster;
}
/* --- packs ------------------------------------------------------------------------- */

export function ownedFor(mode) {
  return store.ownedBoosters(state.inventory)
    // The special boosters (a secret code's) live on the Custom shelf too.
    .filter((slot) => (mode === 'custom') === (slot.spec.kind === 'custom' || slot.spec.kind === 'code'))
    .sort((a, b) => specName(a.spec).localeCompare(specName(b.spec)));
}

export function renderPacks() {
  const slots = ownedFor(state.packMode);
  state.packSlots = slots;

  const custom = state.packMode === 'custom';
  el.creatorWrap.hidden = !custom;
  if (custom) renderCreator();
  const has = slots.length > 0;
  el.packsRail.hidden = !has;
  el.packsCaption.hidden = !has;
  el.packsActions.hidden = !has;
  el.packsEmpty.hidden = has;

  if (!has) {
    // Clear it, do not just hide it: leaving the previous shelf's items in the
    // DOM means switching to an empty shelf still has boosters behind the
    // empty state, which is exactly the bug the `[hidden]` fix was for.
    packsRail.setItems([]);
    // On the custom tab the builder below already says what to do, so the
    // shelf's own empty state would be the same advice twice.
    el.packsEmpty.hidden = custom;
    el.packsEmptyMark.innerHTML = iconSvg('packs', { size: 46 });
    el.packsEmptyText.textContent = t('shelfEmpty');
    el.packsEmptyCta.textContent = t('goShop');
    el.packsEmptyCta.hidden = false;
    return;
  }

  packsRail.setItems(slots.map((slot, index) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'rail-item';
    item.dataset.index = String(index);
    item.setAttribute('aria-label', specName(slot.spec));
    item.appendChild(buildBooster(slot.spec));

    const badge = document.createElement('span');
    badge.className = 'own-badge';
    badge.textContent = `×${slot.count}`;
    item.appendChild(badge);

    item.addEventListener('click', () => {
      if (index === packsRail.index) openScreenFor(slot.spec);
      else packsRail.scrollTo(index);
    });
    return item;
  }));
  paintPackCaption(Math.min(packsRail.index, slots.length - 1));
}

export function paintPackCaption(index) {
  const slot = state.packSlots[index];
  if (!slot) return;
  el.packsName.textContent = specName(slot.spec);
  el.packsSub.textContent = specTagline(slot.spec);
  el.packsOwn.innerHTML = `${t('youOwn', { n: slot.count })} · ${slot.spec.cards} ${t('cards')}`;
  el.packsOpen.textContent = t('openPack');
  el.packsOpen.onclick = () => openScreenFor(slot.spec);
  el.packsHint.textContent = t(WIDE.matches ? 'dragShelf' : 'swipeShelf');
  schedulePrefetch(slot.spec);
}
/* --- custom boosters ---------------------------------------------------------------- */

/*
 * THE FORGE
 * ----------------------------------------------------------------------------
 * The custom tab, rebuilt from nothing for a phone. One centred column,
 * everything full width, nothing beside anything: a seal that LIVE-PREVIEWS
 * the pack being typed (it runs the same procedural identity a finished pack
 * gets, so the letter, palette and spin on screen are the ones you will own),
 * a big input, tappable ideas for anyone unsure what counts as a subject, one
 * big button, and the packs already built as tiles underneath.
 */

export const FORGE_IDEAS = ['Minecraft', 'Naruto', 'Pokémon', 'Star Wars', 'Zelda', 'One Piece'];

export function paintForgeSeal(text) {
  const subject = text.trim();
  const style = proceduralStyle((subject || 'wikster').toLowerCase());
  el.forgeSeal.style.setProperty('--accent', style.accent);
  el.forgeSeal.style.setProperty('--accent2', style.accent2);
  const letter = (subject.charAt(0) || 'W').toUpperCase();
  el.forgeSeal.innerHTML = monogramSvg(letter, subject.length * 3, { size: 86 });
  el.forgeSeal.classList.toggle('is-live', subject.length > 0);
}

export function renderCreator() {
  el.forgeTitle.textContent = t('creatorTitle');
  el.forgeNote.textContent = t('creatorNote');
  el.creatorInput.placeholder = t('customPlaceholder');
  el.creatorGo.textContent = t('create');
  el.creatorMineLabel.textContent = t('creatorMine');
  el.creatorStatus.hidden = !el.creatorStatus.textContent;
  paintForgeSeal(el.creatorInput.value);

  el.forgeIdeas.replaceChildren(...FORGE_IDEAS.map((idea) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'forge-idea';
    chip.textContent = idea;
    press(chip, { sound: null });
    chip.addEventListener('click', () => {
      el.creatorInput.value = idea;
      paintForgeSeal(idea);
      synth.playTap();
    });
    return chip;
  }));

  const made = state.customPacks ?? [];
  el.creatorEmpty.hidden = made.length > 0;
  if (!made.length) {
    el.creatorEmptyMark.innerHTML = iconSvg('wand', { size: 40 });
    el.creatorEmptyText.textContent = t('creatorNoneYet');
  }

  el.creatorMine.replaceChildren(...made.map((pack) => {
    const spec = {
      kind: 'custom', themeId: null, rarityId: null, cards: 5,
      customName: pack.name, customId: pack.id, wiki: pack.wiki,
      icon: pack.icon, accent: pack.accent, accent2: pack.accent2
    };
    const tile = document.createElement('div');
    tile.className = 'forge-made';
    tile.innerHTML = `
      <button type="button" class="forge-made-main">
        <span class="forge-made-art"></span>
        <b></b><span class="forge-made-sub"></span>
      </button>
      <button type="button" class="forge-made-delete" aria-label="${esc(t('deleteBoosterNamed', { name: pack.name }))}">
        ${iconSvg('trash', { size: 16 })}
      </button>`;
    tile.querySelector('.forge-made-art').appendChild(buildBooster(spec, { size: 'is-tiny' }));
    tile.querySelector('b').textContent = pack.name;
    tile.querySelector('.forge-made-sub').textContent = t('creatorInShop');

    const main = tile.querySelector('.forge-made-main');
    press(main, { sound: null });
    main.addEventListener('click', () => {
      synth.playTap();
      payStipend();
      renderShop();
      showScreen('shop');
    });

    // Deleting is two taps: the first arms the button, the second commits.
    // Walking away (or tapping anything else) disarms it.
    const del = tile.querySelector('.forge-made-delete');
    let armTimer = 0;
    del.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!del.classList.contains('is-armed')) {
        del.classList.add('is-armed');
        toast(t('deleteArmed'), 'ok');
        synth.playTap();
        armTimer = setTimeout(() => del.classList.remove('is-armed'), 3500);
        return;
      }
      clearTimeout(armTimer);
      state.customPacks = store.deleteCustomPack(pack.id);
      toast(t('packDeleted', { name: pack.name }), 'ok');
      synth.playResolved();
      renderCreator();
      renderPacks();
      renderShop();
    });
    return tile;
  }));
}

export function customPackName(typed, sitename) {
  const trimmed = (sitename ?? '').replace(/\s*(fandom|wiki|wikia)\s*$/i, '').trim();
  return trimmed.length >= 2 ? trimmed : typed.replace(/\s+/g, ' ').trim();
}

export function setCreatorStatus(text, kind) {
  el.creatorStatus.textContent = text;
  el.creatorStatus.className = `forge-status is-${kind}`;
  el.creatorStatus.hidden = !text;
}

export async function createCustomPack(event) {
  event.preventDefault();
  if (state.busy) return;

  const raw = el.creatorInput.value.trim();
  if (!raw) { setCreatorStatus(t('typeNameFirst'), 'error'); return; }

  state.busy = true;
  el.creatorGo.disabled = true;
  el.creatorInput.disabled = true;
  setCreatorStatus(t('creating'), 'working');

  try {
    const wiki = await resolveCustomWiki(raw);
    const url = new URL(wiki.apiUrl);
    const host = url.host + url.pathname.replace('/api.php', '');
    const pack = {
      id: `custom-${host.replace(/\W+/g, '-')}`,
      name: customPackName(raw, wiki.sitename),
      tagline: wiki.sitename,
      icon: 'wand',
      accent: '#a78bfa', accent2: '#4c1d95',
      wiki
    };
    state.customPacks = store.saveCustomPack(pack);
    state.profile.packsBuilt = (state.profile.packsBuilt ?? 0) + 1;

    // Building a pack does NOT hand over a booster: it goes on sale in the
    // Shop, on its own shelf. It used to be free, which was a free openable
    // pack out of thin air for anyone who typed a name.
    renderPacks();
    renderShop();
    setCreatorStatus(t('createdGoShop', { name: pack.name }), 'ok');
    reportQuest('custom');
    el.creatorInput.value = '';
    synth.playResolved();
  } catch {
    setCreatorStatus(t('createFailed'), 'error');
    synth.playDenied();
  } finally {
    state.busy = false;
    el.creatorGo.disabled = false;
    el.creatorInput.disabled = false;
  }
}
/* --- timed boosters -------------------------------------------------------------------- */

export function syncTimed() {
  const before = state.profile.timed.count ?? 0;
  accrue(state.profile.timed);
  const after = state.profile.timed.count ?? 0;
  const cap = maxHeld(timedLevel(state.profile.timed.opened ?? 0));
  // The shelf just filled: worth a bell, once per fill.
  if (after > before && after >= cap) pushNote('clock', t('notifTimedFull'), 'timed');
  store.saveProfile(state.profile);
  return state.profile.timed;
}

export function currentTimedSpec() {
  return (timedSpec(timedLevel(state.profile.timed.opened ?? 0)));
}
/*
 * FREE PACKS
 * ----------------------------------------------------------------------------
 * Rebuilt around the only two things anyone comes to this screen for: how many
 * are waiting, and when the next one lands. The dial answers both at once -
 * the number is the count, the ring is the fill towards the next - and the
 * pips give the cap a shape, so "5 of 7" is something you see before you read.
 *
 * The old screen led with a paragraph of rules and a pack sitting off-centre.
 * The rules are now behind the "?" where rules belong, and the track below
 * says what levelling actually buys, one line per thing it changes, instead of
 * one dense sentence.
 */

export function renderTimed() {
  const timed = syncTimed();
  const level = timedLevel(timed.opened ?? 0);
  const cap = maxHeld(level);
  const held = timed.count ?? 0;

  el.timedTitle.textContent = t('tabTimed');
  el.freeCap.textContent = t('freeOf', { max: cap });
  el.freeFoot.textContent = t('freeFoot', {
    cards: TIMED_CARDS, minutes: Math.round(regenMs(level) / 60000)
  });

  // Pips: one per slot the cap allows, filled for what is banked.
  el.freePips.replaceChildren(...Array.from({ length: cap }, (_, i) => {
    const pip = document.createElement('span');
    pip.className = `free-pip${i < held ? ' is-full' : (i === held ? ' is-next' : '')}`;
    return pip;
  }));

  el.timedOpen.textContent = t('timedOpen');
  el.timedOpen.disabled = held <= 0;
  el.timedOpen.onclick = openTimed;

  el.freeTrackLabel.textContent = t('freeTrackLabel');
  const { to } = levelBounds(timed.opened ?? 0);
  const atMax = level >= MAX_TIMED_LEVEL;
  el.trackLevel.textContent = t('freeLevel', { level });
  el.trackRemaining.textContent = atMax
    ? t('freeMaxed')
    : t('timedToNext', { n: to - (timed.opened ?? 0), level: level + 1 });
  live.trackBar.set(levelProgress(timed.opened ?? 0));

  // What this level buys, one line each, rather than one dense sentence.
  const topTier = timedTopTier(level);
  const atCeiling = topTier.id === RARITIES[RARITIES.length - 1].id;
  const perks = [
    ['clock', t('freePerkSpeed', { minutes: Math.round(regenMs(level) / 60000) })],
    ['packs', t('freePerkCap', { max: cap })],
    ['gem', atCeiling ? t('freePerkTierMax') : t('freePerkTier', { tier: tx(topTier.name) })]
  ];
  el.freePerks.replaceChildren(...perks.map(([icon, text]) => {
    const row = document.createElement('div');
    row.className = 'free-perk';
    row.innerHTML = `<span class="free-perk-icon">${iconSvg(icon, { size: 17 })}</span><span></span>`;
    row.querySelector('span:last-child').innerHTML = esc(text).replace(/\*([^*]+)\*/g, '<b>$1</b>');
    return row;
  }));

  el.trackNext.textContent = atMax ? '' : t('timedNextPerks', {
    minutes: Math.round(regenMs(level + 1) / 60000), max: maxHeld(level + 1)
  });
  el.trackNext.hidden = atMax;

  tickTimed();
}
/** The 1 Hz part: the dial and the countdown, only while this screen is up. */

export function tickTimed() {
  const timed = state.profile.timed;
  const before = timed.count ?? 0;
  accrue(timed);
  const level = timedLevel(timed.opened ?? 0);
  const cap = maxHeld(level);
  const held = timed.count ?? 0;

  if (held !== before) {
    store.saveProfile(state.profile);
    updateBadges();
    synth.playReady();
    renderTimed();
    return;
  }

  el.freeCount.textContent = String(held);
  el.timedOpen.disabled = held <= 0;

  const left = msToNext(timed);
  if (left === null) {
    live.freeRing.set(1, '');
    el.freeState.textContent = t('freeFull');
    el.freeState.className = 'free-state is-ready';
  } else {
    // The ring is the fraction of the current interval already elapsed.
    const step = regenMs(level);
    live.freeRing.set(step > 0 ? 1 - left / step : 0, '');
    el.freeState.textContent = t('freeNextIn', { time: formatCountdown(left) });
    el.freeState.className = `free-state${held > 0 ? ' is-ready' : ''}`;
  }
  el.freeCap.textContent = t('freeOf', { max: cap });
}

export function openTimed() {
  const timed = syncTimed();
  if ((timed.count ?? 0) <= 0) { synth.playDenied(); return; }
  const spec = currentTimedSpec();
  // Track progress is credited when the pack produces cards, not here: a
  // failed draw refunds the booster and must not also count as an opening.
  gainBooster(spec, 1);
  timed.count -= 1;
  if (!Number.isFinite(timed.last)) timed.last = Date.now();
  store.saveProfile(state.profile);
  updateBadges();
  openScreenFor(spec);
}
