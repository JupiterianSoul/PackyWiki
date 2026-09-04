/* cardindex: split out of main.js */

import { RARITIES, rarityById, rarityOfCard } from '../data/rarities.js';
import { synth } from '../ui/sound.js';
import { t, tx } from '../i18n.js';
import * as account from '../account.js';
import { press } from '../ui/components.js';
import { iconSvg } from '../data/icons.js';
import { THEME_PACKS } from '../data/packs.js';
import { emblemSvg } from '../data/emblems.js';
import { specName, specTagline } from '../booster.js';
import { el, esc, state } from './core.js';
import { buildStaticCard, openCardDetail, refreshWishes } from './detail.js';
import { describeError, signedIn } from './gate.js';

/* --- the card index: everything anyone has found ------------------------------------------
 * The shared codex, browsable: search, tier filters, three sorts, and the
 * wishlist view. Cards here are knowledge, not property - the Owned tag is
 * what separates the two at a glance.
 */

export const INDEX_SORTS = ['recent', 'name', 'value'];

export function codexCardData(row) {
  const lang = row.lang ?? String(row.key).split(':')[0] ?? 'en';
  const title = String(row.key).split(':').slice(1).join(':');
  return {
    key: row.key, title: row.title, rarityId: row.rarity, price: row.price ?? 0,
    views: row.views ?? null, thumbnail: row.thumbnail, lang,
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    description: '', extract: ''
  };
}

export function indexTile(row) {
  const data = codexCardData(row);
  const rarity = rarityOfCard(data);
  const card = buildStaticCard(data, rarity, null, { fav: false, ownedTag: true });
  card.addEventListener('click', () => { synth.playTap(); openCardDetail(data.key, data, rarity, { fromIndex: true }); });
  return card;
}

export function renderCardIndex() {
  const ci = state.cardIndex;
  el.indexTitle.textContent = t('tabIndex');
  el.indexIntro.textContent = t('indexIntro');
  el.indexSearch.placeholder = t('marketSearch');
  el.indexSearch.value = ci.search;

  if (!account.configured || !signedIn()) {
    el.indexStatus.textContent = account.configured ? t('marketSignIn') : t('marketOffline');
    el.indexStatus.className = 'find-status';
    el.indexCounts.replaceChildren();
    el.indexList.replaceChildren();
    el.indexMore.hidden = true;
    return;
  }
  el.indexStatus.textContent = '';

  if (!el.indexSearch.dataset.bound) {
    el.indexSearch.dataset.bound = '1';
    let debounce = null;
    el.indexSearch.addEventListener('input', () => {
      ci.search = el.indexSearch.value;
      clearTimeout(debounce);
      debounce = setTimeout(() => loadIndexPage(true), 280);
    });
    el.indexMore.addEventListener('click', () => { synth.playTap(); loadIndexPage(false); });
    press(el.indexMore, { sound: null });
  }

  // The wishlist toggle leads the tier row; the tiers follow.
  const wishChip = document.createElement('button');
  wishChip.type = 'button';
  wishChip.className = `chip market-sort${ci.wishMode ? ' is-on' : ''}`;
  wishChip.innerHTML = `${iconSvg('wish', { size: 12 })}<span style="margin-left:5px">${esc(t('wishTitle'))}</span>`;
  press(wishChip, { sound: null });
  wishChip.addEventListener('click', () => {
    synth.playTap();
    ci.wishMode = !ci.wishMode;
    renderCardIndex();
  });
  el.indexRarities.replaceChildren(wishChip, ...[null, ...RARITIES.map((r) => r.id)].map((id) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip market-sort${!ci.wishMode && ci.rarity === id ? ' is-on' : ''}`;
    const rarity = id ? rarityById(id) : null;
    chip.textContent = rarity ? tx(rarity.name) : t('filterAll');
    if (rarity && !(ci.rarity === id)) chip.style.color = rarity.color;
    press(chip, { sound: null });
    chip.addEventListener('click', () => {
      synth.playTap();
      ci.wishMode = false;
      ci.rarity = id;
      renderCardIndex();
    });
    return chip;
  }));

  el.indexSorts.replaceChildren(...INDEX_SORTS.map((sort) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip market-sort${ci.sort === sort ? ' is-on' : ''}`;
    chip.textContent = t(`indexSort_${sort}`);
    press(chip, { sound: null });
    chip.addEventListener('click', () => {
      if (ci.sort === sort) return;
      synth.playTap();
      ci.sort = sort;
      renderCardIndex();
    });
    return chip;
  }));
  el.indexSorts.hidden = ci.wishMode;

  if (ci.wishMode) {
    el.indexCounts.replaceChildren(Object.assign(document.createElement('span'),
      { className: 'stat-pill',
        textContent: state.wishlist.size === 1
          ? t('wishCountOne')
          : t('wishCount', { n: state.wishlist.size }) }));
    const rows = [...state.wishlist.values()].map((card) => ({
      key: card.key, title: card.title, rarity: card.rarityId,
      price: card.price, views: card.views, thumbnail: card.thumbnail, lang: card.lang
    }));
    el.indexMore.hidden = true;
    if (!rows.length) {
      el.indexList.replaceChildren(Object.assign(document.createElement('p'),
        { className: 'empty-note', textContent: t('wishEmpty') }));
    } else {
      el.indexList.replaceChildren(...rows.map(indexTile));
    }
    refreshWishes().then(() => { if (state.tab === 'cardindex' && ci.wishMode) renderCardIndex(); });
    return;
  }

  paintIndexCounts();
  loadIndexPage(true);
}

