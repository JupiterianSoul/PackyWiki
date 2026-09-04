/* session: split out of account.js */

import { USERNAME_RE, supabase } from './client.js';
import { ensureProfile } from './profile.js';

/* --- session ------------------------------------------------------------------ */

/**
 * A session, checked against the server before it is believed.
 *
 * The client keeps the last session in local storage and answers with it
 * without asking anyone, and its token stays valid for an hour after it was
 * minted. An account deleted on the server therefore still walked into the
 * app on the next launch, signed in as someone who no longer exists, until
 * the token happened to expire. The stored session is now shown to the
 * server once at launch: an account the server no longer knows is signed out
 * on the spot. A server that cannot be reached is not the same thing, and
 * the session is kept so a launch on a bad connection still opens the app.
 */

export async function verifySession(session) {
  if (!session?.access_token || !supabase) return session ?? null;
  try {
    // A server that does not answer is not a server that said no: past a
    // few seconds the stored session is believed and the app opens.
    const answer = await Promise.race([
      supabase.auth.getUser(session.access_token),
      new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 4000))
    ]);
    if (answer.timeout) return session;
    const { error } = answer;
    if (!error) return session;
    const gone = error.status === 401 || error.status === 403
      || /not (found|exist)|does not exist|invalid/i.test(String(error.message ?? ''));
    if (!gone) return session;
  } catch {
    return session;
  }
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  return null;
}

export async function currentSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

export function onAuthChange(fn) {
  return (supabase?.auth.onAuthStateChange((_event, session) => fn(session)));
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(), password
  });
  if (error) throw error;
  return data.session;
}
/**
 * Create an account. Email and password only.
 *
 * The username is claimed afterwards, as its own step, because the two are
 * different kinds of question: one is credentials, the other is identity in
 * the game. It also removes a failure mode - a name taken between typing it
 * and submitting no longer wastes the whole form.
 *
 * An account therefore exists for a moment with no profile. That is the same
 * state an email-confirmation round trip leaves behind, and the gate already
 * handles it: no profile means "ask for a username".
 */

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) throw error;
  return { session: data.session, needsConfirmation: !data.session };
}
/**
 * Take a username for an account that has none.
 *
 * Returns the profile, or null when the name has just been taken. The unique
 * index is the check that counts; the availability call before it exists only
 * to say "taken" rather than "duplicate key value violates..." in the common
 * case where nobody is racing for it.
 */

export async function claimUsername(userId, username) {
  const name = String(username ?? '').trim();
  if (!USERNAME_RE.test(name)) throw new Error('username invalid');

  const { data: free, error: checkError } = await supabase.rpc('username_available', { name });
  if (checkError) throw checkError;
  if (!free) return null;

  return ensureProfile(userId, name);
}

export async function signOut() {
  await supabase?.auth.signOut();
}

export async function sendReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) throw error;
}
