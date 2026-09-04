/* daily: split out of main.js */

import { t, tx } from '../i18n.js';
import { rarityById } from '../data/rarities.js';
import { WEEK, canClaim, claim as claimDaily, loyaltyPct, msUntilNextUtcDay, nextIndex as nextGiftIndex, streakAlive, utcDayNumber, weekLadder } from '../daily.js';
import { buckSvg, iconSvg } from '../data/icons.js';
import * as store from '../collection.js';
import { press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import { formatCountdown } from '../shop.js';
import { oddsRows } from '../data/odds.js';
import { reportQuest } from './arcade.js';
import { esc, money, openSheet, refreshWallet, state, toast } from './core.js';
import { pushNote } from './drawer.js';
import { live } from './live.js';
import { fireFlash, gainBooster, spawnBurst } from './open.js';
import { renderPacks } from './packs.js';
import { updateBadges } from './regalia.js';

/* --- daily gift -------------------------------------------------------------------------------------------- */

/** What a gift is, in words: coins, a booster, or both. */

export function giftLabel(gift) {
  const bits = [];
  if (gift.coins) bits.push(money(gift.coins));
  if (gift.spec) {
    bits.push(esc(gift.spec.rarityId
      ? t('giftBoosterTier', { tier: tx(rarityById(gift.spec.rarityId).name) })
      : t('giftBoosterN', { n: gift.spec.cards })));
  }
  return bits.join(' + ');
}
/** One rung of the week, as a tile. */

export function giftTile(rung, status) {
  const tile = document.createElement('div');
  const kind = rung.spec && rung.coins ? 'both' : rung.spec ? 'booster' : 'coins';
  tile.className = `daily-tile is-${status} is-${kind}${rung.day === WEEK ? ' is-big' : ''}`;
  tile.innerHTML = `
    <span class="daily-tile-day"></span>
    <span class="daily-tile-art"></span>
    <span class="daily-tile-val tabular"></span>`;
  tile.querySelector('.daily-tile-day').textContent = t('dailyDayShort', { n: rung.day });
  const art = tile.querySelector('.daily-tile-art');
  if (status === 'claimed') art.innerHTML = iconSvg('check', { size: 15 });
  else if (kind === 'coins') art.innerHTML = buckSvg({ size: 14 });
  else art.innerHTML = iconSvg('packs', { size: 15 });
  const val = tile.querySelector('.daily-tile-val');
  if (kind === 'coins') val.textContent = rung.coins.toLocaleString();
  else if (kind === 'booster') val.textContent = rung.spec.rarityId ? tx(rarityById(rung.spec.rarityId).name) : t('dailyCardsN', { n: rung.spec.cards });
  else val.textContent = `${rung.coins.toLocaleString()} +`;
  tile.title = giftLabel(rung).replace(/<[^>]+>/g, '');
  return tile;
}

export function openDaily({ auto = false } = {}) {
  // Auto-opening happens once a day. Dismissing without claiming leaves the
  // gift waiting and the badge lit, without the dialog reappearing every time
  // the app is reopened.
  if (auto) {
    const today = utcDayNumber();
    if (state.profile.daily.shownDay === today) return;
    state.profile.daily.shownDay = today;
    store.saveProfile(state.profile);
  }
  openSheet(t('dailyTitle'), buildDailyBody, { onClose: () => { clearInterval(state.dailyTimer); state.dailyTimer = null; } });
}
/**
 * The sheet: the present, the seven rungs of the week, and the world clock.
 * Everything here is UTC: the gift turns over at 00:00 UTC, the moment the
 * quests and the leaderboard do, and the footer says so.
 */

export function buildDailyBody(body) {
  const daily = state.profile.daily;
  const ladder = weekLadder(daily.weeks);
  const ready = canClaim(daily);
  const next = nextGiftIndex(daily);
  // A week just completed shows all seven taken until tomorrow's clock.
  const taken = ready ? next : (daily.day === 0 ? WEEK : daily.day);
  const broken = ready && daily.lastDay != null && !streakAlive(daily);
  const today = ladder[next];

  body.innerHTML = `
    <div class="daily">
      <div class="daily-hero${ready ? ' is-ready' : ''}">
        <button class="present" type="button" data-claim aria-label="">
          <span class="present-glow" aria-hidden="true"></span>
          <span class="present-lid" aria-hidden="true"></span>
          <span class="present-box" aria-hidden="true">
            <span class="present-ribbon-v"></span>
          </span>
        </button>
        <div class="daily-copy">
          <b data-headline></b>
          <span data-status></span>
          <span class="daily-note" data-note hidden></span>
        </div>
      </div>
      <div class="daily-week" data-week></div>
      <div class="daily-foot">
        <span data-week-n></span>
        <span class="tabular" data-reset></span>
      </div>
    </div>`;

  const headline = body.querySelector('[data-headline]');
  const status = body.querySelector('[data-status]');
  const note = body.querySelector('[data-note]');
  const present = body.querySelector('.present');
  if (ready) {
    headline.textContent = t('dailyTapToOpen');
    status.innerHTML = `${t('dailyDayOf', { n: today.day, of: WEEK })} · ${giftLabel(today.gift ?? today)}`;
    if (broken) { note.hidden = false; note.textContent = t('dailyStreakBroken'); }
    present.setAttribute('aria-label', t('dailyClaim'));
    press(present, { sound: null });
    present.addEventListener('click', () => {
      if (present.classList.contains('is-opening')) return;
      synth.resume();
      present.classList.add('is-opening');
      // The lid pops, the reward bursts out, then the sheet repaints claimed.
      const rect = present.getBoundingClientRect();
      spawnBurst({ shapes: ['star4', 'orb'], colors: ['#fbbf24', '#f8fafc', '#f472b6'],
        count: 22, spread: 1.15, gravity: 0.3 },
        { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.35 }, { scale: 0.9 });
      fireFlash(0.25, '#fbbf24');
      setTimeout(() => claimGift(body), 420);
    }, { once: true });
  } else {
    headline.textContent = taken === WEEK ? t('dailyWeekDone') : t('dailyClaimed');
    status.textContent = t('dailyDayOf', { n: taken, of: WEEK });
  }

  body.querySelector('[data-week]').replaceChildren(...ladder.map((rung, i) => giftTile(
    rung,
    i < taken ? 'claimed' : i === next && ready ? 'ready' : i === (ready ? next : taken % WEEK) ? 'next' : 'locked'
  )));

  const weekLine = body.querySelector('[data-week-n]');
  const pct = loyaltyPct(daily.weeks);
  weekLine.textContent = t('dailyWeekN', { n: (daily.weeks ?? 0) + 1 }) + (pct ? ` · ${t('dailyLoyalty', { pct })}` : '');
  const reset = body.querySelector('[data-reset]');
  const tick = () => { reset.textContent = t('dailyResetsUtc', { time: formatCountdown(msUntilNextUtcDay()) }); };
  tick();
  clearInterval(state.dailyTimer);
  state.dailyTimer = setInterval(() => {
    if (!live.sheet.open) { clearInterval(state.dailyTimer); return; }
    if (msUntilNextUtcDay() < 1000 && !canClaim(daily)) { buildDailyBody(body); return; }
    tick();
  }, 1000);
}

export function grantGift(gift) {
  if (gift.coins) {
    store.saveWallet(store.loadWallet() + gift.coins);
    refreshWallet();
  }
  if (gift.spec) {
    gainBooster({ ...gift.spec }, 1);
    renderPacks();
  }
  synth.playGift();
}

export function claimGift(body) {
  const got = claimDaily(state.profile.daily);
  if (!got) return;
  store.saveProfile(state.profile);
  grantGift(got.gift);
  reportQuest('daily');
  toast(t('dailyGot', { reward: giftLabel(got.gift) }), 'ok');
  if (got.weekDone) pushNote('gift', t('dailyWeekDoneNote'), 'packs');
  buildDailyBody(body);
  updateBadges();
}
/* --- wallet and odds ------------------------------------------------------------------------------------------ */

export function openWallet() {
  openSheet(t('walletTitle'), (body) => {
    body.innerHTML = `
      <p style="font-size:2rem;font-weight:800;color:var(--positive);display:flex;align-items:baseline;gap:3px;margin-bottom:8px" data-balance></p>
      <p style="margin-bottom:16px" data-what></p>
      <div class="row"><div class="row-copy"><h4 data-earn-t></h4><p data-earn></p></div></div>
      <div class="row"><div class="row-copy"><h4 data-spend-t></h4><p data-spend></p></div></div>
      <p class="muted" style="font-size:.78rem;line-height:1.55;margin-top:16px" data-note></p>`;
    body.querySelector('[data-balance]').innerHTML = money(state.wallet);
    body.querySelector('[data-what]').textContent = t('walletWhat');
    body.querySelector('[data-earn-t]').textContent = t('walletEarnTitle');
    body.querySelector('[data-earn]').textContent = t('walletEarn');
    body.querySelector('[data-spend-t]').textContent = t('walletSpendTitle');
    body.querySelector('[data-spend]').textContent = t('walletSpend');
    body.querySelector('[data-note]').textContent = t('walletNote');
  });
}
/**
 * The pull rates, for the booster in front of the player rather than in the
 * abstract: the odds sheet shows the row that booster actually rolls on, next
 * to what each rarity means in readership. A tier booster's row is visibly
 * better than the basic one, which is the whole point of paying for it.
 */

export function openOdds(rarityId = null) {
  openSheet(t('pullRates'), (body) => {
    body.innerHTML = `
      <p style="margin-bottom:12px" data-note></p>
      <p style="margin-bottom:16px" data-row></p>
      <table class="odds-table">
        <thead><tr><th></th><th></th></tr></thead>
        <tbody></tbody>
      </table>`;
    body.querySelector('[data-note]').textContent = t('oddsNote');
    const rowNote = body.querySelector('[data-row]');
    rowNote.textContent = rarityId
      ? t('oddsRowTier', { rarity: tx(rarityById(rarityId).name) })
      : t('oddsRowBasic');
    const [h1, h2] = body.querySelectorAll('th');
    h1.textContent = t('rarity');
    h2.textContent = t('oddsChance');
    body.querySelector('tbody').replaceChildren(...oddsRows(rarityId).map(({ rarity, pct }) => {
      const row = document.createElement('tr');
      row.innerHTML = `<td><span class="odds-name"><span class="odds-swatch"></span><span></span></span></td><td class="odds-pct tabular"></td>`;
      const swatch = row.querySelector('.odds-swatch');
      swatch.style.color = rarity.color;
      swatch.style.background = rarity.color;
      const label = row.querySelector('.odds-name span:last-child');
      label.textContent = tx(rarity.name);
      label.style.color = rarity.color;
      const cells = row.querySelectorAll('.odds-pct');
      // Below a tenth of a percent, a rounded number reads as zero and looks
      // like the tier cannot happen at all.
      cells[0].textContent = pct >= 0.1 ? `${pct}%` : '< 0.1%';
      return row;
    }));
  });
}
