import { describe, expect, it } from 'vitest';
import { doseWeight, postmenstrualAge, transportDate } from './calc';
import { newMeasurement, newTransport, newTube, newTubeVersion } from './factory';
import { INVASIVE_MODES, NON_INVASIVE_MODES, respFieldsFor } from './labels';
import { parseNum } from './num';
import { instantToWall, localDateOf, nowInstant, wallToInstant, formatInstant } from './time';
import { sortedMeasurements, tubeAt, upsertMeasurement } from './timeline';
import type { Measurement, RespMode } from './types';

const TZ = 'Europe/Amsterdam';

describe('doseergewicht', () => {
  const base = { birthWeightGram: null, currentWeightGram: null, doseWeightOverrideGram: null } as const;
  it('neemt het hoogste van twee gewichten', () => {
    expect(doseWeight({ ...base, birthWeightGram: 1980, currentWeightGram: 1890 }).value).toBe(1980);
    expect(doseWeight({ ...base, birthWeightGram: 1980, currentWeightGram: 2100 }).value).toBe(2100);
  });
  it('gebruikt het enige bekende gewicht', () => {
    expect(doseWeight({ ...base, currentWeightGram: 1500 }).value).toBe(1500);
    expect(doseWeight({ ...base, birthWeightGram: 1200, currentWeightGram: 'onbekend' }).value).toBe(1200);
  });
  it('blijft leeg bij lege invoer (geen 0)', () => {
    const d = doseWeight(base);
    expect(d.value).toBeNull();
    expect(d.auto).toBeNull();
  });
  it('behoudt een handmatige override bij gewijzigde gewichten', () => {
    const d1 = doseWeight({ birthWeightGram: 1980, currentWeightGram: 1890, doseWeightOverrideGram: 2000 });
    expect(d1).toEqual({ auto: 1980, value: 2000, manual: true });
    const d2 = doseWeight({ birthWeightGram: 1980, currentWeightGram: 2300, doseWeightOverrideGram: 2000 });
    expect(d2.value).toBe(2000);
    expect(d2.auto).toBe(2300);
  });
  it('rekent opnieuw automatisch na wissen van de override', () => {
    expect(doseWeight({ birthWeightGram: 1980, currentWeightGram: 2300, doseWeightOverrideGram: null })).toEqual({ auto: 2300, value: 2300, manual: false });
  });
  it('accepteert een expliciete handmatige 0 als ingevulde waarde', () => {
    expect(doseWeight({ birthWeightGram: 1000, currentWeightGram: null, doseWeightOverrideGram: 0 }).value).toBe(0);
  });
});

describe('postmenstruele leeftijd', () => {
  const child = { birthDate: '2026-10-07', gestationalAgeWeeks: 33, gestationalAgeDays: 5 } as const;
  it('telt kalenderdagen tot de transportdatum, ook over een weekovergang', () => {
    expect(postmenstrualAge(child, '2026-10-08')).toMatchObject({ weeks: 33, days: 6, postnatalDays: 1 });
    expect(postmenstrualAge(child, '2026-10-09')).toMatchObject({ weeks: 34, days: 0, postnatalDays: 2 });
    expect(postmenstrualAge(child, '2026-10-16')).toMatchObject({ weeks: 35, days: 0, postnatalDays: 9 });
  });
  it('volgt een gewijzigde transportdatum (datum verwijzing)', () => {
    const t = newTransport(TZ);
    t.child = { ...t.child, ...child };
    t.referral.referredAt = wallToInstant('2026-10-09T23:59', TZ);
    expect(postmenstrualAge(t.child, transportDate(t, TZ))).toMatchObject({ weeks: 34, days: 0 });
    t.referral.referredAt = wallToInstant('2026-10-10T00:01', TZ);
    expect(postmenstrualAge(t.child, transportDate(t, TZ))).toMatchObject({ weeks: 34, days: 1 });
  });
  it('rekent niet met lege dagen als 0', () => {
    expect(postmenstrualAge({ ...child, gestationalAgeDays: null }, '2026-10-09')).toBeNull();
    expect(postmenstrualAge({ ...child, gestationalAgeDays: 0 }, '2026-10-09')).toMatchObject({ weeks: 33, days: 2 });
  });
  it('geeft niets bij transportdatum vóór geboortedatum', () => {
    expect(postmenstrualAge(child, '2026-10-01')).toBeNull();
  });
});

