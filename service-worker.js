// Caches the app shell + embedded core data on install, so the app works fully offline
// after the first visit. Book/lexicon/search data files fetched on demand are cached
// opportunistically as they're loaded (runtime cache), growing offline coverage over time.

const CACHE_VERSION = "bible-study-v16";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/loader.js",
  "./js/online.js",
  "./js/youversion.js",
  "./js/notes.js",
  "./js/journal.js",
  "./data/book_meta.js",
  "./data/book_art.js",
  "./data/places.js",
  "./data/processed/english/ASV.js",
  "./data/processed/english/KJV.js",
  "./data/processed/english/YLT.js",
  // Core interlinear books cached eagerly so the Greek/Hebrew toggle works offline
  // immediately for the most-read passages; the rest of the Bible is cached
  // opportunistically (see the fetch handler below) as each book is visited.
  "./data/processed/books/Gen.js",
  "./data/processed/books/Mat.js",
  "./data/processed/books/Mrk.js",
  "./data/processed/books/Luk.js",
  "./data/processed/books/Jhn.js",
  "./data/processed/books/Psa.js",
  "./data/processed/lexicon.js",
  "./data/processed/morphology.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Cross-origin requests (bible-api.com chapter text, Wikimedia art thumbnails) are cached
  // opportunistically too, so "Download entire Bible for offline use" and previously-viewed
  // online-version chapters keep working with no connection.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok || response.type === "opaque") {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
