import { useCallback, useEffect, useRef, useState } from 'react';
import type { Transport } from '../domain/types';
import { formatInstant } from '../domain/time';
import type { TransportRepository } from '../storage/repository';
import { useTimeZone } from './context';
import { SectionIcon } from './icons';
import {
  BirthSection,
  ChecklistSection,
  ChildSection,
  ClosureSection,
  DispatchSection,
  OtherDiagnosticsSection,
  ParentsSection,
  ProceduresSection,
  ReferralConditionSection,
  ReferralSection,
  TeamAssessmentSection,
  type Update,
} from './sections/BasicSections';
import { TimelineSection } from './sections/Timeline';
import { MedicationsSection } from './sections/Medications';
import { InfusionsSection } from './sections/Infusions';
import { LinesSection } from './sections/Lines';

export const SECTIONS = [
  { id: 's1', label: '1 Basisgegevens kind' },
  { id: 's2', label: '2 Verwijzing en bestemming' },
  { id: 's3', label: '3 Zwangerschap en geboorte' },
  { id: 's4', label: '4 Toestand bij verwijzing' },
  { id: 'sdispatch', label: '5 Dispatch' },
  { id: 's5', label: '6 Onderzoek transportteam' },
  { id: 's6', label: '7 Tijdlijn' },
  { id: 's7', label: '8 Overige diagnostiek' },
  { id: 's8', label: '9 Medicatie' },
  { id: 's9', label: '10 Infusen' },
  { id: 's10', label: '11 Lijnen, sondes, tube' },
  { id: 's11', label: '12 Procedures en gebeurtenissen' },
  { id: 's12', label: '13 Ouders en gezin' },
  { id: 's13', label: '14 Checklist voor vertrek' },
  { id: 's14', label: '15 Afsluiting transport' },
];

function goToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
}

const AUTOSAVE_MS = 700;

export function Editor({ initial, repo, onExit, onReport }: { initial: Transport; repo: TransportRepository; onExit: () => void; onReport: () => void }) {
  const tz = useTimeZone();
  const [t, setT] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(initial.updatedAt);
  const [saveError, setSaveError] = useState<string | null>(null);
  const latest = useRef(t);
  latest.current = t;
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const update: Update = useCallback((fn) => {
    setT((prev) => fn(prev));
    setDirty(true);
  }, []);

  const saveNow = useCallback(() => {
    try {
      const saved = repo.save(latest.current);
      setSavedAt(saved.updatedAt);
      setDirty(false);
      setSaveError(null);
      return true;
    } catch (e) {
      setSaveError(e instanceof Error && e.name === 'QuotaExceededError' ? 'Lokale opslag is vol. Verwijder oude concepten.' : 'Opslaan in lokale opslag is mislukt.');
      return false;
    }
  }, [repo]);

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
  const savedLabel = savedAt ? new Date(savedAt).toLocaleTimeString('nl-NL', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;

  return (
    <div className="editor-layout">
      <header className="topbar" role="banner">
        <button type="button" className="ghost back" onClick={() => { saveNow(); onExit(); }} aria-label="Terug naar overzicht van concepten">
          ← Overzicht
        </button>
        <div className="active-transport">
          <span className="active-label">Actieve registratie</span>
          <strong>{t.child.name || 'Naam kind niet ingevuld'}</strong>
          <span className="muted">
            {t.child.patientNumber ? `Pt.nr. ${t.child.patientNumber} · ` : ''}verwijzing {formatInstant(t.referral.referredAt, tz) || '—'}
          </span>
          <span className={`save-status ${saveError ? 'error' : dirty ? 'pending' : 'ok'}`} role="status">
            {saveError ?? (dirty ? 'Wijzigingen worden opgeslagen…' : savedLabel ? `Concept lokaal opgeslagen ${savedLabel}` : 'Nog niet opgeslagen')}
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
          <button type="button" className="secondary small" onClick={saveNow} aria-label="Concept opslaan">
            <span className="show-wide">Concept opslaan</span>
            <span className="show-narrow">Opslaan</span>
          </button>
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
                  <SectionIcon title={s.label} />
                  <span>{s.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <main className="form" id="main">
          <ChildSection {...props} />
          <ReferralSection {...props} />
          <BirthSection {...props} />
          <ReferralConditionSection {...props} />
          <DispatchSection {...props} />
          <TeamAssessmentSection {...props} />
          <TimelineSection {...props} />
          <OtherDiagnosticsSection {...props} />
          <MedicationsSection {...props} />
          <InfusionsSection {...props} />
          <LinesSection {...props} />
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
