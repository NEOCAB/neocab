import { AlignmentType, BorderStyle, Document, Footer, Header, HeightRule, ImageRun, LineRuleType, Packer, PageNumber, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextDirection, TextRun, VerticalAlignTable, WidthType, type ISectionOptions } from 'docx';
import type { Transport } from '../domain/types';
import { DEFAULT_TIME_ZONE, formatLocalDate } from '../domain/time';
import type { LetterSettings } from '../storage/settings';
import type { Report, ReportSection, ReportTable } from './buildReport';
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

/** Liggende A4 voor de tijdlijn (twips): smalle marges, zodat alle kolommen passen. */
const LANDSCAPE = { top: 1134, right: 1021, bottom: 1134, left: 1021, header: 567, footer: 567 };
const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '9AA3AD' };
const CELL_BORDERS = { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER };
const HEAD_FILL = 'E6ECF3';
const ALERT_FILL = 'FFD8A8';
const small = (t: string, opts: { bold?: boolean; italics?: boolean; size?: number } = {}) =>
  t.split('\n').map((line, i) => new TextRun({ text: line, break: i > 0 ? 1 : undefined, font: FONT, size: opts.size ?? 14, bold: opts.bold, italics: opts.italics }));

/**
 * Tijdlijn als tabel (liggende A4): kopregel met kolomgroepen, kolomkoppen verticaal met eenheid, één rij per meetmoment;
 * beleidsaanpassingen als aparte rij onder het meetmoment (tijdcel loopt door); OI > 25 oranje. Kopregels herhalen op elke pagina.
 */
export function timelineDocxTable(table: ReportTable, width: number): Table {
  const keyIdx = table.columns.map((c, i) => (c.keyColumn ? i : -1)).filter((i) => i >= 0);
  const keyW = 980;
  const dataCount = table.columns.length - keyIdx.length;
  const dataW = Math.floor((width - keyW * keyIdx.length) / Math.max(1, dataCount));
  const widths = table.columns.map((c) => (c.keyColumn ? keyW : dataW));
  const cell = (children: Paragraph[], o: { w: number; fill?: string; span?: number; rowSpan?: number; vertical?: boolean; vAlign?: (typeof VerticalAlignTable)[keyof typeof VerticalAlignTable] } ) =>
    new TableCell({
      width: { size: o.w, type: WidthType.DXA },
      borders: CELL_BORDERS,
      columnSpan: o.span,
      rowSpan: o.rowSpan,
      shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
      textDirection: o.vertical ? TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT : undefined,
      verticalAlign: o.vAlign ?? VerticalAlignTable.TOP,
      margins: { top: 30, bottom: 30, left: 50, right: 50 },
      children,
    });
  const para = (runs: TextRun[], align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT) => new Paragraph({ alignment: align, spacing: { line: 200, lineRule: LineRuleType.AT_LEAST }, children: runs });

  // Kopregel 1: groepen (aaneengesloten kolommen met dezelfde groep samengevoegd).
  const groupCells: TableCell[] = [];
  for (let i = 0; i < table.columns.length; ) {
    let j = i;
    while (j + 1 < table.columns.length && table.columns[j + 1].group === table.columns[i].group) j++;
    const w = widths.slice(i, j + 1).reduce((a, b) => a + b, 0);
    groupCells.push(cell([para(small(table.columns[i].group, { bold: true }))], { w, span: j - i + 1, fill: HEAD_FILL }));
    i = j + 1;
  }
  // Kopregel 2: kolomkoppen (verticaal, met eenheid), behalve de tijdkolom.
  const headCells = table.columns.map((c, i) =>
    cell([para(small(`${c.header}${c.unit ? ` (${c.unit})` : ''}`, { bold: true }))], { w: widths[i], fill: HEAD_FILL, vertical: !c.keyColumn, vAlign: c.keyColumn ? VerticalAlignTable.BOTTOM : VerticalAlignTable.CENTER }),
  );
  const rows: TableRow[] = [
    new TableRow({ tableHeader: true, cantSplit: true, children: groupCells }),
    new TableRow({ tableHeader: true, cantSplit: true, height: { value: 1500, rule: HeightRule.ATLEAST }, children: headCells }),
  ];
  table.rows.forEach((row, r) => {
    const note = table.notes?.[r]?.trim();
    rows.push(
      new TableRow({
        cantSplit: true,
        children: row.map((v, i) =>
          cell([para(small(v, { bold: table.columns[i].keyColumn }))], { w: widths[i], fill: table.alerts?.[r]?.[i] ? ALERT_FILL : undefined, rowSpan: note && table.columns[i].keyColumn ? 2 : undefined }),
        ),
      }),
    );
    if (note) {
      const w = widths.filter((_, i) => !table.columns[i].keyColumn).reduce((a, b) => a + b, 0);
      rows.push(new TableRow({ cantSplit: true, children: [cell([para(small(note, { italics: true }))], { w, span: dataCount })] }));
    }
  });
  return new Table({ layout: TableLayoutType.FIXED, columnWidths: widths, width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, rows });
}

