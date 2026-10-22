const CACHE = "timecard-v29";
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
  // Page loads try the network first so a new version shows on the next launch; offline falls back to the cache
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request, { cache: "no-cache" }).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(cache => cache.put("./index.html", copy)); }
        return res;
      }).catch(() => caches.match(e.request).then(cached => cached || caches.match("./index.html")))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
