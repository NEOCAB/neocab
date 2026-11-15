import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Instant, LocalDate, Num } from '../domain/types';
import { numToInput, parseNum, type NumRules } from '../domain/num';
import { gestationToInput, parseGestation } from '../domain/calc';
import { calendarDaysBetween, formatLocalDate, instantToWall, isValidLocalDate, localDateOfMs, nowInstant, parseClockTime, parseDateText, todayLocalDate, wallToInstant } from '../domain/time';
import { useTimeZone } from './context';
import { chem } from './chem';
import { CalendarIcon, DeleteIcon, EditIcon } from './icons';
import { AddIcon, ExpandIcon, SectionIcon, TimepointIcon } from './icons';

function FieldShell({ id, label, hint, error, notice, children, className, labelSuffix }: { id: string; label: ReactNode; hint?: ReactNode; error?: string | null; notice?: string | null; children: ReactNode; className?: string; labelSuffix?: ReactNode }) {
  return (
    <div className={`field ${className ?? ''} ${error ? 'has-error' : ''}`}>
      <label htmlFor={id} className="field-label">
        {chem(label)}
        {labelSuffix}
      </label>
      {children}
      {hint && (
        <div className="field-hint" id={`${id}-hint`}>
          {hint}
        </div>
      )}
      {notice && !error && (
        <div className="field-notice" id={`${id}-error`} role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="field-error" id={`${id}-error`} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

function describedBy(id: string, hint?: unknown, error?: unknown) {
  return [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
}

export function TextField({ label, value, onChange, type = 'text', list, hint, placeholder, autoComplete, className, inputMode, disabled }: { label: ReactNode; value: string; onChange: (v: string) => void; type?: 'text' | 'tel'; list?: string[]; hint?: ReactNode; placeholder?: string; autoComplete?: string; className?: string; inputMode?: 'text' | 'tel' | 'numeric'; disabled?: boolean }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} className={className}>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete ?? 'off'}
        list={list ? `${id}-list` : undefined}
        aria-describedby={describedBy(id, hint)}
        onChange={(e) => onChange(e.target.value)}
      />
      {list && (
        <datalist id={`${id}-list`}>
          {list.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </FieldShell>
  );
}

export function TextArea({ label, value, onChange, hint, rows = 3, className, placeholder }: { label: ReactNode; value: string; onChange: (v: string) => void; hint?: ReactNode; rows?: number; className?: string; placeholder?: string }) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  // Groeit mee met de tekst; ook opnieuw bij een andere breedte (bijv. draaien van het scherm).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [value]);
  return (
    <FieldShell id={id} label={label} hint={hint} className={className}>
      <textarea id={id} ref={ref} rows={rows} value={value} placeholder={placeholder} aria-describedby={describedBy(id, hint)} onChange={(e) => onChange(e.target.value)} />
    </FieldShell>
  );
}

export interface NumberFieldProps {
  label: ReactNode;
  value: Num;
  onChange: (v: Num) => void;
  unit?: string;
  rules?: NumRules;
  hint?: ReactNode;
  className?: string;
}

/**
 * Numeriek veld: komma of punt, eenheid zichtbaar. Leeg = `null` (nooit automatisch 0).
 * Ongeldige invoer wordt niet doorgegeven en blijft zichtbaar met een foutmelding.
 */
export function NumberField({ label, value, onChange, unit, rules, hint, className }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(numToInput(value));
  const [error, setError] = useState<string | null>(null);
  /** Rustige grijze melding bij een ongebruikelijke waarde; de waarde wordt wel vastgelegd. */
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // Synchroniseer bij externe wijziging (bijv. ander record), niet tijdens typen van gelijke waarde.
    const parsed = parseNum(text, rules);
    if (!((parsed.ok && parsed.value === value) || (!parsed.ok && parsed.soft && parsed.value === value))) {
      setText(numToInput(value));
      setError(null);
      setNotice(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const allowNegative = rules?.min === undefined && !rules?.positive;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} notice={notice} className={`num-field ${className ?? ''}`}>
      <div className="num-input-wrap">
        <input
          id={id}
          type="text"
          inputMode={allowNegative ? 'text' : 'decimal'}
          autoComplete="off"
          enterKeyHint="next"
          value={text}
          // Oudere concepten kunnen nog "onbekend" bevatten.
          placeholder={value === 'onbekend' ? 'onbekend' : ''}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error || notice)}
          onChange={(e) => {
            setText(e.target.value);
            const r = parseNum(e.target.value, rules);
            if (r.ok) {
              setError(null);
              setNotice(null);
              onChange(r.value);
            } else if (r.soft) {
              setError(null);
              setNotice(r.error);
              onChange(r.value ?? null);
            } else {
              setNotice(null);
              setError(r.error);
            }
          }}
        />
        {unit && (
          <span className="unit" aria-hidden="true">
            {chem(unit)}
          </span>
        )}
      </div>
      {unit && <span className="sr-only">Eenheid: {unit}</span>}
    </FieldShell>
  );
}

/** Amenorroeduur als één waarde `weken+dagen` (bijv. 33+5). Controle bij verlaten van het veld. */
export function GestationField({ label, weeks, days, onChange }: { label: ReactNode; weeks: Num; days: Num; onChange: (weeks: Num, days: Num) => void }) {
  const id = useId();
  const [text, setText] = useState(gestationToInput(weeks, days));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const p = parseGestation(text);
    if (!(p.ok && p.weeks === weeks && p.days === days)) setText(gestationToInput(weeks, days));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks, days]);
  return (
    <FieldShell id={id} label={label} error={error} className="num-field gestation-field">
      <div className="num-input-wrap">
        <input
          id={id}
          type="text"
          inputMode="text"
          autoComplete="off"
          placeholder="bijv. 33+5"
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, undefined, error)}
          onChange={(e) => {
            setText(e.target.value);
            const p = parseGestation(e.target.value);
            if (p.ok) {
              setError(null);
              onChange(p.weeks, p.days);
            }
          }}
          onBlur={(e) => {
            const p = parseGestation(e.target.value);
            if (!p.ok) return setError(p.error);
            setError(null);
            setText(gestationToInput(p.weeks, p.days));
          }}
        />
        <span className="unit" aria-hidden="true">
          wk+d
        </span>
      </div>
    </FieldShell>
  );
}

