import json
import os
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(__file__))
from fetch_book_art import get_image_info, search_commons  # reuse verified, rate-limit-safe helpers

# (id, era label, Commons file title (exact, already verified via search), display title,
#  short description grounding it in the biblical narrative)
CANDIDATES = [
    ("ane", "Patriarchal Era (Genesis)",
     "File:Near East ancient map.jpg",
     "The Ancient Near East",
     "The world of Abraham, Isaac, and Jacob: Mesopotamia, the Fertile Crescent, and Canaan."),
    ("exodus", "Exodus (Exodus – Deuteronomy)",
     "File:Exodus Map.jpg",
     "Route of the Exodus",
     "Israel's traditional route from Egypt through the Sinai wilderness to the plains of Moab."),
    ("canaan", "Conquest & Judges (Joshua – Judges)",
     "File:General map of Canaan (FL45582600 3922575).jpg",
     "Canaan Divided Among the Tribes",
     "The allotment of the land among the twelve tribes of Israel after the conquest."),
    ("monarchy", "United Monarchy (1–2 Samuel, 1 Kings)",
     "File:Palestine under David and Solomon (Smith, 1915).jpg",
     "The Kingdom of David and Solomon",
     "Israel at its greatest territorial extent under the united monarchy."),
    ("empires", "Divided Kingdom & Exile (1–2 Kings, Isaiah, Jeremiah)",
     "File:Map of eastern Turkey in Asia, Syria and western Persia the period of the Babylonian and Assyrian empires (1915).jpg",
     "The Assyrian & Babylonian Empires",
     "The great empires that conquered Israel (722 BC) and Judah (586 BC) and carried them into exile."),
    ("persia", "Persian Period (Ezra, Nehemiah, Esther)",
     "File:Achaemenid Empire (flat map).svg",
     "The Persian (Achaemenid) Empire",
     "The empire that ended the exile and under which Judah was restored as a province."),
    ("hellenistic", "Intertestamental Period",
     "File:Map of the Empire of Alexander the Great (1893).jpg",
     "The Empire of Alexander the Great",
     "The Hellenistic world that shaped the political and cultural backdrop of the intertestamental centuries."),
    ("roman_judea", "New Testament Setting",
     "File:Judaea Roman Province.svg",
     "The Roman Province of Judaea",
     "The Roman administrative world of the Gospels: Judea, Samaria, and Galilee under Rome."),
    ("christ_time", "Gospels",
     "File:Palestine in the time of Christ.jpg",
     "Palestine in the Time of Christ",
     "Galilee, Samaria, and Judea as the setting for Jesus's ministry."),
    ("paul1", "Acts – Paul's Journeys",
     "File:Paul the Apostle, first missionary journey.svg",
     "Paul's First Missionary Journey",
     "Cyprus and southern Asia Minor (Acts 13–14)."),
    ("paul2", "Acts – Paul's Journeys",
     "File:Paul the Apostle, second missionary journey.svg",
     "Paul's Second Missionary Journey",
     "From Asia Minor into Macedonia and Greece (Acts 15:36–18:22)."),
    ("paul3", "Acts – Paul's Journeys",
     "File:Paul the Apostle, third missionary journey.svg",
     "Paul's Third Missionary Journey",
     "Through Asia Minor and Greece again, ending toward Jerusalem and Rome (Acts 18:23–21:16)."),
]


def main():
    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "maps_raw.json")
    results = {}
    if os.path.exists(out_path):
        results = json.load(open(out_path, encoding="utf-8"))

    for map_id, era, file_title, title, desc in CANDIDATES:
        if map_id in results:
            print(f"{map_id}: already have, skipping")
            continue
        try:
            info = get_image_info(file_title)
            if not info:
                print(f"{map_id}: NO IMAGE INFO for {file_title!r}")
                continue
            page_url = f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(file_title.replace(' ', '_'))}"
            license_short = info.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")
            results[map_id] = {
                "era": era, "title": title, "description": desc,
                "thumbUrl": info.get("thumburl"), "sourceUrl": page_url,
                "commonsFile": file_title, "license": license_short,
            }
            print(f"{map_id}: OK -> {file_title} [{license_short}]")
        except Exception as e:
            print(f"{map_id}: ERROR {e}")
        json.dump(results, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        time.sleep(3)

    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
