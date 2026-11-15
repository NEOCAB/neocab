import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Transport } from '../domain/types';
import { FLOW_STEPS, flowBase, flowDoneCount, flowNextIndex, instantWithClock } from '../domain/flow';
import { calendarDaysBetween, formatLocalDate, instantToWall, nowInstant } from '../domain/time';
import { useTimeZone } from './context';
import { TimeTextInput } from './fields';
import type { Update } from './sections/BasicSections';

/** Huidige kloktijd (uu:mm), elke 15 seconden bijgewerkt. */
function useClock(tz: string): string {
  const read = () => instantToWall(nowInstant(tz), tz).slice(11, 16);
  const [clock, setClock] = useState(read);
  useEffect(() => {
    const h = window.setInterval(() => setClock(read()), 15_000);
    return () => window.clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tz]);
  return clock;
}

const weekdayDate = (base: string) => {
  if (!base) return '';
  const wd = new Date(`${base}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'long', timeZone: 'UTC' });
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${formatLocalDate(base)}`;
};

interface FlowProps {
  t: Transport;
  update: Update;
}

/** Zes rijen: nummer, naam, tijd (invulbaar) en Nu. Bij de volgende stap staat `nuNode` (grote Nu-knop met de tijd). */
function FlowRows({ t, update, nuNode }: FlowProps & { nuNode?: ReactNode }) {
  const tz = useTimeZone();
  const next = flowNextIndex(t);
  const base = flowBase(t, tz);
  return (
    <div className="flow-rows">
      {FLOW_STEPS.map((s, i) => {
        const v = s.get(t);
        const wall = instantToWall(v, tz);
        const rel = base && wall ? calendarDaysBetween(base, wall.slice(0, 10)) : null;
        const isNext = i === next;
        return (
          <div key={s.n} className={`flow-row ${isNext ? 'cur' : ''} ${v ? 'done' : ''}`} data-step={s.n}>
            <span className="flow-st" aria-hidden="true">
              {s.n}
            </span>
            <span className="flow-label">{s.label}</span>
            <TimeTextInput
              className="flow-time"
              label={`Overzicht: ${s.label}, tijd`}
              value={wall ? wall.slice(11, 16) : ''}
              onChange={(hm) => update((x) => s.set(x, hm === '' ? null : instantWithClock(s.get(x), hm, tz)))}
            />
            {rel !== null && rel !== 0 && <span className="flow-rel">{`${rel > 0 ? '+' : '−'}${Math.abs(rel)} dag${Math.abs(rel) === 1 ? '' : 'en'}`}</span>}
            {isNext ? (
              <span className="flow-nu-slot">{nuNode}</span>
            ) : (
              !v && (
                <button type="button" className="flow-nu small" aria-label={`Overzicht: ${s.label} op nu zetten`} onClick={() => update((x) => s.set(x, nowInstant(tz)))}>
                  Nu
                </button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Pc: vast paneel in de zijbalk, altijd open, met Nu bij de volgende stap. */
export function FlowPanel({ t, update }: FlowProps) {
  const tz = useTimeZone();
  const clock = useClock(tz);
  const next = flowNextIndex(t);
  const base = flowBase(t, tz);
  const nuNode =
    next >= 0 ? (
      <button type="button" className="flow-nu" aria-label={`Overzicht: ${FLOW_STEPS[next].label} op nu zetten`} title={`Nu · ${clock}`} onClick={() => update((x) => FLOW_STEPS[next].set(x, nowInstant(tz)))}>
        Nu
      </button>
    ) : null;
  return (
    <section className="flow-panel" aria-label="Transportverloop">
      <h2 className="flow-title">Transportverloop</h2>
      {base && <p className="flow-base">{weekdayDate(base)}</p>}
      <FlowRows t={t} update={update} nuNode={nuNode} />
    </section>
  );
}

/** Telefoon: blauwe balk onderaan met de volgende stap en Nu; uitklappen toont alle zes (invulbaar), de Nu-knop beweegt naar zijn rij. */
export function FlowBar({ t, update }: FlowProps) {
  const tz = useTimeZone();
  const clock = useClock(tz);
  const [open, setOpen] = useState(false);
  const next = flowNextIndex(t);
  const done = flowDoneCount(t);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const fromRect = useRef<DOMRect | null>(null);

  const toggle = () => {
    fromRect.current = btnRef.current?.getBoundingClientRect() ?? null;
    setOpen((o) => !o);
  };

  // De Nu-knop staat dicht in de balk en open in zijn eigen rij; bij het wisselen schuift hij soepel naar de nieuwe plek.
  useLayoutEffect(() => {
    const from = fromRect.current;
    const el = btnRef.current;
    fromRect.current = null;
    if (!from || !el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const to = el.getBoundingClientRect();
    el.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: 'none' }], { duration: 340, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && toggle();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const nuNode =
    next >= 0 ? (
      <button
        ref={btnRef}
        type="button"
        className="flow-nu"
        aria-label={`Overzicht: ${FLOW_STEPS[next].label} op nu zetten`}
        onClick={() => update((x) => FLOW_STEPS[next].set(x, nowInstant(tz)))}
      >
        Nu · {clock}
      </button>
    ) : null;

  return (
    <div className={`flow-bar-wrap ${open ? 'open' : ''}`}>
      {open && (
        <section id="flow-sheet" className="flow-sheet" aria-label="Transportverloop, alle tijden">
          <h2 className="flow-title">Transportverloop</h2>
          <FlowRows t={t} update={update} nuNode={nuNode} />
        </section>
      )}
      <div className="flow-bar" role="group" aria-label="Volgende stap">
        <span className="flow-count">{done}/6</span>
        <span className="flow-next">{next >= 0 ? <>Volgende: <b>{FLOW_STEPS[next].label}</b></> : 'Alle tijden ingevuld'}</span>
        {!open && nuNode}
        <button type="button" className="flow-toggle" aria-expanded={open} aria-controls="flow-sheet" aria-label={open ? 'Transportverloop inklappen' : 'Transportverloop uitklappen'} onClick={toggle}>
          <span aria-hidden="true">{open ? '▾' : '▴'}</span>
        </button>
      </div>
    </div>
  );
}
