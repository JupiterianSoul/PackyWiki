/**
 * ICON SET
 * ----------------------------------------------------------------------------
 * Hand-drawn 24x24 line icons, stored as raw SVG inner markup. These replace
 * the emoji the packs used to ship with: emoji render differently on every
 * platform and can't inherit the pack's accent colour, while these are drawn
 * with `currentColor` and scale cleanly onto the booster art.
 *
 * All markup here is authored in this file - never interpolated from remote
 * data - so injecting it with innerHTML is safe.
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

  music: `
    <path d="M9 18.4V6.2l8.4-2v12"/>
    <circle cx="6.6" cy="18.4" r="2.4"/>
    <circle cx="15" cy="16.2" r="2.4"/>
    <path d="M9 9.4l8.4-2"/>`,

  records: `
    <circle cx="12" cy="14.8" r="4.6"/>
    <path d="M9 11.2 5.8 4.2h4.4L12 8l1.8-3.8h4.4L15 11.2"/>
    <path d="M12 13.2l.7 1.4 1.6.2-1.2 1.1.3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1.1 1.6-.2z"/>`,

  food: `
    <path d="M4.6 9.8a7.4 7.4 0 0 1 14.8 0z"/>
    <path d="M8.6 6.9h.01M12 6.1h.01M15.4 6.9h.01"/>
    <path d="M4 12.8h16"/>
    <path d="M5.2 15.8h13.6a3 3 0 0 1-3 3H8.2a3 3 0 0 1-3-3z"/>`,

  geography: `
    <circle cx="12" cy="12" r="8.6"/>
    <path d="M3.4 12h17.2"/>
    <path d="M12 3.4a13.6 13.6 0 0 1 0 17.2M12 3.4a13.6 13.6 0 0 0 0 17.2"/>`,

  technology: `
    <rect x="7" y="7" width="10" height="10" rx="2"/>
    <path d="M9.6 7V4.2M14.4 7V4.2M9.6 19.8V17M14.4 19.8V17M7 9.6H4.2M7 14.4H4.2M19.8 9.6H17M19.8 14.4H17"/>
    <path d="M10.4 12h3.2"/>`,

  weapons: `
    <path d="M4.6 4.6 15.4 15.4M19.4 4.6 8.6 15.4"/>
    <path d="M13.2 17.6l4.4-4.4M6.4 13.2l4.4 4.4"/>
    <path d="M5 19l2-2M19 19l-2-2"/>`,

  weird: `
    <ellipse cx="12" cy="10.4" rx="8.6" ry="3.2"/>
    <path d="M8.2 8.6a4.2 4.2 0 0 1 7.6 0"/>
    <path d="M7 13.2 5.4 18.8M17 13.2l1.6 5.6M12 13.8v5"/>`,

  memes: `
    <circle cx="12" cy="12" r="8.6"/>
    <path d="M5.8 9.8h12.4"/>
    <path d="M6.8 9.8c0 1.9 1 3 2.5 3s2.5-1.1 2.5-3M12.2 9.8c0 1.9 1 3 2.5 3s2.5-1.1 2.5-3"/>
    <path d="M8.6 16.4c2.2 1.6 4.6 1.6 6.8 0"/>`,

  quiz: `
    <circle cx="12" cy="12" r="8.6"/>
    <path d="M9.5 9.4a2.6 2.6 0 1 1 3.7 2.4c-.8.4-1.2.9-1.2 1.7v.3"/>
    <path d="M12 16.6h.01"/>`,

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
  filter: `<path d="M3.6 5.6h16.8L14 13.2v5.4l-4 1.8v-7.2z"/>`,

  /* --- app furniture --- */
  clock: `
    <circle cx="12" cy="12" r="8.4"/>
    <path d="M12 7.2V12l3.2 1.9"/>`,
  gift: `
    <path d="M3.8 10.2h16.4v3H3.8z"/>
    <path d="M5.2 13.2h13.6v6.4H5.2z"/>
    <path d="M12 10.2v9.4"/>
    <path d="M12 10.2C10.6 7.4 9.4 6 8 6a2 2 0 0 0 0 4.2zM12 10.2C13.4 7.4 14.6 6 16 6a2 2 0 0 1 0 4.2z"/>`,
  settings: `
    <circle cx="12" cy="12" r="2.9"/>
    <path d="M12 3.4v2.2M12 18.4v2.2M20.6 12h-2.2M5.6 12H3.4M18.1 5.9l-1.6 1.6M7.5 16.5l-1.6 1.6M18.1 18.1l-1.6-1.6M7.5 7.5 5.9 5.9"/>`,
  profile: `
    <circle cx="12" cy="8.4" r="3.6"/>
    <path d="M4.8 19.6a7.2 7.2 0 0 1 14.4 0"/>`,
  check: `<path d="M5 12.6 9.6 17 19 7.4"/>`,
  lock: `
    <rect x="4.8" y="10.4" width="14.4" height="9.2" rx="2"/>
    <path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.6 0v2.6"/>`,
  spark: `
    <path d="M12 3.2 13.9 9.3 20 11.2 13.9 13.1 12 19.2 10.1 13.1 4 11.2 10.1 9.3z"/>`,
  chevron: `<path d="M9.5 5.5 16 12l-6.5 6.5"/>`,
  chat: `
    <path d="M4 6.4A2.4 2.4 0 0 1 6.4 4h11.2A2.4 2.4 0 0 1 20 6.4v7.2a2.4 2.4 0 0 1-2.4 2.4H9.8L5.6 19.6a1 1 0 0 1-1.6-.8z"/>
    <path d="M8 9h8M8 12h5.4"/>`,
  trade: `
    <path d="M4 8.2h13M13.6 4.6l3.6 3.6-3.6 3.6"/>
    <path d="M20 15.8H7M10.4 12.2 6.8 15.8l3.6 3.6"/>`,
  trophy: `
    <path d="M7 4.5h10v5.5a5 5 0 0 1-10 0z"/>
    <path d="M7 6H4.5a0 0 0 0 0 0 0c0 2.8 1.2 4.3 3 4.7M17 6h2.5c0 2.8-1.2 4.3-3 4.7"/>
    <path d="M12 15v3M9 20.5h6M10 18h4"/>`,
  trash: `
    <path d="M4.5 6.5h15"/><path d="M9.5 6.5v-2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/>
    <path d="M6.5 6.5 7.3 19a1.6 1.6 0 0 0 1.6 1.5h6.2a1.6 1.6 0 0 0 1.6-1.5l.8-12.5"/>
    <path d="M10 10.5v6.5M14 10.5v6.5"/>`,
  chevronLeft: `<path d="M14.5 5.5 8 12l6.5 6.5"/>`,

  /* --- accounts and friends --- */
  friends: `
    <circle cx="9.2" cy="8.4" r="3.4"/>
    <path d="M2.8 19.4a6.4 6.4 0 0 1 12.8 0"/>
    <path d="M16.2 5.4a3.4 3.4 0 0 1 0 6.6M17.4 13.6a6.4 6.4 0 0 1 3.8 5.8"/>`,
  search: `
    <circle cx="10.6" cy="10.6" r="6.4"/>
    <path d="M15.4 15.4 20.4 20.4"/>`,
  addFriend: `
    <circle cx="9.6" cy="8.4" r="3.6"/>
    <path d="M3 19.4a6.6 6.6 0 0 1 13.2 0"/>
    <path d="M18.4 6.6v5.6M21.2 9.4h-5.6"/>`,
  mail: `
    <rect x="3" y="5.4" width="18" height="13.2" rx="2.2"/>
    <path d="m3.8 7.2 7.1 5.1a2 2 0 0 0 2.2 0l7.1-5.1"/>`,
  key: `
    <circle cx="7.8" cy="12" r="3.8"/>
    <path d="M11.6 12h8.6M17.6 12v3M14.6 12v2.2"/>`,
  signOut: `
    <path d="M14.4 4.4H6.6a2 2 0 0 0-2 2v11.2a2 2 0 0 0 2 2h7.8"/>
    <path d="M10.6 12h9.4M16.8 8.6 20.2 12l-3.4 3.4"/>`,
  cloud: `
    <path d="M7.4 18.4a4.4 4.4 0 0 1-.6-8.8 5.4 5.4 0 0 1 10.3 1.2 3.8 3.8 0 0 1-.5 7.6z"/>`,
  menu: `<path d="M4 7h16M4 12h16M4 17h16"/>`,
  bell: `
    <path d="M18 9.4a6 6 0 0 0-12 0c0 5-2.2 6.4-2.2 6.4h16.4S18 14.4 18 9.4z"/>
    <path d="M13.6 19.2a1.9 1.9 0 0 1-3.2 0"/>`,
  /* A comic starburst, filled - the card back's emblem plate. */
  burst: `
    <path fill="currentColor" stroke="none" d="M12 .6 13.9 6.4 18.3 1.9 17.8 8 23.7 6.7 19.8 11.6 24 14 18.2 15 21.1 20.4 15.3 18 14.9 24 12 18.9 9.1 24 8.7 18 2.9 20.4 5.8 15 0 14 4.2 11.6.3 6.7 6.2 8 5.7 1.9 10.1 6.4z"/>`,
  hourglass: `
    <path d="M7 4.2h10M7 19.8h10"/>
    <path d="M7.6 4.2c0 4 4.4 5.2 4.4 7.8s-4.4 3.8-4.4 7.8M16.4 4.2c0 4-4.4 5.2-4.4 7.8s4.4 3.8 4.4 7.8"/>`
};

