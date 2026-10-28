import type { Num } from './types';

/**
 * Thompsonscore voor encefalopathie na perinatale asfyxie (protocol "Therapeutische hypothermie na perinatale asfyxie").
 * Negen onderdelen, elk 0–2 of 0–3 punten; totaal 0–22. Protocol: indicatie bij een score ≥ 7 op 1 uur na de reanimatie
 * (of een afwijkend aEEG).
 */
export const THOMPSON_ITEMS = [
  { key: 'tone', label: 'Tonus', options: ['normaal', 'hypertonie', 'hypotonie', 'slap'] },
  { key: 'consciousness', label: 'Bewustzijn', options: ['normaal', 'hyperalert', 'lethargisch', 'comateus'] },
  { key: 'seizures', label: 'Convulsies', options: ['geen', '< 3/dag', '> 2/dag'] },
  { key: 'posture', label: 'Houding', options: ['normaal', 'gebalde vuisten, fietsbewegingen', 'sterke distale flexie', 'decerebratie houding'] },
  { key: 'moro', label: 'Moro reflex', options: ['normaal', 'afgezwakt', 'afwezig'] },
  { key: 'grasp', label: 'Grijpreflex', options: ['normaal', 'zwak', 'afwezig'] },
  { key: 'suck', label: 'Zuigreflex', options: ['normaal', 'zwak', 'afwezig, evt. bijten'] },
  { key: 'respiration', label: 'Ademhaling', options: ['normaal', 'hyperventilatie', 'korte apnoes', 'beademing (apneu)'] },
  { key: 'fontanelle', label: 'Fontanel', options: ['normaal', 'vol, niet gespannen', 'gespannen'] },
] as const;

export type ThompsonKey = (typeof THOMPSON_ITEMS)[number]['key'];
export const THOMPSON_KEYS = THOMPSON_ITEMS.map((i) => i.key) as ThompsonKey[];
export const THOMPSON_MAX = THOMPSON_ITEMS.reduce((s, i) => s + i.options.length - 1, 0);
/** Drempel uit het protocol: Thompsonscore ≥ 7 op 1 uur na de reanimatie. */
export const THOMPSON_THRESHOLD = 7;

export type ThompsonScores = Record<ThompsonKey, Num>;

export function emptyThompson(): ThompsonScores {
  return Object.fromEntries(THOMPSON_KEYS.map((k) => [k, null])) as ThompsonScores;
}

/** Totaal van de ingevulde onderdelen en hoeveel er zijn ingevuld. */
export function thompsonTotal(scores: ThompsonScores): { total: number; filled: number; complete: boolean } {
  let total = 0;
  let filled = 0;
  for (const k of THOMPSON_KEYS) {
    const v = scores[k];
    if (typeof v === 'number') {
      total += v;
      filled++;
    }
  }
  return { total, filled, complete: filled === THOMPSON_KEYS.length };
}

/** Bijv. "1 – hypertonie"; `null` als niet ingevuld. */
export function thompsonItemText(key: ThompsonKey, v: Num): string | null {
  const item = THOMPSON_ITEMS.find((i) => i.key === key);
  if (!item || typeof v !== 'number') return null;
  return `${v} – ${item.options[v] ?? ''}`;
}

/** Bijv. "9 / 22" of "5 / 22 (onvolledig: 4 van 9 onderdelen ingevuld)"; `null` als niets is ingevuld. */
export function thompsonTotalText(scores: ThompsonScores): string | null {
  const { total, filled, complete } = thompsonTotal(scores);
  if (filled === 0) return null;
  return `${total} / ${THOMPSON_MAX}${complete ? '' : ` (onvolledig: ${filled} van ${THOMPSON_KEYS.length} onderdelen ingevuld)`}`;
}
