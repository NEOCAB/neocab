import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import type { Instant, Measurement } from '../domain/types';
import { RESP_MODE_LABELS } from '../domain/labels';
import { TIMELINE_GROUP_LABELS, timelineTable, type TimelineColumn, type TimelineGroup } from '../domain/timelineTable';
import { formatInstant } from '../domain/time';
import { formatNumber } from '../domain/num';

/**
 * Tijdlijn als grafiek. Alle grafieken staan onder elkaar over de volle breedte, met dezelfde y-as-positie en
 * dezelfde tijd-as (werkelijke tijd), zodat een meetmoment in elke grafiek recht boven elkaar staat.
 * - Beademing: drukken (PIP, PEEP, MAP, PS, ΔP) en FiO₂ samen in één grafiek, VG als eigen strook eronder;
 * - Vitale functies: HF, AF, SpO₂ en bloeddruk samen in één grafiek;
 * - Bloedgas: één grafiek met per waarde een eigen strook (eigen schaal);
 * - overige waarden (bijv. frequentie, temperatuur, OI) als losse grafieken. iT wordt niet getoond.
 * Series in één grafiek hebben elk een vaste kleur én een eigen markeringsvorm; de legenda toont de waarden.
 * Wijzen of pijltjestoetsen tonen in alle grafieken hetzelfde meetmoment; tikken of Enter opent het om te bewerken.
 */

/** Categorisch palet (vaste volgorde; kleur hoort bij de waarde, niet bij de positie). Gevalideerd op kleurenblindheid. */
const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
type Shape = 'circle' | 'square' | 'triangle' | 'diamond' | 'down' | 'plus';
const SHAPES: Shape[] = ['circle', 'square', 'triangle', 'diamond', 'down', 'plus'];

const COMBINED: { key: string; group: TimelineGroup; title: string; overlay: string[]; lanes: string[] }[] = [
  { key: 'beademing', group: 'ademhaling', title: 'Beademing', overlay: ['resp.pip', 'resp.peep', 'resp.map', 'resp.ps', 'resp.amplitude', 'resp.fio2'], lanes: ['resp.vg'] },
  { key: 'vitaal', group: 'monitor', title: 'Vitale functies', overlay: ['mon.heartRate', 'mon.respRate', 'mon.spo2Pre', 'mon.spo2Post', 'mon.meanBp'], lanes: [] },
  { key: 'bloedgas', group: 'bloedgas', title: 'Bloedgas', overlay: [], lanes: ['gas.ph', 'gas.pco2', 'gas.po2', 'gas.hco3', 'gas.be', 'gas.lactate', 'gas.glucose', 'gas.hb'] },
];
/** Niet in de grafieken. */
const HIDDEN = new Set(['resp.ti']);

/** Zelfde marges voor alle grafieken: de y-as staat overal op dezelfde plek. */
const PAD = { left: 44, right: 12, top: 8, bottom: 20 };
const MAIN_H = 170;
const LANE_H = 46;
const SMALL_H = 100;

interface Series {
  column: TimelineColumn;
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
const fmt = (n: number) => formatNumber(Math.round(n * 100) / 100);
const hhmm = (at: Instant, timeZone: string) => formatInstant(at, timeZone).slice(11);
const present = (s: Series) => s.values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);

/** Nette as: ronde stappen (1, 2, 2,5 of 5 × 10ⁿ), hooguit `max` intervallen. */
function niceTicks(values: number[], max = 3): number[] {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) {
    const d = Math.abs(lo) * 0.1 || 1;
    lo -= d;
    hi += d;
  }
  const span = hi - lo;
  const base = 10 ** Math.floor(Math.log10(span));
  const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10].map((f) => f * base).find((u) => span / u <= max) ?? base * 10;
  const ticks: number[] = [];
  for (let t = Math.floor(lo / step) * step; t <= Math.ceil(hi / step) * step + step / 1e6; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return ticks;
}

