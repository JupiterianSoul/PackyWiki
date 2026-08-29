/**
 * PACK TABLE
 * ----------------------------------------------------------------------------
 * Three kinds of booster live here:
 *
 *   THEME_PACKS   hand-written, one per subject. Add a row to add a pack.
 *   RARITY_PACKS  generated from the rarity table — one per tier, each biased
 *                 toward its own tier and above.
 *   CUSTOM_KINDS  templates for user-created packs, which resolve a dedicated
 *                 wiki at runtime (see resolveCustomWiki in src/wiki.js).
 *
 * `queries` is a list of Wikipedia search strings. They are used verbatim as
 * `srsearch`, so a row can mix category membership with plain full-text terms:
 *
 *     'incategory:"Sports cars"'   only DIRECT members of that category
 *     'sports car'                 ordinary full-text search
 *
 * One query is picked at random per card. That mix matters because
 * `incategory:` doesn't descend into subcategories, so a broad category alone
 * gives a shallow pool — the free-text queries fill it back out.
 *
 * `icon` is a key in src/data/icons.js, not an emoji.
 */
import { RARITIES, rarityRank } from './rarities.js';

export const THEME_PACKS = [
  {
    id: 'cars', name: 'Cars', icon: 'cars',
    tagline: 'Marques, models and the machines behind them.',
    accent: '#f87171', accent2: '#7f1d1d',
    queries: [
      'incategory:"Sports cars"', 'incategory:"Car manufacturers"',
      'incategory:"Electric cars"', 'incategory:"Cars"',
      'incategory:"Automotive technologies"', 'sports car model', 'automobile marque'
    ]
  },
  {
    id: 'f1', name: 'Formula One', icon: 'f1',
    tagline: 'Drivers, constructors, circuits and Grands Prix.',
    accent: '#ef4444', accent2: '#450a0a',
    queries: [
      'incategory:"Formula One drivers"', 'incategory:"Formula One constructors"',
      'incategory:"Formula One Grands Prix"', 'incategory:"Formula One circuits"',
      'incategory:"Formula One cars"', 'incategory:"Formula One"',
      'Formula One season', 'Formula One driver'
    ]
  },
  {
    id: 'planes', name: 'Planes', icon: 'planes',
    tagline: 'Airliners, fighters and the people who built them.',
    accent: '#60a5fa', accent2: '#1e3a8a',
    queries: [
      'incategory:"Airliners"', 'incategory:"Military aircraft"',
      'incategory:"Aircraft manufacturers"', 'incategory:"Jet aircraft"',
      'incategory:"Aircraft"', 'aircraft type', 'airliner'
    ]
  },
  {
    id: 'video-games', name: 'Video Games', icon: 'video-games',
    tagline: 'Titles, studios, consoles and genres.',
    accent: '#a78bfa', accent2: '#4c1d95',
    queries: [
      'incategory:"Video games"', 'incategory:"Video game developers"',
      'incategory:"Video game consoles"', 'incategory:"Video game genres"',
      'video game', 'video game developer'
    ]
  },
  {
    id: 'books', name: 'Books', icon: 'books',
    tagline: 'Novels, authors and literary movements.',
    accent: '#fbbf24', accent2: '#78350f',
    queries: [
      'incategory:"Novels"', 'incategory:"Books"', 'incategory:"Writers"',
      'incategory:"Literary genres"', 'incategory:"Literature"',
      'novel by', 'literary movement'
    ]
  },
  {
    id: 'movies', name: 'Movies & Shows', icon: 'movies',
    tagline: 'Films, series, directors and genres.',
    accent: '#f472b6', accent2: '#831843',
    queries: [
      'incategory:"Films"', 'incategory:"Television series"',
      'incategory:"Film directors"', 'incategory:"Film genres"',
      'film directed by', 'television series'
    ]
  },
  {
    id: 'space', name: 'Space', icon: 'space',
    tagline: 'Planets, probes, galaxies and missions.',
    accent: '#818cf8', accent2: '#312e81',
    queries: [
      'incategory:"Planets"', 'incategory:"Spacecraft"', 'incategory:"Constellations"',
      'incategory:"Galaxies"', 'incategory:"Astronomical objects"',
      'incategory:"Space missions"', 'space probe', 'star system'
    ]
  },
  {
    id: 'physics', name: 'Physics', icon: 'physics',
    tagline: 'Forces, particles and the laws underneath.',
    accent: '#22d3ee', accent2: '#164e63',
    queries: [
      'incategory:"Physics"', 'incategory:"Concepts in physics"',
      'incategory:"Physical quantities"', 'incategory:"Particle physics"',
      'incategory:"Quantum mechanics"', 'physical law', 'subatomic particle'
    ]
  },
  {
    id: 'nature', name: 'Nature', icon: 'nature',
    tagline: 'Mountains, rivers, deserts and weather.',
    accent: '#34d399', accent2: '#065f46',
    queries: [
      'incategory:"Mountains"', 'incategory:"Rivers"', 'incategory:"Volcanoes"',
      'incategory:"Deserts"', 'incategory:"Waterfalls"', 'incategory:"Landforms"',
      'mountain range', 'national park'
    ]
  },
  {
    id: 'animals', name: 'Animals', icon: 'animals',
    tagline: 'Mammals, birds, reptiles, fish and insects.',
    accent: '#fb923c', accent2: '#7c2d12',
    queries: [
      'incategory:"Mammals"', 'incategory:"Birds"', 'incategory:"Reptiles"',
      'incategory:"Fish"', 'incategory:"Insects"', 'incategory:"Animals"',
      'species of mammal', 'species of bird'
    ]
  },
  {
    id: 'plants', name: 'Plants', icon: 'plants',
    tagline: 'Trees, flowers and everything photosynthetic.',
    accent: '#4ade80', accent2: '#14532d',
    queries: [
      'incategory:"Trees"', 'incategory:"Flowers"', 'incategory:"Plants"',
      'incategory:"Edible plants"', 'incategory:"Flora"',
      'species of plant', 'flowering plant'
    ]
  },
  {
    id: 'history', name: 'History', icon: 'history',
    tagline: 'Empires, wars, ruins and revolutions.',
    accent: '#d6a25c', accent2: '#78350f',
    queries: [
      'incategory:"Ancient history"', 'incategory:"Wars"', 'incategory:"Empires"',
      'incategory:"Archaeology"', 'incategory:"Ancient Rome"',
      'incategory:"Ancient Egypt"', 'incategory:"Battles"', 'ancient civilization'
    ]
  },
  {
    id: 'philosophy', name: 'Philosophy', icon: 'philosophy',
    tagline: 'Thinkers, schools and awkward questions.',
    accent: '#c084fc', accent2: '#581c87',
    queries: [
      'incategory:"Philosophers"', 'incategory:"Philosophy"',
      'incategory:"Philosophical concepts"', 'incategory:"Ethics"',
      'incategory:"Metaphysics"', 'incategory:"Logic"',
      'philosophical theory', 'school of philosophy'
    ]
  },
  {
    id: 'celebrities', name: 'Celebrities', icon: 'celebrities',
    tagline: 'Actors, musicians and household names.',
    accent: '#facc15', accent2: '#713f12',
    queries: [
      'incategory:"Actors"', 'incategory:"Musicians"', 'incategory:"Singers"',
      'incategory:"Television presenters"', 'incategory:"Film actors"',
      'actress known for', 'singer songwriter'
    ]
  },
  {
    id: 'quotes', name: 'Quotes', icon: 'quotes',
    tagline: 'Catchphrases, mottos, proverbs and slogans.',
    accent: '#e879f9', accent2: '#701a75',
    queries: [
      'incategory:"Quotations"', 'incategory:"Catchphrases"', 'incategory:"Slogans"',
      'incategory:"Mottos"', 'incategory:"Proverbs"', 'incategory:"Adages"',
      'famous quotation', 'catchphrase'
    ]
  },
  {
    id: 'art', name: 'Art', icon: 'art',
    tagline: 'Paintings, sculpture, movements and makers.',
    accent: '#fb7185', accent2: '#881337',
    queries: [
      'incategory:"Paintings"', 'incategory:"Painters"', 'incategory:"Art movements"',
      'incategory:"Sculpture"', 'incategory:"Painting"', 'incategory:"Modern art"',
      'painting by', 'art movement'
    ]
  },
  {
    id: 'cactus', name: 'Cactus', icon: 'cactus',
    tagline: 'Cacti and the wider succulent family.',
    accent: '#84cc16', accent2: '#3f6212',
    queries: [
      'incategory:"Cactaceae"', 'incategory:"Cacti"', 'incategory:"Succulent plants"',
      'cactus species', 'succulent plant', 'Opuntia', 'Echinocactus'
    ]
  },
  {
    id: 'sport', name: 'Sport', icon: 'sport',
    tagline: 'Games, leagues, athletes and records.',
    accent: '#2dd4bf', accent2: '#134e4a',
    queries: [
      'incategory:"Sports"', 'incategory:"Olympic sports"', 'incategory:"Team sports"',
      'incategory:"Association football"', 'incategory:"Basketball"',
      'incategory:"Sportspeople"', 'professional athlete', 'sports league'
    ]
  }
].map((pack) => ({ ...pack, group: 'theme', source: 'wikipedia', cards: 5 }));

