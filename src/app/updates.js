/* updates: split out of main.js */

import { t, tx } from '../i18n.js';
import { RELEASES } from '../data/releases.js';
import { iconSvg } from '../data/icons.js';
import { press, reveal } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import { el, openSheet } from './core.js';

/* --- the updates timeline ------------------------------------------------------------------------- */

/**
 * Every release since the first, newest on top, no dates: the order is the
 * story. Content lives in src/data/releases.js, bilingual.
 */
/**
 * What a release is called on the timeline: its own name, always, with its
 * number beside it so the order reads at a glance however long the list
 * grows. "Update 20" is a counter, never a title.
 */

export function releaseTitle(release) {
  return (tx(release.title));
}

export function releaseNumber(release) {
  return (RELEASES.indexOf(release) + 1);
}

export function renderUpdates() {
  el.updatesTitle.textContent = t('tabUpdates');
  el.updatesSub.textContent = t('updatesIntro');
  const list = [...RELEASES].reverse();
  el.updatesList.replaceChildren(...list.map((release, i) => {
    const item = document.createElement('div');
    item.className = 'tl-item';
    item.style.setProperty('--tl', release.accent);
    item.innerHTML = `
      <span class="tl-node">${iconSvg(release.icon, { size: 16 })}</span>
      <div class="tl-head"><span class="tl-count tabular"></span>${i === 0 ? '<span class="tl-latest"></span>' : ''}</div>
      <h3 class="tl-title"></h3>
      <ul class="tl-points"></ul>`;
    item.querySelector('.tl-count').textContent = t('updatesCount', { n: releaseNumber(release) });
    item.querySelector('.tl-title').textContent = releaseTitle(release);
    if (i === 0) item.querySelector('.tl-latest').textContent = t('updatesLatest');
    item.querySelector('.tl-points').replaceChildren(...release.points.map((point) => {
      const li = document.createElement('li');
      li.textContent = tx(point);
      return li;
    }));
    if (release.changelog?.length) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'btn btn-ghost btn-sm tl-more';
      more.textContent = t('updatesChangelog');
      press(more, { sound: null });
      more.addEventListener('click', () => { synth.playTap(); openChangelog(release); });
      item.appendChild(more);
    }
    return item;
  }));
  reveal(el.updatesList.children, { step: 50 });
}
/** Everything that release changed, in one sheet. */

export function openChangelog(release) {
  openSheet(`${t('updatesCount', { n: releaseNumber(release) })} · ${releaseTitle(release)}`, (body) => {
    const list = document.createElement('ul');
    list.className = 'tl-points is-full';
    list.replaceChildren(...release.changelog.map((line) => {
      const li = document.createElement('li');
      li.textContent = tx(line);
      return li;
    }));
    body.appendChild(list);
  });
}
