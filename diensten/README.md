# Dienstverdeling neonatologie

Statische website die uitlegt hoe de diensten in de vakgroep neonatologie verdeeld zijn, wat er verandert als een neonatoloog stopt met diensten, en hoe optie D (gelijke gewogen belasting) uitpakt bij een zelf gekozen weging. De site vervangt een slidedeck.

Alles staat in één bestand, `index.html` (inline CSS en JS, geen build-stap). Alleen het lettertype PT Sans komt van Google Fonts; zonder internet valt de pagina terug op een systeemlettertype.

## Openen

Dubbelklik op `index.html`, of open het bestand in een browser. De weging staat in de link (`?vnw=1&vdw=0.6&ad=0.2`), zodat je een instelling kunt delen. Op een webserver werkt dat altijd. Bij een los bestand (`file://`) werkt het in de meeste browsers ook.

## Standaardgegevens aanpassen

Tijdelijk: open in de pagina het paneel **Gegevens aanpassen** (bij de schuifjes).

Blijvend: pas in `index.html` het blok `<script id="rekenmodel">` aan:

- `STANDAARD_GEGEVENS`: aantal fellows, aantal neonatologen, aantal neonatologen dat stopt (`k`), en per persoon per jaar de aantallen VD, VNW, VDW en AD;
- `STANDAARD_GEWICHTEN`: de beginstand van de schuifjes.

Alle berekeningen staan in dat blok, als pure functies zonder DOM.

## Testen

```bash
node test.mjs
```

Het script haalt het rekenmodel uit `index.html` en toetst het aan de controlewaarden: P ≈ 524, p ≈ 40,3, de opties A–D, het aandeel van 54% bij 29% van de bezetting, en het omslagpunt wAD* ≈ 0,90. Daarnaast controleert het dat het totaal aantal diensten per type bij elke optie gelijk blijft, en dat er een waarschuwing komt als de voorwacht van een neonatoloog negatief zou worden. Er zijn geen dependencies nodig (Node 18 of nieuwer).

## Hosten

- **Als los bestand:** stuur `index.html` rond of zet het op een gedeelde schijf.
- **GitHub Pages:** zet *Settings → Pages* op de branch met deze map. De site staat dan op `https://<owner>.github.io/<repo>/diensten/`. Een eigen repository met alleen deze map kan ook; de site staat dan in de root.
- Elke andere statische webserver werkt ook; er is geen server-side code.
