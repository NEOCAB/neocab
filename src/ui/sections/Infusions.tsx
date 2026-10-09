import { useState } from 'react';
import type { Infusion, Instant, Num } from '../../domain/types';
import { newId, newInfusion } from '../../domain/factory';
import { formatNum } from '../../domain/num';
import { formatInstant, nowInstant } from '../../domain/time';
import { sortedRates } from '../../domain/timeline';
import { DateTimeField, NumberField, Section, TextField } from '../fields';
import { useTimeZone } from '../context';
import { useConfirm } from '../confirm';
import type { SectionProps } from './BasicSections';

const RATE_RULES = { positive: true };

function RateChangeForm({ onSave, onCancel }: { onSave: (at: Instant, rate: number) => void; onCancel: () => void }) {
  const tz = useTimeZone();
  const [at, setAt] = useState<Instant>(() => nowInstant(tz));
  const [rate, setRate] = useState<Num>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="subform" role="group" aria-label="Snelheid wijzigen">
      <div className="grid two">
        <DateTimeField label="Tijdstip wijziging" value={at} onChange={setAt} clearable={false} />
        <NumberField label="Nieuwe pompsnelheid" unit="mL/uur" value={rate} onChange={setRate} rules={RATE_RULES} allowUnknown={false} />
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="editor-actions">
        <button
          type="button"
          className="primary"
          onClick={() => {
            if (typeof rate !== 'number') return setError('Vul een pompsnelheid groter dan 0 in.');
            if (!at) return setError('Vul het tijdstip van de wijziging in.');
            onSave(at, rate);
          }}
        >
          Wijziging opslaan
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Annuleren
        </button>
      </div>
    </div>
  );
}

