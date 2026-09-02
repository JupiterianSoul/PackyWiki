/**
 * SECRET CODES
 * ============================================================================
 * A code typed into Settings unlocks one SPECIAL booster: a pack made by hand
 * for one person, with everything that comes with it. Every entry below is a
 * whole gift:
 *
 *   - a booster in their colour, on the Custom shelf, holding six cards: the
 *     five things they love, drawn from Wikipedia by exact title, and The
 *     Creator, the same sixth card in every pack;
 *   - the Special rarity for those six cards, a tier of its own above
 *     Prismatic, and a card treatment nobody else's cards wear (cards.css,
 *     keyed by `data-special="<id>"`);
 *   - an album of their own for the six, a theme for the whole app, and a
 *     badge, all three in their colour and about their favourite thing.
 *
 * The cards are locked for good: no selling, no auction, no gift, no trade,
 * and no re-grading, ever (collection.js / main.js check `entry.special`).
 *
 * A code works for anyone who has it, once per save: the count lives in
 * profile.codesRedeemed, so it follows the save through Transfer save and
 * cloud sync, and cannot be spent twice by relaunching.
 *
 * Each card of the five is `{ en, fr }`: the exact Wikipedia titles in both
 * languages (the draw follows the player's language, and falls back to the
 * English article when the French one has nothing to show). An optional
 * `name` renames the card on its face when the article's own title is not
 * the thing the person loves by name. A thing Wikipedia has no page for
 * (a card in a board game, a turret in a video game) names its `wiki` (a
 * Fandom community, found by name the way custom boosters are) and the
 * `search` terms that find the page there, tried in order.
 */
import { getLanguage, tx } from './i18n.js';
import creatorPhoto from './assets/special/creator.jpg';

/** The tier every special card wears. Not in the rarity table: never rolled. */
export const SPECIAL_RARITY_ID = 'special';

