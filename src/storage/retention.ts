import { instantMs } from "../domain/time";
import type { TransportRepository, TransportSummary } from "./repository";

/** Bewaartermijn: een week na aankomst (of na de laatste wijziging, als die later is). */
export const RETENTION_DAYS = 7;
/** Zo lang van tevoren verschijnt de waarschuwing op het startscherm. */
export const WARNING_DAYS = 1;
const DAY_MS = 86_400_000;

/** Moment waarop een transport automatisch wordt verwijderd. */
export function expiresAtMs(
  s: Pick<TransportSummary, "arrivedAt" | "updatedAt">,
): number {
  const arrived = s.arrivedAt ? instantMs(s.arrivedAt) : null;
  const updated = Date.parse(s.updatedAt);
  const base = Math.max(
    arrived ?? -Infinity,
    Number.isNaN(updated) ? -Infinity : updated,
  );
  return (Number.isFinite(base) ? base : Date.now()) + RETENTION_DAYS * DAY_MS;
}

export const isExpired = (
  s: Pick<TransportSummary, "arrivedAt" | "updatedAt">,
  now = Date.now(),
) => expiresAtMs(s) <= now;
export const isExpiringSoon = (
  s: Pick<TransportSummary, "arrivedAt" | "updatedAt">,
  now = Date.now(),
) => !isExpired(s, now) && expiresAtMs(s) - now <= WARNING_DAYS * DAY_MS;

/** Verwijdert alle verlopen transporten; geeft de ids van de verwijderde transporten terug. */
export function purgeExpired(
  repo: TransportRepository,
  now = Date.now(),
): string[] {
  const gone = repo
    .list()
    .filter((s) => isExpired(s, now))
    .map((s) => s.id);
  gone.forEach((id) => repo.remove(id));
  return gone;
}
