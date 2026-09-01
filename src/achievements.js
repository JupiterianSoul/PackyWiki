/**
 * ACHIEVEMENTS
 * ============================================================================
 * A ladder of goals across the whole game. Each achievement is COMPUTED from
 * the player's real state - nothing is "awarded" at some moment that could be
 * missed; if the condition holds, the achievement is unlocked. The only thing
 * stored is which ones have been REDEEMED (the reward taken), on the profile:
 *
 *   profile.achievements = { redeemed: ['first-pack', ...] }
 *
 * Rewards scale with difficulty: coins for the easy rungs, boosters - up to
 * high-tier rarity boosters - for the hard ones.
 */
import { tx } from './i18n.js';

/**
 * The measurable facts achievements are judged against. main.js builds one
 * of these from live state whenever the list is rendered.
 *   boosters, cards, unique, value, level, albumsDeep, legendaries, artifacts,
 *   customsBuilt, friends, streakDays (total daily claims), playHours, sold
 */
export function measure({ profile, entries, albumsDeep, customPacks, friends }) {
  const rc = profile.rarityCounts ?? {};
  const high = ['legendary', 'mythic', 'exotic', 'artifact']
    .reduce((sum, id) => sum + (rc[id] ?? 0), 0);
  return {
    boosters: profile.boostersOpened ?? 0,
    cards: Object.values(rc).reduce((sum, n) => sum + n, 0),
    unique: entries.length,
    value: entries.reduce((sum, e) => sum + e.price * e.count, 0),
    level: profile.progress?.level ?? 1,
    albumsDeep,
    legendaries: high,
    artifacts: rc.artifact ?? 0,
    customsBuilt: customPacks.length,
    friends,
    dailyClaims: (profile.daily?.board ?? 0) * 30 + (profile.daily?.claimed ?? 0),
    playHours: (profile.playMs ?? 0) / 3600000,
    sold: profile.cardsSold ?? 0
  };
}

const A = (id, icon, stat, need, reward, name, desc) =>
  ({ id, icon, stat, need, reward, name, desc });
const coins = (n) => ({ kind: 'coins', coins: n });
const pack = (rarityId, cards = 5) => ({ kind: 'booster', spec: { kind: 'open', themeId: null, rarityId, cards } });

