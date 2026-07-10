// Curated biblical place names with archaeological significance.
// Links point to Wikimedia Commons search results (real, live search endpoint -
// not a guessed deep link) so users can browse historical/excavation photography.
window.BIBLE_PLACES = [
  {names:["Eden"], label:"Eden", note:"Traditionally located near the Tigris–Euphrates region of Mesopotamia."},
  {names:["Ararat"], label:"Mount Ararat", note:"Mountain in eastern Turkey traditionally associated with the resting place of the ark."},
  {names:["Ur","Ur of the Chaldees"], label:"Ur", note:"Sumerian city-state in southern Mesopotamia (modern Tell el-Muqayyar, Iraq); extensively excavated ziggurat and royal tombs."},
  {names:["Haran"], label:"Harran", note:"Ancient city in Upper Mesopotamia (modern southeastern Turkey)."},
  {names:["Canaan"], label:"Canaan", note:"The Levant region encompassing modern Israel, Palestine, Lebanon, and parts of Syria/Jordan."},
  {names:["Shechem"], label:"Shechem", note:"Excavated as Tell Balata near Nablus, West Bank."},
  {names:["Bethel"], label:"Bethel", note:"Identified with Beitin, north of Jerusalem."},
  {names:["Hebron"], label:"Hebron", note:"One of the oldest continuously inhabited cities in the region; site of the Cave of Machpelah."},
  {names:["Sodom"], label:"Sodom", note:"Traditionally located near the Dead Sea; candidate sites include Bab edh-Dhra and Tall el-Hammam."},
  {names:["Gomorrah"], label:"Gomorrah", note:"Traditionally located near the Dead Sea plain."},
  {names:["Egypt"], label:"Ancient Egypt", note:"Nile valley civilization; extensive archaeological record from the Old Kingdom through the New Kingdom era of the Exodus narrative."},
  {names:["Goshen"], label:"Goshen", note:"Region of the eastern Nile Delta traditionally settled by the Israelites."},
  {names:["Rameses","Raamses"], label:"Pi-Ramesses", note:"Nile Delta store-city; identified with the archaeological site of Qantir."},
  {names:["Sinai","Mount Sinai","Horeb"], label:"Mount Sinai", note:"Traditional site in the southern Sinai Peninsula, associated with Saint Catherine's Monastery."},
  {names:["Kadesh","Kadeshbarnea","Kadesh-barnea"], label:"Kadesh Barnea", note:"Wilderness oasis site on the northern Sinai/Negev border, excavated at Tell el-Qudeirat."},
  {names:["Jericho"], label:"Jericho", note:"One of the oldest continuously inhabited cities in the world; Tell es-Sultan shows Bronze Age fortification walls."},
  {names:["Shiloh"], label:"Shiloh", note:"Early Israelite religious center; excavated at Khirbet Seilun, West Bank."},
  {names:["Jerusalem"], label:"Jerusalem", note:"City of David excavations, the Western Wall, Temple Mount environs, and the Pool of Siloam."},
  {names:["Bethlehem"], label:"Bethlehem", note:"Town south of Jerusalem; site of the Church of the Nativity."},
  {names:["Nazareth"], label:"Nazareth", note:"Galilean village; excavations have uncovered first-century dwellings near the Church of the Annunciation."},
  {names:["Capernaum"], label:"Capernaum", note:"Fishing village on the Sea of Galilee; excavated synagogue and traditional site of Peter's house."},
  {names:["Bethsaida"], label:"Bethsaida", note:"Identified with et-Tell or el-Araj on the northern shore of the Sea of Galilee."},
  {names:["Chorazin","Korazim"], label:"Chorazin", note:"Ruined Galilean town with an excavated ancient synagogue."},
  {names:["Cana"], label:"Cana", note:"Galilean village; candidate sites include Kafr Kanna and Khirbet Qana."},
  {names:["Galilee","Sea of Galilee"], label:"Sea of Galilee", note:"Freshwater lake in northern Israel central to the Gospel narratives."},
  {names:["Samaria"], label:"Samaria", note:"Capital of the northern kingdom of Israel; extensive excavations at Sebastia."},
  {names:["Sychar"], label:"Sychar", note:"Samaritan town near Jacob's Well, close to modern Nablus."},
  {names:["Jordan","Jordan River"], label:"Jordan River", note:"River central to the Exodus and Gospel narratives, including the baptism site near Bethany beyond the Jordan."},
  {names:["Bethany"], label:"Bethany", note:"Village near Jerusalem on the Mount of Olives; traditional site of Lazarus's tomb (el-Eizariya)."},
  {names:["Emmaus"], label:"Emmaus", note:"Village near Jerusalem; several archaeological candidates including Emmaus Nicopolis."},
  {names:["Mount of Olives"], label:"Mount of Olives", note:"Ridge east of Jerusalem overlooking the Temple Mount and Kidron Valley."},
  {names:["Gethsemane"], label:"Gethsemane", note:"Garden at the foot of the Mount of Olives with ancient olive trees."},
  {names:["Golgotha","Calvary"], label:"Golgotha", note:"Traditional crucifixion site associated with the Church of the Holy Sepulchre."},
  {names:["Caesarea"], label:"Caesarea Maritima", note:"Herodian port city on the Mediterranean coast with an excavated theater, aqueduct, and harbor."},
  {names:["Damascus"], label:"Damascus", note:"One of the oldest continuously inhabited cities in the world."},
  {names:["Nineveh"], label:"Nineveh", note:"Assyrian capital across the Tigris from modern Mosul, Iraq; excavated palace reliefs."},
  {names:["Babylon"], label:"Babylon", note:"Mesopotamian capital on the Euphrates, south of modern Baghdad; site of the Ishtar Gate."},
  {names:["Tyre"], label:"Tyre", note:"Phoenician port city in modern Lebanon with extensive Roman-era ruins."},
  {names:["Sidon"], label:"Sidon", note:"Ancient Phoenician port city in modern Lebanon."},
  {names:["Moab"], label:"Moab", note:"Kingdom east of the Dead Sea in modern Jordan."},
  {names:["Edom"], label:"Edom", note:"Kingdom south of the Dead Sea; associated with the site of Petra region in modern Jordan."},
  {names:["Nebo","Mount Nebo"], label:"Mount Nebo", note:"Mountain in modern Jordan traditionally identified as Moses's viewpoint over the Promised Land."}
];

function bibleCommonsSearchUrl(query) {
  return "https://commons.wikimedia.org/w/index.php?search=" + encodeURIComponent(query) +
    "&title=Special:MediaSearch&type=image";
}

// Scan a passage of plain English text and return the distinct places it mentions.
function findPlacesInText(text) {
  if (!text) return [];
  const found = [];
  const seen = new Set();
  for (const place of window.BIBLE_PLACES) {
    for (const name of place.names) {
      const re = new RegExp("\\b" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
      if (re.test(text) && !seen.has(place.label)) {
        seen.add(place.label);
        found.push(place);
        break;
      }
    }
  }
  return found;
}
