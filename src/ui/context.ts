import { createContext, useContext } from 'react';
import { DEFAULT_SETTINGS, type AppSettings } from '../storage/settings';

export const SettingsContext = createContext<AppSettings>(DEFAULT_SETTINGS);

export function useSettings(): AppSettings {
  return useContext(SettingsContext);
}

export function useTimeZone(): string {
  return useContext(SettingsContext).timeZone;
}
