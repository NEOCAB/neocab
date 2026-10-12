import { useEffect, useState } from 'react';
import { coordsOf, fetchRoute, formatDuration, formatKm, mapLinks, type RouteInfo } from '../domain/route';

/** Eerder opgehaalde routes (per paar ziekenhuizen), 5 minuten geldig (het verkeer verandert). */
const cache = new Map<string, { at: number; route: RouteInfo | null }>();
const CACHE_MS = 5 * 60_000;
const cached = (key: string) => {
  const c = cache.get(key);
  return c && Date.now() - c.at < CACHE_MS ? c : undefined;
};

/**
 * Route en reistijd van verwijzend naar ontvangend ziekenhuis. Verschijnt zodra beide zijn ingevuld.
 * Alleen ter informatie: rijtijd voor een gewone auto (met actueel verkeer via TomTom, anders zonder).
 */
export function RouteBox({ from, to }: { from: string; to: string }) {
  const a = coordsOf(from);
  const b = coordsOf(to);
  const key = `${from}→${to}`;
  const [route, setRoute] = useState<RouteInfo | null | undefined>(() => cached(key)?.route);

  useEffect(() => {
    if (!a || !b) return;
    const hit = cached(key);
    if (hit) {
      setRoute(hit.route);
      return;
    }
    setRoute(undefined);
    const ctl = new AbortController();
    // Kort wachten, zodat niet bij elke toetsaanslag een route wordt gevraagd.
    const h = window.setTimeout(() => {
      void fetchRoute(a, b, ctl.signal).then((r) => {
        if (ctl.signal.aborted) return;
        cache.set(key, { at: Date.now(), route: r });
        setRoute(r);
      });
    }, 500);
    return () => {
      window.clearTimeout(h);
      ctl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!from.trim() || !to.trim()) return null;
  const links = mapLinks(from, to);

  return (
    <section className="route-box" aria-label="Route en reistijd">
      <h3 className="route-title">Route en reistijd</h3>
      <p className="route-path">
        <span>{from}</span>
        <span className="route-arrow" aria-hidden="true">
          →
        </span>
        <span className="sr-only"> naar </span>
        <span>{to}</span>
      </p>
      {!a || !b ? (
        <p className="muted small-print">Geen reistijd: een van de ziekenhuizen staat niet in de keuzelijst. Gebruik een routeplanner.</p>
      ) : route === undefined ? (
        <p className="muted small-print" role="status">
          Route wordt opgehaald…
        </p>
      ) : route === null ? (
        <p className="muted small-print" role="status">
          Reistijd niet beschikbaar: de routeplanner is niet bereikbaar. Gebruik een routeplanner hieronder.
        </p>
      ) : (
        <>
          <p className="route-figures">
            <strong>{formatDuration(route.minutes)}</strong>
            <span className="route-sep" aria-hidden="true">
              ·
            </span>
            <strong>{formatKm(route.km)}</strong>
            {route.roads.length > 0 && <span className="route-roads">via {route.roads.join(' – ')}</span>}
          </p>
          <p className="muted small-print" role="status">
            {route.source === 'tomtom'
              ? `Rijtijd met de auto bij het actuele verkeer (TomTom)${(route.trafficDelayMinutes ?? 0) >= 1 ? `, waarvan ${Math.round(route.trafficDelayMinutes!)} min vertraging door verkeer` : ''}.`
              : 'Rijtijd met de auto zonder actueel verkeer (OpenStreetMap-routeplanner).'}
          </p>
        </>
      )}
      <div className="route-links">
        <a className="button secondary" href={links.google} target="_blank" rel="noopener noreferrer">
          Route in Google Maps
        </a>
        <a className="button secondary" href={links.apple} target="_blank" rel="noopener noreferrer">
          Route in Apple Kaarten
        </a>
      </div>
    </section>
  );
}
