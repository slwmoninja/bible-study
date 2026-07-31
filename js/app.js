// Human-readable build marker, shown in Settings > About -- bump this on every
// change from here on so a reload can be visually confirmed against what was
// actually deployed. Distinct from service-worker.js's CACHE_VERSION (that one
// gates the offline cache/data schema, unrelated to this app-code version).
const APP_VERSION = "1.0.1";

const LOCAL_VERSION_IDS = ["ASV", "KJV", "YLT"];
const YOUVERSION_ID = "YV"; // the app's primary/default version -- see js/youversion.js

// The app's default opening location (see the `state` initializer below) -- kept
// persisted in NIV specifically so a brand-new user who opens the app offline for the
// very first time on a device that's been online before doesn't land on a blank/error
// page. This is a deliberate, narrow exception to "never persist licensed translation
// text" (see js/youversion.js's file header): every other NIV chapter still stays
// in-memory-only, cleared on reload.
const DEFAULT_OFFLINE_BOOK = "Psa", DEFAULT_OFFLINE_CHAPTER = 1;
const DEFAULT_CHAPTER_CACHE_KEY = "bibleAppDefaultChapterCache";
async function warmDefaultChapterCache() {
  try {
    const verses = await YouVersionBible.fetchChapter(DEFAULT_OFFLINE_BOOK, DEFAULT_OFFLINE_CHAPTER);
    localStorage.setItem(DEFAULT_CHAPTER_CACHE_KEY, JSON.stringify({ verses, ts: Date.now() }));
  } catch (e) { /* offline or blocked -- next successful load tries again */ }
}
function readDefaultChapterCache() {
  try {
    const raw = localStorage.getItem(DEFAULT_CHAPTER_CACHE_KEY);
    return raw ? JSON.parse(raw).verses : null;
  } catch (e) { return null; }
}
const COMMENTARY_SOURCES = {
  henry: "Matthew Henry's Commentary (1710)",
  jfb: "Jamieson-Fausset-Brown (1871)",
};

// New users (nothing saved yet) open on Psalms; returning users resume exactly
// where they left off. lastLocation.book is validated against BOOK_META so a
// corrupted/outdated localStorage value can't strand the reader on an invalid book.
const LAST_LOCATION_KEY = "bibleAppLastLocation";
const lastLocation = JSON.parse(localStorage.getItem(LAST_LOCATION_KEY) || "null");
const hasValidLastLocation = !!(lastLocation && lastLocation.book &&
  window.BOOK_META.some((b) => b.a === lastLocation.book) && Number(lastLocation.chapter) > 0);

const state = {
  book: hasValidLastLocation ? lastLocation.book : "Psa",
  chapter: hasValidLastLocation ? Number(lastLocation.chapter) : 1,
  settings: JSON.parse(localStorage.getItem("bibleAppSettings") || "{}"),
};

function withDefault(key, value) {
  if (state.settings[key] === undefined) state.settings[key] = value;
}
withDefault("wifiOnly", true); // only fetch add-ons larger than 5 MB on Wi-Fi by default
withDefault("onlineEnabled", false); // master switch revealing online-version toggles
withDefault("versions", {});
withDefault("showGreek", true);
withDefault("showHebrew", true);
withDefault("showStudyAids", true);
withDefault("showTranslit", true);
withDefault("showWordGloss", true);
withDefault("showArchaeology", true);
withDefault("showNotes", true);
withDefault("showBookArt", true);
withDefault("deleteConfirmations", true);
withDefault("commentaries", {});
withDefault("addonOfflineBible", true); // default on -- see warmOfflineBibleIfNeeded()
// Tracks, per Add On, whether the user has ever actually completed a real bulk install
// through its checkbox -- see the reconciliation comment in initAddonControls() for why
// this exists: a default-on preference that's never been bulk-installed (Original
// Languages/Word Study rely on ordinary per-chapter lazy loading in the meantime) isn't
// "drift" just because Cache Storage doesn't have every file yet.
withDefault("addonConfirmed", {});
// Set once the native install prompt resolves "accepted" (see isInstalled()) --
// a regular browser tab that just walked through installing doesn't itself
// switch to display-mode:standalone, so that check alone would keep showing
// "Install" until the user actually relaunches from the Home Screen icon.
// This remembers it across reloads of the same tab in the meantime.
withDefault("installPromptAccepted", false);

// Only one Bible version is ever active at a time (see selectSingleVersion).
// NIV is the default -- it now requires no API key (the key is hidden
// server-side in a Cloudflare Worker, see js/youversion.js), so it's the
// primary version new readers see. ASV/KJV/YLT start off until picked.
if (state.settings.versions[YOUVERSION_ID] === undefined) state.settings.versions[YOUVERSION_ID] = true;
for (const id of LOCAL_VERSION_IDS) {
  if (state.settings.versions[id] === undefined) state.settings.versions[id] = false;
}

// Migrate installs from before single-selection was enforced, where more
// than one version could be active in parallel: collapse down to just one,
// preferring NIV if it was on (it no longer needs a key to work), else the
// first other active version, else ASV.
{
  const activeKeys = Object.keys(state.settings.versions).filter((k) => state.settings.versions[k]);
  if (activeKeys.length > 1) {
    const keep = state.settings.versions[YOUVERSION_ID]
      ? YOUVERSION_ID
      : activeKeys.find((k) => k !== YOUVERSION_ID) || activeKeys[0];
    for (const k of Object.keys(state.settings.versions)) state.settings.versions[k] = k === keep;
    saveSettings(); // persist the collapse so this migration only runs once
  }
}
// Both commentaries start off -- ala-carte, since either one is a heavy (12.8-397.7MB)
// Add On install, not a default like Original Languages/Word Study.
for (const id of Object.keys(COMMENTARY_SOURCES)) {
  if (state.settings.commentaries[id] === undefined) state.settings.commentaries[id] = false;
}

function saveSettings() {
  localStorage.setItem("bibleAppSettings", JSON.stringify(state.settings));
}

// Only one Bible version can be active at a time -- selecting one turns every
// other version off, in Settings or the toolbar quick-select alike.
function selectSingleVersion(id) {
  for (const key of Object.keys(state.settings.versions)) {
    state.settings.versions[key] = key === id;
  }
  saveSettings();
  syncYouVersionToggleUI();
  syncQuickVersionSelect();
  renderChapter();
}

function activeVersionIds() {
  const active = Object.entries(state.settings.versions).filter(([, on]) => on).map(([id]) => id);
  return active.length ? active : ["ASV"]; // never show a completely empty reader
}

function isOnlineVersion(id) {
  return !LOCAL_VERSION_IDS.includes(id);
}

function versionTagLabel(id) {
  if (id === YOUVERSION_ID) return "NIV";
  return id.toUpperCase();
}

// Biblica requires this exact copyright line wherever NIV text is displayed
// (confirmed by the user against YouVersion's own license terms).
function youVersionAttributionText() {
  return "Scripture quotations taken from The Holy Bible, New International Version® NIV® Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.™ Used by permission. All rights reserved worldwide.";
}

const STATIC_VERSION_ATTRIBUTIONS = {
  ASV: "American Standard Version (1901). Public domain.",
  KJV: "King James Version (1769 Oxford edition). Public domain.",
  YLT: "Young's Literal Translation (1898), Robert Young. Public domain.",
};

// Attribution line for any version currently on screen -- YouVersion gets its
// (possibly copyright-required) notice, local versions and the bible-api.com
// online versions get a short public-domain credit. Returns null for an
// unrecognized id rather than fabricating text.
function versionAttributionText(id) {
  if (id === YOUVERSION_ID) return youVersionAttributionText();
  if (STATIC_VERSION_ATTRIBUTIONS[id]) return STATIC_VERSION_ATTRIBUTIONS[id];
  const onlineName = typeof OnlineBible !== "undefined" && OnlineBible.ONLINE_VERSIONS[id];
  return onlineName ? `${onlineName}. Public domain.` : null;
}

function activeCommentaryIds() {
  return Object.entries(state.settings.commentaries).filter(([, on]) => on).map(([id]) => id);
}

// All local versions the user currently has toggled on (falls back to ASV
// if none are active), so search covers exactly what the reader shows.
function getSearchVersions() {
  const active = activeVersionIds().filter((id) => !isOnlineVersion(id));
  return active.length ? active : ["ASV"];
}

// Loader/OnlineBible call this (as a plain global) to check the Wi-Fi-only gate
// without taking a hard dependency on app.js's internal state shape.
function getAppSettings() {
  return state.settings;
}

function openModal(dialog) {
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

// Non-modal open, used only for the search panel: unlike openModal() this
// doesn't block or dim the rest of the page, so the reader stays visible and
// interactive (e.g. to see a highlighted word after clicking a result) while
// the panel stays open for browsing more results. Closed via its "x" button.
function openNonModal(dialog) {
  if (typeof dialog.show === "function") {
    dialog.show();
  } else {
    dialog.setAttribute("open", "");
  }
}

// ---------- History-aware modal open/close ----------
// This app has one persistent reading screen (book/chapter, changed via
// navigateTo -- see below) plus a dozen <dialog> overlays a reader opens into
// and needs a real "back" out of on a phone: a hardware back press, an
// Android gesture-nav swipe, or an iOS edge-swipe should close whichever
// dialog is open -- one step -- not exit the app. Every dialog is opened
// through openScreen() (pushes one history entry per *newly* opened dialog --
// re-opening/refreshing an already-open one, e.g. the artifact modal's
// Prev/Next or a note panel refreshed after a drag-move, is a no-op push, so
// back doesn't need multiple presses to undo a single visible action) and
// dismissed through closeScreen() (steps history back if this dialog owns the
// current entry; otherwise just closes it directly -- covers a dialog closed
// as a side effect of navigating elsewhere, e.g. tapping a related-passage
// link inside the "Biblical discoveries" modal, which calls navigateTo()
// itself and pushes its own new entry). See the single popstate listener
// below navigateTo() for the other half of this.
function openScreen(dialog, opts) {
  const alreadyOpen = dialog.open;
  if (!alreadyOpen) {
    history.pushState({ book: state.book, chapter: state.chapter, modal: dialog.id }, "");
  }
  if (opts && opts.nonModal) {
    openNonModal(dialog); // .show() is a safe no-op if already open
  } else if (!alreadyOpen) {
    openModal(dialog); // .showModal() throws if called while already open
  }
}
function closeScreen(dialog) {
  if (history.state && history.state.modal === dialog.id) {
    history.back(); // the popstate listener below performs the actual close + state sync
  } else if (dialog.open) {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }
}

function bookMeta(abbr) {
  return window.BOOK_META.find((b) => b.a === abbr);
}

// ---------- Navigation ----------

function populateBookSelect() {
  const sel = document.getElementById("bookSelect");
  sel.innerHTML = "";
  let lastTestament = null;
  for (const b of window.BOOK_META) {
    if (b.t !== lastTestament) {
      const group = document.createElement("optgroup");
      group.label = b.t === "OT" ? "Old Testament" : "New Testament";
      group.dataset.testament = b.t;
      sel.appendChild(group);
      lastTestament = b.t;
    }
    const opt = document.createElement("option");
    opt.value = b.a;
    opt.textContent = b.n;
    sel.lastChild.appendChild(opt);
  }
  sel.value = state.book;
}

function populateChapterSelect() {
  const sel = document.getElementById("chapterSelect");
  sel.innerHTML = "";
  const meta = bookMeta(state.book);
  for (let c = 1; c <= meta.ch; c++) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = "Ch. " + c;
    sel.appendChild(opt);
  }
  sel.value = state.chapter;
}

function renderVersionToggles() {
  const localEl = document.getElementById("versionTogglesLocal");
  localEl.innerHTML = LOCAL_VERSION_IDS.map((id) => versionToggleHtml(id, id)).join("");

  document.querySelectorAll(".version-toggle input").forEach((cb) => {
    cb.addEventListener("change", () => {
      selectSingleVersion(cb.dataset.id);
    });
  });
}

// Per-version fetch errors from the most recent renderChapter() -- lets the
// toolbar quick-select dropdown default to whichever active version actually
// rendered (e.g. ASV) rather than always the first one turned on.
let lastRenderErrors = {};

// Keeps the Settings radio in sync when the version was selected some other
// way (e.g. picked from the toolbar quick-select dropdown instead).
function syncYouVersionToggleUI() {
  const toggle = document.getElementById("youversionToggle");
  toggle.checked = !!state.settings.versions[YOUVERSION_ID];
}

function initYouVersionSettings() {
  const toggle = document.getElementById("youversionToggle");
  syncYouVersionToggleUI();
  toggle.addEventListener("change", () => {
    selectSingleVersion(YOUVERSION_ID);
  });
}

function versionToggleHtml(id, label) {
  const checked = state.settings.versions[id] ? "checked" : "";
  return `<label class="version-toggle">
      <input type="radio" name="bibleVersion" data-id="${id}" ${checked}> ${escapeHtml(label)}
    </label>`;
}

// Toolbar convenience dropdown: a quick version switch, mirroring the single-
// select radios in Settings > Bible versions -- only one version is ever
// active at a time, picked from either place.
function populateQuickVersionSelect() {
  const sel = document.getElementById("quickVersionSelect");
  sel.innerHTML = "";

  const addOption = (id, label) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = label;
    sel.appendChild(opt);
  };

  addOption(YOUVERSION_ID, versionTagLabel(YOUVERSION_ID));
  for (const id of LOCAL_VERSION_IDS) addOption(id, id);
  if (state.settings.onlineEnabled) {
    for (const [id, name] of Object.entries(OnlineBible.ONLINE_VERSIONS)) addOption(id, name);
  }
  syncQuickVersionSelect();
}

function syncQuickVersionSelect() {
  const sel = document.getElementById("quickVersionSelect");
  const active = activeVersionIds();
  const current = active.find((id) => !lastRenderErrors[id]) || active[0] || "ASV";
  if ([...sel.options].some((o) => o.value === current)) sel.value = current;
}

