/**
 * Module-level state that more than one screen writes.
 *
 * An imported binding is read-only, so a variable one module declares and
 * another assigns cannot be a plain `let`; these live on one object every
 * module shares. This module imports nothing, on purpose: it is therefore
 * evaluated before anything that reads it, wherever the import cycle
 * happens to start.
 */
export const live = {};
