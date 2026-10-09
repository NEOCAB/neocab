import type { Child, Num, Transport } from './types';
import { isKnown } from './num';
import { calendarDaysBetween, DEFAULT_TIME_ZONE, localDateOf } from './time';

export interface DoseWeight {
  /** Automatisch berekende waarde (hoogste bekende gewicht) of `null`. */
  auto: number | null;
  /** Gebruikte waarde: handmatig als ingevuld, anders automatisch. */
  value: Num;
  manual: boolean;
}

/**
 * Doseergewicht: standaard het hoogste van geboortegewicht en huidig gewicht;
 * bij één bekend gewicht dat gewicht; anders leeg. Een handmatige waarde gaat altijd voor.
 */
export function doseWeight(child: Pick<Child, 'birthWeightGram' | 'currentWeightGram' | 'doseWeightOverrideGram'>): DoseWeight {
  const known = [child.birthWeightGram, child.currentWeightGram].filter(isKnown);
  const auto = known.length > 0 ? Math.max(...known) : null;
  if (child.doseWeightOverrideGram !== null) {
    return { auto, value: child.doseWeightOverrideGram, manual: true };
  }
  return { auto, value: auto, manual: false };
}

export interface PostmenstrualAge {
  weeks: number;
  days: number;
  /** Totaal in dagen. */
  totalDays: number;
  /** Verstreken kalenderdagen sinds geboorte (postnatale leeftijd), los van de PML. */
  postnatalDays: number;
  transportDate: string;
}

/** Transportdatum = lokale kalenderdatum van de verwijzing. */
export function transportDate(t: Pick<Transport, 'referral'>, timeZone = DEFAULT_TIME_ZONE): string {
  return localDateOf(t.referral.referredAt, timeZone);
}

/**
 * Postmenstruele leeftijd = zwangerschapsduur bij geboorte + verstreken kalenderdagen
 * van geboortedatum tot transportdatum (datum van verwijzing).
 */
export function postmenstrualAge(child: Pick<Child, 'birthDate' | 'gestationalAgeWeeks' | 'gestationalAgeDays'>, transportDateLocal: string): PostmenstrualAge | null {
  // Beide delen moeten expliciet ingevuld zijn (ook 0 dagen); een lege waarde wordt nooit als 0 behandeld.
  if (!isKnown(child.gestationalAgeWeeks) || !isKnown(child.gestationalAgeDays)) return null;
  const gaDays = child.gestationalAgeDays;
  const elapsed = calendarDaysBetween(child.birthDate, transportDateLocal);
  if (elapsed === null || elapsed < 0) return null;
  const total = child.gestationalAgeWeeks * 7 + gaDays + elapsed;
  return { weeks: Math.floor(total / 7), days: total % 7, totalDays: total, postnatalDays: elapsed, transportDate: transportDateLocal };
}

export function formatGestation(weeks: Num, days: Num): string | null {
  if (weeks === null && days === null) return null;
  if (weeks === 'onbekend') return 'onbekend';
  const w = isKnown(weeks) ? String(weeks) : '?';
  const d = isKnown(days) ? String(days) : '?';
  return `${w}+${d} weken`;
}