export async function paintIndexCounts() {
  const ci = state.cardIndex;
  try {
    ci.counts = await account.codexCounts();
  } catch (error) {
    if (error?.message === 'INDEX_UNSET') {
      el.indexStatus.textContent = t('indexUnset');
      el.indexStatus.className = 'find-status is-error';
    }
    return;
  }
  if (state.tab !== 'cardindex') return;
  const pills = [Object.assign(document.createElement('span'),
    { className: 'stat-pill', innerHTML: `<b>${Number(ci.counts.total ?? 0).toLocaleString()}</b> ${esc(t('indexDiscovered'))}` })];
  for (const rarity of RARITIES) {
    const n = ci.counts.byRarity?.[rarity.id] ?? 0;
    if (!n) continue;
    const pill = document.createElement('span');
    pill.className = 'stat-pill';
    pill.innerHTML = `<b style="color:${rarity.color}">${Number(n).toLocaleString()}</b> ${esc(tx(rarity.name))}`;
    pills.push(pill);
  }
  el.indexCounts.replaceChildren(...pills);
}

export async function loadIndexPage(reset) {
  const ci = state.cardIndex;
  if (ci.busy) return;
  ci.busy = true;
  if (reset) { ci.page = 0; ci.rows = []; }
  const PAGE = 40;
  try {
    const rows = await account.codexPage({
      search: ci.search, rarity: ci.rarity, sort: ci.sort,
      offset: ci.page * PAGE, limit: PAGE
    });
    ci.rows = reset ? rows : [...ci.rows, ...rows];
    ci.more = rows.length === PAGE;
    ci.page += 1;
    if (state.tab === 'cardindex' && !ci.wishMode) {
      el.indexStatus.textContent = '';
      if (!ci.rows.length) {
        el.indexList.replaceChildren(Object.assign(document.createElement('p'),
          { className: 'empty-note', textContent: t('indexEmpty') }));
      } else {
        el.indexList.replaceChildren(...ci.rows.map(indexTile));
      }
      el.indexMore.hidden = !ci.more;
      el.indexMore.textContent = t('indexMore');
    }
  } catch (error) {
    el.indexStatus.textContent = error?.message === 'INDEX_UNSET' ? t('indexUnset') : describeError(error);
    el.indexStatus.className = 'find-status is-error';
  }
  ci.busy = false;
}
/* --- the glossary: every booster category, sealed --------------------------------------- */

export function renderGlossary() {
  el.glossaryTitle.textContent = t('tabGlossary');
  el.glossaryIntro.textContent = t('glossaryIntro');
  el.glossaryList.replaceChildren(...THEME_PACKS.map((theme) => {
    const spec = { kind: 'theme', themeId: theme.id, rarityId: null, cards: 5 };
    const row = document.createElement('div');
    row.className = 'glossary-row';
    row.style.setProperty('--ga', theme.accent);
    row.innerHTML = `
      <span class="glossary-mark">${emblemSvg(theme.id, { size: 34 })}</span>
      <span class="glossary-copy"><b></b><span></span></span>`;
    row.querySelector('b').textContent = specName(spec);
    row.querySelector('.glossary-copy span').textContent = specTagline(spec);
    return row;
  }));
}
