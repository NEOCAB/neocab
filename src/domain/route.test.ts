import { describe, expect, it } from 'vitest';
import { coordsOf, estimateRoute, formatDuration, formatKm, haversineKm, mainRoads, mapLinks } from './route';

describe('route en reistijd', () => {
  it('schat rijafstand en -tijd uit de hemelsbrede afstand', () => {
    const leiderdorp = coordsOf('Alrijne Ziekenhuis, Leiderdorp')!;
    const sophia = coordsOf('Erasmus MC – Sophia Kinderziekenhuis, Rotterdam')!;
    const crow = haversineKm(leiderdorp, sophia);
    expect(crow).toBeGreaterThan(25);
    expect(crow).toBeLessThan(32);
    const est = estimateRoute(leiderdorp, sophia);
    expect(est.km).toBeCloseTo(crow * 1.25, 5);
    expect(est.minutes).toBeCloseTo((est.km / 80) * 60, 5);
    expect(est.source).toBe('schatting');
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