// opts.skipHistory: true when called FROM the popstate handler below (the
// browser already moved the history position; pushing again here would fight
// it). opts.replace: true only for the very first navigation on load, so
// back from that first real screen exits the app instead of landing on a
// stale/incomplete entry -- see the history.replaceState() call at the end
// of initUI().
async function navigateTo(book, chapter, opts) {
  opts = opts || {};
  state.book = book;
  state.chapter = chapter;
  localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({ book, chapter }));
  if (!opts.skipHistory) {
    if (opts.replace) history.replaceState({ book, chapter }, "");
    else history.pushState({ book, chapter }, "");
  }
  populateChapterSelect();
  document.getElementById("bookSelect").value = book;
  document.getElementById("chapterSelect").value = chapter;
  await renderChapter();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Every explicit forward navigation (navigateTo pushing a new book/chapter,
// openScreen pushing a newly-opened dialog) put exactly one entry on the
// history stack for exactly one visible change -- so a single back step here
// (hardware back, Android gesture-nav swipe, iOS edge-swipe, or the browser's
// own back button) always undoes exactly one of those, never jumps straight
// past several of them to some fixed "home". This listener's only job is to
// reflect whatever the browser already walked back to -- it must NOT push
// anything itself, or back would stop being undo-one-step.
window.addEventListener("popstate", (e) => {
  const target = e.state || { book: state.book, chapter: state.chapter, modal: null };
  document.querySelectorAll("dialog[open]").forEach((d) => {
    if (target.modal !== d.id) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
  });
  if (target.book && (target.book !== state.book || Number(target.chapter) !== state.chapter)) {
    navigateTo(target.book, Number(target.chapter), { skipHistory: true });
  }
});

// ---------- Rendering ----------

async function getChapterTexts() {
  const meta = bookMeta(state.book);
  const versionIds = activeVersionIds();
  const results = {};
  const errors = {};
  await Promise.all(versionIds.map(async (id) => {
    try {
      if (id === YOUVERSION_ID) {
        results[id] = await YouVersionBible.fetchChapter(meta.a, state.chapter);
      } else if (isOnlineVersion(id)) {
        results[id] = await OnlineBible.fetchChapter(id, meta.n, state.chapter);
      } else {
        await Loader.english(id, { minimal: true });
        results[id] = (window.BIBLE_TEXT[id][state.book] || {})[String(state.chapter)] || {};
      }
    } catch (e) {
      // The one deliberate offline fallback: NIV on the app's default landing
      // chapter falls back to the persisted copy from warmDefaultChapterCache()
      // rather than erroring, so a brand-new offline launch isn't a blank page.
      if (id === YOUVERSION_ID && meta.a === DEFAULT_OFFLINE_BOOK && state.chapter === DEFAULT_OFFLINE_CHAPTER) {
        const fallback = readDefaultChapterCache();
        if (fallback) { results[id] = fallback; return; }
      }
      // Don't fail the whole render over one version's error -- other active
      // versions may still have text -- but remember why, so a total failure
      // (e.g. the only active version) can show a helpful message instead of
      // a silent blank page.
      results[id] = null;
      errors[id] = e instanceof WifiRequiredError
        ? "Blocked: \"Wi-Fi only\" is on and this device isn't on Wi-Fi."
        : e.message;
      ErrorLog.record(errors[id], `version:${id}`);
    }
  }));
  return { versionIds, texts: results, errors };
}

async function renderChapter() {
  const content = document.getElementById("content");
  content.innerHTML = '<div class="loading">Loading&hellip;</div>';

  const meta = bookMeta(state.book);
  const interlinearAvailable = window.INTERLINEAR_AVAILABLE.has(state.book);
  const wantsInterlinear = meta.t === "NT" ? state.settings.showGreek : state.settings.showHebrew;
  const showInterlinear = wantsInterlinear && interlinearAvailable;

  const commentaryIds = activeCommentaryIds();

  // Interlinear/lexicon/morphology/commentary are side-effect loads (they populate
  // window.INTERLINEAR etc. for renderWordBox()/showCommentaryModal() to read) --
  // unlike getChapterTexts(), a blocked or failed one here shouldn't crash the whole
  // render, just leave that feature unavailable for this chapter.
  const promises = [getChapterTexts()];
  if (showInterlinear) {
    promises.push(
      Loader.interlinear(state.book, { minimal: true }).catch((e) => ErrorLog.record(e.message, "interlinear")),
      Loader.lexicon({ minimal: true }).catch((e) => ErrorLog.record(e.message, "lexicon")),
      Loader.morphology({ minimal: true }).catch((e) => ErrorLog.record(e.message, "morphology")));
  }
  for (const id of commentaryIds) {
    promises.push(Loader.commentary(id, state.book).catch((e) => ErrorLog.record(e.message, `commentary:${id}`)));
  }
  const [{ versionIds, texts, errors }] = await Promise.all(promises);

  // Keep the toolbar quick-select dropdown showing whichever version is
  // actually on screen this render (e.g. falls back to ASV while NIV has no
  // working API key yet) rather than always the first version turned on.
  lastRenderErrors = errors;
  if (document.getElementById("quickVersionSelect")) syncQuickVersionSelect();

  // Union of verse numbers across all active versions (an online fetch failure
  // for one version shouldn't hide verses the other active versions do have).
  const verseNumSet = new Set();
  for (const id of versionIds) {
    if (texts[id]) Object.keys(texts[id]).forEach((vn) => verseNumSet.add(vn));
  }
  const verseNums = [...verseNumSet].sort((a, b) => Number(a) - Number(b));

  // Every active version failed (e.g. the only one on is YouVersion with no/bad
  // API key) -- show why instead of silently rendering an empty chapter.
  if (!verseNums.length) {
    const header = renderBookHeader(meta, state.chapter);
    const messages = versionIds.map((id) => errors[id]).filter(Boolean);
    content.innerHTML = header + `<div class="no-results" style="margin-top:1rem;">
        ${messages.length ? messages.map(escapeHtml).join("<br>") : "No text available for this chapter with the current version settings."}
      </div>`;
    populateVerseSelect([]);
    pendingHighlight = null;
    if (state.settings.showNotes) attachNoteIconHandlers();
    attachBookMapIconHandlers();
    attachBookArtHandler();
    return;
  }

  // Only attribute versions that actually produced text for this chapter --
  // an active-but-failed version (e.g. YouVersion with no key) shouldn't get
  // a copyright credit for text that isn't actually shown.
  const renderedVersionIds = versionIds.filter((id) => texts[id] && Object.keys(texts[id]).length);
  const header = renderBookHeader(meta, state.chapter, renderedVersionIds);
  let versesHtml = "";
  let fullChapterText = "";

  const verseHighlight = pendingHighlight &&
      pendingHighlight.book === state.book && pendingHighlight.chapter === state.chapter
    ? pendingHighlight
    : null;

  for (const vn of verseNums) {
    const hl = verseHighlight && verseHighlight.verse === String(vn) ? verseHighlight : null;

    let interlinearHtml = "";
    if (showInterlinear) {
      const words = ((window.INTERLINEAR[state.book] || {})[String(state.chapter)] || {})[vn];
      if (words && words.length) {
        const isHebrew = meta.t === "OT";
        // One-time orientation cue for readers unfamiliar with Hebrew: right-to-left
        // text starts at the opposite side from English, so flag it at the very first
        // verse of the book rather than on every chapter/verse.
        const showDirectionHint = isHebrew && state.chapter === 1 && Number(vn) === 1;
        const directionHintHtml = showDirectionHint
          ? `<a class="reading-direction-hint" dir="ltr" href="https://www.ancient-hebrew.org/alphabet/hebrew-alphabet-chart.htm" target="_blank" rel="noopener" title="Hebrew reads right to left — see the Hebrew alphabet chart">Start here &larr;</a>`
          : "";
        interlinearHtml = `<div class="interlinear-row" dir="${isHebrew ? "rtl" : "ltr"}">` +
          directionHintHtml +
          words.map((w, i) => renderWordBox(w, meta.t, state.book, state.chapter, vn, i, wordMatchesHighlight(w, hl))).join("") +
          `</div>`;
      }
    }

    const versionLines = versionIds.map((id) => {
      const vtext = texts[id] && texts[id][vn];
      if (!vtext) return "";
      fullChapterText += " " + vtext;
      const text = hl && hl.kind === "text" ? highlightMatch(vtext, hl.term) : escapeHtml(vtext);
      return `<div class="version-line"><span class="verse-text">${text}</span></div>`;
    }).join("");

    const hasAnyCommentary = commentaryIds.some((id) => {
      const entry = ((window.COMMENTARY[id] || {})[state.book] || {})[String(state.chapter)] || {};
      return !!entry[vn];
    });
    const commentaryHtml = hasAnyCommentary
      ? `<button class="commentary-icon" data-book="${state.book}" data-chapter="${state.chapter}" data-verse="${vn}" title="Commentary">
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
            <path d="M12,2.5 C8.4,2.5 5.8,5.1 5.8,8.5 C5.8,10.6 7,12.1 8.1,13.4 C8.9,14.3 9.4,15 9.4,15.8 L14.6,15.8 C14.6,15 15.1,14.3 15.9,13.4 C17,12.1 18.2,10.6 18.2,8.5 C18.2,5.1 15.6,2.5 12,2.5 Z" fill="#ffd400" stroke="#000" stroke-width="1.5"/>
            <line x1="9.6" y1="18" x2="14.4" y2="18" stroke="#000" stroke-width="1.3" stroke-linecap="round"/>
            <line x1="10.1" y1="20.2" x2="13.9" y2="20.2" stroke="#000" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
        </button>`
      : "";

    const artifactIdx = findArtifactIndex(state.book, state.chapter, vn);
    const artifactHtml = artifactIdx !== -1
      ? `<button class="artifact-icon" data-index="${artifactIdx}" title="Related archaeological discovery">
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" fill="#e8dcc0" stroke="#000" stroke-width="1.3"/>
            <circle cx="8" cy="10" r="2" fill="#ffd400" stroke="#000" stroke-width="1"/>
            <path d="M3,17 L9,11 L13,15 L17,11 L21,15 L21,19 L3,19 Z" fill="#8a6d3b" stroke="#000" stroke-width="1"/>
          </svg>
        </button>`
      : "";

    const hasNotes = Notes.hasNotes(state.book, state.chapter, vn);
    versesHtml += `
      <div class="verse" data-book="${state.book}" data-chapter="${state.chapter}" data-verse="${vn}" title="Double-click/double-tap to add a note">
        <div class="verse-line">
          <span class="verse-num${hasNotes && state.settings.showNotes ? " has-notes" : ""}">${vn}</span>
          <div class="verse-versions">${versionLines}</div>
          ${noteIconHtml(state.book, state.chapter, vn)}
          ${commentaryHtml}
          ${artifactHtml}
        </div>
        ${interlinearHtml}
      </div>`;
  }

  let placesHtml = "";
  if (state.settings.showArchaeology) {
    const places = findPlacesInText(fullChapterText);
    placesHtml = places.length
      ? `<div class="places-panel">
          <h3>Explore historical &amp; excavation photos</h3>
          <ul>${places.map(p => `
            <li><a href="${bibleCommonsSearchUrl(p.label + " archaeology excavation")}" target="_blank" rel="noopener">${escapeHtml(p.label)}</a>
                <span class="place-note">${escapeHtml(p.note)}</span></li>`).join("")}
          </ul>
        </div>`
      : "";
  }

  content.innerHTML = header + `<div class="verses">${versesHtml}</div>` + placesHtml;
  content.classList.toggle("notes-disabled", !state.settings.showNotes);

  if (state.settings.showNotes) {
    markChapterAndBookNoteIndicators();
    attachNoteDblClickHandlers();
    attachNoteIconHandlers();
    attachNoteDropHandlers();
  }
  attachWordHandlers();
  attachCommentaryHandlers();
  attachArtifactIconHandlers();
  attachAttributionHandlers();
  attachBookMapIconHandlers();
  attachBookArtHandler();
  populateVerseSelect(verseNums);
  pendingHighlight = null; // one-shot: only highlights the render right after a search-hit navigation
}

function attachCommentaryHandlers() {
  document.querySelectorAll(".commentary-icon").forEach((el) => {
    el.addEventListener("click", () => {
      const { book, chapter, verse } = el.dataset;
      showCommentaryModal(book, chapter, verse);
    });
  });
}

function attachArtifactIconHandlers() {
  document.querySelectorAll(".artifact-icon").forEach((el) => {
    el.addEventListener("click", () => showArtifactAt(Number(el.dataset.index)));
  });
}

function attachBookArtHandler() {
  const btn = document.querySelector("button.book-art");
  if (btn) btn.addEventListener("click", () => openBookArtModal(btn.dataset.book));
}

function openBookArtModal(abbr) {
  const art = window.BOOK_ART && window.BOOK_ART[abbr];
  if (!art) return;
  document.getElementById("bookArtModalTitle").textContent = art.title;
  document.getElementById("bookArtModalBody").innerHTML = `
    <div class="book-art-photo"><img src="${art.thumbUrl}" alt="${escapeHtml(art.title)}"></div>
    <p>${escapeHtml(art.title)}${art.artist ? ", " + escapeHtml(art.artist) : ""}</p>
    <p class="settings-note">${escapeHtml(art.license || "")}</p>`;
  openScreen(document.getElementById("bookArtModal"));
}

function showCommentaryModal(book, chapter, verse) {
  const sections = activeCommentaryIds()
    .map((id) => ({ id, html: ((window.COMMENTARY[id] || {})[book] || {})[chapter]?.[verse] }))
    .filter((s) => s.html);
  if (!sections.length) return;

  document.getElementById("commentaryModalTitle").textContent = refLabel(book, chapter, verse);
  document.getElementById("commentaryModalBody").innerHTML = sections.map((s) => `
      <div class="commentary-source">
        <h3>${escapeHtml(COMMENTARY_SOURCES[s.id])}</h3>
        <p>${s.html}</p>
      </div>`).join("");
  openScreen(document.getElementById("commentaryModal"));
}

// ---------- Maps ----------

function renderMapsGallery() {
  const gallery = document.getElementById("mapsGallery");
  gallery.innerHTML = window.BIBLE_MAPS.map((m) => `
    <a class="map-card" id="map-card-${m.id}" href="${m.sourceUrl}" target="_blank" rel="noopener" title="Click for source (${escapeHtml(m.license)})">
      <img src="${m.thumbUrl}" alt="${escapeHtml(m.title)}" loading="lazy">
      <div class="map-card-info">
        <div class="map-era">${escapeHtml(m.era)}</div>
        <div class="map-title">${escapeHtml(m.title)}</div>
        <div class="map-desc">${escapeHtml(m.description)}</div>
      </div>
    </a>`).join("");
}

// Jumps straight to the map matching a book's era (see data/book_maps.js)
// instead of making the reader scroll the whole gallery to find it.
function showBookMap(bookAbbr) {
  const mapId = window.BOOK_MAP_ID && window.BOOK_MAP_ID[bookAbbr];
  if (!mapId) return;
  renderMapsGallery();
  openScreen(document.getElementById("mapsModal"));
  const card = document.getElementById(`map-card-${mapId}`);
  if (card) {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("map-card-highlight");
    setTimeout(() => card.classList.remove("map-card-highlight"), 2000);
  }
}

function bookMapIconHtml(bookAbbr) {
  if (!window.BOOK_MAP_ID || !window.BOOK_MAP_ID[bookAbbr]) return "";
  return `<button class="book-map-icon" data-book="${bookAbbr}" title="Map of this book's era" aria-label="Map of this book's era">
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path d="M2,5.5 L8,3.5 L15,5.5 L21,3.5 L21,18.5 L15,20.5 L8,18.5 L2,20.5 Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
        <path d="M11.2,8.2 c1.6,0 2.6,1.7 1.6,3.1 l-1.6,2.1 l-1.6,-2.1 c-1,-1.4 0,-3.1 1.6,-3.1 Z" fill="currentColor"/>
      </svg>
    </button>`;
}

function attachBookMapIconHandlers() {
  document.querySelectorAll(".book-map-icon").forEach((btn) => {
    btn.addEventListener("click", () => showBookMap(btn.dataset.book));
  });
}

// ---------- Something cool (daily artifact) ----------

let currentArtifactIndex = 0;

function showTodaysArtifact() {
  showArtifactAt(todaysArtifactIndex());
}

function showArtifactAt(index) {
  const list = window.ARTIFACTS;
  currentArtifactIndex = ((index % list.length) + list.length) % list.length;
  const a = list[currentArtifactIndex];

  const wikiUrl = a.wiki
    ? "https://en.wikipedia.org/wiki/" + encodeURIComponent(a.wiki.replace(/ /g, "_"))
    : null;
  // BAS entries link out to the source article first; the Wikipedia link (if any)
  // is offered as a secondary line rather than being replaced outright.
  const primaryUrl = a.sourceUrl || wikiUrl;
  const primaryTitle = a.sourceUrl ? "Read more at Biblical Archaeology Society" : "Read more on Wikipedia";

  const verseLinks = a.verses.map(([book, ch, vs]) => {
    const meta = bookMeta(book);
    const label = meta ? `${meta.n} ${ch}:${vs}` : `${book} ${ch}:${vs}`;
    return `<button class="artifact-verse-link" data-book="${book}" data-chapter="${ch}" data-verse="${vs}">${escapeHtml(label)}</button>`;
  }).join("");

  const photoHtml = a.photo
    ? `<a class="artifact-photo" href="${primaryUrl}" target="_blank" rel="noopener" title="${primaryTitle}">
         <img src="${a.photo}" alt="${escapeHtml(a.title)}" loading="lazy">
       </a>`
    : "";

  const secondaryLinkHtml = a.sourceUrl && wikiUrl
    ? `<p class="settings-note"><a href="${wikiUrl}" target="_blank" rel="noopener">More on Wikipedia</a></p>`
    : "";

  const body = document.getElementById("artifactModalBody");
  body.innerHTML = `
    <div class="artifact-nav">
      <button class="artifact-nav-btn artifact-prev" title="Previous discovery" aria-label="Previous discovery">&#8249;</button>
      <span class="artifact-nav-count">${currentArtifactIndex + 1} / ${list.length}</span>
      <button class="artifact-nav-btn artifact-next" title="Next discovery" aria-label="Next discovery">&#8250;</button>
    </div>
    ${photoHtml}
    <h3>${escapeHtml(a.title)}</h3>
    <p>${escapeHtml(a.description)}</p>
    ${secondaryLinkHtml}
    <p class="settings-note">Related passages:</p>
    <div class="artifact-verses">${verseLinks}</div>`;

  body.querySelector(".artifact-prev").addEventListener("click", () => showArtifactAt(currentArtifactIndex - 1));
  body.querySelector(".artifact-next").addEventListener("click", () => showArtifactAt(currentArtifactIndex + 1));

  body.querySelectorAll(".artifact-verse-link").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { book, chapter, verse } = btn.dataset;
      // Closes directly (not via closeScreen -- this tap is one combined "go to a
      // different passage" action, not a plain dismiss) then navigateTo() pushes
      // its own new history entry for the destination chapter right on top; back
      // from there lands on the chapter that was showing when this modal was
      // opened, exactly one step, same as any other closeScreen dismiss would.
      const modal = document.getElementById("artifactModal");
      if (typeof modal.close === "function") modal.close();
      else modal.removeAttribute("open");
      await navigateTo(book, Number(chapter));
      setTimeout(() => scrollToVerse(verse), 100);
    });
  });

  const modal = document.getElementById("artifactModal");
  openScreen(modal); // no-op push if already open (Prev/Next within the same open modal)
}

