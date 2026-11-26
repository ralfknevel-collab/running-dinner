// Test de rekenkern: node src/test.js
const RD = require("./core.js");
const XLSX = require("./xlsx.full.min.js");
const fs = require("fs");
let fouten = 0;
const check = (ok, tekst) => { if (!ok) { fouten++; console.log("MISLUKT: " + tekst); } };
const KOP = ["id", "namen", "adres", "email", "tweede_mailadres", "dieetwens_a", "dieetwens_b", "ronde_vorig_jaar", "beperkingen"];

function maakRijen(n, seed) {
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const rijen = [KOP];
  for (let i = 1; i <= n; i++) {
    rijen.push(["K" + i, "Koppel " + i, "Straat " + i, "k" + i + "@example.nl", rand() < 0.6 ? "p" + i + "@example.nl" : "",
      rand() < 0.2 ? "wens a" + i : "", rand() < 0.2 ? "wens b" + i : "", rand() < 0.85 ? String(1 + Math.floor(rand() * 4)) : "",
      rand() < 0.1 ? "niet ronde " + (1 + Math.floor(rand() * 4)) : ""]);
  }
  return rijen;
}
// n koppels die allemaal netjes kunnen doorschuiven: per ronde evenveel.
function nette(n, extra) {
  const rijen = [KOP];
  for (let i = 1; i <= n; i++) rijen.push(["K" + i, "Koppel " + i, "Straat " + i, "k" + i + "@example.nl", "", "", "", String(1 + (i % 4)), ""]);
  for (const [nr, kolom, waarde] of extra || []) rijen[nr][KOP.indexOf(kolom)] = waarde;
  return rijen;
}
const indeling = (rijen, seed, eigen) => {
  const r = RD.leesKoppels(rijen), inst = RD.instellingen(eigen);
  const tafels = RD.maakIndeling(r.koppels, seed || 1, inst);
  const laposta = tafels && RD.lapostaRijen(r.koppels, tafels, inst);
  return Object.assign(r, { inst, tafels, laposta, controles: tafels && RD.controleer(r.koppels, tafels, laposta, inst) });
};
const kookt = (x, id) => x.tafels.find((t) => t.gastheer.id === id).ronde;

