import { HOSPITAL_COORDS } from './hospitals';

/**
 * Route en reistijd tussen verwijzend en ontvangend ziekenhuis (alleen ter informatie, geen planning), via de openbare
 * OpenStreetMap-routeplanner (OSRM): rijafstand, rijtijd zonder actueel verkeer en de belangrijkste wegen. Er gaan alleen
 * de coördinaten van de twee ziekenhuizen mee. Is de routeplanner niet bereikbaar, dan wordt géén schatting getoond.
 */

export type LatLon = [number, number];

export interface RouteInfo {
  km: number;
  minutes: number;
  /** Belangrijkste wegen in volgorde (bijv. ["A4", "A13"]). */
  roads: string[];
}

export function coordsOf(hospital: string): LatLon | null {
  return HOSPITAL_COORDS[hospital.trim()] ?? null;
}

/** Rijtijd als "45 min" of "1 u 20 min" (afgerond op 5 minuten, minimaal 5). */
export function formatDuration(minutes: number): string {
  const m = Math.max(5, Math.round(minutes / 5) * 5);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} u${m % 60 ? ` ${m % 60} min` : ''}`;
}

export function formatKm(km: number): string {
  return `${Math.max(1, Math.round(km))} km`;
}

/** Wegnummers uit de stappen van een OSRM-route: A- en N-wegen, in volgorde, zonder herhaling. */
export function mainRoads(steps: { ref?: string; distance?: number }[]): string[] {
  const out: string[] = [];
  for (const st of steps) {
    for (const raw of (st.ref ?? '').split(';')) {
      const ref = raw.replace(/\s+/g, '').toUpperCase();
      if (!/^[AN]\d+$/.test(ref) || (st.distance ?? 0) < 2000) continue;
      if (out[out.length - 1] !== ref && !out.includes(ref)) out.push(ref);
    }
  }
  return out.slice(0, 6);
}

export const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

/** Route via de openbare OSRM-routeplanner; `null` als die niet bereikbaar is of geen route geeft. */
export async function fetchRoute(from: LatLon, to: LatLon, signal?: AbortSignal): Promise<RouteInfo | null> {
  try {
    const url = `${OSRM_URL}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=false&steps=true`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { code?: string; routes?: { distance: number; duration: number; legs?: { steps?: { ref?: string; distance?: number }[] }[] }[] };
    const r = data.code === 'Ok' ? data.routes?.[0] : undefined;
    if (!r) return null;
    return { km: r.distance / 1000, minutes: r.duration / 60, roads: mainRoads(r.legs?.flatMap((l) => l.steps ?? []) ?? []) };
  } catch {
    return null;
  }
}

/** Links naar routeplanners (openen in een nieuw tabblad of de app); met coördinaten als die bekend zijn. */
export function mapLinks(fromName: string, toName: string): { google: string; apple: string } {
  const place = (name: string) => {
    const c = coordsOf(name);
    return c ? `${c[0]},${c[1]}` : name;
  };
  const q = (v: string) => encodeURIComponent(v);
  return {
    google: `https://www.google.com/maps/dir/?api=1&origin=${q(place(fromName))}&destination=${q(place(toName))}&travelmode=driving`,
    apple: `https://maps.apple.com/?saddr=${q(place(fromName))}&daddr=${q(place(toName))}&dirflg=d`,
  };
}
