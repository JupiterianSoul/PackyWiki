/* binder: split out of main.js */

import { t, tx } from '../i18n.js';
import { renderPacks } from './packs.js';
import { reportQuest } from './arcade.js';
import { updateBadges } from './regalia.js';
import { gainBooster } from './open.js';
import { specName } from '../booster.js';
import * as store from '../collection.js';
import { ALBUM_TIERS, CARDS_PER_PAGE, albumHasTiers, albumKeyOf, albumTierBooster, albumTierNeed, albumTiersClaimed, albumTiersReached, buildAlbums, fetchAlbumTotal } from '../albums.js';
import { h } from '../ui/dom.js';
import { iconSvg } from '../data/icons.js';
import { Segmented, dur, press, reveal } from '../ui/components.js';
import { RARITIES, rarityById } from '../data/rarities.js';
import { emblemSvg, monogramSvg } from '../data/emblems.js';
import { synth } from '../ui/sound.js';
import { POPULARITY_BANDS, formatAmount } from '../pricing.js';
import { compactCount, el, esc, money, openSheet, refreshWallet, state, toast } from './core.js';
import { buildStaticCard } from './detail.js';
import { live } from './live.js';

/* --- binder ------------------------------------------------------------------------------------------ */

export function option(value, label) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  return opt;
}

export function activeFilterCount() {
  const f = state.filters;
  return [f.search, f.pack, f.rarity, f.band, f.minPrice].filter(Boolean).length
    + (f.favoritesOnly ? 1 : 0) + (f.sort !== 'recent' ? 1 : 0);
}
/*
 * The collection is a shelf of albums. renderBinder paints whichever of the
 * two views is live: the shelf, or one open book.
 */

export function renderBinder() {
  if (state.album) return renderAlbum();

  el.binderTitle.textContent = t('tabCollection');
  el.albumView.hidden = true;
  el.binderStats.hidden = false;
  el.binderSegWrap.hidden = false;

  const entries = store.allEntries(state.collection);
  const stats = store.collectionStats(entries.filter((e) => !e.special));
  const albums = buildAlbums(entries, state.customPacks);
  // Nobody completes an album against a real category, so the shelf reports
  // how many books are open instead of how many are finished.
  const started = albums.filter((a) => a.unlocked).length;

  el.binderStats.innerHTML = `
    <span class="stat-pill"><b>${stats.copies}</b> ${t('copies')}</span>
    <span class="stat-pill"><b>${money(stats.value)}</b> ${t('total')}</span>
    <span class="stat-pill"><b>${started}</b> ${t('albumsStarted')}</span>`;

  el.binderEmpty.hidden = entries.length > 0;
  if (!entries.length) {
    el.binderEmptyMark.innerHTML = iconSvg('collection', { size: 46 });
    el.binderEmptyText.textContent = t('emptyCollection');
  }

  if (!live.binderSeg) {
    live.binderSeg = new Segmented(el.binderSeg, [
      { id: 'albums', label: t('viewAlbums') },
      { id: 'classic', label: t('viewClassic') }
    ], (view) => {
      state.binderView = view;
      store.saveBinderView(view);
      renderBinder();
    });
    live.binderSeg.select(state.binderView, { silent: true });
  }

  const classic = state.binderView === 'classic';
  el.albumShelf.hidden = classic;
  el.classicView.hidden = !classic;
  el.binderTools.hidden = !classic || !entries.length;
  if (classic) return renderClassic(entries, albums);

  el.albumShelf.replaceChildren(...albums.map(buildAlbumCover));
  reveal(el.albumShelf.children, { step: 22, from: 10 });
  refreshAlbumTotals(albums.filter((a) => a.unlocked));
}
/*
 * THE CLASSIC VIEW
 * ----------------------------------------------------------------------------
 * Every card at once, for when you want to see the whole collection rather
 * than one category's book: grouped by category in shelf order, and inside
 * each group sorted from the rarest card down. The filters are the same ones
 * the albums use, so switching view keeps whatever you had narrowed down.
 */

