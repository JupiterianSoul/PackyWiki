/* quiz: split out of main.js */

import { QUIZ_PER_DAY, buildQuiz, questionCountFor, quizAvailable, quizPlaysLeft, quizRewards, recordQuizPlay } from '../quiz.js';
import { priceFor } from '../pricing.js';
import { specColours, specIcon, specId, specName, toDrawPack } from '../booster.js';
import { t, tx } from '../i18n.js';
import { synth } from '../ui/sound.js';
import { drawArticles, fetchArticleText } from '../wiki.js';
import { rarityOfCard } from '../data/rarities.js';
import * as store from '../collection.js';
import { iconSvg } from '../data/icons.js';
import { THEME_PACKS } from '../data/packs.js';
import { emblemSvg } from '../data/emblems.js';
import { press, reveal } from '../ui/components.js';
import { reportQuest } from './arcade.js';
import { el, esc, money, refreshWallet, showScreen, state, toast } from './core.js';
import { buildStaticCard } from './detail.js';
import { userId } from './gate.js';
import { gainBooster } from './open.js';
import { renderPacks } from './packs.js';
import { updateBadges } from './regalia.js';

/* --- the quiz ------------------------------------------------------------------------------------- */

/*
 * One subject, one card you probably do not own, three to five questions
 * written on the spot from the article's own text, and a reward ladder that
 * tops out at the card, big money and a Rare booster. No feedback until the
 * end: the recap is where you learn what was right.
 */

export function resetQuiz() {
  state.quiz = { step: quizAvailable() ? 'pick' : 'nokey' };
}
/** Whose daily allowance is being spent: the account's, or this device's. */

export function quizUserKey() {
  return (userId() ?? 'device');
}
/** The quiz card as a collection-shaped entry (bare = no article text). */

export function quizEntry(q, { bare = false } = {}) {
  const spec = { kind: 'theme', themeId: q.themeId, rarityId: null, cards: 1 };
  return {
    key: q.card.key, title: q.card.title,
    description: bare ? '' : (q.card.description ?? ''),
    extract: bare ? '' : (q.card.extract ?? ''),
    thumbnail: q.card.thumbnail, url: q.card.url, lang: q.card.lang,
    sourceId: q.card.sourceId, sourceName: q.card.sourceName,
    views: q.card.views, popularity: q.card.popularity,
    rarityId: q.rarity.id, price: priceFor(q.card.popularity, q.rarity),
    packId: specId(spec), packName: specName(spec), packIcon: specIcon(spec),
    packAccent: specColours(spec).accent,
    count: 1, favorite: false, firstPulledAt: Date.now(), lastPulledAt: Date.now()
  };
}

export async function startQuiz(themeId) {
  if (quizPlaysLeft(quizUserKey()) <= 0) {
    toast(t('quizNoneLeft'), 'error');
    synth.playDenied();
    return;
  }
  const q = state.quiz = { step: 'draw', themeId };
  renderQuiz();
  try {
    const spec = { kind: 'theme', themeId, rarityId: null, cards: 1 };
    let article = null;
    // Prefer a card the player does NOT own; three draws, then take what came.
    for (let i = 0; i < 3; i++) {
      const [drawn] = await drawArticles(toDrawPack(spec));
      article = drawn;
      if (!state.collection.entries[drawn.key]) break;
    }
    if (state.quiz !== q) return;
    q.card = article;
    q.rarity = rarityOfCard(article);
    q.count = questionCountFor(q.rarity.id);
    q.step = 'preview';
    renderQuiz();
  } catch {
    if (state.quiz !== q) return;
    toast(t('quizFailed'), 'error');
    synth.playDenied();
    resetQuiz();
    renderQuiz();
  }
}

export async function beginQuizQuestions() {
  const q = state.quiz;
  if (quizPlaysLeft(quizUserKey()) <= 0) {
    q.error = t('quizNoneLeft');
    q.step = 'preview';
    renderQuiz();
    return;
  }
  q.error = null;
  q.step = 'writing';
  renderQuiz();
  try {
    const text = await fetchArticleText(q.card.title, { limit: 3500 }).catch(() => '');
    const questions = await buildQuiz({
      title: q.card.title,
      text: text || q.card.extract,
      rarityId: q.rarity.id
    });
    if (state.quiz !== q) return;
    recordQuizPlay(quizUserKey());
    q.questions = questions;
    q.index = 0;
    q.answers = [];
    q.step = 'ask';
    renderQuiz();
  } catch (err) {
    if (state.quiz !== q) return;
    // The reason travels with the error: "try again" is useless advice when
    // the function is simply not deployed under the name the app calls. It
    // stays on the screen too, since a toast is gone before anyone can read
    // a status code off it.
    const detail = err?.detail ? ` (${err.detail})` : '';
    q.error = err?.message === 'QUIZ_UNAVAILABLE' ? t('quizNoKey') : `${t('quizFailed')}${detail}`;
    toast(q.error, 'error');
    synth.playDenied();
    q.step = 'preview';
    renderQuiz();
  }
}

