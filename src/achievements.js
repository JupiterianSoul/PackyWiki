import { RARITIES } from './data/rarities.js';
/**
 * ACHIEVEMENTS
 * ============================================================================
 * A hundred goals across the whole game. Each achievement is COMPUTED from
 * the player's real state - nothing is "awarded" at some moment that could be
 * missed; if the condition holds, the achievement is unlocked. The only thing
 * stored is which ones have been REDEEMED (the reward taken), on the profile:
 *
 *   profile.achievements = { redeemed: ['first-pack', ...] }
 *
 * Most achievements come in CHAINS - the same feat at rising sizes. A chain
 * member carries `chain` (the family id) and `tier` (1-based rung), which is
 * what upgradeable badges hang off later.
 *
 * Rewards scale with difficulty, deliberately stingy at the bottom: the first
 * rung of anything pays pocket change, the middle pays real coins, and only
 * the rungs that take weeks pay in boosters - up to a Prismatic pack for the
 * level cap. Easy money here was quietly out-earning the shop.
 */
import { tx } from './i18n.js';

/**
 * The measurable facts achievements are judged against. main.js builds one
 * of these from live state whenever the list is rendered.
 */
export function measure({ profile, entries, albumsDeep, albumsStarted = 0, customPacks, friends, wallet = 0 }) {
  const rc = profile.rarityCounts ?? {};
  const high = ['legendary', 'mythic', 'exotic', 'prismatic']
    .reduce((sum, id) => sum + (rc[id] ?? 0), 0);
  return {
    boosters: profile.boostersOpened ?? 0,
    cards: Object.values(rc).reduce((sum, n) => sum + n, 0),
    unique: entries.length,
    value: entries.reduce((sum, e) => sum + e.price * e.count, 0),
    level: profile.progress?.level ?? 1,
    albumsDeep,
    albumsStarted,
    legendaries: high,
    prismatics: rc.prismatic ?? 0,
    // Builds ever, not packs currently on the shelf: deleting one must not
    // take an achievement back. The max() keeps old saves whole, since the
    // counter only started existing after their packs did.
    customsBuilt: Math.max(customPacks.length, profile.packsBuilt ?? 0),
    friends,
    dailyClaims: (profile.daily?.board ?? 0) * 30 + (profile.daily?.claimed ?? 0),
    boardsDone: profile.daily?.board ?? 0,
    playHours: (profile.playMs ?? 0) / 3600000,
    sold: profile.cardsSold ?? 0,
    quizPlayed: profile.quizPlayed ?? 0,
    quizWins: profile.quizWins ?? 0,
    quizPerfect: profile.quizPerfect ?? 0,
    giftsSent: profile.giftsSent ?? 0,
    tradesDone: profile.tradesDone ?? 0,
    timedOpened: profile.timed?.opened ?? 0,
    auctionsSold: profile.auctionsSold ?? 0,
    auctionsWon: profile.auctionsWon ?? 0,
    wallet,
    maxCardPrice: entries.reduce((m, e) => Math.max(m, e.price), 0),
    maxViews: entries.reduce((m, e) => Math.max(m, e.views ?? 0), 0),
    favorites: entries.filter((e) => e.favorite).length,
    maxCopies: entries.reduce((m, e) => Math.max(m, e.count), 0),
    // The eight tiers of the table: Special is outside it and a card with no
    // tier on record is not a ninth one.
    raritiesOwned: new Set(entries.map((e) => e.rarityId).filter((id) => RARITIES.some((r) => r.id === id))).size,
    // Album medals claimed, across every album; and cards fused up a tier.
    albumTiers: Object.values(profile.albumTiers ?? {}).reduce((sum, n) => sum + (Number(n) || 0), 0),
    fused: profile.fused ?? 0,
    // The arcade's two newer games: the best duel streak, and perfect reveal rounds.
    duelBest: profile.duelBest ?? 0,
    revealPerfect: profile.revealPerfect ?? 0
  };
}

const coins = (n) => ({ kind: 'coins', coins: n });
const pack = (rarityId, cards = 5) => ({ kind: 'booster', spec: { kind: 'open', themeId: null, rarityId, cards } });

/** "1,500" / "1 500" - descriptions carry the number in each language. */
const en = (n) => n.toLocaleString('en-US');
const fr = (n) => n.toLocaleString('fr-FR').replace(/[  ]/g, ' ');

/** One standalone achievement. */
const A = (id, icon, stat, need, reward, name, desc) =>
  ({ id, icon, stat, need, reward, name, desc });

