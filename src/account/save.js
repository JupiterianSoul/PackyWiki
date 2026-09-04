/* save: split out of account.js */

import { BUILD, isNewerBuild } from '../version.js';
import { applySave, envelope, exportSave, importSave, mergeSaves, parseSave } from '../save.js';
import { supabase } from './client.js';
import { isSchemaGap } from './schema.js';
import { publishStats } from './profile.js';

/* --- the save ---------------------------------------------------------------------- */

/*
 * Once a hard reset starts, nothing may write a save again for the life of
 * this page. Erasing used to race its own syncing: a flush already in flight
 * finished after the wipe and put the old save straight back on the server, so
 * the next launch pulled everything down again and the reset looked like it
 * had done nothing at all.
 */

export let frozen = false;
/*
 * The build that last wrote the account's save, learned at sign-in. This
 * build must not write over a save a NEWER build wrote: the site updates the
 * moment it is published while an installed APK waits to be reinstalled, and
 * an old build that pushed would put back everything the new one repaired
 * and drop whatever it does not know how to keep. The old build plays on
 * what it pulled; it just stops syncing until it is updated.
 */

export let remoteBuild = null;

export function remoteBuildStamp() {
  return (remoteBuild);
}

export function saveFromNewerBuild() {
  return (isNewerBuild(remoteBuild));
}
/** Whether the save pulled at sign-in was written by an older build (or one with no stamp). */

export function saveFromOlderBuild() {
  return (Boolean(remoteBuild === null || (remoteBuild && !isNewerBuild(remoteBuild) && remoteBuild.sha !== BUILD.sha)));
}

/*
 * Which account this device's save last agreed with. A save that belongs to
 * another account, or to no account yet, is not merged with the one signing
 * in: it is replaced, as it always was. Only a device that has already played
 * this account gets its keys weighed against the server's.
 */
const OWNER_KEY = 'wikster.syncedUser';
const owner = () => { try { return localStorage.getItem(OWNER_KEY); } catch { return null; } };
const setOwner = (id) => { try { if (id) localStorage.setItem(OWNER_KEY, id); else localStorage.removeItem(OWNER_KEY); } catch { /* session only */ } };
/** The server's updated_at of the save this device last read or wrote. A
 *  different one at push time means another device wrote in between. */
let seenAt = null;

/**
 * Push the local save, merged with whatever another device wrote meanwhile.
 *
 * The save used to be one blob and the last device to write won, so two
 * phones on one account quietly erased each other's afternoons. Now every key
 * carries the time it last changed, and a push first looks at the row: if it
 * moved since this device last saw it, the two saves are merged key by key,
 * the newer copy of each winning. Keys the other device changed later are
 * written locally too, and the caller is told, so the screen can catch up.
 * The server keeps the previous row in saves_history on every write, which
 * is the net under all of this.
 */
export async function pushSave(userId, { force = false } = {}) {
  if (frozen) return 'frozen';
  if (saveFromNewerBuild()) return 'outdated';
  const local = parseSave(exportSave());
  let blob = local ? envelope(local.data, local.stamps) : JSON.parse(exportSave());
  let tookRemote = false;
  if (!force && local) {
    const remote = await fetchSave(userId);
    if (remote?.updated_at && remote.updated_at !== seenAt) {
      const theirs = parseSave(JSON.stringify(remote.data));
      if (theirs) {
        const merged = mergeSaves(local, theirs);
        if (merged.fromRemote.length) tookRemote = applySave(merged.data, merged.stamps, merged.fromRemote);
        blob = envelope(merged.data, merged.stamps);
      }
    }
  }
  const { data, error } = await supabase.from('saves')
    .upsert({ user_id: userId, data: blob }, { onConflict: 'user_id' })
    .select('updated_at').maybeSingle();
  if (error) throw error;
  seenAt = data?.updated_at ?? null;
  remoteBuild = BUILD;
  setOwner(userId);
  return tookRemote ? 'merged' : 'pushed';
}
/**
 * Empty the stored save, and the stats with it.
 *
 * "Erase everything" has to reach the server or it erases nothing: the local
 * save would be wiped and then pulled straight back down on the next sign-in.
 * An empty blob fails parseSave() on the way back, which is exactly right -
 * syncOnLogin treats it as an account with nothing stored and uploads whatever
 * the player starts over with.
 */

