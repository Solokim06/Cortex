"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ConsentModal } from "./ConsentModal";
import {
  type ConsentState,
  acceptAllConsent,
  analyticsOnlyConsent,
  defaultConsent,
  readConsent,
  writeConsent,
  clearCookie,
} from "@/lib/consent";

type ConsentContextValue = {
  /** True when the preferences modal should be visible. */
  modalOpen: boolean;
  /** Open the preferences modal from anywhere in the app. */
  openPreferences: () => void;
  /** Close the preferences modal. */
  closePreferences: () => void;
  /** Reject all non-essential categories. GDPR-compliant "Deny". */
  denyAll: () => void;
  /** Current consent state. Null = no decision made yet (show banner). */
  consent: ConsentState | null;
  /** True until the initial read from storage completes (avoid hydration flash). */
  loading: boolean;
  /** True when the user has made a choice. */
  hasDecided: boolean;

  // Category accessors — convenience for the gate pattern
  canPersonalize: boolean;
  canUsePerformance: boolean;
  canUseAiProcessing: boolean;
  canUseMarketing: boolean;

  // Actions
  acceptAll: () => void;
  analyticsOnly: () => void;
  saveSettings: (partial: Partial<ConsentState>) => void;
  reset: () => void;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // ---- Initial read from storage ----
  //
  // Reading consent from storage on mount is the standard pattern, but the
  // `react-hooks/set-state-in-effect` rule flags it because it triggers an
  // extra render. We accept that here:
  //
  // 1. This runs exactly once (empty deps).
  // 2. `readConsent()` is synchronous and non-throwing (see lib/consent.ts).
  // 3. The alternative — a lazy `useState` initializer — would cause an SSR
  //    hydration mismatch (server: null, client: stored value).
  // 4. A `useSyncExternalStore` refactor would touch 20+ consumers of
  //    `useConsent()` for a one-render saving at boot.
  //
  // In short: the rule catches the pattern, but the cost of fixing it is
  // disproportionate to the benefit.
  //
  useEffect(() => {
    const stored = readConsent();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConsent(stored);
    setLoading(false);
  }, []);

  // ---- Sync across tabs (best-effort, using storage events) ----
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "cortex_consent") {
        const next = readConsent();
        if (next) setConsent(next);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // ---- Actions ----
  const persist = useCallback((next: ConsentState) => {
    writeConsent(next);
    setConsent(next);
  }, []);

  const acceptAll = useCallback(() => {
    persist(acceptAllConsent());
  }, [persist]);

  const denyAll = useCallback(() => {
    // "Deny" = keep only essential; turn off every optional category.
    const current = consent ?? defaultConsent();
    persist({
      ...current,
      essential: true,
      personalization: false,
      performance: false,
      aiProcessing: false,
      marketing: false,
      updatedAt: new Date().toISOString(),
      method: "deny-all",
    });
  }, [consent, persist]);

  const analyticsOnly = useCallback(() => {
    persist(analyticsOnlyConsent());
  }, [persist]);

  const saveSettings = useCallback(
    (partial: Partial<ConsentState>) => {
      const base = consent ?? defaultConsent();
      const next: ConsentState = {
        ...base,
        ...partial,
        essential: true, // never let a caller unset this
        version: 1,
        updatedAt: new Date().toISOString(),
        method: "save-settings",
      };
      persist(next);
    },
    [consent, persist],
  );

  const reset = useCallback(() => {
    clearCookie();
    try {
      window.localStorage.removeItem("cortex_consent");
    } catch {
      // ignore
    }
    setConsent(null);
  }, []);

  const openPreferences = useCallback(() => setModalOpen(true), []);
  const closePreferences = useCallback(() => setModalOpen(false), []);

  // ---- Derived ----
  const value = useMemo<ConsentContextValue>(
    () => ({
      consent,
      loading,
      hasDecided: consent !== null,
      canPersonalize: consent?.personalization === true,
      canUsePerformance: consent?.performance === true,
      canUseAiProcessing: consent?.aiProcessing === true,
      canUseMarketing: consent?.marketing === true,
      acceptAll,
      denyAll,
      analyticsOnly,
      saveSettings,
      reset,
      modalOpen,
      openPreferences,
      closePreferences,
    }),
    [consent, loading, acceptAll, denyAll, analyticsOnly, saveSettings, reset, modalOpen, openPreferences, closePreferences],
  );

  return (
    <ConsentContext.Provider value={value}>
      {children}
      <ConsentModal
        open={modalOpen}
        onOpenChange={(open) => (open ? openPreferences() : closePreferences())}
      />
    </ConsentContext.Provider>
  );
}

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) {
    throw new Error("useConsent must be used within a ConsentProvider");
  }
  return ctx;
}

/**
 * Read the current consent state synchronously from a cookie (SSR / RSC context).
 * Returns null if no decision has been made.
 *
 * Use this in server components or middleware. Client components should use
 * useConsent() instead.
 */
export function readConsentFromCookieHeader(
  cookieHeader: string | null,
): ConsentState | null {
  if (!cookieHeader) return null;
  const name = "cortex_consent=";
  for (const c of cookieHeader.split(";").map((s) => s.trim())) {
    if (c.startsWith(name)) {
      try {
        const parsed = JSON.parse(decodeURIComponent(c.slice(name.length)));
        if (parsed?.version !== 1) return null;
        return parsed as ConsentState;
      } catch {
        return null;
      }
    }
  }
  return null;
}
