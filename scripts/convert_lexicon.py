import json
import os
import re

RAW = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "processed")


def clean_html(s):
    s = s.strip()
    # normalize STEPBible's <BR /> and refs into something lighter for display
    s = re.sub(r"<BR\s*/?>", "<br>", s, flags=re.I)
    s = re.sub(r"<ref='([^']*)'>", r"<span class='ref'>", s)
    s = s.replace("</ref>", "</span>")
    return s.strip()


def parse_lexicon(filename, lang):
    entries = {}
    path = os.path.join(RAW, filename)
    with open(path, encoding="utf-8") as f:
        started = False
        for line in f:
            line = line.rstrip("\n")
            if not started:
                if line.startswith("eStrong"):
                    started = True
                continue
            if not line.strip() or line.startswith("="):
                continue
            cols = line.split("\t")
            if len(cols) < 7:
                continue
            eStrong, dStrongRaw, uStrong, word, translit, morph, gloss = cols[:7]
            definition = cols[7] if len(cols) > 7 else ""
            dStrong = dStrongRaw.split("=")[0].strip()
            if not dStrong:
                continue
            entries[dStrong] = {
                "lang": lang,
                "word": word.strip(),
                "translit": translit.strip(),
                "pos": morph.strip(),
                "gloss": gloss.strip(),
                "def": clean_html(definition),
            }
    return entries


greek = parse_lexicon("TBESG.txt", "grc")
hebrew = parse_lexicon("TBESH.txt", "hbo")

print(f"Greek entries: {len(greek)}")
print(f"Hebrew entries: {len(hebrew)}")

combined = {}
combined.update(greek)
combined.update(hebrew)

out_path = os.path.join(OUT, "lexicon.js")
with open(out_path, "w", encoding="utf-8") as f:
    f.write("window.LEXICON = ")
    json.dump(combined, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")

print(f"Wrote {len(combined)} lexicon entries to {out_path}")