export function SelectField<T extends string>({ label, value, onChange, options, hint, emptyLabel = '— niet ingevuld —', className }: { label: ReactNode; value: T | ''; onChange: (v: T | '') => void; options: { value: T; label: string }[]; hint?: ReactNode; emptyLabel?: string | null; className?: string }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} className={className}>
      <select id={id} value={value} aria-describedby={describedBy(id, hint)} onChange={(e) => onChange(e.target.value as T | '')}>
        {emptyLabel !== null && <option value="">{emptyLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

/** Keuzerondjes als segmentknoppen (toetsenbord: pijltjestoetsen). */
/**
 * Keuzeknoppen (één keuze). Nogmaals tikken op de gekozen optie wist de keuze (er is geen knop Wissen);
 * met `allowClear={false}` blijft een keuze altijd staan.
 */
export function Segmented<T extends string>({ legend, value, onChange, options, allowClear = true, className, name }: { legend: ReactNode; value: T | ''; onChange: (v: T | '') => void; options: { value: T; label: string }[]; allowClear?: boolean; className?: string; name?: string }) {
  const autoName = useId();
  return (
    <fieldset className={`segmented ${className ?? ''}`}>
      <legend className="field-label">{chem(legend)}</legend>
      <div className="segmented-options">
        {options.map((o) => (
          <label key={o.value} className={`seg ${value === o.value ? 'checked' : ''}`}>
            <input type="radio" name={name ?? autoName} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} onClick={allowClear && value === o.value ? () => onChange('') : undefined} />
            <span>{chem(o.label)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Datum + tijd in de gekozen tijdzone, opgeslagen als tijdstip met offset.
 * Knop "Nu" vult de huidige tijd in (ook over een bestaande tijd heen); "Wissen" maakt het veld leeg.
 * Een leeg veld blijft leeg tot de gebruiker een tijd invoert of "Nu" kiest.
 */
/** Datum als tekst (dd-mm-jjjj), onafhankelijk van de taalinstelling van de browser. Waarde: `jjjj-mm-dd` of leeg. */
function DateTextInput({ value, onChange, id, label, autoFocus, className, onInvalid, onKeyDown, onBlurDone }: { value: LocalDate; onChange: (v: LocalDate) => void; id?: string; label?: string; autoFocus?: boolean; className?: string; onInvalid?: (message: string | null) => void; onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void; onBlurDone?: () => void }) {
  const [text, setText] = useState(formatLocalDate(value));
  useEffect(() => {
    const parsed = parseDateText(text);
    if (!(parsed === value || (text.trim() === '' && value === ''))) setText(formatLocalDate(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const bad = text.trim() !== '' && parseDateText(text) === null;
  return (
    <input
      id={id}
      className={className}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      autoFocus={autoFocus}
      placeholder="dd-mm-jjjj"
      aria-label={label}
      aria-invalid={bad ? true : undefined}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const d = parseDateText(e.target.value);
        if (d) {
          onInvalid?.(null);
          onChange(d);
        } else if (e.target.value.trim() === '') {
          onInvalid?.(null);
          onChange('');
        }
      }}
      onKeyDown={onKeyDown}
      onBlur={() => {
        const d = parseDateText(text);
        if (d) {
          setText(formatLocalDate(d));
          onInvalid?.(null);
        } else if (text.trim() !== '') onInvalid?.('Voer de datum in als dd-mm-jjjj, bijvoorbeeld 15-11-2026.');
        onBlurDone?.();
      }}
    />
  );
}

/** Tijd als tekst (uu:mm, 24-uurs); typen als 2235 of 22:35. Waarde: `HH:MM` of leeg. */
function TimeTextInput({ value, onChange, id, label, className, onInvalid }: { value: string; onChange: (v: string) => void; id?: string; label?: string; className?: string; onInvalid?: (message: string | null) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => {
    if (!(parseClockTime(text) === value || (text.trim() === '' && value === ''))) setText(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const bad = text.trim() !== '' && parseClockTime(text) === null;
  return (
    <input
      id={id}
      className={className}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="uu:mm"
      aria-label={label}
      aria-invalid={bad ? true : undefined}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const hm = parseClockTime(e.target.value);
        if (hm && e.target.value.replace(/\D/g, '').length >= 3) {
          onInvalid?.(null);
          onChange(hm);
        } else if (e.target.value.trim() === '') {
          onInvalid?.(null);
          onChange('');
        }
      }}
      onBlur={() => {
        const hm = parseClockTime(text);
        if (hm) {
          setText(hm);
          onChange(hm);
          onInvalid?.(null);
        } else if (text.trim() !== '') onInvalid?.('Voer de tijd in als 22:35 (of 2235).');
      }}
    />
  );
}

export function DateTimeField({ label, value, onChange, hint, className, clearable = true }: { label: ReactNode; value: Instant; onChange: (v: Instant) => void; hint?: ReactNode; className?: string; clearable?: boolean }) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={`dt-field ${className ?? ''}`}>
      <DateTimeInputs id={id} name={typeof label === 'string' ? label : 'Tijdstip'} value={value} onChange={onChange} clearable={clearable} describedBy={describedBy(id, hint, error)} error={error} setError={setError} />
    </FieldShell>
  );
}

function DateTimeInputs({ id, name, value, onChange, clearable, setError }: { id: string; name: string; value: Instant; onChange: (v: Instant) => void; clearable: boolean; describedBy?: string; error: string | null; setError: (e: string | null) => void }) {
  const tz = useTimeZone();
  const wall = instantToWall(value, tz);
  // Datum en tijd staan als twee tekstvelden (dd-mm-jjjj en uu:mm); pas als beide kloppen wordt het tijdstip vastgelegd.
  const [date, setDate] = useState<LocalDate>(wall.slice(0, 10));
  const [time, setTime] = useState(wall.slice(11, 16));
  useEffect(() => {
    setDate(wall.slice(0, 10));
    setTime(wall.slice(11, 16));
  }, [wall]);
  const commit = (d: LocalDate, t: string) => {
    if (d === '' && t === '') return onChange(null);
    if (d !== '' && t !== '') {
      const i = wallToInstant(`${d}T${t}`, tz);
      if (i) return onChange(i);
      setError('Voer een geldige datum en tijd in.');
    }
  };
  return (
    <div className="dt-row">
      <DateTextInput id={id} className="dt-date" value={date} onInvalid={setError} onChange={(d) => { setDate(d); commit(d, time); }} />
      <TimeTextInput className="dt-time" label={`Tijd van ${name}`} value={time} onInvalid={setError} onChange={(t) => { setTime(t); commit(date, t); }} />
      <button type="button" className="secondary icon-button dt-now" aria-label={`${name} op nu zetten`} title="Nu" onClick={() => { setError(null); onChange(nowInstant(tz)); }}>
        <ClockIcon />
      </button>
      {clearable && (
        <button type="button" className="secondary icon-button dt-clear" aria-label={`${name} wissen`} title="Wissen" disabled={value === null} onClick={() => onChange(null)}>
          <ClearIcon />
        </button>
      )}
    </div>
  );
}

/** Klokje: huidige tijd invullen. */
function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** Kruisje: veld leegmaken. */
function ClearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M7 7l10 10M17 7L7 17" />
    </svg>
  );
}

const UNDO_MS = 10_000;

/**
 * Vast tijdstip van het transport (tijdstip verwijzing, ambulance gebeld, vertrek team, aankomst bij kind,
 * vertrek met kind, aankomst). Herkenbaar blok (streep, icoon, naam) met een inline tijdveld:
 * - leeg: veld "uu:mm" met een knop Nu erin (één tik), of typ de tijd (2235 → 22:35);
 * - ingevuld: de tijd staat in het veld, met de dag als klein knopje erachter (tik = datum aanpassen);
 * - wijzigen: tik in het veld en typ eroverheen; leegmaken wist de tijd, met Ongedaan maken.
 */
export function TimepointField({ label, value, onChange, shield = true, step, baseDate }: { label: string; value: Instant; onChange: (v: Instant) => void; shield?: boolean; step?: number; baseDate?: LocalDate }) {
  const id = useId();
  const labelId = `${id}-label`;
  const tz = useTimeZone();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<Instant>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const wall = instantToWall(value, tz);

  useEffect(() => {
    if (!undo) return;
    const h = window.setTimeout(() => setUndo(null), UNDO_MS);
    return () => window.clearTimeout(h);
  }, [undo]);

  /** Verwerkt de getypte tijd; de datum blijft die van de bestaande waarde, of wordt automatisch gekozen. */
  const commit = (raw: string) => {
    const t = raw.trim();
    if (t === '') {
      if (value) {
        setUndo(value);
        onChange(null);
      }
      setError(null);
      return;
    }
    const hm = parseClockTime(t);
    if (!hm) {
      setError('Voer een tijd in als 22:35 (of 2235).');
      return;
    }
    let date = wall ? wall.slice(0, 10) : todayLocalDate(tz);
    let inst = wallToInstant(`${date}T${hm}`, tz);
    // Leeg veld: meer dan 12 uur in de toekomst kan niet; dan was het gisteren (bijv. rond middernacht).
    if (!wall && inst && Date.parse(inst) - Date.now() > 12 * 3_600_000) {
      date = localDateOfMs(Date.now() - 86_400_000, tz);
      inst = wallToInstant(`${date}T${hm}`, tz);
    }
    setError(null);
    setUndo(null);
    onChange(inst);
  };

  const shownTime = editing ? text : wall.slice(11, 16);
  // In een verloop (met basisdatum) staat de datum één keer boven de kaart; hier alleen "+1 dag" bij een andere dag.
  const rel = baseDate && wall ? calendarDaysBetween(baseDate, wall.slice(0, 10)) : null;

  return (
    <div className={`field timepoint ${shield ? '' : 'plain'} ${error ? 'has-error' : ''}`} data-label={label} data-value={wall}>
      <div className="tp-head">
        {step ? <span className="tp-step" aria-hidden="true">{step}</span> : shield && <TimepointIcon />}
        <span id={labelId} className="field-label">
          {label}
        </span>
      </div>
      <div className={`tf ${editing ? 'editing' : ''}`}>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="done"
          placeholder="uu:mm"
          value={shownTime}
          aria-labelledby={labelId}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={error ? true : undefined}
          onFocus={(e) => {
            setEditing(true);
            setText(wall.slice(11, 16));
            e.target.select();
          }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          onBlur={() => {
            setEditing(false);
            commit(text);
          }}
        />
        {!value && (
          <button
            type="button"
            className="nu"
            aria-label={`${label} op nu zetten`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setUndo(null);
              setError(null);
              onChange(nowInstant(tz));
            }}
          >
            Nu
          </button>
        )}
        {value &&
          (dateOpen ? (
            <DateTextInput
              className="tp-date-input"
              label={`Datum van ${label}`}
              value={wall.slice(0, 10)}
              autoFocus
              onChange={(d) => {
                if (!isValidLocalDate(d)) return;
                onChange(wallToInstant(`${d}T${wall.slice(11, 16)}`, tz));
                setDateOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' || e.key === 'Enter') setDateOpen(false);
              }}
              onBlurDone={() => setDateOpen(false)}
            />
          ) : (
            <button type="button" className={`tp-date ${rel !== null ? 'rel' : ''}`} title="Datum wijzigen" aria-label={`Datum van ${label} wijzigen (${formatLocalDate(wall.slice(0, 10))})`} onClick={() => setDateOpen(true)}>
              {rel === null ? formatLocalDate(wall.slice(0, 10)) : rel === 0 ? <CalendarIcon /> : `${rel > 0 ? '+' : '−'}${Math.abs(rel)} dag${Math.abs(rel) === 1 ? '' : 'en'}`}
            </button>
          ))}
      </div>
      {error && (
        <div className="field-error" id={`${id}-error`} role="alert">
          {error}
        </div>
      )}
      {undo && (
        <span className="tp-undo" role="status">
          Gewist.{' '}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              onChange(undo);
              setUndo(null);
            }}
          >
            Ongedaan maken
          </button>
        </span>
      )}
    </div>
  );
}

/** Lokale kalenderdatum (zonder tijdzone). */
export function DateField({ label, value, onChange, hint, todayButton, className }: { label: ReactNode; value: LocalDate; onChange: (v: LocalDate) => void; hint?: ReactNode; todayButton?: boolean; className?: string }) {
  const id = useId();
  const tz = useTimeZone();
  const [error, setError] = useState<string | null>(null);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <div className="dt-row">
        <DateTextInput id={id} value={value} onChange={onChange} onInvalid={setError} />
        {todayButton && value === '' && (
          <button type="button" className="secondary small" onClick={() => onChange(todayLocalDate(tz))}>
            Vandaag
          </button>
        )}
      </div>
    </FieldShell>
  );
}

export function TimeField({ label, value, onChange, className }: { label: ReactNode; value: string; onChange: (v: string) => void; className?: string }) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  return (
    <FieldShell id={id} label={label} error={error} className={className}>
      <TimeTextInput id={id} value={value} onChange={onChange} onInvalid={setError} />
    </FieldShell>
  );
}

export function Section({ id, title, children, intro, actions }: { id: string; title: string; children: ReactNode; intro?: ReactNode; actions?: ReactNode }) {
  const heading = (
    <h2 id={`${id}-title`} tabIndex={-1} className="section-title">
      <SectionIcon id={id} />
      <span>{title}</span>
    </h2>
  );
  return (
    <section id={id} className="form-section" aria-labelledby={`${id}-title`}>
      {/* Bedieningselementen van de sectie (bijv. weergavekeuze) rechts naast de kop. */}
      {actions ? (
        <div className="section-head">
          {heading}
          <div className="section-actions">{actions}</div>
        </div>
      ) : (
        heading
      )}
      {intro && <p className="section-intro">{intro}</p>}
      {children}
    </section>
  );
}

/** Toevoegknop rechtsboven in een sectie: icoon "add circle" met tekst (op een smal scherm alleen het icoon). */
export function AddButton({ label, onClick, shortcut }: { label: string; onClick: () => void; shortcut?: string }) {
  return (
    <button type="button" className="primary add-button" onClick={onClick} title={shortcut ? `${label} (${shortcut})` : label} aria-keyshortcuts={shortcut?.replace('Alt+', 'Alt+')}>
      <AddIcon />
      <span className="add-label">{label}</span>
    </button>
  );
}

/** Toevoegknop met een menu om te kiezen wát wordt toegevoegd (bijv. bij Ingebrachte materialen). */
export function AddMenu<T extends string>({ label, options, onPick }: { label: string; options: { value: T; label: string }[]; onPick: (v: T) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      ref.current?.querySelector<HTMLElement>('.add-button')?.focus();
    } else if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
    }
  };
  return (
    <div className="add-menu" ref={ref} onKeyDown={onKey}>
      <button type="button" className="primary add-button" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} title={label} onClick={() => setOpen(!open)}>
        <AddIcon />
        <span className="add-label">{label}</span>
      </button>
      {open && (
        <ul className="add-menu-list" role="menu" id={menuId} aria-label={label}>
          {options.map((o) => (
            <li key={o.value} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onPick(o.value);
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Tekstveld met een doorzoekbare keuzelijst (combobox). Tik op het pijltje voor de hele lijst, of typ om te filteren;
 * vrije tekst blijft mogelijk. Opties met `badge` tonen dat label rechts (bijv. NICU).
 */
export function ComboField({
  label,
  value,
  onChange,
  options,
  matches,
  emptyText = 'Geen treffers; de ingevulde tekst wordt gebruikt.',
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; badge?: string }[];
  matches: (o: { label: string; badge?: string }, query: string) => boolean;
  emptyText?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const shown = query.trim() ? options.filter((o) => matches(o, query)) : options;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, id]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
    setActive(-1);
    input.current?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }
      const n = shown.length;
      if (n) setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : a <= 0 ? n - 1 : a - 1));
    } else if (e.key === 'Enter' && open && active >= 0 && shown[active]) {
      e.preventDefault();
      choose(shown[active].label);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <FieldShell id={id} label={label}>
      <div className="combo" ref={wrap}>
        <input
          ref={input}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? `${id}-opt-${active}` : undefined}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setQuery(e.target.value);
            // Typen opent de lijst met treffers; een leeggemaakt veld sluit hem.
            setOpen(e.target.value.trim() !== '');
            setActive(-1);
          }}
          onKeyDown={onKey}
        />
        <button
          type="button"
          className="combo-toggle"
          aria-label={`Lijst ${typeof label === 'string' ? label.toLowerCase() : ''} ${open ? 'sluiten' : 'openen'}`.replace(/\s+/g, ' ')}
          aria-expanded={open}
          aria-controls={listId}
          tabIndex={-1}
          onClick={() => {
            setQuery('');
            setActive(Math.max(0, options.findIndex((o) => o.label === value)));
            setOpen(!open);
            input.current?.focus();
          }}
        >
          <ExpandIcon />
        </button>
        {open && (
          <ul className="combo-list" role="listbox" id={listId} aria-label={typeof label === 'string' ? label : undefined}>
            {shown.length === 0 && <li className="combo-empty">{emptyText}</li>}
            {shown.map((o, i) => (
              <li
                key={o.label}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={o.label === value}
                className={`${i === active ? 'active' : ''} ${o.label === value ? 'selected' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o.label)}
              >
                <span>{o.label}</span>
                {o.badge && <span className="combo-badge">{o.badge}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </FieldShell>
  );
}

/** Bewerken of verwijderen per rij of kaart: een pictogram van 44 px (verwijderen in rood). De naam blijft voor schermlezers. */
export function IconButton({ kind, label, onClick }: { kind: 'edit' | 'delete'; label: string; onClick: () => void }) {
  return (
    <button type="button" className={`icon-btn ${kind === 'delete' ? 'danger' : ''}`} aria-label={label} title={label} onClick={onClick}>
      {kind === 'delete' ? <DeleteIcon /> : <EditIcon />}
    </button>
  );
}
