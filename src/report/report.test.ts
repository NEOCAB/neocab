import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { newMeasurement } from '../domain/factory';
import { sampleTransport } from '../domain/sample';
import { wallToInstant } from '../domain/time';
import type { Transport } from '../domain/types';
import { buildReport } from './buildReport';
import { reportToPdf } from './pdf';
import { reportToText } from './text';

const TZ = 'Europe/Amsterdam';
const fonts = {
  regular: readFileSync(resolve(__dirname, '../../public/fonts/PTSans-Regular.ttf')).toString('base64'),
  bold: readFileSync(resolve(__dirname, '../../public/fonts/PTSans-Bold.ttf')).toString('base64'),
};

function bigTransport(): Transport {
  const t = sampleTransport(TZ);
  const long = Array.from({ length: 120 }, (_, i) => `Zin ${i + 1} van een zeer lange vrije tekst met details.`).join(' ');
  t.proceduresAndEvents = `${long}\nEINDE-PROCEDURES`;
  t.referralCondition.notes.breathing = `${long}\nEINDE-BREATHING`;
  const start = Date.parse('2026-10-09T20:00:00Z');
  for (let i = 0; i < 60; i++) {
    const m = newMeasurement(t.measurements, TZ, start + i * 5 * 60000);
    m.monitor.heartRate = 100 + i;
    m.gas.values.be = -i / 10;
    m.gas.type = 'veneus';
    if (i % 7 === 0) m.policyChanges = `Beleidsaanpassing ${i}: ${'lange toelichting '.repeat(12)}`;
    t.measurements.push(m);
  }
  return t;
}

