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
  regular: readFileSync(resolve(__dirname, '../../public/fonts/DejaVuSans.ttf')).toString('base64'),
  bold: readFileSync(resolve(__dirname, '../../public/fonts/DejaVuSans-Bold.ttf')).toString('base64'),
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
    t.measurements.push(m);
  }
  return t;
}

describe('verslag', () => {
  it('bevat alle secties, eenheden en de checkliststatus "Nog niet gedaan"', () => {
    const text = reportToText(buildReport(sampleTransport(TZ), TZ));
    for (const h of ['1 BASISGEGEVENS KIND', '6 TIJDLIJN', '13 CHECKLIST VOOR VERTREK', '14 AFSLUITING TRANSPORT']) expect(text).toContain(h);
    for (const h of ['Airway', 'Breathing', 'Circulation', 'Disability', 'Fluids', 'Gastro-intestinal', 'Infection']) expect(text).toContain(h);
    expect(text).toContain('Beeldvorming beschikbaar voor ontvangend ziekenhuis: Nog niet gedaan');
    const s12 = text.slice(text.indexOf('12 OUDERS EN GEZIN'), text.indexOf('13 CHECKLIST'));
    expect(s12).toContain('Contactgegevens ouders:\n  06 0000 0001\n  06 0000 0002');
    expect(text).toContain('Patiëntnummer: 0012345');
    expect(text).not.toContain('LUMC-patiëntnummer');
    for (const gone of ['Doseergewicht', 'Geslacht', 'gewogen', 'Postmenstruele']) expect(text).not.toContain(gone);
    expect(text).toContain('Amenorroeduur: 33+5 weken');
    expect(text).toContain('Gecorrigeerde leeftijd: 34+0 weken');
    expect(text).toContain('Postnatale leeftijd: dag 3');
    expect(text).toContain('Medicatie en concentratie: Glucose 10%');
    expect(text).toContain('Pompsnelheid bij start: 09-10-2026 23:15: 3,2 mL/uur');
    expect(text).toContain('Snelheidswijziging: 10-10-2026 00:15: 4 mL/uur');
    expect(text).toContain('BE: -3,1 mmol/L');
    expect(text).toContain('Gemiddelde bloeddruk (MAP): 40 mmHg');
    expect(text).toContain('PIP: 20 cmH₂O');
    expect(text).toContain('Tubediepte bij tandenrij: 7,5 cm');
  });

  it('tijdlijn is één tabel met één rij per meetmoment, zonder #, fase en tube, type bloedgas als A/V/C', () => {
    const t = sampleTransport(TZ);
    const section = buildReport(t, TZ).sections.find((s) => s.title.startsWith('6 '))!;
    const tables = section.blocks.filter((b) => b.table);
    expect(tables).toHaveLength(1);
    const table = tables[0].table!;
    expect(table.rows).toHaveLength(t.measurements.length);
    expect([...new Set(table.columns.map((c) => c.group))]).toEqual(['Meetmoment', 'Ademhalingsondersteuning', 'Monitorgegevens', 'Bloedgas']);
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

  it('berekent de OI in de tabel en markeert OI > 25 als alert', () => {
    const t = sampleTransport(TZ);
    const section = buildReport(t, TZ).sections.find((s) => s.title.startsWith('6 '))!;
    const table = section.blocks.find((b) => b.table)!.table!;
    const oi = table.columns.findIndex((c) => c.header === 'OI');
    expect(table.columns[oi].group).toBe('Meetmoment');
    expect(oi).toBe(1); // direct rechts van Tijd
    // Meetmoment 2: PTV zonder gemeten MAP -> geen OI; meetmoment 4: HFOV MAP 14, FiO₂ 60 %, PaO₂ 3,8 kPa -> 29,5.
    expect(table.rows.map((r) => r[oi])).toEqual(['', '', '', '29,5']);
    expect(table.alerts!.map((r) => r[oi])).toEqual([false, false, false, true]);
    const text = reportToText(buildReport(t, TZ));
    expect(text).toContain('Oxygenatie-index (OI, berekend): 29,5 (LET OP: > 25)');
    expect(text).toContain('Oranje gemarkeerd: OI > 25.');
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
    expect(pages).toBeGreaterThan(10);
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

  it('meetmoment over middernacht verschijnt met juiste datum', () => {
    const t = sampleTransport(TZ);
    t.measurements[1].at = wallToInstant('2026-10-10T00:02', TZ);
    const text = reportToText(buildReport(t, TZ));
    expect(text).toContain('Meetmoment 2 · 10-10-2026 00:02\n    Modaliteit: PTV');
    expect(text).not.toContain('Afnametijd');
    expect(text).toContain('Aankomst ontvangend centrum: 10-10-2026 01:35');
  });
});
