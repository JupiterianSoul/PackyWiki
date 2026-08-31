/**
 * PACK VIEW
 * ============================================================================
 * Builds the DOM for one Prism Foil booster. Pulled out of main.js so the
 * same element — the exact one the app opens — can be rendered by the dev
 * gallery (gallery.html) without dragging the whole controller in.
 *
 * The caller owns everything that needs the app around it: fetching the pack
 * photograph, remembering the rip direction, wiring the rip. This builds the
 * bag itself.
 */
import { styleForSpec } from './packstyle.js';
import { specId, specName, specIcon } from './booster.js';
import { rarityById } from './data/rarities.js';
import { iconSvg } from './data/icons.js';
import { t } from './i18n.js';

export function buildPackElement(spec, { interactive = false, size = '' } = {}) {
  const style = styleForSpec(spec);
  const booster = document.createElement('div');
  booster.className = `booster ${size}`.trim();
  booster.dataset.spec = specId(spec);
  booster.style.setProperty('--accent', style.accent);
  booster.style.setProperty('--accent2', style.accent2);
  booster.style.setProperty('--foil', style.foil);
  booster.style.setProperty('--holo', style.holo);

  if (spec.rarityId) {
    const rarity = rarityById(spec.rarityId);
    booster.dataset.rarity = rarity.id;
    booster.classList.add('is-lit');
    booster.style.setProperty('--rarity', rarity.color);
    booster.style.setProperty('--rarity-glow', rarity.glow);
  }

  booster.innerHTML = `
    <div class="booster-body">
      <div class="booster-foil" aria-hidden="true"></div>
      <div class="booster-face">
        <div class="booster-photo"></div>
        <span class="booster-name"></span>
        <span class="booster-count"></span>
      </div>
      <div class="booster-holo" aria-hidden="true"></div>
      ${interactive ? '<div class="booster-mouth" aria-hidden="true"></div>' : ''}
      <div class="booster-shine" aria-hidden="true"></div>
      <div class="booster-crimp is-top" aria-hidden="true"></div>
      <div class="booster-crimp is-bottom" aria-hidden="true"></div>
      ${interactive ? `
        <div class="booster-tear" aria-hidden="true"></div>
        <div class="rip-front" aria-hidden="true"></div>
        <div class="rip-zone" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="rip-line"></div>
          <div class="rip-grip is-left"></div>
          <div class="rip-grip is-right"></div>
        </div>` : ''}
    </div>`;

  booster.querySelector('.booster-name').textContent = specName(spec);
  booster.querySelector('.booster-count').textContent = `${spec.cards} ${t('cards')}`;
  // The subject icon stands in until (or in case) the photograph arrives.
  booster.querySelector('.booster-photo').innerHTML =
    `<div class="booster-photo-fallback">${iconSvg(specIcon(spec), { size: 44 })}</div>`;
  return booster;
}
