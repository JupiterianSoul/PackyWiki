/**
 * THE QUEST BOOK
 * ----------------------------------------------------------------------------
 * Every daily quest the game can hand out, as a template: what is counted
 * (`metric`, a name the app reports progress under), how much (`target`),
 * how hard (`tier`), and what it pays. Three are dealt a day, on the server,
 * from the UTC date and the player's id: Easy six times in ten, Medium three,
 * Hard one (see supabase/functions/quests). An Easy quest is meant to take
 * about ten minutes of ordinary play.
 *
 * `metric` is the contract with the rest of the app. Progress is reported
 * with quests.track(metric, amount, detail); the metrics are:
 *
 *   open           a booster opened               detail: { themeId, rarityId, kind }
 *   pull           a card pulled                  detail: { rarityId, themeId, isNew, popularity }
 *   sell           a card sold                    detail: { amount }
 *   buy            a booster bought               detail: { price, kind }
 *   wikdle         a Wikdle finished              detail: { won, guesses }
 *   slots          a spin                         detail: { bet, won, lines }
 *   points         minigame points earned         detail: { game }
 *   quiz           a quiz finished                detail: { correct }
 *   album          an album completed
 *   friend         a friend request accepted
 *   gift           a gift sent
 *   trade          a trade completed
 *   playtime       a minute played
 *   custom         a custom booster built
 *   daily          the daily gift claimed
 *   fx             a card effect chosen
 *   view           a card looked at in detail
 *
 * `where` narrows a metric to a detail: { rarityId } or { themeId } or
 * { won: true } and so on; a report that does not match is not counted.
 */
import { RARITIES } from './rarities.js';

const R = (n) => ({ money: n });
const RB = (n, spec) => ({ money: n, booster: spec });

const EASY = [], MEDIUM = [], HARD = [];
const easy = (q) => EASY.push({ tier: 'easy', ...q });
const medium = (q) => MEDIUM.push({ tier: 'medium', ...q });
const hard = (q) => HARD.push({ tier: 'hard', ...q });

// --- opening and pulling ----------------------------------------------------
easy({ id: 'open-1', metric: 'open', target: 1, reward: R(60), name: { en: 'Tear one open', fr: 'Ouvrez-en un' } });
easy({ id: 'open-2', metric: 'open', target: 2, reward: R(110), name: { en: 'Two packs, one sitting', fr: 'Deux boosters d’affilée' } });
easy({ id: 'open-3', metric: 'open', target: 3, reward: R(160), name: { en: 'A three-pack morning', fr: 'Trois boosters ce matin' } });
easy({ id: 'pull-5', metric: 'pull', target: 5, reward: R(60), name: { en: 'Five new pages', fr: 'Cinq nouvelles pages' } });
easy({ id: 'pull-10', metric: 'pull', target: 10, reward: R(120), name: { en: 'Ten cards in hand', fr: 'Dix cartes en main' } });
easy({ id: 'pull-new-3', metric: 'pull', where: { isNew: true }, target: 3, reward: R(100), name: { en: 'Three you had never seen', fr: 'Trois jamais vues' } });
easy({ id: 'pull-uncommon-2', metric: 'pull', where: { rarityId: 'uncommon' }, target: 2, reward: R(90), name: { en: 'Two Uncommon prints', fr: 'Deux impressions Peu communes' } });
easy({ id: 'pull-rare-1', metric: 'pull', where: { rarityId: 'rare' }, target: 1, reward: R(120), name: { en: 'One Rare print', fr: 'Une impression Rare' } });
easy({ id: 'pull-famous-2', metric: 'pull', where: { famous: true }, target: 2, reward: R(90), name: { en: 'Two famous articles', fr: 'Deux articles célèbres' } });
easy({ id: 'open-basic-1', metric: 'open', where: { kind: 'open' }, target: 1, reward: R(70), name: { en: 'Open a basic booster', fr: 'Ouvrez un booster de base' } });
easy({ id: 'open-theme-1', metric: 'open', where: { kind: 'theme' }, target: 1, reward: R(70), name: { en: 'Open a subject booster', fr: 'Ouvrez un booster par sujet' } });
easy({ id: 'open-timed-1', metric: 'open', where: { kind: 'timed' }, target: 1, reward: R(60), name: { en: 'Open a free pack', fr: 'Ouvrez un pack gratuit' } });
easy({ id: 'open-custom-1', metric: 'open', where: { kind: 'custom' }, target: 1, reward: R(90), name: { en: 'Open a booster you built', fr: 'Ouvrez un booster fait maison' } });
medium({ id: 'open-5', metric: 'open', target: 5, reward: R(300), name: { en: 'Five packs today', fr: 'Cinq boosters aujourd’hui' } });

