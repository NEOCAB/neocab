import { nextTheme, setTheme, THEME_LABELS, useTheme } from './theme';
import { ThemeIcon } from './icons';

/** Eén knop om snel te wisselen tussen automatisch, licht en donker (bijv. in een donkere ambulance). */
export function ThemeButton({ showLabel = false }: { showLabel?: boolean }) {
  const theme = useTheme();
  return (
    <button type="button" className="theme-button" title={`Weergave: ${THEME_LABELS[theme].toLowerCase()} (tik om te wisselen)`} aria-label={`Weergave: ${THEME_LABELS[theme].toLowerCase()}. Tik om te wisselen.`} onClick={() => setTheme(nextTheme(theme))}>
      <ThemeIcon />
      {showLabel && <span>{THEME_LABELS[theme]}</span>}
    </button>
  );
}