function populateVerseSelect(verseNums) {
  const sel = document.getElementById("verseSelect");
  sel.innerHTML = "";
  for (const vn of verseNums) {
    const opt = document.createElement("option");
    opt.value = vn;
    opt.textContent = "v" + vn;
    sel.appendChild(opt);
  }
}

function scrollToVerse(verseNum) {
  const el = [...document.querySelectorAll(".verse-num")].find((e) => e.textContent === String(verseNum));
  const verseEl = el && el.closest(".verse");
  if (verseEl && typeof verseEl.scrollIntoView === "function") {
    verseEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function markChapterAndBookNoteIndicators() {
  const chapterLabel = document.querySelector(".chapter-label");
  if (chapterLabel && Notes.hasNotes(state.book, state.chapter, null)) {
    chapterLabel.classList.add("has-notes");
  }
  const bookTitle = document.querySelector(".book-title-block h1");
  if (bookTitle && Notes.hasNotes(state.book, null, null)) {
    bookTitle.classList.add("has-notes");
  }
}

function renderBookHeader(meta, chapter, versionIds) {
  const art = state.settings.showBookArt ? (window.BOOK_ART && window.BOOK_ART[meta.a]) || null : null;
  // Wikimedia-sourced art's sourceUrl is a real Commons page worth leaving the
  // app for (attribution/license details); a handful of books (currently just
  // Matthew) have no such page -- sourceUrl is just the same local image file
  // already shown as the thumb. For those, open an in-app lightbox instead of
  // a target="_blank" navigation to that same file: as a same-origin top-level
  // navigation it isn't part of this SPA's own history stack, so a back
  // gesture from there doesn't step back into the app the way every other
  // back gesture here does -- see openBookArtModal().
  const isLocalArt = art && !/^https?:\/\//i.test(art.sourceUrl);
  const captionHtml = art
    ? `<span class="art-caption">${art.isExcavation ? "📷 " : ""}${escapeHtml(art.title)}${art.artist ? ", " + escapeHtml(art.artist) : ""}</span>`
    : "";
  const artHtml = !state.settings.showBookArt
    ? ""
    : art
    ? isLocalArt
      ? `<button type="button" class="book-art" data-book="${meta.a}" title="${escapeHtml(art.title)} — tap to view full artwork">
           <img src="${art.thumbUrl}" alt="${escapeHtml(art.title)}" loading="lazy">
           ${captionHtml}
         </button>`
      : `<a class="book-art" href="${art.sourceUrl}" target="_blank" rel="noopener" title="${escapeHtml(art.title)} — click for source (${escapeHtml(art.license || "")})">
           <img src="${art.thumbUrl}" alt="${escapeHtml(art.title)}" loading="lazy">
           ${captionHtml}
         </a>`
    : `<div class="book-art book-art-placeholder"><span class="illum-ornament">&#10047;</span></div>`;

  const attributionItems = (versionIds || [])
    .map((id) => {
      const text = versionAttributionText(id);
      return text
        ? `<button type="button" class="version-attribution-item" title="${escapeHtml(text)}">${escapeHtml(versionTagLabel(id))}</button>`
        : "";
    })
    .filter(Boolean);
  const attributionHtml = attributionItems.length
    ? `<div class="version-attribution">${attributionItems.join("")}</div>`
    : "";

  return `<header class="book-header">
      ${artHtml}
      <div class="book-title-block">
        <div class="book-title-row">
          <h1>${escapeHtml(meta.n)}</h1>
          ${bookMapIconHtml(meta.a)}
          ${noteIconHtml(meta.a, null, null)}
        </div>
        <div class="chapter-row">
          <div class="chapter-label">Chapter ${chapter}</div>
          ${noteIconHtml(meta.a, chapter, null)}
        </div>
      </div>
      ${attributionHtml}
    </header>`;
}

function renderWordBox(w, testament, book, chapter, verse, idx, highlighted) {
  const id = `w-${book}-${chapter}-${verse}-${idx}`;
  const wrap = (html) => (highlighted ? `<mark class="search-highlight">${html}</mark>` : html);
  return `<button class="word-box${state.settings.showStudyAids ? "" : " no-click"}" id="${id}" data-book="${book}" data-idx="${idx}" data-chapter="${chapter}" data-verse="${verse}">
      <span class="orig">${wrap(escapeHtml(w.t))}</span>
      ${state.settings.showTranslit ? `<span class="translit">${wrap(escapeHtml(w.tr))}</span>` : ""}
      ${state.settings.showWordGloss ? `<span class="gloss">${escapeHtml(w.en)}</span>` : ""}
    </button>`;
}

function attachWordHandlers() {
  if (!state.settings.showStudyAids) return;
  document.querySelectorAll(".word-box").forEach((el) => {
    el.addEventListener("click", () => {
      const { book, chapter, verse, idx } = el.dataset;
      const words = ((window.INTERLINEAR[book] || {})[chapter] || {})[verse];
      const word = words && words[Number(idx)];
      if (word) showStudyAid(word, bookMeta(book).t);
    });
  });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s || "";
  return div.innerHTML;
}

// Gate for every delete action (notepad and per-verse notes) behind the
// Settings > "Delete confirmations" toggle -- skips the prompt entirely when
// the user has turned it off.
function confirmDelete(message) {
  return !state.settings.deleteConfirmations || confirm(message);
}

// ---------- Study aid popover ----------

function decodeGrammar(strongCode, gramCode) {
  const lang = strongCode.startsWith("G") ? "G" : "H";
  let key = gramCode;
  if (lang === "H" && !/^[HA]/.test(key)) key = "H" + key;
  const entry = window.MORPH_CODES && window.MORPH_CODES[lang] && window.MORPH_CODES[lang][key];
  return entry || null;
}

function showStudyAid(word, testament) {
  const modal = document.getElementById("studyModal");
  const body = document.getElementById("studyModalBody");

  const morphemesHtml = word.m.map((m) => {
    const lex = window.LEXICON && window.LEXICON[m.s];
    const gram = decodeGrammar(m.s, m.g);
    return `<div class="morpheme">
        <div class="morpheme-head">
          <span class="morpheme-word">${escapeHtml(lex ? lex.word : "?")}</span>
          <span class="morpheme-translit">${escapeHtml(lex ? lex.translit : "")}</span>
          <span class="morpheme-strong">${escapeHtml(m.s)}</span>
        </div>
        <div class="morpheme-gloss"><strong>Gloss:</strong> ${escapeHtml(lex ? lex.gloss : "")}</div>
        ${gram ? `<div class="morpheme-gram"><strong>Grammar:</strong> ${escapeHtml(gram.short)}<br>
          <span class="gram-desc">${escapeHtml(gram.desc)}</span></div>` : ""}
        ${lex && lex.def ? `<details class="lex-def"><summary>Full lexicon entry</summary>${lex.def}</details>` : ""}
      </div>`;
  }).join("");

  const primaryGram = word.m[0] ? decodeGrammar(word.m[0].s, word.m[0].g) : null;
  const usageNote = primaryGram
    ? `In this verse, translated “<em>${escapeHtml(word.en)}</em>” &mdash; ${escapeHtml(primaryGram.desc)}.`
    : `In this verse, translated “<em>${escapeHtml(word.en)}</em>”.`;

  body.innerHTML = `
    <div class="study-word-display" dir="${testament === "OT" ? "rtl" : "ltr"}">
      <span class="study-orig">${escapeHtml(word.t)}</span>
      <span class="study-translit">${escapeHtml(word.tr)}</span>
    </div>
    <p class="study-usage">${usageNote}</p>
    ${morphemesHtml}
  `;
  openScreen(modal);
}

// ---------- Notes ----------

// Small clickable indicator shown next to a book title, chapter label, or
// verse number whenever notes already exist there -- a single click opens
// the notes panel for that exact reference (view/edit/delete), separate from
// the double-click-anywhere gesture used to add a first note.
function noteIconHtml(book, chapter, verse) {
  if (!state.settings.showNotes || !Notes.hasNotes(book, chapter, verse)) return "";
  return `<button class="note-icon" data-book="${book}"${chapter ? ` data-chapter="${chapter}"` : ""}${verse ? ` data-verse="${verse}"` : ""} title="View/edit notes">
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path d="M5,3.5 L15,3.5 L19,7.5 L19,20.5 L5,20.5 Z" fill="#e8c25a" stroke="#000" stroke-width="1.1" stroke-linejoin="round"/>
        <path d="M15,3.5 L15,7.5 L19,7.5 Z" fill="#fff8e6" stroke="#000" stroke-width="1" stroke-linejoin="round"/>
        <line x1="7.5" y1="11" x2="16.5" y2="11" stroke="#000" stroke-width="1" stroke-linecap="round"/>
        <line x1="7.5" y1="14.5" x2="16.5" y2="14.5" stroke="#000" stroke-width="1" stroke-linecap="round"/>
      </svg>
    </button>`;
}

// The title attribute already shows the full credit on hover for mouse users;
// tapping does the same on touch devices, via a modal that stays open until
// dismissed with its "x" (a tooltip alone isn't reliably reachable by tap).
function attachAttributionHandlers() {
  document.querySelectorAll(".version-attribution-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("attributionModalBody").textContent = btn.title;
      openScreen(document.getElementById("attributionModal"));
    });
  });
}