// --- the duel and the reveal --------------------------------------------------
easy({ id: 'duel-1', metric: 'duel', target: 1, reward: R(80), name: { en: 'Play a popularity duel', fr: 'Jouez un duel de popularité' } });
easy({ id: 'reveal-1', metric: 'reveal', target: 1, reward: R(80), name: { en: 'Guess the article, one round', fr: 'Devinez l’article, une manche' } });
medium({ id: 'duel-streak-5', metric: 'duel', where: { minCorrect: 5 }, target: 1, reward: R(240), name: { en: 'A duel streak of five', fr: 'Une série de cinq au duel' } });
medium({ id: 'reveal-6', metric: 'reveal', where: { minCorrect: 6 }, target: 1, reward: R(240), name: { en: 'Six of eight articles named', fr: 'Six articles sur huit nommés' } });
hard({ id: 'reveal-perfect', metric: 'reveal', where: { minCorrect: 8 }, target: 1, reward: R(520), name: { en: 'A perfect reveal round', fr: 'Une manche parfaite de devinette' } });
medium({ id: 'pull-25', metric: 'pull', target: 25, reward: R(320), name: { en: 'Twenty-five pages', fr: 'Vingt-cinq pages' } });
medium({ id: 'pull-rare-3', metric: 'pull', where: { rarityId: 'rare' }, target: 3, reward: R(340), name: { en: 'Three Rare prints', fr: 'Trois impressions Rares' } });
medium({ id: 'pull-epic-1', metric: 'pull', where: { rarityId: 'epic' }, target: 1, reward: R(380), name: { en: 'An Epic print', fr: 'Une impression Épique' } });
medium({ id: 'pull-new-10', metric: 'pull', where: { isNew: true }, target: 10, reward: R(360), name: { en: 'Ten never seen before', fr: 'Dix jamais vues' } });
medium({ id: 'open-tier-1', metric: 'open', where: { tiered: true }, target: 1, reward: R(300), name: { en: 'Open a tier booster', fr: 'Ouvrez un booster à palier' } });
medium({ id: 'open-themes-3', metric: 'open', where: { kind: 'theme' }, target: 3, reward: R(320), name: { en: 'Three subject boosters', fr: 'Trois boosters par sujet' } });
hard({ id: 'open-12', metric: 'open', target: 12, reward: RB(900, { kind: 'open', themeId: null, rarityId: 'rare', cards: 5 }), name: { en: 'A dozen packs', fr: 'Une douzaine de boosters' } });
hard({ id: 'pull-legendary-1', metric: 'pull', where: { rarityId: 'legendary' }, target: 1, reward: R(1200), name: { en: 'A Legendary print', fr: 'Une impression Légendaire' } });
hard({ id: 'pull-epic-3', metric: 'pull', where: { rarityId: 'epic' }, target: 3, reward: R(1000), name: { en: 'Three Epic prints', fr: 'Trois impressions Épiques' } });
hard({ id: 'pull-60', metric: 'pull', target: 60, reward: R(1100), name: { en: 'Sixty cards in a day', fr: 'Soixante cartes en un jour' } });
hard({ id: 'pull-mythic-1', metric: 'pull', where: { rarityId: 'mythic' }, target: 1, reward: RB(1500, { kind: 'open', themeId: null, rarityId: 'epic', cards: 5 }), name: { en: 'A Mythic print', fr: 'Une impression Mythique' } });

