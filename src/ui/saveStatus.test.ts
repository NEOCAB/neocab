import { describe, expect, it } from 'vitest';
import { saveLevel } from './saveStatus';

describe('opslagstatus', () => {
  it('groen als alles is opgeslagen of de wijziging hooguit 10 s oud is', () => {
    expect(saveLevel(null, 1_000_000, false)).toBe('ok');
    expect(saveLevel(1_000_000, 1_010_000, false)).toBe('ok');
  });
  it('oranje als een wijziging 10 s tot 1 minuut wacht', () => {
    expect(saveLevel(1_000_000, 1_010_001, false)).toBe('waiting');
    expect(saveLevel(1_000_000, 1_060_000, false)).toBe('waiting');
  });
  it('rood als een wijziging langer dan 1 minuut wacht of opslaan mislukt', () => {
    expect(saveLevel(1_000_000, 1_060_001, false)).toBe('error');
    expect(saveLevel(null, 1_000_000, true)).toBe('error');
  });
});
