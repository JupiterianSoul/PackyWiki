/* arcade: split out of main.js */

import * as quests from '../quests.js';
import { t, tx } from '../i18n.js';
import { buildAlbums } from '../albums.js';
import * as store from '../collection.js';
import { iconSvg } from '../data/icons.js';
import { press, reveal } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import { casinoOpen } from '../slots.js';
import { el, esc, showScreen, state, toast } from './core.js';
import { paintDrawerLinks, pushNote } from './drawer.js';
import { signedIn, userId } from './gate.js';

/* --- the arcade: minigames, quests and the leaderboard ------------------------------------------------------------ */

/** Who the quests and the boards belong to: the account, or this device. */

export function questUserKey() {
  return (userId() ?? 'local');
}
/**
 * Something happened that a quest may count. Never throws: a quest that
 * cannot be credited is a quest missed, not a game stopped.
 */

export function reportQuest(metric, detail = {}) {
  try {
    const done = quests.track(metric, detail, questUserKey());
    for (const id of done) {
      const quest = quests.describe(quests.loadBoard(questUserKey())).find((r) => r.id === id)?.quest;
      if (quest) { toast(esc(t('questDone', { name: tx(quest.name) })), 'ok'); pushNote('trophy', t('questDone', { name: tx(quest.name) }), 'quests'); }
    }
    paintDrawerLinks();
  } catch (error) {
    console.warn('quest report failed', error);
  }
}
/** Albums completed since the last look: one report each. */

export let albumsDoneBefore = null;

export function reportAlbums() {
  try {
    const done = buildAlbums(store.allEntries(state.collection), state.customPacks).filter((a) => a.complete).length;
    if (albumsDoneBefore !== null && done > albumsDoneBefore) for (let i = albumsDoneBefore; i < done; i++) reportQuest('album');
    albumsDoneBefore = done;
  } catch { /* an album that cannot be counted is not a crash */ }
}
/** The stage a game shows when it cannot run: an icon, a sentence, maybe a button. */

export function gameStage(iconId, text, action = null) {
  const box = document.createElement('div');
  box.className = 'game-stage';
  box.innerHTML = `<span class="game-stage-icon">${iconSvg(iconId, { size: 46 })}</span><p class="game-note"></p>`;
  box.querySelector('.game-note').textContent = text;
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary';
    btn.textContent = action.label;
    press(btn, { sound: null });
    btn.addEventListener('click', () => { synth.playTap(); action.run(); });
    box.appendChild(btn);
  }
  return box;
}
/** What went wrong at the house, in the player's words. */

export function houseError(error) {
  const code = String(error?.message ?? '');
  if (code === 'SIGN_IN') return t('gameSignIn');
  if (code === 'CLOSED') return t('gameClosed');
  if (code === 'TIMEOUT') return t('gameTimeout');
  if (code === 'TAMPER') return t('gameTamper');
  if (code === 'BAD_BET' || code === 'OVER_LIMIT') return t('gameBadBet');
  if (code === 'SCHEMA') return t('gameSchema');
  return t('gameFailed');
}

export function renderGames() {
  el.gamesTitle.textContent = t('tabGames');
  el.gamesSub.textContent = t('gamesIntro');
  const tiles = [
    { id: 'wikdle', icon: 'grid', color: '#4ade80', title: t('wikdleTitle'), note: t('gamesWikdleNote'), run: () => import('./wikdle.js').then(async (m) => { await m.renderWikdle(); showScreen('wikdle'); }) },
    { id: 'slots', icon: 'reel', color: '#fbbf24', title: t('slotsTitle'), note: t('gamesSlotsNote'), run: () => import('./slots.js').then((m) => { m.renderSlots(); showScreen('slots'); }) },
    { id: 'duel', icon: 'podium', color: '#f472b6', title: t('duelTitle'), note: t('gamesDuelNote'), run: () => import('./duel.js').then((m) => { m.renderDuel(); showScreen('duel'); }) },
    { id: 'reveal', icon: 'search', color: '#22d3ee', title: t('revealGameTitle'), note: t('gamesRevealNote'), run: () => import('./reveal.js').then((m) => { m.renderReveal(); showScreen('reveal'); }) },
  ];
  const list = document.createElement('div');
  list.className = 'games-list';
  list.replaceChildren(...tiles.map((tile) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'game-tile';
    btn.style.setProperty('--game', tile.color);
    btn.innerHTML = `<span class="game-tile-art">${iconSvg(tile.icon, { size: 28 })}</span>
      <span class="game-tile-copy"><b></b><p></p></span>
      <span class="game-tile-go">${iconSvg('chevronRight', { size: 18 })}</span>`;
    btn.querySelector('b').textContent = tile.title;
    btn.querySelector('p').textContent = tile.note;
    press(btn, { sound: null });
    btn.addEventListener('click', () => { synth.playTap(); tile.run(); });
    return btn;
  }));
  const note = document.createElement('p');
  note.className = 'game-closed';
  note.textContent = casinoOpen(signedIn()) ? t('gamesCasinoOpen') : t('gamesCasinoNeedsAccount');
  el.gamesList.replaceChildren(list, note);
  reveal(list.children, { step: 60 });
}
