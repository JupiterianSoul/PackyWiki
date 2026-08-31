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
import { specId, specBaseName, specTierName } from './booster.js';
import { rarityById } from './data/rarities.js';
import { emblemSvg, monogramSvg } from './data/emblems.js';
import { t } from './i18n.js';

export function buildPackElement(spec, { interactive = false, size = '' } = {}) {
  const style = styleForSpec(spec);
  const booster = document.createElement('div');
  booster.className = `booster ${size}`.trim();
  booster.dataset.spec = specId(spec);
  booster.dataset.family = style.family ?? 'roundel';
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

  // The face artwork is the app's own: the category's drawn emblem, or a
  // custom pack's faceted monogram. No photographs on packs.
  const emblem = style.emblem?.kind === 'monogram'
    ? monogramSvg(style.emblem.letter, style.emblem.spin)
    : emblemSvg(style.emblem?.id ?? 'open');

  booster.innerHTML = `
    <div class="booster-body">
      <div class="booster-foil" aria-hidden="true"></div>
      <div class="booster-face">
        <div class="booster-emblem" aria-hidden="true">
          <div class="emblem-deco"></div>
          <div class="emblem-art">${emblem}</div>
        </div>
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
        <div class="rip-zone" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>` : ''}
    </div>`;

  booster.querySelector('.booster-name').textContent = specBaseName(spec);
  booster.querySelector('.booster-count').textContent = `${spec.cards} ${t('cards')}`;
  // A tiered pack wears its subject at the top and its tier at the bottom.
  const tier = specTierName(spec);
  if (tier) {
    const el = document.createElement('span');
    el.className = 'booster-tier';
    el.textContent = tier;
    booster.querySelector('.booster-face').appendChild(el);
  }
  return booster;
}

/**
 * The back of a card from this pack. Every category's cards wear their own
 * back: the pack's family construction, palette, foil pattern and emblem,
 * scaled down to card size — so a face-down card already says where it came
 * from, without giving anything about the pull away.
 */
export function buildCardBack(spec) {
  const style = styleForSpec(spec);
  const emblem = style.emblem?.kind === 'monogram'
    ? monogramSvg(style.emblem.letter, style.emblem.spin)
    : emblemSvg(style.emblem?.id ?? 'open');

  const back = document.createElement('div');
  back.className = 'card-face card-back';
  back.dataset.family = style.family ?? 'roundel';
  back.style.setProperty('--accent', style.accent);
  back.style.setProperty('--accent2', style.accent2);
  back.style.setProperty('--foil', style.foil);
  back.innerHTML = `
    <div class="cb-foil" aria-hidden="true"></div>
    <div class="cb-deco" aria-hidden="true"></div>
    <div class="cb-emblem" aria-hidden="true">${emblem}</div>
    <div class="cb-word" aria-hidden="true">WIKLODO</div>
    <div class="cb-frame" aria-hidden="true"></div>`;
  return back;
}
