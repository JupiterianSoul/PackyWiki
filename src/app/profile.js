/* profile: split out of main.js */

import { MAX_LEVEL, levelFraction, rankFor, rewardForLevel, xpForLevel } from '../progression.js';
import { frameTier } from '../frames.js';
import { getLanguage, t, tx } from '../i18n.js';
import * as store from '../collection.js';
import { formatAmount } from '../pricing.js';
import { albumsDeep } from '../albums.js';
import { evaluate as evaluateAchievements } from '../achievements.js';
import * as account from '../account.js';
import { RARITIES } from '../data/rarities.js';
import { Bar } from '../ui/components.js';
import { el, state } from './core.js';
import { live } from './live.js';
import { rewardCard } from './open.js';
import { achFacts, frameStyle, paintFrameInto, renderBadges } from './regalia.js';

/* --- profile ------------------------------------------------------------------------------------------- */

export function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export function renderProfile() {
  const { progress, rarityCounts } = state.profile;
  const level = progress.level ?? 1;
  const rank = rankFor(level);
  const atMax = level >= MAX_LEVEL;

  live.profileRing.set(levelFraction(progress), String(level));
  paintFrameInto(el.profileRing, frameStyle(), frameTier(level));
  el.profileLevel.textContent = atMax ? t('profileMax') : t('profileLevel', { n: level });
  el.profileRank.textContent = tx(rank.name);
  live.xpBar.set(levelFraction(progress));
  el.xpLine.textContent = atMax ? t('profileMax') : t('profileXpLine', {
    have: (progress.xp ?? 0).toLocaleString(), need: xpForLevel(level).toLocaleString()
  });

  el.nextRewardLabel.textContent = t('profileNextReward');
  el.nextReward.replaceChildren(
    atMax ? document.createTextNode(t('profileMax'))
      : rewardCard(rewardForLevel(level + 1), { art: false })
  );

  renderBadges();

  el.statsLabel.textContent = t('profileStats');
  const entries = store.allEntries(state.collection);
  const pulled = Object.values(rarityCounts).reduce((sum, n) => sum + n, 0);

  const stats = [
    [t('statPlaytime'), formatDuration(state.profile.playMs ?? 0)],
    [t('statAccountAge'), new Date(state.profile.createdAt ?? Date.now())
      .toLocaleDateString(getLanguage(), { year: 'numeric', month: 'short', day: 'numeric' })],
    [t('statBoosters'), (state.profile.boostersOpened ?? 0).toLocaleString()],
    [t('statCards'), pulled.toLocaleString()],
    [t('statValue'), formatAmount(entries.reduce((sum, e) => sum + e.price * e.count, 0))],
    [t('statAlbums'), String(albumsDeep(entries, state.customPacks))],
    [t('statAchievements'), String(evaluateAchievements(achFacts(),
      state.profile.achievements?.redeemed ?? []).filter((a) => a.unlocked).length)],
    ...(account.configured ? [[t('statFriends'), String(state.social.friends.length)]] : [])
  ];
  el.statGrid.replaceChildren(...stats.map(([label, value]) => {
    const cell = document.createElement('div');
    cell.className = 'stat-cell';
    cell.innerHTML = '<b></b><span></span>';
    cell.querySelector('b').textContent = value;
    cell.querySelector('span').textContent = label;
    return cell;
  }));

  el.rarityLabel.textContent = t('statRarity');
  const peak = Math.max(1, ...RARITIES.map((r) => rarityCounts[r.id] ?? 0));
  el.rarityBars.replaceChildren(...RARITIES.map((rarity) => {
    const count = rarityCounts[rarity.id] ?? 0;
    const row = document.createElement('div');
    row.className = 'rarity-row';
    row.innerHTML = `<span class="rarity-name"></span><span class="rarity-track"></span><span class="rarity-count"></span>`;
    const name = row.querySelector('.rarity-name');
    name.textContent = tx(rarity.name);
    name.style.color = rarity.color;
    const bar = new Bar(row.querySelector('.rarity-track'));
    bar.set(count / peak, { animate: false });
    bar.fill.style.background = rarity.color;
    row.querySelector('.rarity-count').textContent = count.toLocaleString();
    return row;
  }));

}
