/**
 * RELEASE TIMELINE
 * ----------------------------------------------------------------------------
 * Everything that has shipped, oldest first. No dates on purpose: the order
 * is the story. The Updates screen renders this newest-first; `icon` is a key
 * into src/data/icons.js and `accent` colours the node on the timeline.
 */
export const RELEASES = [
  {
    id: 'origins', icon: 'packs', accent: '#60a5fa',
    title: { en: 'The first packs', fr: 'Les premiers boosters' },
    points: [
      { en: 'Wiklodo opens: boosters drawn live from Wikipedia',
        fr: 'Wiklodo ouvre : des boosters tirés en direct de Wikipédia' },
      { en: 'Every card is a real article, with a price and a rarity',
        fr: 'Chaque carte est un vrai article, avec un prix et une rareté' },
      { en: 'A collection, a shop and a wallet of Buckarooz',
        fr: 'Une collection, une boutique et un porte-monnaie de Buckarooz' },
      { en: 'Custom boosters built from any subject with its own wiki',
        fr: 'Des boosters personnalisés bâtis sur tout sujet qui a son wiki' }
    ]
  },
  {
    id: 'rip', icon: 'spark', accent: '#f472b6',
    title: { en: 'The rip', fr: 'La déchirure' },
    points: [
      { en: 'Boosters become foil bags you tear open with a finger',
        fr: 'Les boosters deviennent des sachets métallisés à déchirer du doigt' },
      { en: 'Cards rebuilt: artwork, text, stats and rarity effects',
        fr: 'Cartes reconstruites : visuel, texte, statistiques et effets de rareté' },
      { en: 'A reveal that deals the cards one by one',
        fr: 'Une révélation qui distribue les cartes une par une' },
      { en: 'Each subject gets its own drawn emblem, palette and wrapper',
        fr: 'Chaque sujet reçoit son emblème dessiné, sa palette et son emballage' }
    ]
  },
  {
    id: 'bigone', icon: 'trophy', accent: '#fbbf24',
    title: { en: 'The big update', fr: 'La grande mise à jour' },
    points: [
      { en: 'Albums on a shelf, one book per category',
        fr: 'Des albums sur une étagère, un livre par catégorie' },
      { en: 'Achievements, daily gifts, and free packs on a levelling track',
        fr: 'Des succès, des cadeaux quotidiens et des packs gratuits sur une piste de niveaux' },
      { en: 'A sound for everything, and two new themes',
        fr: 'Un son pour chaque geste, et deux nouveaux thèmes' },
      { en: 'Friends, chat, trades and gifts between players',
        fr: 'Amis, discussion, échanges et cadeaux entre joueurs' },
      { en: 'A new logo, a launch animation, and cooler phones',
        fr: 'Un nouveau logo, une animation de lancement, et des téléphones qui chauffent moins' }
    ]
  },
  {
    id: 'mended', icon: 'friends', accent: '#4ade80',
    title: { en: 'Friends, mended', fr: 'Les amis, réparés' },
    points: [
      { en: 'The friends list survives a database that is behind',
        fr: 'La liste d’amis survit à une base de données en retard' },
      { en: 'Clear words when the server itself needs updating',
        fr: 'Des mots clairs quand le serveur lui-même doit être mis à jour' }
    ]
  },
  {
    id: 'fluid', icon: 'clock', accent: '#22d3ee',
    title: { en: 'The fluid one', fr: 'La fluidité' },
    points: [
      { en: 'The whole app aims for 60 frames a second',
        fr: 'Toute l’application vise 60 images par seconde' },
      { en: 'The Meadow theme rebuilt, calm this time',
        fr: 'Le thème Prairie reconstruit, apaisé cette fois' },
      { en: 'The opening scene sits centred; nothing scrolls under it',
        fr: 'La scène d’ouverture est centrée ; rien ne défile dessous' },
      { en: 'A bigger album book that turns both ways',
        fr: 'Un livre d’album plus grand, qui tourne dans les deux sens' },
      { en: 'Profile picture cropping you can actually use',
        fr: 'Un recadrage de photo de profil enfin utilisable' }
    ]
  },
  {
    id: 'fame', icon: 'gem', accent: '#c084fc',
    title: { en: 'The fame update', fr: 'La célébrité' },
    points: [
      { en: 'Rarity belongs to the article now: the more read, the rarer',
        fr: 'La rareté appartient désormais à l’article : plus il est lu, plus elle monte' },
      { en: 'The whole economy reworked; your cards re-graded on launch',
        fr: 'Toute l’économie retravaillée ; vos cartes reclassées au lancement' },
      { en: 'The shop is a market: a spotlight deal, subjects, the tier vault',
        fr: 'La boutique devient un marché : offre en vitrine, sujets, réserve à paliers' },
      { en: 'Albums count the real size of every category',
        fr: 'Les albums comptent la vraie taille de chaque catégorie' },
      { en: 'Eight new subjects, from Music to Memes',
        fr: 'Huit nouveaux sujets, de la musique aux mèmes' },
      { en: 'The Forge: custom packs with a live preview of your design',
        fr: 'La Forge : des packs personnalisés avec un aperçu en direct de votre design' },
      { en: 'A quiz on the cards themselves, with real rewards',
        fr: 'Un quiz sur les cartes elles-mêmes, avec de vraies récompenses' },
      { en: 'This timeline',
        fr: 'Cette chronologie' }
    ]
  },
  {
    id: 'polish', icon: 'collection', accent: '#38bdf8',
    title: { en: 'Sharper edges', fr: 'Les angles polis' },
    points: [
      { en: 'Album books show one page at a time, four cards at their real size',
        fr: 'Les albums montrent une page à la fois, quatre cartes à leur vraie taille' },
      { en: 'The collection reads as albums or as a classic sorted list',
        fr: 'La collection se lit en albums ou en liste classique triée' },
      { en: 'One album per custom subject, and lost custom packs come back',
        fr: 'Un seul album par sujet personnalisé, et les packs perdus reviennent' },
      { en: 'Boosters only draw pages that are actually about their subject',
        fr: 'Les boosters ne tirent que des pages qui parlent vraiment de leur sujet' },
      { en: 'Boosters open in about one request instead of three per card',
        fr: 'Un booster s’ouvre en une requête environ, au lieu de trois par carte' },
      { en: 'A lost connection can never eat a booster, and never hangs the app',
        fr: 'Une connexion perdue ne peut plus avaler un booster ni bloquer l’application' },
      { en: 'Leftover cards in the wrong language are translated on launch',
        fr: 'Les cartes restées dans la mauvaise langue sont traduites au lancement' },
      { en: 'The quiz needs no key from you: it is written on the server side',
        fr: 'Le quiz ne demande aucune clé : il est rédigé côté serveur' }
    ]
  },
  {
    id: 'hundred', icon: 'trophy', accent: '#e0a33e',
    title: { en: 'The hundred goals', fr: 'Les cent objectifs' },
    points: [
      { en: 'One hundred achievements, in chains that climb all the way to level 500',
        fr: 'Cent succès, en chaînes qui grimpent jusqu’au niveau 500' },
      { en: 'Rewards rebalanced: pocket change for the easy ones, rare boosters for the feats',
        fr: 'Récompenses rééquilibrées : petite monnaie pour les faciles, boosters rares pour les exploits' },
      { en: 'The quiz shows its winnings, pays less money, and allows five runs a day',
        fr: 'Le quiz affiche ses gains, paie moins d’argent et se limite à cinq parties par jour' },
      { en: 'A Customization screen: theme, picture and name in one place',
        fr: 'Un écran Personnalisation : thème, photo et pseudo au même endroit' },
      { en: 'Settings sorted into Preferences, Account and Data',
        fr: 'Des réglages triés en Préférences, Compte et Données' },
      { en: 'Aurora, Paper, Arcade and Sunset turned down: they played louder than the rest',
        fr: 'Aurore, Papier, Arcade et Sunset moins forts : ils sonnaient plus fort que les autres' }
    ]
  },
  {
    id: 'regalia', icon: 'star', accent: '#7ef2ff',
    title: { en: 'Badges and frames', fr: 'Insignes et cadres' },
    points: [
      { en: 'Twelve holographic badges for the hardest feats, upgrading in place as you climb',
        fr: 'Douze insignes holographiques pour les plus grands exploits, qui montent en grade avec vous' },
      { en: 'They sit on your profile, between your level and your statistics',
        fr: 'Ils se placent sur votre profil, entre votre niveau et vos statistiques' },
      { en: 'A frame around your level every 10 levels, all the way to 500',
        fr: 'Un cadre autour de votre niveau tous les 10 niveaux, jusqu’au niveau 500' },
      { en: 'Five frame styles to wear, picked on the Customization screen',
        fr: 'Cinq styles de cadre à porter, choisis sur l’écran Personnalisation' },
      { en: 'Friends see the frame you wear, on your picture and your profile',
        fr: 'Vos amis voient le cadre que vous portez, sur votre photo et votre profil' }
    ]
  },
  {
    id: 'bazaar', icon: 'trade', accent: '#4ade80',
    title: { en: 'The market opens', fr: 'Le marché ouvre' },
    points: [
      { en: 'Auctions between all players: put a card up, highest bid takes it',
        fr: 'Des enchères entre tous les joueurs : proposez une carte, la meilleure mise l’emporte' },
      { en: 'Bids must rise by 15%; a bid in the last 10 seconds winds the clock back up',
        fr: 'Chaque mise doit monter de 15 % ; une mise dans les 10 dernières secondes relance le temps' },
      { en: 'Two new themes: Cartoon, all ink and rubber, and Matrix, green rain on black',
        fr: 'Deux nouveaux thèmes : Cartoon, tout en encre et caoutchouc, et Matrix, pluie verte sur noir' },
      { en: 'Both speak in real recordings, dedicated to the public domain',
        fr: 'Tous deux parlent en vrais enregistrements, dédiés au domaine public' },
      { en: 'A Badges screen: wear the four you are proudest of',
        fr: 'Un écran Insignes : portez les quatre dont vous êtes le plus fier' },
      { en: 'Arrows under the cards when opening a booster, for thumbs that do not swipe',
        fr: 'Des flèches sous les cartes à l’ouverture d’un booster, pour les pouces qui ne glissent pas' }
    ]
  }
];
