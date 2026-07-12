// Loads local data files as <script> tags (works under file:// as well as http/https,
// unlike fetch()/XHR which Chrome blocks for local files). Each URL is loaded at most once.
class WifiRequiredError extends Error {
  constructor() {
    super("Wi-Fi required: this download was blocked because \"Wi-Fi only\" is enabled in Settings.");
    this.name = "WifiRequiredError";
  }
}

const Loader = (() => {
  const loaded = new Set();
  const inflight = new Map();

  // 20s timeout: on a slow/stalled mobile connection, a <script> load has no
  // built-in timeout -- it just never fires onload/onerror, which used to leave
  // renderChapter()'s Promise.all() (and the "Loading..." message) stuck forever.
  const SCRIPT_TIMEOUT_MS = 20000;

  function loadScript(src, { minimal = false } = {}) {
    if (loaded.has(src)) return Promise.resolve();
    if (typeof getAppSettings === "function") {
      const settings = getAppSettings();
      const { allowed } = minimal ? NetworkGuard.checkAllowedMinimal(settings) : NetworkGuard.checkAllowed(settings);
      if (!allowed) return Promise.reject(new WifiRequiredError());
    }
    if (inflight.has(src)) return inflight.get(src);
    const p = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        inflight.delete(src);
        el.remove();
        reject(new Error("Timed out loading " + src + " -- check your connection and try again."));
      }, SCRIPT_TIMEOUT_MS);
      el.onload = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        loaded.add(src);
        inflight.delete(src);
        resolve();
      };
      el.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        inflight.delete(src);
        el.remove();
        reject(new Error("Failed to load " + src));
      };
      document.head.appendChild(el);
    });
    inflight.set(src, p);
    return p;
  }

  return {
    english(version, opts) {
      if (window.BIBLE_TEXT && window.BIBLE_TEXT[version]) return Promise.resolve();
      return loadScript(`data/processed/english/${version}.js`, opts);
    },
    interlinear(bookAbbr, opts) {
      if (window.INTERLINEAR && window.INTERLINEAR[bookAbbr]) return Promise.resolve();
      return loadScript(`data/processed/books/${bookAbbr}.js`, opts);
    },
    lexicon(opts) {
      if (window.LEXICON) return Promise.resolve();
      return loadScript("data/processed/lexicon.js", opts);
    },
    morphology(opts) {
      if (window.MORPH_CODES) return Promise.resolve();
      return loadScript("data/processed/morphology.js", opts);
    },
    searchIndex() {
      if (window.SEARCH_INDEX) return Promise.resolve();
      return loadScript("data/processed/search_index.js");
    },
    commentary(commentaryId, bookAbbr) {
      if (window.COMMENTARY && window.COMMENTARY[commentaryId] && window.COMMENTARY[commentaryId][bookAbbr]) {
        return Promise.resolve();
      }
      return loadScript(`data/processed/commentary/${commentaryId}/${bookAbbr}.js`);
    },
  };
})();