describe('getallen', () => {
  it('accepteert komma en punt en onderscheidt leeg en 0', () => {
    expect(parseNum('7,25')).toEqual({ ok: true, value: 7.25 });
    expect(parseNum('7.25')).toEqual({ ok: true, value: 7.25 });
    expect(parseNum('0')).toEqual({ ok: true, value: 0 });
    expect(parseNum('')).toEqual({ ok: true, value: null });
    expect(parseNum('-6,4')).toEqual({ ok: true, value: -6.4 });
  });
  it('valideert type en positieve pompsnelheid', () => {
    expect(parseNum('abc').ok).toBe(false);
    expect(parseNum('0', { positive: true }).ok).toBe(false);
    expect(parseNum('-1', { min: 0 }).ok).toBe(false);
    expect(parseNum('5,5', { integer: true }).ok).toBe(false);
  });
});

describe('tijd en tijdzone', () => {
  it('bewaart tijdstippen met offset en toont lokale tijd (zomer- en wintertijd)', () => {
    expect(wallToInstant('2026-10-09T23:45', TZ)).toBe('2026-10-09T23:45:00+02:00');
    expect(wallToInstant('2026-12-01T08:00', TZ)).toBe('2026-12-01T08:00:00+01:00');
    expect(instantToWall('2026-10-09T21:45:00Z', TZ)).toBe('2026-10-09T23:45');
  });
  it('gaat goed om met een transport en bloedgas over middernacht', () => {
    const before = wallToInstant('2026-10-09T23:58', TZ)!;
    const after = wallToInstant('2026-10-10T00:05', TZ)!;
    expect(Date.parse(after) - Date.parse(before)).toBe(7 * 60000);
    expect(localDateOf(before, TZ)).toBe('2026-10-09');
    expect(localDateOf(after, TZ)).toBe('2026-10-10');
    expect(formatInstant(after, TZ)).toBe('10-10-2026 00:05');
  });
  it('kiest eenduidig bij de wintertijdovergang', () => {
    // 25 oktober 2026: 03:00 CEST -> 02:00 CET; 02:30 bestaat twee keer.
    expect(wallToInstant('2026-10-25T02:30', TZ)).toBe('2026-10-25T02:30:00+02:00');
  });
  it('rondt "nu" af op de minuut in de gekozen tijdzone', () => {
    const now = Date.parse('2026-10-09T21:45:37Z');
    expect(nowInstant(TZ, now)).toBe('2026-10-09T23:45:00+02:00');
  });
});

describe('standaardtijden', () => {
  it('geeft alleen nieuwe invoer de huidige tijd', () => {
    const now = Date.parse('2026-10-09T21:00:00Z');
    const m = newMeasurement([], TZ, now);
    expect(m.at).toBe('2026-10-09T23:00:00+02:00');
    expect('sampledAt' in m.gas).toBe(false); // bloedgas heeft geen eigen afnametijd
    const t = newTransport(TZ, now);
    expect(t.referral.referredAt).toBe('2026-10-09T23:00:00+02:00');
    // Geen automatische "nu" voor tijden die nog niet zijn ingevoerd, en nooit een stoptijd.
    expect(t.teamAssessment.arrivedAt).toBeNull();
    expect(t.closure.arrivedReceivingAt).toBeNull();
  });
});

describe('ademhalingsondersteuning', () => {
  const keys = (mode: RespMode) => respFieldsFor(mode).map((f) => f.key);
  it('toont VG alleen bij PTV en SIMV', () => {
    for (const mode of ['geen', 'lowflow', 'hfnc', 'cpap', 'nippv', 'hfov'] as RespMode[]) expect(keys(mode)).not.toContain('vg');
    expect(keys('ptv')).toContain('vg');
    expect(keys('simv')).toContain('vg');
  });
  it('toont iNO alleen bij invasieve ondersteuning', () => {
    for (const mode of INVASIVE_MODES) expect(keys(mode)).toContain('ino');
    for (const mode of [...NON_INVASIVE_MODES, 'geen' as RespMode]) expect(keys(mode)).not.toContain('ino');
  });
  it('heeft de juiste velden per modaliteit', () => {
    expect(keys('geen')).toEqual([]);
    expect(keys('lowflow')).toEqual(['flow', 'o2']);
    expect(keys('hfnc')).toEqual(['flow', 'fio2']);
    expect(keys('cpap')).toEqual(['cpap', 'fio2', 'flow']);
    expect(keys('nippv')).toEqual(['pip', 'peep', 'rate', 'ti', 'fio2']);
    expect(keys('ptv')).toEqual(['pip', 'peep', 'rate', 'ti', 'fio2', 'vg', 'map', 'ino']);
    expect(keys('simv')).toEqual(['pip', 'peep', 'rate', 'ti', 'fio2', 'vg', 'map', 'ps', 'ino']);
    expect(keys('hfov')).toEqual(['map', 'amplitude', 'frequencyHz', 'fio2', 'inspFraction', 'ino']);
  });
});

