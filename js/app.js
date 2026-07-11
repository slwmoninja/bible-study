const LOCAL_VERSION_IDS = ["ASV", "KJV", "YLT"];
const YOUVERSION_ID = "YV"; // the app's primary/default version -- see js/youversion.js
const COMMENTARY_SOURCES = {
  henry: "Matthew Henry's Commentary (1710)",
  jfb: "Jamieson-Fausset-Brown (1871)",
};

const state = {
  book: "Jhn",
  chapter: 1,
  settings: JSON.parse(localStorage.getItem("bibleAppSettings") || "{}"),
};

function withDefault(key, value) {
  if (state.settings[key] === undefined) state.settings[key] = value;
}
withDefault("wifiOnly", true); // only fetch data on Wi-Fi by default
withDefault("onlineEnabled", false); // master switch revealing online-version toggles
withDefault("versions", {});
withDefault("youversionApiKey", "");
withDefault("youversionBibleId", "111"); // NIV
withDefault("showGreek", true);
withDefault("showHebrew", true);
withDefault("showStudyAids", true);
withDefault("showTranslit", true);
withDefault("showWordGloss", true);
withDefault("showArchaeology", true);
withDefault("showNotes", true);
withDefault("showBookArt", true);
withDefault("commentaries", {});

// YouVersion is the primary/default version (inserted first so it renders
// first when shown alongside others); ASV is also on by default as a
// no-API-key-required fallback so the reader is never blank before the user
// adds a YouVersion API key. Every other local version starts off, so the
// user opts in ala carte rather than being shown everything at once.
if (state.settings.versions[YOUVERSION_ID] === undefined) state.settings.versions[YOUVERSION_ID] = true;
for (const id of LOCAL_VERSION_IDS) {
  if (state.settings.versions[id] === undefined) state.settings.versions[id] = id === "ASV";
}
// Matthew Henry on by default; JFB starts off, same ala-carte spirit as versions.
for (const id of Object.keys(COMMENTARY_SOURCES)) {
  if (state.settings.commentaries[id] === undefined) state.settings.commentaries[id] = id === "henry";
}

function saveSettings() {
  localStorage.setItem("bibleAppSettings", JSON.stringify(state.settings));
}

function activeVersionIds() {
  const active = Object.entries(state.settings.versions).filter(([, on]) => on).map(([id]) => id);
  return active.length ? active : ["ASV"]; // never show a completely empty reader
}

function isOnlineVersion(id) {
  return !LOCAL_VERSION_IDS.includes(id);
}

// "111" is the well-known catalog ID for the NIV, the default Bible ID; any
// other ID just shows the generic provider name since we don't have a
// name lookup for YouVersion's full catalog.
function versionTagLabel(id) {
  if (id === YOUVERSION_ID) {
    return (state.settings.youversionBibleId || "111") === "111" ? "NIV" : "YouVersion";
  }
  return id.toUpperCase();
}

// Biblica requires this exact copyright line wherever NIV text is displayed
// (confirmed by the user against YouVersion's own license terms). If the
// Bible ID is changed away from the NIV default, that translation's own
// copyright holder almost certainly has a different required notice we
// don't have on file -- show a generic reminder instead of guessing text
// that could be wrong for a translation we don't know.
function youVersionAttributionText() {
  const bibleId = state.settings.youversionBibleId || "111";
  if (bibleId === "111") {
    return "Scripture quotations taken from The Holy Bible, New International Version® NIV® Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.™ Used by permission. All rights reserved worldwide.";
  }
  return "This translation is provided via the YouVersion Platform API. Confirm and add its required copyright attribution (Settings → Bible versions).";
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
      state.settings.versions[cb.dataset.id] = cb.checked;
      saveSettings();
      syncQuickVersionSelect();
      renderChapter();
    });
  });
}

// Set by renderChapter() after each attempt to load YouVersion text, so the
// Settings UI knows whether the current key (if any) is actually working.
let youVersionHasError = false;

