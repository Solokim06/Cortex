/**
 * Locale-aware navigation primitives.
 *
 * Use these instead of next/link and next/navigation inside the app.
 * They automatically add the /<locale> prefix when needed (non-default
 * locales) and leave clean URLs when the locale is the default (English).
 */

import { createNavigation } from "next-intl/navigation";
import { defaultLocale, locales } from "./config";

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation({
    locales,
    defaultLocale,
    localePrefix: "as-needed",
  });
