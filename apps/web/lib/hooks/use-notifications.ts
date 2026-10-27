"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { API_BASE } from "@/lib/cortex";

// =====================================================================
// types
// =====================================================================

export type UserNotification = {
  id: string;
  event_kind: string;
  title: string;
  body: string;
  ticket_id: string | null;
  ticket_subject: string | null;
  click_url: string | null;
  extra: Record<string, unknown>;
  /** ISO timestamp from the server. */
  created_at?: string;
  /** Alias used by SSE frames. */
  at?: string;
  read: boolean;
};

type ConnectionState = "idle" | "connecting" | "open" | "error" | "closed";

export type UseNotificationsResult = {
  notifications: UserNotification[];
  unreadCount: number;
  state: ConnectionState;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
};

const MAX_NOTIFICATIONS = 50;


// =====================================================================
// hook
// =====================================================================

export function useNotifications(
  enabled: boolean,
  onNewNotification?: (n: UserNotification) => void,
): UseNotificationsResult {
  const { getToken, isSignedIn } = useAuth();

  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [state, setState] = useState<ConnectionState>("idle");

  const abortRef = useRef<AbortController | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onNewRef = useRef(onNewNotification);
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    onNewRef.current = onNewNotification;
    getTokenRef.current = getToken;
  }, [onNewNotification, getToken]);

  const resetConnection = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  // ---- seed from server ----
  useEffect(() => {
    if (!enabled || !isSignedIn) return;
    let cancelled = false;

    (async () => {
      try {
        const token = await getTokenRef.current();
        if (!token) return;
        const resp = await fetch(`${API_BASE}/user/notifications?limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) return;
        const data = (await resp.json()) as {
          items: UserNotification[];
          unread_count: number;
        };
        if (cancelled) return;
        setNotifications(data.items.slice(0, MAX_NOTIFICATIONS));
      } catch {
        // ignore — SSE will still populate live
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, isSignedIn]);

  // ---- SSE loop ----
  useEffect(() => {
    if (!enabled || !isSignedIn) return;

    let stopped = false;
    const controller = new AbortController();
    abortRef.current = controller;

    const connect = async (attempt: number) => {
      if (stopped) return;
      setState("connecting");

      try {
        const token = await getTokenRef.current();
        if (!token) {
          setState("error");
          return;
        }

        const resp = await fetch(`${API_BASE}/help/notifications/stream`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
          },
          signal: controller.signal,
        });

        if (!resp.ok || !resp.body) {
          throw new Error(`HTTP ${resp.status}`);
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

        if (!stopped) {
          setState("closed");
          reconnectTimerRef.current = setTimeout(() => void connect(1), 2000);
        }
      } catch (err: unknown) {
        if (stopped) return;
        const aborted = (err as { name?: string })?.name === "AbortError";
        if (aborted) return;
        setState("error");
        const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
        reconnectTimerRef.current = setTimeout(() => void connect(attempt + 1), delay);
      }
    };

    const handleFrame = (raw: string) => {
      if (raw.startsWith(":")) return;

      const dataLines: string[] = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
      if (dataLines.length === 0) return;

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(dataLines.join("\n"));
      } catch {
        return;
      }

      if (payload.kind !== "notification") return;
      const notif = payload.notification as UserNotification | undefined;
      if (!notif || !notif.id) return;

      // Deduplicate with what's already in state.
      setNotifications((prev) => {
        if (prev.some((n) => n.id === notif.id)) return prev;
        const normalized: UserNotification = {
          ...notif,
          created_at: notif.created_at ?? notif.at ?? new Date().toISOString(),
          read: false,
        };
        return [normalized, ...prev].slice(0, MAX_NOTIFICATIONS);
      });
      onNewRef.current?.(notif);
    };

    void connect(1);

    return () => {
      stopped = true;
      resetConnection();
      setState("idle");
    };
  }, [enabled, isSignedIn, resetConnection]);

  // ---- derived unread ----
  const unreadCount = notifications.reduce(
    (acc, n) => acc + (n.read ? 0 : 1),
    0,
  );

  // ---- mutations ----

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    try {
      const token = await getTokenRef.current();
      if (!token) return;
      await fetch(`${API_BASE}/user/notifications/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // best-effort; state is already updated optimistically
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      const token = await getTokenRef.current();
      if (!token) return;
      await fetch(`${API_BASE}/user/notifications/read-all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // best-effort
    }
  }, []);

  const dismiss = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try {
      const token = await getTokenRef.current();
      if (!token) return;
      await fetch(`${API_BASE}/user/notifications/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // best-effort
    }
  }, []);

  const clearAll = useCallback(async () => {
    setNotifications([]);
    try {
      const token = await getTokenRef.current();
      if (!token) return;
      await fetch(`${API_BASE}/user/notifications`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // best-effort
    }
  }, []);

  return { notifications, unreadCount, state, markRead, markAllRead, dismiss, clearAll };
}