/**
 * The Wiklodo mark: a foil booster pack with a W cut across its face and a
 * spark beside it. Drawn with `currentColor` so it takes the colour of
 * whatever it sits in, the same as every other icon here.
 */
/*
 * The Wiklodo mark: a foil booster torn open, a star bursting out of the
 * mouth, the W stamped on the face. The same drawing ships as the Android
 * launcher icon (ic_launcher_foreground.xml) - one identity everywhere.
 */
export const LOGO_MARK = `
  <defs>
    <linearGradient id="lg-bag" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4f46e5"/>
      <stop offset="0.55" stop-color="#312e81"/>
      <stop offset="1" stop-color="#1e1b4b"/>
    </linearGradient>
    <linearGradient id="lg-star" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fde68a"/>
      <stop offset="1" stop-color="#f59e0b"/>
    </linearGradient>
  </defs>
  <path fill="url(#lg-bag)"
    d="M15 21 L18 18 L21 21 L24 18 L27 21 L30 18 L33 21 L36 18 L39 21 L42 18 L45 21 L48 18 L48 51 A6 6 0 0 1 42 57 L21 57 A6 6 0 0 1 15 51 Z"/>
  <path fill="rgba(165,180,252,0.35)" d="M15 33 L48 23 L48 31 L15 41 Z"/>
  <path fill="#0b0d1c" d="M17 21.8 L46 21.8 L46 25.4 L17 25.4 Z"/>
  <path fill="none" stroke="#a5b4fc" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"
    d="M15 21 L18 18 L21 21 L24 18 L27 21 L30 18 L33 21 L36 18 L39 21 L42 18 L45 21 L48 18"/>
  <path fill="url(#lg-star)"
    d="M31.5 2 L34.6 10.4 L43 13.5 L34.6 16.6 L31.5 25 L28.4 16.6 L20 13.5 L28.4 10.4 Z"/>
  <path fill="#fff7d6" d="M31.5 7.6 L33.3 11.7 L37.4 13.5 L33.3 15.3 L31.5 19.4 L29.7 15.3 L25.6 13.5 L29.7 11.7 Z"/>
  <path fill="#fde68a" d="M46 4 L47.1 7 L50 8.1 L47.1 9.2 L46 12.2 L44.9 9.2 L42 8.1 L44.9 7 Z"/>
  <path fill="#fde68a" d="M17 6.5 L17.9 8.9 L20.2 9.8 L17.9 10.7 L17 13.1 L16.1 10.7 L13.8 9.8 L16.1 8.9 Z"/>
  <path fill="none" stroke="#f8fafc" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"
    d="M22 36 L26.4 50 L31.5 41 L36.6 50 L41 36"/>`;

/**
 * The Buckarooz mark: a B with two bars running through it, top and bottom,
 * the way a dollar sign wears its strokes. Drawn rather than borrowed - no
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
