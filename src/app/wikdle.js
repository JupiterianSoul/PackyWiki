/* wikdle: split out of main.js */

import { t } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import * as wikdle from '../wikdle.js';
import { press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import { copyText } from '../save.js';
import { formatCountdown } from '../shop.js';
import * as store from '../collection.js';
import * as leaderboard from '../leaderboard.js';
import { reportQuest } from './arcade.js';
import { el, esc, refreshWallet, state, toast } from './core.js';
import { signedIn } from './gate.js';
import { gainBooster } from './open.js';

/* --- Wikdle ------------------------------------------------------------------------------ */

export const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', '⏎zxcvbnm⌫'];
/** Paper confetti over a node: a short burst from its middle, falling and tumbling. */

export function confettiOver(node, count = 90) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'wikdle-confetti';
  node.appendChild(canvas);
  const box = node.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(box.width * dpr);
  canvas.height = Math.round(box.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = box.width, H = box.height;
  const colors = ['#4ade80', '#fbbf24', '#f472b6', '#60a5fa', '#a78bfa', '#fff'];
  const bits = Array.from({ length: count }, (_, i) => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.4, y: H * 0.45,
    vx: (Math.random() - 0.5) * 14, vy: -6 - Math.random() * 11,
    w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.35,
    color: colors[i % colors.length]
  }));
  const start = performance.now();
  const frame = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const b of bits) {
      b.vy += 0.35; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.a += b.va;
      if (b.y > H + 10) continue;
      alive++;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
      ctx.fillStyle = b.color; ctx.globalAlpha = Math.max(0, 1 - t / 2600);
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    }
    if (alive && t < 2800) requestAnimationFrame(frame); else canvas.remove();
  };
  requestAnimationFrame(frame);
}

