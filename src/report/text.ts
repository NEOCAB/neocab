import type { Report, ReportTable } from './buildReport';

/**
 * Het verslag als tekst, in twee vormen met dezelfde inhoud:
 * - platte e-mailtekst (klembord, mailto-link); koppen in gewone schrijfwijze, zonder hoofdletters of streep eronder;
 * - RTF-bestand met opmaak (koppen vet, veldnamen cursief), te openen in Word/WordPad en van daaruit te kopiëren
 *   naar een EPD dat opmaak alleen als RTF overneemt (bijv. HiX).
 * Niets wordt ingekort.
 */

interface TableEntry {
  head: string;
  data: string[];
  alert: boolean[];
  noteLabel: string;
  note?: string;
}

/** Tabel per rij (bijv. per meetmoment): kop met tijd en de ingevulde waarden; lege cellen weggelaten. */
function tableEntries(table: ReportTable): TableEntry[] {
  return table.rows.map((row, r) => {
    const key: string[] = [];
    const data: string[] = [];
    const alert: boolean[] = [];
    table.columns.forEach((c, i) => {
      const raw = row[i] ?? '';
      if (!raw) return;
      if (c.keyColumn) key.push(raw.replace(/\n/g, ' '));
      else {
        data.push(table.simple ? `${c.fullLabel}${c.unit ? ` (${c.unit})` : ''}: ${raw.replace(/\n/g, ' → ')}` : `${c.fullLabel}: ${raw.replace(/\n/g, ' ')}${c.unit ? ` ${c.unit}` : ''}`);
        alert.push(!table.simple && !!table.alerts?.[r]?.[i]);
      }
    });
    return { head: `${table.rowLabel ?? 'Meetmoment'} ${r + 1} · ${key.join(' · ')}`, data, alert, noteLabel: table.noteLabel ?? 'Toelichting', note: table.notes?.[r] || undefined };
  });
}

const ALERT_TEXT = ' (LET OP: > 25)';

function indent(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((l) => prefix + l)
    .join('\n');
}

/** Volledige platte e-mailtekst van het verslag. */
export function reportToText(report: Report): string {
  const out: string[] = [];
  out.push(report.title);
  out.push(...report.meta);
  for (const section of report.sections) {
    out.push('', '', section.title);
    if (section.subtitle) out.push(section.subtitle);
    for (const block of section.blocks) {
      if (block.title) out.push('', block.title);
      if (block.table) {
        for (const e of tableEntries(block.table)) {
          out.push(e.head, `    ${e.data.map((d, i) => d + (e.alert[i] ? ALERT_TEXT : '')).join('; ') || 'geen waarden'}`);
          if (e.note) out.push(`    ${e.noteLabel}: ${e.note.replace(/\n/g, '\n      ')}`);
        }
      }
      for (const row of block.rows) {
        switch (row.type) {
          case 'kv':
            if (row.value.includes('\n')) out.push(`${row.label}:`, indent(row.value, '  '));
            else out.push(`${row.label}: ${row.value}`);
            break;
          case 'para':
            if (row.label) out.push(`${row.label}:`);
            out.push(indent(row.text, row.label ? '  ' : ''));
            break;
          case 'sub':
            out.push(`  [${row.text}]`);
            break;
          case 'note':
            out.push(row.text);
            break;
        }
      }
    }
  }
  out.push('', '', '— Einde transportverslag —');
  return out.join('\n');
}

/** Opgemaakte tekst voor de RTF-uitvoer: alinea's met stukken vet/cursief/onderstreept. */
interface Span {
  text: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
}
type ParaKind = 'title' | 'section' | 'block' | 'normal' | 'indent' | 'rowhead' | 'sub' | 'end';
interface Para {
  kind: ParaKind;
  spans: Span[];
}

/**
 * Het verslag als opgemaakte alinea's: titel en sectiekoppen vet, subkoppen vet cursief, veldnamen cursief,
 * kopjes binnen een kaart onderstreept, meetmomenten met een vette kopregel. Koppen in gewone schrijfwijze.
 */
