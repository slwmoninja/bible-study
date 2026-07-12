// Rolling log of errors the user actually hit, so they can copy/paste diagnostics
// into a bug report instead of having to describe what went wrong from memory.
// Surfaced via the "Error code" section at the bottom of Settings (see js/app.js).
// Loaded first (before any other script) so its global handlers below catch
// failures during the rest of the app's own startup too.
const ErrorLog = (() => {
  const KEY = "bibleAppErrorLog";
  const MAX_ENTRIES = 25;

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function save(entries) {
    try {
      localStorage.setItem(KEY, JSON.stringify(entries));
    } catch (e) {
      // localStorage full/unavailable -- nothing more we can do, don't crash over it.
    }
  }

  function record(message, context) {
    if (!message) return;
    const entries = load();
    entries.push({ time: new Date().toISOString(), context: context || "", message: String(message) });
    while (entries.length > MAX_ENTRIES) entries.shift();
    save(entries);
  }

  function clear() {
    save([]);
  }

  // Includes the app version (service worker CACHE_VERSION, when known) and user
  // agent so a pasted report is self-contained -- no follow-up question needed
  // for "what device/browser/version was this on".
  function formatForCopy() {
    const entries = load();
    const lines = [`User agent: ${navigator.userAgent}`, `App version: ${window.APP_CACHE_VERSION || "unknown"}`, ""];
    if (!entries.length) {
      lines.push("No errors recorded this session.");
    } else {
      for (const e of entries) {
        lines.push(`[${e.time}]${e.context ? " (" + e.context + ")" : ""} ${e.message}`);
      }
    }
    return lines.join("\n");
  }

  return { record, clear, load, formatForCopy };
})();

// Cache name doubles as the deployed app version (see CACHE_VERSION in
// service-worker.js) -- read it via the Cache Storage API rather than adding
// a postMessage round-trip to the service worker just for a diagnostic string.
if ("caches" in window) {
  caches.keys().then((keys) => {
    const appCache = keys.find((k) => k.startsWith("bible-study-"));
    if (appCache) window.APP_CACHE_VERSION = appCache;
  }).catch(() => {});
}

window.addEventListener("error", (e) => {
  ErrorLog.record(e.error ? (e.error.stack || e.error.message) : e.message, "uncaught");
});
window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason;
  ErrorLog.record(reason && reason.stack ? reason.stack : String(reason), "unhandled rejection");
});