export async function clearSave(userId) {
  const { error } = await supabase.from('saves')
    .upsert({ user_id: userId, data: { format: 'wikster-save', version: 2, at: Date.now(), data: {}, stamps: {} } },
      { onConflict: 'user_id' });
  if (error) throw error;
  seenAt = null;
  await publishStats(userId, {
    level: 1, rank: null, cards: 0, uniqueCards: 0,
    boostersOpened: 0, value: 0, bestRarity: null, playMs: 0
  });
}
/**
 * Give the account back to the server as if it had just been made.
 *
 * Emptying the save was never enough on its own. The profile row kept the
 * level and the rank, the wishlist and the friends list survived, and any sync
 * still in flight could put the old save back. So this freezes writing first,
 * then takes down everything that belongs to this player.
 *
 * Each table is taken down on its own and a refusal on one does not stop the
 * others: a project running an older schema.sql simply does not have some of
 * these, and a reset that stops halfway is worse than one that skips a table
 * the database never had. The save itself is the exception - if that cannot be
 * emptied the reset has not happened, so its failure is reported.
 */

export async function hardReset(userId) {
  frozen = true;
  setOwner(null);
  // Remove the row outright where the policy allows it, which is what makes
  // the account read as having nothing stored rather than as holding an empty
  // save. A project running a schema.sql from before that policy existed falls
  // back to blanking it, which the sync treats the same way on the way back.
  const { error } = await supabase.from('saves').delete().eq('user_id', userId);
  if (error) await clearSave(userId);
  else {
    await publishStats(userId, {
      level: 1, rank: null, cards: 0, uniqueCards: 0,
      boostersOpened: 0, value: 0, bestRarity: null, playMs: 0
    }).catch(() => { /* the save is already gone */ });
  }

  const quiet = (promise) => Promise.resolve(promise).then(() => true, () => false);
  await Promise.all([
    quiet(supabase.from('wishlists').delete().eq('user_id', userId)),
    quiet(supabase.from('friendships').delete().or(`requester.eq.${userId},addressee.eq.${userId}`)),
    quiet(supabase.from('messages').delete().or(`sender.eq.${userId},recipient.eq.${userId}`)),
    quiet(supabase.from('deliveries').delete().or(`sender.eq.${userId},recipient.eq.${userId}`)),
    quiet(supabase.from('trades').delete().or(`proposer.eq.${userId},recipient.eq.${userId}`)),
    quiet(supabase.from('auctions').delete().eq('seller', userId)),
    // The profile row stays, because the username is claimed against it and a
    // missing row would read as a deleted account everywhere else. What it
    // carries about progress goes back to nothing.
    quiet(supabase.from('profiles').update({
      level: 1, cards: 0, unique_cards: 0, boosters_opened: 0,
      collection_value: 0, best_rarity: null, play_ms: 0
    }).eq('id', userId))
  ]);
}
/**
 * Delete the account itself, not just what is in it.
 *
 * Emptying a save leaves the address registered, so signing in brings back an
 * empty account rather than nothing: the only way to be rid of it is to remove
 * the `auth.users` row, which needs the service key. That key cannot ship in
 * an APK, so the work happens in the delete-account edge function and this
 * only asks. The function takes the id from the token, so this can never
 * delete anybody else.
 *
 * Nothing is written afterwards: `frozen` stops any sync in flight from
 * recreating rows against an id that no longer exists.
 */

