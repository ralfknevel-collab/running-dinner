// Running Dinner: rekenkern. Draait in de browser en (voor de tests) in Node.
// Geen netwerkverkeer: alles gebeurt op de computer van de gebruiker.
(function (root) {
  "use strict";

  // Namen en tijden van de vier rondes. In de pagina aan te passen; dit zijn de standaardwaarden.
  // naam: zoals hij in een zin past ("Voor ... worden jullie verwacht bij").
  // tijd: aankomst van de gasten. envelop: wanneer de envelop met de volgende adressen open mag.
  const STANDAARD = {
    rondes: [
      { naam: "de Amuses en het Koude Voorgerecht", tijd: "18.15", envelop: "19.15" },
      { naam: "het Warme Voorgerecht en de Spoom", tijd: "19.30", envelop: "20.30" },
      { naam: "het Hoofdgerecht", tijd: "20.45", envelop: "22.00" },
      { naam: "het Dessert en het Kaasplankje", tijd: "22.15", envelop: "" },
    ],
    mix: true, // silo's doorbreken: koppels die dezelfde gang koken komen elkaar ook tegen
  };
  const KORT = ["KV", "WV", "HG", "D"];
  const AFKORTING = { kv: 1, wv: 2, hg: 3, d: 4, dessert: 4 };
  const GEEN = "geen dieetwensen opgegeven";
  const LEEG = new Set(["", "-", "geen", "nee", "n.v.t.", "nvt", "geen bijzonderheden", GEEN]);
  const KOLOMMEN = {
    id: ["id", "koppelid", "koppel"],
    namen: ["namen", "naam"],
    adres: ["adres"],
    email: ["email", "emailadres", "mail", "emaila"],
    email2: ["tweedemailadres", "tweedeemailadres", "tweedeemail", "emailb"],
    wens_a: ["dieetwensa", "allergiea", "dieetwenspersoona"],
    wens_b: ["dieetwensb", "allergieb", "dieetwenspersoonb"],
    allergieen: ["allergieen", "allergieendieetwensen", "dieetwensen", "allergieenendieetwensen"],
    ronde_vorig_jaar: ["rondevorigjaar", "vorigjaar"],
    beperkingen: ["beperkingen", "beperking"],
  };

  function instellingen(eigen) {
    eigen = eigen || {};
    const rondes = STANDAARD.rondes.map((std, i) => {
      const e = (eigen.rondes && eigen.rondes[i]) || {};
      const kies = (veld) => (typeof e[veld] === "string" && e[veld].trim() ? e[veld].trim() : std[veld]);
      return { naam: kies("naam"), tijd: kies("tijd"), envelop: i === 3 ? "" : kies("envelop") };
    });
    return { rondes, mix: eigen.mix === undefined ? STANDAARD.mix : !!eigen.mix };
  }

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
    tekst = tekst.replace(/^\uFEFF/, "");
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

  // "3", "ronde 3" of een afkorting (kv, wv, hg, d). Geeft 1 t/m 4, of null.
  function leesRonde(tekst) {
    const t = String(tekst).trim().toLowerCase();
    if (AFKORTING[t]) return AFKORTING[t];
    const cijfers = t.match(/\d+/g) || [];
    return cijfers.length === 1 && +cijfers[0] >= 1 && +cijfers[0] <= 4 ? +cijfers[0] : null;
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
    const geldigMail = (m) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m);
    const schoon = (s) => (LEEG.has(s.toLowerCase()) ? "" : s);
    let perKoppel = 0;
    rijen.slice(1).forEach((rij, idx) => {
      const nr = idx + 2;
      const v = (veld) => (veld in koppen ? rij[koppen[veld]] || "" : "");
      const k = { id: v("id"), namen: v("namen"), adres: v("adres"), email: v("email"), email2: v("email2"),
        wensen: [], ronde_vorig_jaar: null, niet_rondes: [], wil: null };
      for (const veld of ["id", "namen", "adres", "email"]) if (!k[veld]) fouten.push("regel " + nr + ": " + veld + " ontbreekt");
      if (k.email && !geldigMail(k.email)) fouten.push("regel " + nr + ": ongeldig e-mailadres '" + k.email + "'");
      if (k.email2.toLowerCase() === k.email.toLowerCase()) k.email2 = "";
      if (k.email2 && !geldigMail(k.email2)) fouten.push("regel " + nr + ": ongeldig tweede e-mailadres '" + k.email2 + "'");

      // Dieetwensen per persoon. Staat er alleen iets in de kolom per koppel, dan telt dat als 1 regel.
      const a = schoon(v("wens_a")), b = schoon(v("wens_b")), samen = schoon(v("allergieen"));
      if (a) k.wensen.push({ tekst: a, per: "persoon" });
      if (b) k.wensen.push({ tekst: b, per: "persoon" });
      if (!a && !b && samen) { k.wensen.push({ tekst: samen, per: "koppel" }); perKoppel++; }

      const vorig = v("ronde_vorig_jaar");
      if (!LEEG.has(vorig.toLowerCase())) {
        k.ronde_vorig_jaar = leesRonde(vorig);
        if (!k.ronde_vorig_jaar) fouten.push("regel " + nr + ": ronde_vorig_jaar '" + vorig + "' is geen ronde 1 t/m 4");
      }
      for (let deel of v("beperkingen").split(/[;,|]/)) {
        deel = deel.trim();
        if (LEEG.has(deel.toLowerCase())) continue;
        const m = deel.toLowerCase().match(/^(niet|wil|wel|alleen)\b[^0-9]*?([1-4]|kv|wv|hg|d)$/);
        const ronde = m && leesRonde(m[2]);
        if (!ronde) waarschuwingen.push("Beperking '" + deel + "' van koppel " + k.id + " (" + k.namen + ") is niet herkend en niet meegenomen.");
        else if (m[1] === "niet") k.niet_rondes.push(ronde);
        else if (k.wil && k.wil !== ronde) fouten.push("regel " + nr + ": er staan twee verschillende gewenste rondes (" + k.wil + " en " + ronde + ")");
        else k.wil = ronde;
      }
      if (k.wil && k.niet_rondes.includes(k.wil)) fouten.push("regel " + nr + ": ronde " + k.wil + " staat er als gewenst en als niet mogelijk");
      // Een eigen verzoek gaat voor: dan is alleen die ronde toegestaan.
      k.verboden = k.wil ? [1, 2, 3, 4].filter((r) => r !== k.wil)
        : Array.from(new Set(k.niet_rondes.concat(k.ronde_vorig_jaar ? [k.ronde_vorig_jaar] : [])));
      koppels.push(k);
    });
    const tel = (waarden) => waarden.reduce((t, w) => ((t[w] = (t[w] || 0) + 1), t), {});
    const ids = tel(koppels.map((k) => k.id));
    const mails = tel(koppels.reduce((lijst, k) => lijst.concat([k.email, k.email2]), []).filter(Boolean).map((m) => m.toLowerCase()));
    for (const x in ids) if (x && ids[x] > 1) fouten.push("koppel-ID '" + x + "' komt " + ids[x] + " keer voor");
    for (const x in mails) if (mails[x] > 1) fouten.push("e-mailadres '" + x + "' komt " + mails[x] + " keer voor (Laposta ontdubbelt op e-mailadres)");
    for (const k of koppels) if (k.verboden.length === 4) fouten.push("koppel " + k.id + " (" + k.namen + ") kan geen enkele ronde verzorgen");
    if (perKoppel) {
      waarschuwingen.push("Bij " + perKoppel + " koppel(s) staat de dieetwens per koppel in de kolom allergieen. Dan is niet te zien of die voor één of voor twee personen geldt. Zet de wens per persoon in de kolommen dieetwens_a en dieetwens_b.");
    }

    // De laatste inschrijvers (onderaan de lijst) zijn reservekoppel als het aantal geen veelvoud van 4 is.
    const over = koppels.length % 4;
    const reserves = over ? koppels.splice(koppels.length - over, over) : [];
    if (koppels.length < 16) fouten.push(koppels.length + " koppels is te weinig: onder de 16 is de indeling niet te maken");
    return { koppels, reserves, fouten, waarschuwingen };
  }

  // ------------------------------------------------------------ indelen

  const volgende = (ronde) => (ronde % 4) + 1;

  // Hoe graag een koppel een ronde kookt: 0 is de voorkeur, hoger is een afwijking.
  // Voorkeur: de gang die volgt op die van vorig jaar. Nieuwe deelnemers: alles behalve het hoofdgerecht.
  function kosten(k, ronde) {
    if (k.verboden.includes(ronde)) return Infinity;
    if (k.wil) return 0;
    if (k.ronde_vorig_jaar) return ronde === volgende(k.ronde_vorig_jaar) ? 0 : 10;
    return ronde === 3 ? 100 : 0;
  }

  // Stap 1: verdeel de koppels gelijk over de 4 kookrondes, met zo min mogelijk afwijkingen van de voorkeur.
  function kiesKookrondes(koppels, rand) {
    const m = koppels.length / 4;
    const inRonde = { 1: [], 2: [], 3: [], 4: [] };
    for (const k of schud(koppels, rand)) {
      let laag = Infinity, beste = [];
      for (const r of [1, 2, 3, 4]) {
        const c = kosten(k, r);
        if (c < laag) { laag = c; beste = [r]; } else if (c === laag && c < Infinity) beste.push(r);
      }
      if (!beste.length) return null;
      beste = schud(beste, rand).sort((x, y) => inRonde[x].length - inRonde[y].length);
      inRonde[beste[0]].push(k);
    }
    // Te volle rondes leegmaken via het goedkoopste pad naar een ronde met ruimte (kortste pad op 4 knopen).
    for (;;) {
      const vol = [1, 2, 3, 4].filter((r) => inRonde[r].length > m);
      if (!vol.length) return inRonde;
      const stappen = [];
      for (const a of [1, 2, 3, 4]) for (const b of [1, 2, 3, 4]) {
        if (a === b) continue;
        let w = Infinity, wie = null;
        for (const k of schud(inRonde[a], rand)) {
          const d = kosten(k, b) - kosten(k, a);
          if (d < w) { w = d; wie = k; }
        }
        if (wie) stappen.push({ a, b, w, wie });
      }
      const afstand = { 1: Infinity, 2: Infinity, 3: Infinity, 4: Infinity }, via = {};
      for (const r of vol) afstand[r] = 0;
      for (let i = 0; i < 3; i++) for (const s of stappen) {
        if (afstand[s.a] + s.w < afstand[s.b]) { afstand[s.b] = afstand[s.a] + s.w; via[s.b] = s; }
      }
      const doel = [1, 2, 3, 4].filter((r) => inRonde[r].length < m && afstand[r] < Infinity).sort((x, y) => afstand[x] - afstand[y])[0];
      if (!doel) return null;
      const pad = [];
      for (let r = doel, n = 0; via[r] && n < 4; r = via[r].a, n++) pad.push(via[r]);
      for (const s of pad) {
        inRonde[s.a] = inRonde[s.a].filter((k) => k !== s.wie);
        inRonde[s.b].push(s.wie);
      }
    }
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

  // Silo's doorbreken. De basisindeling zet aan elke tafel 1 koppel uit elke kookgroep, zodat koppels
  // die dezelfde gang koken elkaar nooit treffen. Hier wisselen steeds twee gasten uit verschillende
  // kookgroepen van tafel (binnen dezelfde ronde), als daardoor geen twee koppels elkaar twee keer treffen.
  // Doel: elk koppel treft DOEL koppels uit de eigen kookgroep.
  const DOEL = 2;
  function mengSilos(koppels, tafels, rand) {
    const n = koppels.length;
    const nr = new Map(koppels.map((k, i) => [k, i]));
    const groep = new Array(n);
    for (const t of tafels) groep[nr.get(t.gastheer)] = t.ronde;
    const perRonde = [1, 2, 3, 4].map((r) => tafels.filter((t) => t.ronde === r));
    const leden = (t) => [t.gastheer].concat(t.gasten).map((k) => nr.get(k));
    const samen = new Uint8Array(n * n), stoel = [0, 1, 2, 3].map(() => new Array(n)), silo = new Array(n).fill(0);
    perRonde.forEach((lijst, r) => lijst.forEach((t, ti) => {
      const ls = leden(t);
      for (const a of ls) {
        stoel[r][a] = ti;
        for (const b of ls) if (a !== b) { samen[a * n + b]++; if (groep[a] === groep[b]) silo[a]++; }
      }
    }));
    const eigen = (ls, x) => ls.reduce((t, y) => t + (y !== x && groep[y] === groep[x] ? 1 : 0), 0);
    const waarde = (aantal) => Math.min(aantal, DOEL);

    // Winst als a en b (gasten aan verschillende tafels in ronde r) wisselen; -1 als het niet mag.
    function winst(r, a, b) {
      const l1 = leden(perRonde[r][stoel[r][a]]), l2 = leden(perRonde[r][stoel[r][b]]);
      for (const x of l1) if (x !== a && samen[b * n + x]) return -1;
      for (const y of l2) if (y !== b && samen[a * n + y]) return -1;
      const n1 = l1.map((x) => (x === a ? b : x)), n2 = l2.map((y) => (y === b ? a : y));
      const oud = (x) => eigen(l1.includes(x) ? l1 : l2, x), nieuw = (x) => eigen(n1.includes(x) ? n1 : n2, x);
      let w = 0;
      for (const x of l1.concat(l2)) w += waarde(silo[x] - oud(x) + nieuw(x)) - waarde(silo[x]);
      return w;
    }
    function wissel(r, a, b) {
      const t1 = perRonde[r][stoel[r][a]], t2 = perRonde[r][stoel[r][b]];
      const l1 = leden(t1), l2 = leden(t2);
      for (const x of l1) silo[x] -= eigen(l1, x);
      for (const y of l2) silo[y] -= eigen(l2, y);
      for (const x of l1) if (x !== a) { samen[a * n + x]--; samen[x * n + a]--; samen[b * n + x]++; samen[x * n + b]++; }
      for (const y of l2) if (y !== b) { samen[b * n + y]--; samen[y * n + b]--; samen[a * n + y]++; samen[y * n + a]++; }
      t1.gasten[t1.gasten.indexOf(koppels[a])] = koppels[b];
      t2.gasten[t2.gasten.indexOf(koppels[b])] = koppels[a];
      const ti = stoel[r][a]; stoel[r][a] = stoel[r][b]; stoel[r][b] = ti;
      const m1 = leden(t1), m2 = leden(t2);
      for (const x of m1) silo[x] += eigen(m1, x);
      for (const y of m2) silo[y] += eigen(m2, y);
    }

    for (let keer = 0; keer < 12; keer++) {
      let gewisseld = false;
      for (const a of schud(koppels.map((_, i) => i), rand)) {
        if (silo[a] >= DOEL) continue;
        let beste = 0, keus = null;
        for (let r = 0; r < 4; r++) {
          if (groep[a] === r + 1) continue; // a kookt deze ronde zelf
          const eigenTafel = perRonde[r][stoel[r][a]];
          for (const t of perRonde[r]) {
            if (t === eigenTafel) continue;
            for (const gast of t.gasten) {
              const b = nr.get(gast);
              if (groep[b] === groep[a]) continue;
              const w = winst(r, a, b);
              if (w > beste || (w === beste && w > 0 && rand() < 0.3)) { beste = w; keus = [r, a, b]; }
            }
          }
        }
        if (keus) { wissel(keus[0], keus[1], keus[2]); gewisseld = true; }
      }
      if (!gewisseld) break;
    }
    return tafels;
  }

  // Geeft tafels: [{ronde, gastheer, gasten:[k,k,k]}], of null als de kookrondes niet te verdelen zijn.
  function maakIndeling(koppels, seed, inst) {
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
    if (!inst || inst.mix !== false) mengSilos(koppels, tafels, rand);
    return tafels;
  }

  // Per koppel: welke ronde het kookt en hoe dat zich verhoudt tot vorig jaar.
  function kookInfo(koppels, tafels) {
    const eigen = new Map(tafels.map((t) => [t.gastheer, t.ronde]));
    return new Map(koppels.map((k) => {
      const ronde = eigen.get(k);
      let soort;
      if (k.wil) soort = "op verzoek";
      else if (!k.ronde_vorig_jaar) soort = ronde === 3 ? "nieuw, toch hoofdgerecht" : "nieuw";
      else soort = ronde === volgende(k.ronde_vorig_jaar) ? "schuift door" : "wijkt af";
      return [k, { ronde, soort }];
    }));
  }

  // Hoeveel koppels uit de eigen kookgroep (de 'silo') elk koppel treft.
  function siloInfo(koppels, tafels) {
    const eigen = new Map(tafels.map((t) => [t.gastheer, t.ronde]));
    const aantal = new Map(koppels.map((k) => [k, 0]));
    for (const t of tafels) {
      const ls = [t.gastheer].concat(t.gasten);
      for (const a of ls) for (const b of ls) if (a !== b && eigen.get(a) === eigen.get(b)) aantal.set(a, aantal.get(a) + 1);
    }
    const waarden = koppels.map((k) => aantal.get(k));
    return { aantal, min: Math.min.apply(null, waarden), gemiddeld: waarden.reduce((t, w) => t + w, 0) / koppels.length,
      zonder: koppels.filter((k) => aantal.get(k) === 0) };
  }

  // ------------------------------------------------------------ dieetwensen en laposta

  // Eén tekst per gast (persoon) met een dieetwens, zonder namen.
  function wensenGasten(tafel) {
    const uit = [];
    for (const g of tafel.gasten) for (const w of g.wensen) uit.push(w.per === "koppel" ? w.tekst + " (opgegeven per koppel)" : w.tekst);
    return uit;
  }
  const wensenOpRegel = (lijst) => (lijst.length ? lijst.join(" | ") : GEEN);

  // Tekst voor de mail: één regel, met voor elke gast met een wens een bolletje. Geen HTML en geen
  // regeleinden: het is niet zeker dat Laposta die in een veldwaarde overneemt, en van een allergie mag niets wegvallen.
  function wensenVoorMail(lijst) {
    if (!lijst.length) return GEEN;
    return lijst.map((w) => "• " + w).join(" ");
  }
  // Een gewoon tekstveld in Laposta kapt af na 255 tekens.
  const LAPOSTA_MAX = 255;
  function teLangVoorLaposta(laposta) {
    return laposta.filter((r) => r.dieetwensen_gasten.length > LAPOSTA_MAX);
  }

  // Eén regel per e-mailadres: heeft een koppel twee adressen, dan krijgen beide partners de mail.
  function lapostaRijen(koppels, tafels, inst) {
    inst = inst || instellingen();
    const eigen = new Map(tafels.map((t) => [t.gastheer, t]));
    const rijen = [];
    for (const k of koppels) {
      const t = eigen.get(k), ronde = inst.rondes[t.ronde - 1];
      for (const email of [k.email, k.email2].filter(Boolean)) {
        rijen.push({ email, namen: k.namen, ronde: "ronde " + t.ronde, gerecht: ronde.naam, tijd_gasten: ronde.tijd,
          dieetwensen_gasten: wensenVoorMail(wensenGasten(t)) });
      }
    }
    return rijen;
  }

  // ------------------------------------------------------------ loopbriefjes

  // start: één briefje per koppel dat in ronde 1 te gast is. enveloppen: per tafel van ronde 1, 2 en 3
  // de vier briefjes met het adres voor de volgende ronde.
  function loopbriefjes(koppels, tafels, inst) {
    inst = inst || instellingen();
    const tafelVan = (k, ronde) => tafels.find((t) => t.ronde === ronde && (t.gastheer === k || t.gasten.includes(k)));
    function briefje(k, ronde) {
      const t = tafelVan(k, ronde), r = inst.rondes[ronde - 1];
      return { namen: k.namen, gang: r.naam, tijd: r.tijd, kok: t.gastheer === k, bij: t.gastheer.namen, adres: t.gastheer.adres };
    }
    const start = tafels.filter((t) => t.ronde === 1).reduce((lijst, t) => lijst.concat(t.gasten), []).map((k) => briefje(k, 1))
      .sort((a, b) => a.namen.localeCompare(b.namen, "nl"));
    const enveloppen = [], teller = {};
    for (const t of tafels) {
      teller[t.ronde] = (teller[t.ronde] || 0) + 1;
      if (t.ronde === 4) continue;
      enveloppen.push({ ronde: t.ronde, tafel: teller[t.ronde], gastheer: t.gastheer.namen, adres: t.gastheer.adres,
        openen: inst.rondes[t.ronde - 1].envelop, briefjes: [t.gastheer].concat(t.gasten).map((k) => briefje(k, t.ronde + 1)) });
    }
    return { start, enveloppen };
  }

  // De onderdelen van een Word-bestand (.docx) met de loopbriefjes: {pad: inhoud}. Inpakken als zip doet de pagina.
  function loopbriefjesDocx(lb) {
    const x = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    function run(tekst, o) {
      o = o || {};
      const opmaak = (o.vet ? "<w:b/>" : "") + (o.grijs ? '<w:color w:val="666666"/>' : "") + (o.pt ? '<w:sz w:val="' + o.pt * 2 + '"/>' : "");
      return "<w:r>" + (opmaak ? "<w:rPr>" + opmaak + "</w:rPr>" : "") + '<w:t xml:space="preserve">' + x(tekst) + "</w:t></w:r>";
    }
    function alinea(runs, o) {
      o = o || {};
      return "<w:p><w:pPr>" + (o.houdBij ? "<w:keepNext/>" : "") + "<w:keepLines/>" + (o.nieuwePagina ? "<w:pageBreakBefore/>" : "") +
        (o.kniplijn ? '<w:pBdr><w:bottom w:val="dashed" w:sz="6" w:space="14" w:color="999999"/></w:pBdr>' : "") +
        '<w:spacing w:before="' + (o.voor || 0) + '" w:after="' + (o.na == null ? 80 : o.na) + '"/>' + (o.midden ? '<w:jc w:val="center"/>' : "") + "</w:pPr>" +
        [].concat(runs).join("") + "</w:p>";
    }
    function briefje(b) {
      const kop = alinea(run("Beste " + b.namen + ","), { houdBij: true, voor: 280, na: 160 });
      if (b.kok) {
        return kop + alinea([run("Voor " + b.gang + " zijn jullie zelf de koks. Jullie gasten arriveren om "), run(b.tijd + " uur", { vet: true }), run(".")], { kniplijn: true, na: 0 });
      }
      return kop + alinea(run("Voor " + b.gang + " worden jullie om " + b.tijd + " uur verwacht bij:"), { houdBij: true }) +
        alinea(run(b.bij, { vet: true }), { houdBij: true, na: 0 }) + alinea(run(b.adres, { vet: true }), { kniplijn: true, na: 0 });
    }
    let body = alinea(run("Startbriefjes: één per koppel dat in de eerste ronde te gast is. Knip langs de stippellijnen.", { grijs: true, pt: 9 }), { na: 0 });
    body += lb.start.map(briefje).join("");
    for (const e of lb.enveloppen) {
      body += alinea(run(e.gastheer, { vet: true, pt: 16 }), { nieuwePagina: true, midden: true, na: 60 });
      body += alinea(run("Openen om " + e.openen + " uur", { pt: 14 }), { midden: true, na: 60 });
      body += alinea(run("Envelop voor ronde " + e.ronde + ", tafel " + e.tafel + ", " + e.adres, { grijs: true, pt: 9 }), { midden: true, kniplijn: true, na: 0 });
      body += e.briefjes.map(briefje).join("");
    }
    const kop = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    return {
      "[Content_Types].xml": kop + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
      "_rels/.rels": kop + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      "word/_rels/document.xml.rels": kop + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      "word/styles.xml": kop + "<w:styles " + W + '><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="nl-NL"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Standaard"><w:name w:val="Normal"/></w:style></w:styles>',
      "word/document.xml": kop + "<w:document " + W + "><w:body>" + body + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1418" w:bottom="1134" w:left="1418" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>',
    };
  }

  // ------------------------------------------------------------ controle (los van het indelen)

  function controleer(koppels, tafels, laposta, inst) {
    inst = inst || instellingen();
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

    f = tafels.filter((t) => t.gastheer.ronde_vorig_jaar === t.ronde && t.gastheer.wil !== t.ronde)
      .map((t) => naam(t.gastheer) + " verzorgt net als vorig jaar ronde " + t.ronde);
    uit.push(["4. Geen koppel verzorgt dezelfde ronde als vorig jaar (behalve op eigen verzoek)", f]);

    f = [];
    const perMail = new Map(laposta.map((r) => [r.email.toLowerCase(), r]));
    const adressen = koppels.reduce((t, k) => t + (k.email2 ? 2 : 1), 0);
    if (laposta.length !== adressen || perMail.size !== adressen) f.push("Laposta-bestand heeft " + laposta.length + " regels voor " + adressen + " e-mailadressen");
    for (const t of tafels) {
      const ronde = inst.rondes[t.ronde - 1];
      const wensen = t.gasten.reduce((lijst, g) => lijst.concat(g.wensen.map((w) => w.tekst)), []);
      for (const email of [t.gastheer.email, t.gastheer.email2].filter(Boolean)) {
        const rij = perMail.get(email.toLowerCase());
        if (!rij) { f.push(naam(t.gastheer) + ": " + email + " ontbreekt in het Laposta-bestand"); continue; }
        const tekst = rij.dieetwensen_gasten, genoemd = tekst.split("• ").length - 1;
        if (!tekst.trim()) f.push(naam(t.gastheer) + ": veld dieetwensen_gasten is leeg");
        if (!wensen.length && tekst !== GEEN) f.push(naam(t.gastheer) + ": gasten hebben geen wensen, maar er staat '" + tekst + "'");
        for (const w of wensen) if (!tekst.includes(w)) f.push(naam(t.gastheer) + ": wens '" + w + "' van een gast ontbreekt");
        if (wensen.length && genoemd !== wensen.length) f.push(naam(t.gastheer) + ": " + wensen.length + " gasten hebben een wens, maar de mail noemt er " + genoemd);
        if (rij.ronde !== "ronde " + t.ronde || rij.gerecht !== ronde.naam || rij.tijd_gasten !== ronde.tijd) f.push(naam(t.gastheer) + ": ronde, gerecht of tijd in het Laposta-bestand klopt niet");
      }
    }
    uit.push(["5. Het gastkoppel krijgt per gast de allergieën en dieetwensen van de eigen gasten", f]);

    f = [];
    for (let r = 1; r <= 4; r++) {
      const aantal = tafels.filter((t) => t.ronde === r).length;
      if (aantal !== n / 4) f.push("ronde " + r + " heeft " + aantal + " tafels in plaats van " + n / 4);
    }
    for (const t of tafels) if (new Set(aanTafel(t)).size !== 4) f.push("tafel van " + naam(t.gastheer) + " in ronde " + t.ronde + " heeft geen 4 koppels");
    uit.push(["6. Elke tafel heeft 4 koppels (8 personen) en elke ronde heeft evenveel tafels", f]);

    f = koppels.filter((k, i) => ontmoet[i].size !== 12).map((k) => naam(k) + " ontmoet " + ontmoet[nr.get(k)].size + " koppels in plaats van 12");
    uit.push(["7. Elk koppel spreekt 12 andere koppels (24 verschillende mensen)", f]);

    f = [];
    for (const t of tafels) {
      const k = t.gastheer;
      if (k.niet_rondes.includes(t.ronde)) f.push(naam(k) + " verzorgt ronde " + t.ronde + ", maar gaf op dat niet te kunnen");
      if (k.wil && k.wil !== t.ronde) f.push(naam(k) + " vroeg om ronde " + k.wil + ", maar verzorgt ronde " + t.ronde);
    }
    if (koppels.some((k) => k.niet_rondes.length || k.wil)) uit.push(["8. Opgegeven wensen en beperkingen voor de kookronde zijn gevolgd", f]);
    return uit;
  }

  // Toelichting bij de kookrondes en de silo's: geen fouten, wel goed om te weten.
  function toelichting(koppels, tafels, inst) {
    inst = inst || instellingen();
    const info = kookInfo(koppels, tafels), silo = siloInfo(koppels, tafels);
    const naam = (k) => k.namen + " (" + k.id + ")";
    const tel = (soort) => koppels.filter((k) => info.get(k).soort === soort);
    const afwijkers = tel("wijkt af").map((k) => naam(k) + ": vorige keer " + KORT[k.ronde_vorig_jaar - 1] + ", nu " + KORT[info.get(k).ronde - 1]);
    const nieuwHg = tel("nieuw, toch hoofdgerecht").map(naam);
    const regels = [tel("schuift door").length + " koppels schuiven één gang door, " + afwijkers.length + " wijken daarvan af om de rondes even groot te maken, " +
      (tel("nieuw").length + nieuwHg.length) + " zijn nieuw en " + tel("op verzoek").length + " kregen de ronde waar ze om vroegen."];
    let siloTekst;
    if (!inst.mix) siloTekst = "Silo's doorbreken staat uit: koppels die dezelfde gang koken komen elkaar niet tegen.";
    else if (silo.gemiddeld === 0) siloTekst = "Silo's doorbreken lukt bij dit aantal koppels niet: koppels die dezelfde gang koken komen elkaar niet tegen.";
    else {
      siloTekst = "Silo's doorbroken: elk koppel treft gemiddeld " + silo.gemiddeld.toFixed(1).replace(".", ",") + " koppels die dezelfde gang koken (minimaal " + silo.min + ")." +
        (silo.zonder.length ? " " + silo.zonder.length + " koppel(s) treffen niemand uit de eigen groep." : "");
    }
    return { regels, afwijkers, nieuwHg, siloTekst, silo, info };
  }

  function rapportTekst(koppels, reserves, controles, waarschuwingen, uitleg) {
    const n = koppels.length, fout = controles.reduce((t, c) => t + c[1].length, 0);
    const regels = ["CONTROLERAPPORT RUNNING DINNER", "",
      n + " koppels (" + 2 * n + " personen), " + n / 4 + " tafels per ronde.",
      "UITSLAG: " + (fout ? fout + " OVERTREDING(EN). Deze indeling niet gebruiken." : "alle controles geslaagd."), ""];
    for (const [titel, f] of controles) {
      regels.push("[" + (f.length ? "FOUT" : "OK  ") + "] " + titel);
      for (const x of f) regels.push("         - " + x);
    }
    if (uitleg) {
      regels.push("", "KOOKRONDES:");
      for (const r of uitleg.regels) regels.push("  " + r);
      if (uitleg.afwijkers.length) { regels.push("  Schuiven niet één gang door:"); for (const a of uitleg.afwijkers) regels.push("  - " + a); }
      if (uitleg.nieuwHg.length) { regels.push("  Nieuw en toch ingedeeld voor het hoofdgerecht:"); for (const a of uitleg.nieuwHg) regels.push("  - " + a); }
      regels.push("", "SILO'S:", "  " + uitleg.siloTekst);
    }
    if (reserves.length) {
      regels.push("", "RESERVEKOPPELS (laatste inschrijvers, niet ingedeeld):");
      for (const k of reserves) regels.push("  - " + k.id + " (" + k.namen + ")");
    }
    if (waarschuwingen.length) { regels.push("", "LET OP:"); for (const w of waarschuwingen) regels.push("  - " + w); }
    return regels.join("\n") + "\n";
  }

  // Tabellen voor scherm en Excel. groepen: per rij van perRonde de kookronde van gastkoppel en gasten (voor de kleuren).
  function tabellen(koppels, tafels, inst) {
    inst = inst || instellingen();
    const info = kookInfo(koppels, tafels);
    const teller = {};
    const perRonde = [["Ronde", "Tijd", "Tafel", "Adres", "Gastkoppel (kookt)", "Gast 1", "Gast 2", "Gast 3", "Dieetwensen gasten (per persoon)"]];
    const groepen = [null];
    const metGang = (k) => k.namen + " (" + k.id + ", kookt " + KORT[info.get(k).ronde - 1] + ")";
    for (const t of tafels) {
      teller[t.ronde] = (teller[t.ronde] || 0) + 1;
      const r = inst.rondes[t.ronde - 1];
      perRonde.push([t.ronde + " (" + KORT[t.ronde - 1] + ")", r.tijd, teller[t.ronde], t.gastheer.adres, t.gastheer.namen + " (" + t.gastheer.id + ")"]
        .concat(t.gasten.map(metGang), [wensenOpRegel(wensenGasten(t))]));
      groepen.push([t.ronde].concat(t.gasten.map((g) => info.get(g).ronde)));
    }
    const perKoppel = [["ID", "Namen", "Vorige keer", "Verzorgt", "Kookronde"].concat([1, 2, 3, 4].map((r) => "Ronde " + r + ": " + inst.rondes[r - 1].naam))];
    for (const k of koppels) {
      const i = info.get(k);
      const rij = [k.id, k.namen, k.ronde_vorig_jaar ? "ronde " + k.ronde_vorig_jaar + " (" + KORT[k.ronde_vorig_jaar - 1] + ")" : "nieuw",
        "ronde " + i.ronde + ": " + inst.rondes[i.ronde - 1].naam, i.soort];
      for (let r = 1; r <= 4; r++) {
        const t = tafels.find((t) => t.ronde === r && (t.gastheer === k || t.gasten.includes(k)));
        rij.push(t.gastheer === k ? "THUIS (kookt zelf)" : t.gastheer.adres + ", bij " + t.gastheer.namen);
      }
      perKoppel.push(rij);
    }
    const historie = [["id", "namen", "ronde_vorig_jaar"]].concat(koppels.map((k) => [k.id, k.namen, info.get(k).ronde]));
    return { perRonde, perKoppel, historie, groepen };
  }

  function naarCsv(rijen) {
    return "\uFEFF" + rijen.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(";")).join("\r\n") + "\r\n";
  }

  const RD = { STANDAARD, KORT, GEEN, instellingen, leesCsv, leesKoppels, maakIndeling, kookInfo, siloInfo, wensenGasten, lapostaRijen,
    teLangVoorLaposta, loopbriefjes, loopbriefjesDocx, controleer, toelichting, rapportTekst, tabellen, naarCsv, verschuivingen };
  if (typeof module !== "undefined" && module.exports) module.exports = RD;
  else root.RD = RD;
})(typeof window !== "undefined" ? window : globalThis);
