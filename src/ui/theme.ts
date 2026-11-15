import { useSyncExternalStore } from 'react';

/**
 * Weergave per apparaat: donkere modus (automatisch volgens het apparaat, licht of donker) en grotere tekst.
 * Alleen een gemak voor deze gebruiker: bewaard in de browser van dit apparaat, zonder patiëntgegevens.
 */
export type Theme = 'auto' | 'licht' | 'donker';
export type TextSize = 'normaal' | 'groot';

const THEME_KEY = 'neocab:thema';
const TEXT_KEY = 'neocab:tekstgrootte';

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

let state = { theme: 'auto' as Theme, text: 'normaal' as TextSize };
const listeners = new Set<() => void>();

function apply() {
  const root = document.documentElement;
  if (state.theme === 'licht') root.dataset.theme = 'light';
  else if (state.theme === 'donker') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  if (state.text === 'groot') root.dataset.text = 'groot';
  else delete root.dataset.text;
}

/** Eenmalig bij het starten: gekozen weergave uitlezen en toepassen (vóór het eerste scherm, zodat er niets flitst). */
export function initDisplay() {
  state = { theme: read<Theme>(THEME_KEY, ['auto', 'licht', 'donker'], 'auto'), text: read<TextSize>(TEXT_KEY, ['normaal', 'groot'], 'normaal') };
  apply();
}

function commit(next: typeof state) {
  state = next;
  apply();
  listeners.forEach((l) => l());
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* alleen voor deze sessie */
  }
  commit({ ...state, theme });
}

export function setTextSize(text: TextSize) {
  try {
    localStorage.setItem(TEXT_KEY, text);
  } catch {
    /* alleen voor deze sessie */
  }
  commit({ ...state, text });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const useTheme = (): Theme => useSyncExternalStore(subscribe, () => state.theme);
export const useTextSize = (): TextSize => useSyncExternalStore(subscribe, () => state.text);

const ORDER: Theme[] = ['auto', 'licht', 'donker'];
export const nextTheme = (t: Theme): Theme => ORDER[(ORDER.indexOf(t) + 1) % ORDER.length];
export const THEME_LABELS: Record<Theme, string> = { auto: 'Automatisch', licht: 'Licht', donker: 'Donker' };
