/* =========================================================
   ASCEND — service worker (offline support)
   Caches every file of the app, so it opens with no network.

   When you change ANY file: bump CACHE_VERSION below, and add
   new files to APP_FILES. The app then shows "Update ready".
   ========================================================= */

const CACHE_VERSION = 'v2';
const CACHE_NAME = `ascend-${CACHE_VERSION}`;

// Every file the app needs (relative to this file, so it works in any folder)
const APP_FILES = [
  './',
  'index.html', 'index.js',
  'track.html', 'track.js',
  'money.html', 'money.js',
  'goals.html', 'goals.js',
  'insights.html', 'insights.js',
  'wins.html', 'wins.js',
  'settings.html', 'settings.js',
  'onboarding.html', 'onboarding.js',
  'sky-preview.html', 'sky-preview.js',
  'styles.css', 'shared.js',
  'manifest.webmanifest',
  'data/quotes.json', 'data/habits.json', 'data/categories.json',
  'data/roadmap.json', 'data/badges.json',
  'fonts/sora-latin.woff2', 'fonts/sora-latin-ext.woff2',
  'fonts/nunito-latin.woff2', 'fonts/nunito-latin-ext.woff2',
  'fonts/fraunces-italic-latin.woff2',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];

// Install: download everything into the new cache. If one file fails, the
// install fails and the old version keeps working (never a half-cached app).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES.map((f) => new Request(f, { cache: 'reload' })))),
  );
  // No skipWaiting() here: the page asks first ("Update ready"), so an update
  // never swaps files under you mid-edit.
});

// Activate: delete caches from older versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('ascend-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// The page's "Refresh" button on the update toast
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Fetch: cache first (fast and offline), network as a fallback.
// Query strings are ignored, so index.html?welcome still opens offline.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      return await fetch(request);
    } catch (err) {
      // Offline and not cached: for a page, show Today rather than an error
      if (request.mode === 'navigate') {
        const fallback = await cache.match('index.html');
        if (fallback) return fallback;
      }
      throw err;
    }
  })());
});
