import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Instant, LocalDate, Num } from '../domain/types';
import { numToInput, parseNum, type NumRules } from '../domain/num';
import { gestationToInput, parseGestation } from '../domain/calc';
import { instantToWall, isValidLocalDate, nowInstant, todayLocalDate, wallToInstant } from '../domain/time';
import { useTimeZone } from './context';

function FieldShell({ id, label, hint, error, children, className, labelSuffix }: { id: string; label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string; labelSuffix?: ReactNode }) {
  return (
    <div className={`field ${className ?? ''} ${error ? 'has-error' : ''}`}>
      <label htmlFor={id} className="field-label">
        {label}
        {labelSuffix}
      </label>
      {children}
      {hint && (
        <div className="field-hint" id={`${id}-hint`}>
          {hint}
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

export function TextField({ label, value, onChange, type = 'text', list, hint, placeholder, autoComplete, className, inputMode }: { label: ReactNode; value: string; onChange: (v: string) => void; type?: 'text' | 'tel'; list?: string[]; hint?: ReactNode; placeholder?: string; autoComplete?: string; className?: string; inputMode?: 'text' | 'tel' | 'numeric' }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} className={className}>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
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
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
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

  useEffect(() => {
    // Synchroniseer bij externe wijziging (bijv. ander record), niet tijdens typen van gelijke waarde.
    const parsed = parseNum(text, rules);
    if (!(parsed.ok && parsed.value === value)) {
      setText(numToInput(value));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const allowNegative = rules?.min === undefined && !rules?.positive;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={`num-field ${className ?? ''}`}>
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
          aria-describedby={describedBy(id, hint, error)}
          onChange={(e) => {
            setText(e.target.value);
            const r = parseNum(e.target.value, rules);
            if (r.ok) {
              setError(null);
              onChange(r.value);
            } else setError(r.error);
          }}
        />
        {unit && (
          <span className="unit" aria-hidden="true">
            {unit}
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
export function Segmented<T extends string>({ legend, value, onChange, options, allowClear = true, className, name }: { legend: ReactNode; value: T | ''; onChange: (v: T | '') => void; options: { value: T; label: string }[]; allowClear?: boolean; className?: string; name?: string }) {
  const autoName = useId();
  return (
    <fieldset className={`segmented ${className ?? ''}`}>
      <legend className="field-label">{legend}</legend>
      <div className="segmented-options">
        {options.map((o) => (
          <label key={o.value} className={`seg ${value === o.value ? 'checked' : ''}`}>
            <input type="radio" name={name ?? autoName} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
        {allowClear && value !== '' && (
          <button type="button" className="link-button" onClick={() => onChange('')}>
            Wissen
          </button>
        )}
      </div>
    </fieldset>
  );
}

/**
 * Datum + tijd in de gekozen tijdzone, opgeslagen als tijdstip met offset.
 * Knop "Nu" vult de huidige tijd in (ook over een bestaande tijd heen); "Wissen" maakt het veld leeg.
 * Een leeg veld blijft leeg tot de gebruiker een tijd invoert of "Nu" kiest.
 */
export function DateTimeField({ label, value, onChange, hint, className, clearable = true }: { label: ReactNode; value: Instant; onChange: (v: Instant) => void; hint?: ReactNode; className?: string; clearable?: boolean }) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={`dt-field ${className ?? ''}`}>
      <DateTimeInputs id={id} name={typeof label === 'string' ? label : 'Tijdstip'} value={value} onChange={onChange} clearable={clearable} describedBy={describedBy(id, hint, error)} error={error} setError={setError} />
    </FieldShell>
  );
}

function DateTimeInputs({ id, name, value, onChange, clearable, describedBy: desc, error, setError }: { id: string; name: string; value: Instant; onChange: (v: Instant) => void; clearable: boolean; describedBy?: string; error: string | null; setError: (e: string | null) => void }) {
  const tz = useTimeZone();
  return (
    <div className="dt-row">
      <input
        id={id}
        type="datetime-local"
        value={instantToWall(value, tz)}
        aria-describedby={desc}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          if (e.target.value === '') {
            setError(null);
            onChange(null);
            return;
          }
          const i = wallToInstant(e.target.value, tz);
          if (i) {
            setError(null);
            onChange(i);
          } else setError('Voer een geldige datum en tijd in.');
        }}
      />
      <button type="button" className="secondary icon-button dt-now" aria-label={`${name} op nu zetten`} title="Nu" onClick={() => onChange(nowInstant(tz))}>
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

/**
 * Vast tijdstip van het transport (verwijzing, ambulance aangevraagd, vertrek transportteam, aankomst bij kind,
 * vertrek met kind, aankomst ontvangend centrum). Alle zes in dezelfde vormgeving: naam, omschrijving, datum/tijd met Nu en Wissen.
 */
export function TimepointField({ label, description, value, onChange }: { label: string; description: string; value: Instant; onChange: (v: Instant) => void }) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={`field timepoint ${error ? 'has-error' : ''}`}>
      <div className="tp-head">
        <label htmlFor={id} className="field-label">
          {label}
        </label>
        <div className="tp-desc" id={`${id}-hint`}>
          {description}
        </div>
      </div>
      <DateTimeInputs id={id} name={label} value={value} onChange={onChange} clearable describedBy={describedBy(id, description, error)} error={error} setError={setError} />
      {error && (
        <div className="field-error" id={`${id}-error`} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

/** Lokale kalenderdatum (zonder tijdzone). */
export function DateField({ label, value, onChange, hint, todayButton, className }: { label: ReactNode; value: LocalDate; onChange: (v: LocalDate) => void; hint?: ReactNode; todayButton?: boolean; className?: string }) {
  const id = useId();
  const tz = useTimeZone();
  const invalid = value !== '' && !isValidLocalDate(value);
  return (
    <FieldShell id={id} label={label} hint={hint} error={invalid ? 'Voer een geldige datum in.' : null} className={className}>
      <div className="dt-row">
        <input id={id} type="date" value={value} aria-describedby={describedBy(id, hint)} onChange={(e) => onChange(e.target.value)} />
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
  return (
    <FieldShell id={id} label={label} className={className}>
      <input id={id} type="time" value={value} onChange={(e) => onChange(e.target.value)} />
    </FieldShell>
  );
}

export function Section({ id, title, children, intro }: { id: string; title: string; children: ReactNode; intro?: ReactNode }) {
  return (
    <section id={id} className="form-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} tabIndex={-1}>
        {title}
      </h2>
      {intro && <p className="section-intro">{intro}</p>}
      {children}
    </section>
  );
}
