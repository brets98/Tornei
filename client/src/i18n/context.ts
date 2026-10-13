import { createContext, useContext } from 'react';
import { en, type Messages } from './en';
import { it } from './it';

export const LANGUAGES = ['it', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const dictionaries: Record<Language, Messages> = { it, en };

/** For dates and numbers. */
export const locales: Record<Language, string> = { it: 'it-IT', en: 'en-GB' };

export interface I18n {
  language: Language;
  setLanguage: (language: Language) => void;
  /** The strings of the current language */
  t: Messages;
  locale: string;
}

// Without a provider (e.g. in some tests): English, fixed
export const I18nContext = createContext<I18n>({
  language: 'en',
  setLanguage: () => {},
  t: en,
  locale: locales.en,
});

export function useI18n() {
  return useContext(I18nContext);
}

/** Replaces `{key}` placeholders: fill('Group {group}', { group: 'A' }) → 'Group A'. */
export function fill(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}
