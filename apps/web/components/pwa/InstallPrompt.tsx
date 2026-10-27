"use client";

import { useSyncExternalStore } from "react";
import { Download, Share, X } from "lucide-react";

/**
 * PWA install prompt.
 *
 * - Android / Chrome / Edge: listens for `beforeinstallprompt`, shows a
 *   custom banner, calls `.prompt()` on click.
 * - iOS Safari: no beforeinstallprompt support, so we detect iOS + not
 *   already-installed and show the "Share → Add to Home Screen" hint.
 * - Dismissal is remembered for 30 days in localStorage.
 *
 * Position: bottom-center on mobile, bottom-left on desktop.
 * (Desktop bottom-right is reserved for Sonner toasts.)
 *
 * Implementation note: this uses `useSyncExternalStore` because the
 * browser APIs involved (`beforeinstallprompt`, localStorage, matchMedia)
 * are external systems. Using useEffect + setState for these trips
 * `react-hooks/set-state-in-effect` and causes cascading renders.
 */

const DISMISS_KEY = "cortex_install_prompt_dismissed_at";
const DISMISS_DAYS = 30;

type Mode = "hidden" | "android" | "ios";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/* ----------------------------- helpers ----------------------------- */

function isDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function rememberDismissal(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* private mode / quota — fail silently */
  }
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  type IOSNavigator = Navigator & { standalone?: boolean };
  return Boolean((window.navigator as IOSNavigator).standalone);
}

function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as Macintosh
    (ua.includes("Macintosh") && "ontouchend" in window)
  );
}

/* ------------------------- external store -------------------------- */
/* Module-level singleton. Safe because there's only one InstallPrompt
   in the tree; if more ever mount, they share state — which is what
   we'd want anyway.                                                     */

let currentMode: Mode = "hidden";
let currentEvent: BeforeInstallPromptEvent | null = null;
let initialized = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function setMode(next: Mode): void {
  if (next === currentMode) return;
  currentMode = next;
  emit();
}

function setEvent(next: BeforeInstallPromptEvent | null): void {
  currentEvent = next;
}

function initialize(): void {
  if (initialized) return;
  initialized = true;
  if (typeof window === "undefined") return;
  if (isStandalone() || isDismissed()) return;
  if (isIOS()) {
    currentMode = "ios";
    // No emit yet — we're called from within subscribe(), and the
    // subscription is about to trigger the first getSnapshot() read.
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  initialize();

  const onBeforeInstall = (e: Event) => {
    // Check dismissal BEFORE preventing default. If we call preventDefault()
    // but never call prompt(), Chrome logs a console warning about the
    // banner not being shown.
    if (isDismissed()) return;
    e.preventDefault();
    setEvent(e as BeforeInstallPromptEvent);
    setMode("android");
  };

  const onInstalled = () => {
    setEvent(null);
    rememberDismissal();
    setMode("hidden");
  };

  window.addEventListener("beforeinstallprompt", onBeforeInstall);
  window.addEventListener("appinstalled", onInstalled);

  // If we set currentMode above during initialize(), notify now that
  // the listener is registered.
  if (currentMode !== "hidden") emit();

  return () => {
    listeners.delete(cb);
    window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

function getSnapshot(): Mode {
  return currentMode;
}

function getServerSnapshot(): Mode {
  return "hidden";
}

/* ---------------------------- component ---------------------------- */

export function InstallPrompt() {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const handleInstall = async () => {
    if (!currentEvent) return;
    await currentEvent.prompt();
    const choice = await currentEvent.userChoice;
    if (choice.outcome === "accepted") {
      setEvent(null);
      setMode("hidden");
    } else {
      rememberDismissal();
      setMode("hidden");
    }
  };

  const handleDismiss = () => {
    rememberDismissal();
    setMode("hidden");
  };

  if (mode === "hidden") return null;

  return (
    <div
      role="dialog"
      aria-label="Install Cortex"
      className={[
        "fixed z-40",
        "bottom-[max(1rem,env(safe-area-inset-bottom))]",
        "left-1/2 -translate-x-1/2",
        "md:left-[max(1rem,env(safe-area-inset-left))] md:translate-x-0",
        "w-[min(24rem,calc(100vw-2rem))]",
        "rounded-xl border border-border bg-card/95 backdrop-blur-sm",
        "shadow-2xl shadow-black/40",
        "px-4 py-3",
        "flex items-start gap-3",
        "animate-in slide-in-from-bottom-2 fade-in",
      ].join(" ")}
    >
      <div className="mt-0.5 shrink-0 rounded-md bg-primary/10 p-2">
        {mode === "android" ? (
          <Download className="h-4 w-4 text-primary" />
        ) : (
          <Share className="h-4 w-4 text-primary" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">Install Cortex</p>
        {mode === "android" ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Add Cortex to your home screen for a faster, full-screen
            experience.
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tap <Share className="inline h-3 w-3 -mt-0.5" /> Share, then{" "}
            <span className="font-medium text-foreground/80">
              Add to Home Screen
            </span>
            .
          </p>
        )}

        {mode === "android" && (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleInstall}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Install
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Not now
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="shrink-0 -mt-1 -mr-1 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
