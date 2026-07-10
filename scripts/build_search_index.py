import glob
import json
import os
import re
import sys
import unicodedata

BOOKS_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "processed", "books")
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "processed", "search_index.js")

FILE_RE = re.compile(r"window\.INTERLINEAR\.(\w+) = (.*);\s*$", re.S)
STRIP_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)


def normalize(word):
    # strip accents/niqqud/cantillation (combining marks), punctuation, lowercase
    decomposed = unicodedata.normalize("NFD", word)
    no_marks = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    no_marks = no_marks.replace("ς", "σ").replace("־", "").replace("־", "")
    no_marks = STRIP_PUNCT.sub("", no_marks)
    return no_marks.strip().lower()


def add(index, key, ref):
    if not key:
        return
    lst = index.setdefault(key, [])
    if not lst or lst[-1] != ref:
        lst.append(ref)


def main():
    strong_index = {}      # StrongCode -> [refs]
    form_index = {}        # normalized original-language word -> [refs]
    translit_index = {}    # normalized transliteration -> [refs]
    verse_text = {}        # ref -> "normalized word1 normalized word2 ..." (enables phrase search)

    files = sorted(glob.glob(os.path.join(BOOKS_DIR, "*.js")))
    for path in files:
        with open(path, encoding="utf-8") as f:
            text = f.read()
        m = FILE_RE.search(text)
        if not m:
            print(f"WARNING: could not parse {path}")
            continue
        book = m.group(1)
        data = json.loads(m.group(2))
        for chapter, verses in data.items():
            for verse, words in verses.items():
                ref = f"{book}.{chapter}.{verse}"
                norm_words = []
                for w in words:
                    norm_t = normalize(w.get("t", ""))
                    add(form_index, norm_t, ref)
                    add(translit_index, normalize(w.get("tr", "")), ref)
                    if norm_t:
                        norm_words.append(norm_t)
                    for morph in w.get("m", []):
                        s = morph.get("s", "")
                        if s:
                            add(strong_index, s, ref)
                verse_text[ref] = " ".join(norm_words)

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("window.SEARCH_INDEX = {\n")
        f.write("  strong: ")
        json.dump(strong_index, f, ensure_ascii=False, separators=(",", ":"))
        f.write(",\n  form: ")
        json.dump(form_index, f, ensure_ascii=False, separators=(",", ":"))
        f.write(",\n  translit: ")
        json.dump(translit_index, f, ensure_ascii=False, separators=(",", ":"))
        f.write(",\n  verseText: ")
        json.dump(verse_text, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n};\n")

    print(f"strong keys: {len(strong_index)}, form keys: {len(form_index)}, translit keys: {len(translit_index)}, verses: {len(verse_text)}")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
