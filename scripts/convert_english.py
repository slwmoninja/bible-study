import json
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from books import NAME_TO_ABBR

RAW = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "processed", "english")
os.makedirs(OUT, exist_ok=True)

VERSIONS = ["KJV", "ASV", "YLT"]

for version in VERSIONS:
    with open(os.path.join(RAW, f"{version}.json"), encoding="utf-8") as f:
        data = json.load(f)

    result = {}
    for book in data["books"]:
        abbr = NAME_TO_ABBR.get(book["name"])
        if not abbr:
            print(f"WARNING: unmapped book name {book['name']!r} in {version}")
            continue
        chapters = {}
        for ch in book["chapters"]:
            verses = {}
            for v in ch["verses"]:
                verses[str(v["verse"])] = v["text"].strip()
            chapters[str(ch["chapter"])] = verses
        result[abbr] = chapters

    out_path = os.path.join(OUT, f"{version}.js")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("window.BIBLE_TEXT = window.BIBLE_TEXT || {};\n")
        f.write(f"window.BIBLE_TEXT.{version} = ")
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    total_verses = sum(len(v) for ch in result.values() for v in ch.values())
    print(f"{version}: {len(result)} books written to {out_path}")
