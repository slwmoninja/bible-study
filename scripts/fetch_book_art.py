import json
import os
import time
import urllib.parse
import urllib.request

API = "https://commons.wikimedia.org/w/api.php"

# (bookAbbr, search query on Commons, display title, artist, isExcavation)
CANDIDATES = [
    ("Gen", "Michelangelo Creation of Adam Sistine Chapel", "The Creation of Adam", "Michelangelo, c. 1512", False),
    ("Exo", "Nicolas Poussin Crossing of the Red Sea", "The Crossing of the Red Sea", "Nicolas Poussin, 1634", False),
    ("Lev", "Tel Arad archaeological site Israel temple", "Excavated Israelite sanctuary, Tel Arad", "Archaeological site, Negev, Israel", True),
    ("Num", "Botticelli Punishment of Korah Sistine Chapel", "The Punishment of Korah", "Sandro Botticelli, 1481", False),
    ("Deu", "Alexandre Cabanel Death of Moses", "The Death of Moses", "Alexandre Cabanel, 1851", False),
    ("Mat", "Botticelli Adoration of the Magi Uffizi", "Adoration of the Magi", "Sandro Botticelli, c. 1475", False),
    ("Mrk", "Piero della Francesca Baptism of Christ", "The Baptism of Christ", "Piero della Francesca, c. 1450", False),
    ("Luk", "Fra Angelico Annunciation Prado", "The Annunciation", "Fra Angelico, c. 1426", False),
    ("Jhn", "Christ Pantocrator Deesis mosaic Hagia Sophia", "Christ Pantocrator (Deësis mosaic)", "Hagia Sophia, c. 1261", False),
    ("Jos", "Jean Fouquet Fall of Jericho", "The Fall of Jericho", "Jean Fouquet, c. 1470", False),
    ("Jdg", "Rembrandt Samson blinded Philistines", "Samson Betrayed by Delilah", "Rembrandt, 1636", False),
    ("Rut", "Julius Schnorr von Carolsfeld Ruth Boaz field", "Ruth in Boaz's Field", "Julius Schnorr von Carolsfeld, 1828", False),
    ("1Sa", "Caravaggio David Goliath head", "David with the Head of Goliath", "Caravaggio, c. 1610", False),
    ("2Sa", "Rembrandt David Bathsheba", "Bathsheba at Her Bath", "Rembrandt, 1654", False),
    ("1Ki", "Peter Paul Rubens Elijah fed by raven", "Elijah Fed by the Raven", "Peter Paul Rubens, c. 1626", False),
    ("2Ki", "Elisha chariot fire ascension Elijah painting", "Elijah Taken Up in a Chariot of Fire", None, False),
    ("1Ch", "City of David archaeological excavation Jerusalem", "City of David excavations, Jerusalem", "Archaeological site, Jerusalem", True),
    ("2Ch", "Solomon Temple Jerusalem model reconstruction", "Model of Solomon's Temple", None, False),
    ("Ezr", "Jerusalem archaeological excavation Western Wall", "Jerusalem excavations", "Archaeological site, Jerusalem", True),
    ("Neh", "Jerusalem city wall archaeological excavation", "Ancient Jerusalem wall excavations", "Archaeological site, Jerusalem", True),
    ("Est", "Ernest Normand Esther denouncing Haman", "Esther Denouncing Haman", "Ernest Normand, 1888", False),
    ("Job", "William Blake Job his friends", "Job and His Friends", "William Blake, c. 1805", False),
    ("Psa", "King David harp painting", "David Playing the Harp", None, False),
    ("Pro", "Judgment of Solomon painting", "The Judgment of Solomon", None, False),
    ("Ecc", "King Solomon painting throne", "King Solomon", None, False),
    ("Sng", "Gustave Moreau Song of Songs Cantique", "Song of Songs", "Gustave Moreau, 1853", False),
    ("Isa", "Great Isaiah Scroll Dead Sea Scrolls", "The Great Isaiah Scroll", "Dead Sea Scrolls, Qumran Cave 1", True),
    ("Jer", "Rembrandt Jeremiah lamenting destruction Jerusalem", "Jeremiah Lamenting the Destruction of Jerusalem", "Rembrandt, 1630", False),
    ("Lam", "James Tissot Flight of the Prisoners", "The Flight of the Prisoners", "James Tissot, c. 1896", False),
    ("Ezk", "Ezekiel vision valley dry bones painting", "Vision of the Valley of Dry Bones", None, False),
    ("Dan", "Briton Riviere Daniel's Answer to the King lions", "Daniel in the Lions' Den", "Briton Rivière, 1890", False),
    ("Hos", "Sebastia Samaria ruins photograph", "Excavations at Samaria", "Archaeological site, Samaria", True),
    ("Act", "Titian Pentecost descent Holy Spirit", "The Descent of the Holy Spirit (Pentecost)", "Titian, c. 1545", False),
    ("Rom", "Valentin de Boulogne Saint Paul Writing His Epistles", "Saint Paul Writing His Epistles", "Valentin de Boulogne, c. 1620", False),
    ("Rev", "Albrecht Durer Four Horsemen Apocalypse", "The Four Horsemen of the Apocalypse", "Albrecht Dürer, 1498", False),
    ("Jon", "Michelangelo Jonah Sistine Chapel ceiling", "The Prophet Jonah", "Michelangelo, c. 1512", False),
    ("Jol", "Michelangelo Joel Sistine Chapel ceiling", "The Prophet Joel", "Michelangelo, c. 1509", False),
    ("Zec", "Michelangelo Zechariah Sistine Chapel ceiling", "The Prophet Zechariah", "Michelangelo, c. 1509", False),
    ("Heb", "Rembrandt Melchizedek Abraham painting", "Abraham and Melchizedek", None, False),
    ("Jas", "Rembrandt Saint James Apostle painting", "Saint James", "Rembrandt, 1661", False),
    ("1Pe", "Peter Paul Rubens Saint Peter portrait", "Saint Peter", "Peter Paul Rubens, c. 1611", False),
    ("2Pe", "Caravaggio Crucifixion of Saint Peter", "The Crucifixion of Saint Peter", "Caravaggio, 1601", False),
    ("1Jn", "Domenichino Saint John the Evangelist painting", "Saint John the Evangelist", "Domenichino, c. 1622", False),
    ("2Jn", "Basilica of St John ruins Selcuk Ephesus", "Ruins of the Basilica of St. John, Ephesus", "Archaeological site, Selçuk, Turkey", True),
    ("3Jn", "Cave of the Apocalypse Patmos", "Cave of the Apocalypse, Patmos", "Traditional site of John's later ministry, Patmos", True),
    ("Jud", "Anthony van Dyck Saint Jude Thaddeus painting", "Saint Jude Thaddeus", "Anthony van Dyck, c. 1621", False),

    # Pauline epistles: each keyed to the letter's specific destination city/context
    # rather than reusing a single "Paul writing" portrait for all thirteen.
    ("1Co", "Temple of Apollo ancient Corinth", "Temple of Apollo, Corinth", "Archaeological site, Corinth, Greece", True),
    ("2Co", "Acrocorinth photograph", "Acrocorinth", "Archaeological site, Corinth, Greece", True),
    ("Gal", "Antiocheia Pisidia Yalvac photograph", "Ruins of Pisidian Antioch", "Archaeological site, Galatia, Turkey", True),
    ("Eph", "Library of Celsus Ephesus", "The Library of Celsus, Ephesus", "Archaeological site, Ephesus, Turkey", True),
    ("Php", "Philippi AgoraAndAcropolis", "Ruins of Philippi", "Archaeological site, Macedonia, Greece", True),
    ("Col", "Laodicea Turkey ruins Pamukkale", "Ruins of Laodicea, near Colossae", "Archaeological site, Lycus Valley, Turkey", True),
    ("1Th", "Arch of Galerius Thessaloniki", "The Arch of Galerius, Thessaloniki", "Archaeological site, Thessaloniki, Greece", True),
    ("2Th", "Rotunda of Galerius Thessaloniki", "The Rotunda of Galerius, Thessaloniki", "Archaeological site, Thessaloniki, Greece", True),
    ("1Ti", "Temple of Artemis Ephesus ruins", "Ruins of the Temple of Artemis, Ephesus", "Archaeological site, Ephesus, Turkey", True),
    ("2Ti", "Mamertine Prison Rome", "The Mamertine Prison, Rome", "Traditional site of Paul's final imprisonment, Rome", True),
    ("Tit", "Gortyn archaeological site Crete", "Ruins of ancient Gortyn", "Archaeological site, Crete, Greece", True),
    ("Phm", "Rembrandt Apostle Paul in Prison", "The Apostle Paul in Prison", "Rembrandt, 1627", False),

    # Minor prophets not yet illustrated.
    ("Amo", "visit Tel Luz Bethel Israel Lugassi", "Bethel, where Amos confronted Amaziah", "Archaeological site, Israel", True),
    ("Oba", "Petra Jordan ancient Edom ruins", "Petra, capital of ancient Edom", "Archaeological site, Jordan", True),
    ("Mic", "Lachish Relief British Museum", "The Lachish Relief, depicting the Assyrian siege of Judah", "British Museum", True),
    ("Nam", "Nineveh ruins photograph Mosul", "The mound of Nineveh (Kuyunjik)", "Archaeological site, Mosul, Iraq", True),
    ("Hab", "Ishtar Gate Babylon ruins", "The Ishtar Gate, Babylon", "Archaeological site, Iraq", True),
    ("Zep", "Hinnom Valley Jerusalem", "The Hinnom Valley, Jerusalem", "Archaeological site, Jerusalem", True),
    ("Hag", "Temple Mount foundation stones Jerusalem", "Temple Mount foundation stones", "Archaeological site, Jerusalem", True),
    ("Mal", "Second Temple model Jerusalem Israel Museum", "Model of the Second Temple", "Israel Museum, Jerusalem", True),
]


