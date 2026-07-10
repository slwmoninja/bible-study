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

  return { getConnection, canDetectType, isOnWifi, checkAllowed };
})();
