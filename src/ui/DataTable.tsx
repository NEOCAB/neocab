import type { ReactNode } from 'react';
import type { ReportTable } from '../report/buildReport';

/**
 * Tabel met per rij één record (meetmoment). Bovenste kopregel = kolomgroepen.
 * Breed: scrollt horizontaal binnen de eigen container, de eerste kolommen blijven staan.
 */
export function DataTable({
  table,
  caption,
  rotatedHeaders = false,
  renderKeyCell,
  rowClassName,
}: {
  table: ReportTable;
  caption: string;
  rotatedHeaders?: boolean;
  /** Vervangt de inhoud van de eerste kolom (bijv. een bewerkknop). */
  renderKeyCell?: (rowIndex: number, value: string) => ReactNode;
  rowClassName?: (rowIndex: number) => string;
}) {
  const spans: { group: string; span: number }[] = [];
  for (const c of table.columns) {
    const last = spans[spans.length - 1];
    if (last && last.group === c.group) last.span++;
    else spans.push({ group: c.group, span: 1 });
  }
  return (
    <div className="table-scroll" role="region" aria-label={caption} tabIndex={0}>
      <table className={`data-table ${rotatedHeaders ? 'rotated' : ''}`}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="group-row">
            {spans.map((s, i) => (
              <th key={i} colSpan={s.span} scope="colgroup" className={i === 0 ? 'sticky-group' : ''}>
                {s.group}
              </th>
            ))}
          </tr>
          <tr>
            {table.columns.map((c, i) => (
              <th key={i} scope="col" className={`${c.keyColumn ? 'key' : 'data'} col-${i}`} title={c.fullLabel}>
                <span className="th-text">
                  {c.header}
                  {c.unit && <span className="unit-head"> ({c.unit})</span>}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r} className={rowClassName?.(r)}>
              {row.map((v, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className="key col-0">
                    {renderKeyCell ? renderKeyCell(r, v) : v}
                  </th>
                ) : (
                  <td key={i} className={`${table.columns[i].keyColumn ? 'key' : ''} col-${i} ${v === 'onbekend' ? 'unknown' : ''} ${table.alerts?.[r]?.[i] ? 'alert' : ''}`}>
                    {table.alerts?.[r]?.[i] ? (
                      <>
                        <span aria-hidden="true">▲ </span>
                        {v}
                        <span className="sr-only"> (alert: boven drempel)</span>
                      </>
                    ) : (
                      v
                    )}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