export const SECRET_CODES = [
  {
    id: 'simon',
    code: 'S1M0N',
    person: 'Simon',
    accent: '#3b82f6', accent2: '#0b2a6b', light: '#bfdbfe',
    theme: 'rire',
    emblem: 'laugh', foil: 'waves', family: 'marquee', shapes: ['orb', 'star4'],
    name: { en: 'Simon’s Special Booster', fr: 'Booster spécial de Simon' },
    tagline: { en: 'Blue, and laughing about it', fr: 'Bleu, et mort de rire' },
    album: { en: 'Simon’s Special Album', fr: 'Album spécial de Simon' },
    badge: { en: 'Simon’s Special Badge', fr: 'Badge spécial de Simon' },
    message: {
      en: 'Simon. Five things you love, one card that laughs back, and an app that finally gets the joke. This one was made for you.',
      fr: 'Simon. Cinq choses que tu aimes, une carte qui rit avec toi, et une application qui a enfin compris la blague. Celui-là a été fait pour toi.'
    },
    cards: [
      { en: 'Dassault Rafale', fr: 'Dassault Rafale' },
      { en: 'Travis Scott', fr: 'Travis Scott' },
      { en: 'Hollow Knight', fr: 'Hollow Knight' },
      { en: 'Charles Leclerc', fr: 'Charles Leclerc' },
      { en: 'Kanye West', fr: 'Kanye West' }
    ]
  },
  {
    id: 'celeste',
    code: 'C3L3ST3',
    person: 'Céleste',
    accent: '#f472b6', accent2: '#6b1f4a', light: '#fce7f3',
    theme: 'assur',
    emblem: 'lamassu', foil: 'grooves', family: 'arch', shapes: ['petal', 'shard'],
    name: { en: 'Céleste’s Special Booster', fr: 'Booster spécial de Céleste' },
    tagline: { en: 'Rose glaze on the walls of Nineveh', fr: 'Émail rose sur les murs de Ninive' },
    album: { en: 'Céleste’s Special Album', fr: 'Album spécial de Céleste' },
    badge: { en: 'Céleste’s Special Badge', fr: 'Badge spécial de Céleste' },
    message: {
      en: 'Céleste. Kings carved their names into stone so they would last three thousand years. Yours is carved into six cards, in rose, and they last forever. Made for you.',
      fr: 'Céleste. Les rois gravaient leur nom dans la pierre pour durer trois mille ans. Le tien est gravé dans six cartes, en rose, et elles durent pour toujours. Fait pour toi.'
    },
    cards: [
      { en: 'Keanu Reeves', fr: 'Keanu Reeves' },
      { en: 'Phytoplankton', fr: 'Phytoplancton' },
      { en: 'Beauvais', fr: 'Beauvais' },
      { en: 'Nine Inch Nails', fr: 'Nine Inch Nails' },
      { en: 'Hulk', fr: 'Hulk' }
    ]
  },
  {
    id: 'samuel',
    code: 'S4MU3L',
    person: 'Samuel',
    accent: '#1e90ff', accent2: '#0b2f66', light: '#cfe7ff',
    theme: 'pixel',
    emblem: 'pixelheart', foil: 'pixels', family: 'panel', shapes: ['square', 'square-alt'],
    name: { en: 'Samuel’s Special Booster', fr: 'Booster spécial de Samuel' },
    tagline: { en: 'Press start. Dodger blue.', fr: 'Appuie sur start. Bleu dodger.' },
    album: { en: 'Samuel’s Special Album', fr: 'Album spécial de Samuel' },
    badge: { en: 'Samuel’s Special Badge', fr: 'Badge spécial de Samuel' },
    message: {
      en: 'Samuel. New game. Six cards, one life each, no continues needed: they never leave. This one was made for you, player one.',
      fr: 'Samuel. Nouvelle partie. Six cartes, une vie chacune, aucun continue nécessaire : elles ne partent jamais. Celui-là a été fait pour toi, joueur un.'
    },
    cards: [
      { en: 'Clair Obscur: Expedition 33', fr: 'Clair Obscur: Expedition 33' },
      { en: 'Nier: Automata', fr: 'NieR: Automata' },
      { en: 'Nier Replicant ver.1.22474487139...', fr: 'NieR Replicant ver.1.22474487139...', name: { en: 'NieR Replicant', fr: 'NieR Replicant' } },
      { en: 'Landmvrks', fr: 'Landmvrks' },
      { en: 'Jordan Bardella', fr: 'Jordan Bardella' }
    ]
  },
  {
    id: 'noah',
    code: 'N04H',
    person: 'Noah',
    accent: '#a855f7', accent2: '#3b0f6b', light: '#e9d5ff',
    theme: 'tabletop',
    emblem: 'dice', foil: 'facets', family: 'plate', shapes: ['square', 'orb'],
    name: { en: 'Noah’s Special Booster', fr: 'Booster spécial de Noah' },
    tagline: { en: 'Violet felt, your turn', fr: 'Feutre violet, à toi de jouer' },
    album: { en: 'Noah’s Special Album', fr: 'Album spécial de Noah' },
    badge: { en: 'Noah’s Special Badge', fr: 'Badge spécial de Noah' },
    message: {
      en: 'Noah. The table is set, the dice are yours, and six cards are already on the felt. Nobody else gets this hand. Made for you.',
      fr: 'Noah. La table est mise, les dés sont à toi, et six cartes sont déjà sur le feutre. Personne d’autre n’aura cette main. Fait pour toi.'
    },
    cards: [
      { en: 'Adolf Hitler', fr: 'Adolf Hitler' },
      // The card itself, from the game's own wiki: not the animal.
      { en: 'Tardigrades', fr: 'Tardigrades', wiki: 'Terraforming Mars', search: ['Tardigrades'],
        name: { en: 'Tardigrades (Terraforming Mars)', fr: 'Tardigrades (Terraforming Mars)' } },
      { en: 'Leto II Atreides', fr: 'Leto II Atréides', name: { en: 'Leto II, son of Paul Atreides', fr: 'Leto II, fils de Paul Atréides' } },
      // The turret, from the game's own wiki: not the game.
      { en: 'Neurotoxin turret', fr: 'Tourelle neurotoxique', wiki: 'Helldivers',
        search: ['neurotoxin turret', 'gas sentry', 'toxic turret', 'neurotoxic sentry'],
        name: { en: 'The neurotoxin turret (Helldivers)', fr: 'La tourelle neurotoxique (Helldivers)' } },
      // Last before The Creator. A character, so the game's own wiki has the
      // portrait Wikipedia never will.
      { en: 'Sparkle', fr: 'Sparkle', wiki: 'Honkai Star Rail',
        search: ['Sparkle', 'Sparkle/Lore', 'Character/Sparkle'],
        name: { en: 'Sparkle (Honkai: Star Rail)', fr: 'Sparkle (Honkai: Star Rail)' } }
    ]
  },
  /*
   * THE CREATOR. Not a person's booster: a set of regalia.
   *
   * The four codes above each hand over a booster made for one person. This
   * one hands over no cards at all, only the marks of the person who built the
   * game: a badge, a frame that moves, a theme and the launcher icon to match.
   * `regalia: true` is what tells the redeem flow to skip the booster, and
   * `cards: []` keeps every helper that counts them honest.
   */
  {
    id: 'creator',
    code: 'W1KL0D0',
    person: 'Gabriel',
    regalia: true,
    accent: '#fbbf24', accent2: '#7c2d12', light: '#fff7d6',
    theme: 'apotheosis',
    emblem: 'seal', foil: 'goldleaf', family: 'crest', shapes: ['orb', 'square'],
    name: { en: 'The Creator', fr: 'Le Créateur' },
    tagline: { en: 'The one who built it', fr: 'Celui qui l’a construit' },
    album: { en: 'The Creator', fr: 'Le Créateur' },
    badge: { en: 'The Creator', fr: 'Le Créateur' },
    message: {
      en: 'You built this. Gold on gold, a frame that never stops moving, and a theme nobody else will ever wear. There is no booster here on purpose: this code hands over the regalia, not cards.',
      fr: 'Tu as construit tout ça. De l’or sur de l’or, un cadre qui ne s’arrête jamais, et un thème que personne d’autre ne portera. Il n’y a pas de booster ici, volontairement : ce code remet les insignes, pas des cartes.'
    },
    cards: []
  }
];

