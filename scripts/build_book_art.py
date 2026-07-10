import json
import os

SRC = os.path.join(os.path.dirname(__file__), "..", "data", "book_art_candidates.json")
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "book_art.js")

with open(SRC, encoding="utf-8") as f:
    candidates = json.load(f)

entries = {}
for abbr, c in candidates.items():
    entries[abbr] = {
        "title": c["title"],
        "artist": c.get("artist", ""),
        "thumbUrl": c["thumbUrl"],
        "sourceUrl": c["sourceUrl"],
        "license": c.get("license", ""),
        "isExcavation": c.get("isExcavation", False),
    }

with open(OUT, "w", encoding="utf-8") as f:
    f.write("// Curated public-domain / freely-licensed artwork (or excavation photos where no\n")
    f.write("// suitable painting exists) for each book's illuminated header. Sourced from\n")
    f.write("// Wikimedia Commons; each thumbnail links back to its Commons source page for\n")
    f.write("// attribution and license details.\n")
    f.write("window.BOOK_ART = ")
    json.dump(entries, f, ensure_ascii=False, indent=2)
    f.write(";\n")

print(f"Wrote {len(entries)} entries to {OUT}")
