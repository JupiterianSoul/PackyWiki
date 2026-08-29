/**
 * ICON SET
 * ----------------------------------------------------------------------------
 * Hand-drawn 24x24 line icons, stored as raw SVG inner markup. These replace
 * the emoji the packs used to ship with: emoji render differently on every
 * platform and can't inherit the pack's accent colour, while these are drawn
 * with `currentColor` and scale cleanly onto the booster art.
 *
 * All markup here is authored in this file — never interpolated from remote
 * data — so injecting it with innerHTML is safe.
 */

const ICONS = {
  /* --- pack themes --- */
  cars: `
    <path d="M3.2 16.4h17.6v-3a2 2 0 0 0-.5-1.3l-2.1-2.7a2.2 2.2 0 0 0-1.7-.8H7.5a2.2 2.2 0 0 0-1.7.8l-2.1 2.7a2 2 0 0 0-.5 1.3z"/>
    <path d="M4.2 16.4v2a1 1 0 0 0 1 1h1.4a1 1 0 0 0 1-1v-2M16.4 16.4v2a1 1 0 0 0 1 1h1.4a1 1 0 0 0 1-1v-2"/>
    <path d="M6.6 13.4h2.2M15.2 13.4h2.2"/>`,

  f1: `
    <path d="M20.2 13.4A8.2 8.2 0 1 0 12 20.4h4.9a3.3 3.3 0 0 0 3.3-3.3z"/>
    <path d="M6.4 13.2a6.2 6.2 0 0 1 2-3.6h6.3a6.2 6.2 0 0 1 2.5 3.6z"/>
    <path d="M12 20.4v-3.9"/>`,

  planes: `
    <path d="M12 3.2c1 0 1.7 1 1.7 2.7v3.2l7.2 4.2v2l-7.2-2.2v3.6l2.4 1.8v1.6L12 18.9l-4.1 1.2v-1.6l2.4-1.8v-3.6L3.1 15.3v-2l7.2-4.2V5.9C10.3 4.2 11 3.2 12 3.2z"/>`,

  'video-games': `
    <path d="M7 8.2h10a4.6 4.6 0 0 1 4.5 5.5l-.8 4a2.7 2.7 0 0 1-4.2.9L14.8 16H9.2l-1.7 2.6a2.7 2.7 0 0 1-4.2-.9l-.8-4A4.6 4.6 0 0 1 7 8.2z"/>
    <path d="M7.4 11.2v2.6M6.1 12.5h2.6"/>
    <circle cx="15.4" cy="11.8" r="1"/><circle cx="17.6" cy="13.6" r="1"/>`,

  books: `
    <path d="M12 6.9S10.2 5.1 6.8 5.1H3.6v13.2h3.2c3.1 0 5.2 1.6 5.2 1.6"/>
    <path d="M12 6.9s1.8-1.8 5.2-1.8h3.2v13.2h-3.2c-3.1 0-5.2 1.6-5.2 1.6"/>
    <path d="M12 6.9v13"/>`,

  movies: `
    <rect x="3" y="5.6" width="18" height="12.8" rx="2"/>
    <path d="M8.2 5.6v12.8M15.8 5.6v12.8M3 12h18M3 8.8h5.2M3 15.2h5.2M15.8 8.8H21M15.8 15.2H21"/>`,

  space: `
    <circle cx="12.6" cy="11.4" r="5.6"/>
    <path d="M7.1 15.9c-2.7 1.3-4.8 1.6-5.4.4-.7-1.5 2.3-4.4 6.7-6.7s8.5-3.1 9.2-1.7c.4.9-.6 2.4-2.4 4"/>`,

  physics: `
    <circle cx="12" cy="12" r="1.9"/>
    <ellipse cx="12" cy="12" rx="9" ry="3.7"/>
    <ellipse cx="12" cy="12" rx="9" ry="3.7" transform="rotate(60 12 12)"/>
    <ellipse cx="12" cy="12" rx="9" ry="3.7" transform="rotate(120 12 12)"/>`,

  nature: `
    <path d="M2.4 19.2h19.2L14.8 7.6l-3.3 5.2-2.1-3.1z"/>
    <circle cx="17.6" cy="6.4" r="2.3"/>`,

  animals: `
    <ellipse cx="6.9" cy="9.6" rx="1.9" ry="2.5"/>
    <ellipse cx="12" cy="7.9" rx="2" ry="2.7"/>
    <ellipse cx="17.1" cy="9.6" rx="1.9" ry="2.5"/>
    <path d="M12 12.5c3.2 0 5.5 2.1 5.5 4.3 0 1.7-1.4 2.9-3.1 2.9-1 0-1.6-.4-2.4-.4s-1.4.4-2.4.4c-1.7 0-3.1-1.2-3.1-2.9 0-2.2 2.3-4.3 5.5-4.3z"/>`,

  plants: `
    <path d="M12 20.4v-7.3"/>
    <path d="M12 13.1c0-3.1 2.3-5.5 5.5-5.5 0 3.2-2.4 5.5-5.5 5.5z"/>
    <path d="M12 15.6c0-2.7-2-4.7-4.7-4.7 0 2.8 2.1 4.7 4.7 4.7z"/>
    <path d="M9.8 20.4h4.4"/>`,

  history: `
    <path d="M3.4 20.4h17.2"/>
    <path d="M4.8 8.6h14.4L12 4z"/>
    <path d="M6.6 20.4V9.7M12 20.4V9.7M17.4 20.4V9.7"/>`,

  philosophy: `
    <circle cx="12" cy="12" r="8.6"/>
    <path d="M12 8.1a3.9 3.9 0 1 1-3.9 3.9c0-1.3 1.1-2.4 2.4-2.4s2.4 1.1 2.4 2.4-1.1 2.4-2.4 2.4"/>`,

  celebrities: `
    <path d="M12 4.1 14.06 9.67 19.99 9.9 15.33 13.58 16.94 19.3 12 16 7.06 19.3 8.67 13.58 4.01 9.9 9.94 9.67Z"/>`,

  quotes: `
    <path fill="currentColor" stroke="none" d="M9.9 6.4v4.3c0 3.5-1.8 5.9-5.1 7v-2.4c1.7-.7 2.6-1.9 2.7-3.5H4.2V6.4zM19.9 6.4v4.3c0 3.5-1.8 5.9-5.1 7v-2.4c1.7-.7 2.6-1.9 2.7-3.5h-3.4V6.4z"/>`,

  art: `
    <path d="M12 3.4c-5 0-9 3.8-9 8.5s4 8.5 9 8.5c.9 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.2-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7h1.9c3 0 5.5-2.4 5.5-5.4 0-4-4.4-6-10-6z"/>
    <circle cx="7.3" cy="11.6" r="1.1"/><circle cx="10.4" cy="7.9" r="1.1"/><circle cx="15.1" cy="8.3" r="1.1"/>`,

  cactus: `
    <path stroke-width="2.4" d="M12 20.2V6.6"/>
    <path stroke-width="2.4" d="M12 13.9H9.4a1.6 1.6 0 0 1-1.6-1.6V9.9"/>
    <path stroke-width="2.4" d="M12 11.5h2.6a1.6 1.6 0 0 0 1.6-1.6V8.3"/>
    <path d="M9.6 20.4h4.8"/>`,

  sport: `
    <path d="M7.9 4.4h8.2v5.1a4.1 4.1 0 0 1-8.2 0z"/>
    <path d="M7.9 6.1H5.8a2.6 2.6 0 0 0 2.6 2.6M16.1 6.1h2.1a2.6 2.6 0 0 1-2.6 2.6"/>
    <path d="M12 13.6v3.3M9.7 16.9h4.6l.7 3.5H9z"/>`,

  /* --- structural --- */
  gem: `
    <path d="M7.4 4.4h9.2L21 9.5 12 20.1 3 9.5z"/>
    <path d="M3 9.5h18M9.2 9.5 12 20.1l2.8-10.6M7.4 4.4l1.8 5.1M16.6 4.4l-1.8 5.1"/>`,
  wand: `
    <path d="M4 20 15.2 8.8"/>
    <path d="M16.8 3.4 17.7 6l2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z"/>
    <path d="M7.4 4.2l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6z"/>`,
  collection: `
    <rect x="3.2" y="4.4" width="7.4" height="7.4" rx="1.5"/>
    <rect x="13.4" y="4.4" width="7.4" height="7.4" rx="1.5"/>
    <rect x="3.2" y="13.6" width="7.4" height="6" rx="1.5"/>
    <rect x="13.4" y="13.6" width="7.4" height="6" rx="1.5"/>`,
  packs: `
    <path d="M4.4 7.6 12 4l7.6 3.6v9L12 20.2 4.4 16.6z"/>
    <path d="M4.4 7.6 12 11.2l7.6-3.6M12 11.2v9"/>`,
  star: `
    <path d="M12 4.1 14.06 9.67 19.99 9.9 15.33 13.58 16.94 19.3 12 16 7.06 19.3 8.67 13.58 4.01 9.9 9.94 9.67Z"/>`,
  starFilled: `
    <path fill="currentColor" d="M12 4.1 14.06 9.67 19.99 9.9 15.33 13.58 16.94 19.3 12 16 7.06 19.3 8.67 13.58 4.01 9.9 9.94 9.67Z"/>`,
  close: `<path d="M6 6l12 12M18 6 6 18"/>`,
  filter: `<path d="M3.6 5.6h16.8L14 13.2v5.4l-4 1.8v-7.2z"/>`
};