/**
 * THE CREATOR - the sixth and last card of every special booster, the same
 * in each: the person who made the game, signing the gift. Written by hand,
 * never drawn; the photo ships inside the bundle.
 */
export const CREATOR = {
  key: 'special:creator',
  title: { en: 'The Creator', fr: 'Le Créateur' },
  description: { en: 'Gabriel’s Biography', fr: 'Biographie Gabriel' },
  extract: {
    en: 'Born on 15 January 2008 in Beaumont, Gabriel Quart, whose real name is Gabriel Quart, also known as Arbre Poilu or Arbre Mou, is passionate about computing. He has built a multitude of apps; useless or not, they led him, in September 2026, to create his Wikipedia booster-opening app. Happy with how far it has come, and knowing it would never have existed without the help of the people close to him, Gabriel owed them a surprise of their own, one for each. If you are reading this, it means you are one of those people, so special in his eyes. So he says thank you, once again, whatever the help you gave!',
    fr: 'Né le 15 janvier 2008 à Beaumont, Gabriel Quart, de son vrai nom Gabriel Quart, aussi connu sous le nom d’Arbre Poilu ou encore d’Arbre Mou, est passionné d’informatique. Il a créé une multitude d’applications ; qu’elles soient inutiles ou non, elles l’ont mené, en septembre 2026, à créer son application d’ouverture de boosters Wikipédia. Heureux de son avancement, et sachant qu’il n’aurait jamais vu le jour sans l’aide de ses proches, Gabriel se devait de leur rendre la pareille en créant une surprise pour chacun d’entre eux. Si vous lisez ceci, c’est que vous faites partie de ces proches si spéciaux à ses yeux. Alors il vous dit merci, encore une fois, quelle que soit l’aide apportée !'
  },
  photo: creatorPhoto
};

/** Uppercase, and anything that is not a letter or a digit is noise. */
export function normalizeCode(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** The entry a typed code refers to, or null. */
export function codeByInput(raw) {
  const key = normalizeCode(raw);
  if (!key) return null;
  return SECRET_CODES.find((entry) => normalizeCode(entry.code) === key) ?? null;
}

export const codeById = (id) => SECRET_CODES.find((entry) => entry.id === id) ?? null;

/** How many times this save has redeemed a code. */
export const timesRedeemed = (profile, id) => Number(profile?.codesRedeemed?.[id] ?? 0);

/** Whether this save may still redeem it: once, for anyone who has it. */
export const canRedeem = (profile, entry) => Boolean(entry) && timesRedeemed(profile, entry.id) < 1;

/** Whether this save has ever redeemed it (what unlocks the theme and the badge). */
export const hasRedeemed = (profile, id) => timesRedeemed(profile, id) > 0;

/** The booster spec a code hands over: six cards, no tier, one owner. */
export function codeSpec(entry) {
  return { kind: 'code', codeId: entry.id, rarityId: null, cards: entry.cards.length + 1, themeId: null };
}

/** The name, tagline and colours a code booster wears, in the player's language. */
export function codeLook(entry) {
  return {
    name: tx(entry?.name) || '',
    tagline: tx(entry?.tagline) || '',
    accent: entry?.accent ?? '#f472b6',
    accent2: entry?.accent2 ?? '#7c3aed',
    light: entry?.light ?? '#ffffff'
  };
}

/** The five exact titles for the draw, in one language, with their display names. */
export function codeTitles(entry, lang = getLanguage()) {
  return (entry?.cards ?? []).map((card) => ({
    title: card[lang] ?? card.en,
    fallback: card.en,
    name: card.name ? tx(card.name) : null
  }));
}

/**
 * The Creator as a card, in the player's language, in the shape every drawn
 * card has. `special` names the code it came in with, so the card wears that
 * booster's colour on its back and lands in that person's album; the face
 * treatment is the Creator's own, shared by every pack.
 */
export function creatorCard(codeId) {
  return {
    // One Creator per booster: the key carries the code, so redeeming a
    // second code adds a second card to that album rather than a second
    // copy to the first.
    key: `${CREATOR.key}:${codeId}`,
    sourceId: 'special',
    sourceName: 'Wiklodo',
    pageId: null,
    title: tx(CREATOR.title),
    description: tx(CREATOR.description),
    extract: tx(CREATOR.extract),
    thumbnail: CREATOR.photo,
    url: null,
    lang: getLanguage(),
    views: null,
    wordCount: null,
    popularity: 1,
    special: codeId,
    creator: true
  };
}