function attachNoteIconHandlers() {
  document.querySelectorAll(".note-icon").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // clicking the icon shouldn't also trigger the parent's dblclick-to-add gesture
      showNotesPanel(btn.dataset.book, btn.dataset.chapter || null, btn.dataset.verse || null);
    });
  });
}

// Lets an in-progress drag from a draggable .note-item (see showNotesPanel)
// be dropped onto a verse, the chapter label, or the book title to relocate
// the note there -- an alternative to the "Move..." button for mouse users.
// Kept alongside that button (not a replacement) since native HTML5 drag/drop
// has no touch-device equivalent, and this app is primarily used on phones.
function attachNoteDropHandlers() {
  function makeDropTarget(el, book, chapter, verse) {
    el.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      el.classList.add("note-drop-hover");
    });
    el.addEventListener("dragleave", () => el.classList.remove("note-drop-hover"));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.classList.remove("note-drop-hover");
      let data;
      try { data = JSON.parse(e.dataTransfer.getData("application/json")); } catch { return; }
      if (!data || !data.id) return;
      const moved = Notes.move(data.book, data.chapter || null, data.verse || null, data.id, book, chapter, verse);
      if (moved) {
        renderChapter();
        const panel = document.getElementById("notesModal");
        if (panel.open) showNotesPanel(book, chapter, verse);
      }
    });
  }

  document.querySelectorAll(".verse").forEach((el) => {
    makeDropTarget(el, el.dataset.book, el.dataset.chapter, el.dataset.verse);
  });
  const chapterLabel = document.querySelector(".chapter-label");
  if (chapterLabel) makeDropTarget(chapterLabel, state.book, state.chapter, null);
  const bookTitle = document.querySelector(".book-title-block h1");
  if (bookTitle) makeDropTarget(bookTitle, state.book, null, null);
}

function attachNoteDblClickHandlers() {
  document.querySelectorAll(".verse").forEach((el) => {
    el.addEventListener("dblclick", (e) => {
      if (e.target.closest(".interlinear-row") || e.target.closest(".commentary-icon") || e.target.closest(".note-icon") || e.target.closest(".artifact-icon")) return; // let those clicks be, don't also open notes
      const { book, chapter, verse } = el.dataset;
      showNotesPanel(book, chapter, verse);
    });
  });
  const chapterLabel = document.querySelector(".chapter-label");
  if (chapterLabel) {
    chapterLabel.addEventListener("dblclick", (e) => {
      if (e.target.closest(".note-icon")) return;
      showNotesPanel(state.book, state.chapter, null);
    });
  }
  const bookTitle = document.querySelector(".book-title-block h1");
  if (bookTitle) {
    bookTitle.addEventListener("dblclick", (e) => {
      if (e.target.closest(".note-icon")) return;
      showNotesPanel(state.book, null, null);
    });
  }
}

function refLabel(book, chapter, verse) {
  const meta = bookMeta(book);
  const name = meta ? meta.n : book;
  if (verse) return `${name} ${chapter}:${verse}`;
  if (chapter) return `${name} ${chapter} (chapter note)`;
  return `${name} (book note)`;
}

function showNotesPanel(book, chapter, verse) {
  const modal = document.getElementById("notesModal");
  const body = document.getElementById("notesModalBody");

  function render() {
    const notes = Notes.forRef(book, chapter, verse);
    body.innerHTML = `
      <div class="notes-panel-heading">
        <h3>${escapeHtml(refLabel(book, chapter, verse))}</h3>
        ${notes.length ? '<button id="deleteAllNotesBtn" class="danger-btn">Delete all</button>' : ""}
      </div>
      <div class="notes-list">
        ${notes.map((n) => `
          <div class="note-item" data-id="${n.id}" draggable="true" title="Drag onto a verse, chapter, or book title to move this note there">
            <textarea class="note-text">${escapeHtml(n.text)}</textarea>
            <div class="note-actions">
              <button class="note-save">Save</button>
              <button class="note-move">Move&hellip;</button>
              <button class="note-delete">Delete</button>
            </div>
          </div>`).join("") || '<p class="no-notes">No notes yet.</p>'}
      </div>
      <div class="note-new">
        <textarea id="newNoteText" placeholder="Write a note about ${escapeHtml(refLabel(book, chapter, verse))}&hellip;"></textarea>
        <button id="addNoteBtn">Add note</button>
      </div>`;

    body.querySelectorAll(".note-item").forEach((item) => {
      const id = item.dataset.id;
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("application/json", JSON.stringify({ book, chapter, verse, id }));
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", () => item.classList.remove("dragging"));
      item.querySelector(".note-save").addEventListener("click", () => {
        const text = item.querySelector(".note-text").value.trim();
        if (text) Notes.update(book, chapter, verse, id, text);
        render();
        renderChapter();
      });
      item.querySelector(".note-delete").addEventListener("click", () => {
        if (!confirmDelete("Confirm delete?")) return;
        Notes.remove(book, chapter, verse, id);
        render();
        renderChapter();
      });
      item.querySelector(".note-move").addEventListener("click", () => {
        const dest = prompt("Move note to which reference? (e.g. \"John 3:16\", \"John 3\", or \"John\")",
          refLabel(book, chapter, verse).replace(" (chapter note)", "").replace(" (book note)", ""));
        if (!dest) return;
        const parsed = parseSimpleRef(dest);
        if (!parsed) { alert("Couldn't understand that reference."); return; }
        Notes.move(book, chapter, verse, id, parsed.book, parsed.chapter, parsed.verse);
        render();
        renderChapter();
      });
    });

    const deleteAllBtn = body.querySelector("#deleteAllNotesBtn");
    if (deleteAllBtn) {
      deleteAllBtn.addEventListener("click", () => {
        if (!confirmDelete("Confirm delete ALL entries?")) return;
        Notes.clearRef(book, chapter, verse);
        render();
        renderChapter();
      });
    }

    body.querySelector("#addNoteBtn").addEventListener("click", () => {
      const ta = body.querySelector("#newNoteText");
      const text = ta.value.trim();
      if (!text) return;
      Notes.add(book, chapter, verse, text);
      render();
      renderChapter();
    });
  }

  render();
  // Non-modal (like the search panel): a modal dialog makes the rest of the
  // page inert, which would block dropping a dragged note onto a verse,
  // chapter label, or book title behind this panel. openScreen() no-ops the
  // history push when the panel is already open (e.g. refreshed after a
  // drag-drop move via attachNoteDropHandlers), so that doesn't add an extra
  // back-step for something that isn't really a new "screen".
  openScreen(modal, { nonModal: true });
}

function parseSimpleRef(input) {
  const m = input.match(REF_PATTERN);
  if (!m) return null;
  const book = findBookByName(m[1]);
  if (!book) return null;
  return { book: book.a, chapter: m[2] || null, verse: m[3] || null };
}

// ---------- Notepad ----------
// A general, free-form personal notepad -- separate from the per-verse study
// notes above, not tied to any book/chapter/verse. Opened from the toolbar
// icon. Every entry is date-stamped on save, and re-stamped whenever edited.

function formatJournalDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function journalPreview(text) {
  const firstLine = text.split("\n").find((l) => l.trim()) || "";
  return firstLine.length > 80 ? firstLine.slice(0, 80) + "…" : firstLine;
}

// Circular "repeat" glyph used for the template toggle (green when a note is
// saved as a template, muted otherwise) and for the "start a new note from
// this template" action shown on template rows.
function repeatIconHtml(active) {
  const color = active ? "#2e8b3d" : "#9a8a6a";
  return `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path d="M20,12 A8,8 0 1 1 12,4" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M12,1 L12,7 L18,7 Z" fill="${color}"/>
    </svg>`;
}

const JOURNAL_COLLAPSED_LIMIT = 3;

function openNotepad() {
  const modal = document.getElementById("notepadModal");
  const body = document.getElementById("notepadModalBody");
  let expandedId = null;
  let showAll = false; // capped to JOURNAL_COLLAPSED_LIMIT rows until "See all entries" is clicked
  let newIsTemplate = false; // template toggle for the not-yet-saved compose box

  // The compose box and filters are built once (not re-rendered per keystroke)
  // so the filter inputs never lose focus while typing; only the entry list
  // below them is replaced on every change.
  body.innerHTML = `
    <div class="note-new">
      <textarea id="newJournalText" placeholder="Write a new note&hellip;"></textarea>
      <div class="note-actions">
        <button id="addJournalBtn">Save note</button>
        <button id="newJournalTemplateBtn" class="template-toggle-btn" title="Save as template" aria-pressed="false">${repeatIconHtml(false)} Save as template</button>
      </div>
    </div>
    <div class="journal-filters">
      <input type="text" id="journalSearch" placeholder="Filter by keyword&hellip;">
      <label>From <input type="date" id="journalFrom"></label>
      <label>To <input type="date" id="journalTo"></label>
      <button id="journalClearFilters">Clear filters</button>
      <button id="journalDeleteAll" class="danger-btn">Delete all</button>
    </div>
    <div class="notes-list journal-list" id="journalList"></div>`;

  const list = document.getElementById("journalList");
  const searchInput = document.getElementById("journalSearch");
  const fromInput = document.getElementById("journalFrom");
  const toInput = document.getElementById("journalTo");

  function currentFilters() {
    return {
      query: searchInput.value,
      fromTs: fromInput.value ? new Date(fromInput.value + "T00:00:00").getTime() : null,
      toTs: toInput.value ? new Date(toInput.value + "T23:59:59.999").getTime() : null,
    };
  }

  function renderList() {
    const entries = Journal.filter(currentFilters());
    const visible = showAll ? entries : entries.slice(0, JOURNAL_COLLAPSED_LIMIT);
    const hiddenCount = entries.length - visible.length;

    const rowsHtml = visible.map((e) => {
      if (e.id === expandedId) {
        return `<div class="note-item journal-entry-open" data-id="${e.id}" data-template="${!!e.isTemplate}">
            <div class="journal-entry-date">${escapeHtml(formatJournalDate(e.ts))}</div>
            <textarea class="note-text">${escapeHtml(e.text)}</textarea>
            <div class="note-actions">
              <button class="journal-save">Save</button>
              <button class="journal-template-btn template-toggle-btn${e.isTemplate ? " active" : ""}" title="Save as template" aria-pressed="${!!e.isTemplate}">${repeatIconHtml(!!e.isTemplate)} ${e.isTemplate ? "Template" : "Save as template"}</button>
              <button class="journal-delete">Delete</button>
              <button class="journal-collapse">Close</button>
            </div>
          </div>`;
      }
      const preview = journalPreview(e.text);
      const templateIcon = e.isTemplate
        ? `<button class="journal-use-template" title="Start a new note from this template" aria-label="Start a new note from this template">${repeatIconHtml(true)}</button>`
        : "";
      return `<div class="journal-entry-row${e.isTemplate ? " journal-entry-template" : ""}" data-id="${e.id}" tabindex="0" role="button">
          ${templateIcon}
          <span class="journal-entry-date">${escapeHtml(formatJournalDate(e.ts))}</span>
          <span class="journal-entry-preview">${preview ? escapeHtml(preview) : "<em>(empty)</em>"}</span>
          <button class="journal-row-delete" title="Delete this note" aria-label="Delete this note">&times;</button>
        </div>`;
    }).join("") || `<p class="no-notes">${entries.length === 0 && (searchInput.value || fromInput.value || toInput.value) ? "No notes match those filters." : "No notes yet. Write your first one above."}</p>`;

    const moreHtml = hiddenCount > 0
      ? `<button class="journal-see-all">See all entries (${entries.length})</button>`
      : (showAll && entries.length > JOURNAL_COLLAPSED_LIMIT
        ? `<button class="journal-see-all">Show fewer</button>`
        : "");

    list.innerHTML = rowsHtml + moreHtml;

    const seeAllBtn = list.querySelector(".journal-see-all");
    if (seeAllBtn) {
      seeAllBtn.addEventListener("click", () => {
        showAll = !showAll;
        renderList();
      });
    }

    list.querySelectorAll(".journal-entry-row").forEach((row) => {
      const id = row.dataset.id;
      const open = () => { expandedId = id; renderList(); };
      row.addEventListener("click", open);
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
      // Deletes straight from the rolled-up row -- no need to open/expand it first.
      row.querySelector(".journal-row-delete").addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirmDelete("Confirm delete?")) return;
        Journal.remove(id);
        if (expandedId === id) expandedId = null;
        renderList();
      });
      // Launches a new note pre-filled from this template, ready to tweak and save.
      const useTemplateBtn = row.querySelector(".journal-use-template");
      if (useTemplateBtn) {
        useTemplateBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const tmpl = visible.find((v) => v.id === id) || entries.find((v) => v.id === id);
          if (!tmpl) return;
          const ta = document.getElementById("newJournalText");
          ta.value = tmpl.text;
          ta.focus();
          ta.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    });
    list.querySelectorAll(".journal-entry-open").forEach((item) => {
      const id = item.dataset.id;
      item.querySelector(".journal-save").addEventListener("click", () => {
        const text = item.querySelector(".note-text").value.trim();
        if (text) Journal.update(id, text);
        expandedId = null;
        renderList();
      });
      item.querySelector(".journal-template-btn").addEventListener("click", () => {
        const isTemplate = item.dataset.template === "true";
        Journal.setTemplate(id, !isTemplate);
        renderList();
      });
      item.querySelector(".journal-delete").addEventListener("click", () => {
        if (!confirmDelete("Confirm delete?")) return;
        Journal.remove(id);
        expandedId = null;
        renderList();
      });
      item.querySelector(".journal-collapse").addEventListener("click", () => {
        expandedId = null;
        renderList();
      });
    });
  }

  const newTemplateBtn = document.getElementById("newJournalTemplateBtn");
  function syncNewTemplateBtn() {
    newTemplateBtn.innerHTML = `${repeatIconHtml(newIsTemplate)} ${newIsTemplate ? "Template" : "Save as template"}`;
    newTemplateBtn.classList.toggle("active", newIsTemplate);
    newTemplateBtn.setAttribute("aria-pressed", String(newIsTemplate));
  }
  newTemplateBtn.addEventListener("click", () => {
    newIsTemplate = !newIsTemplate;
    syncNewTemplateBtn();
  });

  document.getElementById("addJournalBtn").addEventListener("click", () => {
    const ta = document.getElementById("newJournalText");
    const text = ta.value.trim();
    if (!text) return;
    Journal.add(text, newIsTemplate);
    ta.value = "";
    newIsTemplate = false;
    syncNewTemplateBtn();
    renderList();
  });

  searchInput.addEventListener("input", renderList);
  fromInput.addEventListener("change", renderList);
  toInput.addEventListener("change", renderList);
  document.getElementById("journalClearFilters").addEventListener("click", () => {
    searchInput.value = "";
    fromInput.value = "";
    toInput.value = "";
    renderList();
  });
  document.getElementById("journalDeleteAll").addEventListener("click", () => {
    if (!confirmDelete("Confirm delete ALL entries?")) return;
    Journal.clear();
    expandedId = null;
    renderList();
  });

  renderList();
  openScreen(modal);
  document.getElementById("newJournalText").focus();
}