export function renderClassic(entries, albums) {
  el.classicFilter.textContent = t('filters');
  // The search field is the classic view's own: the sheet's field and this
  // one read and write the same filter, so neither ever contradicts the other.
  if (!el.classicSearch.dataset.bound) {
    el.classicSearch.dataset.bound = '1';
    el.classicSearchMark.innerHTML = iconSvg('search', { size: 15 });
    el.classicSearch.addEventListener('input', () => {
      state.filters.search = el.classicSearch.value;
      renderBinder();
    });
  }
  el.classicSearch.placeholder = t('searchTitles');
  el.classicSearch.setAttribute('aria-label', t('searchTitles'));
  if (el.classicSearch.value !== state.filters.search) el.classicSearch.value = state.filters.search;
  const active = activeFilterCount();
  el.classicFilterCount.textContent = String(active);
  el.classicFilterCount.hidden = !active;

  // The filter sheet's own sort is respected inside each category; rarity is
  // the default because a classic binder is read from the best card down.
  const visible = store.filterEntries(entries, state.filters);
  el.classicCount.textContent = t('classicShowing', { n: visible.length });

  const sections = classicSections(visible, albums, (entry) =>
    buildStaticCard(entry, rarityById(entry.rarityId), entry.key));

  if (!sections.length) {
    const empty = document.createElement('p');
    empty.className = 'muted classic-empty';
    empty.textContent = t('noMatches');
    sections.push(empty);
  }
  el.classicView.replaceChildren(...sections);
  reveal(el.classicView.children, { step: 40 });
}
/**
 * The classic view's groups: one section per album in shelf order, each card
 * built by the caller (yours open your binder's detail, a friend's open a
 * read-only one). Copies are counted on the card.
 */

export function classicSections(visible, albums, cardFor) {
  const byAlbum = new Map();
  for (const entry of visible) {
    const key = albumKeyOf(entry);
    if (!byAlbum.has(key)) byAlbum.set(key, []);
    byAlbum.get(key).push(entry);
  }

  const sections = [];
  for (const album of albums) {
    const group = byAlbum.get(album.key);
    if (!group?.length) continue;
    const section = document.createElement('section');
    section.className = 'classic-group';
    section.style.setProperty('--accent', album.style.accent);
    section.innerHTML = `
      <div class="classic-group-head">
        <span class="classic-group-mark" aria-hidden="true"></span>
        <h3></h3><span class="classic-group-n tabular"></span>
      </div>
      <div class="classic-grid"></div>`;
    const emblem = album.style.emblem?.kind === 'monogram'
      ? monogramSvg(album.style.emblem.letter, album.style.emblem.spin, { size: 24 })
      : emblemSvg(album.style.emblem?.id ?? 'open', { size: 24 });
    const mark = section.querySelector('.classic-group-mark');
    mark.innerHTML = emblem;
    mark.style.setProperty('--e1', `color-mix(in srgb, ${album.style.accent} 55%, #ffffff)`);
    mark.style.setProperty('--e2', album.style.accent);
    mark.style.setProperty('--e3', album.style.accent2);
    section.querySelector('h3').textContent = album.name;
    section.querySelector('.classic-group-n').textContent = String(group.length);

    section.querySelector('.classic-grid').replaceChildren(...group.map((entry) => {
      const card = cardFor(entry);
      card.classList.add('is-mini');
      if ((entry.count ?? 1) > 1) {
        const badge = document.createElement('span');
        badge.className = 'copy-badge';
        badge.textContent = `\u00d7${entry.count}`;
        card.appendChild(badge);
      }
      return card;
    }));
    sections.push(section);
  }
  return sections;
}
/**
 * Real category sizes arrive from the network after the shelf has painted.
 * Fetch whatever is missing or stale, then repaint once, if the player is
 * still looking at the collection.
 */

export function refreshAlbumTotals(albums) {
  if (!albums.length) return;
  const before = albums.map((a) => `${a.key}:${a.total}`).join('|');
  Promise.all(albums.map((album) => fetchAlbumTotal(album))).then(() => {
    if (state.tab !== 'binder') return;
    const after = albums.map((a) => `${a.key}:${knownTotalOf(a)}`).join('|');
    if (after !== before) renderBinder();
  });
}

export function knownTotalOf(album) {
  const fresh = buildAlbums(store.allEntries(state.collection), state.customPacks)
    .find((a) => a.key === album.key);
  return fresh?.total ?? null;
}

