import type { Instant, LocalDate } from './types';

export const DEFAULT_TIME_ZONE = 'Europe/Amsterdam';

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function wallParts(ms: number, timeZone: string): WallParts {
  let fmt = partsFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatters.set(timeZone, fmt);
  }
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(new Date(ms))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return { year: p.year, month: p.month, day: p.day, hour: p.hour === 24 ? 0 : p.hour, minute: p.minute, second: p.second };
}

/** Offset van de tijdzone t.o.v. UTC in minuten op het gegeven moment. */
export function offsetMinutes(ms: number, timeZone: string): number {
  const p = wallParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** ISO-8601 met de offset van de opgegeven tijdzone, bv. `2026-10-09T23:45:00+02:00`. */
export function toInstant(ms: number, timeZone: string = DEFAULT_TIME_ZONE): string {
  const p = wallParts(ms, timeZone);
  const off = offsetMinutes(ms, timeZone);
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Huidig tijdstip, afgerond op de minuut (zoals invoervelden het tonen). */
export function nowInstant(timeZone: string = DEFAULT_TIME_ZONE, now: number = Date.now()): string {
  return toInstant(Math.floor(now / 60000) * 60000, timeZone);
}

export function instantMs(i: Instant): number | null {
  if (!i) return null;
  const ms = Date.parse(i);
  return Number.isNaN(ms) ? null : ms;
}

/** Waarde voor `<input type="datetime-local">`: `YYYY-MM-DDTHH:mm` in de gekozen tijdzone. */
export function instantToWall(i: Instant, timeZone: string = DEFAULT_TIME_ZONE): string {
  const ms = instantMs(i);
  if (ms === null) return '';
  const p = wallParts(ms, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * Zet een lokale kloktijd (`YYYY-MM-DDTHH:mm`) in de gekozen tijdzone om naar een tijdstip.
 * Bij een dubbelzinnig uur (wintertijdovergang) wordt het eerste voorkomen gekozen;
 * bij een niet-bestaand uur (zomertijdovergang) schuift de tijd een uur door.
 */
export function wallToInstant(wall: string, timeZone: string = DEFAULT_TIME_ZONE): Instant {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(wall);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  // Probeer beide kandidaat-offsets rond het moment en kies de eerste die exact klopt.
  const candidates = [offsetMinutes(guess - 86400000 / 2, timeZone), offsetMinutes(guess, timeZone), offsetMinutes(guess + 86400000 / 2, timeZone)];
  const matches = [...new Set(candidates)]
    .map((off) => guess - off * 60000)
    .filter((ms) => instantToWall(toInstant(ms, timeZone), timeZone) === `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`)
    .sort((a, b) => a - b);
  const ms = matches.length > 0 ? matches[0] : guess - offsetMinutes(guess, timeZone) * 60000;
  return toInstant(ms, timeZone);
}

/** Lokale kalenderdatum van een tijdstip in de gekozen tijdzone. */
export function localDateOf(i: Instant, timeZone: string = DEFAULT_TIME_ZONE): LocalDate {
  const wall = instantToWall(i, timeZone);
  return wall ? wall.slice(0, 10) : '';
}

export function todayLocalDate(timeZone: string = DEFAULT_TIME_ZONE, now: number = Date.now()): LocalDate {
  return localDateOf(toInstant(now, timeZone), timeZone);
}

export function isValidLocalDate(d: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return false;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return dt.getUTCFullYear() === +m[1] && dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === +m[3];
}

/** Aantal kalenderdagen van `from` tot `to` (beide lokale datums). */
export function calendarDaysBetween(from: LocalDate, to: LocalDate): number | null {
  if (!isValidLocalDate(from) || !isValidLocalDate(to)) return null;
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/** `dd-mm-jjjj` */
export function formatLocalDate(d: LocalDate): string {
  if (!isValidLocalDate(d)) return d;
  return `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;
}

/** `dd-mm-jjjj uu:mm` in de gekozen tijdzone. */
export function formatInstant(i: Instant, timeZone: string = DEFAULT_TIME_ZONE): string {
  const wall = instantToWall(i, timeZone);
  if (!wall) return '';
  return `${formatLocalDate(wall.slice(0, 10))} ${wall.slice(11, 16)}`;
}

/** Sorteervergelijking; lege tijdstippen achteraan. */
export function compareInstants(a: Instant, b: Instant): number {
  const am = instantMs(a);
  const bm = instantMs(b);
  if (am === null && bm === null) return 0;
  if (am === null) return 1;
  if (bm === null) return -1;
  return am - bm;
}
