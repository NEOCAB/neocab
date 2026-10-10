import type { Measurement, Num } from './types';
import { RESP_MODE_LABELS, respFieldsFor } from './labels';
import { formatNum } from './num';
import { formatInstant } from './time';
import { sortedMeasurements } from './timeline';
import { formatOi, isOiAlert, oxygenationIndex } from './oi';

export type TimelineGroup = 'meetmoment' | 'ademhaling' | 'monitor' | 'bloedgas';

export const TIMELINE_GROUP_LABELS: Record<TimelineGroup, string> = {
  meetmoment: 'Meetmoment',
  ademhaling: 'Ademhalingsondersteuning',
  monitor: 'Monitorgegevens',
  bloedgas: 'Bloedgas',
};

/** Eén kolom van de tijdlijntabel. Elke rij is één meetmoment. */
export interface TimelineColumn {
  key: string;
  group: TimelineGroup;
  /** Korte kolomkop. */
  label: string;
  /** Volledige naam (voor e-mailtekst en schermlezers). */
  fullLabel: string;
  unit: string;
  /** Celwaarde zonder eenheid; '' = leeg (niet ingevuld). */
  cell: (m: Measurement, index: number) => string;
  /** Kolom die altijd getoond wordt (identificatie van de rij). */
  key_column?: boolean;
  /** Cel vraagt aandacht (oranje alert), bijv. OI > 25. */
  alert?: (m: Measurement) => boolean;
}

const num = (v: Num | undefined) => formatNum(v ?? null) ?? '';

function respValue(m: Measurement, key: string): Num | undefined {
  const mode = m.resp.mode;
  if (!mode) return undefined;
  // Alleen instellingen die bij de actuele modaliteit horen.
  if (!respFieldsFor(mode).some((f) => f.key === key)) return undefined;
  return m.resp.settingsByMode[mode]?.[key];
}

const RESP_COLUMNS: { key: string; label: string; fullLabel: string; unit: string }[] = [
  { key: 'flow', label: 'Flow', fullLabel: 'Flow', unit: 'L/min' },
  { key: 'o2', label: 'O₂-conc.', fullLabel: 'Zuurstofconcentratie', unit: '%' },
  { key: 'fio2', label: 'FiO₂', fullLabel: 'FiO₂', unit: '%' },
  { key: 'pip', label: 'PIP', fullLabel: 'PIP', unit: 'cmH₂O' },
  { key: 'peep', label: 'PEEP', fullLabel: 'PEEP', unit: 'cmH₂O' },
  { key: 'rate', label: 'Freq.', fullLabel: 'Frequentie (ingesteld/back-up)', unit: '/min' },
  { key: 'ti', label: 'Ti', fullLabel: 'Inspiratietijd', unit: 's' },
  { key: 'vg', label: 'VG', fullLabel: 'VG (ingesteld doelteugvolume)', unit: 'mL/kg' },
  { key: 'map', label: 'MAP luchtweg', fullLabel: 'MAP (luchtweg)', unit: 'cmH₂O' },
  { key: 'ps', label: 'PS', fullLabel: 'Pressure support', unit: 'cmH₂O' },
  { key: 'amplitude', label: 'ΔP', fullLabel: 'Amplitude ΔP', unit: 'cmH₂O' },
  { key: 'frequencyHz', label: 'Freq.', fullLabel: 'Frequentie HFOV', unit: 'Hz' },
  { key: 'inspFraction', label: 'Insp. aandeel', fullLabel: 'Inspiratoir aandeel', unit: '%' },
  { key: 'ino', label: 'iNO', fullLabel: 'iNO', unit: 'ppm' },
];

const MONITOR_COLUMNS: { key: keyof Measurement['monitor']; label: string; fullLabel: string; unit: string }[] = [
  { key: 'heartRate', label: 'HF', fullLabel: 'Hartfrequentie', unit: '/min' },
  { key: 'respRate', label: 'AF', fullLabel: 'Ademfrequentie', unit: '/min' },
  { key: 'spo2Pre', label: 'SpO₂ pre', fullLabel: 'SpO₂ preductaal', unit: '%' },
  { key: 'spo2Post', label: 'SpO₂ post', fullLabel: 'SpO₂ postductaal', unit: '%' },
  { key: 'meanBp', label: 'Bloeddruk MAP', fullLabel: 'Gemiddelde bloeddruk (MAP)', unit: 'mmHg' },
  { key: 'temperature', label: 'Temp.', fullLabel: 'Temperatuur', unit: '°C' },
  { key: 'capRefill', label: 'Cap. refill', fullLabel: 'Capillaire refill', unit: 's' },
  { key: 'tcCo2', label: 'tcCO₂', fullLabel: 'Transcutaan CO₂', unit: 'kPa' },
  { key: 'etCo2', label: 'etCO₂', fullLabel: 'Eind-expiratoir CO₂', unit: 'kPa' },
];