export const ACHIEVEMENTS = [
  // Opening packs
  A('first-pack', 'packs', 'boosters', 1, coins(300),
    { en: 'First rip', fr: 'Première ouverture' },
    { en: 'Open your first booster', fr: 'Ouvrez votre premier booster' }),
  A('pack-10', 'packs', 'boosters', 10, coins(800),
    { en: 'Getting the hang of it', fr: 'La main est prise' },
    { en: 'Open 10 boosters', fr: 'Ouvrez 10 boosters' }),
  A('pack-50', 'packs', 'boosters', 50, coins(2500),
    { en: 'Serial opener', fr: 'Ouvreur en série' },
    { en: 'Open 50 boosters', fr: 'Ouvrez 50 boosters' }),
  A('pack-200', 'packs', 'boosters', 200, pack('epic', 6),
    { en: 'Foil in the veins', fr: 'Du papier alu dans les veines' },
    { en: 'Open 200 boosters', fr: 'Ouvrez 200 boosters' }),

  // The collection
  A('cards-25', 'collection', 'cards', 25, coins(500),
    { en: 'A start', fr: 'Un début' },
    { en: 'Pull 25 cards', fr: 'Tirez 25 cartes' }),
  A('cards-150', 'collection', 'cards', 150, coins(1800),
    { en: 'Stacking up', fr: 'Ça s’empile' },
    { en: 'Pull 150 cards', fr: 'Tirez 150 cartes' }),
  A('cards-600', 'collection', 'cards', 600, pack('rare', 6),
    { en: 'The great pile', fr: 'La grande pile' },
    { en: 'Pull 600 cards', fr: 'Tirez 600 cartes' }),
  A('unique-100', 'collection', 'unique', 100, coins(1500),
    { en: 'Curator', fr: 'Curateur' },
    { en: 'Own 100 different cards', fr: 'Possédez 100 cartes différentes' }),
  A('value-25k', 'gem', 'value', 25000, coins(2000),
    { en: 'Worth something', fr: 'Ça vaut quelque chose' },
    { en: 'Collection worth ฿25,000', fr: 'Collection à ฿25 000' }),
  A('value-150k', 'gem', 'value', 150000, pack('legendary', 5),
    { en: 'Serious money', fr: 'Sérieux capital' },
    { en: 'Collection worth ฿150,000', fr: 'Collection à ฿150 000' }),

  // Albums
  // An album is measured against its category's real size, so "complete" is
  // not a thing anyone will ever do. Depth is: twenty five cards in one book
  // is a shelf that looks collected.
  A('album-1', 'collection', 'albumsDeep', 1, coins(2000),
    { en: 'Bound and shelved', fr: 'Relié et rangé' },
    { en: 'Get 25 cards into one album', fr: 'Réunissez 25 cartes dans un album' }),
  A('album-3', 'collection', 'albumsDeep', 3, pack('epic', 5),
    { en: 'Librarian', fr: 'Bibliothécaire' },
    { en: 'Stock 3 albums with 25 cards each', fr: 'Garnissez 3 albums de 25 cartes chacun' }),
  A('album-10', 'collection', 'albumsDeep', 10, pack('mythic', 5),
    { en: 'The archive', fr: 'L’archive' },
    { en: 'Stock 10 albums with 25 cards each', fr: 'Garnissez 10 albums de 25 cartes chacun' }),

  // Big pulls
  A('legendary-1', 'spark', 'legendaries', 1, coins(1000),
    { en: 'It shines', fr: 'Ça brille' },
    { en: 'Pull a Legendary or better', fr: 'Tirez une Légendaire ou mieux' }),
  A('legendary-10', 'spark', 'legendaries', 10, pack('legendary', 5),
    { en: 'Star magnet', fr: 'Aimant à étoiles' },
    { en: 'Pull 10 Legendary-or-better cards', fr: 'Tirez 10 cartes Légendaires ou mieux' }),
  A('artifact-1', 'gem', 'artifacts', 1, pack('exotic', 5),
    { en: 'The relic', fr: 'La relique' },
    { en: 'Pull an Artifact', fr: 'Tirez un Artefact' }),

  // Builders and friends
  A('custom-1', 'wand', 'customsBuilt', 1, coins(600),
    { en: 'Wiki smith', fr: 'Forgeron de wiki' },
    { en: 'Build a custom booster', fr: 'Créez un booster personnalisé' }),
  A('custom-5', 'wand', 'customsBuilt', 5, coins(2500),
    { en: 'Pack press', fr: 'Presse à paquets' },
    { en: 'Build 5 custom boosters', fr: 'Créez 5 boosters personnalisés' }),
  A('friend-1', 'friends', 'friends', 1, coins(800),
    { en: 'Not alone', fr: 'Pas seul' },
    { en: 'Make a friend', fr: 'Ajoutez un ami' }),
  A('friend-5', 'friends', 'friends', 5, coins(2500),
    { en: 'The table is full', fr: 'La table est pleine' },
    { en: 'Have 5 friends', fr: 'Ayez 5 amis' }),

  // Time and habit
  A('level-5', 'profile', 'level', 5, coins(700),
    { en: 'Warmed up', fr: 'Échauffé' },
    { en: 'Reach level 5', fr: 'Atteignez le niveau 5' }),
  A('level-15', 'profile', 'level', 15, coins(3000),
    { en: 'Veteran', fr: 'Vétéran' },
    { en: 'Reach level 15', fr: 'Atteignez le niveau 15' }),
  A('level-30', 'profile', 'level', 30, pack('exotic', 6),
    { en: 'Living legend', fr: 'Légende vivante' },
    { en: 'Reach level 30', fr: 'Atteignez le niveau 30' }),
  A('daily-7', 'gift', 'dailyClaims', 7, coins(900),
    { en: 'A good week', fr: 'Une bonne semaine' },
    { en: 'Claim 7 daily gifts', fr: 'Réclamez 7 cadeaux quotidiens' }),
  A('daily-30', 'gift', 'dailyClaims', 30, pack('epic', 5),
    { en: 'The regular', fr: 'L’habitué' },
    { en: 'Claim 30 daily gifts', fr: 'Réclamez 30 cadeaux quotidiens' }),
  A('hours-5', 'clock', 'playHours', 5, coins(1200),
    { en: 'Time flies', fr: 'Le temps file' },
    { en: 'Play for 5 hours', fr: 'Jouez 5 heures' })
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
