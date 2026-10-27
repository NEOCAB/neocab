// Toetst het rekenmodel uit index.html aan de controlewaarden.
// Uitvoeren: node test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const html = readFileSync(fileURLToPath(new URL('./index.html', import.meta.url)), 'utf8');
const blok = html.match(/<script id="rekenmodel">([\s\S]*?)<\/script>/);
if (!blok) throw new Error('Script met id="rekenmodel" niet gevonden in index.html');

const context = vm.createContext({});
vm.runInContext(blok[1], context);
const R = context.Rekenmodel;

let fouten = 0;
let geslaagd = 0;
function gelijk(naam, werkelijk, verwacht, marge = 0.05) {
  const ok = Math.abs(werkelijk - verwacht) <= marge;
  if (ok) geslaagd++; else fouten++;
  console.log(`${ok ? 'ok  ' : 'FOUT'}  ${naam}: ${werkelijk.toFixed(3)} (verwacht ≈ ${verwacht})`);
}
function waar(naam, waarde) {
  if (waarde) geslaagd++; else fouten++;
  console.log(`${waarde ? 'ok  ' : 'FOUT'}  ${naam}`);
}

const g = R.STANDAARD_GEGEVENS;
const w = R.STANDAARD_GEWICHTEN;
const res = R.bereken(g, w);
const s = res.samenvatting;

console.log('Standaardinstellingen (VNW 1, VDW 0,6, AD 0,2)\n');
gelijk('T_VD', res.T.VD, 270, 0);
gelijk('T_VNW', res.T.VNW, 118, 0);
gelijk('T_VDW', res.T.VDW, 130, 0);
gelijk('T_AD', res.T.AD, 290, 0);
gelijk('P', res.P, 524, 0.5);
gelijk('p', res.p, 40.3);

gelijk('Optie D fellow voorwachtnachten', s.D.fellow.voorwacht, 40.3);
gelijk('Optie D neonatoloog voorwachtnachten', s.D.neo.voorwacht, 25.2);
gelijk('Optie D neonatoloog VDW', s.D.neo.VDW, 14.4);
gelijk('Optie D neonatoloog AD', s.D.neo.AD, 32.2);
gelijk('Optie D fellow punten = p', s.D.fellow.punten, res.p, 1e-9);
gelijk('Optie D neonatoloog punten = p', s.D.neo.punten, res.p, 1e-9);
waar('Optie D geen waarschuwing', !res.D.negatief);

gelijk('Huidige punten fellow', s.nu.fellow.punten, 52);
gelijk('Huidige punten neonatoloog', s.nu.neo.punten, 31.6);

gelijk('Optie A neonatoloog voorwachtnachten', s.A.neo.voorwacht, 20);
gelijk('Optie A fellow punten', s.A.fellow.punten, 52);
gelijk('Optie B fellow voorwachtnachten', s.B.fellow.voorwacht, 53.4);
gelijk('Optie B neonatoloog voorwachtnachten', s.B.neo.voorwacht, 19.4);
gelijk('Optie C fellow voorwachtnachten', s.C.fellow.voorwacht, 54.4);
gelijk('Optie C neonatoloog voorwachtnachten', s.C.neo.voorwacht, 18.9);

gelijk('Voorwachtnachten fellows totaal', res.vwFellows, 208, 0);
gelijk('Voorwachtnachten totaal', res.vwTotaal, 388, 0);
gelijk('Aandeel fellows in voorwacht (%)', res.aandeelFellowsVoorwacht * 100, 54, 0.5);
gelijk('Aandeel fellows in bezetting (%)', res.aandeelFellowsBezetting * 100, 29, 0.5);
gelijk('Omslagpunt wAD*', res.omslagAD, 0.90, 0.005);

console.log('\nBehoud van diensten (totaal na stoppen = totaal ervoor)\n');
for (const optie of ['A', 'B', 'C', 'D']) {
  const o = res.opties[optie];
  for (const t of R.TYPES) {
    const totaal = g.nFellows * o.fellow[t] + res.nNeoNa * o.neo[t];
    gelijk(`Optie ${optie} totaal ${t}`, totaal, res.T[t], 1e-9);
  }
}

console.log('\nRandgeval: VNW telt niet, VDW en AD maximaal\n');
const zwaar = R.bereken(g, { VNW: 0, VDW: 2, AD: 2 });
waar('Waarschuwing bij negatieve voorwacht neonatoloog', zwaar.D.negatief === true);
waar('Voorwacht neonatoloog niet onder 0', zwaar.D.neoVW === 0);

console.log(`\n${geslaagd} geslaagd, ${fouten} mislukt`);
process.exit(fouten ? 1 : 0);
