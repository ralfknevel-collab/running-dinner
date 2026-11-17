# Running Dinner indelen

Eén bestand, `Running Dinner indelen.html`, dat de indeling maakt, zelf controleert en het importbestand voor Laposta klaarzet. Het opent met een dubbelklik in de browser. Er hoeft niets geïnstalleerd te worden en de deelnemerslijst blijft op de eigen computer: de pagina verstuurt niets.

## Online

De pagina staat ook online: https://ralfknevel-collab.github.io/running-dinner/

Gebruik bij voorkeur deze link om de tool te delen. Als mailbijlage (zip met het HTML-bestand) wordt hij door virusscanners geblokkeerd, omdat een HTML-bestand dat zelf downloads aanmaakt op een bekend aanvalspatroon lijkt. De online versie werkt hetzelfde: de deelnemerslijst wordt in de browser verwerkt en nergens naartoe gestuurd.

## Gebruiken

1. Dubbelklik op `Running Dinner indelen.html`.
2. Kies de deelnemerslijst (Excel of CSV), of klik op "Uitproberen met 48 verzonnen koppels".
3. Bekijk de uitkomst en sla de bestanden op.

De lijst heeft een kopregel met `id`, `namen`, `adres`, `email`, `allergieen` en `ronde_vorig_jaar`, en staat in volgorde van inschrijving. Optioneel zijn `beperkingen` ("niet ronde 3") en twee kolommen die de pagina niet gebruikt: `tweede_mailadres` en `gekookt_dit_jaar`. Een leeg voorbeeldbestand is in de pagina te downloaden.

Een handleiding met schermafbeeldingen staat in `handleiding/handleiding.pdf` (bron: `handleiding/handleiding.html`).

## Regels

- Vier kookrondes, per tafel 4 koppels (8 personen), waarvan 1 gastkoppel.
- Elk koppel verzorgt precies 1 ronde thuis, en niet dezelfde ronde als vorig jaar.
- Twee koppels zitten hooguit 1 keer samen aan tafel.
- Is het aantal koppels geen veelvoud van 4, dan zijn de laatste inschrijvers reservekoppel. Zij worden niet ingedeeld en staan niet in het Laposta-bestand.
- Minimaal 16 koppels.
- Het gastkoppel krijgt de allergieën en dieetwensen van de eigen gasten zonder namen ("gastkoppel 1: notenallergie"), of "geen bijzonderheden".

## Bestanden die de pagina maakt

- `indeling.xlsx`: per ronde, per koppel, de controle en eventueel de reservekoppels.
- `laposta_import.csv` en `.xlsx`: een regel per koppel met `email`, `namen`, `ronde`, `gerecht`, `allergieen_gasten`.
- `controlerapport.txt`: uitslag per voorwaarde.
- `rondes_voor_volgend_jaar.csv`: wie welke ronde verzorgde, zonder allergieën. Alleen dit bestand bewaar je na afloop.

De stappen voor Laposta staan in de pagina zelf. Bronnen: [importeren uit Excel of csv](https://docs.laposta.nl/article/172-hoe-pas-ik-de-relatiegegevens-van-al-mijn-bestaande-relaties-aan), [extra velden aanmaken](https://docs.laposta.nl/article/208-hoe-maak-ik-extra-velden-aan-voor-mijn-lijst), [personaliseren](https://docs.laposta.nl/article/273-hoe-personaliseer-ik-mijn-nieuwsbrief), [relatievariabele](https://docs.laposta.nl/article/451-relatievariabele).

## Aanpassen

De broncode staat in `src/`. Na een wijziging:

```bash
node src/test.js    # test alle groepsgroottes van 16 t/m 200 koppels
node src/build.js   # bouwt het HTML-bestand opnieuw
```

- `src/core.js`: inlezen, indelen, controleren.
- `src/template.html`: de pagina.
- `src/xlsx.full.min.js`: SheetJS 0.18.5, voor het lezen en schrijven van Excel.

Hoe de indeling werkt: de koppels worden in vier even grote groepen verdeeld, één per kookronde. Aan elke tafel zit één koppel uit elke groep. Per ronde schuiven de groepen een ander aantal plaatsen op, zo gekozen dat twee koppels nooit twee keer bij elkaar uitkomen. De controle rekent alle voorwaarden daarna los van die methode na.
