# Neo.Cab

Prototype van een Nederlandstalige webapp voor de registratie van neonatale transporten tussen ziekenhuizen, bedoeld voor gebruik op telefoon en iPad tijdens verwijzing, stabilisatie en transport. Het resultaat is een volledig transportverslag als pdf-bestand en als kopieerbare e-mailtekst.

Dit is **registratiesoftware**: er zijn geen doseeradviezen of beslisregels. De enige berekende klinische waarde met een drempel is de oxygenatie-index (OI > 25 oranje gemarkeerd), op verzoek toegevoegd. Alle voorbeeldgegevens zijn fictief.

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

## Demo als claude.ai-artifact

`npm run build:artifact` bouwt de app en schrijft `dist/artifact.html`: een paginafragment (titel, stylesheet, script, root-element) dat samen met `dist/assets` en `dist/fonts` als artifact op claude.ai kan worden gepubliceerd. In die ingebedde weergave:

- worden concepten alleen in de browser van de kijker bewaard (eigen `localStorage` per artifact);
- loopt het opslaan van de pdf via de downloadbevestiging van claude.ai (capability `downloads`);
- is de knop *Afdrukken* verborgen, omdat de ingebedde weergave niet kan afdrukken;
- kan het openen van het mailprogramma niet werken; de volledige tekst staat dan al op het klembord en in het tekstvak.

Bevestigingen (bijv. bij verwijderen) zijn een venster binnen de pagina, zodat ze ook in de ingebedde weergave werken. Als lokale opslag niet beschikbaar is (privévenster), meldt de app dat gegevens verloren gaan bij sluiten.

## Controles

```bash
npm test             # unit-tests (Vitest): rekenlogica, tijden, tijdlijn, opslag, verslag, pdf
npm run typecheck    # TypeScript
npm run build && npm run preview &   # daarna:
npm run ui-check     # interfacecontrole met Playwright/Chromium op 390, 768 en 1024 px
```

`npm run ui-check` gebruikt `playwright-core` en een lokaal geïnstalleerde Chromium (zet zo nodig `CHROMIUM_PATH`). Screenshots en de gedownloade pdf's komen in `test-output/`. Met `WRITE_PDF=1 npx vitest run` worden ook `test-output/voorbeeld-verslag.pdf` en `test-output/groot-verslag.pdf` (63 meetmomenten en lange vrije tekst) geschreven voor handmatige review.

## Huisstijl

De vormgeving volgt de aangeleverde huisstijlrichtlijn, zonder logo, monogram of naam van de organisatie:

- Lettertype **PT Sans** (SIL Open Font License), lokaal meegeleverd via `@fontsource/pt-sans` voor het scherm en als TTF in `public/fonts` voor de pdf. Hoofdtekst 15 px volgens de richtlijn; invoervelden 16 px (voorkomt inzoomen op iOS); koppen vet.
- Logo **Neo.Cab** (`src/assets/neocab-logo.svg`): alleen het beeldmerk (taxi), zonder achtergrond en tekst, in donkerblauw `#003c7d`. Met de naam Neo.Cab links in de bovenbalk van het formulier; logo en naam leiden terug naar het overzicht van concepten (er is geen aparte knop Overzicht). Op de startpagina, bovenaan het verslag en rechtsboven op de eerste pdf-pagina (in de browser omgezet naar png; lukt dat niet, dan zonder logo). Favicon `public/favicon.svg` is hetzelfde beeldmerk.
- Kleuren: **donkerblauw `#003c7d`** als kernkleur (koppen, knoppen, tabelkop), **kobaltblauw `#007cc2`** als aanvullende kleur (focus, hover) en tinten daarvan (20%). Extra kleuren uit het palet: lichtblauw `#cee8ef` (berekende leeftijd, badges), zand `#f0e2d2` (meldingen), groen `#b9debc` (checklist gedaan) en rood `#ed1846` spaarzaam (checklist niet van toepassing, verwijderen).
- Lopende tekst zwart, koppen donkerblauw; witte tekst alleen op een volle kleur (knoppen, tabelgroepkop).
- Lichtblauwe pagina-achtergrond (zeer lichte tint van kobaltblauw, `#e8f3fa`) met de secties als witte vlakken; strakke hoeken (2 px), geen schaduwen; zijnavigatie in de stijl van een inhoudsopgave.
- Tijdlijntabel: compacte waarden, verticale kolomkoppen in de tweede rij (eenheid tussen haakjes), getallen rechts uitgelijnd, groepen gescheiden door een lijn, tijd vet in de vaste eerste kolom. De datum staat alleen onder de tijd als de meetmomenten over meer dan één kalenderdag gaan.
- Zes vaste tijdstippen in dezelfde vormgeving (icoon safety_check, naam zonder extra toelichting, datum/tijd met *Nu* en *Wissen*, donkerblauwe streep links), op hun plek in het formulier en met dezelfde namen in verslag en pdf:
  | Tijdstip | Sectie |
  |---|---|
  | Verwijzing | Herkomst en bestemming |
  | Ambulance aangevraagd | Dispatch |
  | Vertrek transportteam | Dispatch |
  | Aankomst bij kind | Dispatch |
  | Vertrek met kind | Transport |
  | Aankomst ontvangend centrum | Transport |
