"use client";

import { useConsent } from "@/components/consent/ConsentContext";

/**
 * Small client wrapper for the "Cookie preferences" footer link.
 *
 * The footer lives in a server component (`app/[locale]/(public)/layout.tsx`),
 * so it can't call `useConsent()` directly. This tiny component mounts on the
 * client and gives the footer a compliant way to reopen the consent modal
 * from any page — including for anonymous visitors.
 */
export function OpenCookiePreferencesLink({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { openPreferences } = useConsent();
  return (
    <button
      type="button"
      onClick={openPreferences}
      className={
        className ??
        "text-muted-foreground hover:text-foreground transition-colors"
      }
    >
      {children}
    </button>
  );
}
