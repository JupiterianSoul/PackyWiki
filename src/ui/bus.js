// @ts-check
/**
 * THE BUS
 * ============================================================================
 * A place to say that something changed, for code that cannot import the
 * screen that cares. The wallet moves, a card lands in the collection, a
 * quest completes: the module that did it emits, and whoever painted a
 * counter or a shelf repaints. Listeners are plain functions; a listener that
 * throws does not stop the others, and the error is reported, not swallowed.
 *
 *   on('wallet', refreshWallet);          // subscribe; returns the unsubscribe
 *   emit('wallet', { amount, delta });     // tell everyone
 *
 * Names are short nouns for what changed: 'wallet', 'collection', 'quests',
 * 'inventory', 'profile'. A screen that paints from state on every visit does
 * not need the bus; one that stays on screen while the state moves does.
 */

const listeners = new Map();

/** Subscribes `fn` to `name`; returns a function that unsubscribes it. */
export function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
  return () => listeners.get(name)?.delete(fn);
}

/** Subscribes for one event only. */
export function once(name, fn) {
  const off = on(name, (detail) => { off(); fn(detail); });
  return off;
}

/** Calls every listener of `name` with `detail`. */
export function emit(name, detail) {
  for (const fn of [...(listeners.get(name) ?? [])]) {
    try { fn(detail); } catch (error) { console.error(`bus: a listener for "${name}" threw`, error); }
  }
}