// ---------- Search ----------

const REF_PATTERN = /^\s*([1-3]?\s?[A-Za-z\.]+)\.?\s*(\d+)\s*(?::\s*(\d+))?\s*(?:-\s*(\d+))?\s*$/;

// Set by a search-hit click just before navigating; renderChapter() reads it
// once to highlight the searched word/phrase at the destination verse, then
// clears it so the highlight doesn't linger on later, unrelated renders.
let pendingHighlight = null;

function wordMatchesHighlight(w, hl) {
  if (!hl) return false;
  if (hl.kind === "strong") {
    return (w.m || []).some((m) => m.s === hl.term);
  }
  if (hl.kind === "original") {
    const tokens = hl.term.split(/\s+/).filter(Boolean);
    return tokens.includes(normalizeSearchTerm(w.t)) || tokens.includes(normalizeSearchTerm(w.tr));
  }
  return false;
}

// Shared navigation for every search-result click: remembers what to
// highlight at the destination (if anything), navigates there, and scrolls
// the target verse into view once it's rendered.
async function goToSearchHit(book, chapter, verse, highlight) {
  pendingHighlight = verse && highlight ? { book, chapter: Number(chapter), verse: String(verse), ...highlight } : null;
  await navigateTo(book, Number(chapter));
  if (verse) setTimeout(() => scrollToVerse(verse), 100);
}

function findBookByName(query) {
  const q = query.trim().toLowerCase().replace(/\.$/, "");
  return window.BOOK_META.find((b) =>
    b.a.toLowerCase() === q ||
    b.n.toLowerCase() === q ||
    b.n.toLowerCase().replace(/^(i|ii|iii)\s/, (m) => ({ i: "1 ", ii: "2 ", iii: "3 " }[m.trim().toLowerCase()])) === q ||
    b.n.toLowerCase().startsWith(q) && q.length >= 3
  );
}

// Which testaments the user currently wants original-language results from,
// mirroring the showGreek (NT)/showHebrew (OT) interlinear toggles so search
// surfaces the same language(s) the reader is displaying.
function allowedSearchTestaments() {
  const allowed = new Set();
  if (state.settings.showGreek) allowed.add("NT");
  if (state.settings.showHebrew) allowed.add("OT");
  return allowed;
}

function filterRefsByLanguageToggle(refs) {
  const allowed = allowedSearchTestaments();
  return refs.filter((ref) => {
    const meta = bookMeta(ref.split(".")[0]);
    return meta && allowed.has(meta.t);
  });
}

async function runSearch(query) {
  const resultsEl = document.getElementById("searchResults");
  resultsEl.innerHTML = "";
  if (!query.trim()) return;

  // 1. Reference lookup: "John 3:16", "Jhn 3", "Genesis 1:1-3"
  const refMatch = query.match(REF_PATTERN);
  if (refMatch) {
    const book = findBookByName(refMatch[1]);
    if (book) {
      const chapter = Number(refMatch[2]);
      const verse = refMatch[3] ? Number(refMatch[3]) : null;
      resultsEl.innerHTML = `<div class="search-hit ref-hit" data-book="${book.a}" data-chapter="${chapter}">
          Go to ${escapeHtml(book.n)} ${chapter}${verse ? ":" + verse : ""}</div>`;
      resultsEl.querySelector(".ref-hit").addEventListener("click", () => goToSearchHit(book.a, chapter, verse, null));
      return;
    }
  }

  // 2. Strong's number search e.g. "G2316" or "H0430" -- respects the
  // showGreek/showHebrew toggles since a G-code is inherently NT and an H-code OT.
  if (/^[GH]\d+[A-Za-z]?$/i.test(query.trim())) {
    const code = query.trim().toUpperCase();
    const testament = code.startsWith("G") ? "NT" : "OT";
    if (!allowedSearchTestaments().has(testament)) {
      renderDisabledLanguageMessage(resultsEl, testament);
      return;
    }
    await Loader.searchIndex();
    await Loader.lexicon();
    const refs = (window.SEARCH_INDEX.strong[code]) || [];
    const lex = window.LEXICON[code];
    renderRefResults(resultsEl, refs, lex ? `${lex.word} (${lex.gloss})` : code, { kind: "strong", term: code });
    return;
  }

  // 3. Original-language word/phrase (Greek or Hebrew script) -- only searched
  // when the matching interlinear toggle is on, so search mirrors what's displayed.
  const hasGreekScript = /[Ͱ-Ͽἀ-῿]/.test(query);
  const hasHebrewScript = /[֐-׿]/.test(query);
  if (hasGreekScript || hasHebrewScript) {
    const testament = hasGreekScript ? "NT" : "OT";
    if (!allowedSearchTestaments().has(testament)) {
      renderDisabledLanguageMessage(resultsEl, testament);
      return;
    }
    await Loader.searchIndex();
    const norm = normalizeSearchTerm(query);
    const isPhrase = norm.trim().includes(" ");
    let refs;
    if (isPhrase) {
      // Phrase search: match the normalized word sequence against each verse's
      // original-language text (word order preserved, accents/niqqud stripped).
      refs = [];
      for (const [ref, verseNorm] of Object.entries(window.SEARCH_INDEX.verseText)) {
        if ((" " + verseNorm + " ").includes(" " + norm + " ") || verseNorm.includes(norm)) {
          refs.push(ref);
        }
      }
    } else {
      refs = window.SEARCH_INDEX.form[norm] || window.SEARCH_INDEX.translit[norm] || [];
    }
    renderRefResults(resultsEl, refs, query, { kind: "original", term: norm });
    return;
  }

  // 4. Plain English word/phrase search across every local version the user has
  // toggled on in Settings/quick-version select (full Bible, already embedded).
  const searchVersions = getSearchVersions();
  await Promise.all(searchVersions.map((v) => Loader.english(v)));
  const needle = query.trim().toLowerCase();
  const hits = [];
  outer:
  for (const versionId of searchVersions) {
    const text = window.BIBLE_TEXT[versionId];
    for (const meta of window.BOOK_META) {
      const chapters = text[meta.a];
      if (!chapters) continue;
      for (const [ch, verses] of Object.entries(chapters)) {
        for (const [vs, vtext] of Object.entries(verses)) {
          if (vtext.toLowerCase().includes(needle)) {
            hits.push({ book: meta.a, name: meta.n, chapter: ch, verse: vs, text: vtext, version: versionId });
            if (hits.length >= 100) break outer;
          }
        }
      }
    }
  }
  if (hits.length) {
    renderEnglishResults(resultsEl, hits, needle, searchVersions.length > 1);
    return;
  }

  // 5. Auto fallback: no English hits -- maybe it was a transliterated Greek/Hebrew
  // word typed in Latin letters (e.g. "theos", "elohim"). Try that before giving up,
  // still narrowed to whichever testament(s) the user has toggled on.
  await Loader.searchIndex();
  const translitNorm = normalizeSearchTerm(query);
  const translitRefs = filterRefsByLanguageToggle(window.SEARCH_INDEX.translit[translitNorm] || []);
  if (translitRefs.length) {
    renderRefResults(resultsEl, translitRefs, query, { kind: "original", term: translitNorm });
    return;
  }

  renderEnglishResults(resultsEl, hits, needle, false);
}

function normalizeSearchTerm(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ς/g, "σ")
    .replace(/[^\p{L}\p{N}\s]/gu, "").trim().toLowerCase();
}

function renderDisabledLanguageMessage(container, testament) {
  const label = testament === "NT" ? "Greek" : "Hebrew";
  const settingName = testament === "NT" ? "Show Greek" : "Show Hebrew";
  container.innerHTML = `<div class="no-results">${label} is turned off in Settings ("${settingName}"). Enable it to search ${label} text.</div>`;
}

