import { useState } from 'react';
import { formatInstant, formatLocalDate } from '../domain/time';
import type { TransportSummary } from '../storage/repository';
import { isValidTimeZone, type AppSettings, type DeviceKind } from '../storage/settings';
import { DEFAULT_MEDICATION_ROUTES } from '../domain/labels';
import { childLabel, useTimeZone } from './context';
import { useConfirm } from './confirm';
import { Logo } from './icons';
import type { Transport } from '../domain/types';
import { decodeHandover, HandoverError } from '../storage/handover';

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
        <label className="check-setting">
          <input type="checkbox" checked={settings.abcdLettersOnly} onChange={(e) => onChange({ ...settings, abcdLettersOnly: e.target.checked })} />
          <span>Bij Airway, Breathing, Circulation enz. alleen de letter tonen (A, B, C …), links van het invulveld</span>
        </label>
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

/**
 * Keuze werk- of persoonlijk apparaat. Op een persoonlijk apparaat worden transporten anoniem vastgelegd (geen naam
 * en geen patiëntnummer). Bij overstappen naar persoonlijk worden die gegevens na bevestiging uit bestaande concepten gehaald.
 */
function DeviceChoice({ items, settings, onSettings, onAnonymizeAll }: { items: TransportSummary[]; settings: AppSettings; onSettings: (s: AppSettings) => void; onAnonymizeAll: () => void }) {
  const confirm = useConfirm();
  const choose = async (device: DeviceKind) => {
    if (device === settings.device) return;
    if (device === 'persoonlijk') {
      const n = items.filter((i) => i.childName.trim() || i.patientNumber.trim()).length;
      if (n > 0) {
        const ok = await confirm(
          `Op dit apparaat ${n === 1 ? 'staat 1 concept' : `staan ${n} concepten`} met naam of patiëntnummer. Bij een persoonlijk apparaat worden naam en patiëntnummer uit ${n === 1 ? 'dat concept' : 'die concepten'} verwijderd; de geboortedatum en alle andere gegevens blijven. Doorgaan?`,
          'Anoniem maken',
        );
        if (!ok) return;
        onAnonymizeAll();
      }
    }
    onSettings({ ...settings, device });
  };
  const options: { value: DeviceKind; title: string; text: string }[] = [
    { value: 'werk', title: 'Werkapparaat', text: 'Computer, tablet of telefoon van de instelling. Naam en patiëntnummer kunnen worden ingevuld.' },
    { value: 'persoonlijk', title: 'Persoonlijk apparaat', text: 'Eigen telefoon of tablet. Transporten worden anoniem vastgelegd: geen naam en geen patiëntnummer (geboortedatum wel).' },
  ];
  return (
    <fieldset className="card device-choice">
      <legend>Op welk apparaat werk je?</legend>
      <div className="device-options">
        {options.map((o) => (
          <label key={o.value} className={`device-option ${settings.device === o.value ? 'checked' : ''}`}>
            <input type="radio" name="device" value={o.value} checked={settings.device === o.value} onChange={() => void choose(o.value)} />
            <span>
              <strong>{o.title}</strong>
              <span className="device-text">{o.text}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="muted small-print">
        Ingevulde gegevens worden alleen lokaal op dit apparaat bewaard. Op een apparaat van je werk geldt het privacybeleid van je organisatie. Op een persoonlijk apparaat kan je geen herleidbare
        patiëntgegevens invullen, zoals naam of patiëntnummer.
      </p>
    </fieldset>
  );
}

/** Overdracht van een collega inlezen: geplakte e-mail of code, of een overdrachtsbestand. */
function ImportPanel({ items, onImport, onClose }: { items: TransportSummary[]; onImport: (t: Transport) => void; onClose: () => void }) {
  const tz = useTimeZone();
  const confirm = useConfirm();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (input: string) => {
    setBusy(true);
    setError(null);
    try {
      const { transport } = await decodeHandover(input);
      const existing = items.find((i) => i.id === transport.id);
      if (existing) {
        const ok = await confirm(
          `Dit transport (${existing.childName || 'zonder naam'}) staat al op dit apparaat, laatst opgeslagen ${new Date(existing.updatedAt).toLocaleString('nl-NL', { timeZone: tz })}. Vervangen door de ontvangen versie?`,
          'Vervangen',
        );
        if (!ok) return;
      }
      onImport(transport);
    } catch (e) {
      setError(e instanceof HandoverError ? e.message : 'Importeren is mislukt.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card import-panel" aria-label="Transport importeren">
      <h2>Transport importeren</h2>
      <div className="field">
        <label className="field-label" htmlFor="import-text">
          Plak de overdrachtsmail of de overdrachtscode
        </label>
        <textarea id="import-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="import-file">
          Of open een overdrachtsbestand
        </label>
        <input
          id="import-file"
          type="file"
          accept=".txt,text/plain"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void file.text().then(run);
          }}
        />
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button type="button" className="primary" disabled={busy || text.trim() === ''} onClick={() => void run(text)}>
          Importeren
        </button>
        <button type="button" className="secondary" onClick={onClose}>
          Annuleren
        </button>
      </div>
    </section>
  );
}

export function TransportList({ items, onOpen, onNew, onSample, onDelete, onImport, onAnonymizeAll, settings, onSettings }: { items: TransportSummary[]; onOpen: (id: string) => void; onNew: () => void; onSample: () => void; onDelete: (id: string) => void; onImport: (t: Transport) => void; onAnonymizeAll: () => void; settings: AppSettings; onSettings: (s: AppSettings) => void }) {
  const tz = useTimeZone();
  const confirm = useConfirm();
  const [importing, setImporting] = useState(false);
  return (
    <div className="home">
      <header className="home-header">
        <Logo className="home-logo" />
        <h1>Neo.Cab</h1>
      </header>
      <main>
        <DeviceChoice items={items} settings={settings} onSettings={onSettings} onAnonymizeAll={onAnonymizeAll} />
        <div className="button-row">
          <button type="button" className="primary large" onClick={onNew}>
            + Nieuw transport
          </button>
          <button type="button" className="secondary" onClick={onSample}>
            Fictief voorbeeldtransport laden
          </button>
          {!importing && (
            <button type="button" className="secondary" onClick={() => setImporting(true)}>
              Transport importeren
            </button>
          )}
        </div>
        {importing && <ImportPanel items={items} onImport={onImport} onClose={() => setImporting(false)} />}
        <h2>Opgeslagen concepten</h2>
        {items.length === 0 ? (
          <p className="muted">Er zijn nog geen concepten op dit apparaat.</p>
        ) : (
          <ul className="concepts">
            {items.map((s) => (
              <li key={s.id} className="card concept">
                <div>
                  <strong>{childLabel(s.childName, settings.device === 'persoonlijk')}</strong>
                  <div className="muted">
                    {s.patientNumber ? `Pt.nr. ${s.patientNumber} · ` : ''}
                    {s.birthDate ? `Geboren ${formatLocalDate(s.birthDate)} · ` : ''}
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
