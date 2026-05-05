const CACHE = "timecard-v13";
const FILES = [
  "./index.html",
  "./manifest.json",
  "./icons/tan-apple-touch-icon.png",
  "./icons/tan-android-chrome-192x192.png",
  "./icons/tan-android-chrome-512x512.png",
  "./icons/tan-favicon-96x96.png",
  "./icons/tan-favicon-48x48.png",
  "./icons/tan-favicon-32x32.png",
  "./icons/tan-favicon-16x16.png",
  "./icons/tan-favicon.ico",
  "./icons/tan-ms-icon-144x144.png"
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
