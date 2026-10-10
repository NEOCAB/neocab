import { useCallback, useEffect, useRef, useState } from 'react';
import type { Transport } from '../domain/types';
import { formatInstant } from '../domain/time';
import type { TransportRepository } from '../storage/repository';
import { childLabel, useAnonymous, useTimeZone } from './context';
import { Logo, SaveIcon, SectionIcon } from './icons';
import { saveLevel } from './saveStatus';
import {
  ChecklistSection,
  ChildSection,
  ClosureSection,
  DispatchSection,
  OtherDiagnosticsSection,
  ParentsSection,
  ProceduresSection,
  ReferralInfoSection,
  ReferralSection,
  TeamAssessmentSection,
  type Update,
} from './sections/BasicSections';
import { TimelineSection } from './sections/Timeline';
import { MedicationsSection } from './sections/Medications';
import { InfusionsSection } from './sections/Infusions';
import { LinesSection } from './sections/Lines';

export const SECTIONS = [
  { id: 's1', label: 'Basisgegevens kind' },
  { id: 's2', label: 'Herkomst en bestemming' },
  { id: 's3', label: 'Verwijzing' },
  { id: 'sdispatch', label: 'Dispatch' },
  { id: 's5', label: 'Stabilisatie' },
  { id: 's6', label: 'Tijdlijn' },
  { id: 's7', label: 'Overige diagnostiek' },
  { id: 's10', label: 'Plastic' },
  { id: 's8', label: 'Medicatie' },
  { id: 's9', label: 'Infusen' },
  { id: 's11', label: 'Notities' },
  { id: 's12', label: 'Gezin' },
  { id: 's13', label: 'Checklist voor vertrek' },
  { id: 's14', label: 'Transport' },
];

function goToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
}

const AUTOSAVE_MS = 700;

function savedTimeLabel(savedAt: string | null, tz: string): string | null {
  return savedAt ? new Date(savedAt).toLocaleTimeString('nl-NL', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;
}

export function Editor({ initial, repo, onExit, onReport }: { initial: Transport; repo: TransportRepository; onExit: () => void; onReport: () => void }) {
  const tz = useTimeZone();
  const [t, setT] = useState(initial);
  const anonymous = useAnonymous();
  const [dirty, setDirty] = useState(false);
  // Sinds wanneer wijzigingen wachten op opslag (voor de kleur van de opslagstatus).
  const [pendingSince, setPendingSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [savedAt, setSavedAt] = useState<string | null>(initial.updatedAt);
  const [saveError, setSaveError] = useState<string | null>(null);
  const latest = useRef(t);
  latest.current = t;
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const update: Update = useCallback((fn) => {
    setT((prev) => fn(prev));
    setDirty(true);
    setPendingSince((p) => p ?? Date.now());
  }, []);

  const saveNow = useCallback(() => {
    try {
      const saved = repo.save(latest.current);
      setSavedAt(saved.updatedAt);
      setDirty(false);
      setPendingSince(null);
      setSaveError(null);
      return true;
    } catch (e) {
      setSaveError(e instanceof Error && e.name === 'QuotaExceededError' ? 'Lokale opslag is vol. Verwijder oude concepten.' : 'Opslaan in lokale opslag is mislukt.');
      return false;
    }
  }, [repo]);

  // Klok voor de opslagstatus, alleen zolang er iets wacht op opslag.
  useEffect(() => {
    if (pendingSince === null) return;
    setNow(Date.now());
    const h = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(h);
  }, [pendingSince]);
  const level = saveLevel(pendingSince, now, !!saveError);
  const savedLabel = savedTimeLabel(savedAt, tz);
  // Alleen een icoon in beeld; de tekst staat in de tooltip en is voor schermlezers.
  const saveText =
    saveError ??
    (level === 'error' ? 'Wijzigingen zijn al langer dan een minuut niet opgeslagen' : level === 'waiting' ? 'Wijzigingen wachten op opslag' : dirty ? 'Opslaan…' : savedLabel ? `Concept lokaal opgeslagen om ${savedLabel}` : 'Nog niet opgeslagen');

  // Automatische conceptopslag kort na elke wijziging.
  useEffect(() => {
    if (!dirty) return;
    const h = window.setTimeout(saveNow, AUTOSAVE_MS);
    return () => window.clearTimeout(h);
  }, [t, dirty, saveNow]);

  // Opslaan bij verlaten van de pagina of wegklikken van de app.
  useEffect(() => {
    const flush = () => {
      if (dirtyRef.current) saveNow();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
      flush();
    };
  }, [saveNow]);

  const props = { t, update };

  return (
    <div className="editor-layout">
      <header className="topbar" role="banner">
        {/* Logo en naam: terug naar het overzicht van concepten (er wordt eerst opgeslagen). */}
        <button
          type="button"
          className="topbar-brand"
          onClick={() => {
            saveNow();
            onExit();
          }}
          aria-label="Neo.Cab – terug naar overzicht van concepten"
          title="Terug naar overzicht"
        >
          <Logo className="topbar-logo" />
          <span className="topbar-name">Neo.Cab</span>
        </button>
        <div className="active-transport">
          <strong>{childLabel(t.child.name, anonymous)}</strong>
          <span className="muted">
            {t.child.patientNumber ? `Pt.nr. ${t.child.patientNumber} · ` : ''}verwijzing {formatInstant(t.referral.referredAt, tz) || '—'}
          </span>
        </div>
        <div className="topbar-actions">
          <div className="section-jump">
            <label htmlFor="section-jump" className="sr-only">
              Ga naar sectie
            </label>
            <select
              id="section-jump"
              value=""
              onChange={(e) => {
                if (e.target.value) goToSection(e.target.value);
              }}
            >
              <option value="">Ga naar sectie…</option>
              {SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {/* Opslagstatus links van Verslag & export; op een smal scherm alleen icoon en tijd. */}
          <span className={`save-status ${level}`} role="status" title={saveText}>
            <SaveIcon clock={level !== 'ok'} />
            <span className="sr-only">{saveText}</span>
          </span>
          <button type="button" className="primary small" onClick={() => { saveNow(); onReport(); }}>
            Verslag<span className="wide-only"> &amp; export</span>
          </button>
        </div>
      </header>
      <div className="editor-body">
        <nav className="sidenav" aria-label="Secties">
          <ul>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    goToSection(s.id);
                  }}
                >
                  <SectionIcon id={s.id} />
                  <span>{s.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <main className="form" id="main">
          <ChildSection {...props} />
          <ReferralSection {...props} />
          <ReferralInfoSection {...props} />
          <DispatchSection {...props} />
          <TeamAssessmentSection {...props} />
          <TimelineSection {...props} />
          <OtherDiagnosticsSection {...props} />
          <LinesSection {...props} />
          <MedicationsSection {...props} />
          <InfusionsSection {...props} />
          <ProceduresSection {...props} />
          <ParentsSection {...props} />
          <ChecklistSection {...props} />
          <ClosureSection {...props} />
          <div className="form-end">
            <button type="button" className="primary" onClick={() => { saveNow(); onReport(); }}>
              Naar verslag &amp; export
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
