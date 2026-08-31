/**
 * PACK TABLE
 * ----------------------------------------------------------------------------
 * One row per subject. Everything the player sees is bilingual, and so are the
 * search queries: a booster has to pull French articles when the app is in
 * French, not English ones with French chrome around them.
 *
 * queries - used verbatim as the search API's `srsearch`, so a row can mix:
 *
 *     'incategory:"Sports cars"'   only DIRECT members of that category
 *     'sports car model'           ordinary full-text search
 *
 * `incategory:` doesn't descend into subcategories, so a broad category alone
 * gives a shallow pool; the free-text queries fill it back out. They also
 * travel between languages far better than category names do, which is why the
 * French lists lean on them.
 *
 * hero  - the article whose lead photograph becomes the booster's pack art.
 * icon  - key in src/data/icons.js, used only when that photo is unavailable.
 */

export const THEME_PACKS = [
  {
    id: 'cars', icon: 'cars',
    name: { en: 'Cars', fr: 'Voitures' },
    tagline: { en: 'Marques, models and the machines behind them.',
               fr: 'Marques, modèles et les machines derrière.' },
    hero: { en: 'Ferrari F40', fr: 'Ferrari F40' },
    accent: '#f87171', accent2: '#7f1d1d',
    queries: {
      en: ['incategory:"Sports cars"', 'incategory:"Car manufacturers"', 'incategory:"Electric cars"',
           'incategory:"Cars"', 'sports car model', 'automobile marque'],
      fr: ['incategory:"Automobile"', 'incategory:"Constructeur automobile"',
           'voiture de sport', 'modèle automobile', 'constructeur automobile', 'automobile']
    }
  },
  {
    id: 'f1', icon: 'f1',
    name: { en: 'Formula One', fr: 'Formule 1' },
    tagline: { en: 'Drivers, constructors, circuits and Grands Prix.',
               fr: 'Pilotes, écuries, circuits et Grands Prix.' },
    hero: { en: 'Formula One', fr: 'Formule 1' },
    accent: '#ef4444', accent2: '#450a0a',
    queries: {
      en: ['incategory:"Formula One drivers"', 'incategory:"Formula One constructors"',
           'incategory:"Formula One Grands Prix"', 'incategory:"Formula One circuits"',
           'Formula One season', 'Formula One driver'],
      fr: ['incategory:"Formule 1"', 'incategory:"Pilote de Formule 1"',
           'Grand Prix automobile', 'saison de Formule 1', 'écurie de Formule 1', 'circuit automobile']
    }
  },
  {
    id: 'planes', icon: 'planes',
    name: { en: 'Planes', fr: 'Avions' },
    tagline: { en: 'Airliners, fighters and the people who built them.',
               fr: 'Avions de ligne, chasseurs et leurs constructeurs.' },
    hero: { en: 'Boeing 747', fr: 'Boeing 747' },
    accent: '#60a5fa', accent2: '#1e3a8a',
    queries: {
      en: ['incategory:"Airliners"', 'incategory:"Military aircraft"',
           'incategory:"Aircraft manufacturers"', 'incategory:"Jet aircraft"',
           'aircraft type', 'airliner'],
      fr: ['incategory:"Avion"', 'incategory:"Avion de ligne"', 'avion de chasse',
           'constructeur aéronautique', 'aéronef', 'avion militaire']
    }
  },
  {
    id: 'video-games', icon: 'video-games',
    name: { en: 'Video Games', fr: 'Jeux vidéo' },
    tagline: { en: 'Titles, studios, consoles and genres.',
               fr: 'Titres, studios, consoles et genres.' },
    hero: { en: 'Video game', fr: 'Jeu vidéo' },
    accent: '#a78bfa', accent2: '#4c1d95',
    queries: {
      en: ['incategory:"Video games"', 'incategory:"Video game developers"',
           'incategory:"Video game consoles"', 'video game', 'video game developer'],
      fr: ['incategory:"Jeu vidéo"', 'incategory:"Console de jeux vidéo"',
           'jeu vidéo', 'studio de développement', 'console de jeu']
    }
  },
  {
    id: 'books', icon: 'books',
    name: { en: 'Books', fr: 'Livres' },
    tagline: { en: 'Novels, authors and literary movements.',
               fr: 'Romans, auteurs et mouvements littéraires.' },
    hero: { en: 'Book', fr: 'Livre' },
    accent: '#fbbf24', accent2: '#78350f',
    queries: {
      en: ['incategory:"Novels"', 'incategory:"Books"', 'incategory:"Writers"',
           'incategory:"Literature"', 'novel by', 'literary movement'],
      fr: ['incategory:"Roman"', 'incategory:"Écrivain"', 'incategory:"Littérature"',
           'roman de', 'mouvement littéraire', 'œuvre littéraire']
    }
  },
  {
    id: 'movies', icon: 'movies',
    name: { en: 'Movies & Shows', fr: 'Films et séries' },
    tagline: { en: 'Films, series, directors and genres.',
               fr: 'Films, séries, réalisateurs et genres.' },
    hero: { en: 'Film', fr: 'Cinéma' },
    accent: '#f472b6', accent2: '#831843',
    queries: {
      en: ['incategory:"Films"', 'incategory:"Television series"',
           'incategory:"Film directors"', 'film directed by', 'television series'],
      fr: ['incategory:"Film"', 'incategory:"Série télévisée"', 'incategory:"Réalisateur"',
           'film réalisé par', 'série télévisée', 'long métrage']
    }
  },
  {
    id: 'space', icon: 'space',
    name: { en: 'Space', fr: 'Espace' },
    tagline: { en: 'Planets, probes, galaxies and missions.',
               fr: 'Planètes, sondes, galaxies et missions.' },
    hero: { en: 'Saturn', fr: 'Saturne (planète)' },
    accent: '#818cf8', accent2: '#312e81',
    queries: {
      en: ['incategory:"Planets"', 'incategory:"Spacecraft"', 'incategory:"Constellations"',
           'incategory:"Galaxies"', 'space probe', 'star system'],
      fr: ['incategory:"Planète"', 'incategory:"Constellation"', 'incategory:"Galaxie"',
           'sonde spatiale', 'mission spatiale', 'système stellaire']
    }
  },
  {
    id: 'physics', icon: 'physics',
    name: { en: 'Physics', fr: 'Physique' },
    tagline: { en: 'Forces, particles and the laws underneath.',
               fr: 'Forces, particules et les lois en dessous.' },
    hero: { en: 'Physics', fr: 'Physique' },
    accent: '#22d3ee', accent2: '#164e63',
    queries: {
      en: ['incategory:"Physics"', 'incategory:"Concepts in physics"',
           'incategory:"Particle physics"', 'physical law', 'subatomic particle'],
      fr: ['incategory:"Physique"', 'incategory:"Mécanique quantique"',
           'loi physique', 'particule élémentaire', 'grandeur physique']
    }
  },
  {
    id: 'nature', icon: 'nature',
    name: { en: 'Nature', fr: 'Nature' },
    tagline: { en: 'Mountains, rivers, deserts and weather.',
               fr: 'Montagnes, fleuves, déserts et climat.' },
    hero: { en: 'Mountain', fr: 'Montagne' },
    accent: '#34d399', accent2: '#065f46',
    queries: {
      en: ['incategory:"Mountains"', 'incategory:"Rivers"', 'incategory:"Volcanoes"',
           'incategory:"Deserts"', 'mountain range', 'national park'],
      fr: ['incategory:"Montagne"', 'incategory:"Volcan"', 'incategory:"Fleuve"',
           'chaîne de montagnes', 'parc national', 'désert']
    }
  },
  {
    id: 'animals', icon: 'animals',
    name: { en: 'Animals', fr: 'Animaux' },
    tagline: { en: 'Mammals, birds, reptiles, fish and insects.',
               fr: 'Mammifères, oiseaux, reptiles, poissons et insectes.' },
    hero: { en: 'Lion', fr: 'Lion' },
    accent: '#fb923c', accent2: '#7c2d12',
    queries: {
      en: ['incategory:"Mammals"', 'incategory:"Birds"', 'incategory:"Reptiles"',
           'incategory:"Insects"', 'species of mammal', 'species of bird'],
      fr: ['incategory:"Mammifère"', 'incategory:"Oiseau"', 'incategory:"Reptile"',
           'espèce de mammifère', 'espèce d’oiseau', 'insecte']
    }
  },
  {
    id: 'plants', icon: 'plants',
    name: { en: 'Plants', fr: 'Plantes' },
    tagline: { en: 'Trees, flowers and everything photosynthetic.',
               fr: 'Arbres, fleurs et tout ce qui photosynthétise.' },
    hero: { en: 'Flower', fr: 'Fleur' },
    accent: '#4ade80', accent2: '#14532d',
    queries: {
      en: ['incategory:"Trees"', 'incategory:"Flowers"', 'incategory:"Plants"',
           'species of plant', 'flowering plant'],
      fr: ['incategory:"Arbre"', 'incategory:"Plante"', 'incategory:"Fleur"',
           'espèce de plante', 'plante à fleurs']
    }
  },
  {
    id: 'history', icon: 'history',
    name: { en: 'History', fr: 'Histoire' },
    tagline: { en: 'Empires, wars, ruins and revolutions.',
               fr: 'Empires, guerres, ruines et révolutions.' },
    hero: { en: 'Colosseum', fr: 'Colisée' },
    accent: '#d6a25c', accent2: '#78350f',
    queries: {
      en: ['incategory:"Ancient history"', 'incategory:"Wars"', 'incategory:"Empires"',
           'incategory:"Ancient Rome"', 'incategory:"Battles"', 'ancient civilization'],
      fr: ['incategory:"Rome antique"', 'incategory:"Égypte antique"', 'incategory:"Guerre"',
           'bataille de', 'civilisation antique', 'empire']
    }
  },
  {
    id: 'philosophy', icon: 'philosophy',
    name: { en: 'Philosophy', fr: 'Philosophie' },
    tagline: { en: 'Thinkers, schools and awkward questions.',
               fr: 'Penseurs, écoles et questions gênantes.' },
    hero: { en: 'The Thinker', fr: 'Le Penseur' },
    accent: '#c084fc', accent2: '#581c87',
    queries: {
      en: ['incategory:"Philosophers"', 'incategory:"Philosophy"', 'incategory:"Ethics"',
           'philosophical theory', 'school of philosophy'],
      fr: ['incategory:"Philosophe"', 'incategory:"Philosophie"',
           'courant philosophique', 'théorie philosophique', 'concept philosophique']
    }
  },
  {
    id: 'celebrities', icon: 'celebrities',
    name: { en: 'Celebrities', fr: 'Célébrités' },
    tagline: { en: 'Actors, musicians and household names.',
               fr: 'Acteurs, musiciens et noms connus de tous.' },
    hero: { en: 'Hollywood Sign', fr: 'Hollywood Sign' },
    accent: '#facc15', accent2: '#713f12',
    queries: {
      en: ['incategory:"Actors"', 'incategory:"Musicians"', 'incategory:"Singers"',
           'actress known for', 'singer songwriter'],
      fr: ['incategory:"Acteur"', 'incategory:"Chanteur"', 'incategory:"Actrice"',
           'auteur-compositeur-interprète', 'acteur français', 'chanteuse']
    }
  },
  {
    id: 'quotes', icon: 'quotes',
    name: { en: 'Quotes', fr: 'Citations' },
    tagline: { en: 'Catchphrases, mottos, proverbs and slogans.',
               fr: 'Répliques, devises, proverbes et slogans.' },
    hero: { en: 'Quotation', fr: 'Citation' },
    accent: '#e879f9', accent2: '#701a75',
    queries: {
      en: ['incategory:"Quotations"', 'incategory:"Catchphrases"', 'incategory:"Slogans"',
           'incategory:"Proverbs"', 'famous quotation', 'catchphrase'],
      fr: ['incategory:"Proverbe"', 'incategory:"Devise"', 'incategory:"Expression"',
           'expression française', 'citation célèbre', 'slogan']
    }
  },
  {
    id: 'art', icon: 'art',
    name: { en: 'Art', fr: 'Art' },
    tagline: { en: 'Paintings, sculpture, movements and makers.',
               fr: 'Peintures, sculptures, mouvements et artistes.' },
    hero: { en: 'Mona Lisa', fr: 'La Joconde' },
    accent: '#fb7185', accent2: '#881337',
    queries: {
      en: ['incategory:"Paintings"', 'incategory:"Painters"', 'incategory:"Art movements"',
           'incategory:"Sculpture"', 'painting by', 'art movement'],
      fr: ['incategory:"Peinture"', 'incategory:"Peintre"', 'incategory:"Sculpture"',
           'tableau de', 'mouvement artistique', 'œuvre d’art']
    }
  },
  {
    id: 'cactus', icon: 'cactus',
    name: { en: 'Cactus', fr: 'Cactus' },
    tagline: { en: 'Cacti and the wider succulent family.',
               fr: 'Cactus et la grande famille des succulentes.' },
    hero: { en: 'Cactus', fr: 'Cactaceae' },
    accent: '#84cc16', accent2: '#3f6212',
    queries: {
      en: ['incategory:"Cactaceae"', 'incategory:"Cacti"', 'incategory:"Succulent plants"',
           'cactus species', 'succulent plant', 'Opuntia'],
      fr: ['incategory:"Cactaceae"', 'incategory:"Plante succulente"',
           'cactus', 'plante grasse', 'Opuntia', 'Echinocactus']
    }
  },
  {
    id: 'sport', icon: 'sport',
    name: { en: 'Sport', fr: 'Sport' },
    tagline: { en: 'Games, leagues, athletes and records.',
               fr: 'Disciplines, ligues, athlètes et records.' },
    hero: { en: 'Sport', fr: 'Sport' },
    accent: '#2dd4bf', accent2: '#134e4a',
    queries: {
      en: ['incategory:"Sports"', 'incategory:"Olympic sports"', 'incategory:"Team sports"',
           'incategory:"Association football"', 'professional athlete', 'sports league'],
      fr: ['incategory:"Sport"', 'incategory:"Football"', 'incategory:"Sport olympique"',
           'sportif français', 'championnat sportif', 'discipline sportive']
    }
  },
  {
    id: 'music', icon: 'music',
    name: { en: 'Music', fr: 'Musique' },
    tagline: { en: 'Bands, albums, composers and the songs that stuck.',
               fr: 'Groupes, albums, compositeurs et les chansons qui restent.' },
    hero: { en: 'The Beatles', fr: 'The Beatles' },
    accent: '#ff4fa3', accent2: '#57002f',
    queries: {
      en: ['rock band', 'studio album', 'music genre', 'jazz musician',
           'classical composer', 'hip hop musician'],
      fr: ['groupe de rock', 'album studio', 'genre musical',
           'compositeur', 'chanteuse', 'rappeur']
    }
  },
  {
    id: 'records', icon: 'records',
    name: { en: 'World Records', fr: 'Records du monde' },
    tagline: { en: 'The tallest, the fastest, the oldest, the strangest.',
               fr: 'Les plus hauts, les plus rapides, les plus anciens, les plus étranges.' },
    hero: { en: 'Guinness World Records', fr: 'Livre Guinness des records' },
    accent: '#e6edf7', accent2: '#12335e',
    queries: {
      en: ['world record', 'Guinness World Records', 'largest structure',
           'fastest vehicle', 'longest river', 'tallest building'],
      fr: ['record du monde', 'records Guinness', 'plus grand édifice',
           'véhicule le plus rapide', 'plus long fleuve', 'plus haut gratte-ciel']
    }
  },
  {
    id: 'food', icon: 'food',
    name: { en: 'Food', fr: 'Cuisine' },
    tagline: { en: 'Dishes, ingredients and cuisines of the world.',
               fr: 'Plats, ingrédients et cuisines du monde.' },
    hero: { en: 'Pizza', fr: 'Pizza' },
    accent: '#ff6b57', accent2: '#571405',
    queries: {
      en: ['national dish', 'traditional cuisine', 'dessert', 'street food',
           'cheese', 'incategory:"Fast food"'],
      fr: ['plat traditionnel', 'cuisine régionale', 'dessert', 'fromage',
           'spécialité culinaire', 'boisson traditionnelle']
    }
  },
  {
    id: 'geography', icon: 'geography',
    name: { en: 'Geography', fr: 'Géographie' },
    tagline: { en: 'Countries, capitals, rivers and mountain ranges.',
               fr: 'Pays, capitales, fleuves et chaînes de montagnes.' },
    hero: { en: 'Mount Everest', fr: 'Everest' },
    accent: '#0ea5e9', accent2: '#0b3a5c',
    queries: {
      en: ['incategory:"Member states of the United Nations"', 'mountain range',
           'longest river', 'capital city', 'island nation', 'desert region'],
      fr: ['chaîne de montagnes', 'fleuve', 'capitale', 'île',
           'désert', 'pays européen']
    }
  },
  {
    id: 'technology', icon: 'technology',
    name: { en: 'Technology', fr: 'Technologie' },
    tagline: { en: 'Machines, gadgets, code and the ideas inside them.',
               fr: 'Machines, gadgets et les idées qui les animent.' },
    hero: { en: 'Robot', fr: 'Robot' },
    accent: '#4cc9f0', accent2: '#10243e',
    queries: {
      en: ['incategory:"Consumer electronics"', 'smartphone', 'operating system',
           'microprocessor', 'robotics', 'artificial intelligence'],
      fr: ['ordinateur', 'téléphone mobile', "système d'exploitation",
           'microprocesseur', 'robotique', 'intelligence artificielle']
    }
  },
  {
    id: 'weapons', icon: 'weapons',
    name: { en: 'Weapons', fr: 'Armes' },
    tagline: { en: 'Blades, bows and firearms across the ages.',
               fr: 'Lames, arcs et armes à feu à travers les âges.' },
    hero: { en: 'Katana', fr: 'Katana' },
    accent: '#aab4c4', accent2: '#1b1f27',
    queries: {
      en: ['incategory:"Swords"', 'medieval weapon', 'firearm', 'artillery',
           'siege weapon', 'military rifle'],
      fr: ['épée', 'arme médiévale', 'arme à feu', 'artillerie',
           'arme de siège', 'fusil militaire']
    }
  },
  {
    id: 'weird', icon: 'weird',
    name: { en: 'Weird', fr: 'Insolite' },
    tagline: { en: 'Cryptids, legends and the unexplained.',
               fr: 'Cryptides, légendes et phénomènes inexpliqués.' },
    hero: { en: 'Loch Ness Monster', fr: 'Monstre du loch Ness' },
    accent: '#a3e635', accent2: '#2e1065',
    queries: {
      en: ['cryptid', 'urban legend', 'unexplained phenomenon', 'paranormal',
           'mysterious disappearance', 'hoax'],
      fr: ['cryptide', 'légende urbaine', 'phénomène inexpliqué', 'paranormal',
           'disparition mystérieuse', 'canular']
    }
  },
  {
    id: 'memes', icon: 'memes',
    name: { en: 'Memes', fr: 'Mèmes' },
    tagline: { en: 'Internet culture and the jokes that went too far.',
               fr: 'La culture Internet et les blagues devenues cultes.' },
    hero: { en: 'Grumpy Cat', fr: 'Grumpy Cat' },
    accent: '#ffd60a', accent2: '#003566',
    queries: {
      en: ['incategory:"Internet memes"', 'Internet meme', 'viral video',
           'Internet phenomenon', 'YouTube personality', 'image macro'],
      fr: ['incategory:"Mème Internet"', 'mème Internet', 'vidéo virale',
           'phénomène Internet', 'vidéaste web', 'culture Internet']
    }
  }
].map((pack) => ({ ...pack, group: 'theme', source: 'wikipedia' }));

export const themeById = (id) => THEME_PACKS.find((p) => p.id === id) ?? null;

/** Hero article titles for the batched pack-art lookup, in one language. */
export const heroTitles = (lang) => THEME_PACKS.map((p) => p.hero[lang] ?? p.hero.en);
