import { useEffect, useRef, useState } from 'react';
import type { EndotrachealTube, Measurement, RespMode } from '../../domain/types';
import {
  GAS_FIELDS,
  GAS_TYPE_OPTIONS,
  INVASIVE_MODES,
  MONITOR_FIELDS,
  NON_INVASIVE_MODES,
  PHASE_OPTIONS,
  RESP_MODE_LABELS,
  isInvasive,
  optionLabel,
  respFieldsFor,
  type NumFieldDef,
} from '../../domain/labels';
import { newMeasurement } from '../../domain/factory';
import { formatNum } from '../../domain/num';
import { formatInstant } from '../../domain/time';
import { sortedMeasurements, tubeAt, upsertMeasurement } from '../../domain/timeline';
import { tubeSummary } from '../../report/buildReport';
import { DateTimeField, NumberField, Section, Segmented, SelectField } from '../fields';
import { useTimeZone } from '../context';
import type { SectionProps } from './BasicSections';

const rulesOf = (d: NumFieldDef) => ({ min: d.min, max: d.max, integer: d.integer });

function Chip({ label, value }: { label: string; value: string | null }) {
  if (value === null) return null;
  return (
    <li>
      <span className="chip-label">{label}</span> {value}
    </li>
  );
}

function MeasurementCard({ m, index, tubes, onEdit, onDelete }: { m: Measurement; index: number; tubes: EndotrachealTube[]; onEdit: () => void; onDelete: () => void }) {
  const tz = useTimeZone();
  const mode = m.resp.mode;
  const settings = mode ? (m.resp.settingsByMode[mode] ?? {}) : {};
  const tube = mode && isInvasive(mode) ? tubeAt(tubes, m.at) : null;
  const monitorFilled = MONITOR_FIELDS.some((f) => m.monitor[f.key] !== null);
  const gasFilled = m.gas.type !== '' || GAS_FIELDS.some((f) => m.gas.values[f.key] !== null);
  const phase = optionLabel(PHASE_OPTIONS, m.phase);
  return (
    <article className="card timeline-card" aria-label={`Meetmoment ${index + 1}, ${formatInstant(m.at, tz)}`}>
      <header className="card-head">
        <div>
          <span className="time">{formatInstant(m.at, tz) || 'Tijdstip niet ingevuld'}</span>
          {phase && <span className="badge">{phase}</span>}
        </div>
        <div className="card-actions">
          <button type="button" className="secondary small" onClick={onEdit}>
            Bewerken
          </button>
          <button type="button" className="link-button danger" onClick={onDelete}>
            Verwijderen
          </button>
        </div>
      </header>
      {mode && (
        <div className="card-block">
          <h4>Ademhaling: {RESP_MODE_LABELS[mode]}</h4>
          <ul className="chips">
            {respFieldsFor(mode).map((f) => (
              <Chip key={f.key} label={f.label.replace(/ \((optioneel|indien bekend|ingesteld doelteugvolume)\)$/, '')} value={formatNum(settings[f.key] ?? null, f.unit)} />
            ))}
          </ul>
          {isInvasive(mode) && <p className="tube-line">Tube: {tube ? tubeSummary(tube.version, tz) : 'geen tubegegevens voor dit tijdstip'}</p>}
        </div>
      )}
      {monitorFilled && (
        <div className="card-block">
          <h4>Monitor</h4>
          <ul className="chips">
            {MONITOR_FIELDS.map((f) => (
              <Chip key={f.key} label={f.label} value={formatNum(m.monitor[f.key], f.unit)} />
            ))}
          </ul>
        </div>
      )}
      {gasFilled && (
        <div className="card-block">
          <h4>
            Bloedgas {optionLabel(GAS_TYPE_OPTIONS, m.gas.type).toLowerCase()} · afname {formatInstant(m.gas.sampledAt, tz) || 'tijd niet ingevuld'}
          </h4>
          <ul className="chips">
            {GAS_FIELDS.map((f) => (
              <Chip key={f.key} label={f.label} value={formatNum(m.gas.values[f.key], f.unit)} />
            ))}
          </ul>
        </div>
      )}
      {!mode && !monitorFilled && !gasFilled && <p className="muted">Nog geen gegevens ingevuld.</p>}
    </article>
  );
}

