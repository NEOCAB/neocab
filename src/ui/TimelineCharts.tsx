import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import type { Instant, Measurement } from '../domain/types';
import { RESP_MODE_LABELS } from '../domain/labels';
import { TIMELINE_GROUP_LABELS, timelineTable, type TimelineColumn } from '../domain/timelineTable';
import { formatInstant } from '../domain/time';
import { formatNumber } from '../domain/num';

/**
 * Tijdlijn als grafiek: kleine grafieken naast elkaar, één per gemeten waarde (eigen eenheid, dus eigen y-as),
 * met een gedeelde tijd-as. Wijzen of met de pijltjestoetsen bladeren toont in alle grafieken hetzelfde meetmoment.
 * De svg wordt op de werkelijke breedte getekend, zodat tekst en lijnen hun echte grootte houden.
 */

const H = 120;
const PAD = { left: 38, right: 10, top: 8, bottom: 20 };
const PLOT_H = H - PAD.top - PAD.bottom;

interface Series {
  column: TimelineColumn;
  /** Waarde per meetmoment (null = niet ingevuld). */
  values: (number | null)[];
  alerts: boolean[];
}

interface Axis {
  times: number[];
  ats: Instant[];
  t0: number;
  t1: number;
}

const parse = (s: string): number | null => {
  if (s === '') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Nette y-as: streepjes op ronde stappen (1, 2, 2,5 of 5 × 10ⁿ), hooguit drie intervallen. */
function niceTicks(values: number[]): number[] {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) {
    const d = Math.abs(lo) * 0.1 || 1;
    lo -= d;
    hi += d;
  }
  const span = hi - lo;
  const base = 10 ** Math.floor(Math.log10(span));
  const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10].map((f) => f * base).find((u) => span / u <= 3) ?? base * 10;
  const ticks: number[] = [];
  for (let t = Math.floor(lo / step) * step; t <= Math.ceil(hi / step) * step + step / 1e6; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return ticks;
}

const fmt = (n: number) => formatNumber(Math.round(n * 100) / 100);
const hhmm = (at: Instant, timeZone: string) => formatInstant(at, timeZone).slice(11);

/** Werkelijke breedte van een element (volgt het scherm bij draaien of andere kolommen). */
function useWidth(ref: RefObject<HTMLElement | null>, fallback = 300): number {
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth || fallback);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width) || fallback));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, fallback]);
  return w;
}

function xScale(axis: Axis, width: number) {
  const plotW = width - PAD.left - PAD.right;
  return (t: number) => PAD.left + (axis.t1 === axis.t0 ? plotW / 2 : ((t - axis.t0) / (axis.t1 - axis.t0)) * plotW);
}

