/**
 * The one place a suite learns which browser to launch.
 *
 * CI installs Playwright's own Chromium and needs nothing said. A container
 * that carries a browser somewhere else names it with CHROME_PATH, or, when
 * it is one of Playwright's builds under PLAYWRIGHT_BROWSERS_PATH, is found
 * here whatever build number it has: a pinned package and a pre-installed
 * browser rarely agree on one.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function findLocalChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return null;
  const builds = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const build of builds) {
    for (const rel of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe']) {
      const path = join(root, build, rel);
      if (existsSync(path)) return path;
    }
  }
  return null;
}

export const launchOptions = () => {
  const path = process.env.CHROME_PATH || (process.env.CI ? null : findLocalChromium());
  return path ? { executablePath: path } : {};
};
