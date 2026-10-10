import { ABCD_KEYS, CHECKLIST_KEYS } from './types';
import type {
  AbcdNotes,
  EndotrachealTube,
  GasKey,
  Infusion,
  Line,
  Measurement,
  MedicationAdministration,
  MonitorKey,
  Num,
  Transport,
  TubeVersion,
  TubeVersionKind,
} from './types';
import { DEFAULT_TIME_ZONE, nowInstant } from './time';
import { sortedMeasurements } from './timeline';

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyAbcd(): AbcdNotes {
  return Object.fromEntries(ABCD_KEYS.map((k) => [k, ''])) as AbcdNotes;
}

const MONITOR_KEYS: MonitorKey[] = ['heartRate', 'respRate', 'spo2Pre', 'spo2Post', 'meanBp', 'temperature', 'capRefill', 'tcCo2', 'etCo2'];
const GAS_KEYS: GasKey[] = ['ph', 'pco2', 'po2', 'hco3', 'be', 'lactate', 'glucose', 'hb'];

function emptyRecord<K extends string>(keys: K[]): Record<K, Num> {
  return Object.fromEntries(keys.map((k) => [k, null])) as Record<K, Num>;
}

/**
 * Nieuwe transportregistratie. Alleen datum/tijd verwijzing krijgt direct "nu":
 * het aanmaken van het transport is het moment van invoer van de verwijzing.
 */
export function newTransport(timeZone = DEFAULT_TIME_ZONE, now = Date.now()): Transport {
  const iso = new Date(now).toISOString();
  return {
    id: newId(),
    schemaVersion: 1,
    createdAt: iso,
    updatedAt: iso,
    child: {
      name: '',
      patientNumber: '',
      birthDate: '',
      birthTime: '',
      gestationalAgeWeeks: null,
      gestationalAgeDays: null,
      birthWeightGram: null,
      currentWeightGram: null,
    },
    referral: {
      referredAt: nowInstant(timeZone, now),
      referringHospital: '',
      referringDepartment: '',
      referrerName: '',
      referrerPhone: '',
      receivingHospital: '',
      receivingDepartment: '',
      reason: '',
    },
    birth: {
      maternalHistory: '',
      antenatalCorticosteroids: '',
      antenatalMagnesium: '',
      resuscitation: '',
      apgar1: null,
      apgar5: null,
      apgar10: null,
      cordArterial: { ph: null, be: null, lactate: null },
      cordVenous: { ph: null, be: null, lactate: null },
      vitaminK: '',
      vitaminKOther: '',
    },
    referralCondition: { notes: emptyAbcd(), advice: '' },
    teamAssessment: { arrivedAt: null, notes: emptyAbcd(), workingDiagnosis: '', stabilisationPlan: '', lastFeedAt: null },
    measurements: [],
    otherLabs: '',
    imaging: '',
    allergies: '',
    medications: [],
    infusions: [],
    lines: [],
    tubes: [],
    proceduresAndEvents: '',
    parentsAndFamily: '',
    checklist: Object.fromEntries(CHECKLIST_KEYS.map((k) => [k, 'nog_niet'])) as Transport['checklist'],
    motherPhone: '',
    partnerPhone: '',
    closure: { departedCotsideAt: null, eventsDuringTransport: '', arrivedReceivingAt: null },
  };
}

/**
 * Nieuw meetmoment. Tijdstip = nu; het bloedgas hoort bij het tijdstip van het meetmoment.
 * De modaliteit en de instellingen van díe modaliteit uit het laatste meetmoment worden als voorstel overgenomen;
 * monitor- en bloedgaswaarden nooit.
 */
export function newMeasurement(existing: Measurement[], timeZone = DEFAULT_TIME_ZONE, now = Date.now()): Measurement {
  const at = nowInstant(timeZone, now);
  const sorted = sortedMeasurements(existing);
  const previous = sorted.length > 0 ? sorted[sorted.length - 1] : undefined;
  const mode = previous?.resp.mode ?? '';
  const settings = mode && previous?.resp.settingsByMode[mode] ? { ...previous.resp.settingsByMode[mode] } : undefined;
  return {
    id: newId(),
    at,
    phase: previous?.phase ?? '',
    resp: { mode, settingsByMode: mode && settings ? { [mode]: settings } : {} },
    monitor: emptyRecord(MONITOR_KEYS),
    gas: { type: '', values: emptyRecord(GAS_KEYS) },
  };
}

export function newMedication(timeZone = DEFAULT_TIME_ZONE, now = Date.now()): MedicationAdministration {
  return { id: newId(), at: nowInstant(timeZone, now), name: '', dose: null, doseUnit: '', route: '' };
}

export function newInfusion(timeZone = DEFAULT_TIME_ZONE, now = Date.now()): Infusion {
  const at = nowInstant(timeZone, now);
  return { id: newId(), startAt: at, name: '', rates: [{ id: newId(), at, rateMlPerHour: null }], stopAt: null };
}

export function newLine(): Line {
  return { id: newId(), type: 'perifeer_infuus', size: null, sizeUnit: '', depthCm: null, location: '', tipPosition: '' };
}

export function newTubeVersion(kind: TubeVersionKind, base: Partial<TubeVersion> = {}, timeZone = DEFAULT_TIME_ZONE, now = Date.now()): TubeVersion {
  return {
    sizeMm: null,
    route: '',
    depthCm: null,
    tipPosition: '',
    ...base,
    id: newId(),
    kind,
    validFrom: nowInstant(timeZone, now),
    correctedAt: null,
  };
}

export function newTube(timeZone = DEFAULT_TIME_ZONE, now = Date.now()): EndotrachealTube {
  return { id: newId(), versions: [newTubeVersion('plaatsing', {}, timeZone, now)], replacedAt: null };
}

export { MONITOR_KEYS, GAS_KEYS };
