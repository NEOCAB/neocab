import type {
  AbcdKey,
  ChecklistKey,
  ChecklistStatus,
  Corticosteroids,
  GasKey,
  GasType,
  LineType,
  MonitorKey,
  Phase,
  RespMode,
  TubeRoute,
  VitaminK,
  YesNoUnknown,
} from './types';

export type Options<T extends string> = { value: Exclude<T, ''>; label: string }[];

/** De acht klinische kopjes blijven bewust in het Engels. */
export const ABCD_LABELS: Record<AbcdKey, string> = {
  airway: 'Airway',
  breathing: 'Breathing',
  circulation: 'Circulation',
  disability: 'Disability',
  fluids: 'Fluids',
  gastrointestinal: 'Gastro-intestinal',
  haematological: 'Haematological',
  infection: 'Infection',
};

export const CORTICO_OPTIONS: Options<Corticosteroids> = [
  { value: 'niet', label: 'Niet' },
  { value: 'onvolledig', label: 'Onvolledige kuur' },
  { value: 'volledig', label: 'Volledige kuur' },
  { value: 'onbekend', label: 'Onbekend' },
];

export const YES_NO_UNKNOWN_OPTIONS: Options<YesNoUnknown> = [
  { value: 'ja', label: 'Ja' },
  { value: 'nee', label: 'Nee' },
  { value: 'onbekend', label: 'Onbekend' },
];

export const VITAMIN_K_OPTIONS: Options<VitaminK> = [
  { value: 'ja_oraal', label: 'Ja, oraal' },
  { value: 'nee', label: 'Nee' },
  { value: 'anders', label: 'Anders' },
];

export const PHASE_OPTIONS: Options<Phase> = [
  { value: 'bij_verwijzing', label: 'Bij verwijzing' },
  { value: 'stabilisatie', label: 'Stabilisatie' },
  { value: 'onderweg', label: 'Onderweg' },
  { value: 'bij_overdracht', label: 'Bij overdracht' },
];

export const GAS_TYPE_OPTIONS: Options<GasType> = [
  { value: 'arterieel', label: 'Arterieel' },
  { value: 'veneus', label: 'Veneus' },
  { value: 'capillair', label: 'Capillair' },
];

export const TUBE_ROUTE_OPTIONS: Options<TubeRoute> = [
  { value: 'oraal', label: 'Oraal' },
  { value: 'nasaal', label: 'Nasaal' },
];

export const CHECKLIST_STATUS_OPTIONS: { value: ChecklistStatus; label: string }[] = [
  { value: 'nog_niet', label: 'Nog niet gedaan' },
  { value: 'gedaan', label: 'Gedaan' },
  { value: 'nvt', label: 'Niet van toepassing' },
];

export const CHECKLIST_LABELS: Record<ChecklistKey, string> = {
  fixatie: 'Tube, lijnen, sondes en drains gecontroleerd en gefixeerd',
  gas: 'Gasvoorraad gecontroleerd',
  tempGlucose: 'Temperatuur en glucose gecontroleerd',
  beeldvorming: 'Beeldvorming beschikbaar voor ontvangend ziekenhuis',
  ouders: 'Ouders geïnformeerd en contactgegevens beschikbaar',
  voeding: 'Voeding/moedermelk meegenomen indien van toepassing',
};

export const LINE_TYPE_LABELS: Record<LineType, string> = {
  perifeer_infuus: 'Perifeer infuus',
  uvc: 'UVC',
  uac: 'UAC',
  picc: 'PICC',
  arterielijn: 'Arterielijn',
  maagsonde: 'Maagsonde',
  replogle: 'Replogle',
  urinekatheter: 'Urinekatheter',
  thoraxdrain: 'Thoraxdrain',
  endotracheale_tube: 'Endotracheale tube',
};

export const LINE_TYPES = Object.keys(LINE_TYPE_LABELS) as LineType[];

