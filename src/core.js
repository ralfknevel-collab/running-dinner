// Running Dinner: rekenkern. Draait in de browser en (voor de tests) in Node.
// Geen netwerkverkeer: alles gebeurt op de computer van de gebruiker.
(function (root) {
  "use strict";

  const RONDES = {
    1: "amuse en koud voorgerecht",
    2: "warm voorgerecht en sorbet",
    3: "hoofdgerecht",
    4: "dessert en kaasplankje",
  };
  const GEEN = "geen bijzonderheden";
  const LEEG = new Set(["", "-", "geen", "nee", "n.v.t.", "nvt", GEEN]);
  const KOLOMMEN = {
    id: ["id", "koppelid", "koppel"],
    namen: ["namen", "naam"],
    adres: ["adres"],
    email: ["email", "emailadres", "mail"],
    allergieen: ["allergieen", "allergieendieetwensen", "dieetwensen", "allergieenendieetwensen"],
    ronde_vorig_jaar: ["rondevorigjaar", "vorigjaar"],
    beperkingen: ["beperkingen", "beperking"],
  };

  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function schud(lijst, rand) {
    const a = lijst.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ------------------------------------------------------------ invoer

  function normKop(kop) {
    return String(kop).trim().toLowerCase().replace(/[ëé]/g, "e").replace(/[^a-z]/g, "");
  }

  function leesCsv(tekst) {
    tekst = tekst.replace(/^﻿/, "");
    const eerste = tekst.split(/\r?\n/)[0] || "";
    const sep = (eerste.split(";").length >= eerste.split(",").length) ? ";" : ",";
    const rijen = [];
    let rij = [], cel = "", inQuote = false;
    for (let i = 0; i < tekst.length; i++) {
      const ch = tekst[i];
      if (inQuote) {
        if (ch === '"' && tekst[i + 1] === '"') { cel += '"'; i++; }
        else if (ch === '"') inQuote = false;
        else cel += ch;
      } else if (ch === '"') inQuote = true;
      else if (ch === sep) { rij.push(cel); cel = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && tekst[i + 1] === "\n") i++;
        rij.push(cel); rijen.push(rij); rij = []; cel = "";
      } else cel += ch;
    }
    if (cel !== "" || rij.length) { rij.push(cel); rijen.push(rij); }
    return rijen;
  }

  // rijen: tabel (lijst van lijsten) met kopregel. Geeft {koppels, reserves, fouten, waarschuwingen}.
  function leesKoppels(rijen) {
    rijen = rijen.map((r) => r.map((c) => (c == null ? "" : String(c).trim()))).filter((r) => r.some((c) => c));
    if (!rijen.length) return { koppels: [], reserves: [], fouten: ["Het bestand is leeg."], waarschuwingen: [] };
    const koppen = {};
    rijen[0].forEach((kop, i) => {
      for (const veld in KOLOMMEN) if (KOLOMMEN[veld].includes(normKop(kop))) koppen[veld] = i;
    });
    const ontbreekt = ["id", "namen", "adres", "email"].filter((v) => !(v in koppen));
    if (ontbreekt.length) {
      return { koppels: [], reserves: [], waarschuwingen: [],
        fouten: ["Verplichte kolommen ontbreken: " + ontbreekt.join(", ") + ". Gevonden kopregel: " + rijen[0].join(" | ")] };
    }
    const fouten = [], waarschuwingen = [], koppels = [];
    rijen.slice(1).forEach((rij, idx) => {
      const nr = idx + 2;
      const v = (veld) => (veld in koppen ? rij[koppen[veld]] || "" : "");
      const k = { id: v("id"), namen: v("namen"), adres: v("adres"), email: v("email"),
        allergieen: "", ronde_vorig_jaar: null, niet_rondes: [] };
      for (const veld of ["id", "namen", "adres", "email"]) if (!k[veld]) fouten.push("regel " + nr + ": " + veld + " ontbreekt");
      if (k.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(k.email)) fouten.push("regel " + nr + ": ongeldig e-mailadres '" + k.email + "'");
      if (!LEEG.has(v("allergieen").toLowerCase())) k.allergieen = v("allergieen");
      const vorig = v("ronde_vorig_jaar");
      if (!LEEG.has(vorig.toLowerCase())) {
        const cijfers = vorig.match(/\d+/g) || [];
        if (cijfers.length === 1 && RONDES[+cijfers[0]]) k.ronde_vorig_jaar = +cijfers[0];
        else fouten.push("regel " + nr + ": ronde_vorig_jaar '" + vorig + "' is geen ronde 1 t/m 4");
      }
      for (let deel of v("beperkingen").split(/[;,|]/)) {
        deel = deel.trim();
        if (LEEG.has(deel.toLowerCase())) continue;
        const m = deel.toLowerCase().match(/^niet\D*ronde\D*([1-4])$/);
        if (m) k.niet_rondes.push(+m[1]);
        else waarschuwingen.push("Beperking '" + deel + "' van koppel " + k.id + " (" + k.namen + ") is niet herkend en niet meegenomen.");
      }
      k.verboden = Array.from(new Set(k.niet_rondes.concat(k.ronde_vorig_jaar ? [k.ronde_vorig_jaar] : [])));
      koppels.push(k);
    });
    const tel = (waarden) => waarden.reduce((t, w) => ((t[w] = (t[w] || 0) + 1), t), {});
    const ids = tel(koppels.map((k) => k.id)), mails = tel(koppels.map((k) => k.email.toLowerCase()));
    for (const x in ids) if (x && ids[x] > 1) fouten.push("koppel-ID '" + x + "' komt " + ids[x] + " keer voor");
    for (const x in mails) if (x && mails[x] > 1) fouten.push("e-mailadres '" + x + "' komt " + mails[x] + " keer voor (Laposta ontdubbelt op e-mailadres)");
    for (const k of koppels) if (k.verboden.length === 4) fouten.push("koppel " + k.id + " (" + k.namen + ") kan geen enkele ronde verzorgen");

    // De laatste inschrijvers (onderaan de lijst) zijn reservekoppel als het aantal geen veelvoud van 4 is.
    const over = koppels.length % 4;
    const reserves = over ? koppels.splice(koppels.length - over, over) : [];
    if (koppels.length < 16) fouten.push(koppels.length + " koppels is te weinig: onder de 16 is de indeling niet te maken");
    return { koppels, reserves, fouten, waarschuwingen };
  }

  // ------------------------------------------------------------ indelen

  // Stap 1: verdeel de koppels gelijk over de 4 kookrondes (niet de ronde van vorig jaar).
  function kiesKookrondes(koppels, rand) {
    const m = koppels.length / 4;
    const inRonde = { 1: [], 2: [], 3: [], 4: [] };
    function plaats(k, gezien) {
      for (const r of schud([1, 2, 3, 4], rand)) {
        if (k.verboden.includes(r) || gezien.has(r)) continue;
        gezien.add(r);
        if (inRonde[r].length < m) { inRonde[r].push(k); return true; }
        for (const ander of schud(inRonde[r], rand)) {
          if (plaats(ander, gezien)) { // 'ander' is verhuisd; zijn plek in ronde r is nu vrij
            inRonde[r] = inRonde[r].filter((x) => x !== ander);
            inRonde[r].push(k);
            return true;
          }
        }
      }
      return false;
    }
    for (const k of schud(koppels, rand)) if (!plaats(k, new Set())) return null;
    return inRonde;
  }

  // Verschuivingen A[r][s]: lid x van groep s zit in ronde r aan tafel x (+) A[r][s].
  // Twee koppels uit groep s en u treffen elkaar hooguit 1 keer als A[r][s] (-) A[r][u]
  // voor elke ronde r een andere waarde heeft.
  function verschuivingen(m) {
    if (m === 4) { // optellen is hier XOR, vermenigvuldigen in het lichaam met 4 elementen
      const maal = [[0, 0, 0, 0], [0, 1, 2, 3], [0, 2, 3, 1], [0, 3, 1, 2]];
      return { A: maal, min: (a, b) => a ^ b };
    }
    const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    const min = (a, b) => (((a - b) % m) + m) % m;
    function goed(r, s) { // controleer kolom s tegen eerdere kolommen, voor rijen voor r
      for (let u = 0; u < s; u++)
        for (let r2 = 0; r2 < r; r2++)
          if (min(A[r][s], A[r][u]) === min(A[r2][s], A[r2][u])) return false;
      return true;
    }
    function vul(pos) {
      if (pos === 9) return true;
      const r = 1 + Math.floor(pos / 3), s = 1 + (pos % 3);
      for (let w = 0; w < m; w++) { A[r][s] = w; if (goed(r, s) && vul(pos + 1)) return true; }
      A[r][s] = 0;
      return false;
    }
    if (!vul(0)) return null;
    return { A, min };
  }

  // Geeft tafels: [{ronde, gastheer, gasten:[k,k,k]}], of null als de kookrondes niet te verdelen zijn.
  function maakIndeling(koppels, seed) {
    const rand = rng(seed || 1);
    const m = koppels.length / 4;
    const inRonde = kiesKookrondes(koppels, rand);
    const v = verschuivingen(m);
    if (!inRonde || !v) return null;
    const groep = [1, 2, 3, 4].map((r) => schud(inRonde[r], rand));
    const tafels = [];
    for (let r = 0; r < 4; r++) {
      for (let j = 0; j < m; j++) {
        const aanTafel = [0, 1, 2, 3].map((s) => groep[s][v.min(j, v.A[r][s])]);
        tafels.push({ ronde: r + 1, gastheer: aanTafel[r], gasten: aanTafel.filter((_, s) => s !== r) });
      }
    }
    return tafels;
  }

  // ------------------------------------------------------------ laposta

  function allergieenGasten(tafel) {
    const wensen = tafel.gasten.map((g) => g.allergieen).filter(Boolean);
    if (!wensen.length) return GEEN;
    return wensen.map((w, i) => "gastkoppel " + (i + 1) + ": " + w).join(" | ");
  }

  function lapostaRijen(koppels, tafels) {
    const eigen = new Map(tafels.map((t) => [t.gastheer, t]));
    return koppels.map((k) => {
      const t = eigen.get(k);
      return { email: k.email, namen: k.namen, ronde: "ronde " + t.ronde, gerecht: RONDES[t.ronde],
        allergieen_gasten: allergieenGasten(t) };
    });
  }

  // ------------------------------------------------------------ controle (los van het indelen)

  function controleer(koppels, tafels, laposta) {
    const n = koppels.length, uit = [];
    const naam = (k) => k.id + " (" + k.namen + ")";
    const aanTafel = (t) => [t.gastheer].concat(t.gasten);
    let f;

    f = [];
    for (const k of koppels) {
      const keer = tafels.filter((t) => t.gastheer === k).length;
      if (keer !== 1) f.push(naam(k) + " is " + keer + " keer gastheer");
    }
    uit.push(["1. Elk koppel verzorgt precies 1 ronde, thuis op het eigen adres", f]);

    f = [];
    for (let r = 1; r <= 4; r++) {
      const zit = new Map();
      for (const t of tafels) if (t.ronde === r) for (const k of aanTafel(t)) zit.set(k, (zit.get(k) || 0) + 1);
      for (const k of koppels) if ((zit.get(k) || 0) !== 1) f.push("ronde " + r + ": " + naam(k) + " zit aan " + (zit.get(k) || 0) + " tafels");
    }
    uit.push(["2. Elk koppel zit elke ronde aan precies 1 tafel", f]);

    f = [];
    const nr = new Map(koppels.map((k, i) => [k, i]));
    const samen = new Map();
    for (const t of tafels) {
      const ks = aanTafel(t);
      for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
        const a = Math.min(nr.get(ks[i]), nr.get(ks[j])), b = Math.max(nr.get(ks[i]), nr.get(ks[j]));
        samen.set(a + "-" + b, (samen.get(a + "-" + b) || 0) + 1);
      }
    }
    const ontmoet = koppels.map(() => new Set());
    for (const [paar, x] of samen) {
      const [a, b] = paar.split("-").map(Number);
      ontmoet[a].add(b); ontmoet[b].add(a);
      if (x > 1) f.push(naam(koppels[a]) + " en " + naam(koppels[b]) + " zitten " + x + " keer samen");
    }
    uit.push(["3. Twee koppels zitten maximaal 1 keer samen aan tafel", f]);

    f = tafels.filter((t) => t.gastheer.ronde_vorig_jaar === t.ronde)
      .map((t) => naam(t.gastheer) + " verzorgt net als vorig jaar ronde " + t.ronde);
    uit.push(["4. Geen koppel verzorgt dezelfde ronde als vorig jaar", f]);

    f = [];
    const perMail = new Map(laposta.map((r) => [r.email, r]));
    if (laposta.length !== n || perMail.size !== n) f.push("Laposta-bestand heeft " + laposta.length + " regels voor " + n + " koppels");
    for (const t of tafels) {
      const rij = perMail.get(t.gastheer.email);
      if (!rij) { f.push(naam(t.gastheer) + " ontbreekt in het Laposta-bestand"); continue; }
      const tekst = rij.allergieen_gasten, wensen = t.gasten.map((g) => g.allergieen).filter(Boolean);
      if (!tekst.trim()) f.push(naam(t.gastheer) + ": veld allergieen_gasten is leeg");
      if (!wensen.length && tekst !== GEEN) f.push(naam(t.gastheer) + ": gasten hebben geen wensen, maar er staat '" + tekst + "'");
      for (const w of wensen) if (!tekst.includes(w)) f.push(naam(t.gastheer) + ": wens '" + w + "' van een gast ontbreekt");
      if (rij.ronde !== "ronde " + t.ronde || rij.gerecht !== RONDES[t.ronde]) f.push(naam(t.gastheer) + ": ronde of gerecht in het Laposta-bestand klopt niet");
    }
    uit.push(["5. Het gastkoppel krijgt de allergieën en dieetwensen van de eigen gasten", f]);

    f = [];
    for (let r = 1; r <= 4; r++) {
      const aantal = tafels.filter((t) => t.ronde === r).length;
      if (aantal !== n / 4) f.push("ronde " + r + " heeft " + aantal + " tafels in plaats van " + n / 4);
    }
    for (const t of tafels) if (new Set(aanTafel(t)).size !== 4) f.push("tafel van " + naam(t.gastheer) + " in ronde " + t.ronde + " heeft geen 4 koppels");
    uit.push(["6. Elke tafel heeft 4 koppels (8 personen) en elke ronde heeft evenveel tafels", f]);

    f = koppels.filter((k, i) => ontmoet[i].size !== 12).map((k) => naam(k) + " ontmoet " + ontmoet[nr.get(k)].size + " koppels in plaats van 12");
    uit.push(["7. Elk koppel spreekt 12 andere koppels (24 verschillende mensen)", f]);

    f = tafels.filter((t) => t.gastheer.niet_rondes.includes(t.ronde))
      .map((t) => naam(t.gastheer) + " verzorgt ronde " + t.ronde + ", maar gaf op dat niet te kunnen");
    if (koppels.some((k) => k.niet_rondes.length)) uit.push(["8. Opgegeven beperkingen (niet een bepaalde ronde) zijn gevolgd", f]);
    return uit;
  }

  function rapportTekst(koppels, reserves, controles, waarschuwingen) {
    const n = koppels.length, fout = controles.reduce((t, c) => t + c[1].length, 0);
    const regels = ["CONTROLERAPPORT RUNNING DINNER", "",
      n + " koppels (" + 2 * n + " personen), " + n / 4 + " tafels per ronde.",
      "UITSLAG: " + (fout ? fout + " OVERTREDING(EN). Deze indeling niet gebruiken." : "alle controles geslaagd."), ""];
    for (const [titel, f] of controles) {
      regels.push("[" + (f.length ? "FOUT" : "OK  ") + "] " + titel);
      for (const x of f) regels.push("         - " + x);
    }
    if (reserves.length) {
      regels.push("", "RESERVEKOPPELS (laatste inschrijvers, niet ingedeeld):");
      for (const k of reserves) regels.push("  - " + k.id + " (" + k.namen + ")");
    }
    if (waarschuwingen.length) { regels.push("", "LET OP:"); for (const w of waarschuwingen) regels.push("  - " + w); }
    return regels.join("\n") + "\n";
  }

  // Tabellen voor scherm en Excel.
  function tabellen(koppels, tafels) {
    const teller = {};
    const perRonde = [["Ronde", "Gerecht", "Tafel", "Adres", "Gastkoppel (kookt)", "Gast 1", "Gast 2", "Gast 3", "Allergieën en dieetwensen gasten"]];
    for (const t of tafels) {
      teller[t.ronde] = (teller[t.ronde] || 0) + 1;
      perRonde.push([t.ronde, RONDES[t.ronde], teller[t.ronde], t.gastheer.adres, t.gastheer.namen + " (" + t.gastheer.id + ")"]
        .concat(t.gasten.map((g) => g.namen + " (" + g.id + ")"), [allergieenGasten(t)]));
    }
    const perKoppel = [["ID", "Namen", "Verzorgt"].concat([1, 2, 3, 4].map((r) => "Ronde " + r + ": " + RONDES[r]))];
    const eigen = new Map(tafels.map((t) => [t.gastheer, t]));
    for (const k of koppels) {
      const rij = [k.id, k.namen, "ronde " + eigen.get(k).ronde + ": " + RONDES[eigen.get(k).ronde]];
      for (let r = 1; r <= 4; r++) {
        const t = tafels.find((t) => t.ronde === r && (t.gastheer === k || t.gasten.includes(k)));
        rij.push(t.gastheer === k ? "THUIS (kookt zelf)" : t.gastheer.adres + ", bij " + t.gastheer.namen);
      }
      perKoppel.push(rij);
    }
    const historie = [["id", "namen", "ronde_vorig_jaar"]].concat(koppels.map((k) => [k.id, k.namen, eigen.get(k).ronde]));
    return { perRonde, perKoppel, historie };
  }

  function naarCsv(rijen) {
    return "﻿" + rijen.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(";")).join("\r\n") + "\r\n";
  }

  const RD = { RONDES, GEEN, leesCsv, leesKoppels, maakIndeling, lapostaRijen, controleer, rapportTekst, tabellen, naarCsv, verschuivingen };
  if (typeof module !== "undefined" && module.exports) module.exports = RD;
  else root.RD = RD;
})(typeof window !== "undefined" ? window : globalThis);
