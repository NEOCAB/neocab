import type { EndotrachealTube, Infusion, Instant, Measurement, RateChange, TubeVersion } from './types';
import { compareInstants, instantMs } from './time';

/** Meetmomenten chronologisch op ingevoerd tijdstip (stabiel bij gelijke tijden). */
export function sortedMeasurements(list: Measurement[]): Measurement[] {
  return list
    .map((m, i) => ({ m, i }))
    .sort((a, b) => compareInstants(a.m.at, b.m.at) || a.i - b.i)
    .map((x) => x.m);
}

/** Voegt een meetmoment toe of vervangt het (op id) en houdt de lijst chronologisch. */
export function upsertMeasurement(list: Measurement[], m: Measurement): Measurement[] {
  const exists = list.some((x) => x.id === m.id);
  return sortedMeasurements(exists ? list.map((x) => (x.id === m.id ? m : x)) : [...list, m]);
}

export function sortedRates(inf: Infusion): RateChange[] {
  return [...inf.rates].sort((a, b) => compareInstants(a.at, b.at));
}

export function sortedVersions(tube: EndotrachealTube): TubeVersion[] {
  return [...tube.versions].sort((a, b) => compareInstants(a.validFrom, b.validFrom));
}

export function tubePlacedAt(tube: EndotrachealTube): Instant {
  return sortedVersions(tube)[0]?.validFrom ?? null;
}

export interface TubeAtTime {
  tube: EndotrachealTube;
  version: TubeVersion;
}

/**
 * Tubegegevens die op tijdstip `at` gelden: de tube die op dat moment geplaatst en nog niet vervangen was,
 * met de laatste versie waarvan `validFrom <= at`. Latere aanpassingen beïnvloeden eerdere meetmomenten daardoor niet.
 */
export function tubeAt(tubes: EndotrachealTube[], at: Instant): TubeAtTime | null {
  const t = instantMs(at);
  if (t === null) return null;
  let best: TubeAtTime | null = null;
  let bestMs = -Infinity;
  for (const tube of tubes) {
    const replaced = instantMs(tube.replacedAt);
    if (replaced !== null && replaced <= t) continue;
    for (const v of sortedVersions(tube)) {
      const from = instantMs(v.validFrom);
      if (from === null || from > t) continue;
      if (from >= bestMs) {
        best = { tube, version: v };
        bestMs = from;
      }
    }
  }
  return best;
}

/** De tube die nu actief is (niet vervangen); de laatst geplaatste bij meerdere. */
export function currentTube(tubes: EndotrachealTube[]): EndotrachealTube | null {
  const active = tubes.filter((t) => !t.replacedAt);
  if (active.length === 0) return null;
  return active.sort((a, b) => compareInstants(tubePlacedAt(a), tubePlacedAt(b)))[active.length - 1];
}
