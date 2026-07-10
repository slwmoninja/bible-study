import json
import os
import re
import sys

RAW = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "processed", "books")
os.makedirs(OUT_DIR, exist_ok=True)

REF_RE = re.compile(r"^([A-Za-z0-9]+)\.(\d+)\.(\d+)(?:[\(\[\{][^#]*[\)\]\}])?#(\d+)=(.*)$")
BRACE_RE = re.compile(r"[{}]")


def clean_word(cell):
    # remove slash morpheme separators and any trailing punctuation markers like \H9016
    w = cell.split("\\")[0]
    return w.replace("/", "")


def split_slash(cell):
    return [BRACE_RE.sub("", p).strip() for p in cell.split("/") if p.strip()]


def parse_file(path):
    books = {}
    started = False
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not started:
                if line.startswith("Eng (Heb) Ref & Type"):
                    started = True
                continue
            if not line.strip():
                continue
            cols = line.split("\t")
            if len(cols) < 6:
                continue
            m = REF_RE.match(cols[0].strip())
            if not m:
                continue
            book, chapter, verse, idx, wtype = m.groups()
            idx = int(idx)

            hebrew_raw = cols[1].strip()
            translit = cols[2].strip()
            english = cols[3].strip()
            dstrongs_raw = cols[4].strip().split("\\")[0]  # drop trailing \H9016 verseEnd markers etc
            gram_raw = cols[5].strip().split("\\")[0]

            strongs = split_slash(dstrongs_raw)
            grams = split_slash(gram_raw)
            if len(grams) < len(strongs):
                grams = grams + [""] * (len(strongs) - len(grams))
            morphemes = [{"s": s, "g": grams[i] if i < len(grams) else ""} for i, s in enumerate(strongs)]

            row = {
                "idx": idx,
                "type": wtype,
                "t": clean_word(hebrew_raw),
                "tr": translit.replace("/", ""),
                "en": english,
                "m": morphemes,
            }

            books.setdefault(book, {}).setdefault(chapter, {}).setdefault(verse, {})
            slot = books[book][chapter][verse]
            existing = slot.get(idx)
            if existing is None:
                slot[idx] = row
            else:
                if existing["type"] and existing["type"] != "L" and wtype == "L":
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
    files = sys.argv[1:] or ["TAHOT_GenDeu.txt"]
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