/**
 * One family of achievements: same stat, rising `need`s. `desc` writes the
 * description for a given size, so the copy never drifts from the number.
 */
const chain = (chainId, icon, stat, desc, steps) => steps.map(([need, reward, name], i) => ({
  id: `${chainId}-${need}`, icon, stat, need, reward,
  name, desc: desc(need, i), chain: chainId, tier: i + 1
}));

export const ACHIEVEMENTS = [

  // --- album medals ---
  ...chain('medal', 'collection', 'albumTiers',
    (n) => ({ en: `Claim ${en(n)} album medal${n === 1 ? '' : 's'}`, fr: `Réclamez ${fr(n)} médaille${n === 1 ? '' : 's'} d’album` }),
    [
      [1,  coins(500),        { en: 'First medal', fr: 'Première médaille' }],
      [5,  coins(2500),       { en: 'A shelf of medals', fr: 'Une étagère de médailles' }],
      [15, pack('legendary', 5), { en: 'Decorated', fr: 'Décoré' }],
      [40, pack('exotic', 5), { en: 'The full cabinet', fr: 'La vitrine complète' }]
    ]),

  // --- the popularity duel ---
  ...chain('duel', 'podium', 'duelBest',
    (n) => ({ en: `A duel streak of ${en(n)}`, fr: `Une série de ${fr(n)} au duel` }),
    [
      [3,  coins(150),        { en: 'Warm-up', fr: 'Échauffement' }],
      [6,  coins(500),        { en: 'Reading the room', fr: 'Lire la salle' }],
      [10, coins(1500),       { en: 'Encyclopaedic', fr: 'Encyclopédique' }],
      [15, pack('legendary', 5), { en: 'The perfect duel', fr: 'Le duel parfait' }]
    ]),

  // --- guess the article ---
  ...chain('reveal', 'search', 'revealPerfect',
    (n) => ({ en: `${en(n)} perfect reveal round${n === 1 ? '' : 's'}`, fr: `${fr(n)} manche${n === 1 ? '' : 's'} parfaite${n === 1 ? '' : 's'} de devinette` }),
    [
      [1,  coins(300),        { en: 'Eight for eight', fr: 'Huit sur huit' }],
      [5,  coins(1200),       { en: 'Sharp eyes', fr: 'L’œil vif' }],
      [20, pack('mythic', 5), { en: 'Through the blur', fr: 'À travers le flou' }]
    ]),

  // --- fusing copies ---
  ...chain('fuse', 'spark', 'fused',
    (n) => ({ en: `Fuse ${en(n)} set${n === 1 ? '' : 's'} of copies`, fr: `Fusionnez ${fr(n)} lot${n === 1 ? '' : 's'} de doubles` }),
    [
      [1,   coins(200),      { en: 'Three into one', fr: 'Trois en un' }],
      [10,  coins(1200),     { en: 'Alchemist', fr: 'Alchimiste' }],
      [50,  pack('mythic', 5), { en: 'The furnace', fr: 'La fournaise' }]
    ]),

  // --- opening boosters ---
  ...chain('pack', 'packs', 'boosters',
    (n) => ({ en: `Open ${en(n)} boosters`, fr: `Ouvrez ${fr(n)} boosters` }),
    [
      [1,    coins(100),        { en: 'First rip', fr: 'Première ouverture' }],
      [10,   coins(250),        { en: 'Getting the hang of it', fr: 'La main est prise' }],
      [50,   coins(800),        { en: 'Serial opener', fr: 'Ouvreur en série' }],
      [150,  coins(2000),       { en: 'Foil in the veins', fr: 'Du papier alu dans les veines' }],
      [400,  pack('epic', 5),   { en: 'Confetti machine', fr: 'Machine à confettis' }],
      [1000, pack('mythic', 5), { en: 'The thousand rips', fr: 'Les mille déchirures' }]
    ]),

  // --- cards pulled ---
  ...chain('cards', 'collection', 'cards',
    (n) => ({ en: `Pull ${en(n)} cards`, fr: `Tirez ${fr(n)} cartes` }),
    [
      [25,   coins(100),           { en: 'A start', fr: 'Un début' }],
      [100,  coins(300),           { en: 'Stacking up', fr: 'Ça s’empile' }],
      [300,  coins(900),           { en: 'The shoebox', fr: 'La boîte à chaussures' }],
      [800,  coins(2200),          { en: 'The great pile', fr: 'La grande pile' }],
      [2000, pack('legendary', 5), { en: 'Paper avalanche', fr: 'Avalanche de papier' }],
      [5000, pack('exotic', 5),    { en: 'Five thousand deep', fr: 'Cinq mille plus loin' }]
    ]),

  // --- different cards owned ---
  ...chain('unique', 'search', 'unique',
    (n) => ({ en: `Own ${en(n)} different cards`, fr: `Possédez ${fr(n)} cartes différentes` }),
    [
      [50,   coins(200),        { en: 'Curator', fr: 'Curateur' }],
      [150,  coins(700),        { en: 'Cataloguer', fr: 'Catalogueur' }],
      [400,  coins(2000),       { en: 'Field guide', fr: 'Guide de terrain' }],
      [1000, pack('mythic', 5), { en: 'The living encyclopedia', fr: 'L’encyclopédie vivante' }]
    ]),

  // --- collection value ---
  ...chain('value', 'gem', 'value',
    (n) => ({ en: `Collection worth ฿${en(n)}`, fr: `Collection à ฿${fr(n)}` }),
    [
      [10000,   coins(250),           { en: 'Worth something', fr: 'Ça vaut quelque chose' }],
      [50000,   coins(1000),          { en: 'Serious money', fr: 'Sérieux capital' }],
      [150000,  coins(2500),          { en: 'Small fortune', fr: 'Petite fortune' }],
      [500000,  pack('legendary', 6), { en: 'The vault', fr: 'Le coffre-fort' }],
      [1500000, pack('exotic', 6),    { en: 'Priceless, almost', fr: 'Inestimable, ou presque' }]
    ]),

  // --- level ---
  ...chain('level', 'trophy', 'level',
    (n) => ({ en: `Reach level ${en(n)}`, fr: `Atteignez le niveau ${fr(n)}` }),
    [
      [5,   coins(150),           { en: 'Warmed up', fr: 'Échauffé' }],
      [10,  coins(300),           { en: 'Settled in', fr: 'Installé' }],
      [20,  coins(700),           { en: 'Veteran', fr: 'Vétéran' }],
      [30,  coins(1200),          { en: 'Living legend', fr: 'Légende vivante' }],
      [50,  coins(2500),          { en: 'Half a hundred', fr: 'Un demi-cent' }],
      [75,  pack('epic', 6),      { en: 'Scholar', fr: 'Érudit' }],
      [100, pack('legendary', 6), { en: 'The third digit', fr: 'Le troisième chiffre' }],
      [200, pack('mythic', 6),    { en: 'Beyond the clouds', fr: 'Au-dessus des nuages' }],
      [350, pack('exotic', 6),    { en: 'Stratosphere', fr: 'Stratosphère' }],
      [500, pack('prismatic', 6), { en: 'The summit', fr: 'Le sommet' }]
    ]),

  // --- albums with real depth --------------------------------------------
  // An album is measured against its category's true size, so "complete" is
  // not a thing anyone will ever do. Depth is the shelf that looks collected:
  // twenty five cards in one book.
  ...chain('album', 'collection', 'albumsDeep',
    (n) => n === 1
      ? { en: 'Get 25 cards into one album', fr: 'Réunissez 25 cartes dans un album' }
      : { en: `Stock ${en(n)} albums with 25 cards each`, fr: `Garnissez ${fr(n)} albums de 25 cartes chacun` },
    [
      [1,  coins(500),          { en: 'Bound and shelved', fr: 'Relié et rangé' }],
      [3,  coins(1500),         { en: 'Librarian', fr: 'Bibliothécaire' }],
      [6,  pack('epic', 5),     { en: 'Wing of the library', fr: 'L’aile de la bibliothèque' }],
      [12, pack('legendary', 5), { en: 'The archive', fr: 'L’archive' }],
      [20, pack('mythic', 6),   { en: 'The whole shelf', fr: 'Toute l’étagère' }]
    ]),

  // --- albums started ---
  ...chain('shelf', 'collection', 'albumsStarted',
    (n) => ({ en: `Put a card in ${en(n)} different albums`, fr: `Placez une carte dans ${fr(n)} albums différents` }),
    [
      [3,  coins(150),  { en: 'Dipping in', fr: 'On y trempe' }],
      [10, coins(600),  { en: 'A bit of everything', fr: 'Un peu de tout' }],
      [20, coins(1800), { en: 'Wide open shelves', fr: 'Étagères grandes ouvertes' }]
    ]),

  // --- big pulls ---
  ...chain('legendary', 'spark', 'legendaries',
    (n) => n === 1
      ? { en: 'Pull a Legendary or better', fr: 'Tirez une Légendaire ou mieux' }
      : { en: `Pull ${en(n)} Legendary-or-better cards`, fr: `Tirez ${fr(n)} cartes Légendaires ou mieux` },
    [
      [1,   coins(300),           { en: 'It shines', fr: 'Ça brille' }],
      [10,  coins(1500),          { en: 'Star magnet', fr: 'Aimant à étoiles' }],
      [40,  pack('legendary', 5), { en: 'Gold rush', fr: 'Ruée vers l’or' }],
      [120, pack('exotic', 5),    { en: 'Walking supernova', fr: 'Supernova ambulante' }]
    ]),

  ...chain('prismatic', 'gem', 'prismatics',
    (n) => n === 1
      ? { en: 'Pull a Prismatic', fr: 'Tirez une Prismatique' }
      : { en: `Pull ${en(n)} Prismatics`, fr: `Tirez ${fr(n)} Prismatiques` },
    [
      [1,  pack('epic', 5),      { en: 'First light', fr: 'Première lumière' }],
      [5,  pack('mythic', 5),    { en: 'Spectrum', fr: 'Spectre' }],
      [15, pack('prismatic', 5), { en: 'Full spectrum', fr: 'Spectre complet' }]
    ]),

  // --- the forge ---
  ...chain('custom', 'wand', 'customsBuilt',
    (n) => n === 1
      ? { en: 'Build a custom booster', fr: 'Créez un booster personnalisé' }
      : { en: `Build ${en(n)} custom boosters`, fr: `Créez ${fr(n)} boosters personnalisés` },
    [
      [1,  coins(200),  { en: 'Wiki smith', fr: 'Forgeron de wiki' }],
      [5,  coins(900),  { en: 'Pack press', fr: 'Presse à paquets' }],
      [15, coins(2500), { en: 'The foundry', fr: 'La fonderie' }]
    ]),

  // --- friends ---
  ...chain('friend', 'friends', 'friends',
    (n) => n === 1
      ? { en: 'Make a friend', fr: 'Ajoutez un ami' }
      : { en: `Have ${en(n)} friends`, fr: `Ayez ${fr(n)} amis` },
    [
      [1, coins(200),  { en: 'Not alone', fr: 'Pas seul' }],
      [3, coins(600),  { en: 'A small circle', fr: 'Un petit cercle' }],
      [8, coins(1800), { en: 'The table is full', fr: 'La table est pleine' }]
    ]),

  // --- gifts to friends ---
  ...chain('gift', 'gift', 'giftsSent',
    (n) => n === 1
      ? { en: 'Send a gift to a friend', fr: 'Envoyez un cadeau à un ami' }
      : { en: `Send ${en(n)} gifts to friends`, fr: `Envoyez ${fr(n)} cadeaux à des amis` },
    [
      [1,  coins(200),           { en: 'It is better to give', fr: 'Le plaisir d’offrir' }],
      [10, coins(900),           { en: 'Secret Santa', fr: 'Père Noël secret' }],
      [50, pack('legendary', 5), { en: 'The patron', fr: 'Le mécène' }]
    ]),

  // --- trades ---
  ...chain('trade', 'trade', 'tradesDone',
    (n) => n === 1
      ? { en: 'Complete a trade', fr: 'Concluez un échange' }
      : { en: `Complete ${en(n)} trades`, fr: `Concluez ${fr(n)} échanges` },
    [
      [1,  coins(200),           { en: 'Fair and square', fr: 'Donnant-donnant' }],
      [10, coins(900),           { en: 'Horse trader', fr: 'Maquignon' }],
      [50, pack('legendary', 5), { en: 'The broker', fr: 'Le courtier' }]
    ]),

  // --- daily gifts ---
  ...chain('daily', 'gift', 'dailyClaims',
    (n) => ({ en: `Claim ${en(n)} daily gifts`, fr: `Réclamez ${fr(n)} cadeaux quotidiens` }),
    [
      [7,   coins(250),         { en: 'A good week', fr: 'Une bonne semaine' }],
      [30,  coins(900),         { en: 'The regular', fr: 'L’habitué' }],
      [90,  coins(2500),        { en: 'A season of it', fr: 'Une saison entière' }],
      [250, pack('mythic', 5),  { en: 'Rain or shine', fr: 'Qu’il pleuve ou qu’il vente' }]
    ]),

  // --- time played ---
  ...chain('hours', 'clock', 'playHours',
    (n) => ({ en: `Play for ${en(n)} hours`, fr: `Jouez ${fr(n)} heures` }),
    [
      [2,  coins(150),           { en: 'Time flies', fr: 'Le temps file' }],
      [10, coins(600),           { en: 'Where did the day go', fr: 'Où est passée la journée' }],
      [30, coins(1500),          { en: 'Hooked', fr: 'Accroché' }],
      [80, pack('legendary', 5), { en: 'Part of the furniture', fr: 'Un meuble de la maison' }]
    ]),

  // --- timed boosters ---
  ...chain('timed', 'hourglass', 'timedOpened',
    (n) => ({ en: `Open ${en(n)} timed boosters`, fr: `Ouvrez ${fr(n)} boosters minutés` }),
    [
      [3,   coins(100),        { en: 'Right on time', fr: 'Pile à l’heure' }],
      [25,  coins(600),        { en: 'Clockwork', fr: 'Réglé comme une horloge' }],
      [100, coins(2000),       { en: 'The metronome', fr: 'Le métronome' }],
      [300, pack('mythic', 5), { en: 'Master of minutes', fr: 'Maître des minutes' }]
    ]),

  // --- selling ---
  ...chain('sold', 'trade', 'sold',
    (n) => ({ en: `Sell ${en(n)} cards`, fr: `Vendez ${fr(n)} cartes` }),
    [
      [5,   coins(150),  { en: 'First trade-in', fr: 'Première reprise' }],
      [50,  coins(800),  { en: 'Market stall', fr: 'Étal de marché' }],
      [250, coins(2500), { en: 'Wholesale', fr: 'Vente en gros' }]
    ]),

  // --- the quiz ---
  ...chain('quiz', 'quiz', 'quizPlayed',
    (n) => n === 1
      ? { en: 'Finish a quiz', fr: 'Terminez un quiz' }
      : { en: `Finish ${en(n)} quizzes`, fr: `Terminez ${fr(n)} quiz` },
    [
      [1,   coins(150),           { en: 'Pop quiz', fr: 'Interro surprise' }],
      [10,  coins(500),           { en: 'Study group', fr: 'Groupe d’étude' }],
      [50,  coins(1800),          { en: 'The examinee', fr: 'Le candidat' }],
      [150, pack('legendary', 5), { en: 'Tenured', fr: 'Titulaire de la chaire' }]
    ]),

  ...chain('quizwin', 'quiz', 'quizWins',
    (n) => ({ en: `Win ${en(n)} quizzes with 3 right or more`, fr: `Gagnez ${fr(n)} quiz avec 3 bonnes réponses ou plus` }),
    [
      [5,   coins(400),        { en: 'Passing grade', fr: 'La moyenne' }],
      [25,  coins(1500),       { en: 'Honor roll', fr: 'Tableau d’honneur' }],
      [100, pack('mythic', 5), { en: 'Summa cum laude', fr: 'Mention très bien' }]
    ]),

  ...chain('perfect', 'quiz', 'quizPerfect',
    (n) => n === 1
      ? { en: 'Answer every question of a quiz right', fr: 'Répondez juste à toutes les questions d’un quiz' }
      : { en: `Get a perfect quiz ${en(n)} times`, fr: `Réussissez un quiz parfait ${fr(n)} fois` },
    [
      [1,  coins(400),         { en: 'Flawless', fr: 'Sans faute' }],
      [10, coins(2000),        { en: 'The perfectionist', fr: 'Le perfectionniste' }],
      [40, pack('exotic', 5),  { en: 'Photographic memory', fr: 'Mémoire photographique' }]
    ]),

  // --- money held at once ---
  ...chain('rich', 'gem', 'wallet',
    (n) => ({ en: `Hold ฿${en(n)} at once`, fr: `Détenez ฿${fr(n)} d’un coup` }),
    [
      [10000,  coins(250),           { en: 'Piggy bank', fr: 'Tirelire' }],
      [50000,  coins(1200),          { en: 'Nest egg', fr: 'Bas de laine' }],
      [250000, pack('legendary', 6), { en: 'Deep pockets', fr: 'Les poches profondes' }]
    ]),

  // --- a single card's worth ---
  ...chain('prize', 'gem', 'maxCardPrice',
    (n) => ({ en: `Own a card worth ฿${en(n)}`, fr: `Possédez une carte à ฿${fr(n)}` }),
    [
      [1500,  coins(300),  { en: 'A fine piece', fr: 'Une belle pièce' }],
      [5000,  coins(1200), { en: 'Centrepiece', fr: 'Pièce maîtresse' }],
      [12000, coins(3000), { en: 'The crown jewel', fr: 'Le joyau de la couronne' }]
    ]),

  // --- a single card's fame ---
  ...chain('fame', 'cloud', 'maxViews',
    (n) => ({ en: `Own a card read ${en(n)} times a month`, fr: `Possédez une carte lue ${fr(n)} fois par mois` }),
    [
      [250000,   coins(300),  { en: 'Front page', fr: 'En première page' }],
      [1000000,  coins(1200), { en: 'Household name', fr: 'Connue de tous' }],
      [10000000, coins(3000), { en: 'The whole world reads it', fr: 'Le monde entier la lit' }]
    ]),

  // --- favorites ---
  ...chain('fav', 'starFilled', 'favorites',
    (n) => n === 1
      ? { en: 'Mark a card as a favorite', fr: 'Mettez une carte en favori' }
      : { en: `Mark ${en(n)} cards as favorites`, fr: `Mettez ${fr(n)} cartes en favori` },
    [
      [1,  coins(100),  { en: 'Teacher’s pet', fr: 'Le chouchou' }],
      [10, coins(300),  { en: 'Shortlist', fr: 'Liste restreinte' }],
      [50, coins(1200), { en: 'Hall of fame', fr: 'Panthéon personnel' }]
    ]),

  // --- copies of one card ---
  ...chain('copies', 'collection', 'maxCopies',
    (n) => ({ en: `Hold ${en(n)} copies of one card`, fr: `Cumulez ${fr(n)} exemplaires d’une même carte` }),
    [
      [3,  coins(150),  { en: 'Déjà vu', fr: 'Déjà-vu' }],
      [10, coins(600),  { en: 'The echo', fr: 'L’écho' }],
      [30, coins(2000), { en: 'Print run', fr: 'Tirage complet' }]
    ]),

  // --- the auction house ---
  ...chain('vendor', 'trade', 'auctionsSold',
    (n) => n === 1
      ? { en: 'Sell a card at auction', fr: 'Vendez une carte aux enchères' }
      : { en: `Sell ${en(n)} cards at auction`, fr: `Vendez ${fr(n)} cartes aux enchères` },
    [
      [1,  coins(200),           { en: 'Gone under the hammer', fr: 'Adjugé' }],
      [10, coins(900),           { en: 'Auctioneer', fr: 'Commissaire-priseur' }],
      [50, pack('legendary', 5), { en: 'House favourite', fr: 'Chouchou de la salle' }]
    ]),

  ...chain('hammer', 'burst', 'auctionsWon',
    (n) => n === 1
      ? { en: 'Win a card at auction', fr: 'Remportez une carte aux enchères' }
      : { en: `Win ${en(n)} cards at auction`, fr: `Remportez ${fr(n)} cartes aux enchères` },
    [
      [1,  coins(200),           { en: 'Winning bid', fr: 'Mise gagnante' }],
      [10, coins(900),           { en: 'The last word', fr: 'Le dernier mot' }],
      [50, pack('legendary', 5), { en: 'King of the floor', fr: 'Roi de la salle' }]
    ]),

  // --- one-offs ---
  A('full-board', 'gift', 'boardsDone', 1, coins(1500),
    { en: 'Full board', fr: 'Plateau complet' },
    { en: 'Finish a whole 30-day gift board', fr: 'Terminez un plateau de cadeaux de 30 jours' }),
  A('one-of-each', 'spark', 'raritiesOwned', 8, pack('exotic', 5),
    { en: 'One of each', fr: 'Un de chaque' },
    { en: 'Own a card of every rarity at once', fr: 'Possédez une carte de chaque rareté en même temps' })
];

/** Unlock state for every achievement, given the measured facts. */
export function evaluate(facts, redeemed = []) {
  const done = new Set(redeemed);
  return ACHIEVEMENTS.map((a) => {
    const have = facts[a.stat] ?? 0;
    return {
      ...a,
      name: tx(a.name), desc: tx(a.desc),
      have: Math.min(have, a.need),
      unlocked: have >= a.need,
      redeemed: done.has(a.id),
      redeemable: have >= a.need && !done.has(a.id)
    };
  });
}

export const redeemableCount = (facts, redeemed = []) =>
  evaluate(facts, redeemed).filter((a) => a.redeemable).length;
