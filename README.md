# Neonatale transportregistratie

Prototype van een Nederlandstalige webapp voor de registratie van neonatale transporten tussen ziekenhuizen, bedoeld voor gebruik op telefoon en iPad tijdens verwijzing, stabilisatie en transport. Het resultaat is een volledig transportverslag als pdf-bestand en als kopieerbare e-mailtekst.

Dit is **registratiesoftware**: er zijn geen doseeradviezen, beslisregels, klinische afkapwaarden of automatische interpretaties van bloedgassen. Alle voorbeeldgegevens zijn fictief.

## Starten

Vereist: Node.js 20 of nieuwer.

```bash
npm install
npm run dev          # ontwikkelserver op http://localhost:5173 (ook bereikbaar op het lokale netwerk)
```

Productiebuild lokaal bekijken:

```bash
npm run build
npm run preview      # http://localhost:4173
```

Op een telefoon of iPad in hetzelfde netwerk: open `http://<ip-adres-van-de-computer>:5173`. Let op: kopiëren naar het klembord via de knop werkt in sommige browsers alleen via `https` of `localhost`; de app valt dan terug op een geselecteerd tekstvak.

## Controles

```bash
npm test             # unit-tests (Vitest): rekenlogica, tijden, tijdlijn, opslag, verslag, pdf
npm run typecheck    # TypeScript
npm run build && npm run preview &   # daarna:
npm run ui-check     # interfacecontrole met Playwright/Chromium op 390, 768 en 1024 px
```

`npm run ui-check` gebruikt `playwright-core` en een lokaal geïnstalleerde Chromium (zet zo nodig `CHROMIUM_PATH`). Screenshots en de gedownloade pdf's komen in `test-output/`. Met `WRITE_PDF=1 npx vitest run` worden ook `test-output/voorbeeld-verslag.pdf` en `test-output/groot-verslag.pdf` (63 meetmomenten en lange vrije tekst) geschreven voor handmatige review.

## Stack

- Vite + React 19 + TypeScript (geen UI-framework; eigen CSS)
- jsPDF voor het pdf-bestand, met het meegeleverde lettertype DejaVu Sans (`public/fonts`, vrije licentie in `DejaVu-LICENSE.txt`) zodat subscripts (FiO₂, HCO₃⁻), Δ en ° correct in de pdf staan
- Vitest voor tests, playwright-core voor de interfacecontrole

## Opslag

- **Alleen lokaal in de browser** (`localStorage`), per apparaat en per browser. Er is geen server, geen account en geen synchronisatie tussen apparaten.
- Elke transportregistratie is één JSON-document onder sleutel `neonataal-transport:v1:<id>`, met een index `neonataal-transport:v1:index`. Instellingen (tijdzone, toedieningsroutes) staan onder `neonataal-transport:v1:instellingen`.
- Wijzigingen worden kort na elke invoer automatisch als concept opgeslagen; daarnaast is er een knop **Concept opslaan** en wordt opgeslagen bij het verlaten van de pagina. De statusregel bovenin toont het tijdstip van de laatste opslag.
- Op het startscherm staan alle concepten op dit apparaat: **Hervatten** en **Verwijderen** (met bevestiging).
- Het opslaan loopt via de interface `TransportRepository` (`src/storage/repository.ts`). Een centrale opslag kan later dezelfde interface implementeren; alle onderliggende records (meetmomenten, medicatietoedieningen, infusen en snelheidswijzigingen, lijnen, tubeversies) hebben al stabiele identifiers.
- Wissen van browsergegevens of een privévenster betekent verlies van de concepten. Gebruik dit prototype niet voor echte patiëntgegevens.

## Technische aannames

