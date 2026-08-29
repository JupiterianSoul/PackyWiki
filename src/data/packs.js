/**
 * PACK TABLE
 * ----------------------------------------------------------------------------
 * One row per booster pack. To add a pack, append a row -- the pack picker,
 * the pack art and the accent colouring are all generated from this table.
 *
 * id         - stable key, also written to `data-pack` for CSS hooks.
 * source     - 'random'   : Wikipedia REST /page/random/summary (any article).
 *              'category' : action API search for incategory:"X" (see wiki.js).
 * categories - only read when source === 'category'. One is picked at random
 *              per card, so a pack with several categories feels more varied.
 *              `incategory` matches DIRECT members only (not subcategories), so
 *              a very broad category has a shallower pool than you'd expect.
 *              Any category that returns nothing is skipped automatically and
 *              the draw falls through to the next one, then to a random article.
 * cards      - how many cards the pack contains.
 * accent     - primary accent colour; `accent2` is the gradient partner.
 */
export const PACKS = [
  {
    id: 'classic-archive',
    name: 'Classic Archive',
    tagline: 'Anything the encyclopedia has to offer.',
    icon: '📚',
    source: 'random',
    categories: [],
    cards: 5,
    accent: '#94a3b8',
    accent2: '#475569'
  },
  {
    id: 'science-wing',
    name: 'Science Wing',
    tagline: 'Physics, biology, chemistry, astronomy, mathematics.',
    icon: '🔬',
    source: 'category',
    categories: [
      'Physics',
      'Biology',
      'Chemistry',
      'Astronomy',
      'Mathematics',
      'Chemical elements',
      'Constellations'
    ],
    cards: 5,
    accent: '#22d3ee',
    accent2: '#0369a1'
  },
  {
    id: 'history-hall',
    name: 'History Hall',
    tagline: 'Ancient history, wars, empires, archaeology.',
    icon: '🏛️',
    source: 'category',
    categories: [
      'Ancient history',
      'Wars',
      'Empires',
      'Archaeology',
      'Ancient Rome',
      'Ancient Egypt'
    ],
    cards: 5,
    accent: '#fbbf24',
    accent2: '#92400e'
  },
  {
    id: 'arts-culture',
    name: 'Arts & Culture',
    tagline: 'Painting, music, film, literature.',
    icon: '🎭',
    source: 'category',
    categories: [
      'Painting',
      'Music',
      'Film',
      'Literature',
      'Musical instruments',
      'Art movements'
    ],
    cards: 5,
    accent: '#f472b6',
    accent2: '#86198f'
  },
  {
    id: 'world-atlas',
    name: 'World Atlas',
    tagline: 'Geography, countries, mountains, rivers.',
    icon: '🗺️',
    source: 'category',
    categories: [
      'Geography',
      'Countries',
      'Mountains',
      'Rivers',
      'Volcanoes',
      'Deserts'
    ],
    cards: 5,
    accent: '#4ade80',
    accent2: '#166534'
  }
];

export const packById = (id) => PACKS.find((p) => p.id === id) ?? PACKS[0];
