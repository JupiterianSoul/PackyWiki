/**
 * ONE CALL TO THE HOUSE
 * ============================================================================
 * The slot machine, the roulette and the quests are each an edge function,
 * and they all fail the same ways. This is the one place a call is made and
 * a failure is named, so every game says the same thing for the same fault:
 *
 *   SIGN_IN   the house does not know the player (401)
 *   CLOSED    no backend, or the function is not deployed (404)
 *   TIMEOUT   the house did not answer in time
 *   <code>    whatever the function itself refused with, e.g. NOT_DONE
 *
 * A refusal's body is read even when the transport marks the call failed:
 * supabase-js hands a non-2xx answer back as an error whose context is the
 * response, and the function's own reason is in that response.
 */
import { supabase } from './account.js';

export const HOUSE_TIMEOUT_MS = 12000;

/** The reason a failed call failed, as one of the codes above. */
export async function houseFailure(error, data = null) {
  const status = error?.context?.status ?? error?.status;
  if (status === 401) return new Error('SIGN_IN');
  if (status === 404) return new Error('CLOSED');
  let code = data?.error;
  if (!code && error?.context && typeof error.context.clone === 'function') {
    try { code = (await error.context.clone().json())?.error; } catch { /* not a JSON refusal */ }
  }
  return new Error(typeof code === 'string' && code ? code : 'CLOSED');
}

/**
 * Call a function and resolve to its JSON answer, or reject with one of the
 * codes above. Never resolves to an answer that carries an `error`.
 */
export async function askHouse(name, body, timeoutMs = HOUSE_TIMEOUT_MS) {
  if (!supabase) throw new Error('CLOSED');
  let timer;
  const clock = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs); });
  try {
    const { data, error } = await Promise.race([supabase.functions.invoke(name, { body }), clock]);
    if (error) throw await houseFailure(error, data);
    if (data?.error) throw new Error(String(data.error));
    return data;
  } finally {
    clearTimeout(timer);
  }
}