// Per-version fetch errors from the most recent renderChapter() -- lets the
// toolbar quick-select dropdown default to whichever active version actually
// rendered (e.g. ASV) rather than always the first one turned on (e.g. NIV
// before an API key is entered, which fails silently into the ASV fallback).
let lastRenderErrors = {};

// Keeps the Settings checkbox in sync when the version was toggled some
// other way (e.g. picked from the toolbar quick-select dropdown instead),
// and keeps the key/Bible ID fields tucked away unless they're needed --
// shown only while the version is on and there's no working key yet, so
// Settings stays a single "NIV" checkbox once it's set up and working.
function syncYouVersionToggleUI() {
  const toggle = document.getElementById("youversionToggle");
  const fields = document.getElementById("youversionFields");
  toggle.checked = !!state.settings.versions[YOUVERSION_ID];
  const needsAttention = !state.settings.youversionApiKey || youVersionHasError;
  fields.classList.toggle("fields-hidden", !(toggle.checked && needsAttention));
}

function initYouVersionSettings() {
  const toggle = document.getElementById("youversionToggle");
  const keyInput = document.getElementById("youversionApiKeyInput");
  const bibleIdInput = document.getElementById("youversionBibleIdInput");

  keyInput.value = state.settings.youversionApiKey;
  bibleIdInput.value = state.settings.youversionBibleId;
  syncYouVersionToggleUI();

  toggle.addEventListener("change", () => {
    state.settings.versions[YOUVERSION_ID] = toggle.checked;
    saveSettings();
    syncYouVersionToggleUI();
    syncQuickVersionSelect();
    renderChapter();
  });
  keyInput.addEventListener("change", () => {
    state.settings.youversionApiKey = keyInput.value.trim();
    saveSettings();
    renderChapter();
  });
  bibleIdInput.addEventListener("change", () => {
    state.settings.youversionBibleId = bibleIdInput.value.trim() || "111";
    bibleIdInput.value = state.settings.youversionBibleId;
    saveSettings();
    populateQuickVersionSelect(); // dropdown label (e.g. "NIV") depends on the bible id
    renderChapter();
  });
}

function versionToggleHtml(id, label) {
  const checked = state.settings.versions[id] ? "checked" : "";
  return `<label class="version-toggle">
      <input type="checkbox" data-id="${id}" ${checked}> ${escapeHtml(label)}
    </label>`;
}

function renderCommentaryToggles() {
  const el = document.getElementById("commentaryToggles");
  el.innerHTML = Object.entries(COMMENTARY_SOURCES).map(([id, label]) => {
    const checked = state.settings.commentaries[id] ? "checked" : "";
    return `<label class="version-toggle">
        <input type="checkbox" data-commentary-id="${id}" ${checked}> ${escapeHtml(label)}
      </label>`;
  }).join("");

  el.querySelectorAll("input").forEach((cb) => {
    cb.addEventListener("change", () => {
      state.settings.commentaries[cb.dataset.commentaryId] = cb.checked;
      saveSettings();
      renderChapter();
    });
  });
}

// Toolbar convenience dropdown: a quick single-version switch. Picking one here
// turns that version on and every other version off; for a parallel multi-version
// reading view, use the ala-carte checkboxes in Settings instead.
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

