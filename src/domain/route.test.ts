import { describe, expect, it } from 'vitest';
import { coordsOf, fetchRoute, formatDuration, formatKm, mainRoads, mapLinks } from './route';

describe('route en reistijd', () => {
  it('kent de coördinaten van ziekenhuizen in de keuzelijst', () => {
    expect(coordsOf('Alrijne Ziekenhuis, Leiderdorp')).toEqual([52.16, 4.526]);
    expect(coordsOf('Onbekend ziekenhuis')).toBe(null);
  });
  it('formatteert afstand en tijd', () => {
    expect(formatKm(36.4)).toBe('36 km');
    expect(formatDuration(27)).toBe('25 min');
    expect(formatDuration(2)).toBe('5 min');
    expect(formatDuration(83)).toBe('1 u 25 min');
    expect(formatDuration(120)).toBe('2 u');
  });
  it('haalt de hoofdwegen uit de routestappen', () => {
    expect(mainRoads([{ ref: 'N445', distance: 3000 }, { ref: 'A 4', distance: 20000 }, { ref: 'A4;E19', distance: 5000 }, { ref: 'A13', distance: 8000 }, { ref: 'N209', distance: 500 }])).toEqual(['N445', 'A4', 'A13']);
  });
  it('maakt links naar routeplanners, met coördinaten of anders de naam', () => {
    const { google, apple } = mapLinks('Amphia, Breda', 'Eigen ziekenhuis');
    expect(google).toContain('origin=51.577%2C4.796');
    expect(google).toContain('destination=Eigen%20ziekenhuis');
    expect(apple).toContain('daddr=Eigen%20ziekenhuis');
  });
});

describe('route ophalen: TomTom, dan OSRM, anders niets', () => {
  const A: [number, number] = [52.16, 4.526];
  const B: [number, number] = [51.91, 4.469];
  const tomtom = { routes: [{ summary: { lengthInMeters: 37400, travelTimeInSeconds: 2280, trafficDelayInSeconds: 420 }, guidance: { instructions: [{ roadNumbers: ['N445'] }, { roadNumbers: ['A4', 'E19'] }, { roadNumbers: ['A13'] }] } }] };
  const osrm = { code: 'Ok', routes: [{ distance: 36200, duration: 1860, legs: [{ steps: [{ ref: 'A4', distance: 25000 }] }] }] };
  const mockFetch = (handler: (url: string) => Response | Promise<Response>) => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return handler(String(input));
    }) as typeof fetch;
    return calls;
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('gebruikt TomTom met actueel verkeer als er een sleutel is', async () => {
    const calls = mockFetch((url) => (url.includes('tomtom') ? json(tomtom) : json(osrm)));
    const r = await fetchRoute(A, B, undefined, 'testsleutel');
    expect(r).toEqual({ km: 37.4, minutes: 38, roads: ['N445', 'A4', 'A13'], source: 'tomtom', trafficDelayMinutes: 7 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('api.tomtom.com/routing/1/calculateRoute/52.16,4.526:51.91,4.469/json?key=testsleutel&traffic=true');
  });
  it('valt terug op OSRM als TomTom faalt', async () => {
    const calls = mockFetch((url) => (url.includes('tomtom') ? json({ error: 'forbidden' }, 403) : json(osrm)));
    const r = await fetchRoute(A, B, undefined, 'testsleutel');
    expect(r?.source).toBe('osrm');
    expect(calls).toHaveLength(2);
  });
  it('geeft niets (geen schatting) als beide falen, en gebruikt zonder sleutel alleen OSRM', async () => {
    mockFetch(() => Promise.reject(new Error('offline')));
    expect(await fetchRoute(A, B, undefined, 'testsleutel')).toBe(null);
    const calls = mockFetch(() => json(osrm));
    expect((await fetchRoute(A, B, undefined, ''))?.source).toBe('osrm');
    expect(calls.every((c) => !c.includes('tomtom'))).toBe(true);
  });
});
