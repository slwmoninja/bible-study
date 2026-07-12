// Network-awareness: lets the user restrict data downloads to Wi-Fi (via the
// Network Information API where the browser supports it -- mainly Chrome/Android;
// iOS Safari doesn't expose connection type, so we degrade to "allow" there and
// say so in Settings, rather than silently blocking downloads with no explanation).
const NetworkGuard = (() => {
  function getConnection() {
    return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  }

  function canDetectType() {
    const c = getConnection();
    return !!(c && (c.type !== undefined || c.effectiveType !== undefined));
  }

  function isOnWifi() {
    const c = getConnection();
    if (!c) return null; // unknown
    if (c.type !== undefined) return c.type === "wifi" || c.type === "ethernet";
    // Fallback heuristic when only effectiveType is available: treat 4g as "probably fine",
    // but we can't truly distinguish Wi-Fi from cellular this way, so treat as unknown.
    return null;
  }

  // Returns { allowed: bool, reason: string|null }
  function checkAllowed(settings) {
    if (!settings.wifiOnly) return { allowed: true, reason: null };
    const c = getConnection();
    if (!c) {
      return { allowed: true, reason: "unknown" }; // can't detect on this browser -- don't block
    }
    const wifi = isOnWifi();
    if (wifi === null) return { allowed: true, reason: "unknown" };
    if (wifi === false) return { allowed: false, reason: "cellular" };
    return { allowed: true, reason: null };
  }

  // Same as checkAllowed(), except the "minimalOffWifi" setting lets it through
  // regardless of connection type. Reserved for the handful of loads that make up
  // the book/chapter currently on screen (its English text and, if toggled on, its
  // original-language text) -- not for bulk/background loads like search indexing,
  // commentary, or the "download entire Bible" button, which stay behind checkAllowed().
  function checkAllowedMinimal(settings) {
    if (settings.minimalOffWifi) return { allowed: true, reason: null };
    return checkAllowed(settings);
  }

  return { getConnection, canDetectType, isOnWifi, checkAllowed, checkAllowedMinimal };
})();

// Same stuck-forever problem as script loads (see js/loader.js) can happen to a plain
// fetch() on a stalled mobile connection -- it has no built-in timeout either. Used by
// js/online.js and js/youversion.js instead of calling fetch() directly.
function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .catch((e) => {
      if (e.name === "AbortError") throw new Error("Timed out fetching " + url + " -- check your connection and try again.");
      throw e;
    })
    .finally(() => clearTimeout(timer));
}
