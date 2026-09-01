/**
 * RELEASE TIMELINE
 * ----------------------------------------------------------------------------
 * Everything that has shipped, oldest first. No dates on purpose: the order
 * is the story. The Updates screen renders this newest-first.
 *
 * `points` is the short version: new features only, one plain line each, no
 * mechanics and no numbers. `changelog` is the whole truth for that release,
 * behind the "full changelog" button. `icon` keys into src/data/icons.js and
 * `accent` colours the node on the timeline.
 */
export const RELEASES = [
  {
    id: 'origins', icon: 'packs', accent: '#60a5fa',
    title: { en: 'The first packs', fr: 'Les premiers boosters' },
    points: [
      { en: 'Boosters drawn live from Wikipedia', fr: 'Des boosters tirés en direct de Wikipédia' },
      { en: 'A collection, a shop and a wallet', fr: 'Une collection, une boutique et un porte-monnaie' },
      { en: 'Custom boosters from any wiki', fr: 'Des boosters personnalisés depuis n’importe quel wiki' }
    ],
    changelog: [
      { en: 'Every card is a real article with a price and a rarity', fr: 'Chaque carte est un vrai article, avec un prix et une rareté' },
      { en: 'Boosters are bought with Buckarooz and opened card by card', fr: 'Les boosters s’achètent en Buckarooz et s’ouvrent carte par carte' },
      { en: 'The collection keeps every card ever pulled, with duplicates counted', fr: 'La collection garde chaque carte tirée, doublons comptés' },
      { en: 'Custom boosters can be built on any subject that has its own wiki', fr: 'Des boosters personnalisés se créent sur tout sujet qui a son wiki' }
    ]
  },
  {
    id: 'rip', icon: 'spark', accent: '#f472b6',
    title: { en: 'The rip', fr: 'La déchirure' },
    points: [
      { en: 'Foil bags you tear open with a finger', fr: 'Des sachets métallisés à déchirer du doigt' },
      { en: 'Cards rebuilt, with rarity effects', fr: 'Des cartes reconstruites, avec effets de rareté' }
    ],
    changelog: [
      { en: 'Boosters became foil bags, torn open by dragging a finger across', fr: 'Les boosters sont devenus des sachets métallisés, déchirés du doigt' },
      { en: 'Cards were rebuilt: artwork, text, statistics and per-tier effects', fr: 'Cartes reconstruites : visuel, texte, statistiques et effets par rareté' },
      { en: 'The reveal deals the cards one at a time', fr: 'La révélation distribue les cartes une par une' },
      { en: 'Each subject got its own emblem, palette and wrapper design', fr: 'Chaque sujet a reçu son emblème, sa palette et son emballage' }
    ]
  },
  {
    id: 'bigone', icon: 'trophy', accent: '#fbbf24',
    title: { en: 'The big update', fr: 'La grande mise à jour' },
    points: [
      { en: 'Albums, achievements and daily gifts', fr: 'Albums, succès et cadeaux quotidiens' },
      { en: 'Friends, chat, trades and gifts', fr: 'Amis, discussion, échanges et cadeaux' },
      { en: 'Sounds, two new themes, a new logo', fr: 'Des sons, deux nouveaux thèmes, un nouveau logo' }
    ],
    changelog: [
      { en: 'Albums on a shelf, one book per category', fr: 'Des albums sur une étagère, un livre par catégorie' },
      { en: 'Achievements with rewards to redeem', fr: 'Des succès avec des récompenses à réclamer' },
      { en: 'A daily gift board and free packs on a levelling track', fr: 'Un plateau de cadeaux quotidiens et des packs gratuits sur une piste de niveaux' },
      { en: 'Accounts with friends, chat, trades and gifts between players', fr: 'Des comptes avec amis, discussion, échanges et cadeaux entre joueurs' },
      { en: 'A synthesiser giving every gesture a sound, tuned per theme', fr: 'Un synthétiseur qui donne un son à chaque geste, accordé par thème' },
      { en: 'A new logo, a launch animation, and less heat on the phone', fr: 'Un nouveau logo, une animation de lancement, et moins de chauffe' }
    ]
  },
  {
    id: 'mended', icon: 'friends', accent: '#4ade80',
    title: { en: 'Friends, mended', fr: 'Les amis, réparés' },
    points: [
      { en: 'A sturdier friends list', fr: 'Une liste d’amis plus solide' }
    ],
    changelog: [
      { en: 'The friends list survives a database that is behind', fr: 'La liste d’amis survit à une base de données en retard' },
      { en: 'Clear words on screen when the server itself needs updating', fr: 'Des mots clairs à l’écran quand le serveur doit être mis à jour' }
    ]
  },
  {
    id: 'fluid', icon: 'clock', accent: '#22d3ee',
    title: { en: 'The fluid one', fr: 'La fluidité' },
    points: [
      { en: 'A faster, smoother app throughout', fr: 'Une application plus rapide et plus fluide' },
      { en: 'A bigger album book', fr: 'Un livre d’album plus grand' }
    ],
    changelog: [
      { en: 'The whole app aims for sixty frames a second', fr: 'Toute l’application vise soixante images par seconde' },
      { en: 'The Meadow theme rebuilt, calmer', fr: 'Le thème Prairie reconstruit, plus calme' },
      { en: 'The opening scene sits centred with nothing scrolling under it', fr: 'La scène d’ouverture est centrée, rien ne défile dessous' },
      { en: 'A bigger album book that turns both ways', fr: 'Un livre d’album plus grand, qui tourne dans les deux sens' },
      { en: 'Profile picture cropping that is pleasant to use', fr: 'Un recadrage de photo de profil agréable à utiliser' }
    ]
  },
  {
    id: 'fame', icon: 'gem', accent: '#c084fc',
    title: { en: 'The fame update', fr: 'La célébrité' },
    points: [
      { en: 'Rarity now comes from real readership', fr: 'La rareté vient désormais de la vraie lecture' },
      { en: 'The shop became a market, with eight new subjects', fr: 'La boutique est devenue un marché, avec huit nouveaux sujets' },
      { en: 'The Forge and the Quiz', fr: 'La Forge et le Quiz' }
    ],
    changelog: [
      { en: 'A card’s rarity now follows how much its article is read', fr: 'La rareté d’une carte suit désormais la lecture réelle de son article' },
      { en: 'The economy reworked around it; collections re-graded on launch', fr: 'L’économie retravaillée en conséquence ; collections reclassées au lancement' },
      { en: 'The shop rebuilt as a market: a spotlight deal, subjects, a tier vault', fr: 'La boutique reconstruite en marché : offre en vitrine, sujets, réserve à paliers' },
      { en: 'Albums count the real size of every category', fr: 'Les albums comptent la vraie taille de chaque catégorie' },
      { en: 'Eight new subjects, from Music to Memes', fr: 'Huit nouveaux sujets, de la musique aux mèmes' },
      { en: 'The Forge: custom packs with a live preview', fr: 'La Forge : des packs personnalisés avec aperçu en direct' },
      { en: 'A quiz written from the cards’ own articles, with rewards', fr: 'Un quiz rédigé depuis les articles des cartes, avec récompenses' },
      { en: 'This timeline', fr: 'Cette chronologie' }
    ]
  },
  {
    id: 'polish', icon: 'collection', accent: '#38bdf8',
    title: { en: 'Sharper edges', fr: 'Les angles polis' },
    points: [
      { en: 'Albums one page at a time, and a classic list view', fr: 'Les albums page par page, et une vue en liste classique' },
      { en: 'Faster, safer booster opening', fr: 'Une ouverture de booster plus rapide et plus sûre' },
      { en: 'The quiz needs nothing from you', fr: 'Le quiz ne demande plus rien' }
    ],
    changelog: [
      { en: 'Album books show one page at a time, four cards at full size', fr: 'Les albums montrent une page à la fois, quatre cartes en taille réelle' },
      { en: 'The collection reads as albums or as a classic sorted list', fr: 'La collection se lit en albums ou en liste classique triée' },
      { en: 'One album per custom subject; lost custom packs come back', fr: 'Un seul album par sujet personnalisé ; les packs perdus reviennent' },
      { en: 'Boosters only draw pages actually about their subject', fr: 'Les boosters ne tirent que des pages qui parlent vraiment de leur sujet' },
      { en: 'Opening takes about one request instead of three per card', fr: 'L’ouverture tient en une requête environ, au lieu de trois par carte' },
      { en: 'A lost connection can never eat a booster', fr: 'Une connexion perdue ne peut plus avaler un booster' },
      { en: 'Cards left in the wrong language are translated on launch', fr: 'Les cartes restées dans la mauvaise langue sont traduites au lancement' },
      { en: 'The quiz is written server-side; no key, no setting', fr: 'Le quiz est rédigé côté serveur ; sans clé ni réglage' }
    ]
  },
  {
    id: 'hundred', icon: 'trophy', accent: '#e0a33e',
    title: { en: 'The hundred goals', fr: 'Les cent objectifs' },
    points: [
      { en: 'One hundred achievements in chains', fr: 'Cent succès organisés en chaînes' },
      { en: 'A Customization screen', fr: 'Un écran Personnalisation' },
      { en: 'A daily quiz allowance', fr: 'Un quota de quiz quotidien' }
    ],
    changelog: [
      { en: 'The achievements table grew to one hundred, organised as chains', fr: 'La table des succès est passée à cent, organisée en chaînes' },
      { en: 'Rewards rescaled by difficulty, up to a top-tier pack at the level cap', fr: 'Récompenses recalibrées par difficulté, jusqu’à un pack du plus haut rang au niveau maximal' },
      { en: 'The quiz shows its winnings and allows five runs a day', fr: 'Le quiz affiche ses gains et permet cinq parties par jour' },
      { en: 'Four themes turned down: they played louder than the rest', fr: 'Quatre thèmes baissés : ils sonnaient plus fort que les autres' },
      { en: 'Themes, picture and name moved to a Customization screen', fr: 'Thèmes, photo et pseudo déplacés vers un écran Personnalisation' },
      { en: 'Settings sorted into Preferences, Account and Data', fr: 'Réglages triés en Préférences, Compte et Données' }
    ]
  },
  {
    id: 'regalia', icon: 'star', accent: '#7ef2ff',
    title: { en: 'Badges and frames', fr: 'Insignes et cadres' },
    points: [
      { en: 'Holographic badges on the profile', fr: 'Des insignes holographiques sur le profil' },
      { en: 'Level frames in five styles', fr: 'Des cadres de niveau en cinq styles' }
    ],
    changelog: [
      { en: 'Twelve holographic badges for the hardest feats, upgrading in place', fr: 'Douze insignes holographiques pour les grands exploits, qui montent en grade' },
      { en: 'Badges sit on the profile, between level and statistics', fr: 'Les insignes se placent sur le profil, entre niveau et statistiques' },
      { en: 'A frame around the level, changing every ten levels to the cap', fr: 'Un cadre autour du niveau, qui change tous les dix niveaux jusqu’au maximum' },
      { en: 'Five frame styles to wear, chosen in Customization', fr: 'Cinq styles de cadre à porter, choisis dans Personnalisation' },
      { en: 'Friends see the frame on your picture and profile', fr: 'Les amis voient le cadre sur votre photo et votre profil' }
    ]
  },
  {
    id: 'bazaar', icon: 'trade', accent: '#4ade80',
    title: { en: 'The market opens', fr: 'Le marché ouvre' },
    points: [
      { en: 'Auctions between all players', fr: 'Des enchères entre tous les joueurs' },
      { en: 'Two new themes: Cartoon and Matrix', fr: 'Deux nouveaux thèmes : Cartoon et Matrix' },
      { en: 'A Badges screen to choose what you wear', fr: 'Un écran Insignes pour choisir ce que vous portez' }
    ],
    changelog: [
      { en: 'Any player can put cards up for auction; everyone can bid', fr: 'Tout joueur peut mettre des cartes aux enchères ; tout le monde peut miser' },
      { en: 'Each bid must clear the last by a fixed margin, shown to everyone', fr: 'Chaque mise doit dépasser la précédente d’une marge fixe, affichée à tous' },
      { en: 'A bid in the closing seconds winds the clock back up', fr: 'Une mise dans les dernières secondes relance le compte à rebours' },
      { en: 'A sale with a bid on it can no longer be withdrawn; unsold cards return', fr: 'Une vente avec mise ne peut plus être retirée ; les invendues reviennent' },
      { en: 'The Cartoon theme: ink borders, halftone, a real comic typeface, rubber sounds', fr: 'Le thème Cartoon : bords à l’encre, trame, vraie police comique, sons en caoutchouc' },
      { en: 'The Matrix theme: green rain, terminal type, digital sounds', fr: 'Le thème Matrix : pluie verte, police de terminal, sons numériques' },
      { en: 'Both themes speak in public-domain recordings', fr: 'Les deux thèmes parlent en enregistrements du domaine public' },
      { en: 'A Badges screen; up to four badges worn on the profile', fr: 'Un écran Insignes ; jusqu’à quatre insignes portés sur le profil' },
      { en: 'Arrows under the cards while opening a booster', fr: 'Des flèches sous les cartes pendant l’ouverture d’un booster' }
    ]
  },
  {
    id: 'collectors', icon: 'search', accent: '#f2ca4f',
    title: { en: 'The collectors update', fr: 'La mise à jour des collectionneurs' },
    points: [
      { en: 'The Auction House, rebuilt with five rooms', fr: 'L’Hôtel des ventes, reconstruit en cinq salles' },
      { en: 'All the Cards: a shared index of every discovery', fr: 'Toutes les cartes : un index partagé des découvertes' },
      { en: 'Wishlists, on every card', fr: 'Des listes de souhaits, sur chaque carte' },
      { en: 'Background music, and two new themes', fr: 'Une musique de fond, et deux nouveaux thèmes' }
    ],
    changelog: [
      { en: 'The market became the Auction House: browse, sales, bids, won, history', fr: 'Le marché est devenu l’Hôtel des ventes : parcourir, ventes, enchères, gagnées, historique' },
      { en: 'Auctions listed as full cards, two a row, with a search bar and sorts', fr: 'Les enchères affichées en vraies cartes, deux par ligne, avec recherche et tris' },
      { en: 'All the Cards: every real card any player has found, with counters and filters', fr: 'Toutes les cartes : chaque vraie carte trouvée par un joueur, avec compteurs et filtres' },
      { en: 'A wishlist bookmark on every card, yours or not; friends can see it', fr: 'Un marque-page de souhait sur chaque carte, à vous ou non ; visible par les amis' },
      { en: 'A bell when a wished card walks onto the auction floor', fr: 'Une cloche quand une carte souhaitée arrive aux enchères' },
      { en: 'A friend’s wishlist on their profile; an Owned tag on all cards', fr: 'La liste d’un ami sur son profil ; une étiquette Possédée sur toutes les cartes' },
      { en: 'A Glossary of every booster category', fr: 'Un glossaire de toutes les catégories de boosters' },
      { en: 'Achievements and badges for selling and winning at auction, and two more badges', fr: 'Succès et insignes pour vendre et gagner aux enchères, et deux insignes de plus' },
      { en: 'Three found lounge tracks under the app, with music and volume settings', fr: 'Trois morceaux lounge trouvés sous l’application, avec réglages de musique et de volume' },
      { en: 'A sound volume slider; the theme-selection sound turned right down', fr: 'Un curseur de volume ; le son de sélection de thème nettement baissé' },
      { en: 'The Casino theme: green felt, gold trim, drifting suits', fr: 'Le thème Casino : tapis vert, liseré doré, enseignes flottantes' },
      { en: 'The Horror theme: fog, grain, one red light', fr: 'Le thème Horreur : brume, grain, une lumière rouge' },
      { en: 'Boosters counted on the bottom bar; the packs screen fits without scrolling', fr: 'Les boosters comptés sur la barre du bas ; l’écran des boosters tient sans défiler' },
      { en: 'Notifications in the side menu, and new bells: full shelf, ready achievements', fr: 'Les notifications dans le menu latéral, et de nouvelles cloches : étagère pleine, succès prêts' }
    ]
  },
  {
    id: 'prism', icon: 'gem', accent: '#f472b6',
    title: { en: 'The rarity update', fr: 'La mise à jour des raretés' },
    points: [
      { en: 'Every rarity with a look of its own', fr: 'Chaque rareté avec un style bien à elle' },
      { en: 'Cards that lean with your hand and with the phone', fr: 'Des cartes qui s’inclinent avec la main et avec le téléphone' },
      { en: 'Prismatic, the new top tier', fr: 'Prismatique, le nouveau rang suprême' }
    ],
    changelog: [
      { en: 'Artifact became Prismatic; every old card, count and badge carries over', fr: 'Artefact est devenu Prismatique ; anciennes cartes, compteurs et insignes suivent' },
      { en: 'Common cards print flat, with a halftone; uncommon cards breathe green', fr: 'Les communes s’impriment à plat, avec une trame ; les peu communes respirent en vert' },
      { en: 'Rare cards wear a foil sheen and their title lights up when tapped', fr: 'Les rares portent un reflet métallisé et leur titre s’allume au toucher' },
      { en: 'Epic cards carry an aurora that drifts behind the art as the card leans', fr: 'Les épiques portent une aurore qui dérive derrière l’image quand la carte s’incline' },
      { en: 'Legendary cards in brushed gold, with sparks rising', fr: 'Les légendaires en or brossé, avec des étincelles qui montent' },
      { en: 'Mythic cards burn: embers, a molten ring, a picture that glitches', fr: 'Les mythiques brûlent : braises, anneau en fusion, image qui saute' },
      { en: 'Exotic cards as holograms, with scrolling wikitext and scanlines', fr: 'Les exotiques en hologrammes, avec du wikitexte qui défile et des lignes de balayage' },
      { en: 'Prismatic cards pour a rainbow ribbon across the face as you tilt them, over a liquid prism that never stops moving', fr: 'Les prismatiques font couler un ruban arc-en-ciel sur la carte quand on l’incline, au-dessus d’un prisme liquide qui ne s’arrête jamais' },
      { en: 'Prismatic corners shift from teal to magenta to gold, and the lettering is silver foil split red and cyan by the light', fr: 'Les bords prismatiques passent du turquoise au magenta puis à l’or, et le lettrage est un métal argenté que la lumière sépare en rouge et cyan' },
      { en: 'A held card leans and its light slides; on a phone the gyroscope leans it too', fr: 'Une carte tenue s’incline et sa lumière glisse ; sur téléphone, le gyroscope l’incline aussi' },
      { en: 'Battery saver keeps every card still', fr: 'L’économie de batterie garde chaque carte immobile' }
    ]
  },
  {
    id: 'web', icon: 'wand', accent: '#38bdf8',
    title: { en: 'Wiklodo on the web', fr: 'Wiklodo sur le web' },
    points: [
      { en: 'The whole game in a browser, desktop included', fr: 'Le jeu entier dans un navigateur, ordinateur compris' },
      { en: 'Search bars that finally match the app', fr: 'Des barres de recherche enfin accordées à l’app' },
      { en: 'A secret code box at the end of Settings', fr: 'Une case à code secret au bout des Réglages' }
    ],
    changelog: [
      { en: 'Wiklodo runs as a website as well as an app, from the same build', fr: 'Wiklodo tourne en site web comme en application, depuis la même version' },
      { en: 'On a desktop screen the game is laid out for a desk: a rail down the left, a header across the top, dialogues in the middle and grids that use the width', fr: 'Sur un écran d’ordinateur le jeu est disposé pour un bureau : une barre à gauche, un en-tête en haut, des boîtes de dialogue au centre et des grilles qui prennent la largeur' },
      { en: 'Every search bar wears the theme now instead of the browser’s white box', fr: 'Chaque barre de recherche porte le thème au lieu de la boîte blanche du navigateur' },
      { en: 'The card index and the auction house line up with the rest of the screen', fr: 'L’index des cartes et la salle des ventes s’alignent avec le reste de l’écran' },
      { en: 'Changing theme no longer closes the game: the launcher icon changes once you leave', fr: 'Changer de thème ne ferme plus le jeu : l’icône change quand vous quittez' },
      { en: 'Settings ends with Redeem secret code, for the personal boosters to come', fr: 'Les Réglages se terminent par un code secret, pour les boosters personnels à venir' },
      { en: 'The music is slow jazz now: piano, blues and a modal walk, and the restless tracks are gone', fr: 'La musique est du jazz lent : piano, blues et une marche modale, et les morceaux agités ont disparu' },
      { en: 'The chat stopped polling in the background after you left the room', fr: 'La discussion cesse de sonder en arrière-plan une fois la salle quittée' }
    ]
  }
];
