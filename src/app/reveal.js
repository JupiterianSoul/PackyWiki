/* --- guess the article -----------------------------------------------------------
 *
 * A picture out of the album, blurred, four titles, and a blur that lifts
 * as the points fall. The arithmetic and the ledger are in src/reveal.js;
 * this is the screen and its clock.
 */

import { t } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import { press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import * as store from '../collection.js';
import * as reveal from '../reveal.js';
import * as leaderboard from '../leaderboard.js';
import { isSensitive } from '../sensitive.js';
import { fill, h } from '../ui/dom.js';
import { gameStage, reportQuest } from './arcade.js';
import { el, money, refreshWallet, state, toast } from './core.js';
import { signedIn } from './gate.js';
import { updateBadges } from './regalia.js';

const pill = (icon, text) => h('span.wikdle-pill', [h('span.wikdle-pill-icon', { html: iconSvg(icon, { size: 13 }) }), text]);

export function renderReveal() {
  el.revealTitle.textContent = t('revealGameTitle');
  el.revealBack.innerHTML = iconSvg('chevronLeft', { size: 18 });
  const g = state.reveal ??= { round: null, timer: null, until: 0 };
  stopClock(g);
  const entries = store.allEntries(state.collection);
  if (!reveal.canPlay(entries, isSensitive)) {
    el.revealBody.replaceChildren(gameStage('search', t('revealNeedCards', { n: reveal.REVEAL_MIN_CARDS })));
    return;
  }
  if (g.round?.over) g.round = null;
  paintReveal();
}

/**
 * The clock.
 *
 * A step used to be a silent setTimeout: the blur lifted out of nowhere and
 * the points fell with it, which read as the game hurrying. It is a deadline
 * now, shown as a bar draining and the seconds beside it, and the frame that
 * finds the deadline past is the one that lifts. Same clock on screen as in
 * the code, so what the player sees is what they get.
 */
function stopClock(g) {
  if (g?.timer) cancelAnimationFrame(g.timer);
  if (g) { g.timer = null; g.until = 0; }
}

function runClock(bar, label) {
  const g = state.reveal;
  if (!g?.round || g.round.over) return;
  const tick = () => {
    if (state.reveal !== g || !g.until) return;
    const left = g.until - performance.now();
    if (left <= 0) { stopClock(g); liftNow(); return; }
    if (bar.isConnected) {
      bar.style.setProperty('--left', `${(100 * left) / reveal.REVEAL_STEP_MS}%`);
      label.textContent = t('revealLiftIn', { s: Math.ceil(left / 1000) });
    }
    g.timer = requestAnimationFrame(tick);
  };
  g.until = performance.now() + reveal.REVEAL_STEP_MS;
  g.timer = requestAnimationFrame(tick);
}

/** The clock stops with the screen: a lift on a screen nobody is looking at is a point lost for nothing. */
export function leaveReveal() {
  stopClock(state.reveal);
}

function paintReveal() {
  const g = state.reveal;
  const body = el.revealBody;
  const ledger = reveal.loadDay();
  const head = h('div.wikdle-head', [
    pill('dice', t('revealRoundsLeft', { n: reveal.roundsLeft() })),
    pill('trophy', t('revealBestToday', { n: ledger.best }))
  ]);
  if (!g.round) {
    const left = reveal.roundsLeft();
    const start = h('button.btn.btn-primary.reveal-start', { type: 'button', disabled: left === 0 }, left ? t('revealStart') : t('revealNoRounds'));
    press(start, { sound: null });
    start.addEventListener('click', () => {
      if (!reveal.roundsLeft()) return;
      synth.playTap();
      g.round = reveal.startRound(store.allEntries(state.collection), { isSensitive });
      if (!g.round) { toast(t('revealNeedCards', { n: reveal.REVEAL_MIN_CARDS }), 'error'); return; }
      paintReveal();
    });
    fill(body, h('div.reveal', [head, h('p.game-note.reveal-intro', t('revealIntro', { n: reveal.REVEAL_ROUND_LENGTH, pts: reveal.REVEAL_POINTS.join(' / ') })), start]));
    return;
  }
  const r = g.round;
  const item = r.items[r.index];
  const picked = item.picked !== null;
  const stage = h('div.reveal-stage', { dataset: { step: item.step } }, [
    h('img', { src: item.card.thumbnail, alt: '', draggable: false, style: { filter: `blur(${reveal.REVEAL_BLUR[picked ? reveal.REVEAL_BLUR.length - 1 : item.step]}px)` } }),
    h('span.reveal-count.tabular', t('revealCard', { i: r.index + 1, n: r.items.length }))
  ]);
  const steps = h('div.reveal-steps', reveal.REVEAL_POINTS.map((pts, i) =>
    h('span.reveal-step.tabular', { dataset: { state: i < item.step ? 'past' : i === item.step ? 'now' : 'ahead' } }, String(pts))));
  const last = item.step >= reveal.REVEAL_BLUR.length - 1;
  const clearer = h('button.btn.btn-ghost.btn-sm.reveal-clearer', { type: 'button', disabled: picked || last }, t('revealClearer'));
  press(clearer, { sound: null });
  clearer.addEventListener('click', () => { synth.playTap(); stopClock(g); liftNow(); });
  // The clock: a bar draining toward the next lift, and the seconds on it.
  const bar = h('span.reveal-clock-bar', { 'aria-hidden': 'true' });
  const label = h('span.reveal-clock-label.tabular');
  const clock = h('div.reveal-clock', { hidden: picked || last }, [bar, label]);
  const choices = h('div.reveal-choices', item.choices.map((choice) => {
    const btn = h('button.btn.reveal-choice', { type: 'button', dataset: { key: choice.key }, disabled: picked }, choice.title);
    if (picked && choice.key === item.card.key) btn.classList.add('is-right');
    if (picked && choice.key === item.picked && choice.key !== item.card.key) btn.classList.add('is-wrong');
    press(btn, { sound: null });
    btn.addEventListener('click', () => pickReveal(choice.key));
    return btn;
  }));
  const verdict = picked
    ? h('p.game-note.reveal-verdict', { className: item.correct ? 'is-right' : 'is-wrong' },
      item.correct ? t('revealRight', { n: item.points }) : t('revealWrong', { title: item.card.title }))
    : h('p.game-note.reveal-verdict', t('revealWhich'));
  const next = picked ? h('button.btn.btn-primary.reveal-next', { type: 'button' }, r.index + 1 < r.items.length ? t('revealNext') : t('revealFinish')) : null;
  if (next) { press(next, { sound: null }); next.addEventListener('click', () => { synth.playTap(); afterPick(); }); }
  const score = h('div.duel-score', [h('span.duel-points.tabular', t('duelPoints', { n: r.points }))]);
  fill(body, h('div.reveal', [head, score, stage, steps, h('div.reveal-tools', [clearer, clock]), verdict, choices, next]));
  // The blur lifts on its own, a step at a time, until a title is picked.
  stopClock(g);
  if (!picked && !last) runClock(bar, label);
}

function liftNow() {
  const g = state.reveal;
  if (!g?.round || g.round.over) return;
  const before = g.round;
  g.round = reveal.lift(before);
  if (g.round !== before) paintReveal();
}

function pickReveal(key) {
  const g = state.reveal;
  if (!g?.round || g.round.over) return;
  stopClock(g);
  const before = g.round;
  g.round = reveal.pick(before, key);
  if (g.round === before) return;
  const item = g.round.items[g.round.index];
  if (item.correct) synth.playTap(); else synth.playDenied();
  paintReveal();
}

function afterPick() {
  const g = state.reveal;
  if (!g?.round) return;
  g.round = reveal.advance(g.round);
  if (g.round.over) settleReveal(g.round);
  else paintReveal();
}

function settleReveal(round) {
  stopClock(state.reveal);
  const ledger = reveal.recordRound(round);
  const coins = reveal.coinsFor(round.points);
  if (coins > 0) { store.saveWallet(store.loadWallet() + coins); refreshWallet(); synth.playCoins(); }
  const perfect = round.right === round.items.length;
  state.profile.revealRounds = (state.profile.revealRounds ?? 0) + 1;
  if (perfect) state.profile.revealPerfect = (state.profile.revealPerfect ?? 0) + 1;
  store.saveProfile(state.profile);
  reportQuest('reveal', { points: round.points, correct: round.right, perfect });
  updateBadges();
  if (signedIn() && round.points > 0) leaderboard.submitScore('reveal', round.points, ledger.day).catch(() => { /* the board can miss one */ });

  const again = h('button.btn.btn-primary', { type: 'button', disabled: !reveal.roundsLeft() }, reveal.roundsLeft() ? t('revealAgain') : t('revealNoRounds'));
  press(again, { sound: null });
  again.addEventListener('click', () => { synth.playTap(); state.reveal.round = null; renderReveal(); });
  const done = h('div.duel-summary', [
    h('span.game-stage-icon', { html: iconSvg(perfect ? 'trophy' : 'search', { size: 42 }) }),
    h('b', perfect ? t('revealPerfect') : t('revealOverTitle')),
    h('p.game-note', { html: t('revealOver', { right: round.right, n: round.items.length, points: round.points, coins: money(coins) }) }),
    again
  ]);
  fill(el.revealBody, h('div.reveal', [h('div.wikdle-head', [pill('dice', t('revealRoundsLeft', { n: reveal.roundsLeft() })), pill('trophy', t('revealBestToday', { n: ledger.best }))]), done]));
}
