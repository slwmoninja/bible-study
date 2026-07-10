import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from fetch_book_art import get_image_info, search_commons  # reuse verified, rate-limit-safe, image-only helpers

# (artifact id matching data/artifacts.js order, Commons search query)
CANDIDATES = [
    ("tel_dan_stele", "Tel Dan Stele inscription photo"),
    ("merneptah_stele", "Merneptah Stele photo"),
    ("cyrus_cylinder", "Cyrus Cylinder British Museum photo"),
    ("pilate_stone", "Pilate Stone inscription photo"),
    ("siloam_inscription", "Siloam inscription photo"),
    ("sennacherib_annals", "Sennacherib Prism Taylor photo"),
    ("lachish_reliefs", "Lachish reliefs British Museum photo"),
    ("mesha_stele", "Mesha Stele Louvre photo"),
    ("ketef_hinnom", "Ketef Hinnom scrolls photo"),
    ("dead_sea_scrolls", "Dead Sea Scrolls fragment photo"),
    ("nazareth_inscription", "Nazareth Inscription photo"),
    ("gezer_calendar", "Gezer calendar photo"),
    ("behistun", "Behistun Inscription photo"),
    ("amarna_letters", "Amarna letter tablet photo"),
    ("hammurabi", "Code of Hammurabi stele Louvre photo"),
    ("siloam_tunnel", "Siloam tunnel Hezekiah photo"),
    ("caiaphas_ossuary", "Caiaphas ossuary photo"),
    ("magdala_stone", "Magdala stone photo"),
    ("arch_of_titus", "Arch of Titus menorah relief photo"),
    ("rosetta_stone", "Rosetta Stone British Museum photo"),
    ("nag_hammadi", "Nag Hammadi codex photo"),
    ("baruch_bulla", "bulla clay seal impression Baruch photo"),
    ("elephantine", "Elephantine papyrus photo"),
    ("ishtar_gate", "Ishtar Gate Babylon photo"),
    ("khirbet_qeiyafa", "Khirbet Qeiyafa excavation photo"),
    ("masada", "Masada fortress photo"),
    ("qumran_caves", "Qumran caves photo"),
    ("tel_megiddo", "Tel Megiddo excavation photo"),
    ("tel_hazor", "Tel Hazor excavation photo"),
    ("tel_beersheba", "Tel Be'er Sheva altar photo"),
    ("tel_arad", "Tel Arad sanctuary photo"),
    ("pool_of_bethesda", "Pool of Bethesda excavation photo"),
    ("pool_of_siloam", "Pool of Siloam excavation photo"),
    ("capernaum", "Capernaum synagogue ruins photo"),
    ("herodium", "Herodium fortress photo"),
    ("samaria_ostraca", "Samaria ostraca photo"),
    ("broad_wall", "Broad Wall Jerusalem photo"),
    ("james_ossuary", "James Ossuary photo"),
    ("politarch", "Thessaloniki Vardar Gate politarch inscription photo"),
    ("sergius_paulus", "Sergius Paulus inscription Cyprus photo"),
]


def main():
    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "artifact_photos.json")
    results = {}
    if os.path.exists(out_path):
        results = json.load(open(out_path, encoding="utf-8"))

    for art_id, query in CANDIDATES:
        if art_id in results:
            print(f"{art_id}: already have, skipping")
            continue
        try:
            hits = search_commons(query)
            if not hits:
                print(f"{art_id}: NO RESULTS for {query!r}")
                continue
            file_title = hits[0]
            time.sleep(1.5)
            info = get_image_info(file_title)
            if not info:
                print(f"{art_id}: NO IMAGE INFO for {file_title!r}")
                continue
            license_short = info.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")
            results[art_id] = {
                "thumbUrl": info.get("thumburl"),
                "commonsFile": file_title,
                "license": license_short,
            }
            print(f"{art_id}: OK -> {file_title} [{license_short}]")
        except Exception as e:
            print(f"{art_id}: ERROR {e}")
        json.dump(results, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        time.sleep(2.5)

    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
