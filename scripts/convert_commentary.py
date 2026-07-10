import html
import json
import os
import re
import sys

RAW = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
OUT_ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "processed", "commentary")

# CCEL/ThML OSIS book codes -> this app's book abbreviations. Apocryphal books
# (Macc, Sir, Tob, Wis) have no entry and are skipped -- outside the 66-book canon.
OSIS_TO_ABBR = {
    "Gen": "Gen", "Exod": "Exo", "Lev": "Lev", "Num": "Num", "Deut": "Deu",
    "Josh": "Jos", "Judg": "Jdg", "Ruth": "Rut", "1Sam": "1Sa", "2Sam": "2Sa",
    "1Kgs": "1Ki", "2Kgs": "2Ki", "1Chr": "1Ch", "2Chr": "2Ch", "Ezra": "Ezr",
    "Neh": "Neh", "Esth": "Est", "Job": "Job", "Ps": "Psa", "Prov": "Pro",
    "Eccl": "Ecc", "Song": "Sng", "Isa": "Isa", "Jer": "Jer", "Lam": "Lam",
    "Ezek": "Ezk", "Dan": "Dan", "Hos": "Hos", "Joel": "Jol", "Amos": "Amo",
    "Obad": "Oba", "Jonah": "Jon", "Mic": "Mic", "Nah": "Nam", "Hab": "Hab",
    "Zeph": "Zep", "Hag": "Hag", "Zech": "Zec", "Mal": "Mal",
    "Matt": "Mat", "Mark": "Mrk", "Luke": "Luk", "John": "Jhn", "Acts": "Act",
    "Rom": "Rom", "1Cor": "1Co", "2Cor": "2Co", "Gal": "Gal", "Eph": "Eph",
    "Phil": "Php", "Col": "Col", "1Thess": "1Th", "2Thess": "2Th", "1Tim": "1Ti",
    "2Tim": "2Ti", "Titus": "Tit", "Phlm": "Phm", "Heb": "Heb", "Jas": "Jas",
    "1Pet": "1Pe", "2Pet": "2Pe", "1John": "1Jn", "2John": "2Jn", "3John": "3Jn",
    "Jude": "Jud", "Rev": "Rev",
}

ANCHOR_RE = re.compile(r"<scripCom\s+([^>]*?)/>")
ATTR_RE = re.compile(r'(\w+)="([^"]*)"')

TAG_STRIP_KEEP = {"p", "b", "i", "br", "em", "strong"}


def clean_fragment(raw):
    # Drop any nested scripCom (self-closing) markers entirely.
    raw = re.sub(r"<scripCom\b[^>]*/>", "", raw)
    # scripRef -> keep only its visible text (drop the cross-reference markup).
    raw = re.sub(r"<scripRef\b[^>]*>(.*?)</scripRef>", r"\1", raw, flags=re.S)
    # Drop div/span wrappers but keep their inner text.
    raw = re.sub(r"</?div\b[^>]*>", "", raw)
    raw = re.sub(r"<span\b[^>]*>(.*?)</span>", r"\1", raw, flags=re.S)
    raw = re.sub(r"<note\b[^>]*>.*?</note>", "", raw, flags=re.S)  # editorial footnotes
    # Strip any remaining tag that isn't in our small allow-list.
    def strip_tag(m):
        name = m.group(1).lower()
        return m.group(0) if name in TAG_STRIP_KEEP else ""
    raw = re.sub(r"</?([A-Za-z0-9]+)\b[^>]*>", strip_tag, raw)
    raw = html.unescape(raw)
    return raw.strip()


def parse_file(path, store, stats):
    with open(path, encoding="utf-8") as f:
        text = f.read()

    matches = [m for m in ANCHOR_RE.finditer(text) if dict(ATTR_RE.findall(m.group(1))).get("type") == "Commentary"]
    for i, m in enumerate(matches):
        attrs = dict(ATTR_RE.findall(m.group(1)))
        parsed = attrs.get("parsed", "")
        parts = parsed.split("|")
        if len(parts) != 6:
            continue
        _, book_code, s_ch, s_vs, e_ch, e_vs = parts
        abbr = OSIS_TO_ABBR.get(book_code)
        if not abbr:
            stats["skipped_book"] += 1
            continue
        try:
            s_ch, s_vs = int(s_ch), int(s_vs)
            e_ch = int(e_ch) if e_ch else 0
            e_vs = int(e_vs) if e_vs else 0
        except ValueError:
            continue
        if s_vs == 0:
            stats["skipped_nonverse"] += 1
            continue  # chapter/book-level heading, not a specific verse
        if e_ch == 0:
            e_ch, e_vs = s_ch, s_vs
        if e_ch != s_ch:
            e_vs = s_vs  # rare cross-chapter group -- key to the starting verse only
            stats["cross_chapter"] += 1

        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else min(len(text), start + 20000)
        content = clean_fragment(text[start:end])
        if not content:
            continue

        chapters = store.setdefault(abbr, {})
        verses = chapters.setdefault(str(s_ch), {})
        for vs in range(s_vs, max(s_vs, e_vs) + 1):
            key = str(vs)
            if key in verses:
                verses[key] += "</p><p>" + content
            else:
                verses[key] = content
        stats["anchors"] += 1


def write_output(commentary_id, store):
    out_dir = os.path.join(OUT_ROOT, commentary_id)
    os.makedirs(out_dir, exist_ok=True)
    for book, chapters in store.items():
        path = os.path.join(out_dir, f"{book}.js")
        with open(path, "w", encoding="utf-8") as f:
            f.write("window.COMMENTARY = window.COMMENTARY || {};\n")
            f.write(f"window.COMMENTARY.{commentary_id} = window.COMMENTARY.{commentary_id} || {{}};\n")
            f.write(f"window.COMMENTARY.{commentary_id}.{book} = ")
            json.dump(chapters, f, ensure_ascii=False, separators=(",", ":"))
            f.write(";\n")
    n_verses = sum(len(v) for ch in store.values() for v in ch.values())
    print(f"{commentary_id}: {len(store)} books, {n_verses} verse entries -> {out_dir}")


if __name__ == "__main__":
    commentary_id = sys.argv[1]
    files = sys.argv[2:]
    store = {}
    stats = {"anchors": 0, "skipped_book": 0, "skipped_nonverse": 0, "cross_chapter": 0}
    for fname in files:
        parse_file(os.path.join(RAW, fname), store, stats)
    write_output(commentary_id, store)
    print(f"stats: {stats}")