// --- subjects: one quest per theme, three sizes -------------------------------
const THEMES = [
  ['animals', { en: 'Animals', fr: 'Animaux' }], ['space', { en: 'Space', fr: 'Espace' }],
  ['history', { en: 'History', fr: 'Histoire' }], ['science', { en: 'Science', fr: 'Sciences' }],
  ['geography', { en: 'Geography', fr: 'Géographie' }], ['art', { en: 'Art', fr: 'Art' }],
  ['music', { en: 'Music', fr: 'Musique' }], ['food', { en: 'Food', fr: 'Cuisine' }],
  ['sport', { en: 'Sport', fr: 'Sport' }], ['games', { en: 'Games', fr: 'Jeux' }],
  ['weird', { en: 'Weird', fr: 'Insolite' }], ['tech', { en: 'Technology', fr: 'Technologie' }]
];
for (const [themeId, name] of THEMES) {
  easy({ id: `theme-${themeId}-3`, metric: 'pull', where: { themeId }, target: 3, reward: R(90),
    name: { en: `Three ${name.en} cards`, fr: `Trois cartes ${name.fr}` } });
  medium({ id: `theme-${themeId}-8`, metric: 'pull', where: { themeId }, target: 8, reward: R(300),
    name: { en: `Eight ${name.en} cards`, fr: `Huit cartes ${name.fr}` } });
  hard({ id: `theme-${themeId}-rare-2`, metric: 'pull', where: { themeId, minRarity: 'rare' }, target: 2, reward: R(900),
    name: { en: `Two Rare-or-better ${name.en} cards`, fr: `Deux cartes ${name.fr} Rares ou mieux` } });
}

// --- the shop and the market -------------------------------------------------
easy({ id: 'buy-1', metric: 'buy', target: 1, reward: R(50), name: { en: 'Buy a booster', fr: 'Achetez un booster' } });
easy({ id: 'sell-1', metric: 'sell', target: 1, reward: R(50), name: { en: 'Sell a card', fr: 'Vendez une carte' } });
easy({ id: 'sell-3', metric: 'sell', target: 3, reward: R(90), name: { en: 'Sell three cards', fr: 'Vendez trois cartes' } });
easy({ id: 'buy-2', metric: 'buy', target: 2, reward: R(100), name: { en: 'Two from the shop', fr: 'Deux à la boutique' } });
medium({ id: 'buy-spend-1000', metric: 'buy', sum: 'price', target: 1000, reward: R(320), name: { en: 'Spend a thousand', fr: 'Dépensez mille' } });
medium({ id: 'sell-earn-500', metric: 'sell', sum: 'amount', target: 500, reward: R(300), name: { en: 'Sell for five hundred', fr: 'Vendez pour cinq cents' } });
medium({ id: 'buy-custom-1', metric: 'buy', where: { kind: 'custom' }, target: 1, reward: R(280), name: { en: 'Buy a booster you built', fr: 'Achetez un booster fait maison' } });
hard({ id: 'buy-spend-5000', metric: 'buy', sum: 'price', target: 5000, reward: R(1200), name: { en: 'Spend five thousand', fr: 'Dépensez cinq mille' } });
hard({ id: 'sell-earn-2500', metric: 'sell', sum: 'amount', target: 2500, reward: R(1000), name: { en: 'A dealer’s day', fr: 'Journée de marchand' } });

// --- Wikdle -------------------------------------------------------------------
easy({ id: 'wikdle-play', metric: 'wikdle', target: 1, reward: R(80), name: { en: 'Play today’s Wikdle', fr: 'Jouez le Wikdle du jour' } });
easy({ id: 'wikdle-win', metric: 'wikdle', where: { won: true }, target: 1, reward: R(150), name: { en: 'Solve the Wikdle', fr: 'Résolvez le Wikdle' } });
medium({ id: 'wikdle-4', metric: 'wikdle', where: { won: true, maxGuesses: 4 }, target: 1, reward: R(320), name: { en: 'Wikdle in four or fewer', fr: 'Wikdle en quatre ou moins' } });
medium({ id: 'wikdle-exact-4', metric: 'wikdle', where: { won: true, guesses: 4 }, target: 1, reward: R(300), name: { en: 'Wikdle in exactly four', fr: 'Wikdle en exactement quatre' } });
hard({ id: 'wikdle-3', metric: 'wikdle', where: { won: true, maxGuesses: 3 }, target: 1, reward: R(900), name: { en: 'Wikdle in three', fr: 'Wikdle en trois' } });
hard({ id: 'wikdle-2', metric: 'wikdle', where: { won: true, maxGuesses: 2 }, target: 1, reward: RB(1500, { kind: 'open', themeId: null, rarityId: 'epic', cards: 5 }), name: { en: 'Wikdle in two', fr: 'Wikdle en deux' } });

