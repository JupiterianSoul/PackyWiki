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
      gain: 0.62,             // this voice runs hot; trim the whole instrument
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
      gain: 0.66,             // this voice runs hot; trim the whole instrument
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
      gain: 0.55,             // this voice runs hot; trim the whole instrument
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
      voice: 'keys',          // felt piano: warm, round, never harsh
      root: 174.61,           // F3
      scale: [0, 3, 7, 10, 14],
      reverb: { seconds: 2.6, decay: 3.2, mix: 0.24 },
      filter: 2400,
      drive: 0,
      transient: 'brush'
    }
  }
,
  {
    id: 'sunset',
    name: { en: "Sunset '84", fr: "Sunset '84" },
    blurb: {
      en: 'Neon horizon. A grid to the sun, pink chrome, fat analogue saws.',
      fr: 'Horizon néon. Une grille vers le soleil, chrome rose, synthés analogiques.'
    },
    swatch: ['#160a2e', '#f472b6', '#22d3ee'],
    backdrop: { renderer: 'sunset', speed: 0.00016 },
    motion: { scale: 0.85, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', pop: 'cubic-bezier(0.3, 1.7, 0.5, 1)' },
    sound: {
      voice: 'synthwave',     // detuned saw stack with a sub
      gain: 0.6,              // this voice runs hot; trim the whole instrument
      root: 233.08,           // Bb3
      scale: [0, 3, 5, 7, 10],
      reverb: { seconds: 2.2, decay: 2.2, mix: 0.3 },
      filter: 4600,
      drive: 0.12,
      transient: 'air'
    }
  },
  {
    id: 'meadow',
    name: { en: 'Meadow', fr: 'Prairie' },
    blurb: {
      en: 'Late afternoon outside. Warm greens, drifting seeds, soft keys.',
      fr: 'Fin d’après-midi dehors. Verts chauds, graines au vent, notes douces.'
    },
    swatch: ['#17230f', '#a3e635', '#fbbf24'],
    backdrop: { renderer: 'meadow', motes: 40, speed: 0.00008 },
    motion: { scale: 1.15, ease: 'cubic-bezier(0.25, 1, 0.5, 1)', pop: 'cubic-bezier(0.3, 1.4, 0.6, 1)' },
    sound: {
      voice: 'keys',          // the felt piano again, tuned brighter
      root: 293.66,           // D4
      scale: [0, 2, 4, 7, 9],
      reverb: { seconds: 1.8, decay: 2.8, mix: 0.22 },
      filter: 3800,
      drive: 0,
      transient: 'brush'
    }
  },
  {
    id: 'cartoon',
    name: { en: 'Cartoon', fr: 'Cartoon' },
    blurb: {
      en: 'Saturday morning. Thick ink, bouncy everything, rubber sounds.',
      fr: 'Dessin animé du samedi matin. Encre épaisse, rebonds partout, sons en caoutchouc.'
    },
    swatch: ['#fff8e7', '#ff4757', '#3aa0ff'],
    backdrop: { renderer: 'toon', speed: 0.00012 },
    motion: { scale: 1.05, ease: 'cubic-bezier(0.25, 1, 0.5, 1)', pop: 'cubic-bezier(0.28, 2.1, 0.5, 1)' },
    sound: {
      voice: 'marimba',       // woody and toony under the samples
      gain: 0.68,
      root: 329.63,           // E4
      scale: [0, 2, 4, 7, 9],
      reverb: { seconds: 1.1, decay: 2.6, mix: 0.16 },
      filter: 5600,
      drive: 0.05,
      transient: 'brush',
      kit: 'rubber'           // CC0 recordings; see src/assets/sfx/LICENSE.md
    }
  },
  {
    id: 'matrix',
    name: { en: 'Matrix', fr: 'Matrix' },
    blurb: {
      en: 'Green rain on black glass. Terminal type, digital sounds.',
      fr: 'Pluie verte sur verre noir. Police de terminal, sons numériques.'
    },
    swatch: ['#020a04', '#00ff41', '#0f5c2e'],
    backdrop: { renderer: 'matrix', speed: 0.00018 },
    motion: { scale: 0.5, ease: 'cubic-bezier(0.3, 0, 0.2, 1)', pop: 'cubic-bezier(0.3, 1.2, 0.4, 1)' },
    sound: {
      voice: 'chip',          // square-wave blips read as terminal
      gain: 0.5,
      root: 220,              // A3
      scale: [0, 3, 5, 7, 10],
      reverb: { seconds: 1.4, decay: 2.4, mix: 0.2 },
      filter: 3400,
      drive: 0.18,
      transient: 'air',
      kit: 'scifi'            // CC0 recordings; see src/assets/sfx/LICENSE.md
    }
  },
  {
    id: 'casino',
    name: { en: 'Casino', fr: 'Casino' },
    blurb: {
      en: 'Green felt after midnight. Gold trim, drifting suits, chips on wood.',
      fr: 'Tapis vert après minuit. Liseré doré, enseignes qui flottent, jetons sur bois.'
    },
    swatch: ['#0b2e20', '#f2ca4f', '#e0245e'],
    backdrop: { renderer: 'casino', speed: 0.0001 },
    motion: { scale: 0.9, ease: 'cubic-bezier(0.25, 1, 0.5, 1)', pop: 'cubic-bezier(0.3, 1.5, 0.55, 1)' },
    sound: {
      voice: 'keys',          // felt piano suits a felt table
      gain: 0.9,
      root: 246.94,           // B3
      scale: [0, 2, 3, 7, 9],
      reverb: { seconds: 1.6, decay: 2.6, mix: 0.24 },
      filter: 4200,
      drive: 0.06,
      transient: 'brush',
      kit: 'mechanical'       // CC0 recordings; see src/assets/sfx/LICENSE.md
    }
  },
  {
    id: 'horror',
    name: { en: 'Horror', fr: 'Horreur' },
    blurb: {
      en: 'A house with one light on. Fog, grain, and a red you should not follow.',
      fr: 'Une maison, une seule lumière. Brume, grain, et un rouge à ne pas suivre.'
    },
    swatch: ['#0a0508', '#c8102e', '#7a8a99'],
    backdrop: { renderer: 'horror', speed: 0.00012 },
    motion: { scale: 1.3, ease: 'cubic-bezier(0.3, 0, 0.2, 1)', pop: 'cubic-bezier(0.25, 1.1, 0.4, 1)' },
    sound: {
      voice: 'fm',            // bells, but from the wrong end of the corridor
      gain: 0.62,
      root: 174.61,           // F3
      scale: [0, 1, 3, 6, 8],
      reverb: { seconds: 3.8, decay: 3, mix: 0.42 },
      filter: 2400,
      drive: 0.1,
      transient: 'air',
      kit: 'cinematic'        // CC0 recordings; see src/assets/sfx/LICENSE.md
    }
  },
  /* --- the special themes: one per secret code (src/codes.js) ---------------
     `code` names the code that unlocks it. Redeeming the code puts it on;
     until then it is not in the picker. Each one is the person's colour and
     their favourite thing, all the way down to the note the app plays. */
  {
    id: 'rire', code: 'simon',
    name: { en: 'Rire', fr: 'Rire' },
    blurb: {
      en: 'Simon’s. Bright blue, bouncy springs, and a room that cannot keep a straight face.',
      fr: 'Celui de Simon. Bleu vif, ressorts bondissants, et une pièce qui ne garde pas son sérieux.'
    },
    swatch: ['#0a1630', '#3b82f6', '#bfdbfe'],
    backdrop: { renderer: 'rire', speed: 0.00016 },
    motion: { scale: 0.85, ease: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)', pop: 'cubic-bezier(0.34, 1.7, 0.5, 1)' },
    sound: {
      voice: 'marimba',       // a wooden giggle
      gain: 0.7,
      root: 392.0,            // G4
      scale: [0, 4, 7, 9, 12],
      reverb: { seconds: 1.2, decay: 3, mix: 0.16 },
      filter: 4200,
      drive: 0.08,
      transient: 'knock'
    }
  },
  {
    id: 'assur', code: 'celeste',
    name: { en: 'Assur', fr: 'Assur' },
    blurb: {
      en: 'Céleste’s. Rose glaze on palace brick, cuneiform in the air, slow and ceremonial.',
      fr: 'Celui de Céleste. Émail rose sur brique de palais, cunéiforme dans l’air, lent et cérémonieux.'
    },
    swatch: ['#2a0f1f', '#f472b6', '#f5d0a9'],
    backdrop: { renderer: 'assur', speed: 0.00006 },
    motion: { scale: 1.15, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', pop: 'cubic-bezier(0.3, 1.3, 0.5, 1)' },
    sound: {
      voice: 'fm',            // temple bells
      gain: 0.6,
      root: 220.0,            // A3
      scale: [0, 1, 4, 5, 7, 8, 11],
      reverb: { seconds: 4.2, decay: 2.2, mix: 0.4 },
      filter: 3600,
      drive: 0.1,
      transient: 'brush'
    }
  },
  {
    id: 'pixel', code: 'samuel',
    name: { en: 'Pixel', fr: 'Pixel' },
    blurb: {
      en: 'Samuel’s. Dodger blue, hard pixels, square notes and a level that never ends.',
      fr: 'Celui de Samuel. Bleu dodger, pixels durs, notes carrées et un niveau qui ne finit jamais.'
    },
    swatch: ['#06162e', '#1e90ff', '#cfe7ff'],
    backdrop: { renderer: 'pixel', speed: 0.00022 },
    motion: { scale: 0.7, ease: 'steps(6, end)', pop: 'cubic-bezier(0.2, 1.4, 0.4, 1)' },
    sound: {
      voice: 'chip',          // eight bits
      gain: 0.5,
      root: 329.63,           // E4
      scale: [0, 2, 4, 7, 9],
      reverb: { seconds: 0.4, decay: 4, mix: 0.05 },
      filter: 6000,
      drive: 0.2,
      transient: 'bit'
    }
  },
  {
    id: 'tabletop', code: 'noah',
    name: { en: 'Tabletop', fr: 'Plateau' },
    blurb: {
      en: 'Noah’s. Violet felt under a lamp, dice at rest, meeples waiting for a turn.',
      fr: 'Celui de Noah. Feutre violet sous une lampe, dés au repos, meeples qui attendent leur tour.'
    },
    swatch: ['#1a0b2e', '#a855f7', '#e9d5ff'],
    backdrop: { renderer: 'tabletop', speed: 0.0001 },
    motion: { scale: 1, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    sound: {
      voice: 'keys',          // felt piano on a felt table
      gain: 0.66,
      root: 293.66,           // D4
      scale: [0, 3, 5, 7, 10],
      reverb: { seconds: 1.8, decay: 2.8, mix: 0.22 },
      filter: 3800,
      drive: 0.06,
      transient: 'knock'
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