// 1. Alle groepsgroottes van 16 t/m 200 koppels, meerdere seeds, met en zonder silo's doorbreken: elke controle moet slagen.
for (let n = 16; n <= 200; n += 4) {
  for (let seed = 1; seed <= 5; seed++) {
    for (const mix of [true, false]) {
      const x = indeling(maakRijen(n, seed * 7 + n), seed, { mix });
      check(!x.fouten.length && !x.reserves.length, n + " koppels: invoerfouten " + x.fouten.join("; "));
      check(x.tafels, n + " koppels, seed " + seed + ": geen indeling");
      if (!x.tafels) continue;
      const slecht = x.controles.filter((c) => c[1].length);
      check(!slecht.length, n + " koppels, seed " + seed + ", mix " + mix + ": " + JSON.stringify(slecht.slice(0, 2)));
      const silo = RD.siloInfo(x.koppels, x.tafels);
      if (!mix) check(silo.gemiddeld === 0, n + " koppels zonder mix: toch koppels uit dezelfde kookgroep samen");
      else if (n >= 32) check(silo.min >= 1, n + " koppels, seed " + seed + ": een koppel treft niemand uit de eigen kookgroep");
    }
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
r = RD.leesKoppels(nette(16, [[1, "tweede_mailadres", "k2@example.nl"]]));
check(r.fouten.some((x) => x.includes("k2@example.nl")), "tweede adres dat ook bij een ander koppel staat");
r = RD.leesKoppels(nette(16, [[1, "beperkingen", "wil ronde 2; niet ronde 2"], [2, "beperkingen", "wil ronde 1; wil ronde 4"]]));
check(r.fouten.length === 2, "tegenstrijdige wensen voor de kookronde: " + r.fouten.join(" / "));

// 4. De controle vangt ingebouwde fouten.
let x = indeling(maakRijen(48, 9), 1, { mix: false });
const [a, b] = x.tafels[0].gasten;
const later = x.tafels.find((t) => t.ronde > 1 && t.gasten.includes(a));
later.gasten[later.gasten.indexOf(a) === 0 ? 1 : 0] = b; // twee gasten van tafel 0 nog een keer samen
x.tafels[5].gastheer.ronde_vorig_jaar = x.tafels[5].ronde;
x.laposta.find((rij) => rij.dieetwensen_gasten !== RD.GEEN).dieetwensen_gasten = RD.GEEN;
const uitslag = RD.controleer(x.koppels, x.tafels, x.laposta, x.inst).map((c) => c[1].length > 0);
check(uitslag[1] && uitslag[2] && uitslag[3] && uitslag[4], "controle mist ingebouwde fouten: " + uitslag);

// 5. Elke seed geeft een andere indeling; dezelfde seed dezelfde.
r = RD.leesKoppels(maakRijen(48, 9));
const sleutel = (seed) => RD.maakIndeling(r.koppels, seed).map((t) => t.gastheer.id + ":" + t.gasten.map((g) => g.id)).join("|");
check(sleutel(1) === sleutel(1) && sleutel(1) !== sleutel(2), "seeds");

// 6. CSV met puntkomma's, aanhalingstekens en het echte testbestand (oude kolom allergieen per koppel).
const csv = RD.leesCsv('id;namen\r\n1;"Jan; ""de"" Vries"\r\n');
check(csv.length === 2 && csv[1][1] === 'Jan; "de" Vries', "csv-parser");
const echt = RD.leesKoppels(RD.leesCsv(fs.readFileSync(__dirname + "/../testdata/deelnemers_fictief.csv", "utf8")));
check(echt.koppels.length === 48 && !echt.fouten.length && !echt.waarschuwingen.length, "testbestand inlezen: " + echt.fouten.concat(echt.waarschuwingen).join(" / "));
check(RD.maakIndeling(echt.koppels, 1), "testbestand indelen");
// Een lijst in het oude formaat (één kolom allergieen per koppel) werkt nog, met een waarschuwing.
const oud = RD.leesKoppels([["id", "namen", "adres", "email", "allergieen", "ronde_vorig_jaar"]].concat(nette(16).slice(1).map((rij, i) => [rij[0], rij[1], rij[2], rij[3], i === 0 ? "notenallergie" : "", rij[7]])));
check(!oud.fouten.length && oud.koppels[0].wensen[0].per === "koppel" && oud.waarschuwingen.some((w) => w.includes("dieetwens_a")), "oude kolom allergieen geeft een waarschuwing");

// 7. Doorschuiven: wie kan, kookt de gang na die van vorig jaar.
x = indeling(nette(48));
check(x.koppels.every((k) => kookt(x, k.id) === (k.ronde_vorig_jaar % 4) + 1), "iedereen schuift één gang door als dat past");
check(RD.toelichting(x.koppels, x.tafels, x.inst).afwijkers.length === 0, "geen afwijkers als het past");
// 8 koppels van ronde 3 naar ronde 1 gezet: ronde 2 zou 20 koks krijgen en ronde 4 maar 4. Minimaal 8 moeten afwijken.
const scheef = nette(48); let verzet = 0;
for (let i = 1; i <= 48 && verzet < 8; i++) if (scheef[i][7] === "3") { scheef[i][7] = "1"; verzet++; }
x = indeling(scheef);
check(x.controles.every((c) => !c[1].length), "scheve verdeling: controles");
const afw = RD.toelichting(x.koppels, x.tafels, x.inst).afwijkers.length;
check(afw === 8, "scheve verdeling: 8 afwijkers is het minimum, het werden er " + afw);

// 8. Nieuwe deelnemers koken niet het hoofdgerecht (ronde 3); wensen en afkortingen worden gevolgd.
const nieuw = nette(48); for (let i = 1; i <= 12; i++) nieuw[i][7] = ""; // 12 nieuwe koppels
nieuw[20][8] = "wil ronde 3"; nieuw[21][8] = "wil hg"; nieuw[22][8] = "niet kv"; nieuw[23][7] = "wv"; nieuw[24][7] = "D";
for (let seed = 1; seed <= 10; seed++) {
  x = indeling(nieuw, seed);
  check(x.controles.every((c) => !c[1].length), "nieuwe deelnemers: controles seed " + seed);
  check(x.koppels.filter((k) => !k.ronde_vorig_jaar).every((k) => kookt(x, k.id) !== 3), "nieuw koppel kookt hoofdgerecht, seed " + seed);
  check(kookt(x, "K20") === 3 && kookt(x, "K21") === 3 && kookt(x, "K22") !== 1, "wil ronde / niet ronde, seed " + seed);
}
check(x.koppels.find((k) => k.id === "K23").ronde_vorig_jaar === 2 && x.koppels.find((k) => k.id === "K24").ronde_vorig_jaar === 4, "afkortingen wv en D");
// Wie om dezelfde ronde vraagt als vorig jaar krijgt die, zonder dat controle 4 afgaat.
x = indeling(nette(48, [[5, "beperkingen", "wil ronde 2"]])); // K5 kookte ronde 2
check(kookt(x, "K5") === 2 && x.controles.every((c) => !c[1].length), "zelfde ronde op eigen verzoek");

// 9. Dieetwensen per persoon: het gastkoppel krijgt per gast één bolletje, zonder namen.
const wensen = nette(48, [[1, "dieetwens_a", "eet geen vlees"], [1, "dieetwens_b", "eet geen vlees"], [2, "dieetwens_b", "allergisch voor noten"]]);
x = indeling(wensen);
for (const t of x.tafels) {
  const verwacht = t.gasten.reduce((n, g) => n + g.wensen.length, 0);
  const rij = x.laposta.find((l) => l.email === t.gastheer.email);
  check(verwacht ? rij.dieetwensen_gasten.split("• ").length - 1 === verwacht : rij.dieetwensen_gasten === RD.GEEN, "aantal bolletjes bij " + t.gastheer.id);
  check(!/Koppel \d/.test(rij.dieetwensen_gasten), "naam van een gast in de dieetwensen");
}
check(x.laposta.filter((l) => l.dieetwensen_gasten.includes("• eet geen vlees • eet geen vlees")).length === 3, "twee vegetariërs in één koppel geven twee bolletjes bij hun 3 gastkoppels");
// Tweede e-mailadres: beide partners krijgen dezelfde regel.
x = indeling(nette(48, [[3, "tweede_mailadres", "partner3@example.nl"]]));
const beide = x.laposta.filter((l) => l.namen === "Koppel 3");
check(x.laposta.length === 49 && beide.length === 2 && beide[0].dieetwensen_gasten === beide[1].dieetwensen_gasten && beide[1].email === "partner3@example.nl", "tweede e-mailadres");
// Te lange tekst voor een Laposta-tekstveld wordt gemeld.
const lang = nette(48); for (let i = 1; i <= 48; i++) { lang[i][5] = "allergisch voor " + "x".repeat(60); lang[i][6] = "allergisch voor " + "y".repeat(60); }
x = indeling(lang);
check(RD.teLangVoorLaposta(x.laposta).length === 48, "te lange dieetwensen worden gemeld");

// 10. Loopbriefjes: start voor de gasten van ronde 1, daarna per tafel van ronde 1 t/m 3 het adres van de volgende ronde.
x = indeling(maakRijen(48, 9), 1, { rondes: [{}, { naam: "het Tweede", tijd: "19.45" }, {}, {}] });
const lb = RD.loopbriefjes(x.koppels, x.tafels, x.inst);
check(lb.start.length === 36 && lb.enveloppen.length === 36 && lb.enveloppen.every((e) => e.briefjes.length === 4), "aantallen loopbriefjes");
for (const e of lb.enveloppen) {
  const tafel = x.tafels.filter((t) => t.ronde === e.ronde)[e.tafel - 1];
  check(e.gastheer === tafel.gastheer.namen && e.openen === x.inst.rondes[e.ronde - 1].envelop, "kop van de envelop");
  [tafel.gastheer].concat(tafel.gasten).forEach((k, i) => {
    const volgend = x.tafels.find((t) => t.ronde === e.ronde + 1 && (t.gastheer === k || t.gasten.includes(k)));
    const br = e.briefjes[i];
    check(br.namen === k.namen && br.adres === volgend.gastheer.adres && br.kok === (volgend.gastheer === k) && br.tijd === x.inst.rondes[e.ronde].tijd, "briefje van " + k.id + " na ronde " + e.ronde);
  });
}
const eerste = lb.enveloppen.find((e) => e.ronde === 1).briefjes[0];
check(eerste.gang === "het Tweede" && eerste.tijd === "19.45", "eigen namen en tijden");
const docx = RD.loopbriefjesDocx(lb);
check(Object.keys(docx).length === 5 && docx["word/document.xml"].split("Beste Koppel").length - 1 === 36 + 36 * 4, "Word-onderdelen");
const metTekens = RD.loopbriefjesDocx({ start: [{ namen: "A & B <C>", gang: "g", tijd: "1", kok: false, bij: "D", adres: "E" }], enveloppen: [] });
check(metTekens["word/document.xml"].includes("A &amp; B &lt;C&gt;"), "bijzondere tekens in het Word-bestand");
// Het zip-bestand dat de pagina maakt moet weer uit te pakken zijn.
const zip = XLSX.CFB.utils.cfb_new();
for (const pad in docx) XLSX.CFB.utils.cfb_add(zip, pad, Buffer.from(docx[pad], "utf8"));
const bytes = XLSX.CFB.write(zip, { fileType: "zip", type: "buffer" });
const terug = XLSX.CFB.read(bytes, { type: "buffer" });
const uitgepakt = XLSX.CFB.find(terug, "/word/document.xml");
check(uitgepakt && Buffer.from(uitgepakt.content).toString("utf8") === docx["word/document.xml"], "docx als zip: " + terug.FullPaths.join(","));
if (process.argv[2]) fs.writeFileSync(process.argv[2], bytes); // node src/test.js proef.docx

console.log(fouten ? fouten + " test(s) mislukt" : "Alle tests geslaagd");
process.exit(fouten ? 1 : 0);