const GAS_COLUMNS: { key: keyof Measurement['gas']['values']; label: string; fullLabel: string; unit: string }[] = [
  { key: 'ph', label: 'pH', fullLabel: 'pH', unit: '' },
  { key: 'pco2', label: 'pCO₂', fullLabel: 'pCO₂', unit: 'kPa' },
  { key: 'po2', label: 'pO₂', fullLabel: 'pO₂', unit: 'kPa' },
  { key: 'hco3', label: 'HCO₃⁻', fullLabel: 'HCO₃⁻', unit: 'mmol/L' },
  { key: 'be', label: 'BE', fullLabel: 'BE', unit: 'mmol/L' },
  { key: 'lactate', label: 'Lactaat', fullLabel: 'Lactaat', unit: 'mmol/L' },
  { key: 'glucose', label: 'Glucose', fullLabel: 'Glucose', unit: 'mmol/L' },
  { key: 'hb', label: 'Hb', fullLabel: 'Hb', unit: 'mmol/L' },
];

/** Afnametype in de tabel: A = arterieel, V = veneus, C = capillair. */
export const GAS_TYPE_SHORT: Record<Measurement['gas']['type'], string> = { '': '', arterieel: 'A', veneus: 'V', capillair: 'C' };
export const GAS_TYPE_LEGEND = 'Type bloedgas: A = arterieel, V = veneus, C = capillair.';

export function hasGas(m: Measurement): boolean {
  return m.gas.type !== '' || Object.values(m.gas.values).some((v) => v !== null);
}

/** Datum en tijd in twee regels, zodat een transport over middernacht ondubbelzinnig blijft. */
function stamp(i: string | null, timeZone: string): string {
  const s = formatInstant(i, timeZone);
  return s ? s.replace(' ', '\n') : '';
}

/** Alle mogelijke kolommen. */
export function allTimelineColumns(timeZone: string): TimelineColumn[] {
  const cols: TimelineColumn[] = [
    { key: 'at', group: 'meetmoment', label: 'Tijd', fullLabel: 'Datum en tijd', unit: '', cell: (m) => stamp(m.at, timeZone) || '—', key_column: true },
    // OI direct rechts van datum/tijd, als eerste kolom van Ademhalingsondersteuning.
    {
      key: 'oi',
      group: 'ademhaling',
      label: 'OI',
      fullLabel: 'Oxygenatie-index (OI, berekend)',
      unit: '',
      cell: (m) => {
        const oi = oxygenationIndex(m);
        return oi === null ? '' : formatOi(oi);
      },
      alert: (m) => isOiAlert(oxygenationIndex(m)),
    },
    {
      key: 'mode',
      group: 'ademhaling',
      label: 'Modaliteit',
      fullLabel: 'Modaliteit',
      unit: '',
      cell: (m) => (m.resp.mode ? RESP_MODE_LABELS[m.resp.mode] : ''),
    },
    ...RESP_COLUMNS.map((c) => ({ ...c, key: `resp.${c.key}`, group: 'ademhaling' as const, cell: (m: Measurement) => num(respValue(m, c.key)) })),
    ...MONITOR_COLUMNS.map((c) => ({ ...c, key: `mon.${c.key}`, group: 'monitor' as const, cell: (m: Measurement) => num(m.monitor[c.key]) })),
    { key: 'gas.type', group: 'bloedgas', label: 'Type', fullLabel: 'Afnametype (A = arterieel, V = veneus, C = capillair)', unit: '', cell: (m) => GAS_TYPE_SHORT[m.gas.type] },
    ...GAS_COLUMNS.map((c) => ({ ...c, key: `gas.${c.key}`, group: 'bloedgas' as const, cell: (m: Measurement) => num(m.gas.values[c.key]) })),
  ];
  return cols;
}

export interface TimelineTable {
  /** Meetmomenten in chronologische volgorde = de rijen. */
  rows: Measurement[];
  /** Alleen kolommen die bij minstens één meetmoment een waarde hebben (plus de identificatiekolommen). */
  columns: TimelineColumn[];
}

export function timelineTable(measurements: Measurement[], timeZone: string): TimelineTable {
  const rows = sortedMeasurements(measurements);
  const columns = allTimelineColumns(timeZone).filter((c) => c.key_column || rows.some((m, i) => c.cell(m, i) !== ''));
  return { rows, columns };
}

export function columnHeader(c: TimelineColumn): string {
  return c.unit ? `${c.label} (${c.unit})` : c.label;
}

