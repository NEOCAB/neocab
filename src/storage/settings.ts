import { DEFAULT_MEDICATION_ROUTES } from '../domain/labels';
import { DEFAULT_TIME_ZONE } from '../domain/time';
import type { KeyValueStorage } from './localRepository';

export interface AppSettings {
  timeZone: string;
  /** Configureerbare opties voor de toedieningsroute van medicatie. */
  medicationRoutes: string[];
  /** Bij de acht klinische kopjes (Airway … Infection) alleen de beginletter tonen, links van het invulveld. */
  abcdLettersOnly: boolean;
}

const KEY = 'neonataal-transport:v1:instellingen';

export const DEFAULT_SETTINGS: AppSettings = { timeZone: DEFAULT_TIME_ZONE, medicationRoutes: DEFAULT_MEDICATION_ROUTES, abcdLettersOnly: false };

export function loadSettings(storage: KeyValueStorage): AppSettings {
  try {
    const v = JSON.parse(storage.getItem(KEY) ?? 'null');
    if (!v || typeof v !== 'object') return DEFAULT_SETTINGS;
    return {
      timeZone: typeof v.timeZone === 'string' && isValidTimeZone(v.timeZone) ? v.timeZone : DEFAULT_TIME_ZONE,
      medicationRoutes: Array.isArray(v.medicationRoutes) ? v.medicationRoutes.filter((r: unknown) => typeof r === 'string' && r.trim()) : DEFAULT_MEDICATION_ROUTES,
      abcdLettersOnly: v.abcdLettersOnly === true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(storage: KeyValueStorage, s: AppSettings) {
  storage.setItem(KEY, JSON.stringify(s));
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('nl-NL', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
