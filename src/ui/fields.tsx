import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Instant, LocalDate, Num } from '../domain/types';
import { numToInput, parseNum, type NumRules } from '../domain/num';
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
  allowUnknown?: boolean;
  className?: string;
  integer?: boolean;
}

/**
 * Numeriek veld: komma of punt, eenheid zichtbaar. Leeg = `null`, "Onbekend" is een aparte expliciete keuze.
 * Ongeldige invoer wordt niet doorgegeven en blijft zichtbaar met een foutmelding.
 */
export function NumberField({ label, value, onChange, unit, rules, hint, allowUnknown = true, className }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(numToInput(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Synchroniseer bij externe wijziging (bijv. ander record), niet tijdens typen van gelijke waarde.
    const parsed = parseNum(text, rules);
    if (!(parsed.ok && parsed.value === value) && value !== 'onbekend') {
      setText(numToInput(value));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const unknown = value === 'onbekend';
  const allowNegative = rules?.min === undefined && !rules?.positive;
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      className={`num-field ${className ?? ''}`}
    >
      <div className="num-row">
        <div className="num-input-wrap">
          <input
            id={id}
            type="text"
            inputMode={allowNegative ? 'text' : 'decimal'}
            autoComplete="off"
            enterKeyHint="next"
            value={unknown ? '' : text}
            placeholder={unknown ? 'onbekend' : ''}
            disabled={unknown}
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
        {allowUnknown && (
          <button
            type="button"
            className={`unknown-toggle ${unknown ? 'on' : ''}`}
            aria-pressed={unknown}
            aria-label={`${typeof label === 'string' ? label : 'Waarde'} onbekend`}
            title="Markeer als onbekend"
            onClick={() => {
              if (unknown) {
                onChange(null);
                setText('');
              } else {
                setError(null);
                onChange('onbekend');
              }
            }}
          >
            {unknown ? 'Onbekend ✓' : 'Onbekend'}
          </button>
        )}
      </div>
      {unit && <span className="sr-only">Eenheid: {unit}</span>}
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
 * Datum + tijd in de gekozen tijdzone. Opgeslagen als tijdstip met offset.
 * Een leeg veld blijft leeg tot de gebruiker "Nu invullen" kiest of zelf een tijd invoert.
 */
export function DateTimeField({ label, value, onChange, hint, className, clearable = true, nowLabel = 'Nu invullen' }: { label: ReactNode; value: Instant; onChange: (v: Instant) => void; hint?: ReactNode; className?: string; clearable?: boolean; nowLabel?: string }) {
  const id = useId();
  const tz = useTimeZone();
  const [error, setError] = useState<string | null>(null);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={`dt-field ${className ?? ''}`}>
      <div className="dt-row">
        <input
          id={id}
          type="datetime-local"
          value={instantToWall(value, tz)}
          aria-describedby={describedBy(id, hint, error)}
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
        {value === null ? (
          <button type="button" className="secondary small" onClick={() => onChange(nowInstant(tz))}>
            {nowLabel}
          </button>
        ) : (
          clearable && (
            <button type="button" className="link-button" aria-label={`${typeof label === 'string' ? label : 'Tijdstip'} wissen`} onClick={() => onChange(null)}>
              Wissen
            </button>
          )
        )}
      </div>
    </FieldShell>
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
