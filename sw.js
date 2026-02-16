const CACHE_NAME = 'englishlearn-v14';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css?v=11',
  './js/app.js?v=11',
  './js/db.js?v=11',
  './js/tts.js?v=11',
  './js/import.js?v=11',
  './js/flashcard.js?v=11',
  './js/dialogue.js?v=11',
  './js/settings.js?v=11',
  './manifest.json',
  'https://unpkg.com/dexie@3/dist/dexie.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for local assets, network-only for API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-only for Google TTS API
  if (url.hostname === 'texttospeech.googleapis.com') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-first for local assets (so updates are always picked up)
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful GET responses for offline use
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache when offline
        return caches.match(event.request);
      })
  );
});