export function answerQuiz(choice) {
  const q = state.quiz;
  if (q.step !== 'ask') return;
  q.answers.push(choice);
  synth.playTap();
  if (q.answers.length >= q.questions.length) return finishQuiz();
  q.index += 1;
  renderQuiz();
}

export function finishQuiz() {
  const q = state.quiz;
  q.correct = q.answers.filter((a, i) => a === q.questions[i].answer).length;
  state.profile.quizPlayed = (state.profile.quizPlayed ?? 0) + 1;
  if (q.correct >= 3) state.profile.quizWins = (state.profile.quizWins ?? 0) + 1;
  if (q.correct === q.questions.length) state.profile.quizPerfect = (state.profile.quizPerfect ?? 0) + 1;
  q.rewards = quizRewards(q.correct, q.themeId);
  reportQuest('quiz', { correct: q.correct });
  if (q.rewards.money > 0) {
    store.saveWallet(store.loadWallet() + q.rewards.money);
    refreshWallet();
  }
  if (q.rewards.card) store.receiveCardEntry(state.collection, quizEntry(q));
  if (q.rewards.booster) {
    gainBooster(q.rewards.booster, 1);
    renderPacks();
  }
  updateBadges();
  if (q.correct >= 2) synth.playFanfare(); else synth.playResolved();
  q.step = 'done';
  renderQuiz();
}
/**
 * Out of the quiz, one step at a time.
 *
 * From a card or a result the way back is the category list; from the list
 * itself it is out of the Quiz altogether. Backing out of a quiz already in
 * progress takes two taps, because the questions do not come back.
 */

export function leaveQuiz() {
  const q = state.quiz;
  if (!q || q.step === 'pick' || q.step === 'nokey') {
    resetQuiz();
    renderPacks();
    showScreen('packs');
    return;
  }
  if (q.step === 'ask' && !q.leaving) {
    q.leaving = true;
    toast(t('quizLeaveArmed'), 'ok');
    setTimeout(() => { if (state.quiz === q) q.leaving = false; }, 3500);
    return;
  }
  resetQuiz();
  renderQuiz();
}

