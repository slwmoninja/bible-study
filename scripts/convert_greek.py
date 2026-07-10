import json
import os
import re
import sys

RAW = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "processed", "books")
os.makedirs(OUT_DIR, exist_ok=True)

REF_RE = re.compile(r"^([A-Za-z0-9]+)\.(\d+)\.(\d+)(?:[\(\[\{][^#]*[\)\]\}])?#(\d+)=(.*)$")
GREEK_RE = re.compile(r"^(.*?)\s*\(([^)]*)\)\s*$")


def parse_greek_word(cell):
    m = GREEK_RE.match(cell.strip())
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return cell.strip(), ""


def split_eq(cell):
    if "=" in cell:
        a, b = cell.split("=", 1)
        return a.strip(), b.strip()
    return cell.strip(), ""


def parse_file(path):
    # books[book][chapter][verse] -> {index: row}
    books = {}
    started = False
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not started:
                if line.startswith("Word & Type"):
                    started = True
                continue
            if not line.strip():
                continue
            cols = line.split("\t")
            if len(cols) < 5:
                continue
            m = REF_RE.match(cols[0].strip())
            if not m:
                continue
            book, chapter, verse, idx, wtype = m.groups()
            idx = int(idx)

            greek_word, translit = parse_greek_word(cols[1])
            english = cols[2].strip()
            strong, gram = split_eq(cols[3]) if len(cols) > 3 else ("", "")

            row = {
                "idx": idx,
                "type": wtype,
                "t": greek_word,
                "tr": translit,
                "en": english,
                "m": [{"s": strong, "g": gram}],
            }

            books.setdefault(book, {}).setdefault(chapter, {}).setdefault(verse, {})
            slot = books[book][chapter][verse]
            existing = slot.get(idx)
            if existing is None:
                slot[idx] = row
            else:
                # prefer the row present in modern critical text (N), else keep first
                if existing["type"] and not existing["type"].startswith("N") and wtype.startswith("N"):
                    slot[idx] = row
    return books


def finalize(books):
    out = {}
    for book, chapters in books.items():
        out[book] = {}
        for chapter, verses in chapters.items():
            out[book][chapter] = {}
            for verse, words_by_idx in verses.items():
                ordered = [words_by_idx[i] for i in sorted(words_by_idx.keys())]
                # drop internal idx/type before writing, keep compact
                clean = [{k: w[k] for k in ("t", "tr", "en", "m")} for w in ordered]
                out[book][chapter][verse] = clean
    return out


def write_books(data):
    for book, content in data.items():
        path = os.path.join(OUT_DIR, f"{book}.js")
        with open(path, "w", encoding="utf-8") as f:
            f.write("window.INTERLINEAR = window.INTERLINEAR || {};\n")
            f.write(f"window.INTERLINEAR.{book} = ")
            json.dump(content, f, ensure_ascii=False, separators=(",", ":"))
            f.write(";\n")
        n_verses = sum(len(v) for v in content.values())
        print(f"{book}: {len(content)} chapters, {n_verses} verses -> {path}")


if __name__ == "__main__":
    files = sys.argv[1:] or ["TAGNT_MatJhn.txt"]
    all_books = {}
    for fname in files:
        parsed = parse_file(os.path.join(RAW, fname))
        for book, chapters in parsed.items():
            all_books.setdefault(book, {})
            for ch, verses in chapters.items():
                all_books[book].setdefault(ch, {})
                all_books[book][ch].update(verses)
    final = finalize(all_books)
    write_books(final)