describe('verslag', () => {
  it('toont de Thompsonscore alleen bij therapeutische hypothermie', () => {
    const t = sampleTransport(TZ);
    t.referralCondition.thompson.scores.tone = 2;
    t.referralCondition.thompson.scores.consciousness = 2;
    expect(reportToText(buildReport(t, TZ))).not.toContain('Thompson');
    t.referral.therapeuticHypothermia = true;
    let text = reportToText(buildReport(t, TZ));
    expect(text).toContain('Reden van overplaatsing:\n  Therapeutische hypothermie\n  Toenemende zuurstofbehoefte');
    expect(buildReport(t, TZ).sections[2].blocks.map((b) => b.title)).toEqual(['Zwangerschap en geboorte', 'Toestand bij verwijzing', 'Perinatale asfyxie', 'Thompson Score', 'Advies']);
    expect(text).toContain('» Perinatale asfyxie\nNiet ingevuld.');
    t.referralCondition.asphyxia = { criteria: ['lactate', 'apgar5'] };
    expect(reportToText(buildReport(t, TZ))).toContain('» Perinatale asfyxie\nCriteria:\n  Apgarscore op 5 minuten ≤ 5\n  Lactaat > 10.0 mmol/L\n\n» Thompson Score');
    expect(text).toContain('Tonus: 2 – hypotonie\nBewustzijn: 2 – lethargisch\nTotale score: 4 / 22 (onvolledig: 2 van 9 onderdelen ingevuld)');
    for (const k of Object.keys(t.referralCondition.thompson.scores) as (keyof typeof t.referralCondition.thompson.scores)[]) t.referralCondition.thompson.scores[k] = 1;
    t.referralCondition.thompson.at = wallToInstant('2026-10-09T23:10', TZ);
    text = reportToText(buildReport(t, TZ));
    expect(text).toContain('Tijdstip score: 09-10-2026 23:10');
    expect(text).toContain('Fontanel: 1 – vol, niet gespannen\nTotale score: 9 / 22\n');
  });

  it('bevat alle secties behalve de checklist, met eenheden', () => {
    const text = reportToText(buildReport(sampleTransport(TZ), TZ));
    for (const h of ['BASISGEGEVENS KIND', 'DISPATCH', 'STABILISATIE\n', 'TIJDLIJN\n', 'Ademhalingsondersteuning, monitorgegevens en bloedgassen', '\nGEZIN\n', '\nTRANSPORT\n']) expect(text).toContain(h);
    for (const h of ['Airway', 'Breathing', 'Circulation', 'Disability', 'Exposure', 'Fluids', 'Gastro-intestinal', 'Infection']) expect(text).toContain(h);
    for (const gone of ['CHECKLIST', 'Nog niet gedaan', 'Gasvoorraad gecontroleerd', 'Niet van toepassing']) expect(text).not.toContain(gone);
    expect(text).not.toContain('Allergie');
    // Herkomst en bestemming; Verwijzing = zwangerschap en geboorte + toestand bij verwijzing.
    const titles = buildReport(sampleTransport(TZ), TZ).sections.map((sec) => sec.title);
    expect(titles).toEqual(['Basisgegevens kind', 'Herkomst en bestemming', 'Verwijzing', 'Dispatch', 'Stabilisatie', 'Tijdlijn', 'Overige diagnostiek', 'Plastic', 'Medicatie', 'Infusen', 'Notities', 'Gezin', 'Transport']);
    expect(buildReport(sampleTransport(TZ), TZ).sections[2].blocks.map((b) => b.title)).toEqual(['Zwangerschap en geboorte', 'Toestand bij verwijzing', 'Advies']);
    const noAdvice = sampleTransport(TZ);
    noAdvice.referralCondition.advice = '';
    expect(buildReport(noAdvice, TZ).sections[2].blocks.map((b) => b.title)).toEqual(['Zwangerschap en geboorte', 'Toestand bij verwijzing']);
    // Koppen zonder nummer.
    expect(buildReport(sampleTransport(TZ), TZ).sections.every((sec) => !/^\d/.test(sec.title))).toBe(true);
    const s12 = text.slice(text.indexOf('\nGEZIN\n'), text.indexOf('\nTRANSPORT\n'));
    expect(s12).toContain('Telefoonnummer moeder: 06 0000 0001\nTelefoonnummer partner: 06 0000 0002');
    expect(text).toContain('Patiëntnummer: 0012345');
    expect(text).not.toContain('LUMC');
    for (const gone of ['Doseergewicht', 'Geslacht', 'gewogen', 'Postmenstruele']) expect(text).not.toContain(gone);
    expect(text).toContain('Amenorroeduur: 33+5 weken');
    expect(text).toContain('Gecorrigeerde leeftijd: 34+0 weken');
    expect(text).toContain('Ambulance aangevraagd: 09-10-2026 22:20');
    expect(text).toContain('Vertrek transportteam: 09-10-2026 22:35');
    const s5 = text.slice(text.indexOf('DISPATCH'), text.indexOf('STABILISATIE\n'));
    expect(s5).toContain('Aankomst bij kind: 09-10-2026 23:05');
    for (const tp of ['Verwijzing: 09-10-2026 22:10', 'Vertrek met kind: 10-10-2026 00:40', 'Aankomst ontvangend centrum: 10-10-2026 01:35']) expect(text).toContain(tp);
    expect(text).toContain('Postnatale leeftijd: dag 3');
    expect(text).toContain('Medicatie en concentratie: Glucose 10%');
    expect(text).toContain('Infuus 1 · 09-10-2026 23:15\n    Medicatie en concentratie: Glucose 10%; Pompsnelheid (mL/uur): 3,2 → 4 vanaf 10-10-2026 00:15; Stop: loopt');
    expect(text).toContain('Toediening 1 · 23:22\n    Medicament: Voorbeeldmedicament; Dosis: 0,5 mg; Toedieningsroute: Intraveneus');
    expect(text).toContain('BE: -3,1 mmol/L');
    expect(text).toContain('Gemiddelde bloeddruk (MAP): 40 mmHg');
    expect(text).toContain('PIP: 20 cmH₂O');
    expect(text).toContain('Tubediepte bij tandenrij: 7,5 cm');
  });

  it('tijdlijn is één tabel met één rij per meetmoment, zonder #, fase en tube, type bloedgas als A/V/C', () => {
    const t = sampleTransport(TZ);
    const section = buildReport(t, TZ).sections.find((s) => s.title === 'Tijdlijn')!;
    const tables = section.blocks.filter((b) => b.table);
    expect(tables).toHaveLength(1);
    const table = tables[0].table!;
    expect(table.rows).toHaveLength(t.measurements.length);
    expect([...new Set(table.columns.map((c) => c.group))]).toEqual(['Meetmoment', 'Ademhalingsondersteuning', 'Monitorgegevens', 'Bloedgas', 'Berekend']);
    const headers = table.columns.map((c) => c.header);
    for (const h of ['#', 'Fase', 'Tube']) expect(headers).not.toContain(h);
    expect(headers[0]).toBe('Tijd');
    const col = (h: string, unit = '') => table.columns.findIndex((c) => c.header === h && c.unit === unit);
    // Rijen chronologisch; bloeddruk (mmHg) en luchtwegdruk (cmH₂O) zijn aparte kolommen.
    expect(table.rows.map((r) => r[col('Tijd')])).toEqual(['09-10-2026\n23:10', '09-10-2026\n23:45', '10-10-2026\n00:50', '10-10-2026\n01:20']);
    expect(table.rows[1][col('Bloeddruk MAP', 'mmHg')]).toBe('40');
    expect(table.rows[2][col('MAP luchtweg', 'cmH₂O')]).toBe('9');
    // Bij CPAP wordt PEEP ingevoerd; geen aparte CPAP-kolom.
    expect(col('CPAP', 'cmH₂O')).toBe(-1);
    expect(table.rows.map((r) => r[col('PEEP', 'cmH₂O')])).toEqual(['7', '6', '6', '']);
    expect(table.rows.map((r) => r[col('Type')])).toEqual(['C', 'A', '', 'A']);
    expect(section.blocks.some((b) => b.rows.some((r) => r.type === 'note' && r.text.includes('A = arterieel, V = veneus, C = capillair')))).toBe(true);
    // Lege kolommen (geen enkele waarde) worden weggelaten.
    expect(col('etCO₂', 'kPa')).toBe(-1);
  });

  it('toont de datum in de tijdkolom alleen als meetmomenten over meerdere dagen gaan', () => {
    const t = sampleTransport(TZ);
    const tijd = (tt: typeof t) => {
      const table = buildReport(tt, TZ).sections.find((s) => s.title === 'Tijdlijn')!.blocks.find((b) => b.table)!.table!;
      return table.rows.map((r) => r[0]);
    };
    expect(tijd(t)[0]).toBe('09-10-2026\n23:10'); // over middernacht: met datum
    const sameDay = { ...t, measurements: t.measurements.slice(0, 2) };
    expect(tijd(sameDay)).toEqual(['23:10', '23:45']); // één dag: alleen tijd
  });

  it('berekent de OI in de tabel en markeert OI > 25 als alert', () => {
    const t = sampleTransport(TZ);
    const section = buildReport(t, TZ).sections.find((s) => s.title === 'Tijdlijn')!;
    const table = section.blocks.find((b) => b.table)!.table!;
    const oi = table.columns.findIndex((c) => c.header === 'OI');
    expect(table.columns[oi].group).toBe('Berekend');
    expect(oi).toBe(table.columns.length - 1); // laatste kolom, achter Bloedgas
    // Meetmoment 2: PTV zonder gemeten MAP -> geen OI; meetmoment 4: HFOV MAP 14, FiO₂ 60 %, PaO₂ 3,8 kPa -> 29,5.
    expect(table.rows.map((r) => r[oi])).toEqual(['', '', '', '29,5']);
    expect(table.alerts!.map((r) => r[oi])).toEqual([false, false, false, true]);
    const text = reportToText(buildReport(t, TZ));
    expect(text).toContain('Oxygenatie-index (OI, berekend): 29,5 (LET OP: > 25)');
    expect(text).toContain('Oranje gemarkeerd: OI > 25.');
  });

  it('medicatie en infusen zijn tabellen (één rij per toediening of infuus, chronologisch)', () => {
    const t = sampleTransport(TZ);
    const report = buildReport(t, TZ);
    const med = report.sections.find((s) => s.title === 'Medicatie')!.blocks[0].table!;
    expect(med.simple).toBe(true);
    expect(med.columns.map((c) => c.header)).toEqual(['Tijd', 'Medicament', 'Dosis', 'Toedieningsroute']);
    expect(med.rows).toEqual([
      ['23:22', 'Voorbeeldmedicament', '0,5 mg', 'Intraveneus'],
      ['23:30', 'Surfactant (fictief voorbeeld)', '200 mg/kg', 'Endotracheaal'],
    ]);
    const inf = report.sections.find((s) => s.title === 'Infusen')!.blocks[0].table!;
    expect(inf.columns.map((c) => `${c.header}${c.unit ? ` (${c.unit})` : ''}`)).toEqual(['Start', 'Medicatie en concentratie', 'Pompsnelheid (mL/uur)', 'Stop']);
    expect(inf.rows[0]).toEqual(['09-10-2026\n23:15', 'Glucose 10%', '3,2\n4 vanaf 10-10-2026 00:15', 'loopt']);
    const none = buildReport({ ...t, medications: [], infusions: [] }, TZ);
    expect(none.sections.find((s) => s.title === 'Medicatie')!.blocks[0].table).toBeUndefined();
    expect(reportToText(none)).toContain('Geen infusen geregistreerd.');
  });

  it('toont beleidsaanpassingen als aparte rij bij hetzelfde tijdsmoment', () => {
    const t = sampleTransport(TZ);
    const table = buildReport(t, TZ).sections.find((s) => s.title === 'Tijdlijn')!.blocks.find((b) => b.table)!.table!;
    expect(table.rows).toHaveLength(4);
    expect(table.noteLabel).toBe('Beleidsaanpassingen');
    expect(table.notes).toEqual(['Besluit tot intubatie en surfactant (fictief).', '', '', 'Overgestapt op HFOV; FiO₂ verhoogd (fictief).']);
    const text = reportToText(buildReport(t, TZ));
    const m1 = text.slice(text.indexOf('Meetmoment 1'), text.indexOf('Meetmoment 2'));
    expect(m1).toContain('    Beleidsaanpassingen: Besluit tot intubatie en surfactant (fictief).');
    const m2 = text.slice(text.indexOf('Meetmoment 2'), text.indexOf('Meetmoment 3'));
    expect(m2).not.toContain('Beleidsaanpassingen');
  });

  it('laat de OI-kolom weg als de OI bij geen enkel meetmoment berekenbaar is', () => {
    const t = sampleTransport(TZ);
    t.measurements = t.measurements.slice(0, 3);
    const table = buildReport(t, TZ).sections.find((s) => s.title === 'Tijdlijn')!.blocks.find((b) => b.table)!.table!;
    expect(table.columns.some((c) => c.header === 'OI')).toBe(false);
    expect(table.columns.some((c) => c.group === 'Berekend')).toBe(false);
  });

  it('exporteert alleen instellingen van de actuele modaliteit', () => {
    const t = sampleTransport(TZ);
    t.measurements[0].resp = { mode: 'hfnc', settingsByMode: { cpap: { peep: 7 }, hfnc: { flow: 6, fio2: 30 } } };
    const text = reportToText(buildReport(t, TZ));
    const m1 = text.slice(text.indexOf('Meetmoment 1'), text.indexOf('Meetmoment 2'));
    expect(m1).toContain('HFNC');
    expect(m1).not.toContain('PEEP');
  });

  it('toont onbekend niet als normale waarde en laat lege waarden weg', () => {
    const t = sampleTransport(TZ);
    t.measurements[0].monitor.heartRate = 'onbekend';
    t.measurements[0].monitor.temperature = 0;
    t.measurements[0].monitor.respRate = null;
    const text = reportToText(buildReport(t, TZ));
    const m1 = text.slice(text.indexOf('Meetmoment 1'), text.indexOf('Meetmoment 2'));
    expect(m1).toContain('Hartfrequentie: onbekend');
    expect(m1).toContain('Temperatuur: 0 °C');
    expect(m1).not.toContain('Ademfrequentie');
  });

  it('e-mailtekst is volledig bij veel meetmomenten en lange tekst', () => {
    const t = bigTransport();
    const text = reportToText(buildReport(t, TZ));
    expect(text).toContain('EINDE-PROCEDURES');
    expect(text).toContain('EINDE-BREATHING');
    expect(text).toContain('Meetmoment 63');
    expect(text).toContain('Zin 120 van een zeer lange');
    expect(text.length).toBeGreaterThan(20000);
  });

  it('maakt een meerpagina A4-pdf zonder inhoud te verliezen', () => {
    const t = bigTransport();
    const doc = reportToPdf(buildReport(t, TZ), fonts);
    const pages = doc.getNumberOfPages();
    expect(pages).toBeGreaterThan(5);
    const size = doc.internal.pageSize;
    expect(Math.round(size.getWidth())).toBe(210);
    expect(Math.round(size.getHeight())).toBe(297);
    const bytes = doc.output('arraybuffer');
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    if (process.env.WRITE_PDF) {
      // Handmatige review: WRITE_PDF=1 npx vitest run
      mkdirSync('test-output', { recursive: true });
      writeFileSync('test-output/groot-verslag.pdf', Buffer.from(bytes));
      writeFileSync('test-output/voorbeeld-verslag.pdf', Buffer.from(reportToPdf(buildReport(sampleTransport(TZ), TZ), fonts).output('arraybuffer')));
    }
  });

  it('zet een logo rechtsboven op de eerste pagina als dat is meegegeven', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const without = reportToPdf(buildReport(sampleTransport(TZ), TZ), fonts);
    const withLogo = reportToPdf(buildReport(sampleTransport(TZ), TZ), { ...fonts, logoPng: png });
    expect(withLogo.getNumberOfPages()).toBe(without.getNumberOfPages());
    expect(new TextDecoder().decode(withLogo.output('arraybuffer'))).toContain('/Subtype /Image');
  });

  it('meetmoment over middernacht verschijnt met juiste datum', () => {
    const t = sampleTransport(TZ);
    t.measurements[1].at = wallToInstant('2026-10-10T00:02', TZ);
    const text = reportToText(buildReport(t, TZ));
    expect(text).toContain('Meetmoment 2 · 10-10-2026 00:02\n    Modaliteit: PTV');
    expect(text).not.toContain('Afnametijd');
    expect(text).toContain('Aankomst ontvangend centrum: 10-10-2026 01:35');
  });
});
