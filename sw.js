// Steady service worker: makes the app load offline.
//
// Strategy: network-first with a short timeout, falling back to the cache.
// Online you always get the newest files (no manual cache bumping, and ES
// modules can never be a mix of old and new). Offline, or on a slow
// connection, you get the last good copy instantly.
//
// CI replaces __BUILD__ with the commit SHA so each deploy gets its own cache
// and old caches are deleted on activate.

const BUILD = '__BUILD__';
const CACHE = `steady-${BUILD}`;
const NETWORK_TIMEOUT_MS = 3500;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './src/main.js',
  './src/store.js',
  './src/storage.js',
  './src/core/dates.js',
  './src/core/sleep.js',
  './src/core/schema.js',
  './src/core/habits.js',
  './src/core/pace.js',
  './src/core/scale.js',
  './src/core/csv.js',
  './src/core/demo.js',
  './src/ui/dom.js',
  './src/ui/icons.js',
  './src/ui/chart.js',
  './src/views/today.js',
  './src/views/progress.js',
  './src/views/guide.js',
  './src/views/settings.js',
  './src/views/onboarding.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function networkFirst(request) {
  return new Promise((resolve) => {
    let settled = false;
    const fromCache = () => caches.match(request).then((hit) => hit || (request.mode === 'navigate' ? caches.match('./index.html') : undefined));
    const timer = setTimeout(() => {
      fromCache().then((hit) => { if (hit && !settled) { settled = true; resolve(hit); } });
    }, NETWORK_TIMEOUT_MS);

    fetch(request, { cache: 'no-cache' })
      .then((res) => {
        clearTimeout(timer);
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        if (!settled) { settled = true; resolve(res); }
      })
      .catch(() => {
        clearTimeout(timer);
        fromCache().then((hit) => {
          if (settled) return;
          settled = true;
          resolve(hit || Response.error());
        });
      });
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});
