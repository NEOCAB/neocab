import { AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, LineRuleType, Packer, PageNumber, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from 'docx';
import type { Transport } from '../domain/types';
import { DEFAULT_TIME_ZONE, formatLocalDate } from '../domain/time';
import type { LetterSettings } from '../storage/settings';
import type { Report } from './buildReport';
import { reportToParas, type Para, type ParaKind, type Span } from './text';

/**
 * Overplaatsingsbrief als Word-document (.docx), naar het voorbeeld van een ziekenhuisbrief:
 * briefhoofd met (eigen) logo, links de afzendergegevens met kleine rechts uitgelijnde kopjes, rechts de geadresseerde,
 * daarna aanhef, het volledige transportverslag (koppen vet, veldnamen cursief) en de ondertekening.
 * Alle afzendergegevens komen uit Instellingen; er staat geen ziekenhuis vast in de app.
 */

const FONT = 'Calibri';
/** Afmetingen in twips (1/20 pt), zoals in het voorbeeld (A4). */
const PAGE = { width: 11906, height: 16838, top: 2506, right: 1503, bottom: 2268, left: 1814, header: 709, footer: 709 };
/** Briefhoofdtabel: kopjes in de linkermarge, waarde, "aan", geadresseerde. */
const HEAD_COLS = [1230, 4065, 703, 4082];
const HEAD_INDENT = -1361;
const LINE = 260;

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

/** Datum voluit, bijv. "30 oktober 2026". */
export function longDate(now: Date, timeZone = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(now);
}

export function letterFileName(childName: string, patientNumber: string, now = new Date()): string {
  const slug = [childName, patientNumber]
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  return `overplaatsingsbrief${slug ? `-${slug}` : ''}-${now.toISOString().slice(0, 10)}.docx`;
}

/** Geadresseerde: ontvangende afdeling en ziekenhuis ("Naam, Plaats" op twee regels). */
export function addresseeLines(t: Transport): string[] {
  const r = t.referral;
  const hospital = r.receivingHospital.trim();
  const m = /^(.*),\s*([^,]+)$/.exec(hospital);
  return [r.receivingDepartment.trim(), ...(m ? [m[1].trim(), m[2].trim()] : [hospital])].filter(Boolean);
}

/** Openingszin met kind, geboortedatum en van/naar. Lege gegevens worden weggelaten. */
export function introSentence(t: Transport): string {
  const c = t.child;
  const who = c.name.trim() || 'de patiënt';
  const born = c.birthDate ? ` (geboren ${formatLocalDate(c.birthDate)})` : '';
  const from = t.referral.referringHospital.trim();
  const to = t.referral.receivingHospital.trim();
  const route = from && to ? ` van ${from} naar ${to}` : from ? ` vanuit ${from}` : to ? ` naar ${to}` : '';
  return `Hierbij ontvangt u het verslag van het neonatale transport van ${who}${born}${route}.`;
}

/** Breedte en hoogte (px) van een PNG- of JPEG-afbeelding; `null` als onbekend. */
export function imageSize(bytes: Uint8Array): { width: number; height: number; type: 'png' | 'jpg' } | null {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset);
    return { width: dv.getUint32(16), height: dv.getUint32(20), type: 'png' };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      // SOF0–SOF15 (behalve DHT, JPG en DAC) bevatten de afmetingen.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8], type: 'jpg' };
      }
      i += 2 + len;
    }
  }
  return null;
}

function dataUrlBytes(url: string): Uint8Array | null {
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(url);
  if (!m) return null;
  const bin = atob(m[2]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Tekst met regelafbrekingen als losse runs. */
function runs(span: Span, extra: { size?: number } = {}): TextRun[] {
  return span.text.split('\n').map((text, i) => new TextRun({ text, break: i > 0 ? 1 : undefined, bold: span.b, italics: span.i, underline: span.u ? {} : undefined, font: FONT, ...extra }));
}

const PARA_STYLE: Record<ParaKind, { before: number; after: number; size?: number; indent?: number; keepNext?: boolean }> = {
  title: { before: 0, after: 80, size: 26 },
  section: { before: 280, after: 60, size: 24, keepNext: true },
  block: { before: 160, after: 40, keepNext: true },
  normal: { before: 0, after: 40 },
  indent: { before: 0, after: 40, indent: 360 },
  rowhead: { before: 120, after: 0, keepNext: true },
  sub: { before: 120, after: 40, keepNext: true },
  end: { before: 0, after: 0 },
};

function bodyParagraph(p: Para): Paragraph {
  const st = PARA_STYLE[p.kind];
  return new Paragraph({
    spacing: { before: st.before, after: st.after },
    indent: st.indent ? { left: st.indent } : undefined,
    keepNext: st.keepNext,
    children: p.spans.flatMap((s) => runs(s, st.size ? { size: st.size } : {})),
  });
}

const text = (t: string, opts: { size?: number; bold?: boolean } = {}) => new TextRun({ text: t, font: FONT, size: opts.size ?? 22, bold: opts.bold });
const exact = { line: LINE, lineRule: LineRuleType.EXACT };

function headCell(width: number, paragraphs: Paragraph[]): TableCell {
  return new TableCell({ width: { size: width, type: WidthType.DXA }, borders: NO_BORDERS, margins: { top: 0, bottom: 0, left: 60, right: 60 }, children: paragraphs });
}

/** Briefhoofd: kopje (7 pt, rechts) | waarde | "aan" | geadresseerde (alleen in de eerste rij, over alle rijen). */
function headTable(rows: { label: string; value: string | TextRun[] }[], addressee: string[]): Table {
  return new Table({
    layout: TableLayoutType.FIXED,
    indent: { size: HEAD_INDENT, type: WidthType.DXA },
    columnWidths: HEAD_COLS,
    borders: NO_BORDERS,
    rows: rows.map(
      (r, i) =>
        new TableRow({
          children: [
            headCell(HEAD_COLS[0], [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: exact, children: [text(r.label, { size: 14 })] })]),
            headCell(
              HEAD_COLS[1],
              typeof r.value === 'string'
                ? r.value.split('\n').map((l) => new Paragraph({ spacing: exact, children: [text(l)] }))
                : [new Paragraph({ spacing: exact, children: r.value })],
            ),
            ...(i === 0
              ? [
                  new TableCell({
                    width: { size: HEAD_COLS[2], type: WidthType.DXA },
                    borders: NO_BORDERS,
                    rowSpan: rows.length,
                    margins: { top: 0, bottom: 0, left: 60, right: 60 },
                    children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: exact, children: [text('aan', { size: 14 })] })],
                  }),
                  new TableCell({
                    width: { size: HEAD_COLS[3], type: WidthType.DXA },
                    borders: NO_BORDERS,
                    rowSpan: rows.length,
                    margins: { top: 0, bottom: 0, left: 60, right: 60 },
                    children: (addressee.length ? addressee : ['']).map((l) => new Paragraph({ spacing: exact, children: [text(l)] })),
                  }),
                ]
              : []),
          ],
        }),
    ),
  });
}

