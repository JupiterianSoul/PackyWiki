/**
 * THEME TABLE
 * ============================================================================
 * A theme here is not a palette. Each one carries its own:
 *
 *   shape      how corners, borders and shadows behave
 *   type       which typeface the app speaks in
 *   motion     how fast things move and with what easing character
 *   backdrop   a live canvas renderer behind the whole app
 *   texture    a full-screen overlay (grain, scanlines, none)
 *   sound      the synth's timbre, tuning and space
 *
 * Colours and shape live in CSS, under `[data-theme="<id>"]` in
 * styles/themes.css, so a repaint never waits on JavaScript. Everything the
 * canvas and the synthesiser need lives here, keyed by the same id.
 *
 * To add a theme: add a row here, add a matching block in styles/themes.css,
 * and add a `draw<Name>` renderer in ui/backdrop.js. Nothing else in the app
 * knows the list.
 */

export const THEMES = [
  {
    id: 'aurora',
    name: { en: 'Aurora', fr: 'Aurore' },
    blurb: {
      en: 'Deep space glass. Slow ribbons of light, soft springs, bell tones.',
      fr: 'Verre spatial. Rubans de lumière lents, ressorts doux, cloches.'
    },
    swatch: ['#0b1024', '#7dd3fc', '#a78bfa'],
    backdrop: { renderer: 'aurora', ribbons: 5, speed: 0.00013, alpha: 0.5 },
    motion: { scale: 1, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    sound: {
      voice: 'fm',            // bell-like FM pair
      root: 261.63,           // C4
      scale: [0, 3, 5, 7, 10],
      reverb: { seconds: 3.2, decay: 2.6, mix: 0.34 },
      filter: 5200,
      drive: 0.15,
      transient: 'air'
    }
  },
  {
    id: 'paper',
    name: { en: 'Paper', fr: 'Papier' },
    blurb: {
      en: 'Printed and pressed. Hard ink borders, snappy motion, wooden notes.',
      fr: 'Imprimé et pressé. Traits d’encre nets, mouvements vifs, notes de bois.'
    },
    swatch: ['#f2eee4', '#1f6f5c', '#c2410c'],
    backdrop: { renderer: 'paper', flecks: 900, drift: 0.00004 },
    motion: { scale: 0.6, ease: 'cubic-bezier(0.2, 0.9, 0.3, 1)', pop: 'cubic-bezier(0.3, 1.5, 0.5, 1)' },
    sound: {
      voice: 'marimba',       // sine body, fast decay, wooden knock
      root: 349.23,           // F4
      scale: [0, 2, 4, 7, 9],
      reverb: { seconds: 0.9, decay: 3.6, mix: 0.1 },
      filter: 3200,
      drive: 0.05,
      transient: 'knock'
    }
  },
  {
    id: 'arcade',
    name: { en: 'Arcade', fr: 'Arcade' },
    blurb: {
      en: 'Cabinet glow. Scanlines, hard edges, square waves, no mercy.',
      fr: 'Lueur de borne. Balayage, angles durs, ondes carrées, sans pitié.'
    },
    swatch: ['#05060a', '#22d3ee', '#f0abfc'],
    backdrop: { renderer: 'arcade', rows: 22, speed: 0.00028 },
    motion: { scale: 0.42, ease: 'cubic-bezier(0.16, 0.9, 0.2, 1)', pop: 'cubic-bezier(0.2, 2.2, 0.4, 1)' },
    sound: {
      voice: 'chip',          // stacked square/saw, no reverb, pitch bend
      root: 220,              // A3
      scale: [0, 4, 7, 11, 12],
      reverb: { seconds: 0.35, decay: 6, mix: 0.04 },
      filter: 9000,
      drive: 0.55,
      transient: 'bit'
    }
  },
  {
    id: 'noir',
    name: { en: 'Noir', fr: 'Noir' },
    blurb: {
      en: 'One light, one shadow. Grain, gold, plucked strings, slow cuts.',
      fr: 'Une lumière, une ombre. Grain, or, cordes pincées, coupes lentes.'
    },
    swatch: ['#0a0a0a', '#e8c37a', '#6b6b6b'],
    backdrop: { renderer: 'noir', grain: 0.09, leak: true },
    motion: { scale: 1.5, ease: 'cubic-bezier(0.16, 1, 0.3, 1)', pop: 'cubic-bezier(0.25, 1.2, 0.4, 1)' },
    sound: {
      voice: 'pluck',         // Karplus-Strong string
      root: 196,              // G3
      scale: [0, 3, 7, 10, 14],
      reverb: { seconds: 4.2, decay: 2.1, mix: 0.4 },
      filter: 2600,
      drive: 0.1,
      transient: 'brush'
    }
  }
];

export const DEFAULT_THEME = 'aurora';

export const themeById = (id) => THEMES.find((theme) => theme.id === id) ?? THEMES[0];

/**
 * Put a theme on the document. The id drives every CSS token block; the two
 * motion custom properties are written here because CSS cannot compute them
 * from an attribute.
 */
export function applyTheme(id) {
  const theme = themeById(id);
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.style.setProperty('--motion-scale', String(theme.motion.scale));
  root.style.setProperty('--ease', theme.motion.ease);
  root.style.setProperty('--ease-pop', theme.motion.pop);
  return theme;
}