export function buildAlbumCover(album) {
  const cover = document.createElement('button');
  cover.type = 'button';
  cover.className = `album-cover${album.unlocked ? '' : ' is-locked'}${album.complete ? ' is-complete' : ''}`;
  cover.dataset.family = album.style.family ?? 'roundel';
  cover.style.setProperty('--accent', album.style.accent);
  cover.style.setProperty('--accent2', album.style.accent2);
  const emblem = album.style.emblem?.kind === 'monogram'
    ? monogramSvg(album.style.emblem.letter, album.style.emblem.spin, { size: 54 })
    : emblemSvg(album.style.emblem?.id ?? 'open', { size: 54 });
  cover.innerHTML = `
    <span class="album-spine" aria-hidden="true"></span>
    <span class="album-cover-emblem" aria-hidden="true">${emblem}</span>
    <b class="album-cover-name"></b>
    <span class="album-cover-count tabular"></span>
    <span class="album-cover-bar"><i></i></span>
    ${album.complete ? `<span class="album-cover-done">${iconSvg('spark', { size: 13 })}</span>` : ''}
    ${albumTiersReached(album) ? `<span class="album-cover-medal" data-tier="${ALBUM_TIERS[albumTiersReached(album) - 1].id}" aria-hidden="true"></span>` : ''}`;
  cover.querySelector('.album-cover-name').textContent = album.name;
  cover.querySelector('.album-cover-count').textContent =
    album.unlocked ? `${album.owned}/${album.total == null ? '?' : compactCount(album.total)}` : t('albumLocked');
  cover.querySelector('.album-cover-bar i').style.width =
    `${album.total ? Math.min(100, (album.owned / album.total) * 100) : 0}%`;
  press(cover, { sound: null });
  cover.addEventListener('click', () => {
    if (!album.unlocked) { toast(t('albumLockedHint', { name: album.name }), 'error'); return; }
    synth.playSheet(true);
    state.album = { key: album.key, spread: 0 };
    renderBinder();
  });
  return cover;
}
/* --- one open album ------------------------------------------------------- */

export function currentAlbum() {
  const entries = store.allEntries(state.collection);
  return buildAlbums(entries, state.customPacks).find((a) => a.key === state.album?.key) ?? null;
}

export function renderAlbum() {
  const album = currentAlbum();
  if (!album) { state.album = null; return renderBinder(); }

  el.albumShelf.hidden = true;
  el.binderStats.hidden = true;
  el.binderEmpty.hidden = true;
  el.albumView.hidden = false;
  el.binderTitle.textContent = t('tabCollection');

  el.albumBack.innerHTML = iconSvg('chevronLeft', { size: 18 });
  el.albumName.textContent = album.name;
  el.albumProgress.textContent = `${album.owned}/${album.total == null ? '?' : compactCount(album.total)}`
    + (album.complete ? ` · ${t('albumComplete')}` : '');
  if (album.total == null) refreshAlbumTotals([album]);
  paintAlbumTiers(album);
  el.filterOpen.textContent = t('filters');
  const active = activeFilterCount();
  el.filterCount.textContent = String(active);
  el.filterCount.hidden = !active;

  // The book takes the album's palette so every album reads as its own book.
  el.albumBook.style.setProperty('--accent', album.style.accent);
  el.albumBook.style.setProperty('--accent2', album.style.accent2);

  const visible = album.kind === 'code'
    // A special album shows every one of its cards, whatever the binder's
    // filters say (a rarity, a band or a search set elsewhere must not empty
    // it), in the order the booster dealt them: the things, then The Creator.
    ? [...album.entries].sort((a, b) => (a.creator ? 1 : 0) - (b.creator ? 1 : 0) || (a.firstPulledAt ?? 0) - (b.firstPulledAt ?? 0))
    : store.filterEntries(album.entries, { ...state.filters, pack: '' });
  const pages = Math.max(pageCount(album, visible.length), 1);
  const page = Math.min(state.album.spread, pages - 1);
  state.album.spread = page;

  fillAlbumPage(el.pageSlots, visible, page * CARDS_PER_PAGE, album);
  el.pageno.textContent = String(page + 1);

  if (pages <= 12) {
    el.albumDots.replaceChildren(...Array.from({ length: pages }, (_, i) => {
      const dot = document.createElement('span');
      dot.className = `album-dot${i === page ? ' is-on' : ''}`;
      return dot;
    }));
  } else {
    const counter = document.createElement('span');
    counter.className = 'album-dot-count tabular';
    counter.textContent = `${page + 1} / ${pages}`;
    el.albumDots.replaceChildren(counter);
  }
  el.albumHint.textContent = t('albumSwipeHint');
}

