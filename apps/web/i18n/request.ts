import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isRtl, locales, type Locale } from "./config";

/**
 * Deep-merge `override` on top of `base`, returning a new object.
 * Arrays and primitives in `override` replace the base value entirely.
 * Only plain objects get recursively merged.
 */
function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined || override === null) return base;
  if (
    typeof base !== "object" ||
    base === null ||
    Array.isArray(base) ||
    typeof override !== "object" ||
    override === null ||
    Array.isArray(override)
  ) {
    return override as T;
  }

  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    out[key] = deepMerge(
      (base as Record<string, unknown>)[key],
      value,
    );
  }
  return out as T;
}

export default getRequestConfig(async ({ requestLocale }) => {
  // `requestLocale` is the value from the [locale] segment (may be undefined).
  let locale = await requestLocale;

  // Fall back to default if missing or unsupported. Do NOT call
  // notFound() here — the [locale]/layout.tsx handles that.
  if (!locale || !locales.includes(locale as Locale)) {
    locale = defaultLocale;
  }

  // Always load English first — it's the source of truth for keys.
  const enMessages = (await import(`../messages/${defaultLocale}.json`)).default;

  let messages = enMessages;

  if (locale !== defaultLocale) {
    try {
      const localeMessages = (await import(`../messages/${locale}.json`))
        .default;
      // Deep-merge the locale on top of English so missing keys
      // automatically fall back to English instead of throwing.
      messages = deepMerge(enMessages, localeMessages);
    } catch {
      // Locale file missing entirely — stick with English.
      messages = enMessages;
    }
  }

  return {
    locale,
    messages,
    timeZone: "UTC",
    now: new Date(),
    onError: () => {},
    getMessageFallback: ({ key }) => key,
  };
});

/** Helper used by the root layout to set <html dir>. */
export function directionFor(locale: string): "ltr" | "rtl" {
  return isRtl(locale) ? "rtl" : "ltr";
}
