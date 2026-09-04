/**
 * The web app's icons, drawn from the same logo the app paints, so the home
 * screen and the app agree. Run after changing the logo:
 *
 *   node tools/icons.mjs
 *
 * Writes public/icons/icon-192.png, icon-512.png (the plain icon) and
 * maskable-512.png (the logo on a full square of the app's ground, which
 * Android crops into whatever shape the launcher uses).
 */
import { chromium } from 'playwright';
import { launchOptions } from '../tests/lib/browser.mjs';
import { logoSvg } from '../src/data/icons.js';

const GROUND = '#0b1020';
const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
const draw = async (size, inset, file) => {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:${GROUND};display:grid;place-items:center;width:${size}px;height:${size}px">
    <div style="width:${Math.round(size * (1 - inset * 2))}px;height:${Math.round(size * (1 - inset * 2))}px;display:grid;place-items:center">${logoSvg({ size: Math.round(size * (1 - inset * 2)) })}</div></body>`);
  await page.screenshot({ path: `public/icons/${file}`, omitBackground: false });
  console.log(`public/icons/${file}`);
};
await draw(512, 0.06, 'icon-512.png');
await draw(192, 0.06, 'icon-192.png');
await draw(512, 0.2, 'maskable-512.png');
await browser.close();
