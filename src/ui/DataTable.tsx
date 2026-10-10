import type { ReactNode } from 'react';
import type { ReportTable } from '../report/buildReport';

/** Tijdstempel uit de tabel ("dd-mm-jjjj\nuu:mm"): tijd groot, datum klein eronder. */
export function TimeStamp({ value }: { value: string }) {
  const [date, time] = value.includes('\n') ? value.split('\n') : ['', value];
  return (
    <span className="ts">
      <span className="ts-time">{time}</span>
      {date && <span className="ts-date">{date}</span>}
    </span>
  );
}

const NUMERIC = /^-?\d+(,\d+)?$/;

/**
 * Tabel met per rij één record (meetmoment). Bovenste kopregel = kolomgroepen, met een duidelijke
 * scheidingslijn tussen groepen. Getallen rechts uitgelijnd. Breed: scrollt horizontaal binnen de eigen
 * container; de tijdkolom blijft staan.
 */
export function DataTable({
  table,
  caption,
  renderKeyCell,
  rowClassName,
}: {
  table: ReportTable;
  caption: string;
  /** Vervangt de inhoud van de eerste kolom (bijv. een bewerkknop). */
  renderKeyCell?: (rowIndex: number, value: string) => ReactNode;
  rowClassName?: (rowIndex: number) => string;
}) {
  const cols = table.columns;
  const groupStart = cols.map((c, i) => i > 0 && c.group !== cols[i - 1].group);
  // Kolom met alleen getallen (of leeg) wordt rechts uitgelijnd.
  const numeric = cols.map((c, i) => !c.keyColumn && table.rows.every((r) => r[i] === '' || NUMERIC.test(r[i])));
  const spans: { group: string; span: number }[] = [];
  for (const c of cols) {
    const last = spans[spans.length - 1];
    if (last && last.group === c.group) last.span++;
    else spans.push({ group: c.group, span: 1 });
  }
  const cls = (i: number, extra = '') => [`col-${i}`, groupStart[i] ? 'gstart' : '', numeric[i] ? 'num' : '', extra].filter(Boolean).join(' ');
  return (
    <div className="table-scroll" role="region" aria-label={caption} tabIndex={0}>
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="group-row">
            {spans.map((s, i) => (
              <th key={i} colSpan={s.span} scope="colgroup" className={i === 0 ? 'sticky-group' : 'gstart'}>
                {s.group}
              </th>
            ))}
          </tr>
          <tr className="head-row">
            {cols.map((c, i) => (
              <th key={i} scope="col" className={cls(i, c.keyColumn ? 'key' : '')} title={c.fullLabel}>
                <span className="th-label">{c.header}</span>
                {c.unit && <span className="th-unit">{c.unit}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r} className={rowClassName?.(r)}>
              {row.map((v, i) => {
                const alert = table.alerts?.[r]?.[i] ?? false;
                if (i === 0)
                  return (
                    <th key={i} scope="row" className={cls(i, 'key')}>
                      {renderKeyCell ? renderKeyCell(r, v) : <TimeStamp value={v} />}
                    </th>
                  );
                return (
                  <td key={i} className={cls(i, [v === 'onbekend' ? 'unknown' : '', alert ? 'alert' : ''].filter(Boolean).join(' '))}>
                    {alert ? (
                      <>
                        <span aria-hidden="true">▲ </span>
                        {v}
                        <span className="sr-only"> (alert: boven drempel)</span>
                      </>
                    ) : (
                      v
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
