import { useEffect, useMemo, useState } from 'react';
import { newTransport } from './domain/factory';
import { sampleTransport } from './domain/sample';
import { LocalStorageTransportRepository } from './storage/localRepository';
import { loadSettings, saveSettings, type AppSettings } from './storage/settings';
import { SettingsContext } from './ui/context';
import { Editor } from './ui/Editor';
import { ReportView } from './ui/ReportView';
import { TransportList } from './ui/TransportList';

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
  const repo = useMemo(() => new LocalStorageTransportRepository(window.localStorage), []);
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings(window.localStorage));
  const [listVersion, setListVersion] = useState(0);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const items = useMemo(() => repo.list(), [repo, listVersion, route]);

  let content;
  if (route.name === 'home') {
    content = (
      <TransportList
        items={items}
        settings={settings}
        onSettings={(s) => {
          saveSettings(window.localStorage, s);
          setSettings(s);
        }}
        onOpen={(id) => navigate(`#/t/${id}`)}
        onNew={() => {
          const t = repo.save(newTransport(settings.timeZone));
          navigate(`#/t/${t.id}`);
        }}
        onSample={() => {
          const t = repo.save(sampleTransport(settings.timeZone));
          navigate(`#/t/${t.id}`);
        }}
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

  return <SettingsContext.Provider value={settings}>{content}</SettingsContext.Provider>;
}