/**
 * One booster per rarity tier, generated so a new tier automatically gets a
 * pack. Each is biased toward its own tier and above:
 *
 *   tierShift  multiplies every tier's weight by shift^rank, tilting the whole
 *              table upward.
 *   floorTier  excludes everything below it outright, so a Legendary pack
 *              never hands you a Common.
 */
export const RARITY_PACKS = RARITIES.map((rarity, rank) => ({
  id: `rarity-${rarity.id}`,
  name: `${rarity.name} Booster`,
  icon: 'gem',
  tagline: `Weighted toward ${rarity.name} and above.`,
  accent: rarity.color,
  accent2: '#1e2233',
  group: 'rarity',
  source: 'wikipedia',
  cards: 5,
  rarityId: rarity.id,
  // Anything goes in a Common pack; higher tiers get a floor three ranks down.
  roll: { tierShift: 1 + rank * 0.15, floorTier: Math.max(0, rank - 3) },
  // Rarity packs draw from the whole encyclopedia.
  queries: []
}));

/**
 * Templates for user-created packs. The user types a subject (a game, a book,
 * a show); the app finds that subject's own wiki and draws every card from it.
 */
export const CUSTOM_KINDS = [
  {
    id: 'custom-video-game', label: 'Video game', icon: 'video-games',
    placeholder: 'e.g. Terraria', accent: '#a78bfa', accent2: '#4c1d95'
  },
  {
    id: 'custom-book', label: 'Book or series', icon: 'books',
    placeholder: 'e.g. Discworld', accent: '#fbbf24', accent2: '#78350f'
  },
  {
    id: 'custom-screen', label: 'Movie or show', icon: 'movies',
    placeholder: 'e.g. Arcane', accent: '#f472b6', accent2: '#831843'
  }
];

export const customKindById = (id) => CUSTOM_KINDS.find((k) => k.id === id) ?? CUSTOM_KINDS[0];

/** Roll options for a pack — rarity packs override, everything else is default. */
export const packRollOptions = (pack) => pack.roll ?? {};

/** Rank of the tier a rarity pack targets, or null. */
export const packTargetRank = (pack) =>
  pack.rarityId ? rarityRank(pack.rarityId) : null;

export const STATIC_PACKS = [...THEME_PACKS, ...RARITY_PACKS];

export const packById = (id, customPacks = []) =>
  [...STATIC_PACKS, ...customPacks].find((p) => p.id === id) ?? THEME_PACKS[0];