export async function renderWikdle() {
  await wikdle.loadWords();
  el.wikdleTitle.textContent = t('wikdleTitle');
  el.wikdleBack.innerHTML = iconSvg('chevronLeft', { size: 18 });
  let game = wikdle.loadGame();
  let typed = '';
  const body = el.wikdleBody;
  const wrap = document.createElement('div');
  wrap.className = 'wikdle';

  // The header: today's date, the streak, and how many hints are left.
  const head = document.createElement('div');
  head.className = 'wikdle-head';
  const stats0 = wikdle.loadStats();
  const streakNow = stats0.lastWonDay === game.day || stats0.lastWonDay === new Date(new Date(`${game.day}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10) ? stats0.streak : 0;
  head.innerHTML = `
    <span class="wikdle-pill"><span class="wikdle-pill-icon">${iconSvg('calendar', { size: 14 })}</span><span></span></span>
    <span class="wikdle-pill is-streak${streakNow >= 3 ? ' is-hot' : ''}"><span class="wikdle-pill-icon">${iconSvg('flame', { size: 14 })}</span><span></span></span>
    <span class="wikdle-pill is-hints"><span class="wikdle-pill-icon">${iconSvg('bulb', { size: 14 })}</span><span></span></span>`;
  head.children[0].lastElementChild.textContent = game.day;
  head.children[1].lastElementChild.textContent = t('wikdleStreakPill', { n: streakNow });
  const hintsPill = head.children[2].lastElementChild;

  const stage = document.createElement('div');
  stage.className = 'wikdle-stage';
  const grid = document.createElement('div');
  grid.className = 'wikdle-grid';
  stage.appendChild(grid);
  const status = document.createElement('p');
  status.className = 'wikdle-status';
  const hints = document.createElement('div');
  hints.className = 'wikdle-hints';
  const keys = document.createElement('div');
  keys.className = 'wikdle-keys';
  const done = document.createElement('div');
  done.className = 'wikdle-done';
  done.hidden = true;
  wrap.append(head, stage, status, hints, keys, done);
  body.replaceChildren(wrap);

  const paintGrid = (revealRow = -1, dance = false) => {
    grid.replaceChildren(...Array.from({ length: wikdle.ROWS }, (_, r) => {
      const row = document.createElement('div');
      row.className = 'wikdle-row';
      row.dataset.row = String(r);
      const played = game.rows[r];
      const current = !played && r === game.rows.length && game.status === 'playing';
      for (let c = 0; c < wikdle.COLUMNS; c++) {
        const cell = document.createElement('span');
        cell.className = 'wikdle-cell';
        if (played) {
          cell.textContent = played.guess[c];
          cell.classList.add(`is-${played.marks[c]}`);
          if (r === revealRow) { cell.classList.add('is-revealing'); cell.style.animationDelay = `${c * 130}ms`; }
          if (dance && r === game.rows.length - 1 && game.status === 'won') { cell.classList.add('is-dance'); cell.style.animationDelay = `${c * 90}ms`; }
        } else if (current && typed[c]) {
          cell.textContent = typed[c];
          cell.classList.add('is-filled');
          if (c === typed.length - 1) cell.classList.add('is-pop');
        } else if (current) {
          cell.classList.add('is-current');
        }
        row.appendChild(cell);
      }
      return row;
    }));
  };

  const paintKeys = () => {
    const marks = wikdle.keyMarks(game.rows);
    keys.replaceChildren(...KEYBOARD_ROWS.map((letters) => {
      const row = document.createElement('div');
      row.className = 'wikdle-keyrow';
      for (const ch of letters) {
        const key = document.createElement('button');
        key.type = 'button';
        key.className = 'wikdle-key';
        if (ch === '⏎') { key.classList.add('is-wide', 'is-enter'); key.textContent = t('wikdleEnter'); key.dataset.key = 'enter'; }
        else if (ch === '⌫') { key.classList.add('is-wide'); key.innerHTML = iconSvg('backspace', { size: 20 }); key.dataset.key = 'back'; key.setAttribute('aria-label', 'Backspace'); }
        else { key.textContent = ch; key.dataset.key = ch; if (marks[ch]) key.classList.add(`is-${marks[ch]}`); }
        key.disabled = game.status !== 'playing';
        key.addEventListener('pointerdown', (event) => { event.preventDefault(); press_(key.dataset.key); });
        row.appendChild(key);
      }
      return row;
    }));
  };

  // THE HINTS: two, and both have to be worth their points. A letter in its
  // place always is; the meaning is only offered when the encyclopaedia has
  // a real article rather than a page of things the word can mean.
  const paintHints = () => {
    const used = game.hints ?? [];
    hintsPill.textContent = t('wikdleHintsLeft', { n: Math.max(0, wikdle.HINTS_MAX - used.length) });
    hints.replaceChildren(...used.map((hint) => {
      const letter = Number.isInteger(hint?.at);
      const line = document.createElement('p');
      line.className = 'wikdle-hint';
      line.innerHTML = `<span class="wikdle-hint-icon">${iconSvg('bulb', { size: 15 })}</span><b></b><span></span>`;
      line.querySelector('b').textContent = letter ? t('wikdleHintLetterLabel') : t('wikdleHintMeaning');
      line.querySelector('span:last-child').textContent = wikdle.hintText(hint);
      return line;
    }));
    if (game.status === 'playing' && used.length < wikdle.HINTS_MAX && game.rows.length >= 1) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ghost btn-sm wikdle-hint-btn';
      btn.innerHTML = `${iconSvg('bulb', { size: 15 })}<span></span><small></small>`;
      btn.querySelector('span').textContent = used.length === 0 ? t('wikdleHint') : t('wikdleHintMore');
      btn.querySelector('small').textContent = t('wikdleHintCost', { n: wikdle.HINT_COST });
      press(btn, { sound: null });
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.classList.add('is-busy');
        synth.playTap();
        // Letters the board has already turned green are worth nothing as a
        // hint, so the hint skips them.
        const greens = new Set();
        for (const row of game.rows ?? []) row.marks?.forEach((m, i) => { if (m === 'hit') greens.add(i); });
        const hint = await wikdle.fetchHint(wikdle.wordForDay(game.day), used.length,
          { greens: [...greens], hints: used });
        if (game.status !== 'playing') return;
        if (!hint) { btn.disabled = false; btn.classList.remove('is-busy'); toast(esc(t('wikdleHintNone')), 'error'); synth.playDenied(); return; }
        game = wikdle.takeHint(game, hint);
        synth.playReveal?.();
        paintHints();
      });
      hints.appendChild(btn);
    } else if (game.status === 'playing' && used.length < wikdle.HINTS_MAX) {
      const note = document.createElement('p');
      note.className = 'wikdle-hint-note';
      note.textContent = t('wikdleHintAfter');
      hints.appendChild(note);
    }
  };

  const paintDone = () => {
    if (game.status === 'playing') { done.hidden = true; return; }
    const stats = wikdle.loadStats();
    const won = game.status === 'won';
    const word = wikdle.wordForDay(game.day);
    const points = wikdle.wikdlePoints(game);
    const base = wikdle.basePoints(game);
    const hintsUsed = game.hints?.length ?? 0;
    const bonus = won ? wikdle.streakBonus(stats.streak) : 0;
    const max = Math.max(1, ...stats.guesses);
    const tiles = [
      ['calendar', stats.played, t('wikdlePlayed')],
      ['target', `${stats.played ? Math.round(100 * stats.won / stats.played) : 0}%`, t('wikdleWinRate')],
      ['flame', stats.streak, t('wikdleStreak')],
      ['trophy', stats.best, t('wikdleBest')]
    ];
    done.innerHTML = `
      <div class="wikdle-verdict"><span class="wikdle-verdict-icon">${iconSvg(won ? 'trophy' : 'grid', { size: 26 })}</span><b></b></div>
      <p class="wikdle-answer"><span></span><a class="wikdle-read" target="_blank" rel="noopener"></a></p>
      <div class="wikdle-breakdown" ${won ? '' : 'hidden'}>
        <div><span></span><b class="tabular">${base}</b></div>
        <div ${hintsUsed ? '' : 'hidden'}><span></span><b class="tabular">−${hintsUsed * wikdle.HINT_COST}</b></div>
        <div ${bonus > 0 ? '' : 'hidden'}><span></span><b class="tabular">+${Math.round(bonus * 100)}%</b></div>
        <div class="is-total"><span></span><b class="tabular">${points}</b></div>
      </div>
      <div class="wikdle-stats">${tiles.map(([icon, n, label]) => `<div class="wikdle-stat"><span class="wikdle-stat-icon">${iconSvg(icon, { size: 16 })}</span><b class="tabular">${esc(String(n))}</b><span>${esc(label)}</span></div>`).join('')}</div>
      <div class="wikdle-bars">${stats.guesses.map((n, i) => `<div class="wikdle-bar${won && i === game.rows.length - 1 ? ' is-today' : ''}"><span>${i + 1}</span><i style="width:${Math.max(6, Math.round(100 * n / max))}%"><em>${n}</em></i></div>`).join('')}</div>
      <p class="wikdle-next"><span class="wikdle-next-icon">${iconSvg('hourglass', { size: 14 })}</span><span data-next></span></p>`;
    done.querySelector('.wikdle-verdict b').textContent = won ? t('wikdleWon', { n: game.rows.length, points }) : t('wikdleLost');
    done.querySelector('.wikdle-answer span').textContent = t('wikdleAnswer', { word: word.toUpperCase() });
    const read = done.querySelector('.wikdle-read');
    read.href = wikdle.articleUrl(word);
    read.textContent = t('wikdleRead');
    const rows = done.querySelectorAll('.wikdle-breakdown > div');
    rows[0].querySelector('span').textContent = t('wikdlePointsBase', { n: game.rows.length });
    rows[1].querySelector('span').textContent = t('wikdleHintsUsed', { n: hintsUsed });
    rows[2].querySelector('span').textContent = t('wikdleStreakBonus', { n: stats.streak });
    rows[3].querySelector('span').textContent = t('wikdlePointsTotal');
    const share = document.createElement('button');
    share.type = 'button';
    share.className = 'btn btn-ghost btn-sm wikdle-share';
    share.innerHTML = `${iconSvg('share', { size: 15 })}<span></span>`;
    share.querySelector('span').textContent = t('wikdleShare');
    press(share, { sound: null });
    share.addEventListener('click', async () => { synth.playTap(); const ok = await copyText(wikdle.shareText(game)); toast(ok ? t('wikdleCopied') : t('wikdleCopyFailed'), ok ? 'ok' : 'error'); });
    done.appendChild(share);
    const tick = () => { const next = done.querySelector('[data-next]'); if (next) next.textContent = t('wikdleNext', { time: formatCountdown(wikdle.msToNextDay()) }); };
    tick();
    clearInterval(state.wikdleTimer);
    state.wikdleTimer = setInterval(() => { if (state.tab !== 'wikdle') { clearInterval(state.wikdleTimer); return; } tick(); }, 1000);
    done.hidden = false;
    hints.hidden = true;
  };

  const settle = () => {
    // The finished board is worth points, once: on the day's board, into the
    // quests, the wallet and, signed in, the leaderboard. A streak pays a
    // bonus on the coins; a fast solve and every seventh day of a streak
    // hand over a booster on top.
    if (game.status === 'playing' || game.settled) return;
    game.settled = true;
    const points = wikdle.wikdlePoints(game);
    const stats = wikdle.loadStats();
    reportQuest('wikdle', { won: game.status === 'won', guesses: game.rows.length });
    if (points > 0) {
      reportQuest('points', { amount: points, game: 'wikdle' });
      // A solved board pays close to its points, not half of them: one a day,
      // won with thought, against a slot machine that pays out on every spin.
      const coins = Math.round(points * 0.9 * (1 + wikdle.streakBonus(stats.streak)));
      store.saveWallet(store.loadWallet() + coins);
      refreshWallet();
      toast(esc(t('wikdlePaid', { amount: coins })), 'ok');
      if (game.rows.length <= wikdle.FAST_SOLVE_ROWS) {
        gainBooster({ kind: 'open', themeId: null, rarityId: 'rare', cards: 1 }, 1);
        toast(esc(t('wikdleBoosterFast', { n: game.rows.length })), 'ok');
      }
      if (stats.streak > 0 && stats.streak % wikdle.STREAK_BOOSTER_EVERY === 0) {
        gainBooster({ kind: 'open', themeId: null, rarityId: 'uncommon', cards: 3 }, 1);
        toast(esc(t('wikdleBoosterStreak', { n: stats.streak })), 'ok');
      }
      if (signedIn()) leaderboard.submitWikdle(points, game.day).catch(() => { /* the board can miss one */ });
    }
  };

  const press_ = (key) => {
    if (game.status !== 'playing') return;
    if (key === 'enter') {
      const result = wikdle.playGuess(game, typed);
      if (result.error) {
        status.textContent = result.error === 'short' ? t('wikdleTooShort') : result.error === 'unknown' ? t('wikdleNotAWord') : '';
        status.classList.add('is-error');
        const row = grid.querySelector(`[data-row="${game.rows.length}"]`);
        row?.classList.add('is-shake');
        setTimeout(() => row?.classList.remove('is-shake'), 400);
        synth.playDenied();
        return;
      }
      game = result;
      typed = '';
      status.textContent = '';
      status.classList.remove('is-error');
      synth.playFlip?.() ?? synth.playTap();
      paintGrid(game.rows.length - 1);
      paintKeys();
      paintHints();
      if (game.status !== 'playing') {
        settle();
        setTimeout(() => {
          paintGrid(-1, true);
          paintDone();
          if (game.status === 'won') { confettiOver(stage, game.rows.length <= 2 ? 160 : 90); if (game.rows.length <= 2) synth.playFanfare?.(); else synth.playResolved?.(); }
          else synth.playDenied();
        }, 900);
      }
      return;
    }
    if (key === 'back') { typed = typed.slice(0, -1); paintGrid(); return; }
    if (/^[a-z]$/.test(key) && typed.length < wikdle.COLUMNS) { typed += key; synth.playTap(); paintGrid(); }
  };

  // A hardware keyboard works too.
  state.wikdleKeys?.abort?.();
  state.wikdleKeys = new AbortController();
  document.addEventListener('keydown', (event) => {
    if (state.tab !== 'wikdle' || event.metaKey || event.ctrlKey) return;
    const k = event.key.toLowerCase();
    if (k === 'enter') press_('enter'); else if (k === 'backspace') press_('back'); else if (/^[a-z]$/.test(k)) press_(k);
  }, { signal: state.wikdleKeys.signal });

  paintGrid();
  paintKeys();
  paintHints();
  paintDone();
  status.textContent = game.status === 'playing' ? t('wikdleIntro') : '';
}