async function navigateTo(book, chapter) {
  state.book = book;
  state.chapter = chapter;
  populateChapterSelect();
  document.getElementById("bookSelect").value = book;
  document.getElementById("chapterSelect").value = chapter;
  await renderChapter();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

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
        await Loader.english(id);
        results[id] = (window.BIBLE_TEXT[id][state.book] || {})[String(state.chapter)] || {};
      }
    } catch (e) {
      // Don't fail the whole render over one version's error -- other active
      // versions may still have text -- but remember why, so a total failure
      // (e.g. the only active version) can show a helpful message instead of
      // a silent blank page.
      results[id] = null;
      errors[id] = e instanceof WifiRequiredError
        ? "Blocked: \"Wi-Fi only\" is on and this device isn't on Wi-Fi."
        : e.message;
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

  const promises = [getChapterTexts()];
  if (showInterlinear) {
    promises.push(Loader.interlinear(state.book), Loader.lexicon(), Loader.morphology());
  }
  for (const id of commentaryIds) {
    promises.push(Loader.commentary(id, state.book));
  }
  const [{ versionIds, texts, errors }] = await Promise.all(promises);

  // Let Settings know whether YouVersion actually worked this render, so its
  // key/Bible ID fields auto-reveal only when something needs fixing.
  youVersionHasError = versionIds.includes(YOUVERSION_ID) && !!errors[YOUVERSION_ID];
  if (document.getElementById("youversionToggle")) syncYouVersionToggleUI();

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
  const showVersionTags = versionIds.length > 1;

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
        interlinearHtml = `<div class="interlinear-row" dir="${meta.t === "OT" ? "rtl" : "ltr"}">` +
          words.map((w, i) => renderWordBox(w, meta.t, state.book, state.chapter, vn, i, wordMatchesHighlight(w, hl))).join("") +
          `</div>`;
      }
    }

    const versionLines = versionIds.map((id) => {
      const vtext = texts[id] && texts[id][vn];
      if (!vtext) return "";
      fullChapterText += " " + vtext;
      const tag = showVersionTags ? `<span class="version-tag">${escapeHtml(versionTagLabel(id))}</span>` : "";
      const text = hl && hl.kind === "text" ? highlightMatch(vtext, hl.term) : escapeHtml(vtext);
      return `<div class="version-line">${tag}<span class="verse-text">${text}</span></div>`;
    }).join("");

    const hasAnyCommentary = commentaryIds.some((id) => {
      const entry = ((window.COMMENTARY[id] || {})[state.book] || {})[String(state.chapter)] || {};
      return !!entry[vn];
    });
    const commentaryHtml = hasAnyCommentary
      ? `<button class="commentary-icon" data-book="${state.book}" data-chapter="${state.chapter}" data-verse="${vn}" title="Commentary">
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path d="M12,2.5 C8.4,2.5 5.8,5.1 5.8,8.5 C5.8,10.6 7,12.1 8.1,13.4 C8.9,14.3 9.4,15 9.4,15.8 L14.6,15.8 C14.6,15 15.1,14.3 15.9,13.4 C17,12.1 18.2,10.6 18.2,8.5 C18.2,5.1 15.6,2.5 12,2.5 Z" fill="none" stroke="currentColor" stroke-width="1.3"/>
            <line x1="9.6" y1="18" x2="14.4" y2="18" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
            <line x1="10.1" y1="20.2" x2="13.9" y2="20.2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          </svg>
        </button>`
      : "";

    const hasNotes = Notes.hasNotes(state.book, state.chapter, vn);
    versesHtml += `
      <div class="verse" data-book="${state.book}" data-chapter="${state.chapter}" data-verse="${vn}" title="Double-click/double-tap to add a note">
        <div class="verse-line">
          <span class="verse-num${hasNotes && state.settings.showNotes ? " has-notes" : ""}">${vn}</span>
          <div class="verse-versions">${versionLines}</div>
          ${commentaryHtml}
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
  }
  attachWordHandlers();
  attachCommentaryHandlers();
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
  openModal(document.getElementById("commentaryModal"));
}

// ---------- Maps ----------

function renderMapsGallery() {
  const gallery = document.getElementById("mapsGallery");
  gallery.innerHTML = window.BIBLE_MAPS.map((m) => `
    <a class="map-card" href="${m.sourceUrl}" target="_blank" rel="noopener" title="Click for source (${escapeHtml(m.license)})">
      <img src="${m.thumbUrl}" alt="${escapeHtml(m.title)}" loading="lazy">
      <div class="map-card-info">
        <div class="map-era">${escapeHtml(m.era)}</div>
        <div class="map-title">${escapeHtml(m.title)}</div>
        <div class="map-desc">${escapeHtml(m.description)}</div>
      </div>
    </a>`).join("");
}

// ---------- Something cool (daily artifact) ----------

function showTodaysArtifact() {
  const a = todaysArtifact();
  const wikiUrl = "https://en.wikipedia.org/wiki/" + encodeURIComponent(a.wiki.replace(/ /g, "_"));
  const verseLinks = a.verses.map(([book, ch, vs]) => {
    const meta = bookMeta(book);
    const label = meta ? `${meta.n} ${ch}:${vs}` : `${book} ${ch}:${vs}`;
    return `<button class="artifact-verse-link" data-book="${book}" data-chapter="${ch}" data-verse="${vs}">${escapeHtml(label)}</button>`;
  }).join("");

  const photoHtml = a.photo
    ? `<a class="artifact-photo" href="${wikiUrl}" target="_blank" rel="noopener" title="Read more on Wikipedia">
         <img src="${a.photo}" alt="${escapeHtml(a.title)}" loading="lazy">
       </a>`
    : "";

  const body = document.getElementById("artifactModalBody");
  body.innerHTML = `
    ${photoHtml}
    <h3>${escapeHtml(a.title)}</h3>
    <p>${escapeHtml(a.description)}</p>
    <p class="settings-note">Related passages:</p>
    <div class="artifact-verses">${verseLinks}</div>`;

  body.querySelectorAll(".artifact-verse-link").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { book, chapter, verse } = btn.dataset;
      const modal = document.getElementById("artifactModal");
      if (typeof modal.close === "function") modal.close();
      else modal.removeAttribute("open");
      await navigateTo(book, Number(chapter));
      setTimeout(() => scrollToVerse(verse), 100);
    });
  });

  openModal(document.getElementById("artifactModal"));
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
  const artHtml = !state.settings.showBookArt
    ? ""
    : art
    ? `<a class="book-art" href="${art.sourceUrl}" target="_blank" rel="noopener" title="${escapeHtml(art.title)} — click for source (${escapeHtml(art.license || "")})">
         <img src="${art.thumbUrl}" alt="${escapeHtml(art.title)}" loading="lazy">
         <span class="art-caption">${art.isExcavation ? "📷 " : ""}${escapeHtml(art.title)}${art.artist ? ", " + escapeHtml(art.artist) : ""}</span>
       </a>`
    : `<div class="book-art book-art-placeholder"><span class="illum-ornament">&#10047;</span></div>`;

  const attributions = (versionIds || [])
    .map((id) => versionAttributionText(id))
    .filter(Boolean);
  const attributionHtml = attributions.length
    ? `<div class="version-attribution">${attributions.map(escapeHtml).join(" &nbsp;·&nbsp; ")}</div>`
    : "";

  return `<header class="book-header">
      ${artHtml}
      <div class="book-title-block">
        <div class="book-chapter-line">
          <h1>${escapeHtml(meta.n)}</h1>
          <div class="chapter-label">Chapter ${chapter}</div>
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
  openModal(modal);
}

// ---------- Notes ----------

function attachNoteDblClickHandlers() {
  document.querySelectorAll(".verse").forEach((el) => {
    el.addEventListener("dblclick", (e) => {
      if (e.target.closest(".interlinear-row") || e.target.closest(".commentary-icon")) return; // let those clicks be, don't also open notes
      const { book, chapter, verse } = el.dataset;
      showNotesPanel(book, chapter, verse);
    });
  });
  const chapterLabel = document.querySelector(".chapter-label");
  if (chapterLabel) {
    chapterLabel.addEventListener("dblclick", () => showNotesPanel(state.book, state.chapter, null));
  }
  const bookTitle = document.querySelector(".book-title-block h1");
  if (bookTitle) {
    bookTitle.addEventListener("dblclick", () => showNotesPanel(state.book, null, null));
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
      <h3>${escapeHtml(refLabel(book, chapter, verse))}</h3>
      <div class="notes-list">
        ${notes.map((n) => `
          <div class="note-item" data-id="${n.id}">
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
      item.querySelector(".note-save").addEventListener("click", () => {
        const text = item.querySelector(".note-text").value.trim();
        if (text) Notes.update(book, chapter, verse, id, text);
        render();
        renderChapter();
      });
      item.querySelector(".note-delete").addEventListener("click", () => {
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
  openModal(modal);
}

function parseSimpleRef(input) {
  const m = input.match(REF_PATTERN);
  if (!m) return null;
  const book = findBookByName(m[1]);
  if (!book) return null;
  return { book: book.a, chapter: m[2] || null, verse: m[3] || null };
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

// ---------- Offline downloads ----------

async function downloadAllInterlinear(progressEl) {
  const gate = NetworkGuard.checkAllowed(state.settings);
  if (!gate.allowed) {
    progressEl.textContent = "Blocked: \"Wi-Fi only\" is on and this device isn't on Wi-Fi.";
    return;
  }
  const books = window.BOOK_META;
  let done = 0;
  for (const b of books) {
    progressEl.textContent = `Downloading ${b.n}… (${done}/${books.length})`;
    try {
      await Loader.interlinear(b.a);
    } catch (e) {
      progressEl.textContent = e instanceof WifiRequiredError
        ? "Blocked: \"Wi-Fi only\" is on and this device isn't on Wi-Fi."
        : `Failed on ${b.n}: ${e.message}`;
      return;
    }
    done++;
  }
  progressEl.textContent = `Done — all ${books.length} books downloaded for offline use.`;
}

function initDownloadControls() {
  const btn = document.getElementById("downloadAllBtn");
  const progressEl = document.getElementById("downloadProgress");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    await Promise.all([
      downloadAllInterlinear(progressEl),
      Loader.lexicon(),
      Loader.morphology(),
      Loader.searchIndex(),
    ]);
    btn.disabled = false;
  });
}

