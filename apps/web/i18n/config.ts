/**
 * i18n configuration.
 *
 * - `locales`: every language we expose in the picker.
 * - `defaultLocale`: the locale that gets NO url prefix (clean urls for
 *   English: /home, /chat instead of /en/home).
 * - `rtlLocales`: locales that render right-to-left.
 */

export const locales = [
  "en",
  "es",
  "fr",
  "de",
  "ar",
  "sw",
] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Locales that render right-to-left. */
export const rtlLocales: Locale[] = ["ar"];

export function isRtl(locale: string): boolean {
  return rtlLocales.includes(locale as Locale);
}

/** Locale display names — used in the language picker. */
export const localeNames: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  ar: "العربية",
  sw: "Kiswahili",
};

/**
 * Language names in every locale — for the picker. So a Spanish user
 * sees "English" as "Inglés", etc.
 *
 * Kept as a nested map so we can extend it later without touching
 * component code.
 */
export const localeNamesLocalized: Record<Locale, Record<Locale, string>> = {
  en: {
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    ar: "Arabic",
    sw: "Swahili",
  },
  es: {
    en: "Inglés",
    es: "Español",
    fr: "Francés",
    de: "Alemán",
    ar: "Árabe",
    sw: "Suajili",
  },
  fr: {
    en: "Anglais",
    es: "Espagnol",
    fr: "Français",
    de: "Allemand",
    ar: "Arabe",
    sw: "Swahili",
  },
  de: {
    en: "Englisch",
    es: "Spanisch",
    fr: "Französisch",
    de: "Deutsch",
    ar: "Arabisch",
    sw: "Suaheli",
  },
  ar: {
    en: "الإنجليزية",
    es: "الإسبانية",
    fr: "الفرنسية",
    de: "الألمانية",
    ar: "العربية",
    sw: "السواحيلية",
  },
  sw: {
    en: "Kiingereza",
    es: "Kihispania",
    fr: "Kifaransa",
    de: "Kijerumani",
    ar: "Kiarabu",
    sw: "Kiswahili",
  },
};

/**
 * Languages we haven't translated yet. Shown in the picker with a
 * "coming soon" hint; selecting them falls back to English strings.
 */
export const partiallyTranslatedLocales: Locale[] = [];