function ModePicker({ value, onChange }: { value: RespMode | ''; onChange: (m: RespMode | '') => void }) {
  const groups: { title: string; modes: RespMode[] }[] = [
    { title: 'Geen', modes: ['geen'] },
    { title: 'Non-invasief', modes: NON_INVASIVE_MODES },
    { title: 'Invasief', modes: INVASIVE_MODES },
  ];
  return (
    <fieldset className="segmented mode-picker">
      <legend className="field-label">Ademhalingsondersteuning</legend>
      {groups.map((g) => (
        <div className="mode-group" key={g.title} role="group" aria-label={g.title}>
          {g.title !== 'Geen' && <span className="mode-group-title">{g.title}</span>}
          <div className="segmented-options">
            {g.modes.map((m) => (
              <label key={m} className={`seg ${value === m ? 'checked' : ''}`}>
                <input type="radio" name="resp-mode" value={m} checked={value === m} onChange={() => onChange(m)} />
                <span>{RESP_MODE_LABELS[m]}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      {value !== '' && (
        <button type="button" className="link-button" onClick={() => onChange('')}>
          Keuze wissen
        </button>
      )}
    </fieldset>
  );
}

function MeasurementEditor({ draft, setDraft, tubes, isNew, proposed, onSave, onCancel }: { draft: Measurement; setDraft: (m: Measurement) => void; tubes: EndotrachealTube[]; isNew: boolean; proposed: boolean; onSave: () => void; onCancel: () => void }) {
  const tz = useTimeZone();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    ref.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
  }, []);
  const mode = draft.resp.mode;
  const settings = mode ? (draft.resp.settingsByMode[mode] ?? {}) : {};
  const tube = mode && isInvasive(mode) ? tubeAt(tubes, draft.at) : null;
  const setSetting = (key: string, v: import('../../domain/types').Num) => {
    if (!mode) return;
    setDraft({ ...draft, resp: { ...draft.resp, settingsByMode: { ...draft.resp.settingsByMode, [mode]: { ...settings, [key]: v } } } });
  };
  return (
    <form
      ref={ref}
      className="card editor"
      aria-label={isNew ? 'Nieuw meetmoment' : 'Meetmoment bewerken'}
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <h3>{isNew ? 'Nieuw meetmoment' : 'Meetmoment bewerken'}</h3>
      <div className="grid">
        <DateTimeField label="Datum en tijd" value={draft.at} onChange={(v) => setDraft({ ...draft, at: v })} clearable={false} />
        <SelectField label="Fase" value={draft.phase} onChange={(v) => setDraft({ ...draft, phase: v })} options={PHASE_OPTIONS} />
      </div>

      <h4 className="block-title">Ademhalingsondersteuning</h4>
      {proposed && mode && (
        <p className="notice" role="status">
          Modaliteit en instellingen zijn als voorstel overgenomen van het vorige meetmoment. Controleer ze; ze worden pas vastgelegd bij Opslaan.
        </p>
      )}
      <ModePicker value={mode} onChange={(m) => setDraft({ ...draft, resp: { ...draft.resp, mode: m } })} />
      {mode && mode !== 'geen' && (
        <div className="grid compact" key={mode}>
          {respFieldsFor(mode).map((f) => (
            <NumberField key={`${mode}-${f.key}`} label={f.label} unit={f.unit} value={settings[f.key] ?? null} onChange={(v) => setSetting(f.key, v)} rules={rulesOf(f)} />
          ))}
        </div>
      )}
      {mode === 'geen' && <p className="muted">Geen ademhalingsinstellingen.</p>}
      {mode && isInvasive(mode) && (
        <p className="tube-line">
          <strong>Endotracheale tube op dit tijdstip:</strong> {tube ? tubeSummary(tube.version, tz) : 'geen tube geregistreerd. Voer de tube in bij sectie 10.'}
        </p>
      )}

      <h4 className="block-title">Monitorgegevens</h4>
      <p className="muted small-print">Bloeddruk in mmHg; luchtwegdrukken hierboven in cmH₂O.</p>
      <div className="grid compact">
        {MONITOR_FIELDS.map((f) => (
          <NumberField key={f.key} label={f.label} unit={f.unit} value={draft.monitor[f.key]} onChange={(v) => setDraft({ ...draft, monitor: { ...draft.monitor, [f.key]: v } })} rules={rulesOf(f)} />
        ))}
      </div>

      <h4 className="block-title">Bloedgas</h4>
      <div className="grid">
        <DateTimeField label="Afnametijd (datum en tijd)" value={draft.gas.sampledAt} onChange={(v) => setDraft({ ...draft, gas: { ...draft.gas, sampledAt: v } })} />
        <Segmented legend="Afnametype" value={draft.gas.type} onChange={(v) => setDraft({ ...draft, gas: { ...draft.gas, type: v } })} options={GAS_TYPE_OPTIONS} />
      </div>
      <div className="grid compact">
        {GAS_FIELDS.map((f) => (
          <NumberField key={f.key} label={f.label} unit={f.unit} value={draft.gas.values[f.key]} onChange={(v) => setDraft({ ...draft, gas: { ...draft.gas, values: { ...draft.gas.values, [f.key]: v } } })} rules={rulesOf(f)} />
        ))}
      </div>

      <div className="editor-actions">
        <button type="submit" className="primary">
          Meetmoment opslaan
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Annuleren
        </button>
      </div>
    </form>
  );
}

export function TimelineSection({ t, update }: SectionProps) {
  const tz = useTimeZone();
  const [draft, setDraft] = useState<Measurement | null>(null);
  const [isNew, setIsNew] = useState(false);
  const sorted = sortedMeasurements(t.measurements);

  const startNew = () => {
    setDraft(newMeasurement(t.measurements, tz));
    setIsNew(true);
  };
  const save = () => {
    if (!draft) return;
    update((x) => ({ ...x, measurements: upsertMeasurement(x.measurements, draft) }));
    setDraft(null);
  };

  return (
    <Section id="s6" title="6 Tijdlijn: ademhalingsondersteuning, monitorgegevens en bloedgassen" intro="Elk meetmoment mag gedeeltelijk worden ingevuld. De tijdlijn is altijd chronologisch op het ingevoerde tijdstip.">
      {!draft && (
        <button type="button" className="primary" onClick={startNew}>
          + Nieuw meetmoment
        </button>
      )}
      {draft && isNew && <MeasurementEditor draft={draft} setDraft={setDraft} tubes={t.tubes} isNew proposed={!!draft.resp.mode} onSave={save} onCancel={() => setDraft(null)} />}
      <div className="timeline">
        {sorted.length === 0 && !draft && <p className="muted">Nog geen meetmomenten.</p>}
        {sorted.map((m, i) =>
          draft && !isNew && draft.id === m.id ? (
            <MeasurementEditor key={m.id} draft={draft} setDraft={setDraft} tubes={t.tubes} isNew={false} proposed={false} onSave={save} onCancel={() => setDraft(null)} />
          ) : (
            <MeasurementCard
              key={m.id}
              m={m}
              index={i}
              tubes={t.tubes}
              onEdit={() => {
                setDraft(structuredClone(m));
                setIsNew(false);
              }}
              onDelete={() => {
                if (window.confirm(`Meetmoment van ${formatInstant(m.at, tz) || 'onbekend tijdstip'} verwijderen? Dit kan niet ongedaan worden gemaakt.`)) {
                  update((x) => ({ ...x, measurements: x.measurements.filter((y) => y.id !== m.id) }));
                }
              }}
            />
          ),
        )}
      </div>
      {sorted.length > 0 && !draft && (
        <button type="button" className="secondary" onClick={startNew}>
          + Nieuw meetmoment
        </button>
      )}
    </Section>
  );
}
