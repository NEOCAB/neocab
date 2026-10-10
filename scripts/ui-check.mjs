// Interface-controle met Playwright (Chromium) tegen de draaiende app.
// Gebruik: npm run build && npx vite preview --port 4173 &  dan: npm run ui-check
// Optioneel: BASE_URL=http://127.0.0.1:5173/ CHROMIUM_PATH=/pad/naar/chromium
import { chromium } from 'playwright-core';
import { mkdirSync, statSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const OUT = 'test-output';
mkdirSync(OUT, { recursive: true });

const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'OK  ' : 'FOUT'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function noHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

async function unlabeledControls(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('input, select, textarea')]
      .filter((el) => el.type !== 'radio' && el.type !== 'hidden')
      .filter((el) => !(el.labels && el.labels.length) && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby'))
      .map((el) => el.outerHTML.slice(0, 80)),
  );
}

// ---------------------------------------------------------------------------
// Telefoon 390 px: invoerscenario
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, timezoneId: 'Europe/Amsterdam', locale: 'nl-NL', acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.screenshot({ path: `${OUT}/390-start.png`, fullPage: true });

  await page.getByRole('button', { name: '+ Nieuw transport' }).click();
  await page.getByLabel('Naam kind', { exact: true }).fill('Testbaby UI');
  await page.getByLabel('Patiëntnummer', { exact: true }).fill('0007788');
  const referred = await page.getByLabel('Datum en tijd verwijzing', { exact: true }).inputValue();
  check('Ontvangende afdeling en ziekenhuis standaard leeg', (await page.getByLabel('Ontvangende afdeling', { exact: true }).inputValue()) === '' && (await page.getByLabel('Ontvangend ziekenhuis', { exact: true }).inputValue()) === '');
  check('Datum/tijd verwijzing krijgt standaard nu', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(referred), referred);
  check('Aankomst verwijzend ziekenhuis blijft leeg', (await page.getByLabel('Datum en tijd aankomst bij het verwijzende ziekenhuis', { exact: true }).inputValue()) === '');

  // Basisgegevens: verwijderde velden en onbekend-knoppen
  for (const gone of ['Geslacht', 'Weegdatum huidig gewicht', 'Doseergewicht', 'Weken', 'Dagen']) {
    check(`Veld "${gone}" bestaat niet meer`, (await page.getByLabel(gone, { exact: true }).count()) === 0);
  }
  check('Geen knoppen voor onbekend', (await page.getByRole('button', { name: /onbekend/i }).count()) === 0);
  await page.getByLabel('Geboortegewicht', { exact: true }).fill('1980');
  await page.getByLabel('Huidig gewicht', { exact: true }).fill('1890');

  // Amenorroeduur als weken+dagen in één veld, gecorrigeerde leeftijd
  await page.getByLabel('Geboortedatum', { exact: true }).fill(referred.slice(0, 10));
  const ga = page.getByLabel('Amenorroeduur', { exact: true });
  await ga.fill('33+9');
  await ga.blur();
  check('Validatiebericht bij ongeldige dagen', await page.getByText('Het aantal dagen is 0 tot en met 6.').isVisible());
  await ga.fill('33+5');
  await ga.blur();
  const ca = await page.locator('.computed').textContent();
  const cb = await page.locator('#s1 .computed').boundingBox();
  const gb = await ga.boundingBox();
  const sizes = await page.evaluate(() => [getComputedStyle(document.querySelector('#s1 .computed-value')).fontSize, getComputedStyle(document.querySelector('#s1 .gestation-field input')).fontSize]);
  check('Waarden in blauw vak even groot als invoer', sizes[0] === sizes[1], sizes.join(' / '));
  check('Blauw vak rechts van amenorroeduur, gelijke onderkant', !!cb && !!gb && cb.x > gb.x && Math.abs(cb.y + cb.height - (gb.y + gb.height)) < 3, JSON.stringify([cb, gb]));
  check('Gecorrigeerde leeftijd berekend', ca?.includes('Gecorrigeerde leeftijd33+5 wk'), ca);
  check('Postnatale leeftijd op geboortedag is dag 1', ca?.includes('Postnatale leeftijddag 1'), ca);

  // Volgorde sectie 2: datum/tijd, verwijzer, ontvangende afdeling en ziekenhuis
  const s2 = await page.locator('#s2 .field-label').allTextContents();
  check('Sectie 2 in gevraagde volgorde', JSON.stringify(s2.slice(0, 7)) === JSON.stringify(['Datum en tijd verwijzing', 'Verwijzend ziekenhuis', 'Verwijzende afdeling', 'Naam verwijzer', 'Telefoonnummer verwijzer', 'Ontvangende afdeling', 'Ontvangend ziekenhuis']), s2.join(' | '));
  check('Geen toelichting bij verwijzing', (await page.locator('#s2 .field-hint').count()) === 0);
  check('Geen toelichting bij tijdlijn', (await page.locator('#s6 .section-intro, #s6 .table-hint').count()) === 0);

  // Tijdlijn: meetmoment 1 met CPAP
  await page.locator('#s6').getByRole('button', { name: '+ Nieuw meetmoment' }).first().click();
  const editor = page.getByRole('form', { name: 'Nieuw meetmoment' });
  await editor.getByRole('radio', { name: 'CPAP', exact: true }).check();
  check('CPAP: geen iNO', (await editor.getByLabel('iNO (optioneel)', { exact: true }).count()) === 0);
  check('CPAP: geen VG', (await editor.getByLabel('VG (ingesteld doelteugvolume)', { exact: true }).count()) === 0);
  check('CPAP: invoerveld heet PEEP, geen CPAP-druk', (await editor.getByLabel('CPAP-druk', { exact: true }).count()) === 0 && (await editor.getByLabel('PEEP', { exact: true }).count()) === 1);
  await editor.getByLabel('PEEP', { exact: true }).fill('7');
  await editor.getByLabel('FiO₂', { exact: true }).fill('30,5');
  await editor.getByLabel('Hartfrequentie', { exact: true }).fill('160');
  await editor.getByLabel('BE', { exact: true }).fill('-5,2');
  await page.screenshot({ path: `${OUT}/390-meetmoment-editor.png`, fullPage: false });
  await editor.getByRole('button', { name: 'Meetmoment opslaan' }).click();

  // Meetmoment 2: voorstel modaliteit, geen monitorwaarden
  await page.locator('#s6').getByRole('button', { name: '+ Nieuw meetmoment' }).first().click();
  const ed2 = page.getByRole('form', { name: 'Nieuw meetmoment' });
  check('Voorstel: PEEP van CPAP overgenomen', (await ed2.getByLabel('PEEP', { exact: true }).inputValue()) === '7');
  check('Geen oude hartfrequentie overgenomen', (await ed2.getByLabel('Hartfrequentie', { exact: true }).inputValue()) === '');
  check('Geen oude BE overgenomen', (await ed2.getByLabel('BE', { exact: true }).inputValue()) === '');
  await ed2.getByRole('radio', { name: 'PTV', exact: true }).check();
  check('PTV: VG zichtbaar', (await ed2.getByLabel('VG (ingesteld doelteugvolume)', { exact: true }).count()) === 1);
  check('PTV: iNO zichtbaar', (await ed2.getByLabel('iNO (optioneel)', { exact: true }).count()) === 1);
  check('PTV: PEEP-instelling van CPAP niet overgenomen', (await ed2.getByLabel('PEEP', { exact: true }).inputValue()) === '');
  await ed2.getByLabel('PIP', { exact: true }).fill('20');
  await ed2.getByRole('radio', { name: 'HFOV', exact: true }).check();
  check('HFOV: geen VG', (await ed2.getByLabel('VG (ingesteld doelteugvolume)', { exact: true }).count()) === 0);
  await ed2.getByRole('radio', { name: 'PTV', exact: true }).check();
  check('Terug naar PTV: PIP bewaard', (await ed2.getByLabel('PIP', { exact: true }).inputValue()) === '20');
  // Tijdstip achteraf eerder zetten
  const at1 = await page.locator('#s6 .data-table tbody th').first().textContent();
  const dt = ed2.getByLabel('Datum en tijd', { exact: true });
  const cur = await dt.inputValue();
  const earlier = new Date(new Date(cur + ':00Z').getTime() - 3 * 3600_000).toISOString().slice(0, 16);
  await dt.fill(earlier);
  await ed2.getByRole('button', { name: 'Meetmoment opslaan' }).click();
  const times = await page.locator('#s6 .data-table tbody th').allTextContents();
  check('Achteraf toegevoegd meetmoment staat chronologisch eerst', times.length === 2 && times[1] === at1, times.join(' | '));
  check('Geen horizontaal scrollen op 390 px (formulier)', await noHorizontalScroll(page));

  // Infuus
  await page.getByRole('button', { name: '+ Infuus starten' }).click();
  await page.getByRole('group', { name: 'Infuus starten' }).getByLabel('2. Medicatie en concentratie', { exact: true }).fill('Glucose 10%');
  await page.getByRole('group', { name: 'Infuus starten' }).getByLabel('3. Pompsnelheid', { exact: true }).fill('0');
  check('Pompsnelheid 0 geweigerd', await page.getByText('De waarde moet groter dan 0 zijn.').isVisible());
  await page.getByRole('group', { name: 'Infuus starten' }).getByLabel('3. Pompsnelheid', { exact: true }).fill('3,2');
  await page.getByRole('button', { name: 'Starten' }).click();
  await page.getByRole('button', { name: 'Snelheid wijzigen' }).click();
  await page.getByLabel('Nieuwe pompsnelheid', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Wijziging opslaan' }).click();
  check('Stoptijd leeg zolang infuus loopt', await page.getByText('Loopt nog — stoptijd wordt ingevuld bij Stoppen.').isVisible());

  // Contactgegevens ouders in sectie 12
  const mother = page.locator('#s12').getByLabel('Telefoonnummer moeder', { exact: true });
  const partner = page.locator('#s12').getByLabel('Telefoonnummer partner', { exact: true });
  check('Telefoonnummer moeder en partner in sectie 12', (await mother.count()) === 1 && (await partner.count()) === 1 && (await page.locator('#s13 input[type=tel]').count()) === 0);
  const mb = await mother.boundingBox();
  const pb = await partner.boundingBox();
  check('Moeder en partner naast elkaar', !!mb && !!pb && Math.abs(mb.y - pb.y) < 2 && pb.x > mb.x, JSON.stringify([mb?.x, mb?.y, pb?.x, pb?.y]));
  await mother.fill('0612345678');
  await partner.fill('0687654321');

  const unl = await unlabeledControls(page);
  check('Alle invoervelden hebben een label', unl.length === 0, unl.join(', '));


  // Herladen: gegevens en tijdstippen behouden
  await page.getByRole('button', { name: 'Concept opslaan' }).click();
  const timesBefore = await page.locator('#s6 .data-table tbody th').allTextContents();
  await page.reload();
  check('Na herladen: naam behouden', (await page.getByLabel('Naam kind', { exact: true }).inputValue()) === 'Testbaby UI');
  check('Na herladen: patiëntnummer met voorloopnullen', (await page.getByLabel('Patiëntnummer', { exact: true }).inputValue()) === '0007788');
  check('Na herladen: verwijstijd ongewijzigd', (await page.getByLabel('Datum en tijd verwijzing', { exact: true }).inputValue()) === referred);
  const timesAfter = await page.locator('#s6 .data-table tbody th').allTextContents();
  check('Na herladen: meetmomenttijden ongewijzigd', JSON.stringify(timesBefore) === JSON.stringify(timesAfter), timesAfter.join(' | '));
  // Toetsenbord: Tab-volgorde begint bij de navigatie en bereikt de velden
  await page.keyboard.press('Tab');
  const f1 = await page.evaluate(() => document.activeElement?.textContent);
  const tabbed = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    tabbed.push(await page.evaluate(() => document.activeElement?.labels?.[0]?.textContent ?? document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent));
  }
  check('Toetsenbord: eerste Tab op "Overzicht"', f1?.includes('Overzicht'), f1);
  check('Toetsenbord: Tab bereikt Naam kind', tabbed.includes('Naam kind'), tabbed.join(' › '));
  await page.screenshot({ path: `${OUT}/390-formulier.png`, fullPage: true });

  // Verwijderen met bevestiging binnen de pagina
  const before = await page.locator('#s6 .data-table tbody tr').count();
  await page.locator('#s6 .row-edit').first().click();
  await page.locator('#s6 form').getByRole('button', { name: 'Verwijderen', exact: true }).click();
  check('Bevestigingsvenster in de pagina', await page.getByRole('alertdialog').isVisible());
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuleren' }).click();
  check('Annuleren behoudt meetmoment', (await page.locator('#s6 .data-table tbody tr').count()) === before);
  await page.locator('#s6 form').getByRole('button', { name: 'Verwijderen', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Verwijderen' }).click();
  check('Bevestigen verwijdert meetmoment', (await page.locator('#s6 .data-table tbody tr').count()) === before - 1);

  // Verslag
  await page.getByRole('button', { name: 'Verslag & export', exact: true }).click();
  await page.waitForSelector('.report');
  check('Geen horizontaal scrollen op 390 px (verslag)', await noHorizontalScroll(page));
  const reportText = await page.locator('#email-text').inputValue();
  check('E-mailtekst bevat telefoonnummers', reportText.includes('0612345678') && reportText.includes('0687654321'));
  check('E-mailtekst bevat "Nog niet gedaan"', reportText.includes('Nog niet gedaan'));
  check('E-mailtekst bevat infuushistorie', reportText.includes('3,2 mL/uur') && reportText.includes('4 mL/uur'));
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Pdf downloaden' }).click()]);
  const pdfPath = `${OUT}/${download.suggestedFilename()}`;
  await download.saveAs(pdfPath);
  check('Pdf gedownload', statSync(pdfPath).size > 10000, `${download.suggestedFilename()} ${statSync(pdfPath).size} bytes`);
  await page.screenshot({ path: `${OUT}/390-verslag.png`, fullPage: false });
  check('Geen JavaScript-fouten', errors.length === 0, errors.join('; '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// iPad 768 en 1024 px met voorbeeldtransport
for (const [w, h] of [
  [768, 1024],
  [1024, 768],
]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, timezoneId: 'Europe/Amsterdam', locale: 'nl-NL', acceptDownloads: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Fictief voorbeeldtransport laden' }).click();
  await page.waitForSelector('#s6');
  check(`Geen horizontaal scrollen op ${w} px (formulier)`, await noHorizontalScroll(page));
  await page.screenshot({ path: `${OUT}/${w}-formulier-top.png` });
  await page.locator('#s6 .data-table').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${w}-tijdlijn.png` });
  const rowCount = await page.locator('#s6 .data-table tbody tr').count();
  check(`${w}px: tijdlijn is één tabel met één rij per meetmoment`, (await page.locator('#s6 .data-table').count()) === 1 && rowCount === 4, `${rowCount} rijen`);
  const headers = await page.locator('#s6 .data-table thead tr:not(.group-row) th').allTextContents();
  check(`${w}px: geen kolommen #, Fase of Tube`, !headers.some((h) => ['#', 'Fase', 'Tube'].includes(h.trim())), headers.join(' | '));
  check(`${w}px: geen aparte CPAP-kolom`, !headers.some((h) => h.startsWith('CPAP')));
  const peepIdx = headers.findIndex((h) => h.startsWith('PEEP'));
  const peeps = await page.locator('#s6 .data-table tbody tr').evaluateAll((trs, idx) => trs.map((tr) => tr.children[idx]?.textContent), peepIdx);
  check(`${w}px: PEEP-kolom ook gevuld bij CPAP`, JSON.stringify(peeps) === JSON.stringify(['7', '6', '6', '']), JSON.stringify(peeps));
  const types = await page.locator('#s6 .data-table tbody tr').evaluateAll((trs, idx) => trs.map((tr) => tr.children[idx]?.textContent), headers.findIndex((h) => h.startsWith('Type')));
  check(`${w}px: type bloedgas als C/A`, JSON.stringify(types) === JSON.stringify(['C', 'A', '', 'A']), JSON.stringify(types));
  await page.locator('#s6 .row-edit').nth(1).click();
  check(`${w}px: bewerken toont tube die gold (8 cm)`, (await page.locator('#s6 .tube-line').textContent())?.includes('tandenrij 8 cm'));
  await page.locator('#s6').getByRole('button', { name: 'Annuleren' }).click();
  check(`${w}px: OI-kolom direct rechts van Tijd`, headers[0]?.trim() === 'Tijd' && headers[1]?.trim() === 'OI', headers.slice(0, 3).join(' | '));
  const alertCells = await page.locator('#s6 .data-table td.alert').allTextContents();
  check(`${w}px: OI 29,5 oranje gemarkeerd in tabel`, alertCells.length === 1 && alertCells[0].includes('29,5'), JSON.stringify(alertCells));
  await page.locator('#s6 .row-edit').nth(3).click();
  check(`${w}px: bewerkformulier toont OI-alert`, (await page.locator('#s6 .oi-line.alert').textContent())?.includes('29,5'));
  await page.locator('#s6').getByRole('button', { name: 'Annuleren' }).click();
  await page.locator('#s6 .row-edit').nth(2).click();
  check(`${w}px: bewerken toont tube na aanpassing (7,5 cm)`, (await page.locator('#s6 .tube-line').textContent())?.includes('tandenrij 7,5 cm'));
  await page.locator('#s6').getByRole('button', { name: 'Annuleren' }).click();
  await page.getByRole('button', { name: 'Verslag & export', exact: true }).click();
  await page.waitForSelector('.report');
  check(`Geen horizontaal scrollen op ${w} px (verslag)`, await noHorizontalScroll(page));
  await page.screenshot({ path: `${OUT}/${w}-verslag.png` });
  if (w === 1024) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Pdf downloaden' }).click()]);
    await download.saveAs(`${OUT}/voorbeeld.pdf`);
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: `${OUT}/afdrukweergave.pdf`, format: 'A4' }).catch(() => {});
    await page.screenshot({ path: `${OUT}/1024-print.png`, fullPage: true });
  }
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} controles geslaagd`);
process.exit(failed.length ? 1 : 0);
