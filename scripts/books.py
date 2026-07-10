# Canonical 66-book metadata: (fullName as in scrollmapper JSON, STEPBible abbrev, testament)
BOOKS = [
    ("Genesis", "Gen", "OT"), ("Exodus", "Exo", "OT"), ("Leviticus", "Lev", "OT"),
    ("Numbers", "Num", "OT"), ("Deuteronomy", "Deu", "OT"), ("Joshua", "Jos", "OT"),
    ("Judges", "Jdg", "OT"), ("Ruth", "Rut", "OT"), ("I Samuel", "1Sa", "OT"),
    ("II Samuel", "2Sa", "OT"), ("I Kings", "1Ki", "OT"), ("II Kings", "2Ki", "OT"),
    ("I Chronicles", "1Ch", "OT"), ("II Chronicles", "2Ch", "OT"), ("Ezra", "Ezr", "OT"),
    ("Nehemiah", "Neh", "OT"), ("Esther", "Est", "OT"), ("Job", "Job", "OT"),
    ("Psalms", "Psa", "OT"), ("Proverbs", "Pro", "OT"), ("Ecclesiastes", "Ecc", "OT"),
    ("Song of Solomon", "Sng", "OT"), ("Isaiah", "Isa", "OT"), ("Jeremiah", "Jer", "OT"),
    ("Lamentations", "Lam", "OT"), ("Ezekiel", "Ezk", "OT"), ("Daniel", "Dan", "OT"),
    ("Hosea", "Hos", "OT"), ("Joel", "Jol", "OT"), ("Amos", "Amo", "OT"),
    ("Obadiah", "Oba", "OT"), ("Jonah", "Jon", "OT"), ("Micah", "Mic", "OT"),
    ("Nahum", "Nam", "OT"), ("Habakkuk", "Hab", "OT"), ("Zephaniah", "Zep", "OT"),
    ("Haggai", "Hag", "OT"), ("Zechariah", "Zec", "OT"), ("Malachi", "Mal", "OT"),
    ("Matthew", "Mat", "NT"), ("Mark", "Mrk", "NT"), ("Luke", "Luk", "NT"),
    ("John", "Jhn", "NT"), ("Acts", "Act", "NT"), ("Romans", "Rom", "NT"),
    ("I Corinthians", "1Co", "NT"), ("II Corinthians", "2Co", "NT"), ("Galatians", "Gal", "NT"),
    ("Ephesians", "Eph", "NT"), ("Philippians", "Php", "NT"), ("Colossians", "Col", "NT"),
    ("I Thessalonians", "1Th", "NT"), ("II Thessalonians", "2Th", "NT"), ("I Timothy", "1Ti", "NT"),
    ("II Timothy", "2Ti", "NT"), ("Titus", "Tit", "NT"), ("Philemon", "Phm", "NT"),
    ("Hebrews", "Heb", "NT"), ("James", "Jas", "NT"), ("I Peter", "1Pe", "NT"),
    ("II Peter", "2Pe", "NT"), ("I John", "1Jn", "NT"), ("II John", "2Jn", "NT"),
    ("III John", "3Jn", "NT"), ("Jude", "Jud", "NT"), ("Revelation of John", "Rev", "NT"),
]

NAME_TO_ABBR = {b[0]: b[1] for b in BOOKS}
ABBR_TO_NAME = {b[1]: b[0] for b in BOOKS}
ABBR_ORDER = [b[1] for b in BOOKS]
ABBR_TESTAMENT = {b[1]: b[2] for b in BOOKS}
