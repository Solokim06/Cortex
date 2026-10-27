"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { API_BASE } from "@/lib/cortex";

// =====================================================================
// types
// =====================================================================

export type AdminStreamEvent = {
  kind: string;
  at: string;
  ticket_id?: string;
  data?: Record<string, unknown>;
};

type StreamState = "idle" | "connecting" | "open" | "error" | "closed";

export type UseAdminStreamResult = {
  lastEvent: AdminStreamEvent | null;
  state: StreamState;
  lastMessageAt: number | null;
};

// =====================================================================
// hook
// =====================================================================

/**
 * Subscribe to /admin/stream via fetch + ReadableStream.
 *
 * Why not EventSource? EventSource cannot send an Authorization header.
 * Our backend requires one. So we parse SSE frames manually.
 *
 * Reconnection: exponential backoff (1s → 2s → … → 30s cap).
 * Cleanup: aborts fetch + clears reconnect timer on unmount.
 */
export function useAdminStream(
  enabled: boolean = true,
  onEvent?: (event: AdminStreamEvent) => void,
): UseAdminStreamResult {
  const { getToken, isSignedIn } = useAuth();

  const [lastEvent, setLastEvent] = useState<AdminStreamEvent | null>(null);
  const [state, setState] = useState<StreamState>("idle");
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);

  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    // Subscribe: do nothing if disabled. State stays at its previous
    // value — we don't call setState synchronously here.
    if (!enabled || !isSignedIn) {
      return;
    }

    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();

    const scheduleReconnect = (delayMs: number, reconnect: () => void) => {
      if (stopped) return;
      reconnectTimer = setTimeout(reconnect, delayMs);
    };

    const handleFrame = (raw: string) => {
      if (raw.startsWith(":")) {
        // SSE comment / keep-alive ping
        setLastMessageAt(Date.now());
        return;
      }

      const dataLines: string[] = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
      if (dataLines.length === 0) return;

      try {
        const parsed = JSON.parse(dataLines.join("\n")) as AdminStreamEvent;
        setLastEvent(parsed);
        setLastMessageAt(Date.now());
        onEventRef.current?.(parsed);
      } catch {
        // Malformed JSON — ignore
      }
    };

    const connect = async (attempt: number) => {
      if (stopped) return;

      setState("connecting");

      try {
        const token = await getToken();
        if (!token) {
          setState("error");
          return;
        }

        const resp = await fetch(`${API_BASE}/admin/stream`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
          },
          signal: controller.signal,
        });

        if (!resp.ok || !resp.body) {
          throw new Error(`SSE connect failed: HTTP ${resp.status}`);
        }

        setState("open");

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let sepIdx: number;
          while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);
            handleFrame(frame);
          }
        }

        // Normal close — try to reconnect after a short pause
        if (!stopped) {
          setState("closed");
          scheduleReconnect(2000, () => void connect(1));
        }
      } catch (err: unknown) {
        if (stopped) return;
        const aborted = (err as { name?: string })?.name === "AbortError";
        if (aborted) return;

        setState("error");

        const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
        scheduleReconnect(delay, () => void connect(attempt + 1));
      }
    };

    void connect(1);

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      controller.abort();
      // NOTE: we do NOT call setState in cleanup. The component is
      // unmounting or deps changed; leaving state as-is is correct.
    };
  }, [enabled, isSignedIn, getToken]);

  return { lastEvent, state, lastMessageAt };
}