function useWidth(ref: RefObject<HTMLElement | null>, fallback = 600): number {
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

/** Markering in een eigen vorm per serie (tweede kenmerk naast kleur). */
function Marker({ shape, x, y, r, color }: { shape: Shape; x: number; y: number; r: number; color: string }) {
  const p = { fill: color, className: 'chart-marker' };
  switch (shape) {
    case 'square':
      return <rect {...p} x={x - r * 0.9} y={y - r * 0.9} width={r * 1.8} height={r * 1.8} />;
    case 'triangle':
      return <path {...p} d={`M${x},${y - r * 1.15} L${x + r * 1.1},${y + r * 0.8} L${x - r * 1.1},${y + r * 0.8} Z`} />;
    case 'down':
      return <path {...p} d={`M${x},${y + r * 1.15} L${x + r * 1.1},${y - r * 0.8} L${x - r * 1.1},${y - r * 0.8} Z`} />;
    case 'diamond':
      return <path {...p} d={`M${x},${y - r * 1.25} L${x + r * 1.1},${y} L${x},${y + r * 1.25} L${x - r * 1.1},${y} Z`} />;
    case 'plus':
      return (
        <path {...p} d={`M${x - r * 0.4},${y - r * 1.2} h${r * 0.8} v${r * 0.8} h${r * 0.8} v${r * 0.8} h${-r * 0.8} v${r * 0.8} h${-r * 0.8} v${-r * 0.8} h${-r * 0.8} v${-r * 0.8} h${r * 0.8} Z`} />
      );
    default:
      return <circle {...p} cx={x} cy={y} r={r} />;
  }
}

/** Gedeelde aanwijs-/toetsenbordlogica: het hele vlak is het raakvlak, het dichtstbijzijnde meetmoment wordt gekozen. */
function useHover(axis: Axis, x: (t: number) => number, active: number | null, setActive: (i: number | null) => void, onPick?: (i: number) => void) {
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let best = 0;
    axis.times.forEach((t, i) => {
      if (Math.abs(x(t) - px) < Math.abs(x(axis.times[best]) - px)) best = i;
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
    const cur = active ?? axis.times.length - 1;
    setActive(Math.max(0, Math.min(axis.times.length - 1, cur + (e.key === 'ArrowRight' ? 1 : -1))));
  };
  return {
    svg: { onPointerMove: onMove, onPointerLeave: () => setActive(null), onClick: () => active !== null && onPick?.(active) },
    figure: { tabIndex: 0, onKeyDown: onKey, onBlur: () => setActive(null) },
  };
}

function TimeTicks({ axis, y, width, timeZone }: { axis: Axis; y: number; width: number; timeZone: string }) {
  return (
    <>
      <text className="chart-tick" x={PAD.left} y={y}>
        {hhmm(axis.ats[0], timeZone)}
      </text>
      {axis.times.length > 1 && (
        <text className="chart-tick" x={width - PAD.right} y={y} textAnchor="end">
          {hhmm(axis.ats[axis.ats.length - 1], timeZone)}
        </text>
      )}
    </>
  );
}

const describe = (s: Series, axis: Axis, timeZone: string) =>
  `${s.column.fullLabel}${s.column.unit ? ` (${s.column.unit})` : ''}: ${present(s)
    .map((p) => `${hhmm(axis.ats[p.i], timeZone)} ${fmt(p.v)}${s.alerts[p.i] ? ' (LET OP)' : ''}`)
    .join(', ')}`;

/** Waarde van een serie op het actieve meetmoment, anders de laatste waarde. */
function shownValue(s: Series, active: number | null): { v: number | null; i: number } | null {
  if (active !== null) return { v: s.values[active], i: active };
  const pts = present(s);
  return pts.length ? pts[pts.length - 1] : null;
}

function ChartHead({ title, right }: { title: ReactNode; right: ReactNode }) {
  return (
    <figcaption className="chart-head">
      <span className="chart-title">{title}</span>
      {right}
    </figcaption>
  );
}

const activeTime = (axis: Axis, active: number | null, timeZone: string) => <span className="chart-time">{active !== null ? hhmm(axis.ats[active], timeZone) : 'laatste waarden'}</span>;

/** Eén grafiek met meerdere series: overlay op één gedeelde as, plus optionele stroken met een eigen schaal. */
function CombinedChart({
  title,
  overlay,
  lanes,
  axis,
  active,
  setActive,
  timeZone,
  onPick,
}: {
  title: string;
  overlay: { series: Series; color: string; shape: Shape }[];
  lanes: Series[];
  axis: Axis;
  active: number | null;
  setActive: (i: number | null) => void;
  timeZone: string;
  onPick?: (i: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const W = useWidth(ref);
  const x = xScale(axis, W);
  const hover = useHover(axis, x, active, setActive, onPick);
  const mainH = overlay.length ? MAIN_H : 0;
  const H = PAD.top + mainH + lanes.length * LANE_H + PAD.bottom;

  const ticks = overlay.length
    ? niceTicks(
        overlay.flatMap((o) => present(o.series).map((p) => p.v)),
        4,
      )
    : [];
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const y = (v: number) => PAD.top + mainH - 4 - ((v - lo) / (hi - lo)) * (mainH - 8);

  const summary = `${title}. ${[...overlay.map((o) => o.series), ...lanes].map((s) => describe(s, axis, timeZone)).join('. ')}`;

  return (
    <figure className="chart-card chart-combined" aria-label={summary} {...hover.figure}>
      <ChartHead title={title} right={activeTime(axis, active, timeZone)} />
      {overlay.length > 0 && (
        <ul className="chart-legend" aria-hidden="true">
          {overlay.map((o) => {
            const sv = shownValue(o.series, active);
            return (
              <li key={o.series.column.key}>
                <svg width="22" height="12" className="legend-key">
                  <line x1="1" x2="21" y1="6" y2="6" stroke={o.color} strokeWidth="2" />
                  <Marker shape={o.shape} x={11} y={6} r={3.5} color={o.color} />
                </svg>
                <strong className="legend-value">{sv && sv.v !== null ? fmt(sv.v) : '—'}</strong>
                <span className="legend-label">
                  {o.series.column.label} <span className="chart-unit">{o.series.column.unit}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div ref={ref}>
        <svg width={W} height={H} className="chart-svg" aria-hidden="true" {...hover.svg}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart-gridline" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="chart-tick" x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                {fmt(t)}
              </text>
            </g>
          ))}
          {overlay.map((o) => {
            const pts = present(o.series);
            const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(axis.times[p.i]).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
            return (
              <g key={o.series.column.key}>
                {pts.length > 1 && <path className="chart-line" d={d} style={{ stroke: o.color }} />}
                {pts.map((p) => (
                  <Marker key={p.i} shape={o.shape} x={x(axis.times[p.i])} y={y(p.v)} r={active === p.i ? 5 : 3.75} color={o.color} />
                ))}
              </g>
            );
          })}
          {lanes.map((s, li) => {
            const top = PAD.top + mainH + li * LANE_H;
            const pts = present(s);
            const lt = niceTicks(
              pts.map((p) => p.v),
              1,
            );
            const llo = lt[0];
            const lhi = lt[lt.length - 1];
            const ly = (v: number) => top + LANE_H - 6 - ((v - llo) / (lhi - llo)) * (LANE_H - 22);
            const sv = shownValue(s, active);
            const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(axis.times[p.i]).toFixed(1)},${ly(p.v).toFixed(1)}`).join(' ');
            return (
              <g key={s.column.key}>
                <line className="chart-lane-sep" x1={PAD.left} x2={W - PAD.right} y1={top} y2={top} />
                <text className="chart-lane-label" x={PAD.left + 4} y={top + 12}>
                  {s.column.label}
                  {s.column.unit && <tspan className="chart-lane-unit"> {s.column.unit}</tspan>}
                </text>
                <text className="chart-lane-value" x={W - PAD.right} y={top + 12} textAnchor="end">
                  {sv && sv.v !== null ? fmt(sv.v) : '—'}
                </text>
                <text className="chart-tick" x={PAD.left - 6} y={ly(llo)} dy="0.32em" textAnchor="end">
                  {fmt(llo)}
                </text>
                <text className="chart-tick" x={PAD.left - 6} y={ly(lhi)} dy="0.32em" textAnchor="end">
                  {fmt(lhi)}
                </text>
                {pts.length > 1 && <path className="chart-line" d={d} />}
                {pts.map((p) => (
                  <circle key={p.i} className="chart-dot" cx={x(axis.times[p.i])} cy={ly(p.v)} r={active === p.i ? 4.5 : 3.25} />
                ))}
              </g>
            );
          })}
          <line className="chart-axis" x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom} />
          {active !== null && <line className="chart-crosshair" x1={x(axis.times[active])} x2={x(axis.times[active])} y1={PAD.top} y2={H - PAD.bottom} />}
          <TimeTicks axis={axis} y={H - 4} width={W} timeZone={timeZone} />
        </svg>
      </div>
    </figure>
  );
}

/** Losse grafiek voor één waarde. */
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
  const hover = useHover(axis, x, active, setActive, onPick);
  const { column, alerts } = series;
  const pts = present(series);
  const ticks = niceTicks(pts.map((p) => p.v));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const plotH = SMALL_H - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH;
  const sv = shownValue(series, active);
  const threshold = column.key === 'oi' ? 25 : null;
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(axis.times[p.i]).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');

  return (
    <figure className="chart-card" aria-label={describe(series, axis, timeZone)} {...hover.figure}>
      <ChartHead
        title={
          <span title={column.fullLabel}>
            {column.label}
            {column.unit && <span className="chart-unit"> ({column.unit})</span>}
          </span>
        }
        right={
          <span className={`chart-value ${sv && alerts[sv.i] ? 'alert' : ''}`} aria-hidden="true">
            {sv && sv.v !== null ? (
              <>
                {alerts[sv.i] && '▲ '}
                <strong>{fmt(sv.v)}</strong>
                <span className="chart-time"> · {hhmm(axis.ats[sv.i], timeZone)}</span>
              </>
            ) : (
              <span className="chart-time">— · {sv ? hhmm(axis.ats[sv.i], timeZone) : ''}</span>
            )}
          </span>
        }
      />
      <div ref={ref}>
        <svg width={W} height={SMALL_H} className="chart-svg" aria-hidden="true" {...hover.svg}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart-gridline" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="chart-tick" x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                {fmt(t)}
              </text>
            </g>
          ))}
          {threshold !== null && threshold > lo && threshold < hi && <line className="chart-threshold" x1={PAD.left} x2={W - PAD.right} y1={y(threshold)} y2={y(threshold)} />}
          <line className="chart-axis" x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + plotH} />
          <TimeTicks axis={axis} y={SMALL_H - 4} width={W} timeZone={timeZone} />
          {active !== null && <line className="chart-crosshair" x1={x(axis.times[active])} x2={x(axis.times[active])} y1={PAD.top} y2={PAD.top + plotH} />}
          {pts.length > 1 && <path className="chart-line" d={d} />}
          {pts.map((p) => (
            <circle key={p.i} className={`chart-dot ${alerts[p.i] ? 'alert' : ''}`} cx={x(axis.times[p.i])} cy={y(p.v)} r={active === p.i ? 5.5 : 4} />
          ))}
        </svg>
      </div>
    </figure>
  );
}

/** Modaliteit per periode, als smalle band over de volle breedte. */
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
  if (rows.length === 0) return null;
  const times = rows.map((m) => Date.parse(m.at ?? ''));
  const axis: Axis = { times, ats: rows.map((m) => m.at), t0: Math.min(...times), t1: Math.max(...times) };
  const pick = onPick ? (i: number) => onPick(rows[i]) : undefined;

  const series = new Map(
    columns
      .filter((c) => !c.key_column && !HIDDEN.has(c.key))
      .map((c) => [c.key, { column: c, values: rows.map((m, i) => parse(c.cell(m, i))), alerts: rows.map((m) => c.alert?.(m) ?? false) }] as const)
      .filter(([, s]) => s.values.some((v) => v !== null)),
  );
  const inCombined = new Set(COMBINED.flatMap((c) => [...c.overlay, ...c.lanes]));
  const groups = [...new Set([...series.values()].map((s) => s.column.group))];
  const common = { axis, active, setActive, timeZone, onPick: pick };

  return (
    <div className="timeline-charts">
      <p className="muted small-print">Wijs een punt aan (of gebruik de pijltjestoetsen) om in alle grafieken hetzelfde meetmoment te zien; tik of druk op Enter om dat meetmoment te bewerken.</p>
      {groups.map((g) => {
        const combined = COMBINED.filter((c) => c.group === g)
          .map((c) => ({
            ...c,
            overlay: c.overlay.map((k, i) => ({ series: series.get(k), color: SERIES_COLORS[i], shape: SHAPES[i] })).filter((o): o is { series: Series; color: string; shape: Shape } => !!o.series),
            lanes: c.lanes.map((k) => series.get(k)).filter((s): s is Series => !!s),
          }))
          .filter((c) => c.overlay.length + c.lanes.length > 0);
        const singles = [...series.values()].filter((s) => s.column.group === g && !inCombined.has(s.column.key));
        return (
          <section key={g} className="chart-group" aria-label={TIMELINE_GROUP_LABELS[g]}>
            <h4 className="chart-group-title">{TIMELINE_GROUP_LABELS[g]}</h4>
            {g === 'ademhaling' && <ModeBand rows={rows} axis={axis} timeZone={timeZone} />}
            {combined.map((c) => (
              <CombinedChart key={c.key} title={c.title} overlay={c.overlay} lanes={c.lanes} {...common} />
            ))}
            {singles.map((s) => (
              <SmallChart key={s.column.key} series={s} {...common} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
