import json
import os
import re

BASE = os.path.join(os.path.dirname(__file__), "..")

# Same order as CANDIDATES in fetch_artifact_photos.py, matching the array order in data/artifacts.js
IDS = [
    "tel_dan_stele", "merneptah_stele", "cyrus_cylinder", "pilate_stone", "siloam_inscription",
    "sennacherib_annals", "lachish_reliefs", "mesha_stele", "ketef_hinnom", "dead_sea_scrolls",
    "nazareth_inscription", "gezer_calendar", "behistun", "amarna_letters", "hammurabi",
    "siloam_tunnel", "caiaphas_ossuary", "magdala_stone", "arch_of_titus", "rosetta_stone",
    "nag_hammadi", "baruch_bulla", "elephantine", "ishtar_gate", "khirbet_qeiyafa",
    "masada", "qumran_caves", "tel_megiddo", "tel_hazor", "tel_beersheba",
    "tel_arad", "pool_of_bethesda", "pool_of_siloam", "capernaum", "herodium",
    "samaria_ostraca", "broad_wall", "james_ossuary", "politarch", "sergius_paulus",
]

photos = json.load(open(os.path.join(BASE, "data", "artifact_photos.json"), encoding="utf-8"))

src = open(os.path.join(BASE, "data", "artifacts.js"), encoding="utf-8").read()
m = re.search(r"window\.ARTIFACTS = (\[.*?\]);", src, re.S)
raw_array_text = m.group(1)

# The array is hand-written JS (object literals with unquoted keys), not strict JSON,
# so we extract it via the same file by evaluating with a tiny JS-like parser is overkill --
# instead we rebuild by locating each entry's wiki field to align order, then splice in "photo".
entries = re.findall(r"\{\s*title:.*?\n\s*\},", raw_array_text, re.S)
assert len(entries) == len(IDS), f"{len(entries)} entries vs {len(IDS)} ids"

new_entries = []
missing = []
for art_id, entry in zip(IDS, entries):
    photo = photos.get(art_id)
    if not photo:
        missing.append(art_id)
        new_entries.append(entry)
        continue
    # insert a photo field right after the opening brace
    injected = entry.replace(
        "{\n",
        "{\n    photo: " + json.dumps(photo["thumbUrl"]) + ",\n    photoSource: " + json.dumps(
            f"https://commons.wikimedia.org/wiki/{photo['commonsFile'].replace(' ', '_')}"
        ) + ",\n",
        1,
    )
    new_entries.append(injected)

new_array_text = "[\n  " + "\n  ".join(new_entries) + "\n]"
new_src = src.replace(raw_array_text, new_array_text)  # note: raw_array_text ends with ']' but src has '];' -- fine since we only match the array body

with open(os.path.join(BASE, "data", "artifacts.js"), "w", encoding="utf-8") as f:
    f.write(new_src)

print(f"Injected photos for {len(IDS) - len(missing)}/{len(IDS)} artifacts")
if missing:
    print("Missing photos for:", missing)
