import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { saveTheme, savedTheme, THEMES, type Theme } from '../lib/theme';

/** Light, dark, or as the device is set; next to the language switch. */
export function ThemeSwitch() {
  const { t } = useI18n();
  const [theme, setTheme] = useState<Theme>(savedTheme);
  return (
    <select
      className="language-switch"
      aria-label={t.theme.label}
      value={theme}
      onChange={(e) => {
        const next = e.target.value as Theme;
        setTheme(next);
        saveTheme(next);
      }}
    >
      {THEMES.map((name) => (
        <option key={name} value={name}>
          {t.theme[name]}
        </option>
      ))}
    </select>
  );
}
