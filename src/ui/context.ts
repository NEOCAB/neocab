import { createContext, useContext } from 'react';
import { DEFAULT_SETTINGS, type AppSettings } from '../storage/settings';

export const SettingsContext = createContext<AppSettings>(DEFAULT_SETTINGS);

export function useSettings(): AppSettings {
  return useContext(SettingsContext);
}

export function useTimeZone(): string {
  return useContext(SettingsContext).timeZone;
}

/** Persoonlijk apparaat: transporten worden anoniem vastgelegd (geen naam en geen patiëntnummer). */
export function useAnonymous(): boolean {
  return useContext(SettingsContext).device === 'persoonlijk';
}

/** Naam van een transport in koppen en lijsten. */
export function childLabel(name: string, anonymous: boolean): string {
  return name || (anonymous ? 'Anoniem transport' : 'Naam kind niet ingevuld');
}
