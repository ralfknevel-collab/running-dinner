# Running Dinner indelen

Eén bestand, `Running Dinner indelen.html`, dat de indeling maakt, zelf controleert en het importbestand voor Laposta klaarzet. Het opent met een dubbelklik in de browser. Er hoeft niets geïnstalleerd te worden en de deelnemerslijst blijft op de eigen computer: de pagina verstuurt niets.

## Online

De pagina staat ook online: https://ralfknevel-collab.github.io/running-dinner/

Gebruik bij voorkeur deze link om de tool te delen. Als mailbijlage (zip met het HTML-bestand) wordt hij door virusscanners geblokkeerd, omdat een HTML-bestand dat zelf downloads aanmaakt op een bekend aanvalspatroon lijkt. De online versie werkt hetzelfde: de deelnemerslijst wordt in de browser verwerkt en nergens naartoe gestuurd.

## Gebruiken

1. Dubbelklik op `Running Dinner indelen.html`.
2. Kies de deelnemerslijst (Excel of CSV), of klik op "Uitproberen met 48 verzonnen koppels".
3. Bekijk de uitkomst en sla de bestanden op.

De lijst heeft een kopregel met `id`, `namen`, `adres`, `email` en `ronde_vorig_jaar`, en staat in volgorde van inschrijving. Optioneel zijn `tweede_mailadres` (de partner krijgt de mail dan ook), `dieetwens_a` en `dieetwens_b` (de wens per persoon), `beperkingen` ("niet ronde 3" of "wil ronde 2") en `gekookt_dit_jaar`, die de pagina niet gebruikt. Een lijst met de oude kolom `allergieen` per koppel werkt nog, met een waarschuwing. Een leeg voorbeeldbestand is in de pagina te downloaden.

Een handleiding met schermafbeeldingen staat in `handleiding/handleiding.pdf` (bron: `handleiding/handleiding.html`).

## Regels

- Vier kookrondes, per tafel 4 koppels (8 personen), waarvan 1 gastkoppel.
- Elk koppel verzorgt precies 1 ronde thuis: de gang die volgt op die van vorig jaar (na ronde 4 weer ronde 1). Komen de rondes zo niet even groot uit, dan wijken zo weinig mogelijk koppels af; de pagina noemt ze.
- Nieuwe deelnemers koken niet het hoofdgerecht. Een eigen verzoek ("wil ronde 2") gaat voor.
- Twee koppels zitten hooguit 1 keer samen aan tafel.
- Silo's doorbreken (aan en uit te zetten): koppels die dezelfde gang koken komen elkaar ook tegen, doordat aan een deel van de tafels twee gastkoppels uit dezelfde kookgroep zitten. Werkt vanaf 28 koppels.
- Is het aantal koppels geen veelvoud van 4, dan zijn de laatste inschrijvers reservekoppel. Zij worden niet ingedeeld en staan niet in het Laposta-bestand.
- Minimaal 16 koppels.
- Het gastkoppel krijgt per gast de allergie of dieetwens, zonder namen ("• allergisch voor noten • eet geen vlees"), of "geen dieetwensen opgegeven".
- De namen en tijden van de vier rondes zijn in de pagina aan te passen en worden in de browser onthouden.

## Bestanden die de pagina maakt

- `indeling.xlsx`: per ronde, per koppel, de controle en eventueel de reservekoppels.
- `laposta_import.xlsx` en `.csv`: een regel per e-mailadres met `email`, `namen`, `ronde`, `gerecht`, `tijd_gasten`, `dieetwensen_gasten`.
- `loopbriefjes.docx`: startbriefjes voor de gasten van ronde 1 en per tafel van ronde 1 t/m 3 een bladzijde met de adressen voor de volgende gang.
- `controlerapport.txt`: uitslag per voorwaarde.
- `rondes_voor_volgend_jaar.csv`: wie welke ronde verzorgde, zonder allergieën. Alleen dit bestand bewaar je na afloop.

De stappen voor Laposta staan uitgebreid in de handleiding en kort in de pagina zelf. Bronnen: [importeren uit Excel of csv](https://docs.laposta.nl/article/172-hoe-pas-ik-de-relatiegegevens-van-al-mijn-bestaande-relaties-aan), [extra velden aanmaken](https://docs.laposta.nl/article/208-hoe-maak-ik-extra-velden-aan-voor-mijn-lijst), [personaliseren](https://docs.laposta.nl/article/273-hoe-personaliseer-ik-mijn-nieuwsbrief), [relatievariabele](https://docs.laposta.nl/article/451-relatievariabele).

## Aanpassen

De broncode staat in `src/`. Na een wijziging:

```bash
node src/test.js    # test alle groepsgroottes van 16 t/m 200 koppels
node src/build.js   # bouwt het HTML-bestand opnieuw
```

- `src/core.js`: inlezen, indelen, controleren.
- `src/template.html`: de pagina.
- `src/xlsx.full.min.js`: SheetJS 0.18.5, voor het lezen en schrijven van Excel.

Hoe de indeling werkt: de koppels worden in vier even grote groepen verdeeld, één per kookronde, met zo min mogelijk afwijkingen van "één gang doorschuiven". Aan elke tafel zit eerst één koppel uit elke groep. Per ronde schuiven de groepen een ander aantal plaatsen op, zo gekozen dat twee koppels nooit twee keer bij elkaar uitkomen. Daarna wisselen gasten uit verschillende groepen binnen een ronde van tafel, zolang niemand elkaar daardoor twee keer treft, tot elk koppel twee koppels uit de eigen groep tegenkomt. De controle rekent alle voorwaarden daarna los van die methode na.
