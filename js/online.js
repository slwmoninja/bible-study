// Optional online translations, fetched live from bible-api.com (free, no key, public-domain texts only).
// Only used when the user enables "online versions" in Settings.
const OnlineBible = (() => {
  const ONLINE_VERSIONS = {
    web: "World English Bible",
    webbe: "World English Bible (British)",
    bbe: "Bible in Basic English",
    darby: "Darby Bible",
    dra: "Douay-Rheims 1899",
    "oeb-us": "Open English Bible (US)",
    "oeb-cw": "Open English Bible (Commonwealth)",
  };

  const cache = new Map(); // "id:Book.ch" -> {verse: text}

  async function fetchChapter(versionId, bookName, chapter) {
    const key = `${versionId}:${bookName}.${chapter}`;
    if (cache.has(key)) return cache.get(key);
    if (typeof getAppSettings === "function") {
      const { allowed } = NetworkGuard.checkAllowed(getAppSettings());
      if (!allowed) throw new WifiRequiredError();
    }
    const url = `https://bible-api.com/${encodeURIComponent(bookName)}+${chapter}?translation=${versionId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Online fetch failed: " + res.status);
    const data = await res.json();
    const verses = {};
    for (const v of data.verses || []) {
      verses[String(v.verse)] = v.text.trim();
    }
    cache.set(key, verses);
    return verses;
  }

  return { ONLINE_VERSIONS, fetchChapter };
})();
