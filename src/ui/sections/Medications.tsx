import type { MedicationAdministration } from '../../domain/types';
import { DOSE_UNIT_SUGGESTIONS } from '../../domain/labels';
import { newMedication } from '../../domain/factory';
import { formatInstant } from '../../domain/time';
import { DateTimeField, NumberField, Section, SelectField, TextArea, TextField } from '../fields';
import { useSettings } from '../context';
import type { SectionProps } from './BasicSections';

export function MedicationsSection({ t, update }: SectionProps) {
  const { timeZone, medicationRoutes } = useSettings();
  const setMed = (id: string, patch: Partial<MedicationAdministration>) =>
    update((x) => ({ ...x, medications: x.medications.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  // Invoervolgorde tijdens bewerken (kaarten springen niet weg); het verslag sorteert chronologisch.
  const meds = t.medications;
  return (
    <Section id="s8" title="8 Medicatietoedieningen">
      <TextArea label="Allergieën" value={t.allergies} onChange={(v) => update((x) => ({ ...x, allergies: v }))} rows={2} />
      <div className="list">
        {meds.length === 0 && <p className="muted">Nog geen toedieningen geregistreerd.</p>}
        {meds.map((m, i) => {
          const routeOptions = [...new Set([...medicationRoutes, ...(m.route ? [m.route] : [])])].map((r) => ({ value: r, label: r }));
          return (
            <article className="card" key={m.id} aria-label={`Toediening ${i + 1}`}>
              <div className="grid">
                <DateTimeField label="Datum en tijd toediening" value={m.at} onChange={(v) => setMed(m.id, { at: v })} />
                <TextField label="Medicament" value={m.name} onChange={(v) => setMed(m.id, { name: v })} />
                <div className="grid two tight">
                  <NumberField label="Dosis" value={m.dose} onChange={(v) => setMed(m.id, { dose: v })} rules={{ min: 0 }} />
                  <TextField label="Eenheid dosis" value={m.doseUnit} onChange={(v) => setMed(m.id, { doseUnit: v })} list={DOSE_UNIT_SUGGESTIONS} />
                </div>
                <SelectField label="Toedieningsroute" value={m.route} onChange={(v) => setMed(m.id, { route: v })} options={routeOptions} />
              </div>
              <div className="card-actions end">
                <button
                  type="button"
                  className="link-button danger"
                  onClick={() => {
                    if (window.confirm(`Toediening ${m.name || ''} van ${formatInstant(m.at, timeZone) || 'onbekend tijdstip'} verwijderen?`)) {
                      update((x) => ({ ...x, medications: x.medications.filter((y) => y.id !== m.id) }));
                    }
                  }}
                >
                  Toediening verwijderen
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <button type="button" className="primary" onClick={() => update((x) => ({ ...x, medications: [...x.medications, newMedication(timeZone)] }))}>
        + Toediening toevoegen
      </button>
      <p className="muted small-print">Opties voor toedieningsroute zijn aan te passen via Instellingen op het startscherm.</p>
    </Section>
  );
}