function reportToParas(report: Report): Para[] {
  const out: Para[] = [];
  const p = (kind: ParaKind, ...spans: Span[]) => out.push({ kind, spans });
  p('title', { text: report.title, b: true });
  report.meta.forEach((m, i) => p('normal', i === 0 ? { text: m, b: true } : { text: m, i: true }));
  for (const section of report.sections) {
    p('section', { text: section.title, b: true });
    if (section.subtitle) p('normal', { text: section.subtitle, i: true });
    for (const block of section.blocks) {
      if (block.title) p('block', { text: block.title, b: true, i: true });
      if (block.table) {
        for (const e of tableEntries(block.table)) {
          p('rowhead', { text: e.head, b: true });
          if (!e.data.length) p('indent', { text: 'geen waarden', i: true });
          else p('indent', ...e.data.flatMap((d, i): Span[] => [{ text: (i ? '; ' : '') + d }, ...(e.alert[i] ? [{ text: ALERT_TEXT, b: true }] : [])]));
          if (e.note) p('indent', { text: `${e.noteLabel}:`, i: true }, { text: ` ${e.note}` });
        }
      }
      for (const row of block.rows) {
        switch (row.type) {
          case 'kv':
            p('normal', { text: `${row.label}:`, i: true }, { text: row.value.includes('\n') ? `\n${row.value}` : ` ${row.value}` });
            break;
          case 'para':
            p('normal', ...(row.label ? [{ text: `${row.label}:`, i: true }, { text: `\n${row.text}` }] : [{ text: row.text }]));
            break;
          case 'sub':
            p('sub', { text: row.text, u: true });
            break;
          case 'note':
            p('normal', { text: row.text, i: true });
            break;
        }
      }
    }
  }
  p('end', { text: '— Einde transportverslag —', i: true });
  return out;
}

/** Tekst voor RTF: \, { en } escapen; niet-ASCII als \uN? (16-bits, met vervangteken). */
function rtfEscape(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === '\\' || ch === '{' || ch === '}') out += `\\${ch}`;
    else if (ch === '\n') out += '\\line ';
    else if (ch === '\t') out += '\\tab ';
    else if (c < 0x80) out += ch;
    else if (c <= 0xffff) out += `\\u${c > 0x7fff ? c - 0x10000 : c}?`;
    else {
      // Buiten het BMP: als UTF-16-surrogaatpaar.
      const hi = 0xd800 + ((c - 0x10000) >> 10);
      const lo = 0xdc00 + ((c - 0x10000) & 0x3ff);
      out += `\\u${hi - 0x10000}?\\u${lo - 0x10000}?`;
    }
  }
  return out;
}

/** Alinea-opmaak in RTF (afstanden in twips, lettergrootte in halve punten). */
const RTF_PARA: Record<ParaKind, string> = {
  title: '\\sb0\\sa80\\fs30',
  section: '\\sb320\\sa80\\fs26',
  block: '\\sb160\\sa40\\fs22',
  normal: '\\sb0\\sa40\\fs22',
  indent: '\\li360\\sb0\\sa40\\fs22',
  rowhead: '\\sb120\\sa0\\fs22',
  sub: '\\sb120\\sa40\\fs22',
  end: '\\sb320\\sa0\\fs22',
};

/** Het verslag als RTF-document (Rich Text Format) met dezelfde opmaak, bijv. om in het EPD te plakken of te importeren. */
export function reportToRtf(report: Report): string {
  const span = (s: Span) => `{${s.b ? '\\b' : ''}${s.i ? '\\i' : ''}${s.u ? '\\ul' : ''}${s.b || s.i || s.u ? ' ' : ''}${rtfEscape(s.text)}}`;
  const body = reportToParas(report)
    .map((p) => `{\\pard\\plain\\f0${RTF_PARA[p.kind]} ${p.spans.map(span).join('')}\\par}`)
    .join('\n');
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl{\\f0\\fswiss\\fcharset0 Calibri;}}\\viewkind4\n${body}\n}`;
}

export function emailSubject(report: Report): string {
  return `Transportverslag neonataal transport${report.meta[0] ? ` – ${report.meta[0]}` : ''}`;
}