export function renderQuiz() {
  // A finished quiz starts over on the next visit; a missing key un-blocks
  // itself the moment one is saved in Settings.
  if (!state.quiz || state.quiz.step === 'done' && state.tab !== 'quiz') resetQuiz();
  if (state.quiz.step === 'nokey' && quizAvailable()) resetQuiz();
  el.quizTitle.textContent = t('tabQuiz');
  el.quizBack.innerHTML = iconSvg('chevronLeft', { size: 18 });
  const q = state.quiz;
  const body = el.quizBody;
  const div = (cls, html = '') => {
    const node = document.createElement('div');
    node.className = cls;
    if (html) node.innerHTML = html;
    return node;
  };

  if (q.step === 'nokey') {
    const box = div('quiz-stage');
    box.innerHTML = `<span class="quiz-bigicon">${iconSvg('quiz', { size: 46 })}</span><p class="quiz-note"></p>`;
    box.querySelector('.quiz-note').textContent = t('quizNoKey');
    body.replaceChildren(box);
    return;
  }

  if (q.step === 'pick') {
    const left = quizPlaysLeft(quizUserKey());
    if (left <= 0) {
      const box = div('quiz-stage');
      box.innerHTML = `<span class="quiz-bigicon">${iconSvg('clock', { size: 46 })}</span><p class="quiz-note"></p>`;
      box.querySelector('.quiz-note').textContent = t('quizNoneLeft');
      body.replaceChildren(box);
      return;
    }
    const sub = div('quiz-sub');
    sub.textContent = t('quizIntro');
    const counter = div('quiz-allowance');
    counter.textContent = t('quizLeftToday', { n: left, max: QUIZ_PER_DAY });
    const grid = div('quiz-cats');
    grid.replaceChildren(...THEME_PACKS.map((theme) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'quiz-cat';
      tile.style.setProperty('--qa', theme.accent);
      tile.style.setProperty('--qa2', theme.accent2);
      tile.innerHTML = `<span class="quiz-cat-emblem">${emblemSvg(theme.id, { size: 40 })}</span><b></b>`;
      tile.querySelector('b').textContent = tx(theme.name);
      press(tile, { sound: null });
      tile.addEventListener('click', () => { synth.playTap(); startQuiz(theme.id); });
      return tile;
    }));
    body.replaceChildren(sub, counter, grid);
    reveal(grid.children, { step: 14, from: 8 });
    return;
  }

  if (q.step === 'draw' || q.step === 'writing') {
    const box = div('quiz-spin');
    box.innerHTML = `<span class="quiz-spin-mark">${iconSvg('hourglass', { size: 34 })}</span><p></p>`;
    box.querySelector('p').textContent = q.step === 'draw' ? t('quizDrawing') : t('quizWriting');
    body.replaceChildren(box);
    return;
  }

  if (q.step === 'preview') {
    const stage = div('quiz-stage');
    const label = div('quiz-progress');
    label.textContent = t('quizMeet');
    // The card WITHOUT its description: what it is stays the first question.
    const card = buildStaticCard(quizEntry(q, { bare: true }), q.rarity, null, { fav: false, lit: true });
    card.classList.add('quiz-mystery');
    const note = div('quiz-note');
    note.textContent = q.error ?? t('quizNotice', { n: q.count });
    if (q.error) note.classList.add('is-error');
    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'btn btn-primary quiz-start';
    start.textContent = t('quizStart');
    press(start, { sound: null });
    start.addEventListener('click', () => { synth.playTap(); beginQuizQuestions(); });
    stage.replaceChildren(label, card, note, start);
    body.replaceChildren(stage);
    return;
  }

  if (q.step === 'ask') {
    const item = q.questions[q.index];
    const progress = div('quiz-progress');
    progress.textContent = t('quizQuestionOf', { i: q.index + 1, n: q.questions.length });
    const question = div('quiz-q');
    question.textContent = item.question;
    const choices = div('quiz-choices');
    choices.replaceChildren(...item.choices.map((choice, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quiz-choice';
      btn.textContent = choice;
      press(btn, { sound: null });
      btn.addEventListener('click', () => answerQuiz(idx));
      return btn;
    }));
    body.replaceChildren(progress, question, choices);
    reveal(choices.children, { step: 40, from: 8 });
    return;
  }

  // done: the score, what it paid, and the full recap.
  const score = div('quiz-score');
  score.textContent = t('quizScore', { n: q.correct, total: q.questions.length });

  const rewards = div('quiz-rewards');
  const rewardRow = (icon, html) => {
    const row = div('quiz-reward');
    row.innerHTML = `<span class="quiz-reward-icon">${iconSvg(icon, { size: 18 })}</span><span></span>`;
    row.querySelector('span:last-child').innerHTML = html;
    return row;
  };
  if (q.rewards.money > 0) rewards.appendChild(rewardRow('gift', `${esc(t('quizRewardMoney'))} <b class="quiz-money">${money(q.rewards.money)}</b>`));
  if (q.rewards.card) rewards.appendChild(rewardRow('collection', esc(t('quizRewardCard'))));
  if (q.rewards.booster) rewards.appendChild(rewardRow('packs', esc(t('quizRewardBooster', { name: specName(q.rewards.booster) }))));
  if (!rewards.children.length) {
    const none = div('quiz-note');
    none.textContent = t('quizRewardNone');
    rewards.appendChild(none);
  }

  const recap = div('quiz-recap');
  recap.replaceChildren(...q.questions.map((item, i) => {
    const right = q.answers[i] === item.answer;
    const node = div('quiz-recap-item');
    node.innerHTML = `
      <p></p>
      <span class="quiz-recap-a ${right ? 'is-right' : 'is-wrong'}"><b></b><span data-mine></span></span>
      ${right ? '' : '<span class="quiz-recap-a is-answer"><b></b><span data-good></span></span>'}`;
    node.querySelector('p').textContent = `${i + 1}. ${item.question}`;
    node.querySelector('.quiz-recap-a b').textContent = t('quizYourAnswer');
    node.querySelector('[data-mine]').textContent = item.choices[q.answers[i]];
    if (!right) {
      node.querySelector('.is-answer b').textContent = t('quizCorrectAnswer');
      node.querySelector('[data-good]').textContent = item.choices[item.answer];
    }
    return node;
  }));

  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'btn btn-primary quiz-start';
  again.textContent = t('quizAgain');
  press(again, { sound: null });
  again.addEventListener('click', () => { synth.playTap(); resetQuiz(); renderQuiz(); });

  body.replaceChildren(score, rewards, recap, again);
}
