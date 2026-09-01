/**
 * THE QUIZ
 * ----------------------------------------------------------------------------
 * Pick a subject, meet one card you probably do not own, answer three to five
 * questions about its article, and walk away with money, the card itself, or
 * a booster, depending on how many you got right. The questions are written
 * on the spot by a language model from the article's own text, and they get
 * harder the rarer the card is.
 *
 * The key that pays for that is NOT in this app. A key shipped inside an APK
 * is a key anyone can pull back out of it, so the request goes to a small
 * Supabase Edge Function (supabase/functions/quiz) which holds the key as a
 * server-side secret. Players need no key, no setting and no account for it:
 * the app already carries the publishable Supabase key, and that is all the
 * function asks for.
 */
import { getLanguage } from './i18n.js';
import { rarityRank } from './data/rarities.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/** Whether this build can write quizzes at all. */
export const quizAvailable = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

/** Three questions at the common end of the table, five at the top. */
export function questionCountFor(rarityId) {
  const rank = rarityRank(rarityId);
  if (rank >= 4) return 5;   // legendary and above
  if (rank >= 2) return 4;   // rare, epic
  return 3;
}

/**
 * Ask the quiz writer for a set of questions.
 *
 * Resolves to [{ question, choices[4], answer }]. Throws 'QUIZ_UNAVAILABLE'
 * when this build has no backend to ask, and 'QUIZ_SHAPE' when nothing
 * usable came back.
 */
export async function buildQuiz({ title, text, rarityId }) {
  if (!quizAvailable()) throw new Error('QUIZ_UNAVAILABLE');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/quiz`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      },
      body: JSON.stringify({
        title,
        text: String(text ?? '').slice(0, 6000),
        rank: rarityRank(rarityId),
        count: questionCountFor(rarityId),
        lang: getLanguage()
      })
    });
  } catch {
    throw new Error('QUIZ_SHAPE');
  } finally {
    clearTimeout(timer);
  }

  // 503 means the function is deployed but nobody has given it a key yet.
  if (res.status === 503) throw new Error('QUIZ_UNAVAILABLE');
  if (!res.ok) throw new Error('QUIZ_SHAPE');

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('QUIZ_SHAPE');
  }
  const questions = (Array.isArray(data?.questions) ? data.questions : [])
    .filter((q) => q && typeof q.question === 'string'
      && Array.isArray(q.choices) && q.choices.length === 4
      && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4);
  if (questions.length < 3) throw new Error('QUIZ_SHAPE');
  return questions;
}

/* --- rewards --------------------------------------------------------------- */

export const QUIZ_MONEY = { small: 150, medium: 600, large: 1500 };

/**
 * What a finished quiz pays, by how many answers were right:
 *   0  nothing
 *   1  a little money
 *   2  the quiz card itself
 *   3  the card, plus a 3-card booster of the subject
 *   4  the card, plus a solid pile of money
 *   5  the card, big money, and a 5-card Rare booster of the subject
 */
export function quizRewards(correct, themeId) {
  const rewards = { money: 0, card: false, booster: null };
  if (correct === 1) rewards.money = QUIZ_MONEY.small;
  if (correct >= 2) rewards.card = true;
  if (correct === 3) rewards.booster = { kind: 'theme', themeId, rarityId: null, cards: 3 };
  if (correct === 4) rewards.money = QUIZ_MONEY.medium;
  if (correct === 5) {
    rewards.money = QUIZ_MONEY.large;
    rewards.booster = { kind: 'theme', themeId, rarityId: 'rare', cards: 5 };
  }
  return rewards;
}
