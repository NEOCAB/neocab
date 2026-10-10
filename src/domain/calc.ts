import type { Child, Num, Transport } from './types';
import { isKnown } from './num';
import { calendarDaysBetween, DEFAULT_TIME_ZONE, instantMs, isValidLocalDate, localDateOf, wallToInstant } from './time';

export interface CorrectedAge {
  weeks: number;
  days: number;
  /** Totaal in dagen. */
  totalDays: number;
  /** Postnatale dag: de geboortedag is dag 1, de dag erna dag 2, enz. */
  postnatalDay: number;
  transportDate: string;
}

/** Transportdatum = lokale kalenderdatum van de verwijzing. */
export function transportDate(t: Pick<Transport, 'referral'>, timeZone = DEFAULT_TIME_ZONE): string {
  return localDateOf(t.referral.referredAt, timeZone);
}

/**
 * Gecorrigeerde leeftijd = amenorroeduur bij geboorte + verstreken kalenderdagen
 * van geboortedatum tot transportdatum (datum van verwijzing).
 */
export function correctedAge(child: Pick<Child, 'birthDate' | 'gestationalAgeWeeks' | 'gestationalAgeDays'>, transportDateLocal: string): CorrectedAge | null {
  // Beide delen moeten expliciet ingevuld zijn (ook 0 dagen); een lege waarde wordt nooit als 0 behandeld.
  if (!isKnown(child.gestationalAgeWeeks) || !isKnown(child.gestationalAgeDays)) return null;
  const gaDays = child.gestationalAgeDays;
  const elapsed = calendarDaysBetween(child.birthDate, transportDateLocal);
  if (elapsed === null || elapsed < 0) return null;
  const total = child.gestationalAgeWeeks * 7 + gaDays + elapsed;
  return { weeks: Math.floor(total / 7), days: total % 7, totalDays: total, postnatalDay: elapsed + 1, transportDate: transportDateLocal };
}

export function formatGestation(weeks: Num, days: Num): string | null {
  if (weeks === null && days === null) return null;
  if (weeks === 'onbekend') return 'onbekend';
  const w = isKnown(weeks) ? String(weeks) : '?';
  const d = isKnown(days) ? String(days) : '?';
  return `${w}+${d} weken`;
}

/** Invoerwaarde `weken+dagen` (bijv. `33+5`). */
export function gestationToInput(weeks: Num, days: Num): string {
  if (!isKnown(weeks)) return '';
  return isKnown(days) ? `${weeks}+${days}` : String(weeks);
}

export type GestationParse = { ok: true; weeks: number | null; days: number | null } | { ok: false; error: string };

/**
 * Leest amenorroeduur als één waarde: `33+5`, `33 + 5` of `33` (= 33+0). Dagen 0–6.
 * Leeg geeft leeg (geen 0).
 */
export function parseGestation(input: string): GestationParse {
  const t = input.trim();
  if (t === '') return { ok: true, weeks: null, days: null };
  const m = /^(\d{1,2})\s*(?:\+\s*(\d{1,2}))?$/.exec(t);
  if (!m) return { ok: false, error: 'Voer de amenorroeduur in als weken+dagen, bijvoorbeeld 33+5.' };
  const weeks = Number(m[1]);
  const days = m[2] === undefined ? 0 : Number(m[2]);
  if (days > 6) return { ok: false, error: 'Het aantal dagen is 0 tot en met 6.' };
  return { ok: true, weeks, days };
}

/** Grens waaronder de leeftijd ook in uren en minuten wordt getoond. */
export const AGE_IN_HOURS_LIMIT_H = 72;

/**
 * Leeftijd in uren en minuten op tijdstip `now`, alleen als het kind jonger is dan 72 uur.
 * Vereist geboortedatum én geboortetijd; anders `null`.
 */
export function ageInHoursIfYoung(child: Pick<Child, 'birthDate' | 'birthTime'>, now: number, timeZone = DEFAULT_TIME_ZONE): { hours: number; minutes: number } | null {
  if (!isValidLocalDate(child.birthDate) || !/^\d{2}:\d{2}$/.test(child.birthTime)) return null;
  const birth = instantMs(wallToInstant(`${child.birthDate}T${child.birthTime}`, timeZone));
  if (birth === null) return null;
  const totalMinutes = Math.floor((now - birth) / 60000);
  if (totalMinutes < 0 || totalMinutes >= AGE_IN_HOURS_LIMIT_H * 60) return null;
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}