// Wraps every case-insensitive occurrence of `needle` in `text` with a red
// highlight span, HTML-escaping everything else so no markup can leak in.
function highlightMatch(text, needle) {
  if (!needle) return escapeHtml(text);
  const escapedNeedle = escapeHtml(needle).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escapedNeedle})`, "gi");
  return escapeHtml(text).replace(re, '<mark class="search-highlight">$1</mark>');
}

function renderRefResults(container, refs, label, highlight) {
  if (!refs.length) {
    container.innerHTML = `<div class="no-results">No occurrences found for "${escapeHtml(label)}".</div>`;
    return;
  }
  container.innerHTML = `<div class="results-label">${refs.length} occurrence(s) of ${escapeHtml(label)}</div>` +
    refs.slice(0, 200).map((ref) => {
      const [book, ch, vs] = ref.split(".");
      const meta = bookMeta(book);
      return `<div class="search-hit" data-book="${book}" data-chapter="${ch}" data-verse="${vs}">
          ${escapeHtml(meta ? meta.n : book)} ${ch}:${vs}</div>`;
    }).join("");
  container.querySelectorAll(".search-hit").forEach((el) => {
    el.addEventListener("click", () => goToSearchHit(el.dataset.book, el.dataset.chapter, el.dataset.verse, highlight));
  });
}

function renderEnglishResults(container, hits, needle, showVersionTag) {
  if (!hits.length) {
    container.innerHTML = `<div class="no-results">No verses found containing "${escapeHtml(needle)}".</div>`;
    return;
  }
  container.innerHTML = `<div class="results-label">${hits.length}${hits.length >= 100 ? "+" : ""} match(es)</div>` +
    hits.map((h) => `<div class="search-hit" data-book="${h.book}" data-chapter="${h.chapter}" data-verse="${h.verse}">
        <strong>${escapeHtml(h.name)} ${h.chapter}:${h.verse}${showVersionTag ? ` (${escapeHtml(h.version)})` : ""}</strong> &mdash; ${highlightMatch(h.text, needle)}</div>`).join("");
  container.querySelectorAll(".search-hit").forEach((el) => {
    el.addEventListener("click", () => goToSearchHit(el.dataset.book, el.dataset.chapter, el.dataset.verse, { kind: "text", term: needle }));
  });
}

// ---------- Add-on features (bulk install/remove of large data packs) ----------

// Each entry's urls() must exactly match the relative src Loader.* actually requests
// for that data (see js/loader.js) -- both the Cache Storage eviction below and
// Loader.forgetAll() key off that same string, and a mismatch would silently leave
// stale cached bytes behind (eviction) or a live entry stuck un-refetchable (forget).
// isOn()/setOn() read and write the *real* underlying setting for each feature (the
// same flags renderChapter() already checks) rather than a separate install-only flag
// -- these checkboxes are the single on/off switch for both "download this for offline
// use" and "show it while reading" (see the removed Original languages/Commentary/Word
// study popovers sections they replace). Offline Bible has no reading-view counterpart
// (which version is displayed is a separate choice in Settings > Bible versions), so it
// keeps its own dedicated flag.
const ADDONS = [
  {
    id: "originalLanguages",
    checkboxId: "addonOriginalLanguagesToggle",
    progressId: "addonOriginalLanguagesProgress",
    label: "Greek, Hebrew, Transliteration",
    sizeMB: 41.9,
    isOn: () => !!(state.settings.showGreek || state.settings.showHebrew),
    setOn: (on) => { state.settings.showGreek = on; state.settings.showHebrew = on; },
    urls: () => window.BOOK_META.map((b) => `data/processed/books/${b.a}.js`),
    tasks: () => window.BOOK_META.map((b) => ({ name: b.n, run: () => Loader.interlinear(b.a) })),
    clearMemory: () => { window.INTERLINEAR = {}; },
  },
  {
    id: "offlineBible",
    checkboxId: "addonOfflineBibleToggle",
    progressId: "addonOfflineBibleProgress",
    label: "KJV, ASV, YLT",
    sizeMB: 12.5,
    isOn: () => !!state.settings.addonOfflineBible,
    setOn: (on) => { state.settings.addonOfflineBible = on; },
    urls: () => LOCAL_VERSION_IDS.map((v) => `data/processed/english/${v}.js`),
    tasks: () => LOCAL_VERSION_IDS.map((v) => ({ name: v, run: () => Loader.english(v) })),
    clearMemory: () => { window.BIBLE_TEXT = {}; },
  },
  {
    id: "wordStudy",
    checkboxId: "addonWordStudyToggle",
    progressId: "addonWordStudyProgress",
    label: "Lexicon and Grammar Tools",
    sizeMB: 9.3,
    isOn: () => !!state.settings.showStudyAids,
    setOn: (on) => { state.settings.showStudyAids = on; },
    urls: () => ["data/processed/lexicon.js", "data/processed/morphology.js"],
    tasks: () => [
      { name: "lexicon", run: () => Loader.lexicon() },
      { name: "morphology", run: () => Loader.morphology() },
    ],
    clearMemory: () => { window.LEXICON = null; window.MORPH_CODES = null; },
  },
  {
    id: "commentaryHenry",
    checkboxId: "addonCommentaryHenryToggle",
    progressId: "addonCommentaryHenryProgress",
    label: "Matthew Henry's Commentary",
    sizeMB: 397.7,
    isOn: () => !!state.settings.commentaries.henry,
    setOn: (on) => { state.settings.commentaries.henry = on; },
    urls: () => window.BOOK_META.map((b) => `data/processed/commentary/henry/${b.a}.js`),
    tasks: () => window.BOOK_META.map((b) => ({ name: b.n, run: () => Loader.commentary("henry", b.a) })),
    clearMemory: () => { if (window.COMMENTARY) window.COMMENTARY.henry = {}; },
  },
  {
    id: "commentaryJfb",
    checkboxId: "addonCommentaryJfbToggle",
    progressId: "addonCommentaryJfbProgress",
    label: "Jamieson-Fausset-Brown Commentary",
    sizeMB: 12.8,
    isOn: () => !!state.settings.commentaries.jfb,
    setOn: (on) => { state.settings.commentaries.jfb = on; },
    urls: () => window.BOOK_META.map((b) => `data/processed/commentary/jfb/${b.a}.js`),
    tasks: () => window.BOOK_META.map((b) => ({ name: b.n, run: () => Loader.commentary("jfb", b.a) })),
    clearMemory: () => { if (window.COMMENTARY) window.COMMENTARY.jfb = {}; },
  },
];

const WIFI_ONLY_THRESHOLD_MB = 5;

async function installAddonPack(progressEl, label, sizeMB, tasks) {
  if (sizeMB > WIFI_ONLY_THRESHOLD_MB) {
    const gate = NetworkGuard.checkAllowed(state.settings);
    if (!gate.allowed) {
      progressEl.textContent = "Blocked: \"Wi-Fi only\" is on and this device isn't on Wi-Fi.";
      return false;
    }
  }
  let done = 0;
  for (const t of tasks) {
    progressEl.textContent = `Downloading ${label}… (${done}/${tasks.length})`;
    try {
      await t.run();
    } catch (e) {
      progressEl.textContent = e instanceof WifiRequiredError
        ? "Blocked: \"Wi-Fi only\" is on and this device isn't on Wi-Fi."
        : `Failed on ${t.name}: ${e.message}`;
      ErrorLog.record(progressEl.textContent, "install " + label);
      return false;
    }
    done++;
  }
  progressEl.textContent = `${label} installed (${tasks.length}/${tasks.length}).`;
  return true;
}

// Deletes specific cached URLs out of whatever Cache Storage bucket(s) actually hold
// them, rather than assuming this page's copy of CACHE_VERSION -- the service worker
// owns that name and bumps it independently, so reaching in by name from here could
// silently miss the real bucket. Sweeping every bucket is cheap (there's normally only
// ever one live one; activate() in service-worker.js evicts the rest) and can't evict
// too much since it only ever deletes these exact URLs, never a whole cache.
async function evictFromCache(urls) {
  if (!(window.caches && caches.keys)) return;
  const names = await caches.keys();
  for (const name of names) {
    const cache = await caches.open(name);
    for (const url of urls) await cache.delete(url);
  }
}

function removeAddonPack(progressEl, label, urls, clearMemory) {
  evictFromCache(urls);
  Loader.forgetAll(urls);
  clearMemory();
  progressEl.textContent = `${label} removed — space freed up.`;
}

// Ground truth for whether a pack is actually installed: every one of its URLs has to
// be sitting in Cache Storage right now, not just "the last time we successfully ran
// installAddonPack() we said so." A persisted flag can drift from reality -- the
// browser evicting storage under pressure, a user clearing site data by hand, an
// install that got interrupted partway -- so this is what initAddonControls() trusts
// to correct the checkbox (and the paired setting) rather than the flag alone.
async function isAddonInstalled(urls) {
  if (!urls.length) return false;
  if (!(window.caches && caches.keys)) return false;
  const names = await caches.keys();
  const buckets = [];
  for (const name of names) buckets.push(await caches.open(name));
  for (const url of urls) {
    let found = false;
    for (const cache of buckets) {
      if (await cache.match(url)) { found = true; break; }
    }
    if (!found) return false;
  }
  return true;
}

function initAddonControls() {
  for (const addon of ADDONS) {
    const cb = document.getElementById(addon.checkboxId);
    const progressEl = document.getElementById(addon.progressId);
    if (!cb || !progressEl) continue;
    cb.checked = addon.isOn();
    cb.addEventListener("change", async () => {
      if (cb.checked) {
        cb.disabled = true;
        const ok = await installAddonPack(progressEl, addon.label, addon.sizeMB, addon.tasks());
        cb.disabled = false;
        if (ok) {
          addon.setOn(true);
          state.settings.addonConfirmed[addon.id] = true;
          saveSettings();
          renderChapter();
        } else {
          cb.checked = false; // failed or blocked -- don't claim it's on
        }
      } else {
        removeAddonPack(progressEl, addon.label, addon.urls(), addon.clearMemory);
        addon.setOn(false);
        state.settings.addonConfirmed[addon.id] = false;
        saveSettings();
        renderChapter();
      }
    });

    // Reconcile the checkbox (and the setting it drives) against actual Cache Storage
    // state once at load, in case they've drifted -- see isAddonInstalled() above. Only
    // ever corrects DOWNWARD (checked but not really there) if addonConfirmed says the
    // user actually completed a real bulk install before -- Original Languages/Word
    // Study default to "on" without ever being bulk-installed (per-chapter lazy loading
    // covers that fine on its own), and that's a legitimate preference, not drift.
    // Correcting UPWARD (fully cached but the setting said off) is always safe, so it
    // runs unconditionally.
    isAddonInstalled(addon.urls()).then((installed) => {
      const currentlyOn = addon.isOn();
      if (installed === currentlyOn) {
        if (installed) state.settings.addonConfirmed[addon.id] = true;
        return;
      }
      if (installed || state.settings.addonConfirmed[addon.id]) {
        addon.setOn(installed);
        state.settings.addonConfirmed[addon.id] = installed;
        saveSettings();
        cb.checked = installed;
        renderChapter();
      }
    });
  }
}

// Offline Bible defaults on, but unlike Original Languages/Word Study (which fall back
// fine on ordinary per-chapter lazy loading even if never bulk-installed), there's no
// "just works offline anyway" safety net here without an actual completed install --
// KJV/ASV/YLT only ever load per-chapter on demand otherwise. So a user who's never
// explicitly touched this checkbox gets the real bulk install run for them once,
// automatically, the same way warmDefaultChapterCache() protects the NIV default
// landing chapter. Respects the Wi-Fi-only setting via installAddonPack() as normal --
// this is a real network fetch, not exempt from that gate just because it's automatic.
async function warmOfflineBibleIfNeeded() {
  const addon = ADDONS.find((a) => a.id === "offlineBible");
  if (!addon || !addon.isOn() || state.settings.addonConfirmed[addon.id]) return;
  if (await isAddonInstalled(addon.urls())) {
    state.settings.addonConfirmed[addon.id] = true;
    saveSettings();
    return;
  }
  const progressEl = document.getElementById(addon.progressId);
  if (!progressEl) return;
  const ok = await installAddonPack(progressEl, addon.label, addon.sizeMB, addon.tasks());
  if (ok) {
    state.settings.addonConfirmed[addon.id] = true;
    saveSettings();
    const cb = document.getElementById(addon.checkboxId);
    if (cb) cb.checked = true;
  }
}

// ---------- Error log ----------

function refreshErrorLogText() {
  document.getElementById("errorLogText").value = ErrorLog.load().length ? ErrorLog.formatForCopy() : "";
}

function initErrorLogControls() {
  document.getElementById("copyErrorLogBtn").addEventListener("click", async () => {
    const status = document.getElementById("errorLogStatus");
    const text = document.getElementById("errorLogText").value;
    const ok = await copyToClipboard(`<pre>${escapeHtml(text)}</pre>`, text);
    status.textContent = ok ? "Copied!" : "Couldn't access the clipboard in this browser.";
  });
  document.getElementById("clearErrorLogBtn").addEventListener("click", () => {
    ErrorLog.clear();
    refreshErrorLogText();
    document.getElementById("errorLogStatus").textContent = "Cleared.";
  });
}

// ---------- Copy to clipboard ----------

function htmlToText(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent.replace(/\s+/g, " ").trim();
}

// Builds both a plain-text and an HTML rendering of the same verse range/options,
// so the clipboard write below can offer Word (HTML) and Notepad (plain text) each
// the flavor they actually use. Base verse text and word-level Greek/Hebrew are read
// straight from window.BIBLE_TEXT/INTERLINEAR rather than the DOM, so this also works
// for a verse range wider than what's currently on screen or with the interlinear
// toggle off in Settings.
function buildCopyPayload(fromVerse, toVerse, opts) {
  const meta = bookMeta(state.book);
  const chapterLabel = fromVerse === toVerse
    ? `${meta.n} ${state.chapter}:${fromVerse}`
    : `${meta.n} ${state.chapter}:${fromVerse}-${toVerse}`;

  let plain = `${chapterLabel}\n\n`;
  let html = `<h2>${escapeHtml(chapterLabel)}</h2>`;

  const verseNums = [...document.querySelectorAll("#verseSelect option")]
    .map((o) => Number(o.value))
    .filter((vn) => vn >= fromVerse && vn <= toVerse)
    .sort((a, b) => a - b);

  const interlinearData = ((window.INTERLINEAR || {})[state.book] || {})[String(state.chapter)] || {};
  const activeCIds = activeCommentaryIds();

  for (const vn of verseNums) {
    const verseEl = document.querySelector(`.verse[data-book="${state.book}"][data-chapter="${state.chapter}"][data-verse="${vn}"]`);
    const baseText = verseEl
      ? [...verseEl.querySelectorAll(".verse-versions .verse-text")].map((el) => el.textContent.trim()).filter(Boolean).join(" ")
      : "";
    plain += `${vn} ${baseText}\n`;
    html += `<p><strong>${vn}</strong> ${escapeHtml(baseText)}</p>`;

    if (opts.originalLanguage) {
      const words = interlinearData[vn];
      if (words && words.length) {
        const orig = words.map((w) => w.t).join(" ");
        const translit = words.map((w) => w.tr).join(" ");
        const gloss = words.map((w) => w.en).join(" ");
        plain += `   ${orig}\n   (${translit})\n   ${gloss}\n`;
        html += `<p style="margin-left:1.5em;color:#555;">${escapeHtml(orig)}<br><em>${escapeHtml(translit)}</em><br>${escapeHtml(gloss)}</p>`;
      }
    }

    if (opts.commentary) {
      for (const id of activeCIds) {
        const entryHtml = (((window.COMMENTARY[id] || {})[state.book] || {})[String(state.chapter)] || {})[vn];
        if (entryHtml) {
          plain += `   [${COMMENTARY_SOURCES[id]}] ${htmlToText(entryHtml)}\n`;
          html += `<p style="margin-left:1.5em;"><em>${escapeHtml(COMMENTARY_SOURCES[id])}:</em> ${entryHtml}</p>`;
        }
      }
    }

    if (opts.notes) {
      for (const note of Notes.forRef(state.book, state.chapter, vn)) {
        plain += `   [Your note] ${note.text}\n`;
        html += `<p style="margin-left:1.5em;"><em>Your note:</em> ${escapeHtml(note.text)}</p>`;
      }
    }
    plain += "\n";
  }

  if (opts.maps) {
    const mapId = window.BOOK_MAP_ID && window.BOOK_MAP_ID[state.book];
    const map = mapId && window.BIBLE_MAPS.find((m) => m.id === mapId);
    if (map) {
      plain += `\nMap: ${map.title} (${map.era})\n${map.description}\n` +
        (map.thumbUrl ? `Image: ${map.thumbUrl}\n` : "") +
        `Source: ${map.sourceUrl}\n`;
      html += `<h3>Map: ${escapeHtml(map.title)}</h3>` +
        (map.thumbUrl ? `<p><img src="${map.thumbUrl}" alt="${escapeHtml(map.title)}" style="max-width:100%;height:auto;"></p>` : "") +
        `<p>${escapeHtml(map.description)}</p>` +
        `<p><a href="${map.sourceUrl}">${escapeHtml(map.sourceUrl)}</a></p>`;
    }
  }

  if (opts.discoveries) {
    const seen = new Set();
    const found = [];
    for (const vn of verseNums) {
      const idx = findArtifactIndex(state.book, state.chapter, vn);
      if (idx !== -1 && !seen.has(idx)) {
        seen.add(idx);
        found.push(window.ARTIFACTS[idx]);
      }
    }
    if (found.length) {
      plain += `\nBiblical Discoveries:\n`;
      html += `<h3>Biblical Discoveries</h3>`;
      for (const a of found) {
        const link = a.sourceUrl || (a.wiki ? "https://en.wikipedia.org/wiki/" + encodeURIComponent(a.wiki.replace(/ /g, "_")) : "");
        plain += `- ${a.title}: ${a.description}\n` +
          (a.photo ? `  Image: ${a.photo}\n` : "") +
          (link ? `  Source: ${link}\n` : "");
        html += `<div>` +
          (a.photo ? `<p><img src="${a.photo}" alt="${escapeHtml(a.title)}" style="max-width:100%;height:auto;"></p>` : "") +
          `<p><strong>${escapeHtml(a.title)}</strong>: ${escapeHtml(a.description)}</p>` +
          (link ? `<p><a href="${link}">${escapeHtml(link)}</a></p>` : "") +
          `</div>`;
      }
    }
  }

  return { plain: plain.trim(), html };
}

// Writes both flavors so the paste target picks whichever it understands: Word (and
// other rich-text apps) take the HTML flavor with formatting intact, while Notepad
// (and anything else that only reads plain text) falls back to the text/plain flavor
// automatically -- neither app needs special-casing here.
async function copyToClipboard(html, plain) {
  if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
    try {
      const item = new ClipboardItem({
        "text/plain": new Blob([plain], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      });
      await navigator.clipboard.write([item]);
      return true;
    } catch (e) {
      // Fall through to the plain-text-only path below (older/locked-down browsers).
    }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(plain);
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

function showCopyModal() {
  const verseNums = [...document.querySelectorAll("#verseSelect option")].map((o) => Number(o.value)).sort((a, b) => a - b);
  const options = verseNums.map((vn) => `<option value="${vn}">${vn}</option>`).join("");
  const fromSel = document.getElementById("copyFromVerse");
  const toSel = document.getElementById("copyToVerse");
  fromSel.innerHTML = options;
  toSel.innerHTML = options;
  fromSel.value = verseNums[0];
  toSel.value = verseNums[verseNums.length - 1];
  document.getElementById("copyStatus").textContent = "";
  openScreen(document.getElementById("copyModal"));
}

function initCopyControls() {
  document.getElementById("copyIconBtn").addEventListener("click", showCopyModal);

  const fromSel = document.getElementById("copyFromVerse");
  const toSel = document.getElementById("copyToVerse");
  fromSel.addEventListener("change", () => {
    if (Number(fromSel.value) > Number(toSel.value)) toSel.value = fromSel.value;
  });
  toSel.addEventListener("change", () => {
    if (Number(toSel.value) < Number(fromSel.value)) fromSel.value = toSel.value;
  });

  document.getElementById("copyToClipboardBtn").addEventListener("click", async () => {
    const btn = document.getElementById("copyToClipboardBtn");
    const status = document.getElementById("copyStatus");
    const opts = {
      originalLanguage: document.getElementById("copyOriginalLanguage").checked,
      commentary: document.getElementById("copyCommentary").checked,
      maps: document.getElementById("copyMaps").checked,
      discoveries: document.getElementById("copyDiscoveries").checked,
      notes: document.getElementById("copyNotes").checked,
    };

    btn.disabled = true;
    status.textContent = "Preparing…";
    try {
      if (opts.originalLanguage && window.INTERLINEAR_AVAILABLE.has(state.book)) {
        await Loader.interlinear(state.book, { minimal: true });
      }
      if (opts.commentary) {
        await Promise.all(activeCommentaryIds().map((id) => Loader.commentary(id, state.book)));
      }
    } catch (e) {
      status.textContent = e instanceof WifiRequiredError
        ? "Blocked: \"Wi-Fi only\" is on and this device isn't on Wi-Fi."
        : `Couldn't load some content: ${e.message}`;
      btn.disabled = false;
      return;
    }

    const from = Number(document.getElementById("copyFromVerse").value);
    const to = Number(document.getElementById("copyToVerse").value);
    const { plain, html } = buildCopyPayload(from, to, opts);
    const ok = await copyToClipboard(html, plain);
    status.textContent = ok ? "Copied!" : "Couldn't access the clipboard in this browser.";
    btn.disabled = false;
  });
}

