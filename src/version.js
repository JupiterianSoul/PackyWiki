/**
 * WHICH BUILD THIS IS, AND WHETHER A NEWER ONE EXISTS
 * ----------------------------------------------------------------------------
 * The site updates itself the moment it is published; an installed APK does
 * not, and neither does a copy of the site left on another host. All of them
 * sign into the same account, so two builds of different ages end up writing
 * the same save. The stamp below is how a save knows which build wrote it
 * (see src/save.js, src/account.js), and how a build finds out it is old.
 */

/* Filled in by Vite at build time; the dev server has no stamp. */
const STAMP = typeof __WIKLODO_BUILD__ !== 'undefined' ? __WIKLODO_BUILD__ : null;

export const BUILD = STAMP ?? { sha: 'dev', at: 0 };

/** Where the published site says what its build is. GitHub Pages answers with CORS open. */
const LATEST_URL = 'https://jupiteriansoul.github.io/PackyWiki/version.json';

export const APK_URL = 'https://github.com/JupiterianSoul/PackyWiki/releases/download/apk-latest/wiklodo.apk';

/** The APK exposes an icon bridge that no browser has. */
export const isApk = () => typeof window !== 'undefined' && Boolean(window.WiklodoIcon);

/** Whether a stamp names a build newer than another. Same commit is never newer. */
export const isNewerBuild = (candidate, than = BUILD) =>
  Boolean(candidate?.sha) && candidate.sha !== than?.sha && Number(candidate.at ?? 0) > Number(than?.at ?? 0);

/**
 * The published site's stamp, when it is newer than this build; null when
 * this build is current, when there is no stamp to compare (a dev server),
 * or when the site cannot be reached. Never throws.
 */
export async function checkForUpdate() {
  if (!BUILD.at) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${LATEST_URL}?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const latest = await res.json();
    return isNewerBuild(latest) ? latest : null;
  } catch {
    return null;
  }
}
