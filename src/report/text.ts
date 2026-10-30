import type { Report, ReportTable } from './buildReport';

/**
 * Het verslag als e-mailtekst, in twee vormen met dezelfde inhoud:
 * - opgemaakte tekst (HTML met vet, cursief en onderstreept) voor het klembord, zodat plakken in een mailprogramma,
 *   tekstverwerker of EPD de opmaak behoudt (zoals RTF);
 * - platte tekst als terugval (mailto-link, programma's zonder opmaak).
 * Koppen zijn vet en in gewone schrijfwijze (geen hoofdletters, geen streep eronder). Niets wordt ingekort.
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

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Tekst met regelafbrekingen als HTML. */
const lines = (s: string) => esc(s).replace(/\n/g, '<br>');

const P = 'margin:0 0 2pt 0';
const STYLE = {
  doc: 'font-family:Calibri,Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.35;color:#000',
  title: 'margin:0 0 4pt 0;font-size:15pt',
  section: 'margin:16pt 0 4pt 0;font-size:13pt',
  block: 'margin:8pt 0 2pt 0;font-size:11pt',
  indent: 'margin:0 0 2pt 18pt',
};

/**
 * Opgemaakte e-mailtekst (HTML met inline-opmaak, zodat die ook na plakken in Outlook, Word of een EPD blijft staan):
 * titel en sectiekoppen vet, subkoppen vet cursief, veldnamen cursief, kopjes binnen een kaart onderstreept.
 */
export function reportToHtml(report: Report): string {
  const out: string[] = [];
  const p = (html: string, style = P) => out.push(`<p style="${style}">${html}</p>`);
  p(`<b>${esc(report.title)}</b>`, STYLE.title);
  report.meta.forEach((m, i) => p(i === 0 ? `<b>${esc(m)}</b>` : `<i>${esc(m)}</i>`));
  for (const section of report.sections) {
    p(`<b>${esc(section.title)}</b>`, STYLE.section);
    if (section.subtitle) p(`<i>${esc(section.subtitle)}</i>`);
    for (const block of section.blocks) {
      if (block.title) p(`<b><i>${esc(block.title)}</i></b>`, STYLE.block);
      if (block.table) {
        for (const e of tableEntries(block.table)) {
          p(`<b>${esc(e.head)}</b>`, 'margin:6pt 0 0 0');
          p(e.data.length ? e.data.map((d, i) => esc(d) + (e.alert[i] ? `<b>${esc(ALERT_TEXT)}</b>` : '')).join('; ') : '<i>geen waarden</i>', STYLE.indent);
          if (e.note) p(`<i>${esc(e.noteLabel)}:</i> ${lines(e.note)}`, STYLE.indent);
        }
      }
      for (const row of block.rows) {
        switch (row.type) {
          case 'kv':
            p(row.value.includes('\n') ? `<i>${esc(row.label)}:</i><br>${lines(row.value)}` : `<i>${esc(row.label)}:</i> ${esc(row.value)}`);
            break;
          case 'para':
            p(row.label ? `<i>${esc(row.label)}:</i><br>${lines(row.text)}` : lines(row.text));
            break;
          case 'sub':
            p(`<u>${esc(row.text)}</u>`, 'margin:6pt 0 2pt 0');
            break;
          case 'note':
            p(`<i>${esc(row.text)}</i>`);
            break;
        }
      }
    }
  }
  p('<i>— Einde transportverslag —</i>', 'margin:16pt 0 0 0');
  return `<div style="${STYLE.doc}">${out.join('')}</div>`;
}

export function emailSubject(report: Report): string {
  return `Transportverslag neonataal transport${report.meta[0] ? ` – ${report.meta[0]}` : ''}`;
}