/**
 * The PackyWiki mark used on the booster art itself — a card with a star,
 * matching the Android launcher icon.
 */
export const LOGO_MARK = `
  <g transform="rotate(-12 32 32)">
    <rect x="14" y="8" width="36" height="48" rx="6" fill="none" stroke="currentColor" stroke-width="3" opacity="0.5"/>
  </g>
  <g transform="rotate(5 32 32)">
    <rect x="14" y="8" width="36" height="48" rx="6" fill="none" stroke="currentColor" stroke-width="3"/>
    <path fill="currentColor" stroke="none"
      d="M32 18 35.4 27.3 45.3 27.7 37.5 33.8 40.2 43.3 32 37.8 23.8 43.3 26.5 33.8 18.7 27.7 28.6 27.3Z"/>
  </g>`;

/**
 * The Buckarooz mark: a B with two bars running through it, top and bottom,
 * the way a dollar sign wears its strokes. Drawn rather than borrowed — no
 * Unicode currency character is this shape without being another currency.
 */
export function buckSvg({ size = 13, className = '' } = {}) {
  return `<svg class="buck ${className}" viewBox="0 0 16 19" height="${size}"
    width="${(size * 16) / 19}" aria-hidden="true" focusable="false">
    <path fill="currentColor" fill-rule="evenodd" d="M3.6 3.2H9c2 0 3.3 1.2 3.3 3 0 1.2-.6 2.1-1.6 2.6 1.3.4 2.2 1.5 2.2 3.1 0 2.1-1.5 3.4-3.9 3.4H3.6zM6.2 5.4V8h2.4c.9 0 1.4-.5 1.4-1.3s-.5-1.3-1.4-1.3zm0 4.8v2.9h2.7c1 0 1.6-.6 1.6-1.5s-.6-1.4-1.6-1.4z"/>
    <path stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M7 1v16.6M10.1 1v16.6"/>
  </svg>`;
}

export const hasIcon = (id) => Object.prototype.hasOwnProperty.call(ICONS, id);

/**
 * An <svg> string for the given icon id. `size` is in px; the icon inherits
 * colour from its parent via currentColor.
 */
export function iconSvg(id, { size = 24, className = '' } = {}) {
  const body = ICONS[id] ?? ICONS.packs;
  return `<svg class="icon ${className}" viewBox="0 0 24 24" width="${size}" height="${size}"
    fill="none" stroke="currentColor" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** The big logo lockup drawn on the booster wrapper. */
export function logoSvg({ size = 64, className = '' } = {}) {
  return `<svg class="logo-mark ${className}" viewBox="0 0 64 64" width="${size}" height="${size}"
    aria-hidden="true">${LOGO_MARK}</svg>`;
}
