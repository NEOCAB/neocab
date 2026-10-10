/**
 * Kleur en icoon van de opslagstatus, op basis van hoe lang wijzigingen al wachten op opslag:
 * - groen (save): alles opgeslagen, of de wijziging is hooguit 10 seconden oud;
 * - oranje (save_clock): een wijziging wacht 10 seconden tot 1 minuut;
 * - rood (save_clock): een wijziging wacht langer dan 1 minuut, of opslaan is mislukt.
 */
export type SaveLevel = 'ok' | 'waiting' | 'error';

export const SAVE_OK_MS = 10_000;
export const SAVE_WARN_MS = 60_000;

export function saveLevel(pendingSince: number | null, now: number, failed: boolean): SaveLevel {
  if (failed) return 'error';
  if (pendingSince === null) return 'ok';
  const age = now - pendingSince;
  if (age <= SAVE_OK_MS) return 'ok';
  if (age <= SAVE_WARN_MS) return 'waiting';
  return 'error';
}
