/**
 * Language.
 *
 * The choice is made once, in the first-run dialog, and then locked. That is a
 * deliberate limitation rather than an oversight: cards are stored with the
 * text the wiki gave us, and re-translating a whole collection would mean
 * re-fetching every card through langlinks — slow, lossy, and liable to fail
 * halfway. Locking keeps every card in the binder consistent with every other.
 *
 * The language decides which Wikipedia is queried, which search terms a pack
 * uses, and which Fandom language path a custom booster resolves against, so
 * cards are always in the selected language rather than whatever the wiki
 * happened to return.
 */

const LANG_KEY = 'packywiki.language';

export const LANGUAGES = [
  { id: 'en', label: 'English', wiki: 'en' },
  { id: 'fr', label: 'Français', wiki: 'fr' }
];

const STRINGS = {
  en: {
    tagline: 'Wikipedia, by the booster pack.',
    tabBoosters: 'Boosters',
    tabCustom: 'Custom',
    tabShop: 'Shop',
    tabCollection: 'Collection',
    odds: 'Odds',
    soundOn: 'Sound on',
    soundOff: 'Muted',
    close: 'Close',
    back: 'Back',
    cancel: 'Cancel',

    // shelf
    shelfEmpty: 'No boosters yet. Visit the Shop to buy some.',
    shelfEmptyCustom: 'No custom boosters yet. Name a subject below to build one.',
    openPack: 'Open pack',
    owned: 'Owned',
    youOwn: 'You own {n}',
    swipeShelf: 'Swipe the shelf to browse.',
    cards: 'cards',
    allBoosters: 'All boosters',
    wildcard: 'Wildcard',
    rarityBooster: '{rarity} Booster',

    // opening
    slideToRip: 'Slide the rip line sideways to tear it open.',
    swipeToReveal: 'Swipe right to left for the next card.',
    swipeEitherWay: 'Swipe either way to move through the pack.',
    packDone: 'Cards saved to your collection.',
    cardOf: 'Card {i} of {n}',
    packSummary: '{n} cards · saved to your collection',
    openFailed: '{error}. Check your connection and try again.',

    // collection
    unique: 'unique',
    copies: 'cards',
    total: 'total',
    favourites: 'Favourites',
    filters: 'Filters',
    hideFilters: 'Hide filters',
    searchTitles: 'Search titles…',
    allPacks: 'All packs',
    allRarities: 'All rarities',
    anyPopularity: 'Any popularity',
    anyPrice: 'Any price',
    priceOver: '{amount}+',
    reset: 'Reset',
    emptyCollection: 'Nothing here yet. Open a booster and your pulls land in this binder.',
    noMatches: 'No cards match these filters.',
    sortRecent: 'Newest first',
    sortPriceDesc: 'Price: high to low',
    sortPriceAsc: 'Price: low to high',
    sortRarity: 'Rarity',
    sortPopular: 'Most popular',
    sortName: 'A to Z',

    // card detail
    read: 'Read the article',
    sell: 'Sell for {amount}',
    sellConfirm: 'Sure? Tap to confirm',
    sold: 'Sold for {amount}',
    copiesOwned: '{n} copies',
    viewsPerMonth: '{views}/month',

    // custom
    customIntro: 'Name a game, book, film or show and PackyWiki finds that subject’s own wiki, then builds a booster entirely out of it.',
    customPlaceholder: 'e.g. Terraria',
    create: 'Create',
    creating: 'Booster Pack is being created…',
    createFailed: 'Booster cannot be created, try something else.',
    createOk: '“{name}” booster ready: {n} pages on {wiki}.',
    typeNameFirst: 'Type a name first.',
    deleteBooster: 'Delete the {name} booster',

    // shop
    shopIntro: 'Stock rotates every two hours.',
    restockIn: 'Restock in {time}',
    buy: 'Buy',
    bought: 'Bought!',
    cantAfford: 'Not enough Buckarooz',
    stipendPaid: 'Restock bonus: {amount}',
    shopRarityRow: '{rarity} boosters',
    shopThemeRow: '{theme} boosters',
    shopMixedRow: 'Mixed shelf',
    shopValueRow: 'Cheap and cheerful',

    // first run
    welcomeTitle: 'Welcome to PackyWiki',
    welcomeBody: 'Pick a language. This one is permanent, because every card is stored in the language it was pulled in.',
    starterTitle: 'Here’s your starter kit',
    starterBody: 'You get {coins} and {packs} boosters to begin with. Sell duplicates, and check the Shop every couple of hours for new stock and a restock bonus.',
    letsGo: 'Let’s go',

    // odds modal
    walletTitle: 'Buckarooz',
    walletWhat: 'Buckarooz are the currency of PackyWiki. Your balance is shown in the top bar.',
    walletEarn: 'Earn them by selling cards from your collection, and from the restock bonus paid every time the Shop refreshes.',
    walletSpend: 'Spend them in the Shop on boosters. Bigger boosters and rarer ones cost more.',
    walletNote: 'Selling a whole booster never pays back what it cost, so collecting gets you further than churning.',
    walletEarnTitle: 'Earning',
    walletSpendTitle: 'Spending',

    pullRates: 'Pull rates',
    oddsNote: 'Rarity is rolled per card. Every article has the same chance at every tier. How many people read it changes what the card is worth, not how rare it is.',
    rarity: 'Rarity',
    chance: 'Chance'
  },

  fr: {
    tagline: 'Wikipédia, par paquet de boosters.',
    tabBoosters: 'Boosters',
    tabCustom: 'Perso',
    tabShop: 'Boutique',
    tabCollection: 'Collection',
    odds: 'Chances',
    soundOn: 'Son activé',
    soundOff: 'Muet',
    close: 'Fermer',
    back: 'Retour',
    cancel: 'Annuler',

    shelfEmpty: 'Aucun booster. Passez à la Boutique pour en acheter.',
    shelfEmptyCustom: 'Aucun booster personnalisé. Indiquez un sujet ci-dessous.',
    openPack: 'Ouvrir le booster',
    owned: 'Possédés',
    youOwn: 'Vous en avez {n}',
    swipeShelf: 'Balayez l’étagère pour parcourir.',
    cards: 'cartes',
    allBoosters: 'Tous les boosters',
    wildcard: 'Joker',
    rarityBooster: 'Booster {rarity}',

    slideToRip: 'Faites glisser la ligne de déchirure sur le côté pour ouvrir.',
    swipeToReveal: 'Balayez de droite à gauche pour la carte suivante.',
    swipeEitherWay: 'Balayez dans les deux sens pour parcourir le booster.',
    packDone: 'Cartes ajoutées à votre collection.',
    cardOf: 'Carte {i} sur {n}',
    packSummary: '{n} cartes · ajoutées à votre collection',
    openFailed: '{error}. Vérifiez votre connexion et réessayez.',

    unique: 'uniques',
    copies: 'cartes',
    total: 'total',
    favourites: 'Favoris',
    filters: 'Filtres',
    hideFilters: 'Masquer les filtres',
    searchTitles: 'Rechercher un titre…',
    allPacks: 'Tous les boosters',
    allRarities: 'Toutes les raretés',
    anyPopularity: 'Toute popularité',
    anyPrice: 'Tout prix',
    priceOver: '{amount}+',
    reset: 'Réinitialiser',
    emptyCollection: 'Rien ici pour l’instant. Ouvrez un booster et vos cartes arriveront dans ce classeur.',
    noMatches: 'Aucune carte ne correspond à ces filtres.',
    sortRecent: 'Plus récentes',
    sortPriceDesc: 'Prix : décroissant',
    sortPriceAsc: 'Prix : croissant',
    sortRarity: 'Rareté',
    sortPopular: 'Plus populaires',
    sortName: 'De A à Z',

    read: 'Lire l’article',
    sell: 'Vendre pour {amount}',
    sellConfirm: 'Sûr ? Touchez pour confirmer',
    sold: 'Vendue pour {amount}',
    copiesOwned: '{n} exemplaires',
    viewsPerMonth: '{views}/mois',

    customIntro: 'Indiquez un jeu, un livre, un film ou une série et PackyWiki trouve le wiki dédié, puis construit un booster entièrement à partir de celui-ci.',
    customPlaceholder: 'ex. Terraria',
    create: 'Créer',
    creating: 'Création du booster en cours…',
    createFailed: 'Impossible de créer le booster, essayez autre chose.',
    createOk: 'Booster « {name} » prêt : {n} pages sur {wiki}.',
    typeNameFirst: 'Entrez d’abord un nom.',
    deleteBooster: 'Supprimer le booster {name}',

    shopIntro: 'Le stock change toutes les deux heures.',
    restockIn: 'Réassort dans {time}',
    buy: 'Acheter',
    bought: 'Acheté !',
    cantAfford: 'Pas assez de Buckarooz',
    stipendPaid: 'Bonus de réassort : {amount}',
    shopRarityRow: 'Boosters {rarity}',
    shopThemeRow: 'Boosters {theme}',
    shopMixedRow: 'Étagère mixte',
    shopValueRow: 'Petits prix',

    welcomeTitle: 'Bienvenue dans PackyWiki',
    welcomeBody: 'Choisissez une langue. Ce choix est définitif, car chaque carte est stockée dans la langue où elle a été tirée.',
    starterTitle: 'Voici votre kit de départ',
    starterBody: 'Vous commencez avec {coins} et {packs} boosters. Vendez les doublons, et passez à la Boutique toutes les deux heures pour du nouveau stock et un bonus de réassort.',
    letsGo: 'C’est parti',

    walletTitle: 'Buckarooz',
    walletWhat: 'Les Buckarooz sont la monnaie de PackyWiki. Votre solde est affiché en haut de l’écran.',
    walletEarn: 'Vous en gagnez en vendant des cartes de votre collection, et grâce au bonus versé à chaque réassort de la Boutique.',
    walletSpend: 'Vous les dépensez à la Boutique pour acheter des boosters. Les boosters plus gros ou plus rares coûtent plus cher.',
    walletNote: 'Revendre un booster entier ne rembourse jamais son prix : collectionner rapporte plus que tout revendre.',
    walletEarnTitle: 'Gagner',
    walletSpendTitle: 'Dépenser',

    pullRates: 'Taux de tirage',
    oddsNote: 'La rareté est tirée par carte. Chaque article a les mêmes chances à chaque palier. Le nombre de lecteurs change la valeur de la carte, pas sa rareté.',
    rarity: 'Rareté',
    chance: 'Chance'
  }
};

