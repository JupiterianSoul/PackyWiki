/**
 * THE DAILY QUESTS, from the player's side.
 * ============================================================================
 * Three quests a day, dealt by the quests function from the UTC date and
 * the player's id (src/data/quests.js is the book). The rest of the app
 * reports what the player does through track(); this credits the day's
 * quests, keeps them on the device, and tells the server in batches. A
 * reward is claimed through the server, which pays out only when its own
 * copy of the progress meets the target.
 *
 * Signed out, the same deal is made on the device from the date alone, and
 * progress and claims stay on the device: a player without an account still
 * has quests, but nothing about them reaches a leaderboard.
 */
import { supabase } from './account.js';
import { askHouse } from './house.js';
import { QUESTS, QUEST_TIERS, QUESTS_PER_DAY, questById, creditFor } from './data/quests.js';

const STATE_KEY = 'wikster.quests.v1';
const SYNC_DEBOUNCE_MS = 5000;

export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const endOfDay = (day) => new Date(`${day}T00:00:00Z`).getTime() + 86400000;

/* --- the deal (the same arithmetic as the server) ----------------------- */

function seeded(text) {
  let h = 2166136261;
  for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  let a = h;
  return () => {
    a = Math.imul(a ^ (a >>> 15), a | 1);
    a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  };
}

export function dealFor(userKey, day) {
  const rng = seeded(`quests:${day}:${userKey}`);
  const tiers = Object.entries(QUEST_TIERS).map(([id, t]) => [id, t.weight]);
  const total = tiers.reduce((s, [, w]) => s + w, 0);
  const picked = [];
  for (let n = 0; n < QUESTS_PER_DAY && picked.length < QUESTS.length; n++) {
    let ticket = rng() * total;
    let tier = tiers[0][0];
    for (const [id, w] of tiers) { ticket -= w; if (ticket <= 0) { tier = id; break; } }
    const pool = QUESTS.filter((q) => q.tier === tier && !picked.includes(q));
    const from = pool.length ? pool : QUESTS.filter((q) => !picked.includes(q));
    picked.push(from[Math.floor(rng() * from.length)]);
  }
  return picked;
}

/* --- the device's copy --------------------------------------------------- */

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null');
    return raw && typeof raw === 'object' && Array.isArray(raw.quests) ? raw : null;
  } catch {
    return null;
  }
}
function write(board) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(board)); } catch { /* storage unavailable */ }
}

/** Today's board on the device, dealt now if it is another day's or missing. */
export function loadBoard(userKey = 'local') {
  const day = utcDay();
  const held = read();
  if (held && held.day === day && held.userKey === userKey) return held;
  const board = {
    day, userKey, expiresAt: endOfDay(day), syncedAt: null, dirty: false,
    quests: dealFor(userKey, day).map((q) => ({ id: q.id, progress: 0, target: q.target, claimed: false }))
  };
  write(board);
  return board;
}

/** The quest rows with their book entries attached, for display. */
export const describe = (board) => board.quests
  .map((row) => ({ ...row, quest: questById(row.id) }))
  .filter((row) => row.quest);

/* --- progress ------------------------------------------------------------- */

let pending = null;
let syncTimer = null;
let onChange = () => {};
export const onQuestsChange = (fn) => { onChange = fn; };

/**
 * Report what just happened. Every quest of the day that counts it moves
 * forward; nothing moves past its target or after it is claimed. Returns the
 * ids of quests that just became complete, so the app can say so.
 */
export function track(metric, detail = {}, userKey = 'local') {
  const board = loadBoard(userKey);
  const done = [];
  let changed = false;
  for (const row of board.quests) {
    const quest = questById(row.id);
    if (!quest || row.claimed || row.progress >= row.target) continue;
    const credit = creditFor(quest, metric, detail);
    if (credit <= 0) continue;
    row.progress = Math.min(row.target, row.progress + credit);
    changed = true;
    if (row.progress >= row.target) done.push(row.id);
  }
  if (changed) {
    board.dirty = true;
    write(board);
    scheduleSync(userKey);
    onChange(board);
  }
  return done;
}

function scheduleSync(userKey) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncBoard(userKey).catch(() => {}); }, SYNC_DEBOUNCE_MS);
}

/* --- the server ----------------------------------------------------------- */

async function ask(body) {
  const data = await askHouse('quests', body);
  if (!data || !Array.isArray(data.quests)) throw new Error('TAMPER');
  return data;
}

/** The server's rows folded into the device's board: its deal wins, its progress is the max of the two. */
function adopt(board, answer, userKey) {
  const fresh = {
    day: answer.day, userKey, expiresAt: Date.parse(answer.expiresAt) || endOfDay(answer.day),
    syncedAt: Date.now(), dirty: false,
    quests: answer.quests.map((row) => {
      const mine = board.day === answer.day ? board.quests.find((q) => q.id === row.quest_id) : null;
      return {
        id: row.quest_id, target: row.target,
        progress: Math.max(Number(row.progress) || 0, mine?.progress ?? 0),
        claimed: Boolean(row.claimed) || Boolean(mine?.claimed)
      };
    })
  };
  // Progress the device knows and the server does not is sent along next time.
  fresh.dirty = fresh.quests.some((q, i) => q.progress > (Number(answer.quests[i].progress) || 0));
  write(fresh);
  return fresh;
}

/** Today's board from the server, for a signed-in player; the device's otherwise. */
export async function syncBoard(userKey = 'local') {
  const board = loadBoard(userKey);
  if (userKey === 'local' || !supabase) return board;
  const updates = {};
  if (board.dirty) for (const q of board.quests) updates[q.id] = q.progress;
  const answer = await ask(board.dirty ? { action: 'progress', updates } : { action: 'today' });
  const fresh = adopt(board, answer, userKey);
  onChange(fresh);
  return fresh;
}

/**
 * Claim a finished quest. Signed in, the server decides; signed out, the
 * device does. Resolves to the reward, or rejects with NOT_DONE, CLAIMED,
 * or one of the house errors.
 */
export async function claim(questId, userKey = 'local') {
  const board = loadBoard(userKey);
  const row = board.quests.find((q) => q.id === questId);
  const quest = questById(questId);
  if (!row || !quest) throw new Error('NOT_DONE');
  if (row.claimed) throw new Error('CLAIMED');
  if (row.progress < row.target) throw new Error('NOT_DONE');
  if (userKey !== 'local' && supabase) {
    // The server has to know the progress before it can honour the claim.
    const updates = {};
    for (const q of board.quests) updates[q.id] = q.progress;
    await ask({ action: 'progress', updates });
    const answer = await ask({ action: 'claim', questId });
    adopt(board, answer, userKey);
  } else {
    row.claimed = true;
    write(board);
  }
  onChange(loadBoard(userKey));
  return quest.reward;
}

/** How many quests are done and unclaimed, for the drawer's chip. */
export const claimableCount = (userKey = 'local') =>
  loadBoard(userKey).quests.filter((q) => !q.claimed && q.progress >= q.target).length;

export const msToReset = (board) => Math.max(0, board.expiresAt - Date.now());
