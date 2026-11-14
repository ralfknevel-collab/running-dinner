// Bouwt het ene HTML-bestand voor de gebruiker: node src/build.js
const fs = require("fs");
const path = require("path");
const lees = (naam) => fs.readFileSync(path.join(__dirname, naam), "utf8");
const veilig = (js) => js.replace(/<\/script/gi, "<\\/script"); // mag de script-tag niet afsluiten

const html = lees("template.html")
  .replace("/*XLSX*/", () => veilig(lees("xlsx.full.min.js")))
  .replace("/*CORE*/", () => veilig(lees("core.js")));
const doel = path.join(__dirname, "..", "Running Dinner indelen.html");
fs.writeFileSync(doel, html);
// Zelfde pagina als index.html, voor de online versie (GitHub Pages).
fs.writeFileSync(path.join(__dirname, "..", "index.html"), html);
console.log("Geschreven: " + doel + " (" + Math.round(html.length / 1024) + " kB)");
