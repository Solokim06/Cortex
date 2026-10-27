"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import {
  SettingsDialogContext,
  useSettingsDialog,
} from "@/lib/hooks/use-settings-dialog";
import { ConsentProvider } from "@/components/consent/ConsentContext";
import { ConsentBanner } from "@/components/consent/ConsentBanner";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  // Register the service worker (production only — dev mode HMR + SW
  // caching do not mix well; SW would serve stale assets after edits).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // Silent fallback: no SW is a valid app state (everything still works,
      // just without offline support).
      console.warn("SW registration failed:", err);
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ConsentProvider>
        <SettingsDialogContext>
          {children}
          <GlobalSettingsDialog />
          <ConsentBanner />
          <InstallPrompt />
          <OfflineIndicator />
        </SettingsDialogContext>
      </ConsentProvider>
    </QueryClientProvider>
  );
}

function GlobalSettingsDialog() {
  const { open, setOpen } = useSettingsDialog();
  return <SettingsDialog open={open} onOpenChange={setOpen} />;
}
