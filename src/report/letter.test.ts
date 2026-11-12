import { describe, expect, it } from 'vitest';
import { Packer } from 'docx';
import { sampleTransport } from '../domain/sample';
import { EMPTY_LETTER } from '../storage/settings';
import { buildReport } from './buildReport';
import { addresseeLines, buildLetterDocument, imageSize, introSentence, letterFileName, letterSections, longDate } from './letter';

const TZ = 'Europe/Amsterdam';

/** word/document.xml uit een .docx (zip, deflate). */
async function documentXml(buf: Buffer): Promise<string> {
  const { inflateRawSync } = await import('node:zlib');
  let i = 0;
  while (i < buf.length - 30 && buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8);
    const size = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString();
    const start = i + 30 + nameLen + extraLen;
    const data = buf.subarray(start, start + size);
    if (name === 'word/document.xml') return (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    i = start + size;
  }
  throw new Error('document.xml niet gevonden');
}

describe('overplaatsingsbrief', () => {
  it('geadresseerde, openingszin, datum en bestandsnaam', () => {
    const t = sampleTransport(TZ);
    t.referral.receivingDepartment = 'NICU';
    t.referral.receivingHospital = 'Wilhelmina Kinderziekenhuis (UMC Utrecht), Utrecht';
    expect(addresseeLines(t)).toEqual(['NICU', 'Wilhelmina Kinderziekenhuis (UMC Utrecht)', 'Utrecht']);
    expect(introSentence(t)).toBe('Hierbij ontvangt u het verslag van het neonatale transport van Baby Voorbeeld (fictief) (geboren 07-10-2026) van Alrijne Ziekenhuis, Leiderdorp naar Wilhelmina Kinderziekenhuis (UMC Utrecht), Utrecht.');
    t.child.name = '';
    t.referral.receivingHospital = '';
    expect(introSentence(t)).toBe('Hierbij ontvangt u het verslag van het neonatale transport van de patiënt (geboren 07-10-2026) vanuit Alrijne Ziekenhuis, Leiderdorp.');
    expect(longDate(new Date('2026-10-30T23:30:00Z'), TZ)).toBe('31 oktober 2026');
    expect(letterFileName('Baby Ä', '123', new Date('2026-10-30T12:00:00Z'))).toBe('overplaatsingsbrief-Baby-A-123-2026-10-30.docx');
  });

  it('herkent afmetingen van PNG en JPEG voor het logo', () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47]);
    new DataView(png.buffer).setUint32(16, 600);
    new DataView(png.buffer).setUint32(20, 160);
    expect(imageSize(png)).toEqual({ width: 600, height: 160, type: 'png' });
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x50, 0x01, 0x2c, 0, 0, 0]);
    expect(imageSize(jpg)).toEqual({ width: 300, height: 80, type: 'jpg' });
    expect(imageSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('maakt een Word-document (ook zonder afzendergegevens of logo)', async () => {
    const t = sampleTransport(TZ);
    const buf = await Packer.toBuffer(buildLetterDocument({ transport: t, report: buildReport(t, TZ), letter: EMPTY_LETTER, timeZone: TZ }));
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    expect(buf.length).toBeGreaterThan(5000);
  });

  it('zet de tijdlijn als tabel op een liggende A4-pagina, de rest staand', async () => {
    const t = sampleTransport(TZ);
    const buf = await Packer.toBuffer(buildLetterDocument({ transport: t, report: buildReport(t, TZ), letter: EMPTY_LETTER, timeZone: TZ }));
    const xml = await documentXml(buf);
    const sizes = [...xml.matchAll(/<w:pgSz [^>]*>/g)].map((m) => m[0]);
    expect(sizes).toHaveLength(3);
    expect(sizes[1]).toContain('w:orient="landscape"');
    expect(sizes[0]).not.toContain('landscape');
    expect(sizes[2]).not.toContain('landscape');
    // Kopregels herhalen, verticale kolomkoppen, OI > 25 oranje gemarkeerd.
    expect(xml).toContain('<w:tblHeader/>');
    expect(xml).toContain('w:val="btLr"');
    expect(xml).toContain('w:fill="FFD8A8"');
    expect(xml).toContain('Besluit tot intubatie en surfactant (fictief).');
    // Geen toelichting onder de tijdlijn; medicatie en infusen als tabel (staand); Plastic als Ingebrachte materialen.
    expect(xml).not.toContain('Type bloedgas');
    expect(xml).not.toContain('OI = (MAP');
    expect([...xml.matchAll(/<w:tbl>/g)].length).toBe(4);
    expect(xml).toContain('Ingebrachte materialen');
    expect(xml).not.toContain('>Plastic<');
    expect(xml).toContain('Toedieningsroute');
  });

  it('zet de telefoonnummers van de ouders bij de kindgegevens', () => {
    const t = sampleTransport(TZ);
    const secs = letterSections(buildReport(t, TZ));
    const labels = (title: string) => secs.find((s) => s.title === title)!.blocks.flatMap((b) => b.rows).map((r) => (r.type === 'kv' ? r.label : r.type));
    expect(labels('Basisgegevens kind').slice(-2)).toEqual(['Telefoonnummer moeder', 'Telefoonnummer partner']);
    expect(labels('Gezin')).not.toContain('Telefoonnummer moeder');
  });
});
