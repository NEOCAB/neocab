import { describe, expect, it } from 'vitest';
import { newMeasurement, newTransport } from '../domain/factory';
import { sampleTransport } from '../domain/sample';
import { LocalStorageTransportRepository, type KeyValueStorage } from './localRepository';
import { expiresAtMs, isExpired, isExpiringSoon, purgeExpired } from './retention';
import { loadSettings, saveSettings, EMPTY_LETTER } from './settings';

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
    storage.setItem(`neonataal-transport:v1:${t.id}`, JSON.stringify(partial));
    storage.setItem('neonataal-transport:v1:index', JSON.stringify([t.id]));
    const loaded = new LocalStorageTransportRepository(storage).load(t.id)!;
    expect(loaded.closure.arrivedReceivingAt).toBeNull();
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

  it('vult ontbrekende beleidsaanpassingen en nieuwe checklistpunten aan bij oude concepten', () => {
    const storage = memoryStorage();
    const t = sampleTransport();
    const old = JSON.parse(JSON.stringify(t));
    for (const m of old.measurements) delete m.policyChanges;
    delete old.checklist.medischeBrief;
    delete old.referralCondition.notes.exposure;
    storage.setItem(`neonataal-transport:v1:${t.id}`, JSON.stringify(old));
    storage.setItem('neonataal-transport:v1:index', JSON.stringify([t.id]));
    const loaded = new LocalStorageTransportRepository(storage).load(t.id)!;
    expect(loaded.measurements.every((m) => m.policyChanges === '')).toBe(true);
    expect(loaded.checklist.medischeBrief).toBe('nog_niet');
    expect(loaded.referralCondition.notes.exposure).toBe('');
  });

  it('zet vitamine K "Anders" uit oude concepten om naar de route uit de tekst', () => {
    const storage = memoryStorage();
    const t = sampleTransport();
    const old = JSON.parse(JSON.stringify(t));
    old.birth.vitaminK = 'anders';
    old.birth.vitaminKOther = 'Intramusculair toegediend';
    storage.setItem(`neonataal-transport:v1:${t.id}`, JSON.stringify(old));
    storage.setItem('neonataal-transport:v1:index', JSON.stringify([t.id]));
    const loaded = new LocalStorageTransportRepository(storage).load(t.id)!;
    expect(loaded.birth.vitaminK).toBe('ja_im');
    expect('vitaminKOther' in loaded.birth).toBe(false);
    old.birth.vitaminKOther = 'onbekend';
    storage.setItem(`neonataal-transport:v1:${t.id}`, JSON.stringify(old));
    expect(new LocalStorageTransportRepository(storage).load(t.id)!.birth.vitaminK).toBe('');
  });

  it('vult therapeutische hypothermie en de Thompsonscore aan bij oude concepten', () => {
    const storage = memoryStorage();
    const t = sampleTransport();
    const old = JSON.parse(JSON.stringify(t));
    delete old.referral.therapeuticHypothermia;
    delete old.referralCondition.thompson;
    delete old.referralCondition.asphyxia;
    storage.setItem(`neonataal-transport:v1:${t.id}`, JSON.stringify(old));
    storage.setItem('neonataal-transport:v1:index', JSON.stringify([t.id]));
    const loaded = new LocalStorageTransportRepository(storage).load(t.id)!;
    expect(loaded.referral.therapeuticHypothermia).toBe(false);
    expect(loaded.referralCondition.thompson.at).toBeNull();
    expect(loaded.referralCondition.asphyxia).toEqual({ criteria: [] });
    // Tussenversie met ja/nee/onbekend: alleen de criteria blijven over.
    old.referralCondition.asphyxia = { present: 'ja', criteria: ['ph'] };
    storage.setItem(`neonataal-transport:v1:${t.id}`, JSON.stringify(old));
    expect(new LocalStorageTransportRepository(storage).load(t.id)!.referralCondition.asphyxia).toEqual({ criteria: ['ph'] });
    expect(Object.values(loaded.referralCondition.thompson.scores).every((v) => v === null)).toBe(true);
  });

  it('zet een oude lijst met telefoonnummers ouders om naar moeder en partner', () => {
    const storage = memoryStorage();
    const t = sampleTransport();
    const old = JSON.parse(JSON.stringify(t));
    delete old.motherPhone;
    delete old.partnerPhone;
    old.parentPhones = ['0611111111', '0622222222', '0633333333'];
    storage.setItem(`neonataal-transport:v1:${t.id}`, JSON.stringify(old));
    storage.setItem('neonataal-transport:v1:index', JSON.stringify([t.id]));
    const loaded = new LocalStorageTransportRepository(storage).load(t.id)!;
    expect(loaded.motherPhone).toBe('0611111111');
    expect(loaded.partnerPhone).toBe('0622222222, 0633333333');
    expect('parentPhones' in loaded).toBe(false);
  });

  it('bewaart configureerbare toedieningsroutes', () => {
    const storage = memoryStorage();
    saveSettings(storage, { timeZone: 'Europe/Amsterdam', medicationRoutes: ['IV', 'Oraal'], hospitals: [], abcdLettersOnly: false, device: 'werk', letter: EMPTY_LETTER });
    expect(loadSettings(storage).medicationRoutes).toEqual(['IV', 'Oraal']);
  });

  it('bewaart de briefgegevens; alleen een PNG/JPEG-logo, standaard leeg', () => {
    const storage = memoryStorage();
    expect(loadSettings(storage).letter).toEqual(EMPTY_LETTER);
    saveSettings(storage, { ...loadSettings(storage), letter: { ...EMPTY_LETTER, senderName: 'drs. A. Jansen', logo: 'data:image/png;base64,iVBORw0KGgo=' } });
    expect(loadSettings(storage).letter.senderName).toBe('drs. A. Jansen');
    expect(loadSettings(storage).letter.logo).toBe('data:image/png;base64,iVBORw0KGgo=');
    storage.setItem('neonataal-transport:v1:instellingen', JSON.stringify({ letter: { senderName: 3, logo: 'javascript:alert(1)' } }));
    expect(loadSettings(storage).letter).toEqual(EMPTY_LETTER);
  });

  it('bewaart de instelling voor alleen ABCD-letters; standaard uit, ook bij oude instellingen', () => {
    const storage = memoryStorage();
    storage.setItem('neonataal-transport:v1:instellingen', JSON.stringify({ timeZone: 'Europe/Amsterdam', medicationRoutes: ['IV'] }));
    expect(loadSettings(storage).abcdLettersOnly).toBe(false);
    saveSettings(storage, { ...loadSettings(storage), abcdLettersOnly: true });
    expect(loadSettings(storage).abcdLettersOnly).toBe(true);
  });

  it('ziekenhuislijst volgt de standaardlijst, tenzij die zelf is aangepast', () => {
    const storage = memoryStorage();
    // Oude opslag: lijst bewaard zonder dat die is aangepast -> standaardlijst (met latere aanvullingen).
    storage.setItem('neonataal-transport:v1:instellingen', JSON.stringify({ hospitals: ['Oud ziekenhuis, Ergens'] }));
    expect(loadSettings(storage).hospitals.some((h) => h.startsWith('LUMC'))).toBe(true);
    saveSettings(storage, { ...loadSettings(storage), hospitals: ['Eigen ziekenhuis, Hier'], hospitalsCustom: true });
    expect(loadSettings(storage).hospitals).toEqual(['Eigen ziekenhuis, Hier']);
  });

  it('bewaart de keuze werk- of persoonlijk apparaat; standaard werkapparaat', () => {
    const storage = memoryStorage();
    expect(loadSettings(storage).device).toBe('werk');
    saveSettings(storage, { ...loadSettings(storage), device: 'persoonlijk' });
    expect(loadSettings(storage).device).toBe('persoonlijk');
    storage.setItem('neonataal-transport:v1:instellingen', JSON.stringify({ device: 'iets anders' }));
    expect(loadSettings(storage).device).toBe('werk');
  });
});

