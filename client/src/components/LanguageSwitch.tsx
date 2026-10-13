import { LANGUAGES, useI18n, type Language } from '../i18n/context';

export function LanguageSwitch() {
  const { language, setLanguage, t } = useI18n();
  return (
    <select
      className="language-switch"
      aria-label={t.language.label}
      value={language}
      onChange={(e) => setLanguage(e.target.value as Language)}
    >
      {LANGUAGES.map((l) => (
        <option key={l} value={l}>
          {t.language[l]}
        </option>
      ))}
    </select>
  );
}