- **Postmenstruele leeftijd** = zwangerschapsduur bij geboorte (weken + dagen) + het aantal verstreken **kalenderdagen** van geboortedatum tot de **transportdatum**. Als transportdatum geldt de lokale datum van *Datum en tijd verwijzing*. Weken én dagen moeten ingevuld zijn (ook “0” dagen); een leeg dagenveld wordt nooit als 0 behandeld. De postnatale leeftijd in dagen wordt apart getoond (geen extra formulierveld).
- **Doseergewicht**: automatisch het hoogste van geboortegewicht en huidig gewicht; bij één bekend gewicht dat gewicht; anders leeg. Via *Handmatig aanpassen* wordt het een handmatige waarde die behouden blijft als gewichten veranderen; *Automatisch berekende waarde gebruiken* zet het terug. Er worden geen doses berekend.
- **Tijdstippen** worden opgeslagen als ISO-8601 met UTC-offset (bijv. `2026-10-09T23:45:00+02:00`) en getoond in de gekozen tijdzone (standaard Europe/Amsterdam, instelbaar op het startscherm). Geboortedatum en weegdatum zijn lokale kalenderdatums zonder tijdzone; geboortetijd is een lokale kloktijd. Bij het dubbele uur van de wintertijdovergang wordt het eerste voorkomen gekozen.
- **Standaardtijd “nu”**: nieuwe records (meetmoment, medicatietoediening, infuus, snelheidswijziging, tubeplaatsing/-aanpassing) krijgen bij aanmaken de huidige tijd (afgerond op de minuut). *Datum en tijd verwijzing* krijgt “nu” bij het aanmaken van het transport. Losse tijdvelden die pas later relevant zijn (aankomst verwijzend ziekenhuis, laatste voeding, vertrek, aankomst ontvangend centrum) blijven leeg tot de gebruiker op **Nu invullen** drukt of zelf een tijd invoert; zo worden geen tijden geregistreerd die nog niet hebben plaatsgevonden. Een stoptijd wordt alleen bij **Infuus stoppen** ingevuld. Opgeslagen tijden veranderen nooit bij openen of herladen.
- **Leeg / onbekend / nul**: numerieke velden zijn `leeg` (niet ingevuld), expliciet **Onbekend** (knop naast het veld) of een ingevuld getal (0 is een echte nul). Lege waarden worden niet in het verslag opgenomen; “onbekend” wordt letterlijk vermeld.
- **Validatie** is alleen typevalidatie: geldig getal (komma of punt), geen negatieve waarden waar dat fysiek niet kan (BE mag negatief), percentages 0–100, Apgar 0–10 geheel, zwangerschapsdagen 0–6, pompsnelheid > 0. Er zijn geen klinische waarschuwingen.
- **Ademhalingsondersteuning**: instellingen worden per modaliteit bewaard binnen een meetmoment. Alleen de instellingen van de gekozen modaliteit worden getoond en geëxporteerd; wisselen en terugwisselen verliest niets. Een nieuw meetmoment neemt de modaliteit, de instellingen van díe modaliteit en de fase van het laatste meetmoment over als voorstel (zichtbare melding); monitor- en bloedgaswaarden worden nooit overgenomen. VG alleen bij PTV/SIMV; iNO alleen bij PTV/SIMV/HFOV.
- **Endotracheale tube**: een tube heeft een historie van versies (plaatsing, aanpassingen) met elk een ingangstijdstip. Op de tijdlijn toont een invasief meetmoment de tubeversie die op het tijdstip van dat meetmoment gold, dus latere aanpassingen veranderen eerdere meetmomenten niet. **Historische correctie** wijzigt bewust een bestaande versie en wordt in het verslag als correctie vermeld. **Nieuwe tube plaatsen** is een aparte handeling: de vorige tube wordt dan als vervangen geregistreerd op het tijdstip van plaatsing.
- **Infusen**: de eerste snelheid is de startsnelheid op het starttijdstip; wijzigingen worden met tijdstip toegevoegd. Het verslag toont het volledige verloop.
- **Verwijzend ziekenhuis**: vrije invoer met een korte voorstel-lijst van bestaande Nederlandse ziekenhuisnamen (`HOSPITAL_SUGGESTIONS` in `src/domain/labels.ts`). Laat deze lijst inhoudelijk controleren en aanvullen voor gebruik.
- **Toedieningsroutes** zijn configureerbaar via *Instellingen* op het startscherm (per apparaat).
- **E-mail**: *E-mailtekst kopiëren* kopieert het volledige verslag als platte tekst. *Concept openen in mailprogramma* opent een `mailto:`-concept; past de tekst niet veilig in de link (> ca. 1800 tekens), dan wordt de volledige tekst eerst naar het klembord gekopieerd en bevat het concept alleen een plakinstructie. Een mailto-concept bevat geen pdf-bijlage; er wordt nooit automatisch verzonden. De volledige tekst staat ook in een selecteerbaar tekstvak.
- **Tijdlijn als tabel**: de tijdlijn is één tabel met per rij één meetmoment (chronologisch) en kolommen voor ademhalingsondersteuning, monitorgegevens en bloedgas, gegroepeerd onder een kopregel. Meetnummer, fase en tube staan niet in de tabel (fase wordt wel per meetmoment ingevoerd; tubegegevens staan in sectie 10 en in het bewerkformulier van een invasief meetmoment). Type bloedgas wordt afgekort als A (arterieel), V (veneus) of C (capillair), met legenda. Kolommen zonder enige waarde worden weggelaten; eenheden staan in de kolomkop. Een instelling verschijnt alleen in de rij als die bij de modaliteit van dat meetmoment hoort. Luchtwegdruk (MAP luchtweg, cmH₂O) en bloeddruk (Bloeddruk MAP, mmHg) zijn aparte kolommen. In het formulier scrolt de tabel horizontaal binnen zijn eigen kader (de tijdkolom blijft staan); het formulier zelf scrolt niet horizontaal. Bewerken: tik op het tijdstip; verwijderen gaat via het bewerkformulier (met bevestiging).
- **Pdf**: echte A4-pdf (jsPDF), lange tekst breekt over regels en pagina's, koppen blijven bij hun inhoud. De tijdlijntabel staat op liggende A4-pagina's met verticale kolomkoppen; bij een paginawissel wordt de kopregel herhaald. Past de tabel niet in de breedte, dan wordt de letter tot ca. 5,4 pt verkleind; pas daarna (bij uitzonderlijk veel gevulde kolommen) wordt hij in kolomdelen gesplitst met herhaalde tijdkolom. In de e-mailtekst staat elk meetmoment als één regel. Paginanummering “Pagina x van y”. Daarnaast is er een afdrukweergave (knop *Afdrukken*, print-CSS).