function measurement(at: string, extra: Partial<Measurement> = {}): Measurement {
  const m = newMeasurement([], TZ);
  return { ...m, at: wallToInstant(at, TZ), ...extra };
}

describe('tijdlijn', () => {
  it('sorteert chronologisch na achteraf toevoegen en aanpassen', () => {
    let list: Measurement[] = [];
    const a = measurement('2026-10-09T23:10');
    const b = measurement('2026-10-10T00:20');
    list = upsertMeasurement(list, a);
    list = upsertMeasurement(list, b);
    const late = measurement('2026-10-09T23:40'); // achteraf toegevoegd
    list = upsertMeasurement(list, late);
    expect(list.map((m) => m.id)).toEqual([a.id, late.id, b.id]);
    list = upsertMeasurement(list, { ...a, at: wallToInstant('2026-10-10T00:30', TZ) }); // aangepast tijdstip
    expect(list.map((m) => m.id)).toEqual([late.id, b.id, a.id]);
    expect(sortedMeasurements([...list].reverse()).map((m) => m.id)).toEqual([late.id, b.id, a.id]);
  });

  it('neemt modaliteit en instellingen over als voorstel, maar geen monitor- of bloedgaswaarden', () => {
    const prev = measurement('2026-10-09T23:10', {
      resp: { mode: 'ptv', settingsByMode: { ptv: { pip: 20, peep: 6 }, cpap: { cpap: 7 } } },
      monitor: { heartRate: 160, respRate: 50, spo2Pre: 92, spo2Post: 90, meanBp: 40, temperature: 36.5, capRefill: 2, tcCo2: 6, etCo2: 5 },
      gas: { type: 'arterieel', values: { ph: 7.3, pco2: 6, po2: 8, hco3: 22, be: -2, lactate: 2, glucose: 4, hb: 10 } },
    });
    const next = newMeasurement([prev], TZ);
    expect(next.resp.mode).toBe('ptv');
    expect(next.resp.settingsByMode).toEqual({ ptv: { pip: 20, peep: 6 } });
    expect(Object.values(next.monitor).every((v) => v === null)).toBe(true);
    expect(Object.values(next.gas.values).every((v) => v === null)).toBe(true);
    expect(next.gas.type).toBe('');
    // Het voorstel is een kopie: wijzigen raakt het vorige meetmoment niet.
    next.resp.settingsByMode.ptv!.pip = 25;
    expect(prev.resp.settingsByMode.ptv!.pip).toBe(20);
  });
});

describe('endotracheale tube historie', () => {
  it('toont per meetmoment de tube die op dat tijdstip gold', () => {
    const tube = newTube(TZ);
    tube.versions[0] = { ...tube.versions[0], validFrom: wallToInstant('2026-10-09T23:20', TZ), sizeMm: 3, route: 'oraal', depthCm: 8 };
    const adj = { ...newTubeVersion('aanpassing', tube.versions[0], TZ), validFrom: wallToInstant('2026-10-10T00:10', TZ), depthCm: 7.5 };
    tube.versions.push(adj);
    expect(tubeAt([tube], wallToInstant('2026-10-09T23:10', TZ))).toBeNull();
    expect(tubeAt([tube], wallToInstant('2026-10-09T23:45', TZ))?.version.depthCm).toBe(8);
    expect(tubeAt([tube], wallToInstant('2026-10-10T00:50', TZ))?.version.depthCm).toBe(7.5);
  });
  it('latere aanpassing overschrijft historische meetmomenten niet; nieuwe tube vervangt de oude', () => {
    const t1 = newTube(TZ);
    t1.versions[0] = { ...t1.versions[0], validFrom: wallToInstant('2026-10-09T23:20', TZ), sizeMm: 2.5, route: 'oraal', depthCm: 7 };
    const t2 = newTube(TZ);
    t2.versions[0] = { ...t2.versions[0], validFrom: wallToInstant('2026-10-10T00:30', TZ), sizeMm: 3, route: 'nasaal', depthCm: 8.5 };
    t1.replacedAt = t2.versions[0].validFrom;
    const tubes = [t1, t2];
    expect(tubeAt(tubes, wallToInstant('2026-10-10T00:00', TZ))?.version.sizeMm).toBe(2.5);
    expect(tubeAt(tubes, wallToInstant('2026-10-10T00:40', TZ))?.version.sizeMm).toBe(3);
    expect(tubeAt(tubes, wallToInstant('2026-10-10T00:40', TZ))?.version.route).toBe('nasaal');
  });
});
