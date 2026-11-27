/**
 * Light or dark look: `system` follows the device setting. Saved in this browser; applied as
 * `data-theme` on <html> (none for `system`), which index.css reads alongside the media query.
 * index.html applies the saved choice before the app loads, so the page doesn't flash.
 */
export type Theme = 'system' | 'light' | 'dark';
export const THEMES: Theme[] = ['system', 'light', 'dark'];

/** Also read by the script in index.html: keep the two in step. */
const STORAGE_KEY = 'tornei.theme';

export function savedTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (THEMES.includes(saved as Theme)) return saved as Theme;
  } catch {
    // Storage blocked: follow the device
  }
  return 'system';
}

export function applyTheme(theme: Theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function saveTheme(theme: Theme) {
  applyTheme(theme);
  try {
    if (theme === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not saved: the choice lasts until the page is reloaded
  }
}
