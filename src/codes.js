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

/**
 * Codes that once existed and were withdrawn. Everything they handed over is
 * removed from a save at launch (main.js, purgeRetiredCodes) as if the code
 * had never been typed: the cards, the booster, the badge, the theme, and
 * the redemption itself. A retired id is never reused.
 */
export const RETIRED_CODES = ['lorna'];

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
      // The card itself, from the game's own wiki: not the animal. The
      // endpoints are named outright because guessing a Fandom slug from a
      // game's title is a coin toss, and this card has to be the right one.
      { en: 'Tardigrades', fr: 'Tardigrades',
        wiki: 'Terraforming Mars',
        wikiUrls: ['https://terraforming-mars.fandom.com/api.php', 'https://terraformingmars.fandom.com/api.php'],
        page: 'Tardigrades', search: ['Tardigrades'],
        name: { en: 'Tardigrades (Terraforming Mars)', fr: 'Tardigrades (Terraforming Mars)' },
        text: {
          en: 'A microbe project card in Terraforming Mars. It costs four megacredits, gains a microbe every generation, and each three microbes on it are worth one victory point at the end of the game. Small, patient and quietly decisive.',
          fr: 'Une carte projet microbe dans Terraforming Mars. Elle coûte quatre mégacrédits, gagne un microbe à chaque génération, et chaque groupe de trois microbes vaut un point de victoire en fin de partie. Petite, patiente et discrètement décisive.'
        } },
      { en: 'Leto II Atreides', fr: 'Leto II Atréides',
        wiki: 'Dune', wikiUrls: ['https://dune.fandom.com/api.php'],
        page: 'Leto Atreides II', search: ['Leto Atreides II', 'Leto II', 'God Emperor of Dune'],
        name: { en: 'Leto II, son of Paul Atreides', fr: 'Leto II, fils de Paul Atréides' },
        text: {
          en: 'The son of Paul Atreides, who took the sandtrout onto his skin and became the God Emperor of Dune. He ruled for three thousand five hundred years to force humanity down the Golden Path, and let himself be killed the moment it was safe.',
          fr: 'Le fils de Paul Atréides, qui prit les truites des sables sur sa peau et devint le God Emperor de Dune. Il régna trois mille cinq cents ans pour forcer l’humanité sur le Sentier d’Or, et se laissa tuer dès que ce fut possible.'
        } },
      // The turret, from the game's own wiki: not the game.
      { en: 'Neurotoxin turret', fr: 'Tourelle neurotoxique',
        wiki: 'Helldivers',
        wikiUrls: ['https://helldivers.fandom.com/api.php', 'https://helldivers.wiki.gg/api.php'],
        search: ['neurotoxin turret', 'A/AC-7 Neurotoxin', 'gas sentry', 'toxic turret', 'neurotoxic sentry'],
        name: { en: 'The neurotoxin turret (Helldivers)', fr: 'La tourelle neurotoxique (Helldivers)' },
        text: {
          en: 'A sentry stratagem called down from orbit, planted in the dirt and left to work. It fills the ground around it with neurotoxin, holds a corridor on its own, and does not care in the slightest which side of the line you are standing on.',
          fr: 'Une sentinelle appelée depuis l’orbite, plantée dans la terre et laissée à son travail. Elle remplit le sol autour d’elle de neurotoxine, tient un couloir toute seule, et se moque complètement du côté de la ligne où vous vous trouvez.'
        } },
      // Last before The Creator. A character, so the game's own wiki has the
      // portrait Wikipedia never will.
      { en: 'Sparkle', fr: 'Sparkle',
        wiki: 'Honkai Star Rail',
        wikiUrls: ['https://honkai-star-rail.fandom.com/api.php', 'https://honkaistarrail.fandom.com/api.php'],
        page: 'Sparkle', search: ['Sparkle', 'Sparkle/Lore', 'Character/Sparkle'],
        name: { en: 'Sparkle (Honkai: Star Rail)', fr: 'Sparkle (Honkai: Star Rail)' },
        text: {
          en: 'A Masked Fool of the Harmony, quantum element, and a liar with excellent timing. She wears whichever face the scene calls for, plays the whole Astral Express for her own amusement, and is genuinely delightful about it.',
          fr: 'Une Masque de la Folie, élément quantique, et une menteuse au timing parfait. Elle porte le visage que la scène demande, joue tout l’Astral Express pour son propre amusement, et le fait avec un vrai charme.'
        } }
    ]
  },
  {
    id: 'julien',
    code: 'JUL13N',
    person: 'Julien',
    accent: '#d8c39a', accent2: '#5c4426', light: '#f5ead6',
    theme: 'raclette',
    emblem: 'wheel', foil: 'goldleaf', family: 'roundel', shapes: ['orb', 'square'],
    name: { en: 'Julien’s Special Booster', fr: 'Booster spécial de Julien' },
    tagline: { en: 'Beige, and melted over everything', fr: 'Beige, et fondu sur tout' },
    album: { en: 'Julien’s Special Album', fr: 'Album spécial de Julien' },
    badge: { en: 'Julien’s Special Badge', fr: 'Badge spécial de Julien' },
    message: {
      en: 'Julien. The half wheel is under the lamp, the evening is long, and five cards are warming beside it. Nobody else gets this one. Made for you.',
      fr: 'Julien. La demi-meule est sous la lampe, la soirée est longue, et cinq cartes chauffent à côté. Personne d’autre n’aura celui-ci. Fait pour toi.'
    },
    cards: [
      { en: 'Telescope', fr: 'Télescope' },
      { en: 'Milky Way', fr: 'Voie lactée' },
      { en: 'Arcade cabinet', fr: 'Borne d’arcade' },
      { en: 'Sunset', fr: 'Coucher de soleil' },
      { en: 'Ragdoll', fr: 'Ragdoll', name: { en: 'Ragdoll (cat)', fr: 'Ragdoll (chat)' } }
    ]
  },
  {
    id: 'catherine',
    code: 'C4TH3R1N3',
    person: 'Catherine',
    accent: '#2dd4bf', accent2: '#0f4c47', light: '#ccfbf1',
    theme: 'lecture',
    emblem: 'openbook', foil: 'linen', family: 'plate', shapes: ['square', 'orb'],
    name: { en: 'Catherine’s Special Booster', fr: 'Booster spécial de Catherine' },
    tagline: { en: 'Turquoise, and one more chapter', fr: 'Turquoise, et encore un chapitre' },
    album: { en: 'Catherine’s Special Album', fr: 'Album spécial de Catherine' },
    badge: { en: 'Catherine’s Special Badge', fr: 'Badge spécial de Catherine' },
    message: {
      en: 'Catherine. The lamp is on, the page is turned, and five cards were kept between the leaves. Nobody else gets this one. Made for you.',
      fr: 'Catherine. La lampe est allumée, la page est tournée, et cinq cartes attendaient entre les feuilles. Personne d’autre n’aura celui-ci. Fait pour toi.'
    },
    cards: [
      { en: 'Book', fr: 'Livre' },
      { en: 'Forest', fr: 'Forêt' },
      { en: 'Cooking', fr: 'Cuisine' },
      { en: 'Yoga', fr: 'Yoga' },
      { en: 'Travel', fr: 'Voyage' }
    ]
  },
  {
    id: 'mathilde',
    code: 'M4TH1LD3',
    person: 'Mathilde',
    accent: '#a78bfa', accent2: '#3b1f6b', light: '#ede9fe',
    theme: 'yaourt',
    emblem: 'pot', foil: 'linen', family: 'roundel', shapes: ['orb', 'square'],
    name: { en: 'Mathilde’s Special Booster', fr: 'Booster spécial de Mathilde' },
    tagline: { en: 'Violet, and a spoon already in it', fr: 'Violet, et la cuillère déjà dedans' },
    album: { en: 'Mathilde’s Special Album', fr: 'Album spécial de Mathilde' },
    badge: { en: 'Mathilde’s Special Badge', fr: 'Badge spécial de Mathilde' },
    message: {
      en: 'Mathilde. Violet all the way through, an episode already running, and five cards waiting with the spoon. Nobody else gets this one. Made for you.',
      fr: 'Mathilde. Du violet de bout en bout, un épisode déjà lancé, et cinq cartes qui attendent avec la cuillère. Personne d’autre n’aura celui-ci. Fait pour toi.'
    },
    cards: [
      { en: 'Cat', fr: 'Chat', name: { en: 'Cats', fr: 'Les chats' } },
      { en: 'Desperate Housewives', fr: 'Desperate Housewives' },
      { en: 'Gilmore Girls', fr: 'Gilmore Girls' },
      { en: 'Skiing', fr: 'Ski' },
      { en: 'Book', fr: 'Livre', name: { en: 'Books', fr: 'Les livres' } }
    ]
  },
  /*
   * THE CREATOR'S OWN. Not a person's booster made by someone else: the one
   * the person who built the game made for himself. Salmon pink and black,
   * the band on every card of the first row, and the things around the band.
   * Fifteen cards, the most of any code, a level frame and a badge that burn,
   * and a treatment of its own (cards.css, data-special="hellfire").
   *
   * The band's members have no articles of their own but one; those cards
   * are read from the band's article, wear their own name and text, and
   * carry the band's picture. The Matrix card is not a photograph at all:
   * its face is drawn on the spot as the rain of the Matrix theme.
   */
  {
    id: 'hellfire',
    code: 'H3LLF1R3',
    person: 'Gabriel',
    accent: '#fa8072', accent2: '#5b1717', light: '#ffe4de',
    theme: 'hellfire',
    emblem: 'hellfire', foil: 'facets', family: 'crest', shapes: ['shard', 'star4'],
    name: { en: 'The Creator’s Special Booster', fr: 'Booster spécial du Créateur' },
    tagline: { en: 'Salmon pink, to the hellfire', fr: 'Rose saumon, vers le feu de l’enfer' },
    album: { en: 'The Creator’s Special Album', fr: 'Album spécial du Créateur' },
    badge: { en: 'The Creator’s Special Badge', fr: 'Badge spécial du Créateur' },
    message: {
      en: 'Gabriel. You made every other booster in this game for somebody else. This one is yours: the band, the games, the show, the rain. Fifteen cards and yourself, salmon pink, lava under every one of them, a frame that burns and a badge that never goes out. Made by you, for you.',
      fr: 'Gabriel. Tu as fait chaque autre booster de ce jeu pour quelqu’un d’autre. Celui-là est le tien : le groupe, les jeux, la série, la pluie. Quinze cartes et toi, rose saumon, de la lave sous chacune, un cadre qui brûle et un badge qui ne s’éteint jamais. Fait par toi, pour toi.'
    },
    cards: [
      { en: 'Lorna Shore', fr: 'Lorna Shore' },
      { en: 'Will Ramos', fr: 'Will Ramos',
        text: {
          en: 'The voice of Lorna Shore since 2018. Will Ramos sings deathcore the way a storm sings: gutturals that drop through the floor, shrieks that go through the ceiling, and, in between, a kind of tenderness nobody expects. He made the band the biggest thing in the genre with To the Hellfire, and then with Pain Remains.',
          fr: 'La voix de Lorna Shore depuis 2018. Will Ramos chante le deathcore comme une tempête : des gutturaux qui traversent le plancher, des cris qui percent le plafond, et entre les deux une tendresse que personne n’attend. Il a fait du groupe le plus gros nom du genre avec To the Hellfire, puis avec Pain Remains.'
        } },
      { en: 'Lorna Shore', fr: 'Lorna Shore', slot: 'demicco', name: { en: 'Adam De Micco', fr: 'Adam De Micco' },
        text: {
          en: 'Lead guitar, and the last founding member still in Lorna Shore. Adam De Micco writes the riffs the band is built on: symphonic, technical, and then, without warning, a breakdown that could level a building. He has been there since 2010, through every line-up, and the sound is his.',
          fr: 'Guitare solo, et le dernier membre fondateur encore dans Lorna Shore. Adam De Micco écrit les riffs sur lesquels le groupe est bâti : symphoniques, techniques, puis, sans prévenir, un breakdown à raser un immeuble. Il est là depuis 2010, à travers chaque formation, et le son est le sien.'
        } },
      { en: 'Lorna Shore', fr: 'Lorna Shore', slot: 'oconnor', name: { en: 'Andrew O’Connor', fr: 'Andrew O’Connor' },
        text: {
          en: 'Rhythm guitar, the wall the rest of the band stands in front of. Andrew O’Connor joined in 2019 and locked in with De Micco so tightly that the two guitars read as one enormous instrument. Every chug on Pain Remains that feels like a door slamming is his.',
          fr: 'Guitare rythmique, le mur devant lequel le reste du groupe se tient. Andrew O’Connor a rejoint le groupe en 2019 et s’est calé sur De Micco si serré que les deux guitares se lisent comme un seul instrument énorme. Chaque chug de Pain Remains qui sonne comme une porte qui claque est le sien.'
        } },
      { en: 'Lorna Shore', fr: 'Lorna Shore', slot: 'archey', name: { en: 'Austin Archey', fr: 'Austin Archey' },
        text: {
          en: 'Drums, since 2012. Austin Archey plays blast beats at speeds that look like a rendering error and still makes them groove; the cymbal work under the orchestras is half of why the songs feel cinematic rather than merely fast. The engine room of Lorna Shore.',
          fr: 'Batterie, depuis 2012. Austin Archey joue des blast beats à des vitesses qui ressemblent à un bug d’affichage et les fait quand même groover ; le travail de cymbales sous les orchestrations est la moitié de ce qui rend les morceaux cinématographiques plutôt que simplement rapides. La salle des machines de Lorna Shore.'
        } },
      { en: 'Lorna Shore', fr: 'Lorna Shore', slot: 'yager', name: { en: 'Michael Yager', fr: 'Michael Yager' },
        text: {
          en: 'Bass, and the low end that makes the breakdowns physical. Michael Yager joined in 2020, in time for the band’s biggest years, and holds the floor under all of it: the guitars can go anywhere because the bass is always exactly where it should be.',
          fr: 'Basse, et le grave qui rend les breakdowns physiques. Michael Yager a rejoint le groupe en 2020, à temps pour ses plus grandes années, et tient le sol sous tout ça : les guitares peuvent aller n’importe où parce que la basse est toujours exactement là où il faut.'
        } },
      { en: 'Terraria', fr: 'Terraria' },
      { en: 'Dead Cells', fr: 'Dead Cells' },
      { en: 'The Mentalist', fr: 'Mentalist (série télévisée)', name: { en: 'The Mentalist', fr: 'The Mentalist' } },
      { en: 'The Matrix', fr: 'Matrix (film)', name: { en: 'Matrix', fr: 'Matrix' }, art: 'matrix' },
      { en: 'Computer programming', fr: 'Programmation informatique', name: { en: 'Programming', fr: 'Programmation' } },
      { en: 'Video game', fr: 'Jeu vidéo', name: { en: 'Video games', fr: 'Jeux vidéo' } },
      { en: 'Death metal', fr: 'Death metal', name: { en: 'Death metal', fr: 'Death metal' } },
      { en: 'The Binding of Isaac (video game)', fr: 'The Binding of Isaac', name: { en: 'The Binding of Isaac', fr: 'The Binding of Isaac' } },
      { en: 'Esquie', fr: 'Esquie',
        wiki: 'Clair Obscur: Expedition 33',
        wikiUrls: ['https://clairobscur.fandom.com/api.php', 'https://clair-obscur-expedition-33.fandom.com/api.php', 'https://expedition33.fandom.com/api.php'],
        page: 'Esquie', search: ['Esquie', 'Esquie (character)'],
        name: { en: 'Esquie (Clair Obscur: Expedition 33)', fr: 'Esquie (Clair Obscur : Expedition 33)' },
        text: {
          en: 'A big, soft, unbothered creature from Clair Obscur: Expedition 33, who carries the Expedition across the continent, swims, flies once he finds his friend, and is happy about absolutely everything. In a game about grief, Esquie is the part that is not.',
          fr: 'Une grosse créature douce et imperturbable de Clair Obscur : Expedition 33, qui porte l’Expédition à travers le continent, nage, vole une fois son ami retrouvé, et se réjouit d’absolument tout. Dans un jeu sur le deuil, Esquie est la partie qui n’en est pas.'
        } }
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

/**
 * The five exact titles for the draw, in one language, with their display
 * names and everything the draw needs to find the right page.
 *
 * A card that names a `wiki` is a thing Wikipedia has no page for: a card in
 * a board game, a turret in a shooter, a character in a gacha. Those fields
 * have to travel with the title, or the draw falls back to the encyclopaedia
 * and hands over the real animal instead of the game card.
 */
export function codeTitles(entry, lang = getLanguage()) {
  return (entry?.cards ?? []).map((card) => ({
    title: card[lang] ?? card.en,
    fallback: card.en,
    name: card.name ? tx(card.name) : null,
    wiki: card.wiki ?? null,
    wikiUrls: card.wikiUrls ?? null,
    page: card.page ?? null,
    search: card.search ?? null,
    text: card.text ? tx(card.text) : null,
    art: card.art === 'matrix' ? matrixArt : null,
    slot: card.slot ?? null
  }));
}

const norm = (value) => String(value ?? '').trim().toLowerCase();

/** Every name one card of a code has ever been drawn or stored under. */
const cardAliases = (card) => [card.en, card.fr, card.page, card.name?.en, card.name?.fr]
  .filter(Boolean).map(norm);

/**
 * The card a stored entry was meant to be, matched by name.
 *
 * A collection written by an older build holds special cards drawn from the
 * wrong place, and their keys are not the keys they would get today. Names
 * are what survived: the entry carries the display name it was dealt under,
 * and the article it was read from, and one of the two always matches.
 */
export function codeCardFor(codeId, entry, lang = getLanguage()) {
  const code = codeById(codeId);
  if (!code) return null;
  const marks = [entry?.title, entry?.article].filter(Boolean).map(norm);
  if (!marks.length) return null;
  // Several cards of one code can be read from the same article (a band's
  // members, from the band's page): the name on the face decides first.
  const byName = (code.cards ?? []).findIndex((card) => card.name && [card.name.en, card.name.fr].map(norm).includes(norm(entry?.title)));
  const index = byName >= 0 ? byName
    : (code.cards ?? []).findIndex((card) => cardAliases(card).some((alias) => marks.includes(alias)));
  if (index < 0) return null;
  return codeTitles(code, lang)[index] ?? null;
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
    sourceName: 'Wikster',
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

/**
 * THE MATRIX CARD'S FACE, drawn rather than photographed: the falling rain
 * of the Matrix theme, frozen on a card. Green glyphs on black, brightest at
 * the head of each column, fading up the tail; a plate the size of a card
 * so it looks right on the face and in the binder. Null outside a browser.
 */
export function matrixArt() {
  if (typeof document === 'undefined') return null;
  try {
    const W = 480, H = 640;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#010b04';
    ctx.fillRect(0, 0, W, H);
    const colW = 22, cell = 24;
    const glyphs = '01アイウエオカキクケコサシスセソタチツテト<>+*';
    ctx.font = '18px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    // Deterministic: the same card every time it is drawn.
    let seed = 1337;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < Math.ceil(W / colW); i++) {
      const length = 8 + Math.floor(rnd() * 12);
      const head = Math.floor(rnd() * (H / cell + length));
      for (let seg = 0; seg < length; seg++) {
        const y = (head - seg) * cell;
        if (y < -cell || y > H + cell) continue;
        const fade = 1 - seg / length;
        ctx.fillStyle = seg === 0 ? 'rgba(200, 255, 215, 0.95)' : `rgba(0, 255, 65, ${(0.18 + 0.6 * fade * fade).toFixed(3)})`;
        ctx.fillText(glyphs[Math.floor(rnd() * glyphs.length)], i * colW + colW / 2, y);
      }
    }
    // A soft green glow in the middle, so the face has a centre.
    const glow = ctx.createRadialGradient(W / 2, H * 0.42, 20, W / 2, H * 0.42, H * 0.6);
    glow.addColorStop(0, 'rgba(0, 255, 65, 0.16)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
