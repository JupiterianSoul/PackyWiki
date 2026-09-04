/**
 * What the build and the Android wrapper put on the global scope, declared
 * for the type checker (npm run typecheck). Nothing here runs.
 */
/** The build stamp Vite defines: which commit, built when. */
declare const __WIKSTER_BUILD__: { sha: string; at: number } | undefined;

interface Window {
  /** The Android wrapper's bridge for switching the launcher icon with the theme. */
  WiksterIcon?: { setIcon(id: string): void };
  __wikster?: Record<string, unknown>;
}
