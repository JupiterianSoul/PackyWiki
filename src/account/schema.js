/* schema: split out of account.js */

import { live } from './live.js';

/* --- what this database actually has ---------------------------------------
 *
 * The social release (chat, trades, gifts, presence, avatars) added columns
 * to `profiles` and three new tables. A project running the older schema is
 * a normal state - the owner has not re-run schema.sql yet - and it must NOT
 * take the friends list down with it.
 *
 * So the shape of the database is DETECTED rather than assumed: the first
 * query asks for the new columns, and if the server says they are not there,
 * it is remembered and every later query asks only for what exists. Friends,
 * search and requests keep working; the newer features report themselves as
 * unavailable instead of failing at random.
 */

/** null = not probed yet, true = present, false = this project is pre-social. */

live.socialColumns = null;

export let socialTables = null;
/** What the app may offer right now. */

export function socialSchemaReady() {
  return (live.socialColumns !== false);
}

export function socialTablesReady() {
  return (socialTables !== false);
}
/**
 * Forget what we learned about the database's shape.
 *
 * The owner very often runs schema.sql with the app still installed and
 * open, so coming back to the foreground re-probes rather than staying in
 * degraded mode until the next restart.
 */

export function forgetSchemaProbe() {
  live.socialColumns = null;
  socialTables = null;
}
/** The marker a v2-only write throws when the tables are not installed. */

export const SCHEMA_OUTDATED = 'WIKSTER_SCHEMA_OUTDATED';
/**
 * Is this failure "that column/table isn't there", rather than a real error?
 * Postgres answers 42703 for an unknown column and 42P01 for an unknown
 * table; PostgREST answers PGRST204/PGRST205 out of its schema cache.
 */

export function isSchemaGap(error) {
  const code = String(error?.code ?? '');
  if (['42703', '42P01', 'PGRST204', 'PGRST205'].includes(code)) return true;
  const raw = String(error?.message ?? '').toLowerCase();
  return raw.includes('does not exist')
    || raw.includes('schema cache')
    || raw.includes('could not find');
}
/** The v2 columns on `profiles`, asked for only where they exist. */

export const SOCIAL_COLS = 'avatar, presence, last_seen_at, visibility';
/**
 * Run a profiles read that WANTS the social columns. `build` is handed the
 * column list to use; on a pre-social project it is called again with the
 * base list alone.
 */

export async function readProfiles(baseCols, build) {
  if (live.socialColumns !== false) {
    const { data, error } = await build(`${baseCols}, ${SOCIAL_COLS}`);
    if (!error) {
      live.socialColumns = true;
      return data ?? [];
    }
    if (!isSchemaGap(error)) throw error;
    live.socialColumns = false;
  }
  const { data, error } = await build(baseCols);
  if (error) throw error;
  return data ?? [];
}
/**
 * Run a read against one of the v2 tables. A missing table is not an error
 * here - it is an answer: this project has nothing to report yet.
 */

export async function readSocialTable(run, empty) {
  if (socialTables === false) return empty;
  try {
    const value = await run();
    socialTables = true;
    return value;
  } catch (error) {
    if (!isSchemaGap(error)) throw error;
    socialTables = false;
    return empty;
  }
}
/** Run a v2 WRITE. Unlike a read, this has to be reported: the player asked
 *  for something the database cannot do yet. */

export async function writeSocial(run) {
  try {
    const value = await run();
    socialTables = true;
    return value;
  } catch (error) {
    if (isSchemaGap(error)) {
      socialTables = false;
      throw new Error(SCHEMA_OUTDATED);
    }
    throw error;
  }
}
