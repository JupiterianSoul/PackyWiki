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
import { supabase, configured } from './account.js';

/** Whether this build can write quizzes at all. */
export const quizAvailable = () => configured;

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

  // Sent through the Supabase client rather than a bare fetch: it carries the
  // player's own session, so the function can keep its JWT check switched on
  // and refuse anyone who is not signed into the app.
  const { data, error } = await supabase.functions.invoke('quiz', {
    body: {
      title,
      // Trimmed on purpose: the opening of an article carries more than
      // enough for five questions, and every character costs somebody's
      // daily allowance.
      text: String(text ?? '').slice(0, 3500),
      rank: rarityRank(rarityId),
      count: questionCountFor(rarityId),
      lang: getLanguage()
    }
  });

  // The function answers 503 until somebody gives it a key to spend.
  if (error) {
    // The body carries what actually went wrong, and it is the only place it
    // is written down on the player's side: a quiz that will not start is
    // otherwise indistinguishable from a quiz that is merely slow.
    const body = await error?.context?.json?.().catch(() => null);
    const status = error?.context?.status;
    const why = body?.detail ?? body?.error ?? error?.message ?? 'unknown';
    console.error(`quiz failed (${status ?? 'no status'}): ${why}`);
    if (status === 503 || body?.error === 'QUIZ_UNSET') throw new Error('QUIZ_UNAVAILABLE');
    const short = status === 404
      ? 'not deployed as "quiz"'
      // The detail is the half worth reading: "Groq refused the key" tells
      // you what to do, "502 UPSTREAM" does not.
      : (body?.detail ?? `${status ?? '?'} ${body?.error ?? ''}`.trim());
    throw Object.assign(new Error('QUIZ_SHAPE'), { detail: short });
  }
  if (data?.error === 'QUIZ_UNSET') throw new Error('QUIZ_UNAVAILABLE');

  const questions = (Array.isArray(data?.questions) ? data.questions : [])
    .filter((q) => q && typeof q.question === 'string'
      && Array.isArray(q.choices) && q.choices.length === 4
      && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4);
  if (questions.length < 3) throw new Error('QUIZ_SHAPE');
  return questions;
}

/* --- rewards --------------------------------------------------------------- */

/**
 * Cut hard on purpose. The quiz's real prizes are the card and the boosters;
 * money on top was quietly out-earning the shop stipend, and free money that
 * beats the economy's income is how the economy stops meaning anything.
 */
export const QUIZ_MONEY = { small: 40, medium: 120, large: 350 };

/* --- the daily allowance --------------------------------------------------
 * Five quizzes a day, each. The cap is what keeps the quiz an appointment
 * rather than a farm: without it, twenty good runs a day out-earn every
 * other faucet in the game combined, and the shared question budget belongs
 * to whoever taps fastest. Counted per account, so a reinstall or a second
 * device does not start the day over.
 */
export const QUIZ_PER_DAY = 5;
const PLAYS_KEY = 'wikster.quizPlays.v1';

const today = () => Math.floor(Date.now() / 86400000);

function readPlays(userKey) {
  try {
    const all = JSON.parse(localStorage.getItem(PLAYS_KEY) ?? '{}');
    const mine = all?.[userKey];
    return mine && mine.day === today() ? mine.count : 0;
  } catch {
    return 0;
  }
}

export function quizPlaysLeft(userKey = 'local') {
  return Math.max(0, QUIZ_PER_DAY - readPlays(userKey));
}

/** One quiz spent, at the moment its questions actually exist. */
export function recordQuizPlay(userKey = 'local') {
  try {
    const all = JSON.parse(localStorage.getItem(PLAYS_KEY) ?? '{}');
    const mine = all?.[userKey];
    const count = (mine && mine.day === today() ? mine.count : 0) + 1;
    all[userKey] = { day: today(), count };
    localStorage.setItem(PLAYS_KEY, JSON.stringify(all));
  } catch { /* storage unavailable */ }
}

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