// --- the casino ---------------------------------------------------------------
easy({ id: 'slots-3', metric: 'slots', target: 3, reward: R(60), name: { en: 'Three spins', fr: 'Trois tours de rouleaux' } });
easy({ id: 'slots-10', metric: 'slots', target: 10, reward: R(120), name: { en: 'Ten spins', fr: 'Dix tours de rouleaux' } });
easy({ id: 'slots-win-1', metric: 'slots', where: { won: true }, target: 1, reward: R(80), name: { en: 'Win a spin', fr: 'Gagnez un tour' } });
easy({ id: 'points-200', metric: 'points', sum: 'amount', target: 200, reward: R(90), name: { en: '200 minigame points', fr: '200 points de mini-jeux' } });
medium({ id: 'points-500', metric: 'points', sum: 'amount', target: 500, reward: R(300), name: { en: '500 minigame points', fr: '500 points de mini-jeux' } });
medium({ id: 'slots-line-3', metric: 'slots', where: { threeOfAKind: true }, target: 1, reward: R(320), name: { en: 'Three of a kind', fr: 'Trois symboles alignés' } });
medium({ id: 'slots-25', metric: 'slots', target: 25, reward: R(300), name: { en: 'Twenty-five spins', fr: 'Vingt-cinq tours' } });
hard({ id: 'points-2000', metric: 'points', sum: 'amount', target: 2000, reward: R(1100), name: { en: '2,000 minigame points', fr: '2 000 points de mini-jeux' } });
hard({ id: 'slots-star', metric: 'slots', where: { symbol: 'star', count: 3 }, target: 1, reward: R(1000), name: { en: 'Three stars on a line', fr: 'Trois étoiles alignées' } });
hard({ id: 'slots-jackpot', metric: 'slots', where: { symbol: 'wiki', count: 3 }, target: 1, reward: RB(3000, { kind: 'open', themeId: null, rarityId: 'legendary', cards: 5 }), name: { en: 'The jackpot', fr: 'Le jackpot' } });

// --- the quiz, the album, the friends ----------------------------------------
easy({ id: 'quiz-1', metric: 'quiz', target: 1, reward: R(70), name: { en: 'Take a quiz', fr: 'Faites un quiz' } });
easy({ id: 'quiz-3right', metric: 'quiz', where: { minCorrect: 3 }, target: 1, reward: R(120), name: { en: 'Three right in a quiz', fr: 'Trois bonnes réponses à un quiz' } });
medium({ id: 'quiz-perfect', metric: 'quiz', where: { correct: 5 }, target: 1, reward: R(360), name: { en: 'A perfect quiz', fr: 'Un quiz parfait' } });
medium({ id: 'quiz-3', metric: 'quiz', target: 3, reward: R(300), name: { en: 'Three quizzes', fr: 'Trois quiz' } });
hard({ id: 'quiz-2perfect', metric: 'quiz', where: { correct: 5 }, target: 2, reward: R(1100), name: { en: 'Two perfect quizzes', fr: 'Deux quiz parfaits' } });
easy({ id: 'view-5', metric: 'view', target: 5, reward: R(50), name: { en: 'Read five cards', fr: 'Lisez cinq cartes' } });
easy({ id: 'view-15', metric: 'view', target: 15, reward: R(90), name: { en: 'Read fifteen cards', fr: 'Lisez quinze cartes' } });
easy({ id: 'daily-claim', metric: 'daily', target: 1, reward: R(50), name: { en: 'Claim the daily gift', fr: 'Récupérez le cadeau du jour' } });
easy({ id: 'playtime-10', metric: 'playtime', target: 10, reward: R(70), name: { en: 'Ten minutes of play', fr: 'Dix minutes de jeu' } });
easy({ id: 'fx-1', metric: 'fx', target: 1, reward: R(60), name: { en: 'Dress a rarity', fr: 'Habillez une rareté' } });
medium({ id: 'playtime-30', metric: 'playtime', target: 30, reward: R(260), name: { en: 'Half an hour of play', fr: 'Une demi-heure de jeu' } });
medium({ id: 'custom-1', metric: 'custom', target: 1, reward: R(300), name: { en: 'Build a booster', fr: 'Fabriquez un booster' } });
medium({ id: 'gift-1', metric: 'gift', target: 1, reward: R(280), name: { en: 'Send a gift', fr: 'Envoyez un cadeau' } });
medium({ id: 'trade-1', metric: 'trade', target: 1, reward: R(320), name: { en: 'Complete a trade', fr: 'Concluez un échange' } });
medium({ id: 'friend-1', metric: 'friend', target: 1, reward: R(300), name: { en: 'Make a friend', fr: 'Faites-vous un ami' } });
hard({ id: 'album-1', metric: 'album', target: 1, reward: RB(1500, { kind: 'open', themeId: null, rarityId: 'epic', cards: 5 }), name: { en: 'Complete an album', fr: 'Terminez un album' } });
hard({ id: 'playtime-90', metric: 'playtime', target: 90, reward: R(900), name: { en: 'Ninety minutes of play', fr: 'Quatre-vingt-dix minutes de jeu' } });
hard({ id: 'gift-3', metric: 'gift', target: 3, reward: R(1000), name: { en: 'Three gifts sent', fr: 'Trois cadeaux envoyés' } });