function InfusionCard({ inf, onChange, onDelete }: { inf: Infusion; onChange: (i: Infusion) => void; onDelete: () => void }) {
  const tz = useTimeZone();
  const confirm = useConfirm();
  const [changing, setChanging] = useState(false);
  const rates = sortedRates(inf);
  const first = rates[0];
  const current = rates[rates.length - 1];
  const setRate = (id: string, patch: Partial<Infusion['rates'][number]>) => onChange({ ...inf, rates: inf.rates.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  return (
    <article className={`card infusion ${inf.stopAt ? 'stopped' : 'running'}`} aria-label={`Infuus ${inf.name || 'zonder naam'}`}>
      <header className="card-head">
        <div>
          <span className="time">{inf.name || 'Infuus'}</span>
          <span className={`badge ${inf.stopAt ? 'neutral' : 'ok'}`}>{inf.stopAt ? 'Gestopt' : 'Loopt'}</span>
          {current && !inf.stopAt && <span className="muted"> · actueel {formatNum(current.rateMlPerHour, 'mL/uur') ?? 'snelheid niet ingevuld'}</span>}
        </div>
      </header>
      <div className="grid">
        <DateTimeField
          label="1. Startdatum en tijd"
          value={inf.startAt}
          clearable={false}
          onChange={(v) => onChange({ ...inf, startAt: v, rates: inf.rates.map((r) => (r.id === first?.id ? { ...r, at: v } : r)) })}
        />
        <TextField label="2. Vloeistof of medicament" value={inf.name} onChange={(v) => onChange({ ...inf, name: v })} />
      </div>
      <fieldset className="group">
        <legend>3. Pompsnelheid (mL/uur) en verloop</legend>
        <ol className="rate-history">
          {rates.map((r, i) => (
            <li key={r.id}>
              {i === 0 ? (
                <NumberField label={`Startsnelheid (vanaf ${formatInstant(r.at, tz) || 'start'})`} unit="mL/uur" value={r.rateMlPerHour} onChange={(v) => setRate(r.id, { rateMlPerHour: v })} rules={RATE_RULES} allowUnknown={false} />
              ) : (
                <div className="grid two tight rate-row">
                  <DateTimeField label={`Wijziging ${i}: tijdstip`} value={r.at} onChange={(v) => setRate(r.id, { at: v })} clearable={false} />
                  <div className="with-action">
                    <NumberField label={`Wijziging ${i}: snelheid`} unit="mL/uur" value={r.rateMlPerHour} onChange={(v) => setRate(r.id, { rateMlPerHour: v })} rules={RATE_RULES} allowUnknown={false} />
                    <button
                      type="button"
                      className="link-button danger"
                      onClick={() => {
                        void confirm(`Snelheidswijziging van ${formatInstant(r.at, tz)} verwijderen?`).then((ok) => ok && onChange({ ...inf, rates: inf.rates.filter((x) => x.id !== r.id) }));
                      }}
                    >
                      Wijziging verwijderen
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
        {changing ? (
          <RateChangeForm
            onCancel={() => setChanging(false)}
            onSave={(at, rate) => {
              onChange({ ...inf, rates: [...inf.rates, { id: newId(), at, rateMlPerHour: rate }] });
              setChanging(false);
            }}
          />
        ) : (
          !inf.stopAt && (
            <button type="button" className="secondary" onClick={() => setChanging(true)}>
              Snelheid wijzigen
            </button>
          )
        )}
      </fieldset>
      <div className="stop-row">
        {inf.stopAt ? (
          <>
            <DateTimeField label="4. Stopdatum en tijd" value={inf.stopAt} onChange={(v) => onChange({ ...inf, stopAt: v })} clearable={false} />
            <button
              type="button"
              className="link-button"
              onClick={() => {
                void confirm('Stoptijd verwijderen? Het infuus wordt weer als lopend geregistreerd.', 'Stoptijd verwijderen').then((ok) => ok && onChange({ ...inf, stopAt: null }));
              }}
            >
              Stoppen ongedaan maken
            </button>
          </>
        ) : (
          <div className="field">
            <span className="field-label">4. Stopdatum en tijd</span>
            <div className="dt-row">
              <span className="muted">Loopt nog — stoptijd wordt ingevuld bij Stoppen.</span>
              <button type="button" className="warning" onClick={() => onChange({ ...inf, stopAt: nowInstant(tz) })}>
                Infuus stoppen
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="card-actions end">
        <button type="button" className="link-button danger" onClick={onDelete}>
          Infuus verwijderen
        </button>
      </div>
    </article>
  );
}

function NewInfusionForm({ onStart, onCancel }: { onStart: (i: Infusion) => void; onCancel: () => void }) {
  const tz = useTimeZone();
  const [draft, setDraft] = useState<Infusion>(() => newInfusion(tz));
  const [error, setError] = useState<string | null>(null);
  const rate = draft.rates[0].rateMlPerHour;
  return (
    <div className="card editor" role="group" aria-label="Infuus starten">
      <h3>Infuus starten</h3>
      <div className="grid">
        <DateTimeField label="1. Startdatum en tijd" value={draft.startAt} clearable={false} onChange={(v) => setDraft({ ...draft, startAt: v, rates: [{ ...draft.rates[0], at: v }] })} />
        <TextField label="2. Vloeistof of medicament" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
        <NumberField label="3. Pompsnelheid" unit="mL/uur" value={rate} onChange={(v) => setDraft({ ...draft, rates: [{ ...draft.rates[0], rateMlPerHour: v }] })} rules={RATE_RULES} allowUnknown={false} />
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="editor-actions">
        <button
          type="button"
          className="primary"
          onClick={() => {
            if (!draft.name.trim()) return setError('Vul de vloeistof of het medicament in.');
            onStart(draft);
          }}
        >
          Starten
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Annuleren
        </button>
      </div>
    </div>
  );
}

export function InfusionsSection({ t, update }: SectionProps) {
  const [adding, setAdding] = useState(false);
  const confirm = useConfirm();
  const setInf = (i: Infusion) => update((x) => ({ ...x, infusions: x.infusions.map((y) => (y.id === i.id ? i : y)) }));
  return (
    <Section id="s9" title="9 Lopende infusen" intro="Start, wijzig en stop een infuus met de knoppen. Eerdere snelheden blijven bewaard en staan in het verslag.">
      <div className="list">
        {t.infusions.length === 0 && !adding && <p className="muted">Nog geen infusen.</p>}
        {t.infusions.map((inf) => (
          <InfusionCard
            key={inf.id}
            inf={inf}
            onChange={setInf}
            onDelete={() => {
              void confirm(`Infuus ${inf.name || ''} met de volledige snelheidshistorie verwijderen?`).then((ok) => ok && update((x) => ({ ...x, infusions: x.infusions.filter((y) => y.id !== inf.id) })));
            }}
          />
        ))}
      </div>
      {adding ? (
        <NewInfusionForm
          onCancel={() => setAdding(false)}
          onStart={(i) => {
            update((x) => ({ ...x, infusions: [...x.infusions, i] }));
            setAdding(false);
          }}
        />
      ) : (
        <button type="button" className="primary" onClick={() => setAdding(true)}>
          + Infuus starten
        </button>
      )}
    </Section>
  );
}