/** Paragrafen van één verslagsectie (koppen vet, veldnamen cursief), zonder titel en slotregel. */
function sectionParagraphs(sec: ReportSection): Paragraph[] {
  return reportToParas({ title: '', meta: [], sections: [sec] })
    .filter((p) => p.kind !== 'title' && p.kind !== 'end')
    .map(bodyParagraph);
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

  const portrait = { page: { size: { width: PAGE.width, height: PAGE.height }, margin: { top: PAGE.top, right: PAGE.right, bottom: PAGE.bottom, left: PAGE.left, header: PAGE.header, footer: PAGE.footer } } };
  const landscape = {
    page: { size: { width: PAGE.width, height: PAGE.height, orientation: PageOrientation.LANDSCAPE }, margin: LANDSCAPE },
  };
  const otherHeader = new Header({ children: [new Paragraph({ children: [text(`${subject} · ${longDate(now, timeZone)}`, { size: 14 })] })] });
  const closing = [
    new Paragraph({ spacing: { before: 360 }, keepNext: true, keepLines: true, children: [text('Met vriendelijke groet,')] }),
    new Paragraph({ spacing: { before: 720 }, keepLines: true, children: [text(l.senderName.trim()), ...(l.senderRole.trim() ? [new TextRun({ text: l.senderRole.trim(), break: 1, font: FONT, size: 22 })] : [])] }),
  ];

  // Staande pagina's met de tekst; de tijdlijn (als die meetmomenten heeft) als tabel op liggende A4-pagina's.
  const sections: ISectionOptions[] = [];
  let current: (Paragraph | Table)[] = [head, p([], 600), p([text("Beste collega's,")], 200), p([text(introSentence(t))], 120)];
  let first = true;
  const flushPortrait = () => {
    if (!current.length) return;
    sections.push({
      properties: { ...portrait, titlePage: first },
      headers: first ? { first: new Header({ children: [new Paragraph({ indent: { left: HEAD_INDENT }, children: logo ? [logo] : [] })] }), default: otherHeader } : { default: otherHeader },
      footers: first ? { first: footer, default: footer } : { default: footer },
      children: current,
    });
    first = false;
    current = [];
  };
  for (const sec of report.sections) {
    const tableBlock = sec.blocks.find((b) => b.table && !b.table.simple);
    if (!tableBlock?.table) {
      current.push(...sectionParagraphs(sec));
      continue;
    }
    flushPortrait();
    const width = PAGE.height - LANDSCAPE.left - LANDSCAPE.right;
    const rest = sec.blocks.filter((b) => b !== tableBlock);
    sections.push({
      properties: landscape,
      headers: { default: otherHeader },
      footers: { default: footer },
      children: [
        bodyParagraph({ kind: 'section', spans: [{ text: sec.title, b: true }] }),
        ...(sec.subtitle ? [bodyParagraph({ kind: 'normal', spans: [{ text: sec.subtitle, i: true }] })] : []),
        timelineDocxTable(tableBlock.table, width),
        // Toelichting (afnametype, OI-formule) klein onder de tabel.
        ...rest.flatMap((b) => b.rows).map((row, i) => new Paragraph({ spacing: { before: i === 0 ? 100 : 0 }, children: small(row.type === 'kv' ? `${row.label}: ${row.value}` : row.text, { size: 16, italics: true }) })),
      ],
    });
  }
  current.push(...closing);
  flushPortrait();

  return new Document({
    creator: l.senderName || 'Neo.Cab',
    title: subject,
    description: 'Overplaatsingsbrief neonataal transport (Neo.Cab)',
    styles: { default: { document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { line: LINE, lineRule: LineRuleType.AT_LEAST } } } } },
    sections,
  });
}

/** De brief als .docx-bestand. */
export async function letterToDocx(input: LetterInput): Promise<Blob> {
  return Packer.toBlob(buildLetterDocument(input));
}
