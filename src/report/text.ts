import type { Report, ReportTable } from './buildReport';

/** Tabel als tekst: één regel per rij (bijv. per meetmoment), lege cellen weggelaten. */
function tableToText(table: ReportTable): string[] {
  const out: string[] = [];
  table.rows.forEach((row, r) => {
    const key: string[] = [];
    const data: string[] = [];
    table.columns.forEach((c, i) => {
      const v = (row[i] ?? '').replace(/\n/g, ' ');
      if (!v) return;
      if (c.keyColumn) key.push(v);
      else data.push(`${c.fullLabel}: ${v}${c.unit ? ` ${c.unit}` : ''}`);
    });
    out.push(`Meetmoment ${r + 1} · ${key.join(' · ')}`, `    ${data.join('; ') || 'geen waarden'}`);
  });
  return out;
}

function indent(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((l) => prefix + l)
    .join('\n');
}

/** Volledige platte e-mailtekst van het verslag. Niets wordt ingekort. */
export function reportToText(report: Report): string {
  const out: string[] = [];
  out.push(report.title.toUpperCase());
  out.push('='.repeat(report.title.length));
  out.push(...report.meta);
  for (const section of report.sections) {
    out.push('', '', section.title.toUpperCase(), '-'.repeat(Math.min(section.title.length, 72)));
    for (const block of section.blocks) {
      if (block.title) out.push('', `» ${block.title}`);
      if (block.table) out.push(...tableToText(block.table));
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

export function emailSubject(report: Report): string {
  return `Transportverslag neonataal transport${report.meta[0] ? ` – ${report.meta[0]}` : ''}`;
}
