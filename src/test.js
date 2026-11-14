// Test de rekenkern: node src/test.js
const RD = require("./core.js");
const fs = require("fs");
let fouten = 0;
const check = (ok, tekst) => { if (!ok) { fouten++; console.log("MISLUKT: " + tekst); } };

function maakRijen(n, seed) {
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const rijen = [["id", "namen", "adres", "email", "allergieen", "ronde_vorig_jaar", "beperkingen"]];
  for (let i = 1; i <= n; i++) {
    rijen.push(["K" + i, "Koppel " + i, "Straat " + i, "k" + i + "@example.nl",
      rand() < 0.3 ? "wens" + i : "", rand() < 0.85 ? String(1 + Math.floor(rand() * 4)) : "",
      rand() < 0.1 ? "niet ronde " + (1 + Math.floor(rand() * 4)) : ""]);
  }
  return rijen;
}

// 1. Alle groepsgroottes van 16 t/m 200 koppels, meerdere seeds: elke controle moet slagen.
for (let n = 16; n <= 200; n += 4) {
  for (let seed = 1; seed <= 5; seed++) {
    const { koppels, reserves, fouten: f } = RD.leesKoppels(maakRijen(n, seed * 7 + n));
    check(!f.length && !reserves.length, n + " koppels: invoerfouten " + f.join("; "));
    const tafels = RD.maakIndeling(koppels, seed);
    check(tafels, n + " koppels, seed " + seed + ": geen indeling");
    if (!tafels) continue;
    const slecht = RD.controleer(koppels, tafels, RD.lapostaRijen(koppels, tafels)).filter((c) => c[1].length);
    check(!slecht.length, n + " koppels, seed " + seed + ": " + JSON.stringify(slecht.slice(0, 2)));
  }
}

// 2. Reservekoppels: 50 inschrijvingen geeft 48 ingedeeld en de laatste 2 als reserve.
let r = RD.leesKoppels(maakRijen(50, 3));
check(r.koppels.length === 48 && r.reserves.length === 2 && r.reserves[1].id === "K50", "reservekoppels");
check(!r.fouten.length, "reserve mag geen fout geven");

// 3. Foute invoer wordt gemeld.
r = RD.leesKoppels(maakRijen(12, 3));
check(r.fouten.some((x) => x.includes("te weinig")), "te weinig koppels");
const dubbel = maakRijen(16, 3); dubbel[2][3] = dubbel[1][3]; dubbel[3][0] = "";
r = RD.leesKoppels(dubbel);
check(r.fouten.some((x) => x.includes("keer voor")) && r.fouten.some((x) => x.includes("id ontbreekt")), "dubbel e-mailadres en leeg id");

// 4. De controle vangt ingebouwde fouten.
r = RD.leesKoppels(maakRijen(48, 9));
let tafels = RD.maakIndeling(r.koppels, 1), lap = RD.lapostaRijen(r.koppels, tafels);
// twee gasten van tafel 0 nog een keer samen zetten in een latere ronde
const [a, b] = tafels[0].gasten;
const later = tafels.find((t) => t.ronde > 1 && t.gasten.includes(a));
later.gasten[later.gasten.indexOf(a) === 0 ? 1 : 0] = b;
tafels[5].gastheer.ronde_vorig_jaar = tafels[5].ronde;
lap.find((x) => x.allergieen_gasten !== RD.GEEN).allergieen_gasten = RD.GEEN;
const uitslag = RD.controleer(r.koppels, tafels, lap).map((c) => c[1].length > 0);
check(uitslag[1] && uitslag[2] && uitslag[3] && uitslag[4], "controle mist ingebouwde fouten: " + uitslag);

// 5. Elke seed geeft een andere indeling; dezelfde seed dezelfde.
r = RD.leesKoppels(maakRijen(48, 9));
const sleutel = (seed) => RD.maakIndeling(r.koppels, seed).map((t) => t.gastheer.id + ":" + t.gasten.map((g) => g.id)).join("|");
check(sleutel(1) === sleutel(1) && sleutel(1) !== sleutel(2), "seeds");

// 6. CSV met puntkomma's, aanhalingstekens en het echte testbestand.
const csv = RD.leesCsv('id;namen\r\n1;"Jan; ""de"" Vries"\r\n');
check(csv.length === 2 && csv[1][1] === 'Jan; "de" Vries', "csv-parser");
const echt = RD.leesKoppels(RD.leesCsv(fs.readFileSync(__dirname + "/../testdata/deelnemers_fictief.csv", "utf8")));
check(echt.koppels.length === 48 && !echt.fouten.length, "testbestand inlezen");

console.log(fouten ? fouten + " test(s) mislukt" : "Alle tests geslaagd");
process.exit(fouten ? 1 : 0);
