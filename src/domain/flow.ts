import type { Instant, LocalDate, Transport } from './types';
import { instantMs, instantToWall, todayLocalDate, wallToInstant, localDateOfMs } from './time';

/**
 * Het verloop van het transport: zes tijdstippen die elk op een eigen plek in het formulier staan
 * (Herkomst, Dispatch, Stabilisatie, Transport) en samen in het Transportverloop-overzicht (zijbalk of balk onderaan).
 */
export interface FlowStep {
  n: number;
  label: string;
  /** Sectie waarin het veld staat. */
  section: string;
  get: (t: Transport) => Instant;
  set: (t: Transport, v: Instant) => Transport;
}

export const FLOW_STEPS: FlowStep[] = [
  { n: 1, label: 'Verwijzing', section: 's2', get: (t) => t.referral.referredAt, set: (t, v) => ({ ...t, referral: { ...t.referral, referredAt: v } }) },
  { n: 2, label: 'Ambulance gebeld', section: 'sdispatch', get: (t) => t.dispatch.ambulanceCalledAt, set: (t, v) => ({ ...t, dispatch: { ...t.dispatch, ambulanceCalledAt: v } }) },
  { n: 3, label: 'Vertrek team', section: 'sdispatch', get: (t) => t.dispatch.departedWithAmbulanceAt, set: (t, v) => ({ ...t, dispatch: { ...t.dispatch, departedWithAmbulanceAt: v } }) },
  { n: 4, label: 'Aankomst bij kind', section: 's5', get: (t) => t.teamAssessment.arrivedAt, set: (t, v) => ({ ...t, teamAssessment: { ...t.teamAssessment, arrivedAt: v } }) },
  { n: 5, label: 'Vertrek met kind', section: 's14', get: (t) => t.closure.departedCotsideAt, set: (t, v) => ({ ...t, closure: { ...t.closure, departedCotsideAt: v } }) },
  { n: 6, label: 'Aankomst', section: 's14', get: (t) => t.closure.arrivedReceivingAt, set: (t, v) => ({ ...t, closure: { ...t.closure, arrivedReceivingAt: v } }) },
];

/** Index van de volgende stap: de eerste die nog leeg is; `-1` als alles is ingevuld. */
export function flowNextIndex(t: Transport): number {
  return FLOW_STEPS.findIndex((s) => !s.get(t));
}

export function flowDoneCount(t: Transport): number {
  return FLOW_STEPS.filter((s) => s.get(t)).length;
}

/** Basisdatum van het verloop: de dag van het vroegste ingevulde tijdstip; daarna tonen latere dagen "+1 dag". */
export function flowBase(t: Transport, tz: string): LocalDate {
  let best: Instant = null;
  for (const s of FLOW_STEPS) {
    const v = s.get(t);
    if (v && (best === null || (instantMs(v) ?? Infinity) < (instantMs(best) ?? Infinity))) best = v;
  }
  return best ? instantToWall(best, tz).slice(0, 10) : '';
}

/**
 * Zet een getypte kloktijd ("HH:MM") op een tijdstip: de datum van het bestaande tijdstip blijft staan, anders vandaag;
 * bij een leeg tijdstip dat zo meer dan 12 uur in de toekomst komt te liggen, is het gisteren (bijv. rond middernacht).
 */
export function instantWithClock(current: Instant, hm: string, tz: string, now: number = Date.now()): Instant {
  const wall = instantToWall(current, tz);
  let date = wall ? wall.slice(0, 10) : todayLocalDate(tz, now);
  let inst = wallToInstant(`${date}T${hm}`, tz);
  if (!wall && inst && Date.parse(inst) - now > 12 * 3_600_000) {
    date = localDateOfMs(now - 86_400_000, tz);
    inst = wallToInstant(`${date}T${hm}`, tz);
  }
  return inst;
}