export function fillAlbumPage(node, entries, offset, album) {
  const slots = [];
  for (let i = 0; i < CARDS_PER_PAGE; i++) {
    const entry = entries[offset + i];
    if (entry) {
      const card = buildStaticCard(entry, rarityById(entry.rarityId), entry.key);
      card.classList.add('is-mini');
      if (entry.count > 1) {
        const badge = document.createElement('span');
        badge.className = 'copy-badge';
        badge.textContent = `×${entry.count}`;
        card.appendChild(badge);
      }
      slots.push(card);
    } else {
      const empty = document.createElement('div');
      empty.className = 'album-slot-empty';
      empty.innerHTML = `<span class="tabular">${offset + i + 1}</span>`;
      slots.push(empty);
    }
  }
  node.replaceChildren(...slots);
}
/** How many pages this album's book holds, given what the filters let through. */

export function pageCount(album, visibleCount) {
  const filled = Math.max(1, Math.ceil(visibleCount / CARDS_PER_PAGE));
  // One blank page at the back says there is more of this category out there,
  // unless you have actually finished it.
  return album.complete ? filled : filled + 1;
}
/** Turn the page: the leaf folds away at the spine, then the next one opens. */

export function turnAlbumPage(dir) {
  const album = currentAlbum();
  if (!album || state.albumTurning) return;
  const visible = album.kind === 'code'
    // A special album shows every one of its cards, whatever the binder's
    // filters say (a rarity, a band or a search set elsewhere must not empty
    // it), in the order the booster dealt them: the things, then The Creator.
    ? [...album.entries].sort((a, b) => (a.creator ? 1 : 0) - (b.creator ? 1 : 0) || (a.firstPulledAt ?? 0) - (b.firstPulledAt ?? 0))
    : store.filterEntries(album.entries, { ...state.filters, pack: '' });
  const pages = Math.max(pageCount(album, visible.length), 1);
  const next = state.album.spread + dir;
  if (next < 0 || next >= pages) {
    // The cover thuds: there is nothing further.
    el.albumBook.classList.remove('turn-bump-l', 'turn-bump-r');
    void el.albumBook.offsetWidth;
    el.albumBook.classList.add(dir > 0 ? 'turn-bump-r' : 'turn-bump-l');
    return;
  }
  state.albumTurning = true;
  synth.playPageTurn();
  const leaf = el.albumLeaf;
  leaf.classList.add(dir > 0 ? 'is-folding-r' : 'is-folding-l');
  setTimeout(() => {
    state.album.spread = next;
    renderAlbum();
    leaf.classList.remove('is-folding-r', 'is-folding-l');
    leaf.classList.add(dir > 0 ? 'is-unfolding-r' : 'is-unfolding-l');
    setTimeout(() => {
      leaf.classList.remove('is-unfolding-r', 'is-unfolding-l');
      state.albumTurning = false;
    }, dur(240));
  }, dur(230));
}

export function openFilters() {
  openSheet(t('filters'), (body) => {
    const entries = store.allEntries(state.collection);
    // Categories, in shelf order, and only the ones actually owned: a filter
    // that offers you empty categories is a filter that wastes a tap.
    const packs = buildAlbums(entries, state.customPacks)
      .filter((album) => album.owned > 0)
      .map((album) => [album.key, album.name]);

    const wrap = document.createElement('div');
    wrap.className = 'filters';
    wrap.innerHTML = `
      <input class="filter-input" type="search" data-key="search" />
      <div class="filter-row">
        <select class="filter-select" data-key="pack"></select>
        <select class="filter-select" data-key="rarity"></select>
      </div>
      <div class="filter-row">
        <select class="filter-select" data-key="band"></select>
        <select class="filter-select" data-key="minPrice"></select>
      </div>
      <select class="filter-select" data-key="sort"></select>
      <div style="display:flex;gap:10px;flex-wrap:wrap;padding-top:4px">
        <button class="chip" type="button" data-fav></button>
        <button class="btn btn-ghost btn-sm" type="button" data-reset></button>
      </div>`;

    const search = wrap.querySelector('[data-key="search"]');
    search.placeholder = t('searchTitles');
    search.value = state.filters.search;

    const sel = (key) => wrap.querySelector(`[data-key="${key}"]`);
    sel('pack').replaceChildren(option('', t('allPacks')), ...packs.map(([id, name]) => option(id, name ?? id)));
    sel('rarity').replaceChildren(option('', t('allRarities')), ...RARITIES.map((r) => option(r.id, tx(r.name))));
    sel('band').replaceChildren(option('', t('anyPopularity')), ...POPULARITY_BANDS.map((b) => option(b.id, b.name)));
    sel('minPrice').replaceChildren(option('', t('anyPrice')),
      ...[100, 500, 1500, 5000, 12000].map((p) => option(String(p), t('priceOver', { amount: formatAmount(p) }))));
    sel('sort').replaceChildren(...store.SORTS.map((s) => option(s.id, store.sortLabel(s))));
    ['pack', 'rarity', 'band', 'minPrice', 'sort'].forEach((key) => { sel(key).value = state.filters[key]; });

    const apply = () => { renderBinder(); paintFav(); };
    // Both views read the same filters, so both repaint from one place.
    wrap.querySelectorAll('select').forEach((node) => {
      node.addEventListener('change', (e) => { state.filters[e.target.dataset.key] = e.target.value; apply(); });
    });
    search.addEventListener('input', (e) => { state.filters.search = e.target.value; apply(); });

    const fav = wrap.querySelector('[data-fav]');
    const paintFav = () => {
      fav.classList.toggle('is-on', state.filters.favoritesOnly);
      fav.innerHTML = `${iconSvg(state.filters.favoritesOnly ? 'starFilled' : 'star', { size: 14 })}<span>${t('favourites')}</span>`;
      el.filterCount.textContent = String(activeFilterCount());
      el.filterCount.hidden = !activeFilterCount();
    };
    paintFav();
    fav.addEventListener('click', () => {
      state.filters.favoritesOnly = !state.filters.favoritesOnly;
      synth.playTap();
      apply();
    });

    const resetBtn = wrap.querySelector('[data-reset]');
    resetBtn.textContent = t('reset');
    press(resetBtn, { sound: null });
    resetBtn.addEventListener('click', () => {
      state.filters = { search: '', pack: '', rarity: '', band: '', minPrice: '', sort: 'rarity', favoritesOnly: false };
      live.sheet.hide();
      renderBinder();
    });

    body.appendChild(wrap);
  });
}

