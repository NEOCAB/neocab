/**
 * Perinatale asfyxie (protocol "Therapeutische hypothermie na perinatale asfyxie", inclusievoorwaarde 4):
 * minimaal één van de volgende criteria.
 */
export const ASPHYXIA_CRITERIA = [
  { key: 'apgar5', label: 'Apgarscore op 5 minuten ≤ 5' },
  { key: 'resuscitation', label: 'Reanimatie' },
  { key: 'ventilation', label: 'Beademing (na reanimatie) gedurende ≥ 10 minuten na de geboorte' },
  { key: 'ph', label: 'pH < 7.0' },
  { key: 'be', label: 'BE < -16 mmol/L' },
  { key: 'lactate', label: 'Lactaat > 10.0 mmol/L' },
] as const;

export type AsphyxiaCriterion = (typeof ASPHYXIA_CRITERIA)[number]['key'];

/** Bloedgascriteria gelden voor navelstrengbloed of tot 1 uur na geboorte (arterieel, veneus of capillair). */
export const ASPHYXIA_GAS_NOTE = 'pH, BE en lactaat: navelstrengbloed of tot 1 uur na geboorte (arterieel, veneus of capillair).';

export function asphyxiaCriterionLabel(key: AsphyxiaCriterion): string {
  return ASPHYXIA_CRITERIA.find((c) => c.key === key)?.label ?? key;
}

