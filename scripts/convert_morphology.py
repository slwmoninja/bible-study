import json
import os
import re

RAW = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "processed", "morphology.js")


def parse_blocks(path):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    # only the FULL MORPHOLOGY CODES section has the structured $-delimited table
    idx = text.find("FULL MORPHOLOGY CODES:")
    text = text[idx:] if idx != -1 else text
    blocks = text.split("\n$\n")
    codes = {}
    for block in blocks:
        lines = [l for l in block.split("\n") if l.strip()]
        if len(lines) < 4:
            continue
        first = lines[0]
        m = re.match(r"^(\S+)\t(.*)$", first)
        if not m:
            continue
        code = m.group(1).strip()
        if not re.match(r"^[A-Za-z][A-Za-z0-9\-/+]*$", code):
            continue
        short = lines[1].strip().strip('"')
        desc = lines[2].strip().strip('"')
        example = lines[3].strip().strip('"')
        codes[code] = {"short": short, "desc": desc, "example": example}
    return codes


greek = parse_blocks(os.path.join(RAW, "TEGMC.txt"))
hebrew = parse_blocks(os.path.join(RAW, "TEHMC.txt"))

print(f"Greek morphology codes: {len(greek)}")
print(f"Hebrew morphology codes: {len(hebrew)}")

with open(OUT, "w", encoding="utf-8") as f:
    f.write("window.MORPH_CODES = {\"G\":")
    json.dump(greek, f, ensure_ascii=False, separators=(",", ":"))
    f.write(",\"H\":")
    json.dump(hebrew, f, ensure_ascii=False, separators=(",", ":"))
    f.write("};\n")

print(f"Wrote {OUT}")
