import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "es", "fr", "de", "ar"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});
