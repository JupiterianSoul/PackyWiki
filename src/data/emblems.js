/**
 * EMBLEM LIBRARY
 * ============================================================================
 * One drawn illustration per subject. These are the app's own artwork - no
 * photographs: every booster face, card back and album cover is built from
 * the emblem of its category, tinted by the category's palette.
 *
 * Every emblem is a 120×120 SVG drawn against three palette slots, supplied
 * by the surrounding CSS as custom properties:
 *
 *   --e1   light tint of the accent (highlights, glass, chrome)
 *   --e2   the accent itself        (the subject's body colour)
 *   --e3   deep shadow of the hue   (undersides, depth, outlines)
 *
 * plus white/near-black details drawn directly. Fallbacks are baked in so an
 * emblem still reads if a var is missing. Keep every shape bold: these are
 * read at 44px on a shelf and at 160px on an album cover.
 */

const E1 = 'var(--e1, #e2e8f0)';
const E2 = 'var(--e2, #94a3b8)';
const E3 = 'var(--e3, #334155)';
const INK = 'rgba(6, 9, 18, 0.85)';
const HI = 'rgba(255, 255, 255, 0.92)';

export const EMBLEMS = {
  /* A low, wide sports coupé, three-quarter front, headlight lit. */
  cars: `
    <ellipse cx="60" cy="98" rx="44" ry="7" fill="${INK}" opacity="0.35"/>
    <path d="M14 78 Q16 62 34 56 Q46 40 68 40 Q88 40 98 56 Q106 60 106 72 L106 82 Q106 88 100 88 L20 88 Q14 88 14 78Z" fill="${E2}"/>
    <path d="M34 56 Q46 42 68 42 Q84 42 94 54 L76 58 Q60 60 44 58Z" fill="${E1}" opacity="0.9"/>
    <path d="M38 57 Q48 46 66 45 L64 57Z" fill="${E3}" opacity="0.85"/>
    <path d="M68 45 Q82 46 91 54 L70 57Z" fill="${E3}" opacity="0.7"/>
    <path d="M14 78 Q16 64 32 58 L106 66 L106 82 Q106 88 100 88 L20 88 Q14 88 14 78Z" fill="${E3}" opacity="0.45"/>
    <circle cx="34" cy="86" r="11" fill="${INK}"/>
    <circle cx="34" cy="86" r="6" fill="${E1}"/>
    <circle cx="34" cy="86" r="2.5" fill="${E3}"/>
    <circle cx="88" cy="86" r="11" fill="${INK}"/>
    <circle cx="88" cy="86" r="6" fill="${E1}"/>
    <circle cx="88" cy="86" r="2.5" fill="${E3}"/>
    <path d="M97 66 q7 0 8 5 q-6 2 -10 -1z" fill="${HI}"/>
    <rect x="16" y="70" width="20" height="3.4" rx="1.7" fill="${HI}" opacity="0.5"/>`,

  /* An open-wheel car from above: nose, halo, rear wing. */
  f1: `
    <path d="M56 12 h8 l3 26 l-3 44 h-8 l-3 -44Z" fill="${E2}"/>
    <path d="M42 16 h36 v7 h-36Z" fill="${E3}"/>
    <path d="M38 84 h44 v9 h-44Z" fill="${E3}"/>
    <path d="M44 86 h32 v5 h-32Z" fill="${E2}"/>
    <rect x="30" y="30" width="13" height="24" rx="6" fill="${INK}"/>
    <rect x="77" y="30" width="13" height="24" rx="6" fill="${INK}"/>
    <rect x="30" y="68" width="13" height="24" rx="6" fill="${INK}"/>
    <rect x="77" y="68" width="13" height="24" rx="6" fill="${INK}"/>
    <rect x="33.5" y="34" width="6" height="16" rx="3" fill="${E3}" opacity="0.8"/>
    <rect x="80.5" y="34" width="6" height="16" rx="3" fill="${E3}" opacity="0.8"/>
    <circle cx="60" cy="52" r="9.5" fill="none" stroke="${E1}" stroke-width="3.4"/>
    <circle cx="60" cy="55" r="4" fill="${INK}"/>
    <path d="M52 38 q8 -4 16 0 l-2 6 q-6 -3 -12 0Z" fill="${E1}"/>
    <path d="M20 22 h12 M20 46 h9 M20 70 h12 M88 22 h12 M91 46 h9 M88 70 h12"
      stroke="${HI}" stroke-width="2.6" stroke-linecap="round" opacity="0.5"/>`,

  /* An airliner from above, climbing off the disc of the sky. */
  planes: `
    <circle cx="60" cy="60" r="44" fill="${E3}" opacity="0.4"/>
    <circle cx="60" cy="60" r="44" fill="none" stroke="${E1}" stroke-width="3" opacity="0.55"/>
    <path d="M57 100 q-2 -14 0 -26 l-24 14 l0 -9 l24 -20 l0 -16 q0 -14 3 -20 q3 6 3 20 l0 16 l24 20 l0 9 l-24 -14 q2 12 0 26 l8 7 l0 6 l-11 -4 l-11 4 l0 -6Z"
      fill="${E1}"/>
    <path d="M60 23 q3 6 3 20 l0 4 l-6 0 l0 -4 q0 -14 3 -20Z" fill="${E2}"/>
    <path d="M33 88 l0 -9 l10 -8 l0 12Z" fill="${E2}" opacity="0.75"/>
    <path d="M87 88 l0 -9 l-10 -8 l0 12Z" fill="${E2}" opacity="0.75"/>
    <circle cx="60" cy="30" r="2.8" fill="${E3}" opacity="0.8"/>
    <rect x="47" y="70" width="4.5" height="9" rx="2.2" fill="${E3}" opacity="0.8"/>
    <rect x="68.5" y="70" width="4.5" height="9" rx="2.2" fill="${E3}" opacity="0.8"/>
    <path d="M22 34 h13 M18 42 h9 M85 34 h13 M93 42 h9" stroke="${HI}" stroke-width="2.4" stroke-linecap="round" opacity="0.45"/>`,

  /* A game controller, thumbsticks and face buttons, pixel sparks. */
  'video-games': `
    <rect x="14" y="20" width="10" height="10" fill="${E1}" opacity="0.8"/>
    <rect x="26" y="12" width="7" height="7" fill="${E2}" opacity="0.8"/>
    <rect x="96" y="18" width="8" height="8" fill="${E1}" opacity="0.7"/>
    <path d="M30 42 Q34 34 46 34 L74 34 Q86 34 90 42 Q102 58 102 74 Q102 88 90 88 Q82 88 76 78 L70 70 L50 70 L44 78 Q38 88 30 88 Q18 88 18 74 Q18 58 30 42Z" fill="${E2}"/>
    <path d="M30 42 Q34 36 46 36 L74 36 Q80 36 84 39 L80 48 L40 48 L33 45Z" fill="${E1}" opacity="0.55"/>
    <rect x="34" y="46" width="18" height="6.5" rx="3.2" fill="${INK}"/>
    <rect x="39.8" y="40.2" width="6.5" height="18" rx="3.2" fill="${INK}"/>
    <circle cx="82" cy="45" r="4.6" fill="${INK}"/>
    <circle cx="72" cy="53" r="4.6" fill="${INK}"/>
    <circle cx="82" cy="45" r="2.2" fill="${E1}"/>
    <circle cx="72" cy="53" r="2.2" fill="${HI}"/>
    <circle cx="52" cy="62" r="6.5" fill="${E3}"/>
    <circle cx="68" cy="62" r="6.5" fill="${E3}"/>
    <circle cx="52" cy="62" r="3" fill="${E1}"/>
    <circle cx="68" cy="62" r="3" fill="${E1}"/>`,

  /* An open book, pages fanned, ribbon marker. */
  books: `
    <path d="M18 34 Q38 26 58 34 L58 92 Q38 84 18 92Z" fill="${E2}"/>
    <path d="M102 34 Q82 26 62 34 L62 92 Q82 84 102 92Z" fill="${E2}"/>
    <path d="M20 37 Q38 30 56 37 L56 88 Q38 82 20 88Z" fill="${E1}"/>
    <path d="M100 37 Q82 30 64 37 L64 88 Q82 82 100 88Z" fill="${E1}"/>
    <path d="M58 34 L62 34 L62 92 L58 92Z" fill="${E3}"/>
    <path d="M26 44 Q38 39 52 44 M26 53 Q38 48 52 53 M26 62 Q38 57 52 62 M26 71 Q38 66 52 71"
      stroke="${E3}" stroke-width="2" fill="none" opacity="0.55" stroke-linecap="round"/>
    <path d="M68 44 Q82 39 94 44 M68 53 Q82 48 94 53 M68 62 Q82 57 94 62 M68 71 Q82 66 94 71"
      stroke="${E3}" stroke-width="2" fill="none" opacity="0.55" stroke-linecap="round"/>
    <path d="M72 30 L72 52 L78 46 L84 52 L84 32 Q78 29 72 30Z" fill="${E3}"/>
    <path d="M14 90 Q38 82 58 90 L62 90 Q82 82 106 90 L106 96 Q82 88 62 96 L58 96 Q38 88 14 96Z" fill="${E3}"/>`,

  /* Clapperboard raised over a film reel. */
  movies: `
    <circle cx="72" cy="74" r="26" fill="${E3}"/>
    <circle cx="72" cy="74" r="21" fill="${E2}"/>
    <circle cx="72" cy="74" r="6" fill="${INK}"/>
    <circle cx="72" cy="61.5" r="4.6" fill="${INK}"/>
    <circle cx="72" cy="86.5" r="4.6" fill="${INK}"/>
    <circle cx="59.5" cy="74" r="4.6" fill="${INK}"/>
    <circle cx="84.5" cy="74" r="4.6" fill="${INK}"/>
    <g transform="rotate(-10 40 40)">
      <rect x="14" y="24" width="58" height="14" rx="3" fill="${INK}"/>
      <path d="M18 24 l10 14 h8 l-10 -14Z" fill="${E1}"/>
      <path d="M36 24 l10 14 h8 l-10 -14Z" fill="${E1}"/>
      <path d="M54 24 l10 14 h8 l-10 -14Z" fill="${E1}"/>
      <rect x="14" y="40" width="58" height="34" rx="3" fill="${E3}"/>
      <rect x="14" y="40" width="58" height="10" fill="${E2}"/>
      <rect x="20" y="56" width="30" height="3.6" rx="1.8" fill="${HI}" opacity="0.6"/>
      <rect x="20" y="64" width="22" height="3.6" rx="1.8" fill="${HI}" opacity="0.4"/>
    </g>`,

  /* A ringed planet with two moons in a star field. */
  space: `
    <circle cx="22" cy="22" r="1.8" fill="${HI}"/>
    <circle cx="98" cy="30" r="1.4" fill="${HI}" opacity="0.8"/>
    <circle cx="88" cy="14" r="1.1" fill="${HI}" opacity="0.6"/>
    <circle cx="14" cy="72" r="1.4" fill="${HI}" opacity="0.7"/>
    <circle cx="104" cy="88" r="1.6" fill="${HI}" opacity="0.8"/>
    <path d="M30 16 l1.6 4.4 4.4 1.6 -4.4 1.6 -1.6 4.4 -1.6 -4.4 -4.4 -1.6 4.4 -1.6Z" fill="${E1}"/>
    <circle cx="60" cy="60" r="26" fill="${E2}"/>
    <path d="M60 34 A26 26 0 0 1 86 60 Q74 52 62 50 Q46 48 38 40 Q46 34 60 34Z" fill="${E1}" opacity="0.75"/>
    <path d="M36 70 Q52 78 78 72 Q86 70 86 60 A26 26 0 0 1 34 60 Q34 66 36 70Z" fill="${E3}" opacity="0.6"/>
    <ellipse cx="60" cy="62" rx="42" ry="12" fill="none" stroke="${E1}" stroke-width="4" opacity="0.9"
      transform="rotate(-16 60 62)"/>
    <ellipse cx="60" cy="62" rx="42" ry="12" fill="none" stroke="${E3}" stroke-width="1.6" opacity="0.8"
      transform="rotate(-16 60 62)"/>
    <circle cx="97" cy="52" r="5" fill="${E1}"/>
    <circle cx="95.4" cy="50.8" r="1.6" fill="${E3}" opacity="0.7"/>
    <circle cx="26" cy="92" r="3.4" fill="${E2}" opacity="0.9"/>`,

  /* An atom: nucleus and three electron shells. */
  physics: `
    <ellipse cx="60" cy="60" rx="44" ry="17" fill="none" stroke="${E2}" stroke-width="3.4"/>
    <ellipse cx="60" cy="60" rx="44" ry="17" fill="none" stroke="${E2}" stroke-width="3.4" transform="rotate(60 60 60)"/>
    <ellipse cx="60" cy="60" rx="44" ry="17" fill="none" stroke="${E2}" stroke-width="3.4" transform="rotate(120 60 60)"/>
    <circle cx="60" cy="60" r="11" fill="${E1}"/>
    <circle cx="56.5" cy="56.5" r="4" fill="${HI}"/>
    <circle cx="64" cy="62" r="4.6" fill="${E3}" opacity="0.65"/>
    <circle cx="104" cy="60" r="5" fill="${E1}"/>
    <circle cx="38" cy="98" r="5" fill="${E1}"/>
    <circle cx="38" cy="22" r="5" fill="${E1}"/>`,

  /* Twin peaks, a pine, and a low sun. */
  nature: `
    <circle cx="86" cy="34" r="13" fill="${E1}"/>
    <path d="M8 96 L44 34 L62 66 L74 46 L112 96Z" fill="${E2}"/>
    <path d="M44 34 L56 55 L50 55 L58 68 L62 66Z" fill="${HI}" opacity="0.75"/>
    <path d="M74 46 L86 62 L80 62 L88 74 L96 74Z" fill="${HI}" opacity="0.55"/>
    <path d="M8 96 L44 34 L30 96Z" fill="${E3}" opacity="0.5"/>
    <path d="M74 46 L112 96 L84 96Z" fill="${E3}" opacity="0.4"/>
    <path d="M24 96 l8 -18 l8 18 h-5 l6 12 h-18 l6 -12Z" fill="${E3}"/>
    <rect x="8" y="106" width="104" height="4" rx="2" fill="${E3}" opacity="0.8"/>`,

  /* A fox head, ears up. */
  animals: `
    <path d="M24 22 Q22 44 32 54 L50 44Z" fill="${E2}"/>
    <path d="M96 22 Q98 44 88 54 L70 44Z" fill="${E2}"/>
    <path d="M28 28 Q27 42 33 49 L44 43Z" fill="${E3}" opacity="0.75"/>
    <path d="M92 28 Q93 42 87 49 L76 43Z" fill="${E3}" opacity="0.75"/>
    <path d="M60 34 Q80 34 92 50 Q98 60 92 70 Q82 90 60 98 Q38 90 28 70 Q22 60 28 50 Q40 34 60 34Z" fill="${E2}"/>
    <path d="M60 62 Q72 62 82 70 Q76 88 60 95 Q44 88 38 70 Q48 62 60 62Z" fill="${E1}"/>
    <circle cx="45" cy="58" r="4.4" fill="${INK}"/>
    <circle cx="75" cy="58" r="4.4" fill="${INK}"/>
    <circle cx="46.6" cy="56.4" r="1.5" fill="${HI}"/>
    <circle cx="76.6" cy="56.4" r="1.5" fill="${HI}"/>
    <path d="M60 74 L54 80 Q60 86 66 80Z" fill="${INK}"/>`,

  /* A seedling breaking out of a mound, big leaves. */
  plants: `
    <path d="M20 92 Q60 78 100 92 L100 104 L20 104Z" fill="${E3}"/>
    <path d="M28 92 Q60 82 92 92 L92 96 Q60 88 28 96Z" fill="${INK}" opacity="0.4"/>
    <path d="M58 92 Q58 66 60 52 Q62 66 62 92Z" fill="${E2}" stroke="${E2}" stroke-width="3" stroke-linecap="round"/>
    <path d="M60 58 Q40 58 32 40 Q52 36 60 52Z" fill="${E2}"/>
    <path d="M60 58 Q40 58 32 40 Q46 52 58 55Z" fill="${E3}" opacity="0.6"/>
    <path d="M60 46 Q80 46 88 28 Q68 24 60 40Z" fill="${E1}"/>
    <path d="M60 46 Q80 46 88 28 Q74 40 62 43Z" fill="${E2}" opacity="0.7"/>
    <path d="M60 30 Q60 18 68 12 Q72 22 64 30Z" fill="${E2}"/>`,

  /* A temple front: pediment, four columns, steps. */
  history: `
    <path d="M60 12 L104 34 L16 34Z" fill="${E2}"/>
    <path d="M60 18 L92 33 L28 33Z" fill="${E3}" opacity="0.55"/>
    <rect x="18" y="36" width="84" height="8" rx="2" fill="${E1}"/>
    <rect x="24" y="48" width="10" height="38" rx="2" fill="${E2}"/>
    <rect x="44" y="48" width="10" height="38" rx="2" fill="${E2}"/>
    <rect x="64" y="48" width="10" height="38" rx="2" fill="${E2}"/>
    <rect x="84" y="48" width="10" height="38" rx="2" fill="${E2}"/>
    <path d="M26 48 h2 v38 h-2Z M46 48 h2 v38 h-2Z M66 48 h2 v38 h-2Z M86 48 h2 v38 h-2Z" fill="${E3}" opacity="0.6"/>
    <rect x="18" y="88" width="84" height="7" rx="2" fill="${E1}"/>
    <rect x="12" y="97" width="96" height="7" rx="2" fill="${E2}"/>`,

  /* An owl: the philosopher's bird, on a branch. */
  philosophy: `
    <path d="M34 30 Q26 20 28 12 Q38 16 42 24Z" fill="${E2}"/>
    <path d="M86 30 Q94 20 92 12 Q82 16 78 24Z" fill="${E2}"/>
    <path d="M60 22 Q88 22 92 52 Q94 78 78 90 Q70 96 60 96 Q50 96 42 90 Q26 78 28 52 Q32 22 60 22Z" fill="${E2}"/>
    <path d="M60 52 Q48 52 44 64 Q42 78 52 86 Q58 90 60 90 Q62 90 68 86 Q78 78 76 64 Q72 52 60 52Z" fill="${E1}"/>
    <path d="M50 58 q-6 8 0 16 M60 56 q-6 10 0 20 M70 58 q6 8 0 16" stroke="${E3}" stroke-width="2" fill="none" opacity="0.5"/>
    <circle cx="45" cy="42" r="10.5" fill="${E1}"/>
    <circle cx="75" cy="42" r="10.5" fill="${E1}"/>
    <circle cx="45" cy="42" r="5" fill="${INK}"/>
    <circle cx="75" cy="42" r="5" fill="${INK}"/>
    <circle cx="46.8" cy="40.4" r="1.7" fill="${HI}"/>
    <circle cx="76.8" cy="40.4" r="1.7" fill="${HI}"/>
    <path d="M60 44 L54 54 Q60 58 66 54Z" fill="${E3}"/>
    <rect x="24" y="98" width="72" height="5" rx="2.5" fill="${E3}"/>
    <path d="M50 92 v7 M60 92 v7 M70 92 v7" stroke="${E3}" stroke-width="4" stroke-linecap="round"/>`,

  /* A walk-of-fame star plaque catching two flashes. */
  celebrities: `
    <rect x="16" y="16" width="88" height="88" rx="10" fill="${E3}" opacity="0.5"/>
    <rect x="16" y="16" width="88" height="88" rx="10" fill="none" stroke="${E2}" stroke-width="3"/>
    <path d="M60 28 L69 49 L92 51 L74.5 66 L80 89 L60 76.5 L40 89 L45.5 66 L28 51 L51 49Z" fill="${E2}"/>
    <path d="M60 28 L69 49 L92 51 L74.5 66 L60 55 Z" fill="${E1}" opacity="0.85"/>
    <path d="M60 76.5 L40 89 L45.5 66 L60 55Z" fill="${E3}" opacity="0.6"/>
    <circle cx="60" cy="55" r="6" fill="${HI}"/>
    <path d="M24 24 l5 0 M26.5 21.5 l0 5" stroke="${HI}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M92 88 l7 0 M95.5 84.5 l0 7" stroke="${HI}" stroke-width="2.8" stroke-linecap="round"/>`,

  /* A great pair of quotation marks over a speech card. */
  quotes: `
    <rect x="18" y="30" width="84" height="56" rx="12" fill="${E2}"/>
    <path d="M40 86 L36 102 L58 86Z" fill="${E2}"/>
    <rect x="18" y="30" width="84" height="56" rx="12" fill="none" stroke="${E3}" stroke-width="3" opacity="0.5"/>
    <path d="M38 68 Q30 66 30 56 Q30 46 40 44 Q40 50 36 52 Q42 52 42 60 Q42 68 38 68Z" fill="${E1}"/>
    <path d="M58 68 Q50 66 50 56 Q50 46 60 44 Q60 50 56 52 Q62 52 62 60 Q62 68 58 68Z" fill="${E1}"/>
    <path d="M70 50 h22 M70 58 h18 M70 66 h20" stroke="${E3}" stroke-width="3.4" stroke-linecap="round" opacity="0.65"/>`,

  /* A palette with wells and a brush across it. */
  art: `
    <path d="M60 20 Q98 20 102 52 Q104 76 84 84 Q76 87 72 82 Q68 76 72 70 Q76 64 70 60 Q64 56 56 60 Q34 68 24 56 Q14 40 34 27 Q46 20 60 20Z" fill="${E2}"/>
    <path d="M60 23 Q94 23 99 52 Q90 44 78 42 Q56 38 44 30 Q52 23 60 23Z" fill="${E1}" opacity="0.5"/>
    <circle cx="44" cy="36" r="6" fill="${E1}"/>
    <circle cx="64" cy="32" r="6" fill="${E3}"/>
    <circle cx="82" cy="42" r="6" fill="${HI}"/>
    <circle cx="38" cy="52" r="6" fill="${INK}" opacity="0.75"/>
    <g transform="rotate(38 70 70)">
      <rect x="66" y="34" width="8" height="44" rx="4" fill="${E3}"/>
      <path d="M66 78 h8 l-1 12 q-3 5 -6 0Z" fill="${E1}"/>
      <path d="M69 90 q1 6 1 10 q1 -4 2 -10Z" fill="${E2}"/>
    </g>`,

  /* A saguaro in a terracotta pot under a hot sun. */
  cactus: `
    <circle cx="92" cy="24" r="11" fill="${E1}"/>
    <path d="M54 84 L54 40 Q54 30 60 30 Q66 30 66 40 L66 84Z" fill="${E2}"/>
    <path d="M54 62 L42 62 Q36 62 36 52 L36 46 Q36 42 40 42 Q44 42 44 46 L44 52 Q44 54 46 54 L54 54Z" fill="${E2}"/>
    <path d="M66 56 L78 56 Q84 56 84 46 L84 42 Q84 38 80 38 Q76 38 76 42 L76 46 Q76 48 74 48 L66 48Z" fill="${E2}"/>
    <path d="M57 36 v44 M61 40 v40" stroke="${E3}" stroke-width="1.8" opacity="0.55"/>
    <path d="M40 45 v6 M80 41 v4" stroke="${E3}" stroke-width="1.6" opacity="0.55"/>
    <path d="M44 84 h32 l-3 20 q-1 4 -5 4 h-16 q-4 0 -5 -4Z" fill="${E3}"/>
    <path d="M42 84 h36 v6 h-36Z" fill="${E1}"/>
    <path d="M50 34 l-3 -3 M70 34 l3 -3 M52 70 l-4 2 M68 66 l4 2" stroke="${E1}" stroke-width="2" stroke-linecap="round"/>`,

  /* A winner's cup between laurel sprigs. */
  sport: `
    <path d="M38 22 h44 l-3 30 Q76 68 60 72 Q44 68 41 52Z" fill="${E2}"/>
    <path d="M40 24 h18 Q56 50 60 70 Q46 66 43 50Z" fill="${E1}" opacity="0.5"/>
    <path d="M38 28 Q22 28 22 42 Q22 56 40 58 L39 50 Q30 48 30 42 Q30 34 38 34Z" fill="${E2}"/>
    <path d="M82 28 Q98 28 98 42 Q98 56 80 58 L81 50 Q90 48 90 42 Q90 34 82 34Z" fill="${E2}"/>
    <rect x="54" y="72" width="12" height="10" fill="${E3}"/>
    <path d="M44 84 h32 l4 12 h-40Z" fill="${E3}"/>
    <path d="M48 86 h24 l2 6 h-28Z" fill="${E2}" opacity="0.6"/>
    <circle cx="60" cy="44" r="9" fill="${E3}" opacity="0.55"/>
    <path d="M60 38 l2.2 4.4 4.8 0.7 -3.5 3.4 0.8 4.8 -4.3 -2.3 -4.3 2.3 0.8 -4.8 -3.5 -3.4 4.8 -0.7Z" fill="${HI}"/>`,

  /* A spinning record, tonearm glint, two notes off the groove. */
  music: `
    <circle cx="50" cy="68" r="40" fill="${E3}"/>
    <circle cx="50" cy="68" r="40" fill="none" stroke="${E1}" stroke-width="2.4" opacity="0.55"/>
    <circle cx="50" cy="68" r="32" fill="none" stroke="${E1}" stroke-width="1.4" opacity="0.35"/>
    <circle cx="50" cy="68" r="24" fill="none" stroke="${E1}" stroke-width="1.4" opacity="0.28"/>
    <circle cx="50" cy="68" r="13" fill="${E2}"/>
    <circle cx="50" cy="68" r="3.6" fill="${INK}"/>
    <path d="M50 28 a40 40 0 0 1 27 11" stroke="${HI}" stroke-width="3.4" fill="none" opacity="0.75" stroke-linecap="round"/>
    <path d="M78 60 L78 26 L104 20 L104 52" stroke="${E1}" stroke-width="4.6" fill="none" stroke-linejoin="round"/>
    <ellipse cx="72.5" cy="60" rx="7.4" ry="5.4" fill="${E1}"/>
    <ellipse cx="98.5" cy="52" rx="7.4" ry="5.4" fill="${E1}"/>
    <path d="M78 34 L104 28" stroke="${E1}" stroke-width="4" opacity="0.7"/>`,

  /* A podium under a gold-star medal on its ribbon. */
  records: `
    <path d="M60 14 l5 10 11 1.6 -8 7.8 1.9 11 -9.9 -5.2 -9.9 5.2 1.9 -11 -8 -7.8 11 -1.6Z" fill="${E1}"/>
    <path d="M60 21 l3 6 6.6 1 -4.8 4.6 1.1 6.6 -5.9 -3.1 -5.9 3.1 1.1 -6.6 -4.8 -4.6 6.6 -1Z" fill="${HI}" opacity="0.85"/>
    <rect x="44" y="60" width="32" height="46" rx="3" fill="${E2}"/>
    <rect x="12" y="74" width="30" height="32" rx="3" fill="${E2}" opacity="0.82"/>
    <rect x="78" y="82" width="30" height="24" rx="3" fill="${E2}" opacity="0.72"/>
    <path d="M56 70 h8 v26 h-8Z" fill="${E3}" opacity="0.65"/>
    <path d="M23 82 h8 M25 82 l-4 18 M23 100 h10" stroke="${E3}" stroke-width="4.6" stroke-linecap="round" fill="none" opacity="0.7"/>
    <path d="M88 88 q8 -4 8 3 q0 4 -8 9 h10" stroke="${E3}" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.65"/>
    <path d="M44 60 h32 v6 h-32Z" fill="${E1}" opacity="0.55"/>`,

  /* A stacked burger, seeds, cheese drip and all. */
  food: `
    <ellipse cx="60" cy="102" rx="42" ry="6" fill="${INK}" opacity="0.35"/>
    <path d="M20 54 Q20 24 60 24 Q100 24 100 54 L100 58 L20 58Z" fill="${E2}"/>
    <path d="M28 40 Q40 28 60 27 L58 40Z" fill="${E1}" opacity="0.6"/>
    <circle cx="42" cy="38" r="2.6" fill="${HI}"/>
    <circle cx="58" cy="32" r="2.6" fill="${HI}"/>
    <circle cx="74" cy="37" r="2.6" fill="${HI}"/>
    <circle cx="86" cy="46" r="2.6" fill="${HI}" opacity="0.8"/>
    <path d="M20 58 h80 l0 4 q-8 10 -16 2 q-8 10 -16 1 q-8 10 -16 1 q-8 9 -16 1 q-8 8 -16 -2Z" fill="${E1}"/>
    <rect x="16" y="68" width="88" height="12" rx="6" fill="${E3}"/>
    <path d="M22 84 q10 -7 19 0 q10 -7 19 0 q10 -7 19 0 q10 -7 19 0 l0 4 h-76Z" fill="${E2}" opacity="0.75"/>
    <path d="M22 90 h76 q0 16 -15 16 h-46 q-15 0 -15 -16Z" fill="${E2}"/>
    <path d="M26 92 q16 -4 34 0 l-2 6 q-15 -3 -30 0Z" fill="${E1}" opacity="0.35"/>`,

  /* A folded map, a route, and the pin that marks the spot. */
  geography: `
    <path d="M16 34 L45 24 L75 34 L104 24 L104 88 L75 98 L45 88 L16 98Z" fill="${E1}"/>
    <path d="M45 24 L45 88 L16 98 L16 34Z" fill="${E2}" opacity="0.5"/>
    <path d="M75 34 L104 24 L104 88 L75 98Z" fill="${E2}" opacity="0.5"/>
    <path d="M45 24 L45 88 M75 34 L75 98" stroke="${E3}" stroke-width="2" opacity="0.5"/>
    <path d="M24 78 Q40 66 52 70 Q70 76 82 58 Q88 49 96 46" stroke="${E3}" stroke-width="3.4"
      stroke-dasharray="7 6" fill="none" stroke-linecap="round" opacity="0.8"/>
    <circle cx="24" cy="78" r="4.4" fill="${E3}"/>
    <path d="M96 22 Q110 22 110 36 Q110 46 96 58 Q82 46 82 36 Q82 22 96 22Z" fill="${E2}"/>
    <circle cx="96" cy="37" r="6.4" fill="${HI}"/>`,

  /* A microchip: die, pins and traces. */
  technology: `
    <path d="M42 20 v-10 M60 20 v-10 M78 20 v-10 M42 110 v-10 M60 110 v-10 M78 110 v-10
             M20 42 h-10 M20 60 h-10 M20 78 h-10 M110 42 h-10 M110 60 h-10 M110 78 h-10"
      stroke="${E1}" stroke-width="5.4" stroke-linecap="round"/>
    <rect x="22" y="22" width="76" height="76" rx="10" fill="${E2}"/>
    <rect x="22" y="22" width="76" height="76" rx="10" fill="none" stroke="${E1}" stroke-width="2.6" opacity="0.6"/>
    <rect x="40" y="40" width="40" height="40" rx="5" fill="${E3}"/>
    <path d="M40 52 h-12 M40 68 h-12 M80 52 h12 M80 68 h12 M52 40 v-12 M68 40 v-12 M52 80 v12 M68 80 v12"
      stroke="${HI}" stroke-width="2.2" opacity="0.65"/>
    <circle cx="28" cy="52" r="2.4" fill="${HI}" opacity="0.8"/>
    <circle cx="92" cy="68" r="2.4" fill="${HI}" opacity="0.8"/>
    <path d="M48 60 h10 M58 60 v-8 M58 52 h14" stroke="${E1}" stroke-width="2.6" fill="none"/>
    <circle cx="72" cy="52" r="2.6" fill="${E1}"/>
    <path d="M52 70 h16" stroke="${E1}" stroke-width="2.6"/>
    <circle cx="48" cy="70" r="2.6" fill="${E1}"/>`,

  /* Two swords crossed behind a studded shield. */
  weapons: `
    <path d="M30 18 L38 18 L88 84 L80 92Z" fill="${E1}"/>
    <path d="M30 18 L38 18 L60 47 L54 55Z" fill="${HI}" opacity="0.45"/>
    <path d="M90 18 L82 18 L32 84 L40 92Z" fill="${E1}"/>
    <path d="M90 18 L82 18 L60 47 L66 55Z" fill="${HI}" opacity="0.35"/>
    <path d="M72 78 l14 -10 M34 68 l14 10" stroke="${E3}" stroke-width="7" stroke-linecap="round"/>
    <path d="M84 96 l8 8 M36 96 l-8 8" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
    <path d="M60 50 Q76 58 88 56 Q88 86 60 100 Q32 86 32 56 Q44 58 60 50Z" fill="${E2}"/>
    <path d="M60 50 Q76 58 88 56 Q88 86 60 100Z" fill="${E3}" opacity="0.4"/>
    <path d="M60 58 Q70 62 80 62 Q79 82 60 92 Q41 82 40 62 Q50 62 60 58Z" fill="none" stroke="${E1}" stroke-width="2.6" opacity="0.7"/>
    <circle cx="60" cy="74" r="6" fill="${E1}"/>`,

  /* A saucer, beam down, one baffled star caught in it. */
  weird: `
    <circle cx="20" cy="20" r="1.8" fill="${HI}"/>
    <circle cx="100" cy="16" r="1.4" fill="${HI}" opacity="0.7"/>
    <circle cx="16" cy="56" r="1.4" fill="${HI}" opacity="0.6"/>
    <path d="M46 60 L74 60 L94 106 L26 106Z" fill="${HI}" opacity="0.16"/>
    <path d="M60 78 l3.4 7.4 8 1.1 -5.8 5.6 1.4 8 -7 -3.8 -7 3.8 1.4 -8 -5.8 -5.6 8 -1.1Z" fill="${E1}"/>
    <ellipse cx="60" cy="52" rx="40" ry="14" fill="${E2}"/>
    <ellipse cx="60" cy="48" rx="40" ry="12" fill="${E3}" opacity="0.45"/>
    <path d="M40 46 Q40 26 60 26 Q80 26 80 46 Q70 52 60 52 Q50 52 40 46Z" fill="${E1}" opacity="0.9"/>
    <path d="M46 34 Q52 28 60 28 L58 40Z" fill="${HI}" opacity="0.55"/>
    <circle cx="30" cy="56" r="3.2" fill="${INK}"/>
    <circle cx="46" cy="61" r="3.2" fill="${INK}"/>
    <circle cx="60" cy="63" r="3.2" fill="${INK}"/>
    <circle cx="74" cy="61" r="3.2" fill="${INK}"/>
    <circle cx="90" cy="56" r="3.2" fill="${INK}"/>`,

  /* The grin with the shades: a face that has seen the timeline. */
  memes: `
    <circle cx="60" cy="62" r="42" fill="${E2}"/>
    <path d="M30 40 Q42 24 60 22 L58 34 Q46 36 38 46Z" fill="${E1}" opacity="0.55"/>
    <path d="M20 48 h80 v6 h-6 v4 q0 8 -9 8 h-14 q-9 0 -9 -8 v-4 h-4 v4 q0 8 -9 8 h-14 q-9 0 -9 -8 v-4 h-6Z" fill="${INK}"/>
    <path d="M26 54 h18 v3 q0 5 -6 5 h-6 q-6 0 -6 -5Z" fill="${E1}" opacity="0.25"/>
    <path d="M68 54 h18 v3 q0 5 -6 5 h-6 q-6 0 -6 -5Z" fill="${E1}" opacity="0.25"/>
    <path d="M38 82 Q60 98 82 82" stroke="${INK}" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M42 85 Q60 96 78 85 L76 89 Q60 98 44 89Z" fill="${HI}" opacity="0.9"/>
    <path d="M96 30 l2.4 5.2 5.2 2.4 -5.2 2.4 -2.4 5.2 -2.4 -5.2 -5.2 -2.4 5.2 -2.4Z" fill="${HI}"/>
    <path d="M22 88 q-2 8 4 10" stroke="${E1}" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.8"/>`,

  /* Non-subject packs ----------------------------------------------------- */

  /* Free/timed: an hourglass mid-pour. */
  timed: `
    <rect x="34" y="14" width="52" height="8" rx="4" fill="${E3}"/>
    <rect x="34" y="98" width="52" height="8" rx="4" fill="${E3}"/>
    <path d="M40 22 h40 Q80 44 64 58 Q80 74 80 98 h-40 Q40 74 56 58 Q40 44 40 22Z" fill="${E1}" opacity="0.28"/>
    <path d="M46 26 h28 Q72 42 60 52 Q48 42 46 26Z" fill="${E2}"/>
    <path d="M60 62 Q74 74 76 94 h-32 Q46 74 60 62Z" fill="${E2}" opacity="0.85"/>
    <path d="M58.5 52 h3 v14 h-3Z" fill="${E2}"/>
    <path d="M40 22 h40 Q80 44 64 58 Q80 74 80 98 h-40 Q40 74 56 58 Q40 44 40 22Z"
      fill="none" stroke="${E1}" stroke-width="3"/>`,

  /* Wildcard/open: a faceted globe. */
  open: `
    <circle cx="60" cy="60" r="40" fill="${E2}"/>
    <circle cx="60" cy="60" r="40" fill="none" stroke="${E1}" stroke-width="3"/>
    <ellipse cx="60" cy="60" rx="18" ry="40" fill="none" stroke="${E1}" stroke-width="2.4" opacity="0.8"/>
    <path d="M20 60 h80 M26 40 h68 M26 80 h68" stroke="${E1}" stroke-width="2.4" opacity="0.8"/>
    <path d="M60 20 A40 40 0 0 1 96 44 Q78 52 60 50 Q48 49 38 42 Q46 24 60 20Z" fill="${E1}" opacity="0.35"/>`,

  /* Rarity boosters: a cut gem. */
  gem: `
    <path d="M32 30 h56 l16 22 -44 52 -44 -52Z" fill="${E2}"/>
    <path d="M32 30 h56 l-14 22 h-28Z" fill="${E1}" opacity="0.8"/>
    <path d="M46 52 h28 l-14 52Z" fill="${E1}" opacity="0.45"/>
    <path d="M16 52 h30 l14 52Z" fill="${E3}" opacity="0.5"/>
    <path d="M88 30 l16 22 h-30Z" fill="${E3}" opacity="0.6"/>
    <path d="M32 30 l14 22 h-30Z" fill="${E2}" opacity="0.9"/>
    <path d="M60 30 l6 6 -6 6 -6 -6Z" fill="${HI}" opacity="0.9"/>`,

  /* --- the special boosters (src/codes.js): one mark per person --------- */

  /* A speech bubble laughing out loud: two shut eyes and a wide open mouth. */
  laugh: `
    <ellipse cx="60" cy="100" rx="40" ry="6" fill="${INK}" opacity="0.3"/>
    <path d="M22 26 Q22 16 32 16 L88 16 Q98 16 98 26 L98 66 Q98 76 88 76 L56 76 L38 94 L42 76 L32 76 Q22 76 22 66Z" fill="${E2}"/>
    <path d="M28 22 Q28 20 30 20 L86 20 Q90 20 90 24 L90 40 Q60 34 28 40Z" fill="${E1}" opacity="0.55"/>
    <path d="M36 40 Q42 32 48 40" stroke="${INK}" stroke-width="4" stroke-linecap="round" fill="none"/>
    <path d="M70 40 Q76 32 82 40" stroke="${INK}" stroke-width="4" stroke-linecap="round" fill="none"/>
    <path d="M40 50 Q60 76 80 50Z" fill="${INK}"/>
    <path d="M46 50 L74 50 Q72 56 60 56 Q48 56 46 50Z" fill="${HI}"/>
    <path d="M50 62 Q60 68 70 62 Q66 70 60 70 Q54 70 50 62Z" fill="${E3}" opacity="0.9"/>
    <path d="M100 20 L108 12 M104 30 L114 28 M96 10 L100 2" stroke="${E1}" stroke-width="3" stroke-linecap="round"/>`,

  /* A winged bull of Assyria, in profile: the horned crown, the beard, the
     great wing, five legs as the palace gates had them. */
  lamassu: `
    <ellipse cx="60" cy="102" rx="44" ry="6" fill="${INK}" opacity="0.32"/>
    <path d="M14 62 Q18 40 44 36 L96 36 Q108 36 108 48 L108 92 L98 92 L98 70 L84 70 L84 92 L74 92 L74 70 L60 70 L60 92 L50 92 L50 70 L36 70 L36 92 L26 92 L26 66 Q14 68 14 62Z" fill="${E2}"/>
    <path d="M44 36 Q36 20 52 12 L96 12 Q112 12 112 28 L112 40 Q104 34 96 36Z" fill="${E1}" opacity="0.9"/>
    <path d="M44 38 L28 26 Q22 46 44 52Z" fill="${E1}" opacity="0.9"/>
    <path d="M92 26 Q98 22 104 26 Q98 30 92 26Z" fill="${INK}"/>
    <path d="M100 46 Q112 54 108 70 Q100 62 100 46Z" fill="${E3}" opacity="0.85"/>
    <path d="M100 8 L96 -2 M108 8 L112 -2" stroke="${E3}" stroke-width="4" stroke-linecap="round"/>
    <rect x="96" y="2" width="20" height="8" rx="3" fill="${E3}"/>
    <path d="M30 42 L20 50 L30 60 L38 50Z" fill="${E3}" opacity="0.7"/>
    <path d="M46 44 Q60 38 74 44 L74 62 Q60 66 46 62Z" fill="${E3}" opacity="0.35"/>
    <path d="M50 46 L70 46 M50 52 L70 52 M50 58 L70 58" stroke="${HI}" stroke-width="2" opacity="0.5"/>`,

  /* An eight-bit heart, blocky and lit from one corner, on a cartridge. */
  pixelheart: `
    <rect x="22" y="22" width="76" height="80" rx="6" fill="${E3}"/>
    <rect x="30" y="30" width="60" height="46" fill="${INK}"/>
    <path d="M44 38 h8 v6 h6 v-6 h8 v6 h6 v6 h-6 v6 h-6 v6 h-8 v-6 h-6 v-6 h-6 v-6 h6 v-6Z" fill="${E2}"/>
    <path d="M44 38 h8 v6 h-8Z M56 38 h4 v6 h-4Z" fill="${E1}"/>
    <rect x="36" y="82" width="48" height="6" rx="2" fill="${E1}" opacity="0.7"/>
    <rect x="36" y="92" width="26" height="4" rx="2" fill="${E1}" opacity="0.4"/>
    <rect x="18" y="16" width="84" height="8" rx="3" fill="${E2}"/>
    <path d="M26 16 h10 v-6 h-10Z M46 16 h10 v-6 h-10Z M66 16 h10 v-6 h-10Z M86 16 h10 v-6 h-10Z" fill="${E1}"/>`,

  /* Two dice mid-tumble and a meeple standing between them. */
  /* A half wheel of cheese on its board, cut face to the front. */
  /* A yoghurt pot with the foil peeled back and a spoon standing in it. */
  pot: `
    <ellipse cx="60" cy="104" rx="34" ry="6" fill="${INK}" opacity="0.3"/>
    <path d="M36 52 L84 52 L78 100 L42 100 Z" fill="${E1}"/>
    <path d="M36 52 L84 52 L82 66 L38 66 Z" fill="${E2}" opacity="0.8"/>
    <ellipse cx="60" cy="52" rx="24" ry="7" fill="${E2}"/>
    <path d="M40 50 C48 40 76 38 82 48 L80 52 L38 52 Z" fill="${INK}" opacity="0.35"/>
    <rect x="63" y="24" width="5" height="40" rx="2.5" fill="${INK}" opacity="0.55"
      transform="rotate(12 65 44)"/>
    <ellipse cx="70" cy="26" rx="8" ry="5.5" fill="${INK}" opacity="0.55"
      transform="rotate(12 70 26)"/>`,

  wheel: `
    <ellipse cx="60" cy="104" rx="42" ry="6" fill="${INK}" opacity="0.3"/>
    <rect x="16" y="88" width="88" height="10" rx="4" fill="${INK}" opacity="0.55"/>
    <path d="M20 88 A40 40 0 0 1 100 88 Z" fill="${E1}"/>
    <path d="M28 88 A32 32 0 0 1 92 88 Z" fill="${E2}" opacity="0.85"/>
    <circle cx="46" cy="74" r="4" fill="${INK}" opacity="0.35"/>
    <circle cx="64" cy="66" r="3" fill="${INK}" opacity="0.35"/>
    <circle cx="78" cy="78" r="3.4" fill="${INK}" opacity="0.35"/>
    <path d="M20 88 A40 40 0 0 1 100 88" fill="none" stroke="${INK}" stroke-width="3" opacity="0.5"/>`,

  /* An open book, spine down, pages fanned either side. */
  openbook: `
    <ellipse cx="60" cy="102" rx="44" ry="6" fill="${INK}" opacity="0.3"/>
    <path d="M60 44 C46 34 30 34 18 40 L18 90 C30 84 46 84 60 94 Z" fill="${E1}"/>
    <path d="M60 44 C74 34 90 34 102 40 L102 90 C90 84 74 84 60 94 Z" fill="${E2}"/>
    <path d="M60 44 L60 94" stroke="${INK}" stroke-width="3" opacity="0.55"/>
    <path d="M28 50 L48 56 M28 60 L48 66 M28 70 L48 76" stroke="${INK}" stroke-width="2.4"
      opacity="0.3" stroke-linecap="round"/>
    <path d="M72 56 L92 50 M72 66 L92 60 M72 76 L92 70" stroke="${INK}" stroke-width="2.4"
      opacity="0.3" stroke-linecap="round"/>`,

  dice: `
    <ellipse cx="60" cy="102" rx="44" ry="6" fill="${INK}" opacity="0.32"/>
    <g transform="rotate(-14 38 62)">
      <rect x="18" y="42" width="40" height="40" rx="8" fill="${E1}"/>
      <circle cx="28" cy="52" r="4" fill="${INK}"/><circle cx="48" cy="52" r="4" fill="${INK}"/>
      <circle cx="38" cy="62" r="4" fill="${INK}"/>
      <circle cx="28" cy="72" r="4" fill="${INK}"/><circle cx="48" cy="72" r="4" fill="${INK}"/>
    </g>
    <g transform="rotate(12 86 66)">
      <rect x="66" y="46" width="40" height="40" rx="8" fill="${E2}"/>
      <circle cx="76" cy="56" r="4" fill="${HI}"/><circle cx="96" cy="76" r="4" fill="${HI}"/>
      <circle cx="86" cy="66" r="4" fill="${HI}"/>
    </g>
    <path d="M60 22 a8 8 0 1 1 0.1 0Z" fill="${E3}"/>
    <path d="M46 46 Q60 30 74 46 L70 58 L78 78 L64 78 L60 66 L56 78 L42 78 L50 58Z" fill="${E3}"/>
    <path d="M52 44 Q60 36 68 44 L66 50 L54 50Z" fill="${E1}" opacity="0.5"/>`,

  /* A laurel wreath around a skull, a medal ribbon below: the award. */
  darwin: `
    <ellipse cx="60" cy="104" rx="40" ry="6" fill="${INK}" opacity="0.32"/>
    <path d="M22 62 Q14 40 32 26" fill="none" stroke="${E2}" stroke-width="5" stroke-linecap="round"/>
    <path d="M98 62 Q106 40 88 26" fill="none" stroke="${E2}" stroke-width="5" stroke-linecap="round"/>
    <g fill="${E2}">
      <path d="M20 58 q-8 -6 -2 -14 q8 4 2 14Z"/><path d="M18 46 q-8 -4 -4 -13 q8 3 4 13Z"/><path d="M22 36 q-6 -6 0 -13 q6 5 0 13Z"/>
      <path d="M100 58 q8 -6 2 -14 q-8 4 -2 14Z"/><path d="M102 46 q8 -4 4 -13 q-8 3 -4 13Z"/><path d="M98 36 q6 -6 0 -13 q-6 5 0 13Z"/>
    </g>
    <path d="M40 46 q0 -22 20 -22 q20 0 20 22 q0 10 -6 16 l0 10 l-28 0 l0 -10 q-6 -6 -6 -16Z" fill="${E1}"/>
    <ellipse cx="51" cy="46" rx="6" ry="7" fill="${INK}"/><ellipse cx="69" cy="46" rx="6" ry="7" fill="${INK}"/>
    <path d="M57 56 l3 -6 l3 6Z" fill="${INK}" opacity="0.7"/>
    <path d="M50 64 h20 M52 70 h16" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M46 78 l-6 22 l10 -6 l10 6 l10 -6 l10 6 l-6 -22Z" fill="${E3}"/>
    <circle cx="60" cy="92" r="7" fill="${E2}"/><circle cx="60" cy="92" r="3" fill="${HI}"/>`,

  /* A wax seal pressed with a W, a quill laid across it. */
  thorns: `
    <ellipse cx="60" cy="102" rx="38" ry="6" fill="${INK}" opacity="0.32"/>
    <circle cx="60" cy="58" r="34" fill="none" stroke="${E2}" stroke-width="9"/>
    <circle cx="60" cy="58" r="34" fill="none" stroke="${E1}" stroke-width="3" stroke-dasharray="4 9"/>
    <g fill="${E1}">
      <path d="M60 18l4 10-4 4-4-4z"/><path d="M88 30l-2 10-5 1-2-5z"/><path d="M100 58l-10 4-4-4 4-4z"/><path d="M88 86l-10-2-1-5 5-2z"/>
      <path d="M60 98l-4-10 4-4 4 4z"/><path d="M32 86l2-10 5-1 2 5z"/><path d="M20 58l10-4 4 4-4 4z"/><path d="M32 30l10 2 1 5-5 2z"/>
    </g>
    <path d="M60 34c-10 12-14 20-14 28a14 14 0 0 0 28 0c0-6-3-9-6-13 0 5-2 8-5 9 3-8-1-16-3-24z" fill="${E3}"/>
    <path d="M60 48c-5 7-7 11-7 15a7 7 0 0 0 14 0c0-3-2-5-3-7 0 3-1 4-2 5 1-4-1-9-2-13z" fill="${HI}"/>`,
  seal: `
    <ellipse cx="60" cy="100" rx="40" ry="6" fill="${INK}" opacity="0.32"/>
    <path d="M60 22 Q78 18 88 32 Q102 40 96 58 Q100 76 84 84 Q72 96 58 90 Q40 94 32 80 Q18 72 24 56 Q20 38 36 30 Q44 18 60 22Z" fill="${E2}"/>
    <circle cx="60" cy="56" r="24" fill="${E3}" opacity="0.55"/>
    <circle cx="60" cy="56" r="24" fill="none" stroke="${E1}" stroke-width="2" opacity="0.6"/>
    <path d="M44 46 L50 68 L56 52 L62 68 L68 46" fill="none" stroke="${HI}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M30 96 Q60 70 104 16" stroke="${E1}" stroke-width="5" stroke-linecap="round"/>
    <path d="M104 16 Q98 34 84 40 Q92 26 104 16Z" fill="${E1}"/>
    <path d="M86 40 Q80 44 72 46" stroke="${E1}" stroke-width="3" stroke-linecap="round"/>`
};

