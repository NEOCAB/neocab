import { asphyxiaCriteriaFromBirth } from './asphyxia';
import { THOMPSON_ITEMS, THOMPSON_KEYS, THOMPSON_MAX, emptyThompson, thompsonTotal, thompsonTotalText } from './thompson';
import { describe, expect, it } from 'vitest';
import { ageInHoursIfYoung, correctedAge, parseGestation, transportDate } from './calc';
import { anonymize, isIdentifying, newMeasurement, newTransport, newTube, newTubeVersion } from './factory';
import { sampleTransport } from './sample';
import { INVASIVE_MODES, NON_INVASIVE_MODES, respFieldsFor } from './labels';
import { parseNum } from './num';
import { isOiAlert, oxygenationIndex } from './oi';
import { instantToWall, localDateOf, nowInstant, wallToInstant, formatInstant } from './time';
import { sortedMeasurements, tubeAt, upsertMeasurement } from './timeline';
import type { Measurement, RespMode } from './types';

const TZ = 'Europe/Amsterdam';

describe('gecorrigeerde leeftijd', () => {
  const child = { birthDate: '2026-10-07', gestationalAgeWeeks: 33, gestationalAgeDays: 5 } as const;
  it('telt kalenderdagen tot de transportdatum, ook over een weekovergang', () => {
    expect(correctedAge(child, '2026-10-08')).toMatchObject({ weeks: 33, days: 6, postnatalDay: 2 });
    expect(correctedAge(child, '2026-10-09')).toMatchObject({ weeks: 34, days: 0, postnatalDay: 3 });
    expect(correctedAge(child, '2026-10-16')).toMatchObject({ weeks: 35, days: 0, postnatalDay: 10 });
  });
  it('volgt een gewijzigde transportdatum (datum verwijzing)', () => {
    const t = newTransport(TZ);
    t.child = { ...t.child, ...child };
    t.referral.referredAt = wallToInstant('2026-10-09T23:59', TZ);
    expect(correctedAge(t.child, transportDate(t, TZ))).toMatchObject({ weeks: 34, days: 0 });
    t.referral.referredAt = wallToInstant('2026-10-10T00:01', TZ);
    expect(correctedAge(t.child, transportDate(t, TZ))).toMatchObject({ weeks: 34, days: 1 });
  });
  it('postnatale leeftijd: geboortedag is dag 1', () => {
    expect(correctedAge(child, '2026-10-07')).toMatchObject({ weeks: 33, days: 5, postnatalDay: 1 });
    expect(correctedAge(child, '2026-10-08')).toMatchObject({ postnatalDay: 2 });
  });
  it('rekent niet met lege dagen als 0', () => {
    expect(correctedAge({ ...child, gestationalAgeDays: null }, '2026-10-09')).toBeNull();
    expect(correctedAge({ ...child, gestationalAgeDays: 0 }, '2026-10-09')).toMatchObject({ weeks: 33, days: 2 });
  });
  it('geeft niets bij transportdatum vóór geboortedatum', () => {
    expect(correctedAge(child, '2026-10-01')).toBeNull();
  });
});

describe('leeftijd in uren en minuten', () => {
  const child = { birthDate: '2026-10-09', birthTime: '23:30' };
  it('toont uren en minuten onder 72 uur, ook over middernacht', () => {
    expect(ageInHoursIfYoung(child, Date.parse(wallToInstant('2026-10-10T00:45', TZ)!), TZ)).toEqual({ hours: 1, minutes: 15 });
    expect(ageInHoursIfYoung(child, Date.parse(wallToInstant('2026-10-12T23:29', TZ)!), TZ)).toEqual({ hours: 71, minutes: 59 });
  });
  it('niets vanaf 72 uur, vóór geboorte of zonder geboortetijd', () => {
    expect(ageInHoursIfYoung(child, Date.parse(wallToInstant('2026-10-12T23:30', TZ)!), TZ)).toBeNull();
    expect(ageInHoursIfYoung(child, Date.parse(wallToInstant('2026-10-09T23:00', TZ)!), TZ)).toBeNull();
    expect(ageInHoursIfYoung({ ...child, birthTime: '' }, Date.parse(wallToInstant('2026-10-10T00:45', TZ)!), TZ)).toBeNull();
  });
});

describe('amenorroeduur als weken+dagen', () => {
  it('leest 33+5, met spaties en zonder dagen', () => {
    expect(parseGestation('33+5')).toEqual({ ok: true, weeks: 33, days: 5 });
    expect(parseGestation(' 33 + 5 ')).toEqual({ ok: true, weeks: 33, days: 5 });
    expect(parseGestation('33')).toEqual({ ok: true, weeks: 33, days: 0 });
    expect(parseGestation('')).toEqual({ ok: true, weeks: null, days: null });
  });
  it('weigert ongeldige invoer en dagen boven 6', () => {
    expect(parseGestation('33+7').ok).toBe(false);
    expect(parseGestation('33+').ok).toBe(false);
    expect(parseGestation('abc').ok).toBe(false);
  });
});

