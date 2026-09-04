/* slots: split out of main.js */

import { t, tx } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import { BONUS_STOP_MS, REEL_EASE, REEL_STOP_MS, SPIN_COST, casinoOpen, spinSlots } from '../slots.js';
import { BONUS_SPINS, LINE_BETS, PAYLINES, PAYTABLE, REEL, SCATTER, SCATTER_MIN, SYMBOLS, WILD, symbolById, winTier } from '../data/slots.js';
import { press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import * as store from '../collection.js';
import { formatAmount } from '../pricing.js';
import { gameStage, houseError, reportQuest } from './arcade.js';
import { el, esc, money, refreshWallet, state, toast, wait } from './core.js';
import { showGate, signedIn } from './gate.js';

/* --- the slot machine ----------------------------------------------------------------------- */

/** A symbol's drawing, at a size. */

export function symbolSvg(sym, size = 40) {
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">${sym.art}</svg>`;
}
/**
 * Coins raining over the reels on a win. A short burst on a canvas laid over
 * the window: gold discs thrown up from the payline, falling under gravity,
 * spinning as they go. Bigger wins throw more. Reduced motion throws none.
 */

export function rainCoins(canvas, count) {
  if (!count || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(box.width * dpr);
  canvas.height = Math.round(box.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = box.width, H = box.height;
  const coins = Array.from({ length: count }, (_, i) => ({
    x: W * (0.2 + Math.random() * 0.6), y: H * 0.55,
    vx: (Math.random() - 0.5) * 9, vy: -7 - Math.random() * 9,
    r: 5 + Math.random() * 4, spin: Math.random() * Math.PI, vs: (Math.random() - 0.5) * 0.4,
    hue: 40 + (i % 3) * 6, delay: Math.random() * 220
  }));
  const start = performance.now();
  canvas.hidden = false;
  const frame = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const c of coins) {
      if (t < c.delay) { alive++; continue; }
      c.vy += 0.42; c.x += c.vx; c.y += c.vy; c.spin += c.vs;
      if (c.y - c.r > H + 4) continue;
      alive++;
      const squash = Math.abs(Math.cos(c.spin));
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(Math.max(0.18, squash), 1);
      ctx.beginPath();
      ctx.arc(0, 0, c.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${c.hue} 92% ${52 + squash * 14}%)`;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `hsl(${c.hue} 80% 30%)`;
      ctx.stroke();
      ctx.restore();
    }
    if (alive && t < 2600) requestAnimationFrame(frame);
    else { ctx.clearRect(0, 0, W, H); canvas.hidden = true; }
  };
  requestAnimationFrame(frame);
}

export function renderSlots() {
  el.slotsTitle.textContent = t('slotsTitle');
  el.slotsBack.innerHTML = iconSvg('chevronLeft', { size: 18 });
  const body = el.slotsBody;
  if (!casinoOpen(signedIn())) {
    body.replaceChildren(gameStage('reel', t('gameSignIn'), { label: t('gateSignIn'), run: () => showGate() }));
    return;
  }
  const machine = state.slots ??= { phase: 'idle', lineBet: LINE_BETS[1], last: null };
  machine.phase = 'idle';
  const CELL = 64;
  const COPIES = 3;

  const wrap = document.createElement('div');
  wrap.className = 'slots';

  // THE CABINET: a marquee of bulbs, the glass, the reels, and the pay line lamps.
  const cabinet = document.createElement('div');
  cabinet.className = 'slots-cabinet';
  const marquee = document.createElement('div');
  marquee.className = 'slots-marquee';
  marquee.innerHTML = `<span class="slots-bulbs" aria-hidden="true"></span><b></b><small></small><span class="slots-bulbs" aria-hidden="true"></span>`;
  marquee.querySelector('b').textContent = t('slotsTitle');
  marquee.querySelector('small').textContent = t('slotsMarquee', { x: PAYTABLE[WILD][3] });
  cabinet.appendChild(marquee);

  const glass = document.createElement('div');
  glass.className = 'slots-glass';
  const lampsL = document.createElement('div');
  lampsL.className = 'slots-lamps';
  const lampsR = document.createElement('div');
  lampsR.className = 'slots-lamps';
  for (const side of [lampsL, lampsR]) {
    side.replaceChildren(...PAYLINES.map((line, i) => {
      const lamp = document.createElement('span');
      lamp.className = 'slots-lamp';
      lamp.dataset.line = line.id;
      lamp.textContent = String(i + 1);
      return lamp;
    }));
  }
  const win = document.createElement('div');
  win.className = 'slots-window';
  win.style.height = `${CELL * 3}px`;
  const strips = [];
  for (let reel = 0; reel < 3; reel++) {
    const reelBox = document.createElement('div');
    reelBox.className = 'slots-reel';
    const strip = document.createElement('div');
    strip.className = 'slots-strip';
    const cells = [];
    for (let copy = 0; copy < COPIES; copy++) for (const id of REEL) cells.push(id);
    strip.replaceChildren(...cells.map((id) => {
      const cell = document.createElement('div');
      cell.className = `slots-cell is-${id}`;
      cell.style.height = `${CELL}px`;
      cell.innerHTML = symbolSvg(symbolById(id), 46);
      return cell;
    }));
    reelBox.appendChild(strip);
    win.appendChild(reelBox);
    strips.push({ box: reelBox, strip });
  }
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.setAttribute('class', 'slots-overlay');
  overlay.setAttribute('aria-hidden', 'true');
  win.appendChild(overlay);
  const coins = document.createElement('canvas');
  coins.className = 'slots-coins';
  coins.hidden = true;
  win.appendChild(coins);
  const banner = document.createElement('div');
  banner.className = 'slots-banner';
  banner.hidden = true;
  win.appendChild(banner);
  glass.append(lampsL, win, lampsR);
  cabinet.appendChild(glass);

  const result = document.createElement('p');
  result.className = 'slots-result';
  const bonusLine = document.createElement('div');
  bonusLine.className = 'slots-bonus';
  bonusLine.hidden = true;
  cabinet.append(result, bonusLine);
  wrap.appendChild(cabinet);

  // THE BETS and THE LEVER.
  const betRow = document.createElement('div');
  betRow.className = 'slots-betrow';
  const betLabel = document.createElement('span');
  betLabel.className = 'slots-betlabel';
  betLabel.textContent = t('slotsLineBet');
  const bets = document.createElement('div');
  bets.className = 'slots-bets';
  betRow.append(betLabel, bets);
  const lever = document.createElement('button');
  lever.type = 'button';
  lever.className = 'btn btn-primary slots-lever';
  press(lever, { sound: null });
  const paintBets = () => {
    bets.replaceChildren(...LINE_BETS.map((bet) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `slots-bet${machine.lineBet === bet ? ' is-on' : ''}`;
      btn.textContent = String(bet);
      btn.disabled = machine.phase !== 'idle';
      btn.addEventListener('click', () => { if (machine.phase !== 'idle') return; machine.lineBet = bet; synth.playTap(); paintBets(); });
      return btn;
    }));
    lever.innerHTML = `<span class="slots-lever-word">${esc(t('slotsSpin'))}</span><span class="slots-lever-cost">${money(SPIN_COST(machine.lineBet))}</span>`;
    lever.disabled = machine.phase !== 'idle';
    lever.classList.toggle('is-poor', SPIN_COST(machine.lineBet) > state.wallet);
  };
  wrap.append(betRow, lever);

  // THE BOOK: every symbol and what it pays, the wild and the bonus explained.
  const book = document.createElement('div');
  book.className = 'slots-book';
  const bookTitle = document.createElement('p');
  bookTitle.className = 'slots-book-title';
  bookTitle.textContent = t('slotsBookTitle');
  const bookGrid = document.createElement('div');
  bookGrid.className = 'slots-book-grid';
  bookGrid.replaceChildren(...SYMBOLS.filter((s) => PAYTABLE[s.id]).map((sym) => {
    const row = document.createElement('div');
    row.className = 'slots-book-row';
    const pays = Object.entries(PAYTABLE[sym.id]).map(([n, m]) => `<span><i>${n}×</i>${m}</span>`).join('');
    row.innerHTML = `${symbolSvg(sym, 30)}<b></b><span class="slots-book-pays tabular">${pays}</span>`;
    row.querySelector('b').textContent = tx(sym.name);
    return row;
  }));
  const notes = document.createElement('div');
  notes.className = 'slots-book-notes';
  const noteWild = document.createElement('p');
  noteWild.innerHTML = `${symbolSvg(symbolById(WILD), 22)}<span></span>`;
  noteWild.querySelector('span').textContent = t('slotsBookWild', { x: PAYTABLE[WILD][3] });
  const noteBonus = document.createElement('p');
  noteBonus.innerHTML = `${symbolSvg(symbolById(SCATTER), 22)}<span></span>`;
  noteBonus.querySelector('span').textContent = t('slotsBookBonus', { n: BONUS_SPINS, min: SCATTER_MIN });
  const noteHouse = document.createElement('p');
  noteHouse.className = 'game-closed';
  noteHouse.textContent = t('slotsBookNote', { lines: PAYLINES.length });
  notes.append(noteWild, noteBonus, noteHouse);
  book.append(bookTitle, bookGrid, notes);
  wrap.appendChild(book);
  body.replaceChildren(wrap);

  /* --- motion ------------------------------------------------------------- */

  // The strip's cell at `index` sits on the window's top row.
  const restAt = (stop) => -(stop + REEL.length) * CELL;
  const setStrip = (i, stop) => {
    const { strip, box } = strips[i];
    box.classList.remove('is-spinning');
    strip.style.transition = 'none';
    strip.style.transform = `translateY(${restAt(stop)}px)`;
  };
  const last = () => machine.last?.stops ?? [0, 0, 0];
  last().forEach((stop, i) => setStrip(i, stop));

  /** Roll every reel from where it is to the stops named, left to right. */
  const roll = (from, stops, durations) => new Promise((resolve) => {
    strips.forEach(({ strip, box }, i) => {
      // Jump one copy up (the same picture) so there is a whole strip to travel.
      strip.style.transition = 'none';
      strip.style.transform = `translateY(${-(from[i]) * CELL}px)`;
      box.classList.add('is-spinning');
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      strips.forEach(({ strip }, i) => {
        strip.style.transition = `transform ${durations[i]}ms ${REEL_EASE}`;
        strip.style.transform = `translateY(${-(stops[i] + 2 * REEL.length) * CELL}px)`;
      });
      durations.forEach((ms, i) => setTimeout(() => { strips[i].box.classList.remove('is-spinning'); strips[i].box.classList.add('is-landed'); synth.playSnap?.(); setTimeout(() => strips[i].box.classList.remove('is-landed'), 260); }, ms));
    }));
    setTimeout(() => {
      // Settle onto the middle copy, so the next roll has room again.
      stops.forEach((stop, i) => setStrip(i, stop));
      resolve();
    }, Math.max(...durations) + 80);
  });

  const cellCenter = (reel, row) => {
    const box = strips[reel].box.getBoundingClientRect();
    const frame = win.getBoundingClientRect();
    return { x: box.left - frame.left + box.width / 2, y: row * CELL + CELL / 2 };
  };
  const clearWins = () => {
    overlay.replaceChildren();
    win.querySelectorAll('.is-won').forEach((c) => c.classList.remove('is-won'));
    glass.querySelectorAll('.slots-lamp.is-on').forEach((l) => l.classList.remove('is-on'));
  };
  /** Light the cells and lamps of the lines that paid, and draw each line across the glass. */
  const showWins = (spun) => {
    clearWins();
    const frame = win.getBoundingClientRect();
    overlay.setAttribute('viewBox', `0 0 ${frame.width} ${frame.height}`);
    spun.lines.forEach((line, n) => {
      const pl = PAYLINES.find((p) => p.id === line.id);
      const color = symbolById(line.symbol)?.color ?? '#fbbf24';
      const points = [];
      pl.rows.forEach((row, reel) => {
        if (reel >= line.count) return;
        const cell = strips[reel].strip.children[spun.stops[reel] + REEL.length + row];
        if (cell) { cell.classList.add('is-won'); cell.style.setProperty('--won', color); }
        const c = cellCenter(reel, row);
        points.push(`${c.x.toFixed(1)},${c.y.toFixed(1)}`);
      });
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      path.setAttribute('points', points.join(' '));
      path.setAttribute('stroke', color);
      path.style.animationDelay = `${n * 120}ms`;
      overlay.appendChild(path);
      glass.querySelectorAll(`.slots-lamp[data-line="${line.id}"]`).forEach((l) => l.classList.add('is-on'));
    });
    // Bonus symbols glow wherever they landed when they opened the bonus.
    if (spun.bonus) spun.windows.forEach((column, reel) => column.forEach((id, row) => {
      if (id !== SCATTER) return;
      const cell = strips[reel].strip.children[spun.stops[reel] + REEL.length + row];
      if (cell) { cell.classList.add('is-won'); cell.style.setProperty('--won', symbolById(SCATTER).color); }
    }));
  };
  const showBanner = async (kind, text, ms) => {
    banner.className = `slots-banner is-${kind}`;
    banner.innerHTML = `<b></b><span></span>`;
    banner.querySelector('b').textContent = text.title;
    banner.querySelector('span').textContent = text.sub ?? '';
    banner.hidden = false;
    await wait(ms);
    banner.hidden = true;
  };
  const coinsFor = (tier) => ({ win: 14, big: 34, mega: 70, jackpot: 130 }[tier] ?? 0);
  const say = (text, tier) => {
    result.textContent = text;
    result.className = `slots-result${tier ? ` is-win is-${tier}` : ''}`;
  };

  /* --- the spin ------------------------------------------------------------ */

  const spin = async () => {
    if (machine.phase !== 'idle') return;
    const cost = SPIN_COST(machine.lineBet);
    if (state.wallet < cost) { synth.playDenied(); toast(t('cantAfford'), 'error'); lever.classList.add('is-poor'); return; }
    machine.phase = 'spinning';
    paintBets();
    say('', null);
    bonusLine.hidden = true;
    clearWins();
    store.saveWallet(state.wallet - cost);
    refreshWallet();
    synth.playArm?.();
    const from = last();
    // Ask the house while the reels are already turning: the answer is in
    // hand long before the first reel has to land.
    const asked = spinSlots(machine.lineBet);
    const rolled = roll(from, from, [700, 700, 700]).then(() => null);
    let spun;
    try {
      spun = await asked;
    } catch (error) {
      // The house did not answer: the coin comes back, nothing is shown.
      await rolled;
      store.saveWallet(store.loadWallet() + cost);
      refreshWallet();
      machine.phase = 'idle';
      paintBets();
      from.forEach((stop, i) => setStrip(i, stop));
      toast(esc(houseError(error)), 'error');
      synth.playDenied();
      return;
    }
    await rolled;
    machine.phase = 'settling';
    await roll(from, spun.stops, REEL_STOP_MS);
    machine.phase = 'paying';
    machine.last = spun;
    const tier = winTier(spun.total, cost);
    if (spun.total > 0) {
      store.saveWallet(store.loadWallet() + spun.total);
      refreshWallet();
      showWins(spun);
      say(t('slotsWon', { amount: formatAmount(spun.total) }), tier);
      rainCoins(coins, coinsFor(tier));
      synth.playCoins?.();
      if (tier === 'jackpot') { synth.playFanfare?.(); await showBanner('jackpot', { title: t('slotsJackpot'), sub: money(spun.total).replace(/<[^>]+>/g, '') }, 2200); }
      else if (tier === 'mega') { synth.playFanfare?.(); await showBanner('mega', { title: t('slotsMega'), sub: formatAmount(spun.total) }, 1700); }
      else if (tier === 'big') await showBanner('big', { title: t('slotsBig'), sub: formatAmount(spun.total) }, 1300);
    } else if (spun.bonus) {
      showWins(spun);
    } else {
      say(t('slotsLost'), null);
    }
    reportQuest('slots', { bet: cost, won: spun.grand > 0, lines: spun.lines, bonus: spun.bonus });

    // THE BONUS: the free spins the house already played, drawn one by one.
    if (spun.bonus) {
      machine.phase = 'bonus';
      synth.playFanfare?.();
      await showBanner('bonus', { title: t('slotsBonusOpen', { n: BONUS_SPINS }) }, 1800);
      bonusLine.hidden = false;
      // The free spins are paid as they land, from one exact sum: rounding
      // each half-coin on its own would pay a coin the book did not.
      const bank = store.loadWallet();
      let paid = 0;
      let at = spun.stops;
      for (let i = 0; i < spun.bonus.spins.length; i++) {
        const free = spun.bonus.spins[i];
        bonusLine.innerHTML = `<b></b><span class="tabular"></span>`;
        bonusLine.querySelector('b').textContent = t('slotsBonusRound', { i: i + 1, n: spun.bonus.spins.length });
        bonusLine.querySelector('span').innerHTML = money(paid);
        clearWins();
        await roll(at, free.stops, BONUS_STOP_MS);
        at = free.stops;
        if (free.total > 0) {
          paid += free.total;
          store.saveWallet(bank + paid);
          refreshWallet();
          showWins({ ...free, bonus: false });
          rainCoins(coins, 10);
          synth.playCoins?.();
          bonusLine.querySelector('span').innerHTML = money(paid);
          await wait(650);
        } else {
          await wait(220);
        }
      }
      machine.last = { ...spun, stops: at };
      bonusLine.querySelector('b').textContent = t('slotsBonusPaid', { amount: formatAmount(paid) });
      const bonusTier = winTier(paid, cost);
      say(t('slotsWon', { amount: formatAmount(spun.grand) }), bonusTier ?? tier);
      if (paid > 0) await showBanner(bonusTier === 'jackpot' || bonusTier === 'mega' ? 'mega' : 'big', { title: t('slotsBonusDone'), sub: formatAmount(paid) }, 1500);
    }
    if (spun.grand > 0) reportQuest('points', { amount: Math.round(spun.grand), game: 'slots' });
    await wait(300);
    machine.phase = 'idle';
    paintBets();
  };
  lever.addEventListener('click', spin);
  paintBets();
}
