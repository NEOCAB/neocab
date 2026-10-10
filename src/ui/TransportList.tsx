import { useState } from 'react';
import { formatInstant } from '../domain/time';
import type { TransportSummary } from '../storage/repository';
import { isValidTimeZone, type AppSettings } from '../storage/settings';
import { DEFAULT_MEDICATION_ROUTES } from '../domain/labels';
import { useTimeZone } from './context';
import { useConfirm } from './confirm';
import { Logo } from './icons';

const TIME_ZONES = ['Europe/Amsterdam', 'Europe/Brussels', 'Europe/London', 'UTC'];

function SettingsPanel({ settings, onChange }: { settings: AppSettings; onChange: (s: AppSettings) => void }) {
  const [routesText, setRoutesText] = useState(settings.medicationRoutes.join('\n'));
  const [saved, setSaved] = useState(false);
  return (
    <details className="card settings">
      <summary>Instellingen</summary>
      <div className="field">
        <label className="field-label" htmlFor="tz">
          Tijdzone voor weergave en invoer
        </label>
        <select id="tz" value={settings.timeZone} onChange={(e) => isValidTimeZone(e.target.value) && onChange({ ...settings, timeZone: e.target.value })}>
          {[...new Set([settings.timeZone, ...TIME_ZONES])].map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        <div className="field-hint">Tijdstippen worden altijd met UTC-offset opgeslagen; dit bepaalt alleen de lokale weergave.</div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="routes">
          Opties toedieningsroute medicatie (één per regel)
        </label>
        <textarea id="routes" rows={8} value={routesText} onChange={(e) => { setRoutesText(e.target.value); setSaved(false); }} />
      </div>
      <div className="button-row">
        <button
          type="button"
          className="primary"
          onClick={() => {
            onChange({ ...settings, medicationRoutes: routesText.split('\n').map((r) => r.trim()).filter(Boolean) });
            setSaved(true);
          }}
        >
          Routes opslaan
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setRoutesText(DEFAULT_MEDICATION_ROUTES.join('\n'));
            setSaved(false);
          }}
        >
          Standaardlijst herstellen
        </button>
        {saved && <span role="status">Opgeslagen.</span>}
      </div>
    </details>
  );
}

export function TransportList({ items, onOpen, onNew, onSample, onDelete, settings, onSettings }: { items: TransportSummary[]; onOpen: (id: string) => void; onNew: () => void; onSample: () => void; onDelete: (id: string) => void; settings: AppSettings; onSettings: (s: AppSettings) => void }) {
  const tz = useTimeZone();
  const confirm = useConfirm();
  return (
    <div className="home">
      <header className="home-header">
        <Logo className="home-logo" />
        <div>
          <h1>Neo.Cab</h1>
          <p className="muted">Prototype · concepten worden alleen lokaal in deze browser op dit apparaat bewaard.</p>
        </div>
      </header>
      <main>
        <div className="button-row">
          <button type="button" className="primary large" onClick={onNew}>
            + Nieuw transport
          </button>
          <button type="button" className="secondary" onClick={onSample}>
            Fictief voorbeeldtransport laden
          </button>
        </div>
        <h2>Opgeslagen concepten</h2>
        {items.length === 0 ? (
          <p className="muted">Er zijn nog geen concepten op dit apparaat.</p>
        ) : (
          <ul className="concepts">
            {items.map((s) => (
              <li key={s.id} className="card concept">
                <div>
                  <strong>{s.childName || 'Naam kind niet ingevuld'}</strong>
                  <div className="muted">
                    {s.patientNumber ? `Pt.nr. ${s.patientNumber} · ` : ''}
                    Verwijzing {formatInstant(s.referredAt, tz) || '—'}
                    {s.referringHospital ? ` · ${s.referringHospital}` : ''}
                  </div>
                  <div className="muted small-print">Laatst opgeslagen {new Date(s.updatedAt).toLocaleString('nl-NL', { timeZone: tz })}</div>
                </div>
                <div className="card-actions">
                  <button type="button" className="primary" onClick={() => onOpen(s.id)}>
                    Hervatten
                  </button>
                  <button
                    type="button"
                    className="link-button danger"
                    onClick={() => {
                      void confirm(`Concept "${s.childName || 'zonder naam'}" definitief verwijderen van dit apparaat?`).then((ok) => ok && onDelete(s.id));
                    }}
                  >
                    Verwijderen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <SettingsPanel settings={settings} onChange={onSettings} />
      </main>
    </div>
  );
}
