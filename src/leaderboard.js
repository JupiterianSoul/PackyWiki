/**
 * THE LEADERBOARD, from the player's side.
 * ============================================================================
 * Three windows, daily, weekly and all-time, each a table on the server kept
 * by a trigger over every score (supabase/schema.sql, V6). A page is twenty
 * rows; the player's own standing comes separately so it can be pinned to
 * the bottom of the screen when it is not on the page being looked at.
 */
import { supabase } from './account.js';

export const WINDOWS = ['daily', 'weekly', 'alltime'];
export const PAGE_SIZE = 20;
const TIMEOUT_MS = 10000;

const withTimeout = (promise) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS))
]);

/** One page of a window: { rows: [{ rank, userId, username, score }], page, more }. */
export async function fetchPage(window = 'daily', page = 0) {
  if (!supabase) throw new Error('CLOSED');
  if (!WINDOWS.includes(window)) throw new Error('BAD_WINDOW');
  const { data, error } = await withTimeout(supabase.rpc('leaderboard_page', { p_window: window, p_page: page }));
  if (error) throw new Error(/does not exist|schema cache/i.test(error.message ?? '') ? 'SCHEMA' : error.message);
  const rows = (data ?? []).map((r) => ({
    rank: Number(r.rank), userId: r.user_id, username: r.username ?? '?', score: Number(r.score) || 0
  }));
  return { rows, page, more: rows.length === PAGE_SIZE };
}

/** The caller's own standing in a window, or null when they have no score in it. */
export async function fetchMyRank(window = 'daily') {
  if (!supabase) throw new Error('CLOSED');
  const { data, error } = await withTimeout(supabase.rpc('my_rank', { p_window: window }));
  if (error) throw new Error(/does not exist|schema cache/i.test(error.message ?? '') ? 'SCHEMA' : error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.rank == null) return null;
  return { rank: Number(row.rank), score: Number(row.score) || 0, total: Number(row.total) || 0 };
}

/** Wikdle's points for the day, sent once; the server keeps a second copy out. */
export async function submitWikdle(points, day) {
  if (!supabase) throw new Error('CLOSED');
  const { error } = await withTimeout(supabase.rpc('submit_score', { p_game: 'wikdle', p_points: points, p_day: day }));
  if (error) throw new Error(error.message);
}

/** Milliseconds until a window resets: midnight UTC, or Sunday midnight UTC; never for all-time. */
export function msToReset(window, now = Date.now()) {
  if (window === 'alltime') return null;
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  if (window === 'weekly') {
    // Sunday 00:00 UTC: the day of week of `next` is tomorrow's.
    const daysToSunday = (7 - next.getUTCDay()) % 7;
    next.setUTCDate(next.getUTCDate() + daysToSunday);
  }
  return next.getTime() - now;
}
