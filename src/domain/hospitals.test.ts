import { describe, expect, it } from 'vitest';
import { DEFAULT_HOSPITAL_LINES, hospitalOptions, matchesHospital, parseHospitalLine } from './hospitals';

describe('keuzelijst ziekenhuizen', () => {
  const list = hospitalOptions(DEFAULT_HOSPITAL_LINES);
  it('bevat unieke locaties in de vorm "Naam, Plaats", met de NICU-centra gemarkeerd', () => {
    expect(list.length).toBeGreaterThan(60);
    expect(new Set(list.map((h) => h.label)).size).toBe(list.length);
    expect(list.every((h) => /, [^,]+$/.test(h.label))).toBe(true);
    // Negen NICU-centra: alle academische centra, Isala Zwolle en Máxima MC Veldhoven.
    expect(list.filter((h) => h.nicu).map((h) => h.label.split(',').pop()!.trim())).toEqual(['Groningen', 'Zwolle', 'Nijmegen', 'Utrecht', 'Amsterdam', 'Leiden', 'Rotterdam', 'Veldhoven', 'Maastricht']);
    for (const h of ['LUMC', 'SJG Weert', 'HagaZiekenhuis, Zoetermeer', 'Prinses Máxima Centrum']) expect(list.some((x) => x.label.includes(h))).toBe(true);
  });
  it('leest regels met en zonder NICU-markering; lege regels worden overgeslagen', () => {
    expect(parseHospitalLine('Máxima MC, Veldhoven | NICU')).toEqual({ label: 'Máxima MC, Veldhoven', nicu: true });
    expect(parseHospitalLine('Amphia, Breda')).toEqual({ label: 'Amphia, Breda', nicu: false });
    expect(parseHospitalLine('  ')).toBe(null);
  });
  it('zoekt zonder hoofdletters en accenten, op alle woorden', () => {
    const find = (q: string) => list.filter((h) => matchesHospital(h, q)).map((h) => h.label);
    expect(find('maxima')).toEqual(['Prinses Máxima Centrum (kinderoncologie), Utrecht', 'Máxima MC, Veldhoven']);
    expect(find('lumc')).toEqual(['LUMC – Willem-Alexander Kinderziekenhuis, Leiden']);
    expect(find('sophia rotterdam')).toEqual(['Erasmus MC – Sophia Kinderziekenhuis, Rotterdam']);
    expect(find('nicu').length).toBe(9);
    expect(find('spaarne')).toEqual(['Spaarne Gasthuis, Haarlem', 'Spaarne Gasthuis, Hoofddorp']);
  });
});
