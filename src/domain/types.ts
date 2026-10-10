/**
 * Datamodel van één transportregistratie.
 *
 * Conventies:
 * - `Num`: `null` = leeg (niet ingevuld), een getal = ingevulde waarde (0 is een echte nul).
 *   `'onbekend'` kan alleen nog in oudere concepten voorkomen en wordt dan als zodanig getoond.
 * - `Instant`: volledig tijdstip als ISO-8601-string mét UTC-offset, bv. `2026-10-09T23:45:00+02:00`, of `null`.
 * - `LocalDate`: lokale kalenderdatum `YYYY-MM-DD` (geen tijdzone), of `''`.
 * - Keuzevelden gebruiken `''` voor leeg.
 * - Alle onderliggende records hebben een stabiele `id`.
 */

export type Num = number | 'onbekend' | null;
export type Instant = string | null;
export type LocalDate = string;
export type Id = string;

export type Corticosteroids = '' | 'niet' | 'onvolledig' | 'volledig' | 'onbekend';
export type YesNoUnknown = '' | 'ja' | 'nee' | 'onbekend';
export type VitaminK = '' | 'ja_oraal' | 'nee' | 'anders';

export const ABCD_KEYS = [
  'airway',
  'breathing',
  'circulation',
  'disability',
  'fluids',
  'gastrointestinal',
  'haematological',
  'infection',
] as const;
export type AbcdKey = (typeof ABCD_KEYS)[number];
export type AbcdNotes = Record<AbcdKey, string>;

export interface Child {
  name: string;
  patientNumber: string;
  birthDate: LocalDate;
  /** Lokale kloktijd `HH:MM` of `''`. */
  birthTime: string;
  /** Amenorroeduur bij geboorte: weken en dagen (ingevoerd als één waarde, bijv. 33+5). */
  gestationalAgeWeeks: Num;
  gestationalAgeDays: Num;
  birthWeightGram: Num;
  currentWeightGram: Num;
}

export interface Referral {
  referredAt: Instant;
  referringHospital: string;
  referringDepartment: string;
  referrerName: string;
  referrerPhone: string;
  receivingHospital: string;
  receivingDepartment: string;
  reason: string;
}

export interface BloodGasCord {
  ph: Num;
  be: Num;
  lactate: Num;
}

export interface Birth {
  maternalHistory: string;
  antenatalCorticosteroids: Corticosteroids;
  antenatalMagnesium: YesNoUnknown;
  resuscitation: string;
  apgar1: Num;
  apgar5: Num;
  apgar10: Num;
  cordArterial: BloodGasCord;
  cordVenous: BloodGasCord;
  vitaminK: VitaminK;
  vitaminKOther: string;
}

export interface ReferralCondition {
  notes: AbcdNotes;
  advice: string;
}

export interface TeamAssessment {
  arrivedAt: Instant;
  notes: AbcdNotes;
  workingDiagnosis: string;
  stabilisationPlan: string;
  lastFeedAt: Instant;
}

export type Phase = '' | 'bij_verwijzing' | 'stabilisatie' | 'onderweg' | 'bij_overdracht';

export type RespMode = 'geen' | 'lowflow' | 'hfnc' | 'cpap' | 'nippv' | 'ptv' | 'simv' | 'hfov';

export type RespSettings = Record<string, Num>;

export interface RespiratorySupport {
  mode: RespMode | '';
  /**
   * Instellingen per modaliteit. Alleen `settingsByMode[mode]` is actueel;
   * waarden van eerder gekozen modaliteiten blijven bewaard maar worden niet getoond of geëxporteerd.
   */
  settingsByMode: Partial<Record<RespMode, RespSettings>>;
}

export type MonitorKey =
  | 'heartRate'
  | 'respRate'
  | 'spo2Pre'
  | 'spo2Post'
  | 'meanBp'
  | 'temperature'
  | 'capRefill'
  | 'tcCo2'
  | 'etCo2';

export type GasType = '' | 'arterieel' | 'veneus' | 'capillair';
export type GasKey = 'ph' | 'pco2' | 'po2' | 'hco3' | 'be' | 'lactate' | 'glucose' | 'hb';

export interface BloodGas {
  type: GasType;
  values: Record<GasKey, Num>;
}

export interface Measurement {
  id: Id;
  at: Instant;
  phase: Phase;
  resp: RespiratorySupport;
  monitor: Record<MonitorKey, Num>;
  gas: BloodGas;
}

export interface MedicationAdministration {
  id: Id;
  at: Instant;
  name: string;
  dose: Num;
  doseUnit: string;
  route: string;
}

export interface RateChange {
  id: Id;
  at: Instant;
  rateMlPerHour: Num;
}

export interface Infusion {
  id: Id;
  startAt: Instant;
  name: string;
  /** Eerste element is de startsnelheid; daarna wijzigingen. */
  rates: RateChange[];
  stopAt: Instant;
}

export type LineType =
  | 'perifeer_infuus'
  | 'uvc'
  | 'uac'
  | 'picc'
  | 'arterielijn'
  | 'maagsonde'
  | 'replogle'
  | 'urinekatheter'
  | 'thoraxdrain'
  | 'endotracheale_tube';

export interface Line {
  id: Id;
  type: Exclude<LineType, 'endotracheale_tube'>;
  size: Num;
  sizeUnit: string;
  depthCm: Num;
  location: string;
  tipPosition: string;
}

export type TubeRoute = '' | 'oraal' | 'nasaal';

export type TubeVersionKind = 'plaatsing' | 'aanpassing';

/** Eén geldige toestand van een endotracheale tube vanaf `validFrom`. */
export interface TubeVersion {
  id: Id;
  kind: TubeVersionKind;
  validFrom: Instant;
  sizeMm: Num;
  route: TubeRoute;
  depthCm: Num;
  tipPosition: string;
  /** Gezet wanneer de gegevens via een expliciete historische correctie zijn gewijzigd. */
  correctedAt: Instant;
}

export interface EndotrachealTube {
  id: Id;
  /** Chronologische historie; de eerste versie is de plaatsing. */
  versions: TubeVersion[];
  /** Tijdstip waarop deze tube is vervangen door een nieuwe tube. */
  replacedAt: Instant;
}

export type ChecklistStatus = 'nog_niet' | 'gedaan' | 'nvt';
export const CHECKLIST_KEYS = ['fixatie', 'gas', 'tempGlucose', 'beeldvorming', 'ouders', 'voeding'] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

export interface Closure {
  departedCotsideAt: Instant;
  eventsDuringTransport: string;
  arrivedReceivingAt: Instant;
}

export interface Transport {
  id: Id;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  child: Child;
  referral: Referral;
  birth: Birth;
  referralCondition: ReferralCondition;
  teamAssessment: TeamAssessment;
  measurements: Measurement[];
  otherLabs: string;
  imaging: string;
  allergies: string;
  medications: MedicationAdministration[];
  infusions: Infusion[];
  lines: Line[];
  tubes: EndotrachealTube[];
  proceduresAndEvents: string;
  parentsAndFamily: string;
  checklist: Record<ChecklistKey, ChecklistStatus>;
  parentPhones: string[];
  closure: Closure;
}
