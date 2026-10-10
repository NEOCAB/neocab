import { useEffect, useMemo, useState } from 'react';
import { newTransport } from './domain/factory';
import type { Transport } from './domain/types';
import { sampleTransport } from './domain/sample';
import { LocalStorageTransportRepository } from './storage/localRepository';
import { loadSettings, saveSettings, type AppSettings } from './storage/settings';
import { SettingsContext } from './ui/context';
import { Editor } from './ui/Editor';
import { ReportView } from './ui/ReportView';
import { TransportList } from './ui/TransportList';
import { ConfirmProvider } from './ui/confirm';
import { safeStorage } from './storage/safeStorage';

type Route = { name: 'home' } | { name: 'edit'; id: string } | { name: 'report'; id: string };

function parseHash(hash: string): Route {
  const m = /^#\/t\/([^/]+)(\/verslag)?$/.exec(hash);
  if (!m) return { name: 'home' };
  return m[2] ? { name: 'report', id: decodeURIComponent(m[1]) } : { name: 'edit', id: decodeURIComponent(m[1]) };
}

function navigate(hash: string) {
  window.location.hash = hash;
}

export function App() {
  const { storage, persistent } = useMemo(() => safeStorage(), []);
  const repo = useMemo(() => new LocalStorageTransportRepository(storage), [storage]);
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings(storage));
  const [listVersion, setListVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const items = useMemo(() => repo.list(), [repo, listVersion, route]);

  const open = (t: Transport) => {
    try {
      navigate(`#/t/${repo.save(t).id}`);
      setError(null);
    } catch {
      setError('Opslaan in de lokale opslag is mislukt. Verwijder oude concepten en probeer het opnieuw.');
    }
  };

  let content;
  if (route.name === 'home') {
    content = (
      <TransportList
        items={items}
        settings={settings}
        onSettings={(s) => {
          try {
            saveSettings(storage, s);
          } catch {
            /* instelling geldt dan alleen voor deze sessie */
          }
          setSettings(s);
        }}
        onOpen={(id) => navigate(`#/t/${id}`)}
        onNew={() => open(newTransport(settings.timeZone))}
        onSample={() => open(sampleTransport(settings.timeZone))}
        onImport={(t) => open(t)}
        onDelete={(id) => {
          repo.remove(id);
          setListVersion((v) => v + 1);
        }}
      />
    );
  } else {
    const t = repo.load(route.id);
    if (!t) {
      content = (
        <main className="home">
          <h1>Registratie niet gevonden</h1>
          <p>Dit concept bestaat niet (meer) in de lokale opslag van deze browser.</p>
          <button type="button" className="primary" onClick={() => navigate('#/')}>
            Naar overzicht
          </button>
        </main>
      );
    } else if (route.name === 'edit') {
      content = <Editor key={t.id} initial={t} repo={repo} onExit={() => navigate('#/')} onReport={() => navigate(`#/t/${t.id}/verslag`)} />;
    } else {
      content = <ReportView transport={t} onBack={() => navigate(`#/t/${t.id}`)} />;
    }
  }

  return (
    <SettingsContext.Provider value={settings}>
      <ConfirmProvider>
        {!persistent && (
          <p className="storage-warning" role="alert">
            Lokale opslag is in deze browser niet beschikbaar. Gegevens gaan verloren bij sluiten of herladen.
          </p>
        )}
        {error && (
          <p className="storage-warning" role="alert">
            {error}
          </p>
        )}
        {content}
      </ConfirmProvider>
    </SettingsContext.Provider>
  );
}
