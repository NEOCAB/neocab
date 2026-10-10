import { useEffect, useRef, useState } from 'react';
import type { MedicationAdministration } from '../../domain/types';
import { DOSE_UNIT_SUGGESTIONS } from '../../domain/labels';
import { newMedication } from '../../domain/factory';
import { formatInstant } from '../../domain/time';
import { medicationTable } from '../../report/buildReport';
import { DataTable, TimeStamp } from '../DataTable';
import { AddButton, DateTimeField, NumberField, Section, SelectField, TextField } from '../fields';
import { useSettings } from '../context';
import { useConfirm } from '../confirm';
import type { SectionProps } from './BasicSections';

/** Invoer of wijziging van één toediening; pas bij Opslaan vastgelegd. */
function MedicationEditor({ draft, setDraft, isNew, onSave, onCancel, onDelete }: { draft: MedicationAdministration; setDraft: (m: MedicationAdministration) => void; isNew: boolean; onSave: () => void; onCancel: () => void; onDelete?: () => void }) {
  const { medicationRoutes } = useSettings();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);
  const routeOptions = [...new Set([...medicationRoutes, ...(draft.route ? [draft.route] : [])])].map((r) => ({ value: r, label: r }));
  const title = isNew ? 'Nieuwe toediening' : 'Toediening bewerken';
  return (
    <form
      ref={ref}
      className="card editor"
      aria-label={title}
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <h3>{title}</h3>
      <div className="grid">
        <DateTimeField label="Datum en tijd toediening" value={draft.at} onChange={(v) => setDraft({ ...draft, at: v })} />
        <TextField label="Medicament" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
        <div className="grid two tight">
          <NumberField label="Dosis" value={draft.dose} onChange={(v) => setDraft({ ...draft, dose: v })} rules={{ min: 0 }} />
          <TextField label="Eenheid dosis" value={draft.doseUnit} onChange={(v) => setDraft({ ...draft, doseUnit: v })} list={DOSE_UNIT_SUGGESTIONS} />
        </div>
        <SelectField label="Toedieningsroute" value={draft.route} onChange={(v) => setDraft({ ...draft, route: v })} options={routeOptions} />
      </div>
      <div className="editor-actions">
        <button type="submit" className="primary">
          Toediening opslaan
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

export function MedicationsSection({ t, update }: SectionProps) {
  const { timeZone } = useSettings();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<MedicationAdministration | null>(null);
  const [isNew, setIsNew] = useState(false);
  // Tabel chronologisch; tik op de tijd om een toediening te bewerken.
  const { table, rows } = medicationTable(t.medications, timeZone);

  const save = () => {
    if (!draft) return;
    update((x) => ({ ...x, medications: x.medications.some((m) => m.id === draft.id) ? x.medications.map((m) => (m.id === draft.id ? draft : m)) : [...x.medications, draft] }));
    setDraft(null);
  };
  const remove = async (m: MedicationAdministration) => {
    if (await confirm(`Toediening ${m.name || ''} van ${formatInstant(m.at, timeZone) || 'onbekend tijdstip'} verwijderen?`)) {
      update((x) => ({ ...x, medications: x.medications.filter((y) => y.id !== m.id) }));
      setDraft(null);
    }
  };

  return (
    <Section
      id="s8"
      title="Medicatie"
      actions={
        !draft && (
          <AddButton
            label="Toevoegen"
            onClick={() => {
              setDraft(newMedication(timeZone));
              setIsNew(true);
            }}
          />
        )
      }
    >
      {draft && <MedicationEditor key={draft.id} draft={draft} setDraft={setDraft} isNew={isNew} onSave={save} onCancel={() => setDraft(null)} onDelete={isNew ? undefined : () => void remove(draft)} />}
      {rows.length === 0 ? (
        !draft && <p className="muted">Nog geen toedieningen geregistreerd.</p>
      ) : (
        <DataTable
          table={table}
          caption="Medicatie: één rij per toediening"
          rowClassName={(r) => (draft && !isNew && draft.id === rows[r].id ? 'editing' : '')}
          renderKeyCell={(r, v) => (
            <button
              type="button"
              className="row-edit"
              aria-label={`Toediening ${rows[r].name || ''} van ${formatInstant(rows[r].at, timeZone) || 'onbekend tijdstip'} bewerken`}
              onClick={() => {
                setDraft({ ...rows[r] });
                setIsNew(false);
              }}
            >
              <TimeStamp value={v} />
              <span className="edit-icon" aria-hidden="true">
                ✎
              </span>
            </button>
          )}
        />
      )}
      <p className="muted small-print">Opties voor toedieningsroute zijn aan te passen via Instellingen op het startscherm.</p>
    </Section>
  );
}
