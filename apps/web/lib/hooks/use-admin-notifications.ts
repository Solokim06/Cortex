"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { API_BASE } from "@/lib/cortex";

// =====================================================================
// types
// =====================================================================

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export type AdminNotification = {
  id: string;
  event_kind: string;
  priority: NotificationPriority;
  title: string;
  body: string;
  recipients: string[];
  recipients_mode: "admins" | "assignee" | "explicit";
  ticket_id: string | null;
  ticket_subject: string | null;
  click_url: string | null;
  extra: Record<string, unknown>;
  at: string;
};

type ConnectionState = "idle" | "connecting" | "open" | "error" | "closed";

export type UseAdminNotificationsResult = {
  /** Recent notifications (newest first). Capped at 20. */
  notifications: AdminNotification[];
  /** Unread count — everything after the last markAllRead. */
  unreadCount: number;
  /** SSE connection state. */
  state: ConnectionState;
  /** Manually remove a notification (after clicking it, e.g.) */
  dismiss: (id: string) => void;
  /** Clear all notifications */
  clearAll: () => void;
  /** Mark all as read without clearing */
  markAllRead: () => void;
};

// Cross-tab dedupe channel — only one tab shows a toast per notification
const BROADCAST_CHANNEL = "cortex:admin:notifications:seen";
const MAX_NOTIFICATIONS = 20;

// =====================================================================
// hook
// =====================================================================

/**
 * Subscribe to /admin/notifications/stream.
 *
 * Pushes notifications into a local buffer (capped at 20). Consumers
 * render the toast stack + bell badge from `notifications` and
 * `unreadCount`.
 *
 * Uses BroadcastChannel to dedupe across tabs: when a notification
 * arrives, the first tab to see it broadcasts its id. Other tabs
 * receive the broadcast and skip showing a toast for the same one
 * (they still add it to the bell list).
 */
export function useAdminNotifications(
  enabled: boolean,
  onNewNotification?: (n: AdminNotification) => void,
): UseAdminNotificationsResult {
  const { getToken, isSignedIn } = useAuth();

  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [state, setState] = useState<ConnectionState>("idle");
  const [unreadCount, setUnreadCount] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onNewRef = useRef(onNewNotification);
  const bcRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    onNewRef.current = onNewNotification;
  }, [onNewNotification]);

  // Cross-tab dedupe channel
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("BroadcastChannel" in window)) return;

    const bc = new BroadcastChannel(BROADCAST_CHANNEL);
    bcRef.current = bc;

    bc.onmessage = (ev) => {
      // Another tab already showed this one — mark as seen so we skip
      // the toast (we'll still add it to the bell in the handler below)
      const seenId = (ev.data as { id?: string })?.id;
      if (seenId) {
        _seenIds.add(seenId);
      }
    };

    return () => {
      bc.close();
      bcRef.current = null;
    };
  }, []);

  // Cleanup on unmount
  const resetConnection = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  // Main SSE loop
  useEffect(() => {
    if (!enabled || !isSignedIn) {
      return;
    }

    let stopped = false;
    const controller = new AbortController();
    abortRef.current = controller;

    const connect = async (attempt: number) => {
      if (stopped) return;
      setState("connecting");

      try {
        const token = await getToken();
        if (!token) {
          setState("error");
          return;
        }

        const resp = await fetch(`${API_BASE}/admin/notifications/stream`, {
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
          // Reconnect after a short pause
          reconnectTimerRef.current = setTimeout(
            () => void connect(1),
            2000,
          );
        }
      } catch (err: unknown) {
        if (stopped) return;
        const aborted = (err as { name?: string })?.name === "AbortError";
        if (aborted) return;

        setState("error");
        const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
        reconnectTimerRef.current = setTimeout(
          () => void connect(attempt + 1),
          delay,
        );
      }
    };

    const handleFrame = (raw: string) => {
      if (raw.startsWith(":")) return; // keep-alive ping

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
      const notif = payload.notification as AdminNotification | undefined;
      if (!notif || !notif.id) return;

      // Dedupe: already seen in this tab
      if (_seenIds.has(notif.id)) return;
      _seenIds.add(notif.id);

      // Broadcast to other tabs so they don't toast it
      bcRef.current?.postMessage({ id: notif.id });

      // Add to buffer + unread
      setNotifications((prev) => {
        if (prev.some((n) => n.id === notif.id)) return prev;
        const next = [notif, ...prev];
        return next.slice(0, MAX_NOTIFICATIONS);
      });
      setUnreadCount((c) => Math.min(c + 1, MAX_NOTIFICATIONS));

      // Fire the toast callback
      onNewRef.current?.(notif);
    };

    void connect(1);

    return () => {
      stopped = true;
      resetConnection();
      setState("idle");
    };
  }, [enabled, isSignedIn, getToken, resetConnection]);

  // Actions
  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  const markAllRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  return {
    notifications,
    unreadCount,
    state,
    dismiss,
    clearAll,
    markAllRead,
  };
}

// Process-wide set of seen ids (survives component remounts within a tab)
const _seenIds = new Set<string>();
