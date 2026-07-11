// General-purpose notepad, separate from the per-verse study notes in
// js/notes.js. A flat list of free-form dated entries, not tied to a book,
// chapter, or verse. Persisted locally in the browser (localStorage) --
// nothing leaves the device.
const Journal = (() => {
  // Never rename/change this: see the matching note in js/notes.js -- it's
  // what lets a user's notepad entries survive app updates untouched.
  const KEY = "bibleAppJournal";

  function loadAll() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveAll(entries) {
    localStorage.setItem(KEY, JSON.stringify(entries));
  }

  // Newest-first, by each entry's date stamp (which moves to "now" on edit --
  // see update() -- so a just-edited entry surfaces back to the top).
  function all() {
    return loadAll().sort((a, b) => b.ts - a.ts);
  }

  function add(text) {
    const entries = loadAll();
    entries.push({ id: Date.now() + "-" + Math.random().toString(36).slice(2), text, ts: Date.now() });
    saveAll(entries);
  }

  function update(id, text) {
    const entries = loadAll();
    const entry = entries.find((e) => e.id === id);
    if (entry) {
      entry.text = text;
      entry.ts = Date.now(); // editing an entry re-stamps its date, by design
    }
    saveAll(entries);
  }

  function remove(id) {
    saveAll(loadAll().filter((e) => e.id !== id));
  }

  // fromTs/toTs are inclusive day boundaries (already end-of-day-adjusted by
  // the caller); query is a case-insensitive substring match against the text.
  function filter({ query, fromTs, toTs } = {}) {
    let entries = all();
    if (query) {
      const q = query.trim().toLowerCase();
      if (q) entries = entries.filter((e) => e.text.toLowerCase().includes(q));
    }
    if (fromTs != null) entries = entries.filter((e) => e.ts >= fromTs);
    if (toTs != null) entries = entries.filter((e) => e.ts <= toTs);
    return entries;
  }

  return { all, add, update, remove, filter };
})();
