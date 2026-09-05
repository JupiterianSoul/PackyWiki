/*
 * THE OFFLINE SHELL
 * ============================================================================
 * A service worker, so the app opens with no line at all: the shell (this
 * build's index.html, scripts, styles and sounds) is stored on install, and
 * the card pictures already seen are kept as they go by. Wikipedia itself is
 * never cached: a draw needs the live encyclopedia, and offline it says so.
 *
 * The build writes this file out with the list of its own files in place of
 * the placeholders below (see the plugin in vite.config.js), so the shell is
 * exactly the set of files this build is made of, named by their hashes.
 *
 * How each request is answered:
 *   the page itself      the network first, three seconds, then the shell;
 *                        so an update is never held back by the cache, and
 *                        no line still opens the app
 *   version.json         the network, then the copy from last time
 *   hashed assets        the shell; a hash that changed is a new file
 *   Wikipedia pictures   what is stored, refreshed in the background; at most
 *                        a few hundred, the oldest let go first
 *   everything else      the network, untouched
 */

const STAMP = "2ff080b-1788596665925";
const PRECACHE = [
  "./index.html",
  "./version.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./assets/index-BzZXyKiW.css",
  "./assets/vendor-BnGCNdwk.js",
  "./assets/index-D0FCq4gD.js",
  "./assets/reveal-CK2SNCBl.js",
  "./assets/market-WCWa1kWa.js",
  "./assets/quiz-C6yMXtfR.js",
  "./assets/cinematic-zgg0s1DZ.js",
  "./assets/mechanical-Grho09r8.js",
  "./assets/rubber-DE_dkLb8.js",
  "./assets/scifi-BFT5cJTJ.js",
  "./assets/wikdle-words-DOu4OuSc.js",
  "./assets/wikdle-BNZnHY99.js",
  "./assets/slots-Dyf8rprn.js",
  "./assets/duel-BP_iKz5i.js",
  "./assets/cardindex-CUp-9ExX.js",
  "./assets/updates-CAB7Z9TH.js"
];
const SHELL = `wikster-shell-${STAMP}`;
const PICTURES = 'wikster-pictures';
const PICTURE_LIMIT = 400;
const PICTURE_HOSTS = ['upload.wikimedia.org'];
const NAV_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('wikster-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** The network, or a timeout: whichever comes first. */
const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timeout')), ms);
  promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
});

/** The shell's index.html, whatever hashed path the request used. */
const shellPage = () => caches.open(SHELL).then((cache) => cache.match('./index.html', { ignoreSearch: true }));

async function navigation(request) {
  try {
    const fresh = await withTimeout(fetch(request), NAV_TIMEOUT_MS);
    if (fresh && fresh.ok) {
      const cache = await caches.open(SHELL);
      cache.put('./index.html', fresh.clone());
    }
    return fresh;
  } catch {
    return (await shellPage()) ?? Response.error();
  }
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    return (await cache.match(request)) ?? Response.error();
  }
}

async function shellFirst(request) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const fresh = await fetch(request);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

/** Stored pictures come back at once; the line refreshes them behind. */
async function picture(request) {
  const cache = await caches.open(PICTURES);
  const hit = await cache.match(request);
  const refresh = fetch(request).then(async (fresh) => {
    if (fresh && (fresh.ok || fresh.type === 'opaque')) {
      await cache.put(request, fresh.clone());
      trimPictures(cache);
    }
    return fresh;
  }).catch(() => null);
  return hit ?? (await refresh) ?? Response.error();
}

let trimming = false;
async function trimPictures(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    // Cache keys come back oldest first: the ones over the limit go.
    for (const key of keys.slice(0, Math.max(0, keys.length - PICTURE_LIMIT))) await cache.delete(key);
  } finally {
    trimming = false;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.mode === 'navigate') { event.respondWith(navigation(request)); return; }
  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/version.json')) { event.respondWith(networkFirst(request)); return; }
    if (url.pathname.includes('/assets/') && !url.pathname.endsWith('.mp3')) { event.respondWith(shellFirst(request)); return; }
    if (url.pathname.endsWith('/manifest.webmanifest') || url.pathname.includes('/icons/')) { event.respondWith(shellFirst(request)); return; }
    return;
  }
  if (PICTURE_HOSTS.includes(url.hostname) && request.destination === 'image') { event.respondWith(picture(request)); }
});
