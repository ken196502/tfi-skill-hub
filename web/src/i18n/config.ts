export const locales = ["zh", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "zh";

/** Cookie that remembers the visitor's language choice. */
export const LOCALE_COOKIE = "skillhub_locale";

export function resolveLocale(value: string | undefined): Locale {
  return locales.includes(value as Locale) ? (value as Locale) : defaultLocale;
}

/** `<html lang>` / `document.documentElement.lang` value per locale. */
const HTML_LANGS: Record<Locale, string> = {
  zh: "zh-CN",
  en: "en",
};

export function htmlLang(locale: Locale): string {
  return HTML_LANGS[locale];
}

/** A label available in both supported languages. */
export interface LocalizedText {
  zh: string;
  en: string;
}

/** Picks the text matching the active locale. */
export function pickLocalized(text: LocalizedText, locale: Locale): string {
  if (locale === "zh") return text.zh;
  return text.en;
}

/** Backend `lang` request header: 1 = Simplified, 3 = English. Traditional (2) was retired. */
const API_LANGS: Record<Locale, string> = {
  zh: "1",
  en: "3",
};

/**
 * The `lang` header for outbound API calls, read from the same cookie the UI
 * writes so non-React modules stay in sync. Outside the browser (SSR) the
 * default locale applies.
 */
export function apiLangHeader(): string {
  if (typeof document === "undefined") return API_LANGS[defaultLocale];
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`));
  return API_LANGS[resolveLocale(match ? decodeURIComponent(match[1]) : undefined)];
}
