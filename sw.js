const CACHE = "timecard-v26";
const FILES = [
  "./index.html",
  "./manifest.json",
  "./icons/apple-touch-icon-light-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-48.png",
  "./icons/icon-32.png",
  "./icons/icon-16.png",
  "./icons/favicon.ico"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