def request_with_retry(url, max_retries=6):
    req = urllib.request.Request(url, headers={"User-Agent": "BibleStudyApp/1.0 (research; contact: local-build-script)"})
    delay = 5
    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < max_retries - 1:
                print(f"    (429 rate limited, waiting {delay}s...)")
                time.sleep(delay)
                delay = min(delay * 2, 60)
                continue
            raise


IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".gif", ".tif", ".tiff", ".webp")


def search_commons(query, limit=8):
    params = {
        "action": "query", "list": "search", "srsearch": query,
        "srnamespace": 6, "format": "json", "srlimit": limit,
    }
    url = API + "?" + urllib.parse.urlencode(params)
    data = request_with_retry(url)
    titles = [item["title"] for item in data.get("query", {}).get("search", [])]
    # Prefer actual photos/paintings over book-scan PDFs/DjVu that happen to match the text search.
    images = [t for t in titles if t.lower().endswith(IMAGE_EXTS)]
    return images or titles


def get_image_info(file_title):
    params = {
        "action": "query", "titles": file_title, "prop": "imageinfo",
        "iiprop": "url|extmetadata", "iiurlwidth": 300, "format": "json",
    }
    url = API + "?" + urllib.parse.urlencode(params)
    data = request_with_retry(url)
    pages = data.get("query", {}).get("pages", {})
    for page in pages.values():
        info = (page.get("imageinfo") or [None])[0]
        if info:
            return info
    return None


def main():
    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "book_art_candidates.json")
    results = {}
    if os.path.exists(out_path):
        with open(out_path, encoding="utf-8") as f:
            results = json.load(f)

    for abbr, query, title, artist, is_excavation in CANDIDATES:
        if abbr in results:
            print(f"{abbr}: already have {results[abbr]['commonsFile']!r}, skipping")
            continue
        try:
            hits = search_commons(query)
            if not hits:
                print(f"{abbr}: NO RESULTS for {query!r}")
                continue
            file_title = hits[0]
            time.sleep(2)
            info = get_image_info(file_title)
            if not info:
                print(f"{abbr}: NO IMAGE INFO for {file_title!r}")
                continue
            thumb = info.get("thumburl")
            page_url = f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(file_title.replace(' ', '_'))}"
            license_short = info.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")
            results[abbr] = {
                "title": title, "artist": artist,
                "thumbUrl": thumb, "sourceUrl": page_url,
                "commonsFile": file_title, "license": license_short,
                "isExcavation": is_excavation,
            }
            print(f"{abbr}: OK -> {file_title}  [{license_short}]")
        except Exception as e:
            print(f"{abbr}: ERROR {e}")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        time.sleep(3)

    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
