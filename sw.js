const CACHE = "timecard-v3";
const FILES = [
  "./index.html",
  "./manifest.json",
  "./icons/tan-apple-touch-icon.png",
  "./icons/tan-android-chrome-192x192.png",
  "./icons/tan-android-chrome-512x512.png",
  "./icons/tan-favicon-32x32.png",
  "./icons/tan-favicon-16x16.png",
  "./icons/tan-favicon.ico",
  "./icons/dark-apple-touch-icon.png",
  "./icons/dark-android-chrome-192x192.png",
  "./icons/dark-android-chrome-512x512.png",
  "./icons/dark-favicon-32x32.png",
  "./icons/dark-favicon-16x16.png",
  "./icons/dark-favicon.ico",
  "https://fonts.googleapis.com/css2?family=VT323&family=Share+Tech+Mono&display=swap"
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