// Caches the app shell + embedded core data on install, so the app works fully offline
// after the first visit. Book/lexicon/search data files fetched on demand are cached
// opportunistically as they're loaded (runtime cache), growing offline coverage over time.
//
// Three different caching strategies live in the fetch handler below, split by content type:
//  - manifest.json and the icon-192/512.png files get network-first (fall back to cache
//    only if offline). Android/Chrome's installed-PWA (WebAPK) icon updates -- both the
//    periodic silent background check on an existing install, and a fresh "Add to Home
//    Screen" after an uninstall -- read this manifest client-side first to decide whether
//    anything changed; Chrome does NOT re-fetch/uninstall Chrome's own site data (service
//    worker + Cache Storage survive an Android "uninstall" of the WebAPK, since that data
//    belongs to the browser profile, not the WebAPK package), so a stale cached manifest/
//    icon here would make a freshly-reinstalled icon look stale too. Chrome also only
//    re-checks an icon at all when its URL in the manifest changes (it compares the
//    icons array, not pixel bytes) -- see sync_cache_version.py, which appends a
//    content-hash query string to the icon src values in manifest.json whenever the
//    icon files themselves change, so a new icon always gets a new URL to trigger this.
//  - The rest of the app shell (index.html, css/js, and the small top-level data/*.js
//    metadata files) changes on every deploy, so it's served stale-while-revalidate:
//    the cached copy answers instantly, and a background fetch refreshes the cache for
//    next time. This is also what makes index.html's own checkForUpdate() (a separate
//    check that does a HEAD request with cache:'no-store' + a cache-busting query
//    string, comparing etag/last-modified, and force-reloading on a mismatch) actually
//    show fresh code on the very reload it triggers -- a plain cache-first strategy
//    would keep serving the stale cached index.html until CACHE_VERSION next changed.
//    checkForUpdate's own HEAD request is a non-GET... method, so it's excluded below
//    (method!=='GET') and always goes straight to the network untouched either way.
//  - Everything under data/processed/ (the full Greek/Hebrew interlinear, lexicon,
//    morphology, and English text -- effectively static once translated) plus every
//    cross-origin request (bible-api.com chapter text, Wikimedia art thumbnails) is
//    cached forever once fetched, the original cache-first behavior: re-validating
//    unchanging multi-megabyte text on every load would burn mobile data for no
//    benefit, working directly against the app's own "Wi-Fi only" setting.
const CACHE_VERSION = "bible-study-01733f4cdd53";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/errorlog.js",
  "./js/loader.js",
  "./js/online.js",
  "./js/youversion.js",
  "./js/notes.js",
  "./js/journal.js",
  "./js/network.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/title-icon.png",
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
  const req = event.request;
  if (req.method !== "GET") return; // checkForUpdate()'s HEAD ping, any future POSTs -- straight through, untouched

  const url = new URL(req.url);
  const scopeUrl = new URL(self.registration.scope);
  // Only the app's own root/index.html counts as "the shell" -- a navigation to some
  // other same-origin URL (e.g. a book-art image opened in a new tab via target="_blank")
  // must NOT be coerced to it, or the tab renders the SPA shell (with all its relative
  // asset paths broken, since they're now resolved against that other URL) instead of
  // the thing actually being navigated to.
  const isShellPath = url.origin === scopeUrl.origin &&
    (url.pathname === scopeUrl.pathname || url.pathname === scopeUrl.pathname + "index.html");
  const isNavigation = req.mode === "navigate" && isShellPath;
  const isManifestOrIcon = url.origin === scopeUrl.origin &&
    (url.pathname === scopeUrl.pathname + "manifest.json" || /\/icons\/icon-(192|512)\.png$/.test(url.pathname));
  const isStaticData = url.pathname.includes("/data/processed/") || url.origin !== location.origin;

  if (isManifestOrIcon) {
    // Network-first -- see the top-of-file comment. Falls back to cache only
    // when actually offline, so the install-time precache still means something.
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const cache = await caches.open(CACHE_VERSION);
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        const cached = await caches.match(req);
        return cached || Response.error();
      }
    })());
    return;
  }

  if (!isStaticData) {
    // Stale-while-revalidate for the app shell -- see the big comment up top.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      // A navigation (opening the app fresh, or the reload checkForUpdate triggers)
      // should resolve to the cached shell regardless of the exact URL requested
      // (bare site root vs. an explicit .../index.html).
      const cacheKey = isNavigation ? "./index.html" : req;
      const cached = await cache.match(cacheKey);
      const networkFetch = fetch(req).then((res) => {
        if (res && res.ok) cache.put(cacheKey, res.clone());
        return res;
      }).catch(() => null);
      if (cached) { event.waitUntil(networkFetch); return cached; }
      return (await networkFetch) || Response.error();
    })());
    return;
  }

  // Cross-origin requests (bible-api.com chapter text, Wikimedia art thumbnails) and
  // the full processed Bible/lexicon/morphology data are cached opportunistically too,
  // so "Download entire Bible for offline use" and previously-viewed online-version
  // chapters keep working with no connection -- cached once, kept forever (until
  // CACHE_VERSION changes), never re-validated on every load.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((response) => {
        if (response.ok || response.type === "opaque") {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
        }
        return response;
      });
    })
  );
});
