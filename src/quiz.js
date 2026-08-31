/**
 * THE QUIZ
 * ----------------------------------------------------------------------------
 * Pick a subject, meet one card you probably do not own, answer three to five
 * questions about its article, and walk away with money, the card itself, or
 * a booster, depending on how many you got right. The questions are written
 * on the spot by a language model (Groq, llama-3.1-8b-instant) from the
 * article's own text, and they get harder the rarer the card is.
 *
 * The API key is the PLAYER'S OWN and never ships with the app: it is pasted
 * into Settings and stored on the device only. VITE_GROQ_API_KEY can seed a
 * personal build, but nothing is ever committed.
 */
import { getLanguage } from './i18n.js';
import { rarityRank } from './data/rarities.js';

const KEY_STORAGE = 'packywiki.groqKey.v1';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant';

export function groqKey() {
  try {
    const stored = localStorage.getItem(KEY_STORAGE);
    if (stored) return stored;
  } catch { /* storage unavailable */ }
  return import.meta.env.VITE_GROQ_API_KEY || '';
}

export function saveGroqKey(key) {
  try {
    const clean = (key ?? '').trim();
    if (clean) localStorage.setItem(KEY_STORAGE, clean);
    else localStorage.removeItem(KEY_STORAGE);
  } catch { /* storage unavailable */ }
}

/** Three questions at the common end of the table, five at the top. */
export function questionCountFor(rarityId) {
  const rank = rarityRank(rarityId);
  if (rank >= 4) return 5;   // legendary and above
  if (rank >= 2) return 4;   // rare, epic
  return 3;
}

/** The tier calibrates how mean the questions are allowed to be. */
function difficultyFor(rarityId) {
  const rank = rarityRank(rarityId);
  if (rank >= 6) return 'Ask expert-level questions about fine details of the text. No giveaway wording.';
  if (rank >= 4) return 'Ask hard questions about specifics in the text. No giveaway wording.';
  if (rank >= 3) return 'Ask moderately hard questions that need a careful read of the text.';
  if (rank >= 2) return 'Mix easy and moderate questions; at most one needs a careful read.';
  return 'Ask straightforward questions a casual reader could answer after skimming the text.';
}

/**
 * Ask Groq to write the quiz. Resolves to [{ question, choices[4], answer }],
 * throws 'QUIZ_KEY' when the key is refused and 'QUIZ_SHAPE' when the model
 * does not produce a usable quiz.
 */
export async function buildQuiz({ title, text, rarityId, apiKey }) {
  const count = questionCountFor(rarityId);
  const lang = getLanguage() === 'fr' ? 'French' : 'English';
  const prompt = [
    `Write a ${count}-question multiple-choice quiz about "${title}", in ${lang}.`,
    difficultyFor(rarityId),
    'Use ONLY facts stated in the article text below.',
    'Each question has exactly 4 choices and exactly one correct choice. Vary which position holds the correct one.',
    'Respond with JSON only, shaped exactly as:',
    '{"questions":[{"question":"...","choices":["...","...","...","..."],"answer":0}]}',
    'where "answer" is the zero-based index of the correct choice.',
    '',
    'ARTICLE TEXT:',
    String(text ?? '').slice(0, 6000)
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  let res;
  try {
    res = await fetch(GROQ_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.6,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You write quiz questions. You respond with valid JSON only.' },
          { role: 'user', content: prompt }
        ]
      })
    });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) throw new Error('QUIZ_KEY');
  if (!res.ok) throw new Error(`Groq responded ${res.status}`);

  const data = await res.json();
  let parsed;
  try {
    parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? '{}');
  } catch {
    throw new Error('QUIZ_SHAPE');
  }
  const questions = (Array.isArray(parsed?.questions) ? parsed.questions : [])
    .filter((q) => q && typeof q.question === 'string'
      && Array.isArray(q.choices) && q.choices.length === 4
      && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4)
    .slice(0, count)
    .map((q) => ({
      question: q.question.trim(),
      choices: q.choices.map((c) => String(c).trim()),
      answer: q.answer
    }));
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
