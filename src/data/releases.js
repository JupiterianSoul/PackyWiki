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
  }
];
