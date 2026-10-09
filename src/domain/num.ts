import type { Num } from './types';

export type ParseResult = { ok: true; value: Num } | { ok: false; error: string };

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
    return { ok: false, error: 'Voer een geldig getal in (komma of punt toegestaan).' };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, error: 'Voer een geldig getal in.' };
  if (rules.integer && !Number.isInteger(value)) return { ok: false, error: 'Voer een geheel getal in.' };
  if (rules.positive && !(value > 0)) return { ok: false, error: 'De waarde moet groter dan 0 zijn.' };
  if (rules.min !== undefined && value < rules.min) {
    return { ok: false, error: rules.min === 0 ? 'Een negatieve waarde is hier niet mogelijk.' : `De waarde moet minimaal ${formatNumber(rules.min)} zijn.` };
  }
  if (rules.max !== undefined && value > rules.max) {
    return { ok: false, error: `De waarde kan niet hoger zijn dan ${formatNumber(rules.max)}.` };
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

/** Weergave voor verslag; `null` wanneer leeg (dan niet tonen). */
export function formatNum(v: Num, unit = ''): string | null {
  if (v === null) return null;
  if (v === 'onbekend') return 'onbekend';
  return unit ? `${formatNumber(v)} ${unit}` : formatNumber(v);
}