describe('oxygenatie-index', () => {
  const base = (over: Partial<Measurement> = {}): Measurement => ({
    ...newMeasurement([], TZ),
    resp: { mode: 'hfov', settingsByMode: { hfov: { map: 14, fio2: 60 } } },
    gas: { type: 'arterieel', values: { ph: null, pco2: null, po2: 3.8, hco3: null, be: null, lactate: null, glucose: null, hb: null } },
    ...over,
  });
  it('rekent (MAP × FiO₂ × 100) / PaO₂ met PaO₂ in mmHg', () => {
    // 14 × 0,60 × 100 / (3,8 × 7,50062) = 29,47
    expect(oxygenationIndex(base())).toBeCloseTo(29.47, 2);
    expect(isOiAlert(oxygenationIndex(base()))).toBe(true);
    const ptv = base({ resp: { mode: 'ptv', settingsByMode: { ptv: { map: 10, fio2: 40 } } }, gas: { ...base().gas, values: { ...base().gas.values, po2: 8 } } });
    expect(oxygenationIndex(ptv)).toBeCloseTo((10 * 40) / (8 * 7.50062), 5);
    expect(isOiAlert(oxygenationIndex(ptv))).toBe(false);
  });
  it('alleen bij arterieel bloedgas, invasieve beademing en bekende MAP/FiO₂/PaO₂', () => {
    expect(oxygenationIndex(base({ gas: { ...base().gas, type: 'capillair' } }))).toBeNull();
    expect(oxygenationIndex(base({ resp: { mode: 'cpap', settingsByMode: { cpap: { peep: 7, fio2: 60 } } } }))).toBeNull();
    expect(oxygenationIndex(base({ resp: { mode: 'ptv', settingsByMode: { ptv: { fio2: 40 } } } }))).toBeNull();
    expect(oxygenationIndex(base({ gas: { ...base().gas, values: { ...base().gas.values, po2: null } } }))).toBeNull();
  });
  it('drempel: precies 25 geeft geen alert, daarboven wel', () => {
    expect(isOiAlert(25)).toBe(false);
    expect(isOiAlert(25.1)).toBe(true);
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
    expect(keys('cpap')).toEqual(['peep', 'fio2', 'flow']);
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
      resp: { mode: 'ptv', settingsByMode: { ptv: { pip: 20, peep: 6 }, cpap: { peep: 7 } } },
      monitor: { heartRate: 160, respRate: 50, spo2Pre: 92, spo2Post: 90, meanBp: 40, temperature: 36.5, capRefill: 2, tcCo2: 6, etCo2: 5 },
      gas: { type: 'arterieel', values: { ph: 7.3, pco2: 6, po2: 8, hco3: 22, be: -2, lactate: 2, glucose: 4, hb: 10 } },
      policyChanges: 'Surfactant gegeven',
    });
    const next = newMeasurement([prev], TZ);
    expect(next.policyChanges).toBe('');
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

describe('anoniem vastleggen (persoonlijk apparaat)', () => {
  it('verwijdert naam en patiëntnummer, maar houdt geboortedatum en alle andere gegevens', () => {
    const t = sampleTransport(TZ);
    expect(isIdentifying(t)).toBe(true);
    const a = anonymize(t);
    expect(a.child.name).toBe('');
    expect(a.child.patientNumber).toBe('');
    expect(a.child.birthDate).toBe(t.child.birthDate);
    expect(a.child.birthTime).toBe(t.child.birthTime);
    expect(a.measurements).toEqual(t.measurements);
    expect(isIdentifying(a)).toBe(false);
    expect(anonymize(a)).toBe(a);
  });
});

describe('Thompsonscore', () => {
  it('telt de ingevulde onderdelen op; maximaal 22', () => {
    const s = emptyThompson();
    expect(THOMPSON_MAX).toBe(22);
    expect(thompsonTotalText(s)).toBeNull();
    s.tone = 3;
    s.seizures = 2;
    s.respiration = 0;
    expect(thompsonTotal(s)).toEqual({ total: 5, filled: 3, complete: false });
    for (const k of THOMPSON_KEYS) s[k] = THOMPSON_ITEMS.find((i) => i.key === k)!.options.length - 1;
    expect(thompsonTotal(s)).toEqual({ total: 22, filled: 9, complete: true });
    expect(thompsonTotalText(s)).toBe('22 / 22');
  });
});

describe('Perinatale asfyxie', () => {
  it('herkent criteria uit Apgar 5 minuten en navelstrengbloedgassen (grenswaarden volgens protocol)', () => {
    const b = newTransport().birth;
    expect(asphyxiaCriteriaFromBirth(b)).toEqual([]);
    b.apgar5 = 6;
    b.cordArterial = { ph: 7.0, be: -16, lactate: 10 };
    expect(asphyxiaCriteriaFromBirth(b)).toEqual([]);
    b.apgar5 = 5;
    b.cordVenous = { ph: 6.95, be: -18.2, lactate: 12.5 };
    expect(asphyxiaCriteriaFromBirth(b)).toEqual(['apgar5', 'ph', 'be', 'lactate']);
  });
});
