// Maps each book to the id of its best-fit entry in window.BIBLE_MAPS (see
// data/maps.js), used by the small map icon next to the book title to jump
// straight to a regional map of that book's era instead of the full gallery.
window.BOOK_MAP_ID = {
  // Torah / Pentateuch
  Gen: "ane", Exo: "exodus", Lev: "tabernacle", Num: "exodus", Deu: "exodus",
  // Conquest & Judges
  Jos: "canaan", Jdg: "canaan", Rut: "canaan",
  // United monarchy
  "1Sa": "saul", "2Sa": "city_of_david", "1Ki": "monarchy", "1Ch": "monarchy",
  Psa: "monarchy", Pro: "monarchy", Ecc: "monarchy", Sng: "monarchy",
  // Divided kingdom, Assyrian threat, and prophets contemporary with it
  "2Ki": "assyria", Isa: "assyria", Hos: "assyria", Amo: "assyria",
  Jon: "assyria", Mic: "assyria", Nam: "assyria",
  Jol: "israel_ancient", Oba: "israel_ancient",
  // Babylonian conquest and exile
  "2Ch": "empires", Jer: "neo_babylon", Lam: "neo_babylon", Ezk: "neo_babylon",
  Dan: "neo_babylon", Hab: "neo_babylon", Zep: "neo_babylon",
  // Patriarchal-era backdrop
  Job: "ane",
  // Persian period / return from exile
  Ezr: "persia", Neh: "persia", Est: "persia", Hag: "persia", Zec: "persia", Mal: "persia",
  // Gospels
  Mat: "christ_time", Mrk: "christ_time", Luk: "christ_time", Jhn: "christ_time",
  // Acts and Paul's letters, grouped roughly by which journey/period they belong to
  Act: "paul1", Gal: "paul1",
  "1Th": "paul2", "2Th": "paul2",
  Rom: "paul3", "1Co": "paul3", "2Co": "paul3", "1Ti": "paul3", Tit: "paul3",
  // Prison and general epistles, written under Roman rule
  Eph: "rome_trajan", Php: "rome_trajan", Col: "rome_trajan", "2Ti": "rome_trajan", Phm: "rome_trajan",
  "1Pe": "rome_trajan", "2Pe": "rome_trajan", "1Jn": "rome_trajan", "2Jn": "rome_trajan",
  "3Jn": "rome_trajan", Jud: "rome_trajan", Rev: "rome_trajan",
  Heb: "roman_judea", Jas: "roman_judea"
};
