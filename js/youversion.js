// YouVersion Platform API (https://platform.youversion.com) -- the app's
// primary/default Bible version (NIV). The API key lives server-side in a
// Cloudflare Worker (see BibleStudy-Worker.js) and never reaches the browser
// or this app's source -- every visitor gets NIV with zero setup, no key to
// paste anywhere.
//
// Endpoint/header/format confirmed against a real API response during
// integration (base URL, auth header name, passages endpoint, and the
// format=html verse-marker structure below) -- fetched live via the browser
// console using the user's own key, since this app has no server to log
// requests through. Every verse (not just the first in a paragraph) is
// preceded by an empty marker span: `<span class="yv-v" v="3"></span>`. A
// separate `<span class="yv-vlbl">3</span>` ("visible label") duplicates the
// number only at each paragraph's first verse -- that's the reading-view
// convention for where a number is shown on screen, but it's redundant with
// `yv-v`'s `v` attribute, which is present on every single verse, so it's
// discarded rather than relied on.
//
// Per the "reasonable defaults, live fetch, don't bulk-cache copyrighted
// text offline" choice made when wiring this in: results are cached
// in-memory only (cleared on reload), never written to localStorage or the
// service worker cache, matching how the app already treats other licensed
// online translations in js/online.js.
const YouVersionBible = (() => {
  // Update this if the Worker is ever deployed under a different name/account
  // -- see BibleStudy-Worker.js's setup instructions.
  const WORKER_URL = "https://bible-study.rfwrites2.workers.dev";
  const cache = new Map(); // "BOOK.chapter" -> {verse: text}

  function stripTags(fragment) {
    return fragment
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Splits a whole-chapter `format=html` response into per-verse text using
  // the real yv-v marker spans (see file header). Falls back to the whole
  // chapter as a single unnumbered verse 1 only if no markers are found at
  // all (e.g. an unexpected response shape), so a parsing surprise never
  // produces scrambled/mis-numbered text -- just an unsplit block.
  function parseChapterHtml(html) {
    if (!html) return { "1": "" };
    const withoutLabels = html.replace(/<span class="yv-vlbl">\d*<\/span>/g, "");
    const marker = /<span class="yv-v" v="([\w-]+)"\s*>\s*<\/span>/g;
    const matches = [...withoutLabels.matchAll(marker)];
    if (!matches.length) return { "1": stripTags(withoutLabels) };

    const verses = {};
    for (let i = 0; i < matches.length; i++) {
      const num = matches[i][1];
      const start = matches[i].index + matches[i][0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index : withoutLabels.length;
      const text = stripTags(withoutLabels.slice(start, end));
      if (text) verses[num] = text;
    }
    return Object.keys(verses).length ? verses : { "1": stripTags(withoutLabels) };
  }

  // bookAbbr must be this app's BOOK_META abbreviation (e.g. "Gen", "1Co",
  // "Jhn") -- these already are standard 3-letter USFM codes, just not
  // uppercased, so `.toUpperCase()` is all the mapping YouVersion's USFM-style
  // book IDs need.
  async function fetchChapter(bookAbbr, chapter) {
    const key = `${bookAbbr.toUpperCase()}.${chapter}`;
    if (cache.has(key)) return cache.get(key);

    if (typeof getAppSettings === "function") {
      const { allowed } = NetworkGuard.checkAllowed(getAppSettings());
      if (!allowed) throw new WifiRequiredError();
    }

    const url = `${WORKER_URL}/passage?ref=${encodeURIComponent(key)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`YouVersion fetch failed: ${res.status}`);
    const data = await res.json();
    const verses = parseChapterHtml(data.content || "");
    cache.set(key, verses);
    return verses;
  }

  return { fetchChapter };
})();