export function tubeDepthLabel(route: TubeRoute): string {
  if (route === 'nasaal') return 'Tubediepte bij neus (cm)';
  if (route === 'oraal') return 'Tubediepte bij tandenrij (cm)';
  return 'Tubediepte (cm)';
}

// ---------------------------------------------------------------------------
// Ademhalingsondersteuning

export interface NumFieldDef {
  key: string;
  label: string;
  unit: string;
  optional?: boolean;
  /** Typevalidatie: alleen waarden >= 0 (geen klinische afkapwaarden). */
  min?: number;
  max?: number;
  integer?: boolean;
}

export const RESP_MODE_LABELS: Record<RespMode, string> = {
  geen: 'Geen',
  lowflow: 'Low-flow',
  hfnc: 'HFNC',
  cpap: 'CPAP',
  nippv: 'NIPPV',
  ptv: 'PTV',
  simv: 'SIMV',
  hfov: 'HFOV',
};

export const NON_INVASIVE_MODES: RespMode[] = ['lowflow', 'hfnc', 'cpap', 'nippv'];
export const INVASIVE_MODES: RespMode[] = ['ptv', 'simv', 'hfov'];

export function isInvasive(mode: RespMode | ''): boolean {
  return mode !== '' && INVASIVE_MODES.includes(mode);
}

const PCT = { min: 0, max: 100 };
const POS = { min: 0 };
const f = {
  flow: { key: 'flow', label: 'Flow', unit: 'L/min', ...POS },
  o2: { key: 'o2', label: 'Zuurstofconcentratie (indien bekend)', unit: '%', optional: true, ...PCT },
  fio2: { key: 'fio2', label: 'FiO₂', unit: '%', ...PCT },
  flowOpt: { key: 'flow', label: 'Flow (optioneel)', unit: 'L/min', optional: true, ...POS },
  pip: { key: 'pip', label: 'PIP', unit: 'cmH₂O', ...POS },
  peep: { key: 'peep', label: 'PEEP', unit: 'cmH₂O', ...POS },
  rate: { key: 'rate', label: 'Frequentie', unit: '/min', ...POS },
  backupRate: { key: 'rate', label: 'Ingestelde/back-upfrequentie', unit: '/min', ...POS },
  ti: { key: 'ti', label: 'Inspiratietijd', unit: 's', ...POS },
  vg: { key: 'vg', label: 'VG (ingesteld doelteugvolume)', unit: 'mL/kg', optional: true, ...POS },
  mapMeasured: { key: 'map', label: 'Gemeten MAP (optioneel)', unit: 'cmH₂O', optional: true, ...POS },
  ps: { key: 'ps', label: 'Pressure support (optioneel)', unit: 'cmH₂O', optional: true, ...POS },
  hfovMap: { key: 'map', label: 'MAP', unit: 'cmH₂O', ...POS },
  amplitude: { key: 'amplitude', label: 'Amplitude ΔP', unit: 'cmH₂O', ...POS },
  hz: { key: 'frequencyHz', label: 'Frequentie', unit: 'Hz', ...POS },
  ie: { key: 'inspFraction', label: 'Inspiratoir aandeel (optioneel)', unit: '%', optional: true, ...PCT },
  ino: { key: 'ino', label: 'iNO (optioneel)', unit: 'ppm', optional: true, ...POS },
} satisfies Record<string, NumFieldDef>;

const BASE_FIELDS: Record<RespMode, NumFieldDef[]> = {
  geen: [],
  lowflow: [f.flow, f.o2],
  hfnc: [f.flow, f.fio2],
  // De CPAP-druk wordt als PEEP geregistreerd (gelijk aan PEEP bij invasieve beademing).
  cpap: [f.peep, f.fio2, f.flowOpt],
  nippv: [f.pip, f.peep, f.rate, f.ti, f.fio2],
  ptv: [f.pip, f.peep, f.backupRate, f.ti, f.fio2, f.vg, f.mapMeasured],
  simv: [f.pip, f.peep, f.rate, f.ti, f.fio2, f.vg, f.mapMeasured, f.ps],
  hfov: [f.hfovMap, f.amplitude, f.hz, f.fio2, f.ie],
};

