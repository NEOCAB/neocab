import type { Measurement } from './types';
import { isKnown } from './num';
import { isInvasive } from './labels';

/** Omrekenfactor kPa → mmHg. */
export const KPA_TO_MMHG = 7.50062;
/** Boven deze waarde wordt de OI met een oranje alert aangegeven. */
export const OI_ALERT_THRESHOLD = 25;
export const OI_FORMULA = 'OI = (MAP × FiO₂ × 100) / PaO₂ (MAP luchtweg in cmH₂O, FiO₂ als fractie, PaO₂ in mmHg = kPa × 7,50062)';

/**
 * Oxygenatie-index van een meetmoment, of `null` als er onvoldoende gegevens zijn.
 * Vereist: invasieve beademing met luchtweg-MAP (PTV/SIMV: gemeten MAP, HFOV: MAP), FiO₂ en een arterieel bloedgas met pO₂.
 */
export function oxygenationIndex(m: Measurement): number | null {
  const mode = m.resp.mode;
  if (!mode || !isInvasive(mode)) return null;
  const s = m.resp.settingsByMode[mode] ?? {};
  const map = s.map;
  const fio2 = s.fio2;
  const po2Kpa = m.gas.values.po2;
  if (m.gas.type !== 'arterieel' || !isKnown(map) || !isKnown(fio2) || !isKnown(po2Kpa) || po2Kpa <= 0) return null;
  // FiO₂ staat in %, dus (FiO₂ als fractie) × 100 = FiO₂ in %.
  return (map * fio2) / (po2Kpa * KPA_TO_MMHG);
}

export function isOiAlert(oi: number | null): boolean {
  return oi !== null && oi > OI_ALERT_THRESHOLD;
}

export function formatOi(oi: number): string {
  return (Math.round(oi * 10) / 10).toFixed(1).replace('.', ',');
}