describe('vervallen velden', () => {
  it('oude tekst uit Overige diagnostiek en Notities wordt bij het laden niet meer bewaard', () => {
    const storage = memoryStorage();
    const repo = new LocalStorageTransportRepository(storage);
    const t = repo.save(sampleTransport('Europe/Amsterdam'));
    const raw = JSON.parse(storage.data.get(`neonataal-transport:v1:${t.id}`)!);
    storage.setItem(`neonataal-transport:v1:${t.id}`, JSON.stringify({ ...raw, otherLabs: 'CRP 4', imaging: 'Thoraxfoto', proceduresAndEvents: 'Intubatie' }));
    const loaded = repo.load(t.id)! as unknown as Record<string, unknown>;
    expect(loaded).not.toHaveProperty('otherLabs');
    expect(loaded).not.toHaveProperty('imaging');
    expect(loaded).not.toHaveProperty('proceduresAndEvents');
  });
});

describe('bewaartermijn', () => {
  const DAY = 86_400_000;
  const now = Date.parse('2026-11-15T12:00:00Z');
  const s = (arrivedAt: string | null, updatedAt: string) => ({ arrivedAt, updatedAt });
  it('verloopt een week na aankomst; een latere wijziging verlengt', () => {
    expect(expiresAtMs(s('2026-11-08T12:00:00Z', '2026-11-08T12:00:00Z'))).toBe(now);
    expect(isExpired(s('2026-11-08T12:00:00Z', '2026-11-08T12:00:00Z'), now)).toBe(true);
    expect(isExpired(s('2026-11-08T12:00:00Z', '2026-11-12T12:00:00Z'), now)).toBe(false);
  });
  it('zonder aankomst telt de laatste wijziging', () => {
    expect(expiresAtMs(s(null, '2026-11-10T00:00:00Z'))).toBe(Date.parse('2026-11-10T00:00:00Z') + 7 * DAY);
  });
  it('waarschuwt binnen een dag voor het verwijderen, niet eerder', () => {
    expect(isExpiringSoon(s(null, new Date(now - 6.5 * DAY).toISOString()), now)).toBe(true);
    expect(isExpiringSoon(s(null, new Date(now - 5 * DAY).toISOString()), now)).toBe(false);
    expect(isExpiringSoon(s(null, new Date(now - 8 * DAY).toISOString()), now)).toBe(false);
  });
  it('purgeExpired verwijdert alleen verlopen transporten', () => {
    const repo = new LocalStorageTransportRepository(memoryStorage());
    const old = repo.save(newTransport());
    const fresh = repo.save(newTransport());
    const gone = purgeExpired(repo, Date.now() + 8 * DAY - 1000 * 0);
    expect(gone.sort()).toEqual([old.id, fresh.id].sort());
    const keep = repo.save(newTransport());
    expect(purgeExpired(repo)).toEqual([]);
    expect(repo.load(keep.id)).not.toBeNull();
  });
});