/** Velden die bij een modaliteit zichtbaar zijn (inclusief iNO bij invasieve modaliteiten). */
export function respFieldsFor(mode: RespMode | ''): NumFieldDef[] {
  if (mode === '') return [];
  const base = BASE_FIELDS[mode];
  return isInvasive(mode) ? [...base, f.ino] : base;
}

// ---------------------------------------------------------------------------
// Monitor en bloedgas

export const MONITOR_FIELDS: (NumFieldDef & { key: MonitorKey })[] = [
  { key: 'heartRate', label: 'Hartfrequentie', unit: '/min', min: 0 },
  { key: 'respRate', label: 'Ademfrequentie', unit: '/min', min: 0 },
  { key: 'spo2Pre', label: 'SpO₂ preductaal', unit: '%', min: 0, max: 100 },
  { key: 'spo2Post', label: 'SpO₂ postductaal', unit: '%', min: 0, max: 100 },
  { key: 'meanBp', label: 'Gemiddelde bloeddruk (MAP)', unit: 'mmHg', min: 0 },
  { key: 'temperature', label: 'Temperatuur', unit: '°C', min: 0 },
  { key: 'capRefill', label: 'Capillaire refill', unit: 'seconden', min: 0 },
  { key: 'tcCo2', label: 'Transcutaan CO₂', unit: 'kPa', min: 0 },
  { key: 'etCo2', label: 'Eind-expiratoir CO₂', unit: 'kPa', min: 0 },
];

export const GAS_FIELDS: (NumFieldDef & { key: GasKey })[] = [
  { key: 'ph', label: 'pH', unit: '', min: 0 },
  { key: 'pco2', label: 'pCO₂', unit: 'kPa', min: 0 },
  { key: 'po2', label: 'pO₂', unit: 'kPa', min: 0 },
  { key: 'hco3', label: 'HCO₃⁻', unit: 'mmol/L', min: 0 },
  { key: 'be', label: 'BE', unit: 'mmol/L' },
  { key: 'lactate', label: 'Lactaat', unit: 'mmol/L', min: 0 },
  { key: 'glucose', label: 'Glucose', unit: 'mmol/L', min: 0 },
  { key: 'hb', label: 'Hb', unit: 'mmol/L', min: 0 },
];

export function optionLabel<T extends string>(options: Options<T>, value: T | ''): string {
  return options.find((o) => o.value === value)?.label ?? '';
}

/** Verwijzende ziekenhuizen: voorstel-lijst, vrije invoer blijft altijd mogelijk. */
export const HOSPITAL_SUGGESTIONS = [
  'Alrijne Ziekenhuis',
  'Amphia',
  'Franciscus Gasthuis & Vlietland',
  'Groene Hart Ziekenhuis',
  'HagaZiekenhuis',
  'Haaglanden Medisch Centrum',
  'Ikazia Ziekenhuis',
  'Maasstad Ziekenhuis',
  'Reinier de Graaf',
  'Spaarne Gasthuis',
  'Van Weel-Bethesda Ziekenhuis',
];

export const DOSE_UNIT_SUGGESTIONS = ['mg', 'microg', 'g', 'mmol', 'mL', 'IE', 'mg/kg', 'microg/kg', 'mmol/kg', 'mL/kg'];
export const LINE_SIZE_UNIT_SUGGESTIONS = ['G', 'Fr', 'Ch', 'mm'];
export const DEFAULT_MEDICATION_ROUTES = ['Intraveneus', 'Intramusculair', 'Subcutaan', 'Oraal', 'Via maagsonde', 'Rectaal', 'Endotracheaal', 'Intraossaal', 'Inhalatie', 'Anders'];
