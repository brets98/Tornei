import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { dictionaries, I18nContext, LANGUAGES, locales, type Language } from './context';

const STORAGE_KEY = 'tornei.language';

/** The language chosen before on this browser, otherwise the browser's own. */
function preferredLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGUAGES.includes(saved as Language)) return saved as Language;
  } catch {
    // Storage blocked (private mode, settings): fall back to the browser language
  }
  return navigator.language?.toLowerCase().startsWith('it') ? 'it' : 'en';
}

export function LanguageProvider({
  children,
  language: initial,
}: {
  children: ReactNode;
  /** Fixed starting language (tests); otherwise the saved or browser one */
  language?: Language;
}) {
  const [language, setLanguageState] = useState<Language>(() => initial ?? preferredLanguage());

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage: (next: Language) => {
        setLanguageState(next);
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // Not saved: the choice lasts until the page is reloaded
        }
      },
      t: dictionaries[language],
      locale: locales[language],
    }),
    [language],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
