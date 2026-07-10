// Personal study notes, attached to a book, a book+chapter, or a specific book+chapter+verse.
// Persisted locally in the browser (localStorage) -- nothing leaves the device.
const Notes = (() => {
  const KEY = "bibleAppNotes";

  function loadAll() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveAll(all) {
    localStorage.setItem(KEY, JSON.stringify(all));
  }

  function refKey(book, chapter, verse) {
    return verse ? `${book}.${chapter}.${verse}` : chapter ? `${book}.${chapter}` : book;
  }

  function forRef(book, chapter, verse) {
    const all = loadAll();
    return all[refKey(book, chapter, verse)] || [];
  }

  function hasNotes(book, chapter, verse) {
    return forRef(book, chapter, verse).length > 0;
  }

  function add(book, chapter, verse, text) {
    const all = loadAll();
    const key = refKey(book, chapter, verse);
    all[key] = all[key] || [];
    all[key].push({ id: Date.now() + "-" + Math.random().toString(36).slice(2), text, ts: Date.now() });
    saveAll(all);
  }

  function update(book, chapter, verse, id, text) {
    const all = loadAll();
    const key = refKey(book, chapter, verse);
    const list = all[key] || [];
    const note = list.find((n) => n.id === id);
    if (note) note.text = text;
    saveAll(all);
  }

  function remove(book, chapter, verse, id) {
    const all = loadAll();
    const key = refKey(book, chapter, verse);
    all[key] = (all[key] || []).filter((n) => n.id !== id);
    if (!all[key].length) delete all[key];
    saveAll(all);
  }

  function move(fromBook, fromChapter, fromVerse, id, toBook, toChapter, toVerse) {
    const all = loadAll();
    const fromKey = refKey(fromBook, fromChapter, fromVerse);
    const toKey = refKey(toBook, toChapter, toVerse);
    const list = all[fromKey] || [];
    const idx = list.findIndex((n) => n.id === id);
    if (idx === -1) return false;
    const [note] = list.splice(idx, 1);
    if (!list.length) delete all[fromKey];
    all[toKey] = all[toKey] || [];
    all[toKey].push(note);
    saveAll(all);
    return true;
  }

  return { forRef, hasNotes, add, update, remove, move, refKey };
})();
