import { describe, expect, it } from 'vitest';
import { newMeasurement, newTransport } from '../domain/factory';
import { sampleTransport } from '../domain/sample';
import { LocalStorageTransportRepository, type KeyValueStorage } from './localRepository';
import { loadSettings, saveSettings } from './settings';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('lokale conceptopslag', () => {
  it('slaat op, hervat na "herladen" en behoudt tijdstippen', () => {
    const storage = memoryStorage();
    const t = newTransport('Europe/Amsterdam', Date.parse('2026-10-09T20:00:00Z'));
    const m = newMeasurement([], 'Europe/Amsterdam', Date.parse('2026-10-09T20:05:00Z'));
    t.measurements.push(m);
    t.child.patientNumber = '0001234';
    new LocalStorageTransportRepository(storage).save(t);

    // Nieuwe repository-instantie = herladen van de pagina, op een later tijdstip.
    const loaded = new LocalStorageTransportRepository(storage).load(t.id)!;
    expect(loaded.referral.referredAt).toBe('2026-10-09T22:00:00+02:00');
    expect(loaded.measurements[0].at).toBe('2026-10-09T22:05:00+02:00');
    expect(loaded.measurements[0].id).toBe(m.id);
    expect(loaded.child.patientNumber).toBe('0001234');
    expect(loaded.teamAssessment.arrivedAt).toBeNull();
  });

  it('lijst, hervat en verwijdert concepten', () => {
    const storage = memoryStorage();
    const repo = new LocalStorageTransportRepository(storage);
    const a = repo.save(sampleTransport());
    const b = repo.save(newTransport());
    expect(repo.list().map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
    repo.remove(a.id);
    expect(repo.list().map((s) => s.id)).toEqual([b.id]);
    expect(repo.load(a.id)).toBeNull();
  });

  it('vult ontbrekende velden aan zonder bestaande waarden te wijzigen', () => {
    const storage = memoryStorage();
    const t = sampleTransport();
    const partial = JSON.parse(JSON.stringify(t));
    delete partial.closure;
    delete partial.child.doseWeightOverrideGram;
    storage.setItem(`neonataal-transport:v1:${t.id}`, JSON.stringify(partial));
    storage.setItem('neonataal-transport:v1:index', JSON.stringify([t.id]));
    const loaded = new LocalStorageTransportRepository(storage).load(t.id)!;
    expect(loaded.closure.arrivedReceivingAt).toBeNull();
    expect(loaded.child.doseWeightOverrideGram).toBeNull();
    expect(loaded.referral.referredAt).toBe(t.referral.referredAt);
  });

  it('zet een oude CPAP-druk om naar PEEP bij laden', () => {
    const storage = memoryStorage();
    const t = sampleTransport();
    const old = JSON.parse(JSON.stringify(t));
    old.measurements[0].resp.settingsByMode.cpap = { cpap: 7, fio2: 45 };
    storage.setItem(`neonataal-transport:v1:${t.id}`, JSON.stringify(old));
    storage.setItem('neonataal-transport:v1:index', JSON.stringify([t.id]));
    const loaded = new LocalStorageTransportRepository(storage).load(t.id)!;
    expect(loaded.measurements[0].resp.settingsByMode.cpap).toEqual({ peep: 7, fio2: 45 });
  });

  it('bewaart configureerbare toedieningsroutes', () => {
    const storage = memoryStorage();
    saveSettings(storage, { timeZone: 'Europe/Amsterdam', medicationRoutes: ['IV', 'Oraal'] });
    expect(loadSettings(storage).medicationRoutes).toEqual(['IV', 'Oraal']);
  });
});