export async function deleteAccount() {
  frozen = true;
  const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
  if (error) {
    // supabase-js reports any non-2xx as the same sentence, which says nothing
    // about what actually went wrong. The function answers with a reason in
    // its body, so read that and report it instead.
    let detail = '';
    try {
      const body = await error.context?.json?.();
      detail = body?.error ? `${body.error}${body.status ? ` (${body.status})` : ''}` : '';
    } catch { /* not JSON, or nothing to read */ }
    if (!detail) {
      try { detail = (await error.context?.text?.())?.slice(0, 200) ?? ''; } catch { /* nothing */ }
    }
    throw new Error(detail || error.message || 'DELETE_FAILED');
  }
  if (data?.error) throw new Error(data.error);
  return true;
}

export async function fetchSave(userId) {
  const { data, error } = await supabase
    .from('saves').select('data, updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/* --- backups ------------------------------------------------------------------ */

/**
 * The server keeps the save's previous versions (see saves_history in
 * schema.sql): thinned out with age, a few from the last hour, one an hour
 * for the day, one a day beyond that, and always the one from before an
 * erase. These are what a wrong merge, a mistaken erase or a broken device
 * can be walked back from. A project without the table says so.
 */
export async function listBackups(userId) {
  const { data, error } = await supabase.from('saves_history')
    .select('id, at, reason, cards, coins')
    .eq('user_id', userId).order('at', { ascending: false }).limit(40);
  if (error) {
    if (isSchemaGap(error)) throw new Error('BACKUPS_UNSET');
    throw error;
  }
  return data ?? [];
}

/**
 * Put a backup back as the save. The save being replaced is filed as a backup
 * of its own first, so a restore can itself be undone. The restored keys are
 * stamped now and pushed without merging: this is the player overruling every
 * device, on purpose.
 */
export async function restoreBackup(userId, id) {
  const { data: row, error } = await supabase.from('saves_history')
    .select('data').eq('user_id', userId).eq('id', id).maybeSingle();
  if (error) throw error;
  const text = JSON.stringify(row?.data ?? null);
  if (!parseSave(text)) throw new Error('BACKUP_UNREADABLE');
  await supabase.from('saves_history')
    .insert({ user_id: userId, reason: 'before-restore', data: JSON.parse(exportSave()) });
  if (!importSave(text, { stampNow: true })) throw new Error('BACKUP_UNREADABLE');
  setOwner(userId);
  await pushSave(userId, { force: true });
  return true;
}
/**
 * Bring the local save in line with the account's.
 *
 * A device that has never played this account, or whose save belongs to
 * another one, takes the account's save whole: the account is authoritative,
 * and that is what carries a collection onto a fresh phone. The one exception
 * is an account with nothing stored yet, where the local save is uploaded
 * instead of thrown away, which is how a pre-account collection comes in.
 *
 * A device that HAS played this account is merged instead, key by key, the
 * copy that changed later winning: what was done here while another device
 * was the one syncing is kept, and so is what the other device did.
 */

export async function syncOnLogin(userId) {
  const remote = await fetchSave(userId);
  remoteBuild = remote?.data?.build ?? null;
  seenAt = remote?.updated_at ?? null;
  const theirs = remote?.data ? parseSave(JSON.stringify(remote.data)) : null;
  if (!theirs) {
    await pushSave(userId, { force: true });
    return 'pushed';
  }
  const local = parseSave(exportSave());
  if (!local || owner() !== userId) {
    const ok = importSave(JSON.stringify(remote.data));
    if (ok) setOwner(userId);
    return ok ? 'pulled' : 'kept';
  }
  const merged = mergeSaves(local, theirs);
  if (merged.fromRemote.length) applySave(merged.data, merged.stamps, merged.fromRemote);
  if (merged.fromLocal.length) await pushSave(userId);
  return merged.fromRemote.length ? 'merged' : (merged.fromLocal.length ? 'pushed' : 'same');
}
