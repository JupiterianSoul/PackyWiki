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
    customIntro: 'Name a game, book, film or show and Wiklodo finds that subject’s own wiki, then builds a booster entirely out of it.',
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
    shopFreeRow: 'Free every restock',
    shopJumboRow: 'Jumbo boosters',
    shopDuoRow: '{a} vs {b}',
    shopLadderRow: '{theme}, tier by tier',
    shopWildRow: 'All of Wikipedia',
    shopBundleRow: '{n}-card shelf',
    shopCustomRow: 'Boosters you built',
    free: 'Free',
    claimFree: 'Take',
    freeTaken: 'Taken',
    freeNote: 'One of each, once every four hours.',
    freeAgainIn: 'New ones in {time}.',

    // tabs added later
    tabTimed: 'Timed',
    tabProfile: 'Profile',
    tabSettings: 'Settings',

    // timed boosters
    timedBooster: 'Timed Booster',
    timedTagline: 'Three cards, on the house, every few minutes.',
    timedTitle: 'Timed boosters',
    timedIntro: 'One builds up every {minutes} minutes whether the app is open or not. Three cards each, at reduced odds, so they keep you playing without paying for the whole game.',
    timedHeld: '{n} / {max} ready',
    timedNext: 'Next in {time}',
    timedFull: 'Full. Open one to start the timer again.',
    timedNone: 'None ready yet.',
    timedOpen: 'Open a timed booster',
    timedTrack: 'Track level {level}',
    timedTrackMax: 'Track level {level} · maxed',
    timedToNext: '{n} more to level {level}',
    timedPerks: '{minutes} min each · holds {max} · top-tier pulls {factor}x scarcer',
    timedPerksMax: '{minutes} min each · holds {max} · standard odds',
    timedNextPerks: 'Next: {minutes} min · holds {max}',
    timedLevelUp: 'Timed track level {level}',

    // daily gift
    dailyTitle: 'Daily gift',
    dailyBody: 'A gift every day you come back. Miss a day and you keep your place: the next gift is always the next one you have not taken.',
    dailyClaim: 'Claim daily gift',
    dailyClaimed: 'Claimed. Come back tomorrow.',
    dailyNextIn: 'Next gift in {time}',
    dailyBoard: 'Month {n}',
    dailyDay: 'Day {n}',
    dailyGot: 'You got {reward}',
    giftCoins: '{amount}',
    giftBooster: 'Booster',
    giftCard: 'Free card',
    dailyOpen: 'Daily gift',

    // progression
    profileTitle: 'Profile',
    profileLevel: 'Level {n}',
    profileMax: 'Max level',
    profileNextReward: 'Next reward',
    profileXpLine: '{have} / {need} XP',
    profileStats: 'Statistics',
    statPlaytime: 'Time played',
    statAccountAge: 'Collecting since',
    statBoosters: 'Boosters opened',
    statCards: 'Cards pulled',
    statValue: 'Collection value',
    statBest: 'Best pull',
    statRarity: 'Cards by rarity',
    levelUpTitle: 'Level up',
    levelUpBody: 'You reached level {level}, {rank}.',
    claimReward: 'Claim reward',
    rewardCoins: '{amount}',
    rewardBoth: '{amount} and a booster',
    xpGained: '+{n} XP',
    none: 'None yet',

    // settings
    settingsTitle: 'Settings',
    settingsSound: 'Sound',
    settingsSoundNote: 'Turn off to mute the app completely: tearing packs, card flips, buying, selling and every menu tap.',
    settingsFlash: 'Screen flash',
    settingsFlashNote: 'Turn off to stop the screen lighting up when a rare card is revealed. Useful in the dark, or if bright flashes bother you.',
    settingsLowPower: 'Battery saver',
    settingsLowPowerNote: 'Turn on to stop the glowing, shimmering and drifting effects on cards and packs. The app looks plainer, uses less battery and the phone runs cooler.',
    settingsHints: 'On-screen hints',
    settingsHintsNote: 'Turn off to hide the tips that tell you what to swipe and where, once you no longer need them.',
    settingsLanguage: 'Language',
    settingsLanguageNote: 'Set once when you first opened the app, and cannot be changed. Every card is saved in the language it was pulled in, so switching now would leave your collection half in one language and half in the other.',
    settingsData: 'Data',
    settingsReset: 'Erase everything',
    settingsResetNote: 'Permanently deletes every card, all your Buckarooz, every unopened booster and all your progress on this device. This cannot be undone.',
    settingsResetConfirm: 'Tap again to erase',
    on: 'On',
    off: 'Off',

    // custom
    customOwnNote: 'Boosters you build appear in the Shop, on their own shelf, where you can buy as many as you like.',
    createdGoShop: '“{name}” is ready. Find it in the Shop.',

    // first run
    welcomeTitle: 'Welcome to Wiklodo',
    welcomeBody: 'Pick a language. This one is permanent, because every card is stored in the language it was pulled in.',
    starterTitle: 'Here’s your starter kit',
    starterBody: 'You get {coins} and {packs} boosters to begin with. Sell duplicates, and check the Shop every couple of hours for new stock and a restock bonus.',
    letsGo: 'Let’s go',

    // odds modal
    walletTitle: 'Buckarooz',
    walletWhat: 'Buckarooz are the currency of Wiklodo. Your balance is shown in the top bar.',
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

    customIntro: 'Indiquez un jeu, un livre, un film ou une série et Wiklodo trouve le wiki dédié, puis construit un booster entièrement à partir de celui-ci.',
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
    shopFreeRow: 'Gratuit à chaque réassort',
    shopJumboRow: 'Boosters géants',
    shopDuoRow: '{a} contre {b}',
    shopLadderRow: '{theme}, palier par palier',
    shopWildRow: 'Tout Wikipédia',
    shopBundleRow: 'Étagère à {n} cartes',
    shopCustomRow: 'Vos boosters personnalisés',
    free: 'Gratuit',
    claimFree: 'Prendre',
    freeTaken: 'Pris',
    freeNote: 'Un de chaque, toutes les quatre heures.',
    freeAgainIn: 'Renouvelés dans {time}.',

    // tabs added later
    tabTimed: 'Minutés',
    tabProfile: 'Profil',
    tabSettings: 'Réglages',

    // timed boosters
    timedBooster: 'Booster minuté',
    timedTagline: 'Trois cartes offertes, toutes les quelques minutes.',
    timedTitle: 'Boosters minutés',
    timedIntro: 'Un booster arrive toutes les {minutes} minutes, que l’application soit ouverte ou non. Trois cartes chacun, avec des chances réduites : de quoi continuer à jouer sans financer toute la partie.',
    timedHeld: '{n} / {max} disponibles',
    timedNext: 'Prochain dans {time}',
    timedFull: 'Plein. Ouvrez-en un pour relancer le minuteur.',
    timedNone: 'Aucun disponible pour l’instant.',
    timedOpen: 'Ouvrir un booster minuté',
    timedTrack: 'Palier {level}',
    timedTrackMax: 'Palier {level} · maximum',
    timedToNext: 'Encore {n} avant le palier {level}',
    timedPerks: '{minutes} min chacun · {max} en réserve · hauts paliers {factor}x plus rares',
    timedPerksMax: '{minutes} min chacun · {max} en réserve · chances normales',
    timedNextPerks: 'Ensuite : {minutes} min · {max} en réserve',
    timedLevelUp: 'Palier minuté {level}',

    // daily gift
    dailyTitle: 'Cadeau quotidien',
    dailyBody: 'Un cadeau à chaque jour de retour. Un jour manqué ne coûte rien : le prochain cadeau est toujours le premier que vous n’avez pas pris.',
    dailyClaim: 'Récupérer le cadeau',
    dailyClaimed: 'Récupéré. Revenez demain.',
    dailyNextIn: 'Prochain cadeau dans {time}',
    dailyBoard: 'Mois {n}',
    dailyDay: 'Jour {n}',
    dailyGot: 'Vous avez reçu {reward}',
    giftCoins: '{amount}',
    giftBooster: 'Booster',
    giftCard: 'Carte offerte',
    dailyOpen: 'Cadeau',

    // progression
    profileTitle: 'Profil',
    profileLevel: 'Niveau {n}',
    profileMax: 'Niveau maximum',
    profileNextReward: 'Prochaine récompense',
    profileXpLine: '{have} / {need} XP',
    profileStats: 'Statistiques',
    statPlaytime: 'Temps de jeu',
    statAccountAge: 'Collectionneur depuis',
    statBoosters: 'Boosters ouverts',
    statCards: 'Cartes obtenues',
    statValue: 'Valeur de la collection',
    statBest: 'Meilleure carte',
    statRarity: 'Cartes par rareté',
    levelUpTitle: 'Niveau supérieur',
    levelUpBody: 'Vous atteignez le niveau {level}, {rank}.',
    claimReward: 'Récupérer',
    rewardCoins: '{amount}',
    rewardBoth: '{amount} et un booster',
    xpGained: '+{n} XP',
    none: 'Rien pour l’instant',

    // settings
    settingsTitle: 'Réglages',
    settingsSound: 'Son',
    settingsSoundNote: 'Désactivez pour couper entièrement le son : ouverture des boosters, retournement des cartes, achats, ventes et chaque appui sur un bouton.',
    settingsFlash: 'Flash à l’écran',
    settingsFlashNote: 'Désactivez pour que l’écran ne s’illumine plus lorsqu’une carte rare apparaît. Pratique dans le noir, ou si les flashs vous gênent.',
    settingsLowPower: 'Économie de batterie',
    settingsLowPowerNote: 'Activez pour arrêter les halos, reflets et animations continues sur les cartes et les boosters. L’application est plus sobre, consomme moins et le téléphone chauffe moins.',
    settingsHints: 'Indications à l’écran',
    settingsHintsNote: 'Désactivez pour masquer les conseils qui expliquent quoi glisser et où, quand vous n’en avez plus besoin.',
    settingsLanguage: 'Langue',
    settingsLanguageNote: 'Définie au premier lancement, et non modifiable. Chaque carte est enregistrée dans la langue de son tirage : changer maintenant laisserait votre collection à moitié dans une langue et à moitié dans l’autre.',
    settingsData: 'Données',
    settingsReset: 'Tout effacer',
    settingsResetNote: 'Supprime définitivement toutes vos cartes, tous vos Buckarooz, tous vos boosters non ouverts et toute votre progression sur cet appareil. Action irréversible.',
    settingsResetConfirm: 'Appuyez encore pour effacer',
    on: 'Activé',
    off: 'Désactivé',

    // custom
    customOwnNote: 'Les boosters que vous créez apparaissent dans la Boutique, sur leur propre étagère, où vous pouvez en acheter autant que vous voulez.',
    createdGoShop: '« {name} » est prêt. Retrouvez-le dans la Boutique.',

    welcomeTitle: 'Bienvenue dans Wiklodo',
    welcomeBody: 'Choisissez une langue. Ce choix est définitif, car chaque carte est stockée dans la langue où elle a été tirée.',
    starterTitle: 'Voici votre kit de départ',
    starterBody: 'Vous commencez avec {coins} et {packs} boosters. Vendez les doublons, et passez à la Boutique toutes les deux heures pour du nouveau stock et un bonus de réassort.',
    letsGo: 'C’est parti',

    walletTitle: 'Buckarooz',
    walletWhat: 'Les Buckarooz sont la monnaie de Wiklodo. Votre solde est affiché en haut de l’écran.',
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
