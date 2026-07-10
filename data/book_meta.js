// Canonical book order, testament, chapter counts, and availability of interlinear data.
window.BOOK_META = [
  {a:"Gen",n:"Genesis",t:"OT",ch:50}, {a:"Exo",n:"Exodus",t:"OT",ch:40}, {a:"Lev",n:"Leviticus",t:"OT",ch:27},
  {a:"Num",n:"Numbers",t:"OT",ch:36}, {a:"Deu",n:"Deuteronomy",t:"OT",ch:34}, {a:"Jos",n:"Joshua",t:"OT",ch:24},
  {a:"Jdg",n:"Judges",t:"OT",ch:21}, {a:"Rut",n:"Ruth",t:"OT",ch:4}, {a:"1Sa",n:"I Samuel",t:"OT",ch:31},
  {a:"2Sa",n:"II Samuel",t:"OT",ch:24}, {a:"1Ki",n:"I Kings",t:"OT",ch:22}, {a:"2Ki",n:"II Kings",t:"OT",ch:25},
  {a:"1Ch",n:"I Chronicles",t:"OT",ch:29}, {a:"2Ch",n:"II Chronicles",t:"OT",ch:36}, {a:"Ezr",n:"Ezra",t:"OT",ch:10},
  {a:"Neh",n:"Nehemiah",t:"OT",ch:13}, {a:"Est",n:"Esther",t:"OT",ch:10}, {a:"Job",n:"Job",t:"OT",ch:42},
  {a:"Psa",n:"Psalms",t:"OT",ch:150}, {a:"Pro",n:"Proverbs",t:"OT",ch:31}, {a:"Ecc",n:"Ecclesiastes",t:"OT",ch:12},
  {a:"Sng",n:"Song of Solomon",t:"OT",ch:8}, {a:"Isa",n:"Isaiah",t:"OT",ch:66}, {a:"Jer",n:"Jeremiah",t:"OT",ch:52},
  {a:"Lam",n:"Lamentations",t:"OT",ch:5}, {a:"Ezk",n:"Ezekiel",t:"OT",ch:48}, {a:"Dan",n:"Daniel",t:"OT",ch:12},
  {a:"Hos",n:"Hosea",t:"OT",ch:14}, {a:"Jol",n:"Joel",t:"OT",ch:3}, {a:"Amo",n:"Amos",t:"OT",ch:9},
  {a:"Oba",n:"Obadiah",t:"OT",ch:1}, {a:"Jon",n:"Jonah",t:"OT",ch:4}, {a:"Mic",n:"Micah",t:"OT",ch:7},
  {a:"Nam",n:"Nahum",t:"OT",ch:3}, {a:"Hab",n:"Habakkuk",t:"OT",ch:3}, {a:"Zep",n:"Zephaniah",t:"OT",ch:3},
  {a:"Hag",n:"Haggai",t:"OT",ch:2}, {a:"Zec",n:"Zechariah",t:"OT",ch:14}, {a:"Mal",n:"Malachi",t:"OT",ch:4},
  {a:"Mat",n:"Matthew",t:"NT",ch:28}, {a:"Mrk",n:"Mark",t:"NT",ch:16}, {a:"Luk",n:"Luke",t:"NT",ch:24},
  {a:"Jhn",n:"John",t:"NT",ch:21}, {a:"Act",n:"Acts",t:"NT",ch:28}, {a:"Rom",n:"Romans",t:"NT",ch:16},
  {a:"1Co",n:"I Corinthians",t:"NT",ch:16}, {a:"2Co",n:"II Corinthians",t:"NT",ch:13}, {a:"Gal",n:"Galatians",t:"NT",ch:6},
  {a:"Eph",n:"Ephesians",t:"NT",ch:6}, {a:"Php",n:"Philippians",t:"NT",ch:4}, {a:"Col",n:"Colossians",t:"NT",ch:4},
  {a:"1Th",n:"I Thessalonians",t:"NT",ch:5}, {a:"2Th",n:"II Thessalonians",t:"NT",ch:3}, {a:"1Ti",n:"I Timothy",t:"NT",ch:6},
  {a:"2Ti",n:"II Timothy",t:"NT",ch:4}, {a:"Tit",n:"Titus",t:"NT",ch:3}, {a:"Phm",n:"Philemon",t:"NT",ch:1},
  {a:"Heb",n:"Hebrews",t:"NT",ch:13}, {a:"Jas",n:"James",t:"NT",ch:5}, {a:"1Pe",n:"I Peter",t:"NT",ch:5},
  {a:"2Pe",n:"II Peter",t:"NT",ch:3}, {a:"1Jn",n:"I John",t:"NT",ch:5}, {a:"2Jn",n:"II John",t:"NT",ch:1},
  {a:"3Jn",n:"III John",t:"NT",ch:1}, {a:"Jud",n:"Jude",t:"NT",ch:1}, {a:"Rev",n:"Revelation of John",t:"NT",ch:22}
];

// Books for which Greek/Hebrew interlinear word data has been processed.
// Full 66-book coverage: entire Bible has word-by-word original-language data.
window.INTERLINEAR_AVAILABLE = new Set(window.BOOK_META.map(b => b.a));