/* --- the medals ---------------------------------------------------------------------

 * Four rungs per album (see ALBUM_TIERS): what each asks, which are reached,
 * which are claimed. The strip sits under the album's count; a reached rung
 * not yet claimed is the one button on it.
 */

export function paintAlbumTiers(album) {
  let strip = el.albumView.querySelector('.album-tiers');
  if (!albumHasTiers(album)) { strip?.remove(); return; }
  if (!strip) {
    strip = h('div.album-tiers');
    el.albumProgress.after(strip);
  }
  const reached = albumTiersReached(album);
  const claimed = albumTiersClaimed(state.profile, album);
  strip.replaceChildren(...ALBUM_TIERS.map((tier, i) => {
    const state_ = i < claimed ? 'claimed' : i < reached ? 'ready' : 'locked';
    const need = albumTierNeed(album, tier);
    const chip = h('div.album-tier', { dataset: { tier: tier.id, state: state_ }, title: t(`albumTier_${tier.id}`) }, [
      h('span.album-tier-disc', { 'aria-hidden': 'true' }),
      h('b', t(`albumTier_${tier.id}`)),
      h('span.album-tier-need.tabular', state_ === 'locked' ? t('albumTierNeed', { n: need }) : t(state_ === 'claimed' ? 'albumTierClaimed' : 'albumTierReached'))
    ]);
    if (state_ === 'ready' && i === claimed) {
      const btn = h('button.btn.btn-sm.btn-primary.album-tier-claim', { type: 'button' }, t('albumTierClaim'));
      press(btn, { sound: null });
      btn.addEventListener('click', () => claimAlbumTier(album, i));
      chip.appendChild(btn);
    }
    return chip;
  }));
}

/** Pays the rung: coins, and from silver up a booster of the subject. */
export function claimAlbumTier(album, index) {
  const tier = ALBUM_TIERS[index];
  if (!tier || albumTiersClaimed(state.profile, album) !== index || albumTiersReached(album) <= index) return;
  state.profile.albumTiers = { ...(state.profile.albumTiers ?? {}), [album.key]: index + 1 };
  store.saveProfile(state.profile);
  store.saveWallet(store.loadWallet() + tier.coins);
  refreshWallet();
  const spec = albumTierBooster(album, tier);
  if (spec) gainBooster(spec);
  const reward = spec ? `${money(tier.coins)} + ${esc(specName(spec))}` : money(tier.coins);
  toast(t('albumTierWon', { tier: t(`albumTier_${tier.id}`), album: esc(album.name), reward }), 'ok');
  synth.playCoins();
  updateBadges();
  reportQuest('albumTier');
  paintAlbumTiers(album);
  renderPacks();
}
