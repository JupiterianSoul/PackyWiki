/* --- the popularity duel ------------------------------------------------------------
 *
 * Two of your cards, one readership shown, one to call: more or fewer. The
 * arithmetic and the day's ledger are in src/duel.js; this is the screen:
 * a lobby with the day's rounds, the arena, and the round's reckoning.
 */

import { t } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import { press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import * as store from '../collection.js';
import { formatViews } from '../pricing.js';
import * as duel from '../duel.js';
import * as leaderboard from '../leaderboard.js';
import { fill, h } from '../ui/dom.js';
import { gameStage, reportQuest } from './arcade.js';
import { el, money, refreshWallet, state, toast } from './core.js';
import { signedIn } from './gate.js';
import { updateBadges } from './regalia.js';

const pill = (icon, text) => h('span.wikdle-pill', [h('span.wikdle-pill-icon', { html: iconSvg(icon, { size: 13 }) }), text]);

const art = (card) => h('div.duel-art', card.thumbnail ? h('img', { src: card.thumbnail, alt: '', loading: 'lazy', draggable: false }) : null);

export function renderDuel() {
  el.duelTitle.textContent = t('duelTitle');
  el.duelBack.innerHTML = iconSvg('chevronLeft', { size: 18 });
  const body = el.duelBody;
  const entries = store.allEntries(state.collection);
  if (!duel.canPlay(entries)) {
    body.replaceChildren(gameStage('podium', t('duelNeedCards', { n: duel.DUEL_MIN_CARDS })));
    return;
  }
  const g = state.duel ??= { round: null, busy: false };
  if (g.round?.over) g.round = null;
  paintDuel();
}

function paintDuel() {
  const g = state.duel;
  const body = el.duelBody;
  const ledger = duel.loadDay();
  const head = h('div.wikdle-head', [
    pill('dice', t('duelRoundsLeft', { n: duel.roundsLeft() })),
    pill('trophy', t('duelBestToday', { n: ledger.best }))
  ]);
  if (!g.round) {
    const left = duel.roundsLeft();
    const start = h('button.btn.btn-primary.duel-start', { type: 'button', disabled: left === 0 }, left ? t('duelStart') : t('duelNoRounds'));
    press(start, { sound: null });
    start.addEventListener('click', () => {
      if (!duel.roundsLeft()) return;
      synth.playTap();
      g.round = duel.startRound(store.allEntries(state.collection));
      if (!g.round) { toast(t('duelNeedCards', { n: duel.DUEL_MIN_CARDS }), 'error'); return; }
      paintDuel();
    });
    fill(body, h('div.duel', [head, h('p.game-note.duel-intro', t('duelIntro', { n: duel.DUEL_ROUND_LENGTH })), start]));
    return;
  }
  const r = g.round;
  const score = h('div.duel-score', [
    h('span.duel-streak', t('duelStreak', { n: r.streak })),
    h('span.duel-points.tabular', t('duelPoints', { n: r.points }))
  ]);
  const known = h('div.duel-card.is-known', [art(r.left), h('b.duel-name', r.left.title),
    h('span.duel-figure.tabular', t('duelReaders', { n: formatViews(Number(r.left.views)) }))]);
  const asked = h('div.duel-card.is-asked', [art(r.right), h('b.duel-name', r.right.title),
    h('span.duel-figure.duel-unknown', '?')]);
  const higher = h('button.btn.btn-primary.duel-call', { type: 'button', dataset: { call: 'higher' } }, t('duelHigher'));
  const lower = h('button.btn.btn-primary.duel-call', { type: 'button', dataset: { call: 'lower' } }, t('duelLower'));
  for (const btn of [higher, lower]) {
    press(btn, { sound: null });
    btn.addEventListener('click', () => callDuel(btn.dataset.call, { asked, higher, lower }));
  }
  fill(body, h('div.duel', [head, score, h('div.duel-arena', [known, h('span.duel-vs', 'vs'), asked]), h('div.duel-calls', [higher, lower])]));
}

async function callDuel(call, nodes) {
  const g = state.duel;
  if (!g?.round || g.round.over || g.busy) return;
  g.busy = true;
  const before = g.round;
  const after = duel.answer(before, call);
  g.round = after;
  const correct = after.last?.correct;
  // The hidden figure comes up, and the arena says which way it went.
  nodes.asked.querySelector('.duel-figure').textContent = t('duelReaders', { n: formatViews(Number(before.right.views)) });
  nodes.asked.querySelector('.duel-figure').classList.remove('duel-unknown');
  nodes.asked.classList.add(correct ? 'is-right' : 'is-wrong');
  nodes.higher.disabled = nodes.lower.disabled = true;
  if (correct) synth.playTap(); else synth.playDenied();
  await new Promise((r) => setTimeout(r, correct ? 900 : 1300));
  g.busy = false;
  if (state.duel !== g) return;
  if (!after.over) { paintDuel(); return; }
  settleDuel(after);
}

/** The round is over: coins, the ledger, the quests, the board, the reckoning. */
function settleDuel(round) {
  const ledger = duel.recordRound(round);
  const coins = duel.coinsFor(round.points);
  if (coins > 0) { store.saveWallet(store.loadWallet() + coins); refreshWallet(); synth.playCoins(); }
  state.profile.duelRounds = (state.profile.duelRounds ?? 0) + 1;
  state.profile.duelBest = Math.max(state.profile.duelBest ?? 0, round.streak);
  store.saveProfile(state.profile);
  reportQuest('duel', { points: round.points, correct: round.streak, perfect: round.perfect });
  updateBadges();
  if (signedIn() && round.points > 0) leaderboard.submitScore('duel', round.points, ledger.day).catch(() => { /* the board can miss one */ });

  const again = h('button.btn.btn-primary', { type: 'button', disabled: !duel.roundsLeft() }, duel.roundsLeft() ? t('duelAgain') : t('duelNoRounds'));
  press(again, { sound: null });
  again.addEventListener('click', () => { synth.playTap(); state.duel.round = null; renderDuel(); });
  const done = h('div.duel-summary', [
    h('span.game-stage-icon', { html: iconSvg(round.perfect ? 'trophy' : 'podium', { size: 42 }) }),
    h('b', round.perfect ? t('duelPerfect') : t('duelOverTitle')),
    h('p.game-note', { html: t('duelOver', { streak: round.streak, points: round.points, coins: money(coins) }) }),
    round.last && !round.last.correct
      ? h('p.game-note.duel-last', t('duelWasIt', { title: round.last.right.title, n: formatViews(Number(round.last.right.views)) }))
      : null,
    again
  ]);
  fill(el.duelBody, h('div.duel', [h('div.wikdle-head', [pill('dice', t('duelRoundsLeft', { n: duel.roundsLeft() })), pill('trophy', t('duelBestToday', { n: ledger.best }))]), done]));
}
