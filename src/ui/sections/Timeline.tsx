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
  respFieldsFor,
  type NumFieldDef,
} from '../../domain/labels';
import { newMeasurement } from '../../domain/factory';
import { formatInstant } from '../../domain/time';
import { tubeAt, upsertMeasurement } from '../../domain/timeline';
import { timelineReportTable, tubeSummary } from '../../report/buildReport';
import { DataTable } from '../DataTable';
import { DateTimeField, NumberField, Section, Segmented, SelectField } from '../fields';
import { useTimeZone } from '../context';
import { useConfirm } from '../confirm';
import type { SectionProps } from './BasicSections';

const rulesOf = (d: NumFieldDef) => ({ min: d.min, max: d.max, integer: d.integer });

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

function MeasurementEditor({ draft, setDraft, tubes, isNew, proposed, onSave, onCancel, onDelete }: { draft: Measurement; setDraft: (m: Measurement) => void; tubes: EndotrachealTube[]; isNew: boolean; proposed: boolean; onSave: () => void; onCancel: () => void; onDelete?: () => void }) {
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
        {onDelete && (
          <button type="button" className="link-button danger" onClick={onDelete}>
            Verwijderen
          </button>
        )}
      </div>
    </form>
  );
}

export function TimelineSection({ t, update }: SectionProps) {
  const tz = useTimeZone();
  const [draft, setDraft] = useState<Measurement | null>(null);
  const [isNew, setIsNew] = useState(false);
  const confirm = useConfirm();
  const { table, rows } = timelineReportTable(t.measurements, tz);

  const startNew = () => {
    setDraft(newMeasurement(t.measurements, tz));
    setIsNew(true);
  };
  const save = () => {
    if (!draft) return;
    update((x) => ({ ...x, measurements: upsertMeasurement(x.measurements, draft) }));
    setDraft(null);
  };
  const remove = async (m: Measurement) => {
    if (await confirm(`Meetmoment van ${formatInstant(m.at, tz) || 'onbekend tijdstip'} verwijderen? Dit kan niet ongedaan worden gemaakt.`)) {
      update((x) => ({ ...x, measurements: x.measurements.filter((y) => y.id !== m.id) }));
      setDraft(null);
    }
  };

  return (
    <Section id="s6" title="6 Tijdlijn: ademhalingsondersteuning, monitorgegevens en bloedgassen">
      {!draft && (
        <button type="button" className="primary" onClick={startNew}>
          + Nieuw meetmoment
        </button>
      )}
      {draft && (
        <MeasurementEditor
          key={draft.id}
          draft={draft}
          setDraft={setDraft}
          tubes={t.tubes}
          isNew={isNew}
          proposed={isNew && !!draft.resp.mode}
          onSave={save}
          onCancel={() => setDraft(null)}
          onDelete={isNew ? undefined : () => void remove(draft)}
        />
      )}
      {rows.length === 0 ? (
        !draft && <p className="muted">Nog geen meetmomenten.</p>
      ) : (
        <>
          <DataTable
            table={table}
            caption="Tijdlijn: één rij per meetmoment"
            rotatedHeaders
            rowClassName={(r) => (draft && !isNew && draft.id === rows[r].id ? 'editing' : '')}
            renderKeyCell={(r, v) => (
              <button
                type="button"
                className="row-edit"
                aria-label={`Meetmoment van ${formatInstant(rows[r].at, tz) || 'onbekend tijdstip'} bewerken`}
                onClick={() => {
                  setDraft(structuredClone(rows[r]));
                  setIsNew(false);
                }}
              >
                <span className="pre">{v}</span> <span aria-hidden="true">✎</span>
              </button>
            )}
          />
        </>
      )}
    </Section>
  );
}
