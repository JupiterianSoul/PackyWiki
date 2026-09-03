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
    title: { en: 'Wikster on the web', fr: 'Wikster sur le web' },
    points: [
      { en: 'The whole game in a browser, desktop included', fr: 'Le jeu entier dans un navigateur, ordinateur compris' },
      { en: 'Search bars that finally match the app', fr: 'Des barres de recherche enfin accordées à l’app' },
      { en: 'A secret code box at the end of Settings', fr: 'Une case à code secret au bout des Réglages' }
    ],
    changelog: [
      { en: 'Wikster runs as a website as well as an app, from the same build', fr: 'Wikster tourne en site web comme en application, depuis la même version' },
      { en: 'On a desktop screen the game is laid out for a desk: a rail down the left, a header across the top, dialogues in the middle and grids that use the width', fr: 'Sur un écran d’ordinateur le jeu est disposé pour un bureau : une barre à gauche, un en-tête en haut, des boîtes de dialogue au centre et des grilles qui prennent la largeur' },
      { en: 'Every search bar wears the theme now instead of the browser’s white box', fr: 'Chaque barre de recherche porte le thème au lieu de la boîte blanche du navigateur' },
      { en: 'The card index and the auction house line up with the rest of the screen', fr: 'L’index des cartes et la salle des ventes s’alignent avec le reste de l’écran' },
      { en: 'Changing theme no longer closes the game: the launcher icon changes once you leave', fr: 'Changer de thème ne ferme plus le jeu : l’icône change quand vous quittez' },
      { en: 'Settings ends with Redeem secret code, for the personal boosters to come', fr: 'Les Réglages se terminent par un code secret, pour les boosters personnels à venir' },
      { en: 'The music is slow jazz now: piano, blues and a modal walk, and the restless tracks are gone', fr: 'La musique est du jazz lent : piano, blues et une marche modale, et les morceaux agités ont disparu' },
      { en: 'The chat stopped polling in the background after you left the room', fr: 'La discussion cesse de sonder en arrière-plan une fois la salle quittée' }
    ]
  },
  {
    id: 'endings', icon: 'trash', accent: '#fb7185',
    title: { en: 'Two ways to end a save', fr: 'Deux façons de finir une sauvegarde' },
    points: [
      { en: 'Erase everything now signs you out, so the cloud save cannot pull it back', fr: 'Tout effacer vous déconnecte désormais, pour que la sauvegarde cloud ne puisse pas tout ramener' },
      { en: 'A new button deletes the account itself, freeing the email address', fr: 'Un nouveau bouton supprime le compte lui-même et libère l’adresse e-mail' },
      { en: 'Sparkle joins Noah’s special booster', fr: 'Sparkle rejoint le booster spécial de Noah' }
    ],
    changelog: [
      { en: 'Erase everything signs you out as well as wiping the save, which is what it was missing: the address stayed signed in, so the account\u2019s copy came straight back down on the next launch. The save row is now deleted outright rather than blanked, and the device is cleared down to the session token', fr: 'Tout effacer vous déconnecte en plus d’effacer la sauvegarde, ce qui lui manquait : l’adresse restait connectée, et la copie du compte redescendait au lancement suivant. La ligne de sauvegarde est maintenant supprimée et non vidée, et l’appareil est nettoyé jusqu’au jeton de session' },
      { en: 'Delete account is a second, harder ending: it removes the account itself, so the email stops working and is free to sign up with again as a new player. It runs as an edge function because deleting an account needs a key that must never ship inside the app', fr: 'Supprimer le compte est une fin plus radicale : le compte lui-même disparaît, l’e-mail cesse de fonctionner et redevient libre pour créer un nouveau joueur. Cela passe par une fonction edge, car supprimer un compte demande une clé qui ne doit jamais être livrée dans l’application' },
      { en: 'Sparkle, from Honkai: Star Rail, joins Noah’s special booster as the last card before The Creator, which brings it to five things and a sixth card like every other', fr: 'Sparkle, de Honkai: Star Rail, rejoint le booster spécial de Noah en dernière carte avant Le Créateur, ce qui le porte à cinq choses et une sixième carte comme tous les autres' }
    ]
  },
  {
    id: 'dressup', icon: 'wand', accent: '#fbbf24',
    title: { en: 'Dress your own collection', fr: 'Habillez votre collection' },
    points: [
      { en: 'Choose the effect each rarity wears, earned by collecting it', fr: 'Choisissez l’effet porté par chaque rareté, gagné en la collectionnant' },
      { en: 'Three new level frames, and every frame now opens at a level', fr: 'Trois nouveaux cadres de niveau, et chaque cadre s’ouvre désormais à un niveau' },
      { en: 'Four new settings, and the music starts the moment the app does', fr: 'Quatre nouveaux réglages, et la musique démarre en même temps que l’application' }
    ],
    changelog: [
      { en: 'Customization now holds a card-effect picker: one row per rarity, five looks each. Foil Sheen, Prism Split, Halo and Archive are earned by holding cards of that tier, and each is painted in the tier’s own colour so choosing a look never costs the ladder its legibility', fr: 'La personnalisation contient désormais un sélecteur d’effets : une ligne par rareté, cinq allures chacune. Éclat métallisé, Éclat prismatique, Halo et Archive s’obtiennent en possédant des cartes de ce palier, et chacun est peint dans la couleur du palier pour que le choix ne coûte jamais sa lisibilité à l’échelle' },
      { en: 'Three new level frames: Aurora Veil, Runic Seal and Solar Crown. Every frame now opens at a level of its own, from 25 to 450, and a locked one still shows its drawing so you can see what you are climbing towards', fr: 'Trois nouveaux cadres : Voile aurore, Sceau runique et Couronne solaire. Chaque cadre s’ouvre désormais à son propre niveau, de 25 à 450, et un cadre verrouillé montre quand même son dessin pour que vous voyiez vers quoi vous grimpez' },
      { en: 'Reset all progress really does end the save now: it clears the account on the server, the profile, the wishlist, the friends, the messages and the session itself, so the app comes back at the welcome screen the way a new install does. It also stops any sync still in flight from putting the old save straight back', fr: 'Réinitialiser toute la progression met vraiment fin à la sauvegarde : le compte sur le serveur, le profil, la liste de souhaits, les amis, les messages et la session sont effacés, et l’application revient à l’écran d’accueil comme une nouvelle installation. Une synchronisation encore en vol ne peut plus remettre l’ancienne sauvegarde' },
      { en: 'The music starts with the app instead of five seconds into it: the first track is fetched while the splash is still up rather than at the first tap', fr: 'La musique démarre avec l’application au lieu de cinq secondes plus tard : le premier morceau est chargé pendant l’écran de démarrage plutôt qu’au premier appui' },
      { en: 'Four new settings: tilt with the phone, vibration, keep the screen on while opening, and show card values', fr: 'Quatre nouveaux réglages : inclinaison avec le téléphone, vibration, garder l’écran allumé pendant l’ouverture, et afficher la valeur des cartes' },
      { en: 'A booster is only owed when a roll lands BELOW what it asked for. A subject whose pages are all famous no longer pays out for the Commons it could not find', fr: 'Un booster n’est dû que lorsqu’un tirage tombe EN DESSOUS de ce qu’il demandait. Un sujet dont toutes les pages sont célèbres ne paie plus pour les Communes qu’il n’a pas trouvées' }
    ]
  },
  {
    id: 'darwin', icon: 'weird', accent: '#a3a3a3',
    title: { en: 'The Darwin Awards, and boosters that keep their word', fr: 'Les Darwin Awards, et des boosters qui tiennent parole' },
    points: [
      { en: 'A new subject: the famous cases of spectacularly bad judgement', fr: 'Un nouveau sujet : les cas célèbres de jugement spectaculairement mauvais' },
      { en: 'A tier booster now always contains a card of its tier', fr: 'Un booster à palier contient désormais toujours une carte de son palier' },
      { en: 'A pack tells you about a bad connection before you tear it', fr: 'Un paquet vous prévient d’une mauvaise connexion avant que vous l’ouvriez' }
    ],
    changelog: [
      { en: 'The Darwin Awards, a new subject: the famous cases, five at random per booster, told by their own articles', fr: 'Les Darwin Awards, un nouveau sujet : les cas célèbres, cinq au hasard par booster, racontés par leurs propres articles' },
      { en: 'Pull rates are back, and they decide the draw: each card rolls a rarity off the booster’s own table, and only then is an article of that rarity found. A tier booster rolls on a better table and still guarantees at least one card of its tier, with anything above it counting', fr: 'Les taux de tirage sont de retour et décident du tirage : chaque carte tire une rareté sur la table du booster, et seulement ensuite un article de cette rareté est cherché. Un booster à palier tire sur une meilleure table et garantit toujours au moins une carte de son palier, tout ce qui est au-dessus comptant' },
      { en: 'The odds sheet shows the real table, percentage by percentage, for the booster in front of you rather than in the abstract', fr: 'La feuille des chances affiche la vraie table, pourcentage par pourcentage, pour le booster devant vous plutôt que dans l’abstrait' },
      { en: 'When a subject holds no page famous enough for a rarity the roll asked for, the pack drops a tier rather than leave its subject, and hands you a single-card booster of the rarity it could not give', fr: 'Quand un sujet n’a aucune page assez célèbre pour une rareté demandée par le tirage, le paquet descend d’un palier plutôt que de quitter son sujet, et vous remet un booster d’une carte de la rareté qu’il n’a pas pu donner' },
      { en: 'Booster prices are computed from the table itself, so the shop cannot drift out of step with what a pack actually pays out', fr: 'Les prix des boosters sont calculés depuis la table elle-même : la boutique ne peut plus se désynchroniser de ce qu’un paquet rapporte vraiment' },
      { en: 'The Darwin Awards roll grew from 40 articles to 118, the whole documented set', fr: 'Le tirage des Darwin Awards passe de 40 articles à 118, l’ensemble documenté au complet' },
      { en: 'The open screen warns about a dead or unreachable connection while the pack is still sealed, rather than after it is spent', fr: 'L’écran d’ouverture signale une connexion morte ou injoignable tant que le paquet est scellé, plutôt qu’une fois dépensé' },
      { en: 'A booster that fails to open comes back exactly once, through the same path the next launch uses, so it can never be handed back twice', fr: 'Un booster qui échoue à s’ouvrir revient exactement une fois, par le même chemin que le lancement suivant, sans jamais être rendu deux fois' },
      { en: 'Two separate buttons where there was one: Remove all cards keeps your level and your achievements, Reset all progress ends the save', fr: 'Deux boutons distincts là où il n’y en avait qu’un : Retirer toutes les cartes conserve votre niveau et vos succès, Réinitialiser toute la progression met fin à la sauvegarde' },
      { en: 'Reset all progress now really does clear everything, including the wishlist, the badge shelf, the frame and your saved bids, which used to survive it', fr: 'Réinitialiser toute la progression efface vraiment tout, y compris la liste de souhaits, l’étagère à badges, le cadre et vos enchères, qui y survivaient' },
      { en: 'The mark is painted in the theme’s own colours, so the drawer, the splash and the gate follow a theme change', fr: 'Le logo est peint aux couleurs du thème, si bien que le tiroir, l’écran de démarrage et la porte suivent un changement de thème' },
      { en: 'One Gift button on a friend’s profile, which then asks whether you meant a card or a booster', fr: 'Un seul bouton Offrir sur le profil d’un ami, qui demande ensuite s’il s’agit d’une carte ou d’un booster' },
      { en: 'Notifications can be cleared once read; the launcher icon changes safely when the game is put away', fr: 'Les notifications lues peuvent être effacées ; l’icône change sans risque quand le jeu est mis de côté' },
      { en: 'The Android app ships as a release build rather than a debug one, which is the version Android words its install warnings least harshly about. Same signing key, so it still installs over your copy and keeps your collection', fr: 'L’application Android est désormais une version release plutôt qu’une version debug, celle sur laquelle Android formule ses avertissements le moins durement. Même clé de signature : elle s’installe toujours par-dessus votre copie et conserve votre collection' }
    ]
  },
  {
    id: 'wikster', icon: 'spark', accent: '#a78bfa',
    title: { en: 'Wikster, and rarity is the print', fr: 'Wikster, et la rareté est l’impression' },
    points: [
      { en: 'The game is called Wikster', fr: 'Le jeu s’appelle Wikster' },
      { en: 'Rarity is rolled with the pack, at the same rates in every subject', fr: 'La rareté se tire avec le booster, aux mêmes taux dans tous les sujets' },
      { en: 'A better print of a card you own replaces it', fr: 'Une meilleure impression d’une carte possédée la remplace' },
      { en: 'The app updates itself, and music fades from one track to the next', fr: 'L’appli se met à jour toute seule, et la musique enchaîne en fondu' }
    ],
    changelog: [
      { en: 'Rarity is the print: rolled per card off the booster’s odds row when the pack is opened, and the article is drawn from the subject on its own. An Epic pack deals Epics at its printed rate whatever the subject holds; nothing is owed, capped or re-graded afterwards', fr: 'La rareté est l’impression : tirée par carte selon la table du booster à l’ouverture, l’article étant tiré du sujet à part. Un booster Épique distribue des Épiques à son taux quel que soit le sujet ; plus rien n’est dû, plafonné ou reclassé après coup' },
      { en: 'Fame (monthly readers) sets the price and the Famous band, and no longer the tier. A card graded while its readership request had failed is priced right on the next launch', fr: 'La notoriété (lecteurs par mois) fixe le prix et la bande Célèbre, plus le palier. Une carte classée alors que sa requête d’audience avait échoué est correctement valorisée au prochain lancement' },
      { en: 'Pulling an article already owned at a better print replaces the lesser print, copies kept', fr: 'Retirer un article déjà possédé avec une meilleure impression remplace l’ancienne, exemplaires conservés' },
      { en: 'A booster is two to seven requests: readership comes back with the page, and custom wikis are drawn from one listing rather than a search per card', fr: 'Un booster tient en deux à sept requêtes : l’audience revient avec la page, et les wikis personnalisés se tirent d’une seule liste plutôt que d’une recherche par carte' },
      { en: 'Every card’s picture starts downloading the moment the draw has chosen it, and smaller pictures are asked for on a slow line', fr: 'L’image de chaque carte se télécharge dès que le tirage l’a choisie, et des images plus petites sont demandées sur une connexion lente' },
      { en: 'The Android app opens the published site and only falls back to its built-in copy offline, so every publish reaches it with no reinstall', fr: 'L’appli Android ouvre le site publié et ne se rabat sur sa copie intégrée que hors ligne : chaque publication l’atteint sans réinstallation' },
      { en: 'An older build never overwrites a save written by a newer one; a bar says when a newer build is out', fr: 'Une ancienne version n’écrase jamais une sauvegarde écrite par une plus récente ; une barre signale qu’une version plus récente existe' },
      { en: 'A deleted account is signed out at launch instead of walking in on a stale token', fr: 'Un compte supprimé est déconnecté au lancement au lieu d’entrer avec un jeton périmé' },
      { en: 'Remove all cards tells the account before reloading, so the cards no longer come straight back', fr: 'Retirer toutes les cartes prévient le compte avant de recharger, les cartes ne reviennent donc plus aussitôt' },
      { en: 'Special cards come from their own wikis (the Terraforming Mars card, not the animal), and the ones already owned are repaired', fr: 'Les cartes spéciales viennent de leurs propres wikis (la carte Terraforming Mars, pas l’animal), et celles déjà possédées sont réparées' },
      { en: 'Music crossfades from one track to the next', fr: 'La musique enchaîne les morceaux en fondu' }
    ]
  },
  {
    id: 'arcade', icon: 'dice', accent: '#f472b6',
    title: { en: 'The arcade', fr: 'La salle de jeux' },
    points: [
      { en: 'Wikdle, a slot machine and a roulette wheel', fr: 'Wikdle, une machine à sous et une roulette' },
      { en: 'Three quests a day, with rewards to claim', fr: 'Trois quêtes par jour, avec des récompenses à réclamer' },
      { en: 'A leaderboard for today, this week and all time', fr: 'Un classement du jour, de la semaine et de toujours' },
      { en: 'The shop rebuilt around the print, and boosters sized by you', fr: 'La boutique refaite autour de l’impression, et des boosters à la taille que vous voulez' }
    ],
    changelog: [
      { en: 'A Minigames tab: Wikdle, the slot machine and the roulette, each with its own help sheet', fr: 'Un onglet Mini-jeux : Wikdle, la machine à sous et la roulette, chacun avec sa fiche d’aide' },
      { en: 'Wikdle: the encyclopaedia’s five-letter word of the day in six rows, the same word for everyone, with a dictionary that refuses non-words and duplicate letters scored the way the real game scores them. A finished board is locked for the day and pays points', fr: 'Wikdle : le mot de cinq lettres du jour en six lignes, le même pour tout le monde, avec un dictionnaire qui refuse les non-mots et des lettres doublées notées comme dans le vrai jeu. Une grille finie est verrouillée pour la journée et rapporte des points' },
      { en: 'The slot machine: three reels, five symbols, five paylines, a book tuned to pay back 95%. Every spin is decided on the server with cryptographic randomness; the app checks the answer against the book before paying and refunds the coin if the house does not answer', fr: 'La machine à sous : trois rouleaux, cinq symboles, cinq lignes, un livre réglé pour rendre 95 %. Chaque tour se décide sur le serveur avec un aléa cryptographique ; l’appli vérifie la réponse contre le livre avant de payer et rend la pièce si la maison ne répond pas' },
      { en: 'The roulette: a real European table, every classic bet, and the game’s own tier bets from Common at 1.5x to Exotic at 10x, several chips a spin up to a table limit. The wheel turns to the pocket the server named and settles on it', fr: 'La roulette : une vraie table européenne, toutes les mises classiques, et les mises de palier du jeu, de Commune à 1,5x jusqu’à Exotique à 10x, plusieurs jetons par tour jusqu’à une limite de table. La roue tourne jusqu’à la case nommée par le serveur et s’y arrête' },
      { en: 'Daily quests: three a day from a book of over a hundred, dealt at 00:00 UTC, easy, medium and hard by weight, credited by everything you already do in the game. Signed in, the deal and the claim are the server’s', fr: 'Quêtes du jour : trois par jour tirées d’un livre de plus de cent, distribuées à 00 h 00 UTC, faciles, moyennes et difficiles selon leur poids, créditées par tout ce que vous faites déjà dans le jeu. Connecté, la distribution et la réclamation sont celles du serveur' },
      { en: 'The leaderboard: daily, weekly and all-time tables kept on the server, twenty rows a page, your own row pinned to the bottom when it is not on screen', fr: 'Le classement : des tables du jour, de la semaine et de toujours tenues sur le serveur, vingt lignes par page, votre propre ligne épinglée en bas quand elle n’est pas à l’écran' },
      { en: 'The shop: the press stocks tier boosters with their real chance printed on the label, bundles of three, a sealed crate, and a card-count picker for custom packs priced so that two one-card packs cost more than one two-card pack', fr: 'La boutique : la presse propose des boosters à palier avec leur vraie chance imprimée sur l’étiquette, des lots de trois, une caisse scellée, et un choix du nombre de cartes des boosters perso, tarifé pour que deux boosters d’une carte coûtent plus qu’un booster de deux' },
      { en: 'Rarity effects show everywhere a card is shown, not only in the booster', fr: 'Les effets de rareté s’affichent partout où une carte apparaît, pas seulement dans le booster' },
      { en: 'Special badges can be taken off, all of them, and stay off', fr: 'Les badges spéciaux peuvent tous être retirés, et le restent' },
      { en: 'Updates are numbered: the fifth update is called the fifth update', fr: 'Les mises à jour sont numérotées : la cinquième s’appelle la cinquième' }
    ]
  }
];
