// YouVersion Platform API (https://platform.youversion.com) -- the app's
// primary/default Bible version. Requires a free personal API key from a
// YouVersion Platform developer account; the user pastes it into Settings
// (signing up is a login/account step this app can't do on the user's
// behalf). Nothing is fetched until a key is present.
//
// Endpoint/header confirmed against the real API during integration (base
// URL, auth header name, passages endpoint, format=text param) via YouVersion's
// own developer docs and a third-party integration write-up. What is NOT
// independently verified is the exact inline verse-numbering format inside a
// whole-chapter `format=text` response body (no full-chapter sample was
// available) -- see parseChapterText() below for how that's handled safely.
//
// Per the "reasonable defaults, live fetch, don't bulk-cache copyrighted
// text offline" choice made when wiring this in: results are cached
// in-memory only (cleared on reload), never written to localStorage or the
// service worker cache, matching how the app already treats other licensed
// online translations in js/online.js.
const YouVersionBible = (() => {
  const API_BASE = "https://api.youversion.com/v1";
  const cache = new Map(); // "bibleId:BOOK.chapter" -> {verse: text}

  function config() {
    const s = (typeof getAppSettings === "function" && getAppSettings()) || {};
    return { apiKey: s.youversionApiKey || "", bibleId: s.youversionBibleId || "111" };
  }

  // Best-effort split of a whole-chapter text blob into per-verse text, based
  // on the near-universal plain-text Bible convention of an inline verse
  // number immediately followed by the verse's (capitalized) first word.
  // UNVERIFIED against a real response -- if the split doesn't produce a
  // plausible increasing sequence of verse numbers, we fall back to the
  // complete, correctly-ordered chapter text as a single unnumbered verse 1,
  // rather than risk showing mis-split/scrambled text under wrong numbers.
  function parseChapterText(content) {
    const marker = /(?:^|\s)(\d{1,3})\s+(?=[A-ZÀ-ÖØ-Þ"“'])/g;
    const matches = [...content.matchAll(marker)];
    if (matches.length >= 2) {
      const verses = {};
      for (let i = 0; i < matches.length; i++) {
        const num = matches[i][1];
        const start = matches[i].index + matches[i][0].length;
        const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
        const text = content.slice(start, end).trim();
        if (text) verses[num] = text;
      }
      const nums = Object.keys(verses).map(Number).sort((a, b) => a - b);
      const plausible = nums.length >= 2 && nums[0] <= 2 && nums.every((n, i) => i === 0 || n > nums[i - 1]);
      if (plausible) return verses;
    }
    return { "1": content.trim() };
  }

  // bookAbbr must be this app's BOOK_META abbreviation (e.g. "Gen", "1Co",
  // "Jhn") -- these already are standard 3-letter USFM codes, just not
  // uppercased, so `.toUpperCase()` is all the mapping YouVersion's USFM-style
  // book IDs need.
  async function fetchChapter(bookAbbr, chapter) {
    const { apiKey, bibleId } = config();
    if (!apiKey) throw new Error('Add your YouVersion Platform API key in Settings (get one free at platform.youversion.com) to read this version.');

    const key = `${bibleId}:${bookAbbr.toUpperCase()}.${chapter}`;
    if (cache.has(key)) return cache.get(key);

    if (typeof getAppSettings === "function") {
      const { allowed } = NetworkGuard.checkAllowed(getAppSettings());
      if (!allowed) throw new WifiRequiredError();
    }

    const ref = `${bookAbbr.toUpperCase()}.${chapter}`;
    const url = `${API_BASE}/bibles/${encodeURIComponent(bibleId)}/passages/${encodeURIComponent(ref)}?format=text`;
    const res = await fetch(url, { headers: { "X-YVP-App-Key": apiKey } });
    if (!res.ok) throw new Error(`YouVersion fetch failed: ${res.status}`);
    const data = await res.json();
    const verses = parseChapterText(data.content || "");
    cache.set(key, verses);
    return verses;
  }

  return { fetchChapter };
})();
