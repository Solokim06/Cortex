"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

/**
 * Offline indicator.
 *
 * A fixed top-center banner shown only when navigator.onLine is false.
 * Uses useSyncExternalStore (same pattern as InstallPrompt) to avoid
 * setState-in-effect and cascading renders.
 *
 * Positioning: top-center. Bottom corners are taken (InstallPrompt
 * bottom-left/bottom-center, Sonner toasts bottom-right, ConsentBanner
 * bottom-full). z-index 55: above topbar (z-30), below dialogs (z-50).
 */

let currentOnline = true;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);

  if (typeof window === "undefined") {
    return () => {
      listeners.delete(cb);
    };
  }

  // Sync initial value the first time we subscribe (client).
  currentOnline = navigator.onLine;

  const onOnline = () => {
    currentOnline = true;
    emit();
  };
  const onOffline = () => {
    currentOnline = false;
    emit();
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  return () => {
    listeners.delete(cb);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}

function getSnapshot(): boolean {
  return currentOnline;
}

function getServerSnapshot(): boolean {
  return true;
}

export function OfflineIndicator() {
  const isOnline = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ top: "var(--safe-top)" }}
      className={[
        "fixed inset-x-0 z-[55]",
        "flex items-center justify-center gap-2",
        "bg-amber-500/10 border-b border-amber-500/30",
        "px-4 py-2 text-xs text-amber-500",
        "backdrop-blur-sm",
      ].join(" ")}
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>You&apos;re offline — some features may be unavailable.</span>
    </div>
  );
}
