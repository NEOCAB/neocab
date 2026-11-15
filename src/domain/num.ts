import type { Num } from './types';

/** `soft`: de waarde is wel een getal maar ongebruikelijk (buiten het bereik); ze mag worden vastgelegd, met een rustige melding. */
export type ParseResult = { ok: true; value: Num } | { ok: false; error: string; soft?: true; value?: number };

export interface NumRules {
  min?: number;
  max?: number;
  integer?: boolean;
  /** Strikt positief (bijv. pompsnelheid). */
  positive?: boolean;
}

/**
 * Leest numerieke invoer. Accepteert komma of punt als decimaal scheidingsteken.
 * Lege invoer => `null` (leeg); nooit automatisch 0.
 */
export function parseNum(input: string, rules: NumRules = {}): ParseResult {
  const trimmed = input.trim().replace(/\s+/g, '');
  if (trimmed === '') return { ok: true, value: null };
  const normalized = trimmed.replace(',', '.').replace(/^−/, '-');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(normalized)) {
    return { ok: false, error: 'Dit is geen getal. Typ bijvoorbeeld 7,5 (komma of punt).' };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, error: 'Dit is geen getal. Typ bijvoorbeeld 7,5 (komma of punt).' };
  if (rules.integer && !Number.isInteger(value)) return { ok: false, error: 'Hier past een geheel getal, zonder decimalen.' };
  if (rules.positive && !(value > 0)) return { ok: false, error: 'De waarde moet groter dan 0 zijn.' };
  if (rules.min !== undefined && value < rules.min) {
    return { ok: false, soft: true, value, error: rules.min === 0 ? 'Controleer de waarde: negatief is hier ongebruikelijk.' : `Controleer de waarde: lager dan ${formatNumber(rules.min)} is ongebruikelijk.` };
  }
  if (rules.max !== undefined && value > rules.max) {
    return { ok: false, soft: true, value, error: `Controleer de waarde: hoger dan ${formatNumber(rules.max)} is ongebruikelijk.` };
  }
  return { ok: true, value };
}

/** Getal in Nederlandse notatie (komma), zonder onnodige afronding. */
export function formatNumber(n: number): string {
  return String(n).replace('.', ',');
}

/** Waarde voor invoervelden. */
export function numToInput(v: Num): string {
  return typeof v === 'number' ? formatNumber(v) : '';
}

export function isKnown(v: Num): v is number {
  return typeof v === 'number';
}

export function isFilled(v: Num): boolean {
  return v !== null;
}

/** Weergave van een getal met eenheid; tussen getal en eenheid staat een spatie die niet afbreekt. `null` wanneer leeg (dan niet tonen). */
export function formatNum(v: Num, unit = ''): string | null {
  if (v === null) return null;
  if (v === 'onbekend') return 'onbekend';
  return unit ? `${formatNumber(v)}\u00a0${unit}` : formatNumber(v);
}
