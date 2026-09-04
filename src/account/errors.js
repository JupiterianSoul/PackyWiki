/* errors: split out of account.js */

import { SCHEMA_OUTDATED } from './schema.js';

/* --- errors ------------------------------------------------------------------ */

/**
 * Turn whatever the server said into something a player can act on. Supabase
 * messages are accurate but written for developers.
 *
 * Returns a string key, or NULL when the message is not one this knows - the
 * caller then shows what the server actually said. That matters more than it
 * sounds: a guess dressed up as an explanation sends you looking in the wrong
 * place, and "this does not look like an email address" is a very confident
 * thing to say about an address that is fine.
 *
 * Each test is therefore as narrow as the message allows, and the order is
 * deliberate - "Email rate limit exceeded" is about the rate limit, not the
 * address, so the broader tests come last.
 */

export function readableError(error) {
  const raw = String(error?.message ?? error ?? '').toLowerCase();
  if (!raw) return 'authUnknown';

  // The project IS set up - it is just running the older schema, which is a
  // different problem with a different fix (re-run schema.sql), and saying
  // "not set up yet" about a working database sends the owner nowhere.
  if (raw.includes(SCHEMA_OUTDATED.toLowerCase())) return 'authSchemaOld';

  if (raw.includes('invalid login')) return 'authBadLogin';
  if (raw.includes('already registered') || raw.includes('already been registered')) return 'authEmailTaken';
  if (raw.includes('duplicate key') && raw.includes('username')) return 'authNameTaken';
  if (raw.includes('rate limit') || raw.includes('too many')) return 'authTooMany';

  // The provider itself is switched off in the project's dashboard.
  if (raw.includes('signups not allowed') || raw.includes('signups are disabled')
      || raw.includes('logins are disabled') || raw.includes('provider is disabled')
      || raw.includes('not enabled')) return 'authSignupsOff';

  if (raw.includes('password')) return 'authWeakPassword';
  if (raw.includes('unable to validate email') || raw.includes('email address is invalid')
      || (raw.includes('email') && raw.includes('invalid'))) return 'authBadEmail';

  if (raw.includes('failed to fetch') || raw.includes('network')) return 'authOffline';
  // The project exists but schema.sql was never run: PostgREST answers with a
  // missing relation or a function it cannot find in its schema cache. Worth
  // its own message, because "try again" will never fix it.
  if (raw.includes('does not exist') || raw.includes('schema cache')
      || raw.includes('could not find')) return 'authNoSchema';

  return null;
}
