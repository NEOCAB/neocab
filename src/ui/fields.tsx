import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Instant, LocalDate, Num } from '../domain/types';
import { numToInput, parseNum, type NumRules } from '../domain/num';
import { gestationToInput, parseGestation } from '../domain/calc';
import { instantToWall, isValidLocalDate, nowInstant, todayLocalDate, wallToInstant } from '../domain/time';
import { useTimeZone } from './context';
import { AddIcon, ExpandIcon, SectionIcon, TimepointIcon } from './icons';

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
 * vertrek met kind, aankomst ontvangend centrum). Alle zes in dezelfde vormgeving: icoon, naam, datum/tijd met Nu en Wissen.
 */
export function TimepointField({ label, value, onChange }: { label: string; value: Instant; onChange: (v: Instant) => void }) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={`field timepoint ${error ? 'has-error' : ''}`}>
      <div className="tp-head">
        <TimepointIcon />
        <label htmlFor={id} className="field-label">
          {label}
        </label>
      </div>
      <DateTimeInputs id={id} name={label} value={value} onChange={onChange} clearable describedBy={describedBy(id, undefined, error)} error={error} setError={setError} />
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
export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="primary add-button" onClick={onClick} title={label}>
      <AddIcon />
      <span className="add-label">{label}</span>
    </button>
  );
}

/** Toevoegknop met een menu om te kiezen wát wordt toegevoegd (bijv. bij Plastic). */
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
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={onKey}
        />
        <button
          type="button"
          className="secondary icon-button combo-toggle"
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
