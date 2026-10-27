/**
 * Consent state — storage and helpers.
 *
 * Categories reflect what Cortex actually does with user data, not the
 * generic GDPR four:
 *
 *   essential        — session, CSRF, locale, active UI state (locked ON)
 *   personalization  — long-term memory, user model, cross-conversation
 *                      recall, rolling summaries
 *   performance      — local caches, embedding precomputation, prefetch
 *   aiProcessing     — sending captured content to Groq / Gemini for
 *                      concept extraction, classification, vision, embeddings
 *   marketing        — reserved for future email digests / product updates
 *
 * Dual storage: cookie (for SSR + backend visibility) AND localStorage
 * (for resilience if cookies are cleared by the browser or an extension).
 * The two are kept in sync by the ConsentProvider.
 */

export type ConsentCategory =
  | "essential"
  | "personalization"
  | "performance"
  | "aiProcessing"
  | "marketing";

export type ConsentMethod =
  | "default"
  | "accept-all"
  | "deny-all"
  | "save-settings"
  | "analytics-only";

export type ConsentState = {
  version: 1;
  essential: true;
  personalization: boolean;
  performance: boolean;
  aiProcessing: boolean;
  marketing: boolean;
  updatedAt: string;         // ISO
  method: ConsentMethod;
};

export const CONSENT_VERSION = 1;
export const CONSENT_STORAGE_KEY = "cortex_consent";
export const CONSENT_COOKIE_NAME = "cortex_consent";
export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * Default consent for a brand-new user. Non-essential categories are
 * OFF until the user explicitly opts in — the GDPR-safe default.
 *
 * On the backend, missing consent records default to ON (legitimate
 * interest for existing users). This asymmetry is intentional.
 */
export function defaultConsent(): ConsentState {
  return {
    version: CONSENT_VERSION,
    essential: true,
    personalization: false,
    performance: false,
    aiProcessing: false,
    marketing: false,
    updatedAt: new Date().toISOString(),
    method: "default",
  };
}

/**
 * Full opt-in. What "Accept all" writes.
 */
export function acceptAllConsent(): ConsentState {
  return {
    version: CONSENT_VERSION,
    essential: true,
    personalization: true,
    performance: true,
    aiProcessing: true,
    marketing: false, // always off until we actually add marketing
    updatedAt: new Date().toISOString(),
    method: "accept-all",
  };
}

/**
 * Analytics-only — perf + personalization ON, AI OFF. For users who
 * want Cortex to remember them locally but don't want their content
 * sent to LLM providers.
 */
export function analyticsOnlyConsent(): ConsentState {
  return {
    version: CONSENT_VERSION,
    essential: true,
    personalization: true,
    performance: true,
    aiProcessing: false,
    marketing: false,
    updatedAt: new Date().toISOString(),
    method: "analytics-only",
  };
}

// ---------------------------------------------------------------------------
// Read / write — localStorage
// ---------------------------------------------------------------------------

export function readFromLocalStorage(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    return normalize(parsed);
  } catch {
    return null;
  }
}

export function writeToLocalStorage(state: ConsentState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage can throw in private modes / full quotas — ignore
  }
}

// ---------------------------------------------------------------------------
// Read / write — cookie (SSR + backend visibility)
// ---------------------------------------------------------------------------

export function readFromCookie(): ConsentState | null {
  if (typeof document === "undefined") return null;
  const name = CONSENT_COOKIE_NAME + "=";
  const cookies = document.cookie.split(";").map((c) => c.trim());
  for (const c of cookies) {
    if (c.startsWith(name)) {
      try {
        const value = decodeURIComponent(c.slice(name.length));
        const parsed = JSON.parse(value) as Partial<ConsentState>;
        return normalize(parsed);
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function writeToCookie(state: ConsentState): void {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(JSON.stringify(state));
  const parts = [
    `${CONSENT_COOKIE_NAME}=${value}`,
    `Max-Age=${CONSENT_COOKIE_MAX_AGE}`,
    "Path=/",
    "SameSite=Lax",
  ];
  if (window.location.protocol === "https:") parts.push("Secure");
  document.cookie = parts.join("; ");
}

export function clearCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie =
    `${CONSENT_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
}

// ---------------------------------------------------------------------------
// Combined read — prefer cookie, fall back to localStorage, then default
// ---------------------------------------------------------------------------

export function readConsent(): ConsentState | null {
  const fromCookie = readFromCookie();
  const fromLS = readFromLocalStorage();

  // Prefer the more recently updated record
  if (fromCookie && fromLS) {
    return new Date(fromCookie.updatedAt) >= new Date(fromLS.updatedAt)
      ? fromCookie
      : fromLS;
  }
  return fromCookie ?? fromLS ?? null;
}

export function writeConsent(state: ConsentState): void {
  writeToLocalStorage(state);
  writeToCookie(state);
}

// ---------------------------------------------------------------------------
// Normalize — defensive against partial / stale records from older versions
// ---------------------------------------------------------------------------

function normalize(raw: Partial<ConsentState>): ConsentState | null {
  // Version mismatch: discard. In a real system we'd run migrations; here
  // we just reset. The banner will re-prompt if the record is rejected.
  if (raw.version !== CONSENT_VERSION) return null;

  return {
    version: CONSENT_VERSION,
    essential: true, // always
    personalization: !!raw.personalization,
    performance: !!raw.performance,
    aiProcessing: !!raw.aiProcessing,
    marketing: !!raw.marketing,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    method: (raw.method as ConsentMethod) ?? "default",
  };
}

// ---------------------------------------------------------------------------
// Category metadata — used by the modal + policy page to render cards
// ---------------------------------------------------------------------------

export type CategoryMeta = {
  key: ConsentCategory;
  locked: boolean;
  /** i18n key under `consent.categories.<key>` */
  i18nKey: string;
};

export const CATEGORIES: CategoryMeta[] = [
  { key: "essential", locked: true, i18nKey: "essential" },
  { key: "personalization", locked: false, i18nKey: "personalization" },
  { key: "performance", locked: false, i18nKey: "performance" },
  { key: "aiProcessing", locked: false, i18nKey: "aiProcessing" },
  { key: "marketing", locked: false, i18nKey: "marketing" },
];