- Gecorrigeerde leeftijd: opgemaakt als een invoerveld (label erboven, zelfde hoogte, rand en lettergrootte), met lichtblauwe achtergrond en niet invulbaar.
- Alle datum/tijdvelden hebben icoonknoppen: klok = *Nu* (vult de huidige tijd in, ook over een bestaande tijd heen) en kruis = *Wissen* (met tooltip en volledige naam voor schermlezers); bij verplichte tijden (meetmoment, start infuus, tube) alleen *Nu*.
- Basisgegevens kind: acht velden in een raster van 2 kolommen × 4 rijen (telefoon) of 4 kolommen × 2 rijen (vanaf 720 px breed).
- Koppen zonder nummer; de tijdlijn heet *Tijdlijn* met als toelichting *Ademhalingsondersteuning, monitorgegevens en bloedgassen*. Geen veld Allergieën en geen legenda bij de checklist.
- Sectiekoppen, zijnavigatie en verslagkoppen hebben een Material Symbols-icoon (outlined, gewicht 700 passend bij de vette koppen, via `@material-symbols/svg-700`, alleen de gebruikte SVG's): id_card, route, clinical_notes (Verwijzing), ambulance, stethoscope (Stabilisatie), timeline, lab_research, medication, vaccines, ventilator, surgical, family_home, checklist, flag. De zes vaste tijdstippen hebben het icoon safety_check.
- De negen klinische kopjes (Airway, Breathing, Circulation, Disability, Exposure, Fluids, Gastro-intestinal, Haematological, Infection) bij Verwijzing en Stabilisatie hebben hun beginletter in een donkerblauw rondje vóór het woord; de invulvelden beginnen op één regel en groeien mee met de tekst (alleen visueel; de veldnaam voor schermlezers blijft het woord). Onder *Instellingen* op de startpagina kan worden gekozen om alleen de letter te tonen, links van het invulveld (het woord verschijnt dan als tooltip en blijft de naam voor schermlezers); deze instelling geldt per apparaat.
- Reden van overplaatsing: vrije tekst plus de vaste optie *Therapeutische hypothermie* (vierkant vinkje). Is die gekozen, dan verschijnen bij *Verwijzing* de kopjes *Perinatale asfyxie* (direct de zes criteria uit het protocol om aan te vinken, met een aanduiding welke al blijken uit Apgar 5 minuten en navelstrengbloedgassen) en *Thompson Score* (protocol Therapeutische hypothermie na perinatale asfyxie): tijdstip, een tabel zoals in het protocol (per verschijnsel een rij, per score 0–3 een kolom met een rond keuzerondje), automatisch totaal (0–22, met het aantal ingevulde onderdelen als het nog onvolledig is) en de drempel uit het protocol (≥ 7 op 1 uur na de reanimatie, of afwijkend aEEG). Zet je de optie uit, dan verdwijnt de score uit formulier en verslag maar blijft hij bewaard.
- Secties: Basisgegevens kind, *Herkomst en bestemming*, *Verwijzing* (samengevoegd uit Zwangerschap en geboorte en Toestand bij verwijzing, met subkoppen *Zwangerschap en geboorte*, *Toestand bij verwijzing* en *Advies*; het veld Advies bij verwijzing is optioneel en het blok Advies staat alleen in het verslag als het is ingevuld), Dispatch, *Stabilisatie* (voorheen Onderzoek door transportteam), Tijdlijn, Overige diagnostiek, *Plastic* (lijnen, sondes, drains en endotracheale tube; voorheen zo genoemd; vóór medicatie), *Medicatie* (voorheen Medicatietoedieningen), *Infusen* (voorheen Lopende infusen), *Notities* (voorheen Procedures en gebeurtenissen), *Gezin* (voorheen Ouders en gezin), Checklist voor vertrek, *Transport* (voorheen Afsluiting transport) (14 secties).
- Uitzondering: de oranje markering voor OI > 25 is op verzoek en valt buiten het palet.
- PT Sans bevat geen `⁻` en `→`; in de pdf worden die als `-` en `naar` weergegeven.

## Stack

- Vite + React 19 + TypeScript (geen UI-framework; eigen CSS)
- jsPDF voor het pdf-bestand, met het meegeleverde lettertype PT Sans (`public/fonts`, licentie in `PTSans-OFL.txt`); bevat subscripts (FiO₂, pCO₂), Δ en °
- Vitest voor tests, playwright-core voor de interfacecontrole

## Opslag

- **Alleen lokaal in de browser** (`localStorage`), per apparaat en per browser. Er is geen server, geen account en geen synchronisatie tussen apparaten.
- Elke transportregistratie is één JSON-document onder sleutel `neonataal-transport:v1:<id>`, met een index `neonataal-transport:v1:index`. Instellingen (tijdzone, toedieningsroutes) staan onder `neonataal-transport:v1:instellingen`.
- Wijzigingen worden kort na elke invoer automatisch als concept opgeslagen, en ook bij het verlaten of wegklikken van de pagina; een aparte opslagknop is er niet. Links naast *Verslag & export* staat alleen een diskette-icoon (zonder tekst; het tijdstip van de laatste opslag staat in de tooltip en is beschikbaar voor schermlezers). Kleur en icoon: **groen** met diskette als alles is opgeslagen of een wijziging hooguit 10 s wacht; **oranje** met diskette-met-klok als een wijziging 10 s tot 1 minuut wacht; **rood** met diskette-met-klok als een wijziging langer dan 1 minuut wacht of opslaan mislukt (`src/ui/saveStatus.ts`).
- Op het startscherm staan alle concepten op dit apparaat: **Hervatten** en **Verwijderen** (met bevestiging).
- Het opslaan loopt via de interface `TransportRepository` (`src/storage/repository.ts`). Een centrale opslag kan later dezelfde interface implementeren; alle onderliggende records (meetmomenten, medicatietoedieningen, infusen en snelheidswijzigingen, lijnen, tubeversies) hebben al stabiele identifiers.
- Wissen van browsergegevens of een privévenster betekent verlies van de concepten. Gebruik dit prototype niet voor echte patiëntgegevens.

## Technische aannames

- **Gecorrigeerde leeftijd** = amenorroeduur bij geboorte + het aantal verstreken **kalenderdagen** van geboortedatum tot de **transportdatum**. Als transportdatum geldt de lokale datum van *Datum en tijd verwijzing*. De amenorroeduur wordt in één veld ingevoerd als `weken+dagen` (bijv. `33+5`); alleen weken (`33`) betekent 33+0. Dagen 0–6. De postnatale leeftijd wordt apart getoond als postnatale dag: de geboortedag is dag 1, de volgende kalenderdag dag 2, enz. (geen extra formulierveld).
- **Tijdstippen** worden opgeslagen als ISO-8601 met UTC-offset (bijv. `2026-10-09T23:45:00+02:00`) en getoond in de gekozen tijdzone (standaard Europe/Amsterdam, instelbaar op het startscherm). Geboortedatum en weegdatum zijn lokale kalenderdatums zonder tijdzone; geboortetijd is een lokale kloktijd. Bij het dubbele uur van de wintertijdovergang wordt het eerste voorkomen gekozen.
- **Standaardtijd “nu”**: nieuwe records (meetmoment, medicatietoediening, infuus, snelheidswijziging, tubeplaatsing/-aanpassing) krijgen bij aanmaken de huidige tijd (afgerond op de minuut). *Datum en tijd verwijzing* krijgt “nu” bij het aanmaken van het transport. Losse tijdvelden die pas later relevant zijn (aankomst verwijzend ziekenhuis, laatste voeding, vertrek, aankomst ontvangend centrum) blijven leeg tot de gebruiker op **Nu invullen** drukt of zelf een tijd invoert; zo worden geen tijden geregistreerd die nog niet hebben plaatsgevonden. Een stoptijd wordt alleen bij **Infuus stoppen** ingevuld. Opgeslagen tijden veranderen nooit bij openen of herladen.
- **Leeg / nul**: numerieke velden zijn leeg (niet ingevuld) of een ingevuld getal (0 is een echte nul); er zijn geen knoppen voor “onbekend”. Lege waarden worden niet in het verslag opgenomen. Keuzevelden die in de opdracht een optie *Onbekend* hebben (antenatale corticosteroïden, magnesiumsulfaat) houden die optie.
- **Validatie** is alleen typevalidatie: geldig getal (komma of punt), geen negatieve waarden waar dat fysiek niet kan (BE mag negatief), percentages 0–100, Apgar 0–10 geheel, zwangerschapsdagen 0–6, pompsnelheid > 0. Er zijn geen klinische waarschuwingen.
- **Ademhalingsondersteuning**: instellingen worden per modaliteit bewaard binnen een meetmoment. Alleen de instellingen van de gekozen modaliteit worden getoond en geëxporteerd; wisselen en terugwisselen verliest niets. Een nieuw meetmoment neemt de modaliteit, en de instellingen van díe modaliteit van het laatste meetmoment over als voorstel (zichtbare melding); monitor- en bloedgaswaarden worden nooit overgenomen. VG alleen bij PTV/SIMV; iNO alleen bij PTV/SIMV/HFOV.
- **Endotracheale tube**: een tube heeft een historie van versies (plaatsing, aanpassingen) met elk een ingangstijdstip. Op de tijdlijn toont een invasief meetmoment de tubeversie die op het tijdstip van dat meetmoment gold, dus latere aanpassingen veranderen eerdere meetmomenten niet. **Historische correctie** wijzigt bewust een bestaande versie en wordt in het verslag als correctie vermeld. **Nieuwe tube plaatsen** is een aparte handeling: de vorige tube wordt dan als vervangen geregistreerd op het tijdstip van plaatsing.
- **Infusen**: de eerste snelheid is de startsnelheid op het starttijdstip; wijzigingen worden met tijdstip toegevoegd. Het verslag toont het volledige verloop.
- **Verwijzend ziekenhuis**: vrije invoer met een korte voorstel-lijst van bestaande Nederlandse ziekenhuisnamen (`HOSPITAL_SUGGESTIONS` in `src/domain/labels.ts`). Laat deze lijst inhoudelijk controleren en aanvullen voor gebruik.
- **Toedieningsroutes** zijn configureerbaar via *Instellingen* op het startscherm (per apparaat).
- **E-mail**: *E-mailtekst kopiëren* kopieert het volledige verslag als platte tekst. *Concept openen in mailprogramma* opent een `mailto:`-concept; past de tekst niet veilig in de link (> ca. 1800 tekens), dan wordt de volledige tekst eerst naar het klembord gekopieerd en bevat het concept alleen een plakinstructie. Een mailto-concept bevat geen pdf-bijlage; er wordt nooit automatisch verzonden. De volledige tekst staat ook in een selecteerbaar tekstvak.
- **Tijdlijn als tabel**: de tijdlijn is één tabel met per rij één meetmoment (chronologisch) en kolommen voor ademhalingsondersteuning, monitorgegevens en bloedgas, gegroepeerd onder een kopregel. Meetnummer, fase en tube staan niet in de tabel (tubegegevens staan in sectie 10 en in het bewerkformulier van een invasief meetmoment). Type bloedgas wordt afgekort als A (arterieel), V (veneus) of C (capillair), met legenda. Kolommen zonder enige waarde worden weggelaten; eenheden staan in de kolomkop. Een instelling verschijnt alleen in de rij als die bij de modaliteit van dat meetmoment hoort. Bij CPAP wordt de druk als PEEP ingevoerd (CPAP-druk is gelijk aan PEEP) en staat die in de kolom PEEP; er is geen apart CPAP-veld of CPAP-kolom. Luchtwegdruk (MAP luchtweg, cmH₂O) en bloeddruk (Bloeddruk MAP, mmHg) zijn aparte kolommen. In het formulier scrolt de tabel horizontaal binnen zijn eigen kader (de tijdkolom blijft staan); het formulier zelf scrolt niet horizontaal. Bewerken: tik op het tijdstip; verwijderen gaat via het bewerkformulier (met bevestiging).
- **Tijdlijn als grafiek**: met de weergavekeuze rechtsboven naast de kop *Tijdlijn* (knoppen met icoon table_chart / show_chart; op een smal scherm alleen de iconen); `src/ui/TimelineCharts.tsx`. Alle grafieken staan onder elkaar in één kolom, met de y-as op dezelfde plek en dezelfde tijd-as (werkelijke tijd), zodat een meetmoment overal recht boven elkaar staat. *Beademing*: drukken (PIP, PEEP, MAP luchtweg, PS, ΔP) en FiO₂ samen op één as, VG als eigen strook eronder (eigen schaal). *Vitale functies*: HF, AF, SpO₂ pre/post en bloeddruk samen op één as. *Bloedgas*: één grafiek met per waarde een strook met eigen schaal. Overige waarden (frequentie, temperatuur, capillaire refill, tcCO₂, OI) als losse grafieken; iT (inspiratietijd, in de tabel nu *iT*) staat niet in de grafieken. Boven de beademing staat de modaliteit als band. Series in één grafiek hebben elk een vaste kleur (categorisch palet, gecontroleerd op kleurenblindheid) én een eigen markeringsvorm; de legenda toont per serie de waarde. OI > 25 is een oranje punt met de drempel als oranje lijn. Wijzen (of pijltjestoetsen) toont in alle grafieken hetzelfde meetmoment; tikken of Enter opent het om te bewerken. Elke grafiek heeft voor schermlezers een tekstuele samenvatting; de tabel blijft beschikbaar. De gekozen weergave wordt per apparaat onthouden. Alleen in het formulier; verslag, pdf en e-mail gebruiken de tabel.
- **Meetmoment invoeren**: datum en tijd, dan de ingeklapte kopjes *Ademhalingsondersteuning*, *Monitorgegevens* en *Bloedgas*, en het vrije veld *Beleidsaanpassingen*. Ingeklapt toont *Ademhalingsondersteuning* wat er laatst is ingevuld (modaliteit en instellingen); uitgeklapt verdwijnt die toelichting en verschijnt het volledige formulier. Er is geen veld Fase meer (oude gegevens blijven bewaard maar worden niet getoond).
- **Beleidsaanpassingen**: per meetmoment vrije tekst, niet overgenomen in een nieuw meetmoment. In de tabel (formulier, verslag en pdf) staat de tekst zonder het woord *Beleidsaanpassingen* als aparte rij direct onder het meetmoment, met dezelfde achtergrond als die rij; de tijdcel loopt over beide rijen door. In de e-mailtekst als regel *Beleidsaanpassingen: …* onder het meetmoment. Oudere concepten krijgen bij laden een leeg veld.
- **Werk- of persoonlijk apparaat** (startpagina, *Op welk apparaat werk je?*; standaard *Werkapparaat*; geldt per apparaat). Op een **persoonlijk apparaat** worden transporten anoniem vastgelegd: *Naam kind* en *Patiëntnummer* zijn leeg en niet in te vullen; de geboortedatum en alle andere gegevens blijven. Nieuwe transporten, het voorbeeldtransport en geïmporteerde overdrachten worden bij openen anoniem gemaakt; als vangnet wordt ook een concept met naam of patiëntnummer bij openen anoniem gemaakt. Bij overstappen naar persoonlijk vraagt de app eerst of naam en patiëntnummer uit bestaande concepten verwijderd mogen worden (anders blijft het werkapparaat). In lijsten en koppen heet zo'n transport *Anoniem transport* (met geboortedatum). Let op: vrije tekstvelden en telefoonnummers van ouders of verwijzer kunnen nog steeds tot een persoon herleidbaar zijn.
- **Overdracht aan een collega** (*Verslag & export* → *Overdragen aan een collega*): de volledige registratie, met alle identifiers, gaat als overdrachtscode in een e-mail (`src/storage/handover.ts`): JSON, gecomprimeerd met gzip, in base64 tussen de regels `-----BEGIN NEO.CAB OVERDRACHT-----` en `-----EINDE NEO.CAB OVERDRACHT-----`. *Overdracht per e-mail* zet uitleg en code op het klembord en opent een concept in het mailprogramma; *Overdrachtsbestand downloaden* geeft hetzelfde als `.txt`-bijlage. Er wordt niets automatisch verzonden. De ontvanger kiest op de startpagina *Transport importeren* en plakt de hele e-mail (ook doorgestuurd of geciteerd met `>`) of opent het bestand. Bestaat het transport al op dat apparaat, dan vraagt de app eerst om bevestiging om te vervangen. Oudere codes worden bij importeren aangevuld zoals opgeslagen concepten.
- Toevoegknoppen staan rechtsboven, op één lijn met de kop van de sectie, met het icoon *add circle*: *Nieuw meetmoment* (met de weergavekeuze ernaast), bij Medicatie en Infusen *Toevoegen*, en bij Plastic *Toevoegen*, dat een menu opent om het type te kiezen (perifeer infuus, UVC, UAC, …, endotracheale tube). Op een smal scherm alleen het icoon (de tekst blijft als tooltip en voor schermlezers).
- **Keuzelijst ziekenhuizen** bij *Verwijzend ziekenhuis* en *Ontvangend ziekenhuis* (`src/domain/hospitals.ts`): doorzoekbare keuzelijst (combobox) met ziekenhuislocaties in Nederland met een klinische kinderafdeling of neonatologie, als "Naam, Plaats"; de NICU-centra hebben een label *NICU*. Pijltje = hele lijst; typen filtert (zonder hoofdletters/accenten, op alle woorden, ook "nicu"); kiezen met muis of pijltjes + Enter; vrije tekst blijft mogelijk. Er is geen officieel landelijk register van klinische kinderafdelingen; de lijst is samengesteld op basis van openbare informatie (oktober 2026) en is per apparaat aan te passen via *Instellingen* (één per regel, optioneel `| NICU`), met *Standaardlijst herstellen*. Zolang de lijst niet zelf is aangepast, volgt een apparaat altijd de actuele standaardlijst. Bewust niet opgenomen (geen klinische kinderafdeling meer volgens openbare bronnen): Isala Meppel, Sionsberg Dokkum, St Jansdal Lelystad, Treant Hoogeveen en Stadskanaal, Gelre Zutphen.
- **Route en reistijd** (`src/domain/route.ts`, `src/ui/RouteBox.tsx`): zodra verwijzend én ontvangend ziekenhuis zijn ingevuld, verschijnt onder Herkomst en bestemming een vak met de reistijd en afstand per auto, de belangrijkste wegen en links naar Google Maps en Apple Kaarten. Bron, in deze volgorde: (1) **TomTom Routing API** met actueel verkeer (en de vertraging door verkeer), als er bij het bouwen een sleutel is; (2) de openbare OpenStreetMap-routeplanner (OSRM), zonder actueel verkeer; (3) lukt geen van beide, dan *Reistijd niet beschikbaar* en alleen de links (bewust geen schatting). Er gaan alleen de coördinaten van de twee ziekenhuizen mee, geen patiëntgegevens; routes worden 5 minuten onthouden. Coördinaten zijn benaderd en alleen bekend voor de standaardlijst. Alleen ter informatie; niet in het verslag.
- **TomTom-sleutel**: zet `VITE_TOMTOM_KEY=<sleutel>` in `.env.local` (staat in `.gitignore`, komt dus niet in git) vóór `npm run build`. De sleutel komt wel in de gebouwde website terecht (onvermijdelijk bij gebruik vanuit de browser): beperk hem daarom in het TomTom-ontwikkelaarsportaal tot de eigen domeinen (bijv. www.neo.cab). Zonder sleutel gebruikt de app alleen OSRM.
- **Medicatie en infusen als tabel** (formulier, verslag, pdf en e-mailtekst; `medicationTable` en `infusionTable` in `src/report/buildReport.ts`). Medicatie: één rij per toediening (chronologisch) met Tijd, Medicament, Dosis (met eenheid) en Toedieningsroute; *+ Toediening toevoegen* en tikken op de tijd openen een invoerscherm met Opslaan / Annuleren / Verwijderen. Infusen: één rij per infuus met Start, Medicatie en concentratie, Pompsnelheid (mL/uur, met het verloop: startsnelheid en elke wijziging met tijdstip) en Stop (of *loopt*); tikken op de starttijd opent het infuus om de snelheid te wijzigen of te stoppen. De datum staat alleen in de tijdcel als de rijen over meer dan één dag gaan. Alle cellen links uitgelijnd. In de pdf staan deze tabellen op staande pagina's met liggende kolomkoppen; in de e-mailtekst één regel per toediening of infuus.
- **Pdf**: echte A4-pdf (jsPDF), lange tekst breekt over regels en pagina's, koppen blijven bij hun inhoud. De tijdlijntabel staat op liggende A4-pagina's met verticale kolomkoppen; bij een paginawissel wordt de kopregel herhaald. Past de tabel niet in de breedte, dan wordt de letter tot ca. 5,4 pt verkleind; pas daarna (bij uitzonderlijk veel gevulde kolommen) wordt hij in kolomdelen gesplitst met herhaalde tijdkolom. In de e-mailtekst staat elk meetmoment als één regel. Paginanummering “Pagina x van y”. Daarnaast is er een afdrukweergave (knop *Afdrukken*, print-CSS).

## Uitgevoerde controles

Unit-tests (`npm test`, 71 tests):

- tijdlijn als één tabel: één rij per meetmoment, chronologisch, zonder #/fase/tube, bloedgastype A/V/C, lege kolommen weggelaten;
- beleidsaanpassingen als aparte rij bij hetzelfde meetmoment (tabel en e-mailtekst), niet overgenomen in een nieuw meetmoment, aangevuld bij oude concepten;

- amenorroeduur als `weken+dagen` (33+5, 33, ongeldige dagen);
- gecorrigeerde leeftijd bij weekovergang en bij gewijzigde transportdatum (verwijzing 23:59 vs. 00:01), geen rekening met lege dagen;
- decimale komma/punt, leeg vs. 0, typevalidatie en positieve pompsnelheid;
- tijdzone-opslag (zomer/winter), transport en bloedgas over middernacht, wintertijdovergang;
- standaardtijd alleen bij nieuwe invoer; opgeslagen tijden blijven behouden na “herladen” (nieuwe repository op dezelfde opslag);
- zichtbaarheid van instellingen per modaliteit (VG alleen PTV/SIMV, iNO alleen invasief);
- chronologische sortering na achteraf toevoegen en aanpassen;
- geen overname van monitor- en bloedgaswaarden in een nieuw meetmoment;
- tubegegevens die op het tijdstip van een meetmoment golden, na aanpassing en na plaatsing van een nieuwe tube;
- conceptopslag, hervatten, verwijderen, aanvullen van ontbrekende velden;
- volledige e-mailtekst en meerpagina-A4-pdf met 63 meetmomenten en lange vrije tekst; alleen instellingen van de actuele modaliteit in de export; “onbekend” en lege waarden correct.

Interfacecontrole (`npm run ui-check`, 183 controles in Chromium): invoerscenario op 390 px (verwijderde velden en onbekend-knoppen, amenorroeduur en gecorrigeerde leeftijd, volgorde sectie 2, contactgegevens ouders in sectie 12, validatieberichten, meetmomenten met modaliteitswissel, achteraf toegevoegd meetmoment, infuus starten/wijzigen, telefoonnummers ouders), herladen met behoud van gegevens en tijden, toetsenbordvolgorde, labels op alle invoervelden, geen horizontaal scrollen van het formulier op 390/768/1024 px, tijdlijn als één tabel met één rij per meetmoment, tubegegevens die op het tijdstip golden in het bewerkformulier, pdf-download en afdrukweergave. Screenshots en pdf's zijn handmatig bekeken.

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

## Oxygenatie-index (OI)

- OI = (MAP × FiO₂ × 100) / PaO₂, per meetmoment automatisch berekend en als laatste kolom (groep *Berekend*, achter *Bloedgas*) in de tijdlijntabel getoond (formulier, verslag, pdf, e-mailtekst), plus live in het bewerkformulier van een meetmoment.
- MAP = luchtweg-MAP in cmH₂O: bij PTV/SIMV de gemeten MAP, bij HFOV de ingestelde MAP. Alleen bij invasieve beademing.
- FiO₂ wordt in % ingevoerd; in de formule als fractie (dus FiO₂ % / 100 × 100).
- PaO₂: alleen een **arterieel** bloedgas telt. pO₂ wordt in kPa ingevoerd en voor de OI omgerekend naar mmHg (× 7,50062), zodat de waarde op de gebruikelijke OI-schaal ligt.
- Ontbreekt een van deze gegevens, dan blijft de OI-cel leeg; is de OI bij geen enkel meetmoment berekenbaar, dan vervalt de kolom.
- OI > 25 krijgt een oranje alert (cel oranje met ▲, in de pdf oranje cel, in de e-mailtekst “LET OP: > 25”). Precies 25 geeft geen alert.

## Formulieraanpassingen na eerste review

- Ontvangende afdeling en ontvangend ziekenhuis zijn standaard leeg.

- Patiëntnummer als vrije tekst; geen geslacht, weegdatum of doseergewicht.
- Amenorroeduur als één veld `weken+dagen`; gecorrigeerde leeftijd in plaats van postmenstruele leeftijd.
- Sectie 2: eerst datum en tijd verwijzing, dan verwijzer (ziekenhuis, afdeling, naam, telefoon), dan ontvangende afdeling en ziekenhuis.
- Infusen: *Medicatie en concentratie* in plaats van *Vloeistof of medicament*.
- Contactgegevens ouders staan bij sectie 13 (Ouders en gezin), zonder extra omlijsting: twee velden naast elkaar, *Telefoonnummer moeder* en *Telefoonnummer partner*; checklistpunt 5 bevat alleen de status. Oudere concepten met een lijst telefoonnummers worden bij laden omgezet (eerste nummer = moeder, overige = partner).
- Sectie 1: het blauwe vak met gecorrigeerde leeftijd en postnatale dag staat rechts naast het veld Amenorroeduur, ook op een telefoon. Eén label *Gecorrigeerde leeftijd* met daaronder de waarde inclusief postnatale dag (bijv. `34+0 wk · dag 3`); is het kind jonger dan 72 uur en zijn geboortedatum en -tijd ingevuld, dan volgt ook de leeftijd in uren en minuten tot nu (bijv. `· 50 u 12 min`, elke 30 seconden bijgewerkt), in dezelfde lettergrootte als ingevulde waarden en op één lijn met de ingevulde amenorroeduur. Het vak is even breed als het invoerveld.
- Checklist voor vertrek (11 punten), aangevuld met: Medische overplaatsingsbrief; Verpleegkundige overplaatsingsbrief; Directions and contact details of the receiving hospital for parent(s); Neurodevelopment (positioning, lighting and noise reduction); Continuous monitoring (minimaal SpO₂-monitoring). Oudere concepten krijgen deze punten als *nog niet gedaan*.
- Checklist voor vertrek: per punt één vakje vóór de tekst; tikken op vakje of tekst wisselt leeg (nog niet gedaan) → groen met ✓ (gedaan) → rood met ✕ (niet van toepassing) → leeg.
- De checklist voor vertrek (sectie 14) staat alleen in het formulier en wordt niet opgenomen in het verslag, de pdf of de e-mailtekst; het verslag springt daar van sectie 13 naar 15, zodat de nummers gelijk blijven aan het formulier.
- Nieuwe sectie 5 *Dispatch* (tussen Toestand bij verwijzing en Stabilisatie): *Ambulance aangevraagd* en *Vertrek transportteam*, standaard leeg met knop *Nu invullen*. De secties daarna zijn één nummer opgeschoven (nu 15 secties).
- Geen toelichtingsteksten bij verwijzing, tijdlijn, monitorgegevens en lopende infusen.