let current = null;

/** The stored language, or null if the player hasn't chosen yet. */
export function storedLanguage() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    return LANGUAGES.some((l) => l.id === saved) ? saved : null;
  } catch {
    return null;
  }
}

export function getLanguage() {
  if (!current) current = storedLanguage() ?? 'en';
  return current;
}

/** Locked after the first choice — see the note at the top of this file. */
export function setLanguage(id) {
  if (!LANGUAGES.some((l) => l.id === id)) return getLanguage();
  current = id;
  try { localStorage.setItem(LANG_KEY, id); } catch { /* session-only */ }
  return current;
}

export const languageChosen = () => storedLanguage() !== null;

/** The Wikipedia subdomain for the current language. */
export const wikiLang = () =>
  LANGUAGES.find((l) => l.id === getLanguage())?.wiki ?? 'en';

/** Look up a UI string, filling {placeholders}. */
export function t(key, vars = {}) {
  const table = STRINGS[getLanguage()] ?? STRINGS.en;
  const raw = table[key] ?? STRINGS.en[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`);
}

/**
 * Resolve a `{ en, fr }` value from a data table. Data files keep their own
 * translations next to the thing they describe rather than through a key.
 */
export function tx(value) {
  if (typeof value === 'string') return value;
  if (!value) return '';
  return value[getLanguage()] ?? value.en ?? '';
}
