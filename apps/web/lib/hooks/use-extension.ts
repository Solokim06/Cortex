"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cortexFetch } from "@/lib/cortex";

// ---------- Types ----------

export type ExtensionMe = {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
};

export type ConnectTicket = {
  ticket: string;
  expires_in_seconds: number;
  user_id: string;
};

// ---------- Queries ----------

export function useExtensionMe() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["extension-me"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<ExtensionMe>("/extension/me", () =>
        Promise.resolve(token),
      );
    },
  });
}

// ---------- Mutations ----------

export function useGenerateConnectTicket() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (label?: string) => {
      const token = await getToken();
      return cortexFetch<ConnectTicket>(
        "/extension/connect-token",
        () => Promise.resolve(token),
        {
          method: "POST",
          body: { label: label ?? null },
        },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["extension-me"] });
    },
  });
}

// ---------- Countdown hook ----------

/**
 * Client-side countdown from an absolute deadline.
 *
 * All the math happens inside `setInterval` callbacks — no `Date.now()`
 * during render, no synchronous `setState` in the effect body.
 */
export function useCountdown(deadlineMs: number | null) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (deadlineMs === null) {
      // Reset to null on a *later* tick (async) so the effect body itself
      // contains no synchronous setState.
      const t = setTimeout(() => setSecondsLeft(null), 0);
      return () => clearTimeout(t);
    }

    const compute = () =>
      Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000));

    // Set the initial value on a deferred tick
    const boot = setTimeout(() => setSecondsLeft(compute()), 0);

    const id = setInterval(() => {
      const next = compute();
      setSecondsLeft(next);
      if (next <= 0) clearInterval(id);
    }, 1000);

    return () => {
      clearTimeout(boot);
      clearInterval(id);
    };
  }, [deadlineMs]);

  const expired = secondsLeft !== null && secondsLeft <= 0;
  return { secondsLeft, expired };
}

// ---------- Helpers ----------

export function formatCountdown(seconds: number | null): string {
  if (seconds === null) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
