/**
 * Extension i18n.
 *
 * We route through the webextension-polyfill (`browser.*`) --- it works in
 * Firefox natively, and in Chrome/Edge/Safari it proxies to chrome.i18n
 * under the hood. So a single `browser.i18n.getMessage` call covers every
 * browser we support.
 *
 * In a plain Vite dev preview (opened as a web page, not as an extension),
 * the polyfill's i18n API is unavailable --- we catch that and fall back to
 * the key, so dev previews show readable placeholder text.
 *
 * Locale selection: the browser decides. Chrome/Firefox pick the locale
 * from `_locales/<lang>/messages.json` based on the browser's UI language
 * --- not the Cortex app's NEXT_LOCALE cookie.
 *
 * Usage:
 *   import { t } from "../lib/i18n";
 *   <button>{t("btnSave")}</button>
 *   <input placeholder={t("placeholderQuickCapture")} />
 */

import { browser } from "./runtime";

type Substitutions = string | string[];

export function t(key: string, substitutions?: Substitutions, fallback?: string): string {
  try {
    const api = (browser as { i18n?: { getMessage?: (k: string, s?: Substitutions) => string } }).i18n;
    if (api?.getMessage) {
      const msg = api.getMessage(key, substitutions);
      if (msg) return msg;
    }
  } catch {
    // Polyfill unavailable (dev preview) or getMessage threw --- fall through.
  }
  return fallback ?? key;
}