function SmallChart({
  series,
  axis,
  active,
  setActive,
  timeZone,
  onPick,
}: {
  series: Series;
  axis: Axis;
  active: number | null;
  setActive: (i: number | null) => void;
  timeZone: string;
  onPick?: (i: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const W = useWidth(ref);
  const x = xScale(axis, W);
  const { times, ats } = axis;
  const { column, values, alerts } = series;
  const present = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  const ticks = niceTicks(present.map((p) => p.v));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const y = (v: number) => PAD.top + PLOT_H - ((v - lo) / (hi - lo)) * PLOT_H;
  const path = present.map((p, k) => `${k ? 'L' : 'M'}${x(times[p.i]).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = present[present.length - 1];
  const shown = active !== null ? { v: values[active], i: active } : last;
  const threshold = column.key === 'oi' ? 25 : null;

  // Dichtstbijzijnde meetmoment bij de aanwijzer: de hele grafiek is het raakvlak, niet alleen de punten.
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let best = 0;
    times.forEach((t, i) => {
      if (Math.abs(x(t) - px) < Math.abs(x(times[best]) - px)) best = i;
    });
    setActive(best);
  };
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' && active !== null && onPick) {
      e.preventDefault();
      onPick(active);
      return;
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const cur = active ?? times.length - 1;
    setActive(Math.max(0, Math.min(times.length - 1, cur + (e.key === 'ArrowRight' ? 1 : -1))));
  };

  const summary = `${column.fullLabel}${column.unit ? ` (${column.unit})` : ''}: ${present.map((p) => `${hhmm(ats[p.i], timeZone)} ${fmt(p.v)}${alerts[p.i] ? ' (LET OP)' : ''}`).join(', ')}`;

  return (
    <figure className="chart-card" tabIndex={0} aria-label={summary} onKeyDown={onKey} onBlur={() => setActive(null)}>
      <figcaption className="chart-head">
        <span className="chart-title" title={column.fullLabel}>
          {column.label}
          {column.unit && <span className="chart-unit"> ({column.unit})</span>}
        </span>
        <span className={`chart-value ${shown && alerts[shown.i] ? 'alert' : ''}`} aria-hidden="true">
          {shown && shown.v !== null ? (
            <>
              {alerts[shown.i] && '▲ '}
              <strong>{fmt(shown.v)}</strong>
              <span className="chart-time"> · {hhmm(ats[shown.i], timeZone)}</span>
            </>
          ) : (
            <span className="chart-time">— · {shown ? hhmm(ats[shown.i], timeZone) : ''}</span>
          )}
        </span>
      </figcaption>
      <div ref={ref}>
        <svg width={W} height={H} className="chart-svg" aria-hidden="true" onPointerMove={onMove} onPointerLeave={() => setActive(null)} onClick={() => active !== null && onPick?.(active)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart-gridline" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="chart-tick" x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                {fmt(t)}
              </text>
            </g>
          ))}
          {threshold !== null && threshold > lo && threshold < hi && <line className="chart-threshold" x1={PAD.left} x2={W - PAD.right} y1={y(threshold)} y2={y(threshold)} />}
          <text className="chart-tick" x={PAD.left} y={H - 4}>
            {hhmm(ats[0], timeZone)}
          </text>
          {times.length > 1 && (
            <text className="chart-tick" x={W - PAD.right} y={H - 4} textAnchor="end">
              {hhmm(ats[ats.length - 1], timeZone)}
            </text>
          )}
          {active !== null && <line className="chart-crosshair" x1={x(times[active])} x2={x(times[active])} y1={PAD.top} y2={PAD.top + PLOT_H} />}
          {present.length > 1 && <path className="chart-line" d={path} />}
          {present.map((p) => (
            <circle key={p.i} className={`chart-dot ${alerts[p.i] ? 'alert' : ''}`} cx={x(times[p.i])} cy={y(p.v)} r={active === p.i ? 5.5 : 4} />
          ))}
        </svg>
      </div>
    </figure>
  );
}

/** Modaliteit per periode, als smalle band over de volle breedte boven de ademhalingsgrafieken. */
function ModeBand({ rows, axis, timeZone }: { rows: Measurement[]; axis: Axis; timeZone: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const W = useWidth(ref);
  const x = xScale(axis, W);
  const end = W - PAD.right;
  const segs = rows
    .map((m, i) => ({ mode: m.resp.mode, at: m.at, from: x(axis.times[i]), to: i + 1 < rows.length ? x(axis.times[i + 1]) : end }))
    .filter((s): s is typeof s & { mode: Exclude<Measurement['resp']['mode'], ''> } => s.mode !== '');
  if (segs.length === 0) return null;
  const label = segs.map((s) => `${RESP_MODE_LABELS[s.mode]} vanaf ${hhmm(s.at, timeZone)}`).join(', ');
  return (
    <figure className="chart-card chart-band" aria-label={`Modaliteit: ${label}`}>
      <figcaption className="chart-head">
        <span className="chart-title">Modaliteit</span>
      </figcaption>
      <div ref={ref}>
        <svg width={W} height={28} className="chart-svg" aria-hidden="true">
          {segs.map((s, i) => (
            <g key={i}>
              <rect className={`chart-mode ${i % 2 ? 'alt' : ''}`} x={s.from} y={3} width={Math.max(2, s.to - s.from - 2)} height={22} rx={2} />
              {s.to - s.from > 44 && (
                <text className="chart-mode-label" x={s.from + 6} y={14} dy="0.35em">
                  {RESP_MODE_LABELS[s.mode]}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </figure>
  );
}

export function TimelineCharts({ measurements, timeZone, onPick }: { measurements: Measurement[]; timeZone: string; onPick?: (m: Measurement) => void }) {
  const [active, setActive] = useState<number | null>(null);
  const { rows: all, columns } = useMemo(() => timelineTable(measurements, timeZone), [measurements, timeZone]);
  // Alleen meetmomenten met een tijdstip kunnen op de tijd-as.
  const rows = all.filter((m) => m.at);
  const times = rows.map((m) => Date.parse(m.at ?? ''));
  const axis: Axis = { times, ats: rows.map((m) => m.at), t0: Math.min(...times), t1: Math.max(...times) };

  const series: Series[] = columns
    .filter((c) => !c.key_column)
    .map((c) => ({ column: c, values: rows.map((m, i) => parse(c.cell(m, i))), alerts: rows.map((m) => c.alert?.(m) ?? false) }))
    .filter((s) => s.values.some((v) => v !== null));
  const groups = [...new Set(series.map((s) => s.column.group))];

  if (rows.length === 0) return null;
  return (
    <div className="timeline-charts">
      <p className="muted small-print">
        Eén grafiek per waarde, met dezelfde tijd-as. Wijs een punt aan (of gebruik de pijltjestoetsen) om in alle grafieken hetzelfde meetmoment te zien; tik of druk op Enter om dat meetmoment te
        bewerken.
      </p>
      {groups.map((g) => (
        <section key={g} className="chart-group" aria-label={TIMELINE_GROUP_LABELS[g]}>
          <h4 className="chart-group-title">{TIMELINE_GROUP_LABELS[g]}</h4>
          {g === 'ademhaling' && <ModeBand rows={rows} axis={axis} timeZone={timeZone} />}
          <div className="chart-grid">
            {series
              .filter((s) => s.column.group === g)
              .map((s) => (
                <SmallChart key={s.column.key} series={s} axis={axis} active={active} setActive={setActive} timeZone={timeZone} onPick={onPick ? (i) => onPick(rows[i]) : undefined} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
