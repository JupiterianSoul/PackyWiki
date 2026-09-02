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

/** The published site. The APK opens this too, and only falls back to its bundled copy offline. */
export const SITE_URL = 'https://jupiteriansoul.github.io/PackyWiki/';

/** Where the published site says what its build is. GitHub Pages answers with CORS open. */
const LATEST_URL = `${SITE_URL}version.json`;

export const APK_URL = 'https://github.com/JupiterianSoul/PackyWiki/releases/download/apk-latest/wiklodo.apk';

/** The APK exposes an icon bridge that no browser has. */
export const isApk = () => typeof window !== 'undefined' && Boolean(window.WiklodoIcon);

/** Whether this page is the copy bundled inside the APK rather than the published site. */
export const isBundledCopy = () => typeof location !== 'undefined' && location.host === 'appassets.androidplatform.net';

/**
 * Get the newest build: the published site, whichever copy of the app this
 * is. The site reloads itself; the APK's bundled copy hands over to the site.
 */
export function goToLatest() {
  if (isBundledCopy()) location.replace(SITE_URL);
  else location.reload();
}

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