## Uitgevoerde controles

Unit-tests (`npm test`, 35 tests):

- tijdlijn als één tabel: één rij per meetmoment, chronologisch, zonder #/fase/tube, bloedgastype A/V/C, lege kolommen weggelaten;

- doseergewicht bij twee gewichten, één bekend gewicht, lege invoer, handmatige override (blijft bij gewijzigde gewichten), opnieuw automatisch;
- postmenstruele leeftijd bij weekovergang en bij gewijzigde transportdatum (verwijzing 23:59 vs. 00:01), geen rekening met lege dagen;
- decimale komma/punt, leeg vs. 0, typevalidatie en positieve pompsnelheid;
- tijdzone-opslag (zomer/winter), transport en bloedgas over middernacht, wintertijdovergang;
- standaardtijd alleen bij nieuwe invoer; opgeslagen tijden blijven behouden na “herladen” (nieuwe repository op dezelfde opslag);
- zichtbaarheid van instellingen per modaliteit (VG alleen PTV/SIMV, iNO alleen invasief);
- chronologische sortering na achteraf toevoegen en aanpassen;
- geen overname van monitor- en bloedgaswaarden in een nieuw meetmoment;
- tubegegevens die op het tijdstip van een meetmoment golden, na aanpassing en na plaatsing van een nieuwe tube;
- conceptopslag, hervatten, verwijderen, aanvullen van ontbrekende velden;
- volledige e-mailtekst en meerpagina-A4-pdf met 63 meetmomenten en lange vrije tekst; alleen instellingen van de actuele modaliteit in de export; “onbekend” en lege waarden correct.

Interfacecontrole (`npm run ui-check`, 47 controles in Chromium): invoerscenario op 390 px (doseergewicht, validatieberichten, meetmomenten met modaliteitswissel, achteraf toegevoegd meetmoment, infuus starten/wijzigen, telefoonnummers ouders), herladen met behoud van gegevens en tijden, toetsenbordvolgorde, labels op alle invoervelden, geen horizontaal scrollen van het formulier op 390/768/1024 px, tijdlijn als één tabel met één rij per meetmoment, tubegegevens die op het tijdstip golden in het bewerkformulier, pdf-download en afdrukweergave. Screenshots en pdf's zijn handmatig bekeken.

Niet getest op een fysieke iPhone/iPad of in Safari; de datum-/tijdkiezers zien er per browser en systeemtaal anders uit.

## Projectstructuur

```
src/domain/     datamodel, labels en keuzelijsten, tijd/tijdzone, getallen, berekeningen, tijdlijn/tube-historie, voorbeelddata
src/storage/    TransportRepository-interface, localStorage-implementatie, instellingen
src/report/     verslagmodel (buildReport), e-mailtekst, pdf
src/ui/         formulier-componenten, secties, editor, verslagweergave, startscherm
scripts/        ui-check.mjs (Playwright)
```

## Resterend werk

- Centrale opslag (server/database) achter `TransportRepository`, met gebruikersaccounts, autorisatie, audit-log en samenwerking/synchronisatie tussen apparaten; conflictafhandeling bij gelijktijdig bewerken.
- Versleuteling van lokale gegevens en beleid voor automatisch opruimen van concepten; huidige opslag is onversleuteld `localStorage`.
- Verzenden via een mailserver of koppeling met het EPD (inclusief pdf-bijlage).
- Inhoudelijke validatie van de ziekenhuislijst en de standaard toedieningsroutes door de afdeling.
- Test op fysieke iOS/iPadOS-apparaten (Safari), met schermlezer (VoiceOver) en in liggende/staande oriëntatie.
- Offline gebruik als installeerbare web-app (service worker) en https-hosting; wordt niet gepubliceerd zonder afzonderlijke opdracht.
- Eventuele schema-migraties bij latere wijzigingen van het datamodel (`schemaVersion` staat al in elk record).