export interface LetterInput {
  transport: Transport;
  report: Report;
  letter: LetterSettings;
  timeZone?: string;
  now?: Date;
}

export function buildLetterDocument({ transport: t, report, letter: l, timeZone = DEFAULT_TIME_ZONE, now = new Date() }: LetterInput): Document {
  const name = t.child.name.trim();
  const subject = name ? `Overplaatsing ${name}` : 'Overplaatsing';
  const head = headTable(
    [
      { label: 'afdeling', value: l.department },
      { label: 'postzone', value: l.postzone },
      { label: 'afzender', value: l.senderName },
      { label: 'bezoekadres', value: l.visitAddress },
      { label: 'telefoon', value: l.phone },
      { label: 'e-mail', value: l.email },
      { label: 'onze referentie', value: t.child.patientNumber.trim() },
      { label: 'uw referentie', value: '' },
      { label: 'datum', value: longDate(now, timeZone) },
      { label: 'onderwerp', value: subject },
      { label: "aantal pagina's", value: [new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 22 })] },
    ],
    addresseeLines(t),
  );

  // Verslag zonder titel en kopregels (staan al in briefhoofd en openingszin) en zonder slotregel.
  const paras = reportToParas(report);
  const firstSection = paras.findIndex((p) => p.kind === 'section');
  const body = paras.slice(firstSection < 0 ? 0 : firstSection).filter((p) => p.kind !== 'end');

  const logoBytes = l.logo ? dataUrlBytes(l.logo) : null;
  const logoSize = logoBytes ? imageSize(logoBytes) : null;
  // Logo maximaal 7 cm breed en 2 cm hoog (in pixels op 96 dpi), verhouding behouden.
  const logo =
    logoBytes && logoSize
      ? (() => {
          const scale = Math.min(265 / logoSize.width, 76 / logoSize.height, 1);
          return new ImageRun({ type: logoSize.type, data: logoBytes, transformation: { width: Math.round(logoSize.width * scale), height: Math.round(logoSize.height * scale) } });
        })()
      : null;

  const footer = new Footer({
    children: [
      ...(l.footer.trim() ? [new Paragraph({ children: [text(l.footer.trim(), { size: 14 })] })] : []),
      new Paragraph({ alignment: AlignmentType.RIGHT, children: [text('pagina ', { size: 14 }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 14 }), text(' van ', { size: 14 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 14 })] }),
    ],
  });
  const p = (children: TextRun[], after = 0) => new Paragraph({ spacing: { after }, children });

  return new Document({
    creator: l.senderName || 'Neo.Cab',
    title: subject,
    description: 'Overplaatsingsbrief neonataal transport (Neo.Cab)',
    styles: { default: { document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { line: LINE, lineRule: LineRuleType.AT_LEAST } } } } },
    sections: [
      {
        properties: {
          titlePage: true,
          page: { size: { width: PAGE.width, height: PAGE.height }, margin: { top: PAGE.top, right: PAGE.right, bottom: PAGE.bottom, left: PAGE.left, header: PAGE.header, footer: PAGE.footer } },
        },
        headers: {
          first: new Header({ children: [new Paragraph({ indent: { left: HEAD_INDENT }, children: logo ? [logo] : [] })] }),
          default: new Header({ children: [new Paragraph({ children: [text(`${subject} · ${longDate(now, timeZone)}`, { size: 14 })] })] }),
        },
        footers: { first: footer, default: footer },
        children: [
          head,
          p([], 600),
          p([text("Beste collega's,")], 200),
          p([text(introSentence(t))], 120),
          ...body.map(bodyParagraph),
          new Paragraph({ spacing: { before: 360 }, keepNext: true, keepLines: true, children: [text('Met vriendelijke groet,')] }),
          new Paragraph({ spacing: { before: 720 }, keepLines: true, children: [text(l.senderName.trim()), ...(l.senderRole.trim() ? [new TextRun({ text: l.senderRole.trim(), break: 1, font: FONT, size: 22 })] : [])] }),
        ],
      },
    ],
  });
}

/** De brief als .docx-bestand. */
export async function letterToDocx(input: LetterInput): Promise<Blob> {
  return Packer.toBlob(buildLetterDocument(input));
}