/**
 * The emblem for a custom pack: its subject's initial, cut into a faceted
 * seal. Deterministic - the letter and the seal's rotation come from the
 * pack, so each custom pack keeps its own mark forever.
 */
export function monogramEmblem(letter, spin = 0) {
  const ch = (letter || 'W').slice(0, 1).toUpperCase();
  return `
    <g transform="rotate(${spin % 14 - 7} 60 60)">
      <path d="M60 12 L102 36 L102 84 L60 108 L18 84 L18 36Z" fill="${E2}"/>
      <path d="M60 12 L102 36 L60 52 L18 36Z" fill="${E1}" opacity="0.55"/>
      <path d="M60 108 L18 84 L18 36 L60 52Z" fill="${E3}" opacity="0.5"/>
      <path d="M60 20 L94 40 L94 80 L60 100 L26 80 L26 40Z" fill="none" stroke="${E1}" stroke-width="2.6" opacity="0.75"/>
      <text x="60" y="76" text-anchor="middle" font-family="system-ui, sans-serif"
        font-size="46" font-weight="900" fill="${HI}">${ch}</text>
    </g>`;
}

/** The emblem markup for a subject id, wrapped in its <svg>. */
export function emblemSvg(id, { size = 96 } = {}) {
  const art = EMBLEMS[id] ?? EMBLEMS.open;
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}"
    fill="none" aria-hidden="true">${art}</svg>`;
}

/** A custom pack's monogram, same envelope. */
export function monogramSvg(letter, spin, { size = 96 } = {}) {
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}"
    fill="none" aria-hidden="true">${monogramEmblem(letter, spin)}</svg>`;
}