// ---------- Wiring ----------

// Checkbox settings that just flip a boolean and re-render the chapter.
const SIMPLE_RENDER_TOGGLES = [
  ["showGreekToggle", "showGreek"],
  ["showHebrewToggle", "showHebrew"],
  ["showStudyAidsToggle", "showStudyAids"],
  ["showTranslitToggle", "showTranslit"],
  ["showWordGlossToggle", "showWordGloss"],
  ["showArchaeologyToggle", "showArchaeology"],
  ["showNotesToggle", "showNotes"],
  ["showBookArtToggle", "showBookArt"],
];

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
    openNonModal(document.getElementById("searchModal"));
    document.getElementById("searchInput").focus();
  });
  document.getElementById("mapsIconBtn").addEventListener("click", () => {
    renderMapsGallery();
    openModal(document.getElementById("mapsModal"));
  });
  document.getElementById("coolIconBtn").addEventListener("click", () => {
    showTodaysArtifact();
  });

  document.getElementById("settingsBtn").addEventListener("click", () => {
    openModal(document.getElementById("settingsModal"));
  });

  for (const [elId, settingKey] of SIMPLE_RENDER_TOGGLES) {
    const el = document.getElementById(elId);
    el.checked = state.settings[settingKey];
    el.addEventListener("change", () => {
      state.settings[settingKey] = el.checked;
      saveSettings();
      renderChapter();
    });
  }

  initYouVersionSettings();
  renderCommentaryToggles();

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

  initDownloadControls();

  document.querySelectorAll("dialog .close-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dialog = btn.closest("dialog");
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    });
  });

  navigateTo(state.book, state.chapter);
}

document.addEventListener("DOMContentLoaded", initUI);