// ---------- Toast (non-blocking feedback) ----------
// Used for routine backup save/restore/install events -- unlike alert(), it
// never freezes the page waiting for a tap, and pointer-events:none means it
// can't intercept a touch even while visible.
let toastTimer = null;
function showToast(message, tone) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = "toast show" + (tone ? " toast-" + tone : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove("show"); }, 3200);
}

// ---------- Generic info modal (install instructions, "remove the icon" steps) ----------
function openInfoModal(title, bodyHtml) {
  document.getElementById("infoModalTitle").textContent = title;
  document.getElementById("infoModalBody").innerHTML = bodyHtml;
  openScreen(document.getElementById("infoModal"));
}

// ---------- Update checking ----------
// True while focus is in a text field/textarea -- checkForUpdate() defers its
// reload rather than yanking a mid-edit note or search box out from under
// the user; it just tries again on the next check instead.
function isUserTyping() {
  const el = document.activeElement;
  if (!el) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") return /^(text|search|number)$/i.test(el.type || "text");
  return false;
}
// Remembered across sessions (not just in-memory) so the very first check of a
// new session can catch "what got served just now is already behind what's on
// the server" instead of only catching drift that happens later.
const DEPLOYED_TAG_KEY = "bibleAppDeployedTag";
let deployedVersionTag = (function () { try { return localStorage.getItem(DEPLOYED_TAG_KEY); } catch (e) { return null; } })();
// Returns a status string so callers wanting feedback (pull-to-refresh) can
// react -- the interval/visibilitychange callers below just ignore it.
async function checkForUpdate() {
  try {
    const res = await fetch(location.pathname + "?_=" + Date.now(), { cache: "no-store", method: "HEAD" });
    const tag = res.headers.get("etag") || res.headers.get("last-modified");
    if (!tag) return "unknown";
    if (deployedVersionTag === null) {
      deployedVersionTag = tag;
      try { localStorage.setItem(DEPLOYED_TAG_KEY, tag); } catch (e) {}
      return "up-to-date";
    }
    if (tag === deployedVersionTag) return "up-to-date";
    if (isUserTyping()) return "deferred"; // try again next check instead of interrupting active input
    deployedVersionTag = tag;
    try { localStorage.setItem(DEPLOYED_TAG_KEY, tag); } catch (e) {}
    location.reload();
    return "reloading";
  } catch (e) { return "offline"; } // offline or blocked -- silently skip, next successful check catches up
}
checkForUpdate();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkForUpdate();
});
warmDefaultChapterCache();
warmOfflineBibleIfNeeded();

// ---------- Storage persistence ----------
// Best-effort ask not to auto-evict this site's storage under low-disk
// pressure. There's no way to test real eviction behavior on someone else's
// actual phone from here, so a denial (with a rough usage/quota estimate) is
// logged to the same Error code the user can already copy out of Settings --
// visible later if data loss is ever reported, rather than silently swallowed.
(async function checkStoragePersistence() {
  if (!(navigator.storage && navigator.storage.persist)) return;
  try {
    let persisted = await (navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false));
    if (!persisted) persisted = await navigator.storage.persist();
    if (!persisted) {
      let detail = "";
      try {
        const est = await navigator.storage.estimate();
        if (est && est.quota) detail = ` (using ~${Math.round((est.usage || 0) / 1048576)}MB of ~${Math.round(est.quota / 1048576)}MB available to this browser)`;
      } catch (e) {}
      ErrorLog.record(`Storage is NOT persisted${detail} -- this browser may silently evict this app's notes/journal under storage pressure, even without you clearing history. Try Add to Home Screen / Install for the strongest protection.`, "storage-persist");
    }
  } catch (e) { /* best effort */ }
})();

// ---------- Install / Home Screen ----------

// True once actually running as the installed/home-screen app rather than a
// regular browser tab -- display-mode covers Chrome/Edge/Android,
// navigator.standalone is Safari's own (non-standard, iOS-only) equivalent.
function isStandaloneApp() {
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
}
// What the Install pill actually checks -- not just isStandaloneApp(), since a
// regular tab that just walked through a manual/native install doesn't itself
// flip to display-mode:standalone until the user actually relaunches from the
// Home Screen icon (see the installPromptAccepted default in withDefault()).
function isInstalled() {
  return isStandaloneApp() || !!state.settings.installPromptAccepted;
}
// Shown only inside Settings' modal-header (same row as the "Settings"
// heading) -- that's the one place people go to confirm install state, so it
// stays visible even once installed, switching to an inert "Installed" status
// line instead of disappearing. Not a real <button disabled> once installed --
// it stays enabled (a plain tap just no-ops, see wireInstallBtn) so it can
// still receive the long-press that opens Re-Install/Uninstall.
function installPillHtml(id) {
  const installed = isInstalled();
  return `<button class="topbar-install-btn${installed ? " installed" : ""}" id="${id}">${installed ? "Installed" : "Install"}</button>`;
}
// Re-renders the Install pill and rewires its handlers -- called on load and
// after anything that can change isInstalled()'s answer (beforeinstallprompt
// arriving, appinstalled firing, an accepted manual/native prompt, Re-Install,
// Uninstall).
function renderInstallUI() {
  const settingsSlot = document.getElementById("settingsInstallSlot");
  if (settingsSlot) {
    settingsSlot.innerHTML = installPillHtml("settingsInstallBtn");
    wireInstallBtn("settingsInstallBtn");
  }
}
function wireInstallBtn(id) {
  const btn = document.getElementById(id);
  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (isInstalled()) return; // no-op tap once installed -- long-press is the only action left, see below
    if (deferredInstallPrompt) {
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null; // one-shot -- the browser invalidates it after a single use either way
      promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") {
        state.settings.installPromptAccepted = true;
        saveSettings();
        showToast("Installed — look for it on your Home Screen.", "good");
      }
      renderInstallUI();
    } else {
      // No captured browser-native prompt -- either this browser doesn't support
      // triggering install from a page at all (iOS Safari, plain Firefox), or
      // Chrome/Edge just hasn't fired beforeinstallprompt yet. The manual path
      // always works; there's no signal a page can detect for "the user actually
      // finished the manual steps", so this can't flip to Installed on its own --
      // only relaunching from the real Home Screen icon can do that.
      openInfoModal("Install on Home Screen", `
        <strong>iPhone/iPad (Safari):</strong> tap the Share icon (square with an arrow), then "Add to Home Screen".<br><br>
        <strong>Android (Chrome), if this button didn't just install it directly:</strong> tap the &#8942; menu in the top right, then "Add to Home Screen" or "Install app".<br><br>
        <strong>Desktop Chrome/Edge:</strong> look for an install icon at the right edge of the address bar, or use the &#8942; menu.
      `);
    }
  });

  // Holding the "Installed" pill opens Re-Install/Uninstall -- pointerdown/up
  // timing (not the "contextmenu" event) so it behaves the same on a mouse and
  // on touch, and so a normal tap that starts turning into a scroll
  // (pointermove past MOVE_TOLERANCE) cancels cleanly instead of firing.
  let holdTimer = null, holdStart = null;
  const HOLD_MS = 550, MOVE_TOLERANCE = 10;
  const cancelHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } holdStart = null; };
  btn.addEventListener("pointerdown", (e) => {
    if (!isInstalled()) return;
    holdStart = [e.clientX, e.clientY];
    holdTimer = setTimeout(() => { holdTimer = null; openScreen(document.getElementById("installActionsModal")); }, HOLD_MS);
  });
  btn.addEventListener("pointermove", (e) => {
    if (!holdTimer || !holdStart) return;
    if (Math.hypot(e.clientX - holdStart[0], e.clientY - holdStart[1]) > MOVE_TOLERANCE) cancelHold();
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((evt) => btn.addEventListener(evt, cancelHold));
  btn.addEventListener("contextmenu", (e) => { if (isInstalled()) e.preventDefault(); }); // swallow the native long-press menu
}
// Chrome/Edge/Android fire this instead of installing immediately, handing over
// an event whose .prompt() shows the native install UI on demand -- captured up
// front and held until the Install pill is actually tapped. preventDefault()
// stops the browser's own separate install mini-infobar so the pill is the one
// path in, avoiding two different install prompts fighting for attention.
let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  renderInstallUI();
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  state.settings.installPromptAccepted = true;
  saveSettings();
  renderInstallUI();
});
// Fires immediately, no confirmation -- clears every cache layer this page can
// reach (the service worker's own registration plus the Cache Storage entries
// it's allowed to make, see service-worker.js) then forces a cache-busted
// reload right now, same intent as checkForUpdate()'s no-store check just
// forced instead of waiting for the next visibilitychange. Never touches
// localStorage (notes/journal/settings are untouched). This can't make the OS
// re-fetch the *icon* for an already-placed Home Screen/taskbar shortcut --
// that image is only ever captured once, at install time -- but the code it
// launches next time is guaranteed fresh either way (see the toast this shows
// after the reload completes, via the pendingReinstallToast flag below).
function reinstallApp() {
  if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  }
  if (window.caches && caches.keys) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
  // Wipes every cached byte above, including whatever Add On Features were
  // installed -- clear their checkboxes' backing flags too so Settings doesn't
  // keep claiming data is present that a fresh load will no longer find cached.
  for (const addon of ADDONS) {
    addon.setOn(false);
    state.settings.addonConfirmed[addon.id] = false;
  }
  saveSettings();
  try { localStorage.setItem("bibleAppPendingReinstallToast", "1"); } catch (e) {}
  location.href = location.pathname + "?_reinstall=" + Date.now();
}
// No web API lets a page force-remove its own Home Screen/taskbar shortcut --
// that's an OS-level action only the user can take (steps shown below) -- so
// this only clears this app's own belief that it's installed here, which flips
// the Install pill back to "Install". If this is running *as* the installed
// app right now, isInstalled() still reports true afterward (isStandaloneApp()
// alone already covers that) until the shortcut is actually removed and the
// site reopened in a normal tab -- which is correct, not a bug.
function uninstallApp() {
  if (!confirm("Uninstall on this device? The Home Screen/taskbar icon itself has to be removed separately (steps follow) — this just clears the \"Installed\" status here. Continue?")) return;
  state.settings.installPromptAccepted = false;
  saveSettings();
  let dataDeleted = false;
  if (confirm("Also delete all notes, journal entries, and settings on this device? This cannot be undone.")) {
    BACKUP_KEYS.forEach((k) => localStorage.removeItem(k));
    dataDeleted = true;
  }
  openInfoModal("Remove the Home Screen Icon", `
    <strong>iPhone/iPad:</strong> touch and hold the app icon, then tap "Remove App".<br><br>
    <strong>Android:</strong> touch and hold the app icon, then tap "Uninstall".<br><br>
    <strong>Desktop Chrome/Edge:</strong> right-click the app icon (Start Menu/Dock/taskbar), then choose "Uninstall".<br><br>
    ${dataDeleted ? "Your data on this device has been deleted." : "Your notes, journal, and settings have been kept — reinstalling will pick up right where you left off."}
  `);
  showToast(dataDeleted ? "Uninstalled and data deleted." : "Uninstalled — data kept.", "good");
  if (dataDeleted) {
    // A full reload is simplest/safest here -- Notes/Journal read straight from
    // localStorage on every call rather than being cached in `state`, but the
    // chapter already on screen has note icons baked into its last render.
    setTimeout(() => location.reload(), 1200);
  } else {
    renderInstallUI();
  }
}

