// Interface-controle met Playwright (Chromium) tegen de draaiende app.
// Gebruik: npm run build && npx vite preview --port 4173 &  dan: npm run ui-check
// Optioneel: BASE_URL=http://127.0.0.1:5173/ CHROMIUM_PATH=/pad/naar/chromium
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, statSync } from 'node:fs';

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

async function basisLayout(page) {
  return page.evaluate(() => {
    const fields = [...document.querySelectorAll('#s1 .basis-grid > .field')];
    const xs = new Set(fields.map((f) => Math.round(f.getBoundingClientRect().left)));
    const ys = new Set(fields.map((f) => Math.round(f.getBoundingClientRect().top)));
    return { n: fields.length, cols: xs.size, rows: ys.size };
  });
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
  const homeLogo = await page.locator('.home-header img.brand-logo').evaluate((img) => ({ ok: img.complete && img.naturalWidth > 0, alt: img.alt, w: Math.round(img.getBoundingClientRect().width) }));
  check('Logo Neo.Cab op de startpagina', homeLogo.ok && homeLogo.alt === 'Neo.Cab' && homeLogo.w > 40, JSON.stringify(homeLogo));

  await page.getByRole('button', { name: '+ Nieuw transport' }).click();
  await page.getByLabel('Naam kind', { exact: true }).fill('Testbaby UI');
  await page.getByLabel('Patiëntnummer', { exact: true }).fill('0007788');
  const referred = await page.locator('#s2').getByLabel('Verwijzing', { exact: true }).inputValue();
  // Keuzelijst ziekenhuizen (combobox): hele lijst via het pijltje, filteren door te typen, kiezen met muis of toetsenbord
  const refHosp = page.locator('#s2').getByRole('combobox', { name: 'Verwijzend ziekenhuis' });
  await page.locator('#s2').getByRole('button', { name: /Lijst verwijzend ziekenhuis openen/ }).click();
  const allOptions = await page.locator('#s2').getByRole('option').count();
  check('Ziekenhuis: pijltje toont de hele keuzelijst', allOptions > 60, String(allOptions));
  await page.keyboard.press('Escape');
  await refHosp.fill('sophia');
  const filtered = await page.locator('#s2').getByRole('option').allTextContents();
  check('Ziekenhuis: typen filtert de lijst (met NICU-label)', filtered.length === 1 && filtered[0].includes('Sophia') && filtered[0].includes('NICU'), JSON.stringify(filtered));
  await refHosp.press('ArrowDown');
  await refHosp.press('Enter');
  check('Ziekenhuis: kiezen met toetsenbord vult de naam en plaats in', (await refHosp.inputValue()) === 'Erasmus MC – Sophia Kinderziekenhuis, Rotterdam' && (await page.locator('#s2').getByRole('listbox').count()) === 0);
  await refHosp.fill('Eigen ziekenhuis buiten de lijst');
  await page.keyboard.press('Escape');
  check('Ziekenhuis: vrije tekst blijft mogelijk', (await refHosp.inputValue()) === 'Eigen ziekenhuis buiten de lijst');
  // Zonder routeplanner (offline): schatting op basis van de coördinaten
  await page.route('https://router.project-osrm.org/**', (r) => r.abort());
  await page.route('https://api.tomtom.com/**', (r) => r.abort());
  await refHosp.fill('Amphia, Breda');
  await page.keyboard.press('Escape');
  const recvH = page.locator('#s2').getByRole('combobox', { name: 'Ontvangend ziekenhuis' });
  await recvH.fill('Máxima MC, Veldhoven');
  await page.keyboard.press('Escape');
  await page.locator('#s2 .route-box', { hasText: 'niet bereikbaar' }).waitFor({ timeout: 5000 }).catch(() => {});
  const est = (await page.locator('#s2 .route-box').textContent()) ?? '';
  check('Route zonder routeplanner: geen schatting, wel melding en links', !/\d+ min/.test(est) && !/\d+ km/.test(est) && est.includes('Reistijd niet beschikbaar') && est.includes('Google Maps'), est);
  await recvH.fill('');
  await page.unroute('https://router.project-osrm.org/**');
  await page.unroute('https://api.tomtom.com/**');
  await refHosp.fill('');
  check('Ontvangende afdeling en ziekenhuis standaard leeg', (await page.getByLabel('Ontvangende afdeling', { exact: true }).inputValue()) === '' && (await page.getByLabel('Ontvangend ziekenhuis', { exact: true }).inputValue()) === '');
  check('Datum/tijd verwijzing krijgt standaard nu', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(referred), referred);
  check('Aankomst verwijzend ziekenhuis blijft leeg', (await page.getByLabel('Aankomst bij kind', { exact: true }).inputValue()) === '');

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
  const ca = await page.locator('#s1 .computed-value').textContent();
  const cb = await page.locator('#s1 .computed').boundingBox();
  const gb = await ga.boundingBox();
  const sizes = await page.evaluate(() => [getComputedStyle(document.querySelector('#s1 .computed-value')).fontSize, getComputedStyle(document.querySelector('#s1 .gestation-field input')).fontSize]);
  check('Waarden in blauw vak even groot als invoer', sizes[0] === sizes[1], sizes.join(' / '));
  const fieldLike = await page.evaluate(() => {
    const o = document.querySelector('#s1 .computed-value').getBoundingClientRect();
    const i = document.querySelector('#s1 .gestation-field input').getBoundingClientRect();
    const st = getComputedStyle(document.querySelector('#s1 .computed-value'));
    return { h: [Math.round(o.height), Math.round(i.height)], top: [Math.round(o.top), Math.round(i.top)], tag: document.querySelector('#s1 .computed-value').tagName, border: st.borderTopWidth };
  });
  check('Gecorrigeerde leeftijd opgemaakt als veld (zelfde hoogte en hoogte op pagina, niet invulbaar)', fieldLike.h[0] === fieldLike.h[1] && Math.abs(fieldLike.top[0] - fieldLike.top[1]) <= 1 && fieldLike.tag === 'OUTPUT' && fieldLike.border === '1px', JSON.stringify(fieldLike));
  const centers = await page.evaluate(() => {
    const mid = (el) => { const r = el.getBoundingClientRect(); return Math.round(r.top + r.height / 2); };
    return [mid(document.querySelector('#s1 .gestation-field input')), ...[...document.querySelectorAll('#s1 .computed-value')].map(mid)];
  });
  check('Waarde in blauw vak op één lijn met ingevulde waarde', centers.length === 2 && centers.every((c) => Math.abs(c - centers[0]) <= 1), centers.join(' / '));
  check('Blauw vak even breed als amenorroeduur', !!cb && !!gb && Math.abs(cb.width - gb.width) <= 1, `${cb?.width} / ${gb?.width}`);
  check('Blauw vak rechts van amenorroeduur, gelijke onderkant', !!cb && !!gb && cb.x > gb.x && Math.abs(cb.y + cb.height - (gb.y + gb.height)) < 3, JSON.stringify([cb, gb]));
  check('Gecorrigeerde leeftijd berekend', ca?.startsWith('33+5 wk · dag 1'), ca);
  check('Postnatale leeftijd op geboortedag is dag 1', ca?.includes('dag 1') && !ca?.includes('Postnatale') && (await page.locator('#s1 .field-label', { hasText: 'Gecorrigeerde leeftijd' }).count()) === 1, ca);

  // Leeftijd in uren en minuten (< 72 uur): geboren vandaag 00:00
  await page.getByLabel('Geboortetijd', { exact: true }).fill('00:00');
  const valueText = await page.locator('#s1 .computed-value').textContent();
  check('Leeftijd in uren en minuten bij < 72 uur', /dag 1 · \d+ u \d+ min/.test(valueText ?? ''), valueText);
  const firstLine = await page.evaluate(() => {
    const v = document.querySelector('#s1 .computed-value');
    const range = document.createRange();
    range.selectNodeContents(v);
    const r = range.getClientRects()[0];
    const i = document.querySelector('#s1 .gestation-field input').getBoundingClientRect();
    return [Math.round(r.top + r.height / 2), Math.round(i.top + i.height / 2)];
  });
  check('Eerste regel van de waarde op één lijn met ingevulde waarde', Math.abs(firstLine[0] - firstLine[1]) <= 2, firstLine.join(' / '));

  // Huisstijl: PT Sans, koppen donkerblauw, geen verwijzing naar de organisatie
  const style = await page.evaluate(() => ({
    font: getComputedStyle(document.body).fontFamily,
    loaded: document.fonts.check('15px "PT Sans"'),
    h2: getComputedStyle(document.querySelector('#s1 h2')).color,
    primary: getComputedStyle(document.querySelector('button.primary')).backgroundColor,
  }));
  check('Huisstijl: PT Sans geladen', style.font.includes('PT Sans') && style.loaded, JSON.stringify(style));
  check('Huisstijl: koppen en primaire knop donkerblauw #003c7d', style.h2 === 'rgb(0, 60, 125)' && style.primary === 'rgb(0, 60, 125)', `${style.h2} / ${style.primary}`);
  check('Formulier: logo en naam Neo.Cab in de bovenbalk', (await page.locator('.topbar .topbar-brand img.brand-logo').isVisible()) && (await page.locator('.topbar .topbar-name').textContent()) === 'Neo.Cab');
  // Geen LUMC-huisstijl of -logo (LUMC staat wél als gewone keuze in de ziekenhuislijst).
  check('Geen LUMC-logo of -naam in titel, kop en bovenbalk', !(await page.title()).includes('LUMC') && !(await page.locator('.topbar').textContent()).includes('LUMC') && (await page.locator('img[alt*="LUMC" i]').count()) === 0);

  // Zes vaste tijdstippen, allemaal in dezelfde vormgeving en op hun plek
  const tps = await page.locator('.timepoint').evaluateAll((els) => els.map((e) => [e.closest('section').id, e.querySelector('.field-label').textContent, e.querySelector('.tp-desc'), getComputedStyle(e).borderLeftColor, e.querySelectorAll('button').length]));
  const expected = [['s2', 'Verwijzing'], ['sdispatch', 'Ambulance aangevraagd'], ['sdispatch', 'Vertrek transportteam'], ['sdispatch', 'Aankomst bij kind'], ['s14', 'Vertrek met kind'], ['s14', 'Aankomst ontvangend centrum']];
  check('Zes tijdstippen op de juiste plek', JSON.stringify(tps.map((x) => [x[0], x[1]])) === JSON.stringify(expected), JSON.stringify(tps.map((x) => [x[0], x[1]])));
  check('Tijdstippen gelijk vormgegeven (zonder omschrijving, streep, Nu + Wissen)', tps.every((x) => x[2] === null && x[3] === 'rgb(0, 60, 125)' && x[4] === 2));
  check('Alle zes tijdstippen met icoon safety check', (await page.locator('.timepoint .tp-icon svg').count()) === 6);

  // Material Symbols bij alle 15 sectiekoppen
  const iconCount = await page.locator('main.form > section h2 .section-icon svg').count();
  check('Icoon bij alle 14 sectiekoppen', iconCount === 14, String(iconCount));

  const bl = await basisLayout(page);
  check('Basisgegevens op 390 px: 2 kolommen × 4 rijen', bl.n === 8 && bl.cols === 2 && bl.rows === 4, JSON.stringify(bl));

  // Box 5 Dispatch tussen box 4 en (nu) 6
  const order = await page.locator('main.form > section h2').allTextContents();
  check('Herkomst en bestemming, dan Verwijzing (samengevoegd), Dispatch en Stabilisatie', JSON.stringify(order.slice(0, 5)) === JSON.stringify(['Basisgegevens kind', 'Herkomst en bestemming', 'Verwijzing', 'Dispatch', 'Stabilisatie']) && order.length === 14, order.join(' | '));
  check('Plastic staat vóór Medicatie', order.indexOf('Plastic') === order.indexOf('Medicatie') - 1, order.join(' | '));
  // Plastic: toevoegknop met menu
  const linesBefore = await page.locator('#s10 .card').count();
  await page.locator('#s10').getByRole('button', { name: 'Toevoegen' }).click();
  const menuItems = await page.locator('#s10').getByRole('menuitem').allTextContents();
  check('Plastic: toevoegknop opent een menu met alle typen', menuItems.includes('Maagsonde') && menuItems.some((m) => m.includes('ndotracheale tube')) && menuItems.length >= 5, menuItems.join(' | '));
  await page.keyboard.press('Escape');
  check('Plastic: Escape sluit het menu', (await page.locator('#s10').getByRole('menu').count()) === 0);
  await page.locator('#s10').getByRole('button', { name: 'Toevoegen' }).click();
  await page.locator('#s10').getByRole('menuitem', { name: 'Maagsonde' }).click();
  check('Plastic: keuze uit het menu voegt dat type toe', (await page.locator('#s10 .card').count()) === linesBefore + 1 && (await page.locator('#s10').getByRole('menu').count()) === 0);
  await page.locator('#s10 .card').last().getByRole('button', { name: /verwijderen/i }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Verwijderen' }).click();
  // Instelling: alleen ABCD-letters (links van het invulveld)
  await page.getByRole('button', { name: 'Terug naar overzicht van concepten' }).click();
  await page.locator('details.settings summary').click();
  await page.getByLabel(/alleen de letter tonen/).check();
  await page.getByRole('button', { name: 'Hervatten' }).first().click();
  await page.waitForSelector('#s3');
  const compact = await page.evaluate(() => {
    const f = document.querySelector('#s3 .abcd-compact');
    const letter = f?.querySelector('.abcd-letter')?.getBoundingClientRect();
    const box = f?.querySelector('textarea')?.getBoundingClientRect();
    return { n: document.querySelectorAll('#s3 .abcd-compact').length, labelW: Math.round(f?.querySelector('.field-label')?.getBoundingClientRect().width ?? 0), word: f?.querySelector('.field-label .sr-only')?.textContent, left: !!letter && !!box && letter.right <= box.left && Math.abs(letter.top - box.top) < 12 };
  });
  check('Instelling alleen letters: letter links van het veld, woord niet zichtbaar, naam blijft Airway', compact.n === 9 && compact.labelW < 50 && compact.word === 'Airway' && compact.left && (await page.locator('#s3').getByRole('textbox', { name: 'Airway', exact: true }).count()) === 1, JSON.stringify(compact));
  await page.screenshot({ path: `${OUT}/390-abcd-letters.png`, fullPage: false, clip: await page.locator('#s3 .abcd').boundingBox().then((b) => ({ x: 0, y: b.y, width: 390, height: 400 })) }).catch(() => {});
  await page.getByRole('button', { name: 'Terug naar overzicht van concepten' }).click();
  await page.locator('details.settings summary').click();
  await page.getByLabel(/alleen de letter tonen/).uncheck();
  await page.getByRole('button', { name: 'Hervatten' }).first().click();
  await page.waitForSelector('#s3');
  const airway = page.locator('#s3').getByRole('textbox', { name: 'Airway', exact: true });
  const h1 = await airway.evaluate((e) => e.getBoundingClientRect().height);
  await airway.fill('Regel 1\nRegel 2\nRegel 3');
  const h3 = await airway.evaluate((e) => e.getBoundingClientRect().height);
  check('ABCD-veld begint op één regel en groeit mee met de tekst', h1 <= 46 && h3 > h1 + 30, `${h1} → ${h3}`);
  await airway.fill('');
  const sub3 = await page.locator('#s3 h3.subsection-title').allTextContents();
  const letters = await page.locator('#s3 .abcd-letter').allTextContents();
  check('ABCD-kopjes met beginletter in een rondje (Verwijzing en Stabilisatie)', letters.join('') === 'ABCDEFGHI' && (await page.locator('#s5 .abcd-letter').count()) === 9 && (await page.locator('#s3').getByRole('textbox', { name: 'Airway', exact: true }).count()) === 1, letters.join(''));
  check('Verwijzing bevat Zwangerschap en geboorte, Toestand bij verwijzing en Advies (zonder "(optioneel)")', JSON.stringify(sub3) === JSON.stringify(['Zwangerschap en geboorte', 'Toestand bij verwijzing', 'Advies']) && (await page.locator('#s3').getByLabel('Advies bij verwijzing', { exact: true }).count()) === 1 && (await page.locator('#s4').count()) === 0, sub3.join(' | '));
  // Therapeutische hypothermie als reden van overplaatsing: Thompson Score bij Verwijzing.
  const th = page.locator('#s2').getByRole('checkbox', { name: 'Therapeutische hypothermie' });
  check('Reden van overplaatsing: optie Therapeutische hypothermie, standaard uit; geen Thompson Score', (await th.count()) === 1 && !(await th.isChecked()) && (await page.locator('#s3 .thompson').count()) === 0);
  await th.check();
  await page.waitForSelector('#s3 .thompson');
  const sub3th = await page.locator('#s3 h3.subsection-title').allTextContents();
  check('Na kiezen: kopjes Perinatale asfyxie en Thompson Score bij Verwijzing (voor Advies), 9 onderdelen', JSON.stringify(sub3th) === JSON.stringify(['Zwangerschap en geboorte', 'Toestand bij verwijzing', 'Perinatale asfyxie', 'Thompson Score', 'Advies']) && (await page.locator('#s3 .thompson-table tbody tr').count()) === 9, sub3th.join(' | '));
  await page.locator('#s3 .asphyxia-criteria').getByRole('checkbox', { name: /Apgarscore op 5 minuten/ }).check();
  check('Perinatale asfyxie: zes criteria direct zichtbaar (geen aparte ja/nee-keuze), aan te vinken', (await page.locator('#s3 fieldset.segmented', { hasText: /perinatale asfyxie/i }).count()) === 0 && (await page.locator('#s3 .asphyxia-criteria input[type=checkbox]').count()) === 6 && (await page.locator('#s3 .asphyxia-criteria input:checked').count()) === 1);
  check('Thompson Score als tabel met ronde keuzerondjes; Therapeutische hypothermie als vierkant vinkje', (await page.locator('#s3 .thompson-table input[type=radio]').count()) === 31 && (await page.locator('#s2 .reason-options .seg').count()) === 0);
  await page.locator('#s3 .thompson-table').getByRole('radio', { name: 'Tonus 2: hypotonie' }).check();
  await page.locator('#s3 .thompson-table').getByRole('radio', { name: 'Ademhaling 3: beademing (apneu)' }).check();
  const totalText = await page.locator('#s3 .thompson-total').textContent();
  check('Thompson Score: totaal telt mee (5 / 22, 2 van 9 ingevuld)', totalText.includes('5 / 22') && totalText.includes('2 van 9'), totalText);
  await page.screenshot({ path: `${OUT}/390-thompson.png`, fullPage: false, clip: await page.locator('#s3 .thompson').boundingBox().then((b) => ({ x: 0, y: b.y - 80, width: 390, height: 700 })) }).catch(() => {});
  check('Thompson Score: geen Wissen per onderdeel, wel één knop Score wissen', (await page.locator('#s3 .thompson').getByRole('button', { name: 'Wissen', exact: true }).count()) === 0 && (await page.locator('#s3 .thompson-total').getByRole('button', { name: 'Score wissen' }).count()) === 1);
  await th.uncheck();
  check('Optie uit: Thompson Score verdwijnt weer', (await page.locator('#s3 .thompson').count()) === 0);
  await th.check();
  const kept = await page.locator('#s3 .thompson-total').textContent();
  check('Optie weer aan: ingevulde score is bewaard gebleven', kept.includes('5 / 22'), kept);
  await page.locator('#s3 .thompson-total').getByRole('button', { name: 'Score wissen' }).click();
  check('Score wissen: alle onderdelen leeg', (await page.locator('#s3 .thompson-total strong').textContent()) === '—' && (await page.locator('#s3 .thompson input:checked').count()) === 0);
  await th.uncheck();
  check('Koppen zonder nummer; Tijdlijn met toelichting eronder', order.every((h) => !/^\d/.test(h)) && order[5] === 'Tijdlijn' && (await page.locator('#s6 .section-intro').textContent()) === 'Ademhalingsondersteuning, monitorgegevens en bloedgassen');
  check('Geen allergieën en geen checklistlegenda', (await page.getByLabel('Allergieën', { exact: true }).count()) === 0 && (await page.locator('#s13 .checklist-legend').count()) === 0);
  const called = page.getByLabel('Ambulance aangevraagd', { exact: true });
  const departed = page.getByLabel('Vertrek transportteam', { exact: true });
  check('Dispatch-tijden standaard leeg', (await called.inputValue()) === '' && (await departed.inputValue()) === '');
  await page.getByRole('button', { name: 'Ambulance aangevraagd op nu zetten' }).click();
  check('Ambulance aangevraagd: knop Nu vult tijd in', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(await called.inputValue()), await called.inputValue());

  // Volgorde sectie 2: datum/tijd, verwijzer, ontvangende afdeling en ziekenhuis
  const s2 = await page.locator('#s2 .field-label').allTextContents();
  check('Sectie 2 in gevraagde volgorde', JSON.stringify(s2.slice(0, 7)) === JSON.stringify(['Verwijzing', 'Verwijzend ziekenhuis', 'Verwijzende afdeling', 'Naam verwijzer', 'Telefoonnummer verwijzer', 'Ontvangende afdeling', 'Ontvangend ziekenhuis']), s2.join(' | '));
  check('Geen toelichting bij verwijzing', (await page.locator('#s2 .field-hint').count()) === 0);
  check('Geen extra tekst boven de tijdlijntabel', (await page.locator('#s6 .table-hint').count()) === 0);

  // Tijdlijn: meetmoment 1 met CPAP
  await page.locator('#s6').getByRole('button', { name: 'Nieuw meetmoment' }).first().click();
  const editor = page.getByRole('form', { name: 'Nieuw meetmoment' });
  const folds = editor.locator('.fold-toggle');
  check('Meetmoment: geen veld Fase', (await editor.getByLabel('Fase', { exact: true }).count()) === 0);
  check(
    'Meetmoment: Ademhalingsondersteuning, Monitorgegevens en Bloedgas ingeklapt',
    JSON.stringify(await folds.allTextContents()) === JSON.stringify(['Ademhalingsondersteuning', 'Monitorgegevens', 'Bloedgas']) &&
      (await folds.evaluateAll((bs) => bs.every((b) => b.getAttribute('aria-expanded') === 'false'))) &&
      (await editor.getByRole('radio', { name: 'CPAP', exact: true }).count()) === 0,
  );
  check('Meetmoment: geen toelichting bij monitorgegevens', (await editor.locator('.small-print').count()) === 0 && (await editor.locator('.fold-summary').count()) === 1);
  await page.screenshot({ path: `${OUT}/390-meetmoment-ingeklapt.png`, fullPage: false });
  for (const name of ['Ademhalingsondersteuning', 'Monitorgegevens', 'Bloedgas']) await editor.getByRole('button', { name, exact: true }).click();
  check('Uitgeklapt: geen samenvatting meer', (await editor.locator('.fold-summary').count()) === 0);
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
  await page.locator('#s6').getByRole('button', { name: 'Nieuw meetmoment' }).first().click();
  const ed2 = page.getByRole('form', { name: 'Nieuw meetmoment' });
  const summary2 = await ed2.locator('.fold-summary').first().textContent();
  check('Ingeklapt: laatst ingevulde ademhalingsondersteuning als toelichting', summary2?.startsWith('Laatst ingevuld: CPAP · PEEP 7') && summary2.includes('30,5'), summary2);
  for (const name of ['Ademhalingsondersteuning', 'Monitorgegevens', 'Bloedgas']) await ed2.getByRole('button', { name, exact: true }).click();
  await ed2.getByLabel('Beleidsaanpassingen', { exact: true }).fill('Surfactant gegeven');
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
  const at1 = await page.locator('#s6 .data-table tbody tr:not(.note-row) th').first().textContent();
  const dt = ed2.getByLabel('Datum en tijd', { exact: true });
  const cur = await dt.inputValue();
  const earlier = new Date(new Date(cur + ':00Z').getTime() - 3 * 3600_000).toISOString().slice(0, 16);
  await dt.fill(earlier);
  await ed2.getByRole('button', { name: 'Meetmoment opslaan' }).click();
  const times = await page.locator('#s6 .data-table tbody tr:not(.note-row) th').allTextContents();
  const noteRows = await page.locator('#s6 .data-table tbody tr.note-row').allTextContents();
  check('Beleidsaanpassing als aparte rij onder hetzelfde meetmoment, zonder het woord in de tabel', noteRows.length === 1 && noteRows[0].trim().endsWith('Surfactant gegeven') && (await page.locator('#s6 .note-row strong').count()) === 0, JSON.stringify(noteRows));
  const noteAfterFirst = await page.evaluate(() => document.querySelector('#s6 .data-table tbody tr')?.nextElementSibling?.classList.contains('note-row'));
  check('Beleidsaanpassingenrij staat direct onder het (eerste) meetmoment', noteAfterFirst === true);
  const noteBg = await page.evaluate(() => {
    const note = document.querySelector('#s6 .note-row td');
    const row = note.closest('tr').previousElementSibling.querySelector('td');
    return [getComputedStyle(row).backgroundColor, getComputedStyle(note).backgroundColor];
  });
  check('Beleidsaanpassingenrij heeft dezelfde achtergrond als de regel erboven', noteBg[0] === noteBg[1], noteBg.join(' / '));
  check('Achteraf toegevoegd meetmoment staat chronologisch eerst', times.length === 2 && times[1] === at1, times.join(' | '));
  check('Geen horizontaal scrollen op 390 px (formulier)', await noHorizontalScroll(page));

  // Infuus
  await page.locator('#s9').getByRole('button', { name: 'Toevoegen', exact: true }).click();
  await page.getByRole('group', { name: 'Infuus starten' }).getByLabel('2. Medicatie en concentratie', { exact: true }).fill('Glucose 10%');
  await page.getByRole('group', { name: 'Infuus starten' }).getByLabel('3. Pompsnelheid', { exact: true }).fill('0');
  check('Pompsnelheid 0 geweigerd', await page.getByText('De waarde moet groter dan 0 zijn.').isVisible());
  await page.getByRole('group', { name: 'Infuus starten' }).getByLabel('3. Pompsnelheid', { exact: true }).fill('3,2');
  await page.getByRole('button', { name: 'Starten' }).click();
  const infRows = await page.locator('#s9 .data-table.simple tbody tr').allTextContents();
  const rateAlign = await page.locator('#s9 .data-table.simple tbody td').nth(1).evaluate((e) => getComputedStyle(e).textAlign);
  check('Pompsnelheid links uitgelijnd', rateAlign === 'left' || rateAlign === 'start', rateAlign);
  check('Infusen als tabel: gestart infuus staat als rij, met snelheid en "loopt"', infRows.length === 1 && infRows[0].includes('Glucose 10%') && infRows[0].includes('3,2') && infRows[0].includes('loopt'), JSON.stringify(infRows));
  await page.locator('#s9 .row-edit').first().click();
  await page.getByRole('button', { name: 'Snelheid wijzigen' }).click();
  await page.getByLabel('Nieuwe pompsnelheid', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Wijziging opslaan' }).click();
  check('Stoptijd leeg zolang infuus loopt', await page.getByText('Loopt nog — stoptijd wordt ingevuld bij Stoppen.').isVisible());
  await page.locator('#s9').getByRole('button', { name: 'Sluiten' }).click();
  const infRow = await page.locator('#s9 .data-table.simple tbody tr').first().textContent();
  check('Infusentabel toont het verloop van de pompsnelheid', /3,2\s*4 vanaf/.test(infRow), infRow);

  // Medicatie als tabel: toevoegen via editor, bewerken via de tijd in de tabel
  await page.locator('#s8').getByRole('button', { name: 'Toevoegen', exact: true }).click();
  const medForm = page.getByRole('form', { name: 'Nieuwe toediening' });
  await medForm.getByLabel('Medicament', { exact: true }).fill('Testmedicament');
  await medForm.getByLabel('Dosis', { exact: true }).fill('1,5');
  await medForm.getByLabel('Eenheid dosis', { exact: true }).fill('mg');
  await medForm.getByRole('button', { name: 'Toediening opslaan' }).click();
  const medRows = await page.locator('#s8 .data-table.simple tbody tr').allTextContents();
  check('Medicatie als tabel: toediening als rij met dosis en eenheid', medRows.length === 1 && medRows[0].includes('Testmedicament') && medRows[0].includes('1,5 mg'), JSON.stringify(medRows));
  await page.locator('#s8 .row-edit').first().click();
  await page.getByRole('form', { name: 'Toediening bewerken' }).getByLabel('Dosis', { exact: true }).fill('2');
  await page.getByRole('form', { name: 'Toediening bewerken' }).getByRole('button', { name: 'Toediening opslaan' }).click();
  check('Medicatie: bewerken via de tijd in de tabel', (await page.locator('#s8 .data-table.simple tbody tr').first().textContent()).includes('2 mg'));

  // Contactgegevens ouders in sectie 12
  const mother = page.locator('#s12').getByLabel('Telefoonnummer moeder', { exact: true });
  const partner = page.locator('#s12').getByLabel('Telefoonnummer partner', { exact: true });
  check('Telefoonnummer moeder en partner in sectie 12', (await mother.count()) === 1 && (await partner.count()) === 1 && (await page.locator('#s13 input[type=tel]').count()) === 0);
  check('Telefoonnummers ouders zonder omlijsting', (await page.locator('#s12 fieldset').count()) === 0 && !(await page.locator('#s12').textContent()).includes('Contactgegevens ouders'));
  // Beide posities in één meting (de pagina kan nog soepel aan het scrollen zijn).
  const [mb, pb] = await page.evaluate(() => {
    const r = (label) => [...document.querySelectorAll('#s12 label')].find((l) => l.textContent === label)?.control?.getBoundingClientRect();
    const m = r('Telefoonnummer moeder');
    const p = r('Telefoonnummer partner');
    return [m && { x: m.x, y: m.y }, p && { x: p.x, y: p.y }];
  });
  check('Moeder en partner naast elkaar', !!mb && !!pb && Math.abs(mb.y - pb.y) < 2 && pb.x > mb.x, JSON.stringify([mb, pb]));
  // Checklist: vakje leeg -> groen ✓ -> rood ✕ -> leeg
  const rows = page.locator('#s13 .check-row');
  check('Checklist: 11 punten, alle vakjes leeg, geen statusknoppen', (await rows.count()) === 11 && (await page.locator('#s13 .check-box.nog_niet').count()) === 11 && (await page.locator('#s13 input[type=radio]').count()) === 0);
  const checkTexts = await page.locator('#s13 .check-text').allTextContents();
  check(
    'Checklist bevat overplaatsingsbrieven, route ouders, neurodevelopment en monitoring',
    ['Medische overplaatsingsbrief', 'Verpleegkundige overplaatsingsbrief', 'Directions and contact details of the receiving hospital for parent(s)', 'Neurodevelopment (positioning, lighting and noise reduction)', 'Continuous monitoring (minimaal SpO₂-monitoring)'].every((x) => checkTexts.includes(x)),
    checkTexts.join(' | '),
  );
  check('Geen toelichting bij lopende infusen', (await page.locator('#s9 .section-intro').count()) === 0);
  const cls = async (i) => (await rows.nth(i).locator('.check-box').getAttribute('class')) ?? '';
  await rows.nth(0).click();
  const c1 = await cls(0);
  await rows.nth(0).click();
  const c2 = await cls(0);
  await rows.nth(0).click();
  const c3 = await cls(0);
  check('Checklist: tik wisselt leeg → groen → rood → leeg', c1.includes('gedaan') && c2.includes('nvt') && c3.includes('nog_niet'), [c1, c2, c3].join(' / '));
  check('Checklist: groen vakje toont ✓', (await (async () => { await rows.nth(1).click(); return rows.nth(1).locator('.check-box').textContent(); })()) === '✓');
  await rows.nth(2).click();
  await rows.nth(2).click();
  check('Checklist: rood vakje toont ✕', (await rows.nth(2).locator('.check-box').textContent()) === '✕');
  check('Checklist: schermlezer hoort status', ((await rows.nth(1).getAttribute('aria-label')) ?? '').includes(': gedaan'));
  await mother.fill('0612345678');
  await partner.fill('0687654321');

  const unl = await unlabeledControls(page);
  check('Alle invoervelden hebben een label', unl.length === 0, unl.join(', '));


  // Herladen: gegevens en tijdstippen behouden
  // Geen knop Concept opslaan meer: wachten tot de automatische opslag klaar is.
  check('Geen knop Concept opslaan en geen knop Overzicht; logo leidt terug', (await page.getByRole('button', { name: /Concept opslaan|^Opslaan$/ }).count()) === 0 && (await page.locator('.topbar .back').count()) === 0 && (await page.locator('.topbar').getByText('Actieve registratie').count()) === 0);
  await page.locator('.save-status.ok').waitFor();
  const saveLayout = await page.evaluate(() => {
    const st = document.querySelector('.topbar-actions .save-status');
    const btn = [...document.querySelectorAll('.topbar-actions button')].find((b) => b.textContent.includes('Verslag'));
    return !!st && !!btn && st.nextElementSibling === btn && !!st.querySelector('.save-icon svg');
  });
  check('Opslagstatus met diskette-icoon links naast Verslag', saveLayout);
  const timesBefore = await page.locator('#s6 .data-table tbody tr:not(.note-row) th').allTextContents();
  await page.reload();
  check('Na herladen: checkliststatus behouden', (await page.locator('#s13 .check-row').nth(1).locator('.check-box.gedaan').count()) === 1 && (await page.locator('#s13 .check-row').nth(2).locator('.check-box.nvt').count()) === 1);
  check('Na herladen: naam behouden', (await page.getByLabel('Naam kind', { exact: true }).inputValue()) === 'Testbaby UI');
  check('Na herladen: patiëntnummer met voorloopnullen', (await page.getByLabel('Patiëntnummer', { exact: true }).inputValue()) === '0007788');
  check('Na herladen: verwijstijd ongewijzigd', (await page.locator('#s2').getByLabel('Verwijzing', { exact: true }).inputValue()) === referred);
  const timesAfter = await page.locator('#s6 .data-table tbody tr:not(.note-row) th').allTextContents();
  check('Na herladen: meetmomenttijden ongewijzigd', JSON.stringify(timesBefore) === JSON.stringify(timesAfter), timesAfter.join(' | '));
  // Toetsenbord: Tab-volgorde begint bij de navigatie en bereikt de velden
  await page.keyboard.press('Tab');
  const f1 = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent);
  const tabbed = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    tabbed.push(await page.evaluate(() => document.activeElement?.labels?.[0]?.textContent ?? document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent));
  }
  check('Toetsenbord: eerste Tab op logo (terug naar overzicht)', f1?.includes('terug naar overzicht'), f1);
  check('Toetsenbord: Tab bereikt Naam kind', tabbed.includes('Naam kind'), tabbed.join(' › '));
  await page.screenshot({ path: `${OUT}/390-formulier.png`, fullPage: true });

  // Verwijderen met bevestiging binnen de pagina
  const before = await page.locator('#s6 .data-table tbody tr:not(.note-row)').count();
  await page.locator('#s6 .row-edit').first().click();
  await page.locator('#s6 form').getByRole('button', { name: 'Verwijderen', exact: true }).click();
  check('Bevestigingsvenster in de pagina', await page.getByRole('alertdialog').isVisible());
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuleren' }).click();
  check('Annuleren behoudt meetmoment', (await page.locator('#s6 .data-table tbody tr:not(.note-row)').count()) === before);
  await page.locator('#s6 form').getByRole('button', { name: 'Verwijderen', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Verwijderen' }).click();
  check('Bevestigen verwijdert meetmoment', (await page.locator('#s6 .data-table tbody tr:not(.note-row)').count()) === before - 1);

  // Verslag
  await page.getByRole('button', { name: 'Verslag & export', exact: true }).click();
  await page.waitForSelector('.report');
  check('Geen horizontaal scrollen op 390 px (verslag)', await noHorizontalScroll(page));
  const reportText = await page.locator('#email-text').inputValue();
  check('E-mailtekst als platte tekst: koppen niet in hoofdletters en zonder streep eronder', reportText.includes('\n\nBasisgegevens kind\n') && !reportText.includes('BASISGEGEVENS') && !/\n[-=]{5,}/.test(reportText) && !reportText.includes('<'));
  check('Logo Neo.Cab bovenaan het verslag', await page.locator('.report .report-head img.brand-logo').isVisible());
  check('E-mailtekst bevat telefoonnummers', reportText.includes('0612345678') && reportText.includes('0687654321'));
  check('Verslag zonder checklist', !reportText.includes('CHECKLIST') && !reportText.includes('Nog niet gedaan') && (await page.locator('.report h2', { hasText: 'Checklist' }).count()) === 0);
  check('E-mailtekst bevat infuushistorie en medicatie', /Pompsnelheid \(mL\/uur\): 3,2 → 4 vanaf/.test(reportText) && reportText.includes('Medicament: Testmedicament; Dosis: 2 mg'));
  const [rtfDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Rtf downloaden' }).click()]);
  const rtfPath = `${OUT}/${rtfDownload.suggestedFilename()}`;
  await rtfDownload.saveAs(rtfPath);
  const rtfText = readFileSync(rtfPath, 'utf8');
  check('Rtf gedownload: geldig RTF met vette kop', rtfPath.endsWith('.rtf') && rtfText.startsWith('{\\rtf1') && rtfText.includes('{\\b Basisgegevens kind}'), rtfDownload.suggestedFilename());
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Pdf downloaden' }).click()]);
  const pdfPath = `${OUT}/${download.suggestedFilename()}`;
  await download.saveAs(pdfPath);
  check('Pdf gedownload', statSync(pdfPath).size > 10000, `${download.suggestedFilename()} ${statSync(pdfPath).size} bytes`);
  await page.screenshot({ path: `${OUT}/390-verslag.png`, fullPage: false });

  // Overdracht aan een collega: bestand downloaden en op een ander apparaat (nieuwe browsercontext) importeren
  const [hoDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Overdrachtsbestand downloaden' }).click()]);
  const hoPath = `${OUT}/${hoDownload.suggestedFilename()}`;
  await hoDownload.saveAs(hoPath);
  const hoText = readFileSync(hoPath, 'utf8');
  check('Overdrachtsbestand met code en waarschuwing', hoDownload.suggestedFilename() === 'neocab-overdracht-Testbaby-UI-0007788.txt' && hoText.includes('BEGIN NEO.CAB OVERDRACHT') && hoText.includes('patiëntgegevens'), hoDownload.suggestedFilename());
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Amsterdam', locale: 'nl-NL' });
  const other = await ctx2.newPage();
  await other.goto(BASE);
  await other.getByRole('button', { name: 'Transport importeren' }).click();
  await other.getByLabel('Plak de overdrachtsmail of de overdrachtscode', { exact: true }).fill('alleen wat tekst');
  await other.getByRole('button', { name: 'Importeren', exact: true }).click();
  check('Import: melding bij tekst zonder code', (await other.getByRole('alert').textContent())?.includes('Geen overdrachtscode gevonden'));
  await other.getByLabel('Of open een overdrachtsbestand', { exact: true }).setInputFiles(hoPath);
  await other.waitForSelector('#s1');
  const imported = [await other.getByLabel('Naam kind', { exact: true }).inputValue(), await other.getByLabel('Patiëntnummer', { exact: true }).inputValue(), await other.locator('#s9 .data-table tbody tr').count(), await other.locator('#s8 .data-table tbody tr').count()];
  check('Import van bestand opent het transport met alle gegevens', imported[0] === 'Testbaby UI' && imported[1] === '0007788' && imported[2] > 0 && imported[3] > 0, JSON.stringify(imported));
  await other.getByRole('button', { name: 'Terug naar overzicht van concepten' }).first().click();
  await other.getByRole('button', { name: 'Transport importeren' }).click();
  await other.getByLabel('Plak de overdrachtsmail of de overdrachtscode', { exact: true }).fill(`Hoi, kun jij dit afmaken?\n\n> ${hoText.split('\n').join('\n> ')}`);
  await other.getByRole('button', { name: 'Importeren', exact: true }).click();
  const askedReplace = await other.getByRole('alertdialog').waitFor({ timeout: 5000 }).then(() => true, () => false);
  check('Import van bestaand transport vraagt om bevestiging', askedReplace);
  await other.getByRole('alertdialog').getByRole('button', { name: 'Vervangen' }).click();
  await other.waitForSelector('#s1');
  await other.getByRole('button', { name: 'Terug naar overzicht van concepten' }).first().click();
  await other.locator('.concept').first().waitFor();
  check('Geplakte, doorgestuurde e-mail geïmporteerd zonder dubbel concept', (await other.locator('.concept').count()) === 1);
  await ctx2.close();

  // Persoonlijk apparaat: anoniem (geen naam en patiëntnummer), geboortedatum blijft
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Amsterdam', locale: 'nl-NL' });
  const own = await ctx3.newPage();
  await own.goto(BASE);
  check('Standaard werkapparaat gekozen', await own.getByRole('radio', { name: /Werkapparaat/ }).isChecked());
  await own.getByRole('button', { name: 'Fictief voorbeeldtransport laden' }).click();
  await own.waitForSelector('#s1');
  await own.getByRole('button', { name: 'Terug naar overzicht van concepten' }).click();
  await own.getByRole('radio', { name: /Persoonlijk apparaat/ }).click();
  const askedAnon = await own.getByRole('alertdialog').waitFor({ timeout: 5000 }).then(() => true, () => false);
  check('Overstap naar persoonlijk apparaat vraagt om bestaande concepten anoniem te maken', askedAnon);
  await own.getByRole('alertdialog').getByRole('button', { name: 'Anoniem maken' }).click();
  await own.locator('.concept').first().waitFor();
  const conceptText = await own.locator('.concept').first().textContent();
  check('Concept daarna anoniem in de lijst, met geboortedatum', conceptText.includes('Anoniem transport') && !conceptText.includes('Baby Voorbeeld') && !conceptText.includes('0012345') && conceptText.includes('Geboren'), conceptText);
  await own.getByRole('button', { name: 'Hervatten' }).first().click();
  await own.waitForSelector('#s1');
  const nameField = own.getByLabel('Naam kind', { exact: true });
  const pnrField = own.getByLabel('Patiëntnummer', { exact: true });
  check('Persoonlijk apparaat: naam en patiëntnummer leeg en niet in te vullen; geboortedatum ingevuld', (await nameField.isDisabled()) && (await pnrField.isDisabled()) && (await nameField.inputValue()) === '' && (await pnrField.inputValue()) === '' && (await own.getByLabel('Geboortedatum', { exact: true }).inputValue()) !== '');
  await own.getByRole('button', { name: 'Terug naar overzicht van concepten' }).click();
  await own.getByRole('button', { name: 'Transport importeren' }).click();
  await own.getByLabel('Of open een overdrachtsbestand', { exact: true }).setInputFiles(hoPath);
  await own.waitForSelector('#s1');
  check('Persoonlijk apparaat: geïmporteerd transport wordt anoniem', (await own.getByLabel('Naam kind', { exact: true }).inputValue()) === '' && !(await own.locator('.topbar').textContent()).includes('Testbaby'));
  const stored = await own.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('neonataal-transport:v1:') && !k.endsWith('index') && !k.endsWith('instellingen')).map((k) => localStorage.getItem(k)).join(''));
  check('Persoonlijk apparaat: geen naam of patiëntnummer in de lokale opslag', !stored.includes('Testbaby') && !stored.includes('0007788') && !stored.includes('Baby Voorbeeld') && !stored.includes('0012345'));
  // Opslagstatus: groen met diskette na opslaan; rood met klokje als opslaan mislukt
  await own.getByLabel('Geboortegewicht', { exact: true }).fill('2000');
  await own.locator('.save-status.ok').waitFor();
  const greenIcon = await own.locator('.save-status.ok .save-icon').evaluate((e) => [getComputedStyle(e).color, e.innerHTML.length]);
  await own.evaluate(() => {
    Storage.prototype.setItem = function () {
      const err = new Error('vol');
      err.name = 'QuotaExceededError';
      throw err;
    };
  });
  await own.getByLabel('Geboortegewicht', { exact: true }).fill('2010');
  await own.locator('.save-status.error').waitFor();
  const redIcon = await own.locator('.save-status.error .save-icon').evaluate((e) => [getComputedStyle(e).color, e.innerHTML.length]);
  check('Opslagstatus: groen met diskette na opslaan, rood met klokje bij mislukte opslag', greenIcon[0] === 'rgb(30, 123, 52)' && redIcon[0] === 'rgb(237, 24, 70)' && greenIcon[1] !== redIcon[1], JSON.stringify([greenIcon, redIcon]));
  await ctx3.close();
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
  // Route en reistijd: verschijnt pas als beide ziekenhuizen zijn ingevuld; routeplanner nagebootst (geen internet nodig)
  check(`${w}px: geen routevak zolang het ontvangend ziekenhuis leeg is`, (await page.locator('#s2 .route-box').count()) === 0);
  let osrmCalls = 0;
  let tomtomUrl = '';
  await page.route('https://api.tomtom.com/**', (r) => {
    tomtomUrl = r.request().url();
    return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ routes: [{ summary: { lengthInMeters: 37400, travelTimeInSeconds: 2280, trafficDelayInSeconds: 420 }, guidance: { instructions: [{ roadNumbers: ['A4'] }, { roadNumbers: ['A13'] }] } }] }) });
  });
  await page.route('https://router.project-osrm.org/**', (r) => {
    osrmCalls++;
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes: [{ distance: 36200, duration: 1860, legs: [{ steps: [{ ref: 'A4', distance: 25000 }, { ref: 'A13', distance: 9000 }] }] }] }) });
  });
  const recv = page.locator('#s2').getByRole('combobox', { name: 'Ontvangend ziekenhuis' });
  await recv.fill('sophia');
  await recv.press('ArrowDown');
  await recv.press('Enter');
  await page.locator('#s2 .route-box .route-roads').waitFor({ timeout: 5000 }).catch(() => {});
  const routeText = (await page.locator('#s2 .route-box').textContent()) ?? '';
  check(`${w}px: routevak met reistijd bij actueel verkeer (TomTom), afstand en wegen`, routeText.includes('40 min') && routeText.includes('37 km') && routeText.includes('via A4 – A13') && routeText.includes('actuele verkeer (TomTom), waarvan 7 min vertraging') && routeText.includes('Sophia') && osrmCalls === 0 && /[?&]key=[A-Za-z0-9]{20,}/.test(tomtomUrl) && tomtomUrl.includes('traffic=true'), routeText);
  const gmaps = await page.locator('#s2 .route-box a', { hasText: 'Google Maps' }).getAttribute('href');
  check(`${w}px: link naar routeplanner met beide ziekenhuizen`, gmaps.startsWith('https://www.google.com/maps/dir/?api=1&origin=52.16') && gmaps.includes('destination=51.91'), gmaps);
  await page.unroute('https://router.project-osrm.org/**');
  await page.unroute('https://api.tomtom.com/**');
  const blw = await basisLayout(page);
  check(`Basisgegevens op ${w} px: 4 kolommen × 2 rijen`, blw.n === 8 && blw.cols === 4 && blw.rows === 2, JSON.stringify(blw));
  await page.screenshot({ path: `${OUT}/${w}-formulier-top.png` });
  await page.locator('#s6 .data-table').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${w}-tijdlijn.png` });
  const rowCount = await page.locator('#s6 .data-table tbody tr:not(.note-row)').count();
  check(`${w}px: tijdlijn is één tabel met één rij per meetmoment`, (await page.locator('#s6 .data-table').count()) === 1 && rowCount === 4, `${rowCount} rijen`);
  const headers = await page.locator('#s6 .data-table thead tr:not(.group-row) th').allTextContents();
  check(`${w}px: geen kolommen #, Fase of Tube`, !headers.some((h) => ['#', 'Fase', 'Tube'].includes(h.trim())), headers.join(' | '));
  check(`${w}px: geen aparte CPAP-kolom`, !headers.some((h) => h.startsWith('CPAP')));
  const peepIdx = headers.findIndex((h) => h.startsWith('PEEP'));
  const peeps = await page.locator('#s6 .data-table tbody tr:not(.note-row)').evaluateAll((trs, idx) => trs.map((tr) => tr.children[idx]?.textContent), peepIdx);
  check(`${w}px: PEEP-kolom ook gevuld bij CPAP`, JSON.stringify(peeps) === JSON.stringify(['7', '6', '6', '']), JSON.stringify(peeps));
  const types = await page.locator('#s6 .data-table tbody tr:not(.note-row)').evaluateAll((trs, idx) => trs.map((tr) => tr.children[idx]?.textContent), headers.findIndex((h) => h.startsWith('Type')));
  check(`${w}px: type bloedgas als C/A`, JSON.stringify(types) === JSON.stringify(['C', 'A', '', 'A']), JSON.stringify(types));
  await page.locator('#s6 .row-edit').nth(1).click();
  await page.locator('#s6 form').getByRole('button', { name: 'Ademhalingsondersteuning', exact: true }).click();
  check(`${w}px: bewerken toont tube die gold (8 cm)`, (await page.locator('#s6 .tube-line').textContent())?.includes('tandenrij 8 cm'));
  await page.locator('#s6').getByRole('button', { name: 'Annuleren' }).click();
  const groups = await page.locator('#s6 .data-table thead tr.group-row th').allTextContents();
  const doubleLine = await page.evaluate(() => {
    const g = document.querySelectorAll('#s6 .data-table .group-row th');
    return [getComputedStyle(g[0]).borderRightWidth, getComputedStyle(g[1]).borderLeftWidth];
  });
  check(`${w}px: geen dubbele lijn tussen Meetmoment en Ademhalingsondersteuning`, doubleLine[0] === '3px' && doubleLine[1] === '0px', doubleLine.join(' / '));
  check(`${w}px: OI als laatste groep, achter Bloedgas`, JSON.stringify(groups) === JSON.stringify(['Meetmoment', 'Ademhalingsondersteuning', 'Monitorgegevens', 'Bloedgas', 'Berekend']), groups.join(' | '));
  check(`${w}px: OI-kolom is de laatste kolom`, headers[headers.length - 1]?.trim() === 'OI' && headers[1]?.trim() === 'Modaliteit', headers.slice(-2).join(' | '));
  const alertCells = await page.locator('#s6 .data-table td.alert').allTextContents();
  check(`${w}px: OI 29,5 oranje gemarkeerd in tabel`, alertCells.length === 1 && alertCells[0].includes('29,5'), JSON.stringify(alertCells));
  // Tijdlijn als grafiek
  const sw = await page.evaluate(() => {
    const h = document.querySelector('#s6 .section-title').getBoundingClientRect();
    const v = document.querySelector('#s6 .section-actions .view-switch')?.getBoundingClientRect();
    const sec = document.querySelector('#s6').getBoundingClientRect();
    return v ? { sameRow: Math.abs(v.top + v.height / 2 - (h.top + h.height / 2)) < 12, right: sec.right - v.right < 40, icons: document.querySelectorAll('#s6 .view-switch .view-icon svg').length } : null;
  });
  const addButtons = await page.evaluate(() =>
    ['s6', 's8', 's9', 's10'].map((id) => {
      const sec = document.getElementById(id);
      const h = sec.querySelector('.section-title').getBoundingClientRect();
      const btn = sec.querySelector('.section-actions .add-button');
      const b = btn.getBoundingClientRect();
      const actions = sec.querySelector('.section-actions').getBoundingClientRect();
      return Math.abs(b.top + b.height / 2 - (h.top + h.height / 2)) < 14 && b.left > h.right && sec.getBoundingClientRect().right - actions.right < 40 && !!btn.querySelector('.add-icon svg');
    }),
  );
  check(`${w}px: toevoegknoppen (icoon add circle) rechtsboven naast de kop bij Tijdlijn, Plastic, Medicatie en Infusen`, addButtons.every(Boolean), JSON.stringify(addButtons));
  check(`${w}px: weergavekeuze rechtsboven naast de kop Tijdlijn, met iconen`, !!sw && sw.sameRow && sw.right && sw.icons === 2, JSON.stringify(sw));
  await page.locator('#s6').getByRole('radio', { name: 'Grafiek' }).check();
  const charts = page.locator('#s6 .chart-card:not(.chart-band)');
  const nCharts = await charts.count();
  const titles = await page.locator('#s6 .chart-combined .chart-title').allTextContents();
  check(`${w}px: gecombineerde grafieken Beademing, Vitale functies en Bloedgas; geen iT; tabel weg`, JSON.stringify(titles) === JSON.stringify(['Beademing', 'Vitale functies', 'Bloedgas']) && (await page.locator('#s6 .chart-title', { hasText: /^iT|^Ti/ }).count()) === 0 && (await page.locator('#s6 .data-table').count()) === 0, titles.join(' | '));
  const legend = await page.locator('#s6 .chart-combined').first().locator('.legend-label').allTextContents();
  check(`${w}px: Beademing toont drukken en FiO₂ samen, VG als strook`, ['PIP', 'PEEP', 'MAP luchtweg', 'FiO₂'].every((l) => legend.some((x) => x.startsWith(l))) && (await page.locator('#s6 .chart-combined').first().locator('.chart-lane-label', { hasText: 'VG' }).count()) === 1, legend.join(' | '));
  const layout = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#s6 .chart-card')].map((c) => c.getBoundingClientRect());
    const axes = [...document.querySelectorAll('#s6 .chart-axis')].map((l) => Math.round(l.getBoundingClientRect().left));
    return { oneColumn: new Set(cards.map((r) => Math.round(r.left))).size === 1 && new Set(cards.map((r) => Math.round(r.width))).size === 1, sameAxis: new Set(axes).size === 1 };
  });
  check(`${w}px: grafieken in één kolom met dezelfde y-as-positie`, layout.oneColumn && layout.sameAxis, JSON.stringify(layout));
  check(`${w}px: grafieken geen horizontaal scrollen`, await noHorizontalScroll(page));
  const firstSvg = await charts.first().locator('svg.chart-svg').boundingBox();
  await page.mouse.move(firstSvg.x + firstSvg.width - 12, firstSvg.y + firstSvg.height / 2);
  check(`${w}px: aanwijzen toont in alle grafieken hetzelfde meetmoment`, (await page.locator('#s6 .chart-crosshair').count()) === nCharts);
  check(`${w}px: OI > 25 oranje in de grafiek`, (await page.locator('#s6 .chart-dot.alert').count()) === 1);
  await page.mouse.click(firstSvg.x + firstSvg.width - 12, firstSvg.y + firstSvg.height / 2);
  check(`${w}px: klik in grafiek opent dat meetmoment`, (await page.getByRole('form', { name: 'Meetmoment bewerken' }).count()) === 1);
  await page.locator('#s6').getByRole('button', { name: 'Annuleren' }).click();
  await page.locator('#s6').getByRole('radio', { name: 'Tabel' }).check();
  await page.locator('#s6 .row-edit').nth(3).click();
  check(`${w}px: bewerkformulier toont OI-alert`, (await page.locator('#s6 .oi-line.alert').textContent())?.includes('29,5'));
  await page.locator('#s6').getByRole('button', { name: 'Annuleren' }).click();
  await page.locator('#s6 .row-edit').nth(2).click();
  await page.locator('#s6 form').getByRole('button', { name: 'Ademhalingsondersteuning', exact: true }).click();
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