// --- every rarity, as its own quest --------------------------------------------
for (const rarity of RARITIES) {
  const rank = RARITIES.indexOf(rarity);
  if (rank <= 1) continue;
  const tier = rank <= 3 ? medium : hard;
  tier({ id: `print-${rarity.id}-2`, metric: 'pull', where: { rarityId: rarity.id }, target: 2,
    reward: R(rank <= 3 ? 340 : 400 * rank),
    name: { en: `Two ${rarity.name.en} prints`, fr: `Deux impressions ${rarity.name.fr}s` } });
}

export const QUESTS = [...EASY, ...MEDIUM, ...HARD];
export const QUEST_TIERS = {
  easy:   { weight: 60, name: { en: 'Easy',   fr: 'Facile' },    color: '#4ade80' },
  medium: { weight: 30, name: { en: 'Medium', fr: 'Moyen' },     color: '#fbbf24' },
  hard:   { weight: 10, name: { en: 'Hard',   fr: 'Difficile' }, color: '#f472b6' }
};
export const QUESTS_PER_DAY = 3;
export const questById = (id) => QUESTS.find((q) => q.id === id) ?? null;

/**
 * Whether one report counts toward a quest, and by how much. A `sum` quest
 * adds a number from the detail; the rest add one per matching report.
 */
export function creditFor(quest, metric, detail = {}) {
  if (quest.metric !== metric) return 0;
  const w = quest.where ?? {};
  const rank = (id) => RARITIES.findIndex((r) => r.id === id);
  for (const [key, want] of Object.entries(w)) {
    if (key === 'minRarity') { if (rank(detail.rarityId) < rank(want)) return 0; continue; }
    if (key === 'maxGuesses') { if (!(detail.guesses <= want)) return 0; continue; }
    if (key === 'minCorrect') { if (!(detail.correct >= want)) return 0; continue; }
    if (key === 'tiered') { if (Boolean(detail.rarityId) !== want) return 0; continue; }
    if (key === 'famous') { if (!((detail.popularity ?? 0) >= 0.75)) return 0; continue; }
    if (key === 'threeOfAKind') { if (!(detail.lines ?? []).some((l) => l.count === 3)) return 0; continue; }
    if (key === 'symbol') { if (!(detail.lines ?? []).some((l) => l.symbol === want && l.count >= (w.count ?? 3))) return 0; continue; }
    if (key === 'count') continue;
    if (key === 'straightWin') { if (!(detail.bets ?? []).some((b) => b.kind === 'straight' && b.won)) return 0; continue; }
    if (key === 'tierWin') { if (!(detail.bets ?? []).some((b) => b.kind === 'tier' && b.won && (want === true || b.pick === want))) return 0; continue; }
    if (detail[key] !== want) return 0;
  }
  if (quest.sum) {
    const n = Number(detail[quest.sum] ?? detail.amount ?? 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return 1;
}