// ---------- Backup / Restore ----------
// Manual-only, gated entirely behind the explicit "Back up now" tap in
// Settings -- never called automatically from saveSettings()/Notes/Journal or
// on backgrounding. An earlier version of this pattern (built for another app
// in this same family) called an equivalent export on every save, which
// silently piled up dozens of downloaded files plus an unsuppressable OS
// "Download complete" notification every single time -- exactly what this is
// avoiding.
//
// Never renamed: these are the exact keys Notes/Journal/ErrorLog/app.js
// already use for their own normal localStorage persistence (see js/notes.js,
// js/journal.js, js/errorlog.js) -- a backup is just a portable snapshot of
// them, not a second parallel storage format.
const BACKUP_KEYS = ["bibleAppSettings", "bibleAppLastLocation", "bibleAppNotes", "bibleAppJournal", "bibleAppErrorLog"];

// Minimal IndexedDB wrapper for the one thing it's used for: persisting a
// FileSystemFileHandle across page loads so the single-file-overwrite path
// below can reuse the same on-disk file without re-prompting every time (a
// handle isn't JSON-serializable, so it can't live in localStorage).
const BACKUP_HANDLE_DB = "bible-study-fs", BACKUP_HANDLE_STORE = "handles", BACKUP_HANDLE_KEY = "backupFile";
function openHandleDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BACKUP_HANDLE_DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(BACKUP_HANDLE_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function loadSavedBackupHandle() {
  try {
    const db = await openHandleDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(BACKUP_HANDLE_STORE, "readonly").objectStore(BACKUP_HANDLE_STORE).get(BACKUP_HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) { return null; }
}
async function saveBackupHandle(handle) {
  try {
    const db = await openHandleDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(BACKUP_HANDLE_STORE, "readwrite");
      tx.objectStore(BACKUP_HANDLE_STORE).put(handle, BACKUP_HANDLE_KEY);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
  } catch (e) { /* best-effort */ }
}
// On browsers with the File System Access API (desktop Chrome/Edge -- absent
// on iOS Safari and most Android Chrome, kept here as progressive enhancement)
// this lets "Back up now" overwrite the SAME on-disk file every time instead
// of creating a new timestamped one every tap. A saved, already-granted handle
// is reused silently on every call after the first.
async function getWritableBackupHandle() {
  if (!window.showSaveFilePicker) return null;
  try {
    let handle = await loadSavedBackupHandle();
    if (handle) {
      const perm = await handle.queryPermission({ mode: "readwrite" });
      if (perm === "granted") return handle;
      const req = await handle.requestPermission({ mode: "readwrite" });
      if (req === "granted") return handle;
      return null; // permission denied
    }
    handle = await window.showSaveFilePicker({
      suggestedName: "bible-study-data.json",
      types: [{ description: "Bible Study App backup", accept: { "application/json": [".json"] } }],
    });
    await saveBackupHandle(handle);
    return handle;
  } catch (e) {
    return null; // user cancelled the picker, or any other failure -- caller falls back
  }
}
// Pulls the current value of every BACKUP_KEYS entry into one portable,
// human-readable JSON object -- parsed back out of localStorage's raw strings
// rather than copied verbatim, so the exported file reads as real nested JSON.
function collectBackupData() {
  const data = {};
  for (const key of BACKUP_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw != null) {
      try { data[key] = JSON.parse(raw); } catch (e) { data[key] = raw; }
    }
  }
  return { _app: "BibleStudyApp", _backupVersion: 1, exportedAt: new Date().toISOString(), data };
}
async function backupNow() {
  const json = JSON.stringify(collectBackupData(), null, 2);
  const handle = await getWritableBackupHandle();
  if (handle) {
    try {
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      showToast("Backup saved.", "good");
      return;
    } catch (e) { /* fall through to the timestamped-download fallback below */ }
  }
  try {
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    // Timestamped, not a fixed name -- a fixed name hits a hard "file already
    // exists" failure on-device rather than a silent auto-rename, on the
    // browsers that land here (no File System Access API, or no granted handle).
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `bible-study-backup-${stamp}.json`;
    a.click();
    showToast("Backup saved to your Downloads.", "good");
  } catch (e) {
    showToast("Could not save backup: " + e.message, "critical");
  }
}
// Picks the newest backup out of one or more selected files, so restoring
// never requires the user to eyeball filenames/dates themselves. Matches this
// app's own timestamped filename first (sorts correctly as a string, no file
// reads needed); anything that doesn't match (e.g. a renamed file) falls back
// to the File object's own lastModified.
function pickLatestBackupFile(files) {
  const list = Array.from(files || []).filter((f) => /\.json$/i.test(f.name));
  if (!list.length) return null;
  const stampOf = (f) => {
    const m = f.name.match(/bible-study-backup-(.+)\.json$/i);
    return m ? m[1] : null;
  };
  list.sort((a, b) => {
    const sa = stampOf(a), sb = stampOf(b);
    if (sa && sb) return sa < sb ? 1 : sa > sb ? -1 : 0;
    if (sa && !sb) return -1;
    if (sb && !sa) return 1;
    return b.lastModified - a.lastModified;
  });
  return list[0];
}
async function importDataFromFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || parsed._app !== "BibleStudyApp" || !parsed.data || typeof parsed.data !== "object") {
      throw new Error("This file does not look like a Bible Study App backup.");
    }
    if (!confirm("This will replace your notes, journal entries, and settings on this device with the contents of this backup. Continue?")) return;
    for (const key of BACKUP_KEYS) {
      if (parsed.data[key] !== undefined) localStorage.setItem(key, JSON.stringify(parsed.data[key]));
    }
    // A reload is the simplest safe way to pick up restored settings through
    // this app's own normal startup path (withDefault() merges onto the
    // current defaults, so a backup from an older version with fewer fields
    // doesn't leave newly-added settings fields undefined) rather than trying
    // to hand-splice a live in-memory `state` object here.
    showToast("Backup restored — reloading…", "good");
    setTimeout(() => location.reload(), 600);
  } catch (e) {
    showToast("Could not restore that file: " + e.message, "critical");
  }
}
function importLatestBackupFromFiles(files) {
  const latest = pickLatestBackupFile(files);
  if (!latest) {
    if (files && files.length) showToast("No .json backup file found in what you selected.", "critical");
    return;
  }
  importDataFromFile(latest);
}
// On browsers that support it, jumps the native picker straight into the
// Downloads folder and allows multi-select in one go. iOS Safari and
// older/other Android browsers don't expose this API, so they fall back to
// the plain <input type=file multiple> picker passed in.
async function openBackupRestorePicker(fallbackInputEl) {
  if (window.showOpenFilePicker) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        startIn: "downloads",
        types: [{ description: "Bible Study App backup", accept: { "application/json": [".json"] } }],
      });
      const files = await Promise.all(handles.map((h) => h.getFile()));
      importLatestBackupFromFiles(files);
      return;
    } catch (e) {
      if (e.name === "AbortError") return; // user backed out of the picker -- don't chain into a second one
    }
  }
  fallbackInputEl.click();
}

function initInstallAndBackupControls() {
  document.getElementById("appVersionLabel").textContent = APP_VERSION;

  document.getElementById("backupNowBtn").addEventListener("click", backupNow);
  const restoreInput = document.getElementById("restoreBackupInput");
  document.getElementById("restoreBackupBtn").addEventListener("click", () => openBackupRestorePicker(restoreInput));
  restoreInput.addEventListener("change", () => {
    importLatestBackupFromFiles(restoreInput.files);
    restoreInput.value = ""; // lets picking the exact same file again re-fire "change"
  });

  document.getElementById("reinstallBtn").addEventListener("click", () => {
    reinstallApp(); // navigates away immediately -- no need to fuss with closing the dialog/history first
  });
  document.getElementById("uninstallBtn").addEventListener("click", () => {
    closeScreen(document.getElementById("installActionsModal"));
    uninstallApp();
  });

  // Shown once, right after a Re-Install-triggered reload -- see reinstallApp().
  try {
    if (localStorage.getItem("bibleAppPendingReinstallToast")) {
      localStorage.removeItem("bibleAppPendingReinstallToast");
      showToast("Reinstalled — running the latest code. (The Home Screen icon image itself only updates if you remove and re-add the shortcut.)", "good");
    }
  } catch (e) {}

  renderInstallUI();
}

/* =========================================================
   PULL-TO-REFRESH -- forces an update check on demand instead of waiting for
   backgrounding/foregrounding to trigger one. Only activates when the touch
   starts at the top of the page's normal scroll (this app has one scrolling
   document -- no per-screen internal scroll container) and no dialog is open,
   so it doesn't fight normal scrolling or a modal's own touch handling.
   ========================================================= */
(function () {
  const indicator = document.getElementById("pullRefresh");
  const THRESHOLD = 70;
  let startY = null, dragging = false, ready = false;
  document.addEventListener("touchstart", (e) => {
    if (window.scrollY === 0 && !document.querySelector("dialog[open]")) {
      startY = e.touches[0].clientY;
      dragging = true; ready = false;
      indicator.classList.remove("hidden");
      indicator.classList.add("dragging");
    }
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!dragging || startY === null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0 && window.scrollY === 0) {
      const dist = Math.min(dy, THRESHOLD * 1.6);
      ready = dy > THRESHOLD;
      indicator.style.transform = `translate(-50%, ${dist - 60}px)`;
      indicator.classList.toggle("ready", ready);
    }
  }, { passive: true });
  document.addEventListener("touchend", async () => {
    if (!dragging) return;
    dragging = false;
    indicator.classList.remove("dragging");
    if (!ready) {
      indicator.classList.remove("ready");
      indicator.style.transform = "";
      indicator.classList.add("hidden");
      startY = null;
      return;
    }
    indicator.classList.remove("ready");
    indicator.classList.add("spinning");
    indicator.style.transform = "translate(-50%, 10px)";
    const status = await checkForUpdate();
    if (status !== "reloading") { // otherwise the page is already navigating away
      indicator.classList.remove("spinning");
      indicator.style.transform = "";
      indicator.classList.add("hidden");
    }
    startY = null;
  });
})();

// ---------- Wiring ----------

// Checkbox settings that just flip a boolean and re-render the chapter.
function initUI() {
  populateBookSelect();
  populateChapterSelect();
  renderVersionToggles();
  populateQuickVersionSelect();

  document.getElementById("bookSelect").addEventListener("change", (e) => navigateTo(e.target.value, 1));
  document.getElementById("chapterSelect").addEventListener("change", (e) => navigateTo(state.book, Number(e.target.value)));
  document.getElementById("verseSelect").addEventListener("change", (e) => scrollToVerse(e.target.value));

  document.getElementById("quickVersionSelect").addEventListener("change", (e) => {
    for (const id of Object.keys(state.settings.versions)) state.settings.versions[id] = false;
    state.settings.versions[e.target.value] = true;
    saveSettings();
    renderVersionToggles();
    syncYouVersionToggleUI();
    renderChapter();
  });

  document.getElementById("searchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") runSearch(e.target.value);
  });
  document.getElementById("searchBtn").addEventListener("click", () => {
    runSearch(document.getElementById("searchInput").value);
  });
  document.getElementById("searchIconBtn").addEventListener("click", () => {
    openScreen(document.getElementById("searchModal"), { nonModal: true });
    document.getElementById("searchInput").focus();
  });
  document.getElementById("mapsIconBtn").addEventListener("click", () => {
    renderMapsGallery();
    openScreen(document.getElementById("mapsModal"));
  });
  document.getElementById("notepadIconBtn").addEventListener("click", () => {
    openNotepad();
  });
  document.getElementById("coolIconBtn").addEventListener("click", () => {
    showTodaysArtifact();
  });
  // Tapping the title shows a feature summary in the reusable info popup,
  // dismissible via its own close button like every other info modal.
  const titleSubBtn = document.getElementById("titleSubBtn");
  titleSubBtn.addEventListener("click", () => {
    openInfoModal("Your Bible Study App", `<ul>
      <li>Hebrew/Greek interlinear word study with lexicon definitions</li>
      <li>Multiple Bible versions, verse by verse</li>
      <li>Maps of the Biblical world</li>
      <li>Biblical archaeology discoveries</li>
      <li>Devotional reading plans</li>
      <li>Private journal and note templates</li>
      <li>Full-text search and copy to clipboard</li>
    </ul>`);
  });

  document.getElementById("settingsBtn").addEventListener("click", () => {
    refreshErrorLogText();
    openScreen(document.getElementById("settingsModal"));
  });

  initYouVersionSettings();

  const deleteConfirmToggle = document.getElementById("deleteConfirmationsToggle");
  deleteConfirmToggle.checked = state.settings.deleteConfirmations;
  deleteConfirmToggle.addEventListener("change", () => {
    state.settings.deleteConfirmations = deleteConfirmToggle.checked;
    saveSettings();
  });

  const wifiToggle = document.getElementById("wifiOnlyToggle");
  wifiToggle.checked = state.settings.wifiOnly;
  wifiToggle.addEventListener("change", () => {
    state.settings.wifiOnly = wifiToggle.checked;
    saveSettings();
  });
  const wifiNote = document.getElementById("wifiDetectNote");
  wifiNote.textContent = NetworkGuard.canDetectType()
    ? ""
    : "Note: this browser can't report Wi-Fi vs. cellular, so downloads won't be blocked even with this on.";

  initAddonControls();
  initCopyControls();
  initErrorLogControls();
  initInstallAndBackupControls();

  document.querySelectorAll("dialog .close-btn").forEach((btn) => {
    btn.addEventListener("click", () => closeScreen(btn.closest("dialog")));
  });

  // The very first navigation on load establishes the baseline history entry
  // via replaceState (inside navigateTo, opts.replace) rather than pushState --
  // otherwise back from the first real screen would land on a stale/incomplete
  // entry instead of exiting the app as expected.
  navigateTo(state.book, state.chapter, { replace: true });
}

document.addEventListener("DOMContentLoaded", initUI);
