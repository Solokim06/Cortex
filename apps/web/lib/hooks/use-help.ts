"use client";

import { useCallback, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE, getCurrentLocale } from "@/lib/cortex";

// =====================================================================
// types
// =====================================================================

export type CitedDoc = {
  id: string;
  title: string;
  category: string;
};

export type StreamFrame =
  | { type: "meta"; cited_docs: CitedDoc[]; suggested_docs: CitedDoc[] }
  | { type: "token"; text: string }
  | { type: "citations"; cited_docs: CitedDoc[] }
  | { type: "escalate"; reason: string }
  | { type: "error"; message: string }
  | { type: "done" };

type StreamHandlers = {
  onMeta?: (suggested: CitedDoc[]) => void;
  onToken?: (text: string) => void;
  onCitations?: (cited: CitedDoc[]) => void;
  onEscalate?: (reason: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
};

// =====================================================================
// streaming ask
// =====================================================================

export function useAskStream(opts?: { isPublic?: boolean }) {
  const { isPublic = false } = opts ?? {};
  const { getToken } = useAuth();
  const controllerRef = useRef<AbortController | null>(null);
  const [streaming, setStreaming] = useState(false);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStreaming(false);
  }, []);

  const start = useCallback(
    async (
      input: { question: string; route?: string },
      handlers: StreamHandlers = {},
    ) => {
      // Cancel any prior stream
      controllerRef.current?.abort();

      const controller = new AbortController();
      controllerRef.current = controller;
      setStreaming(true);

      try {
        // Public (anonymous) requests skip the Clerk token entirely.
        let token: string | null = null;
        if (!isPublic) {
          token = await getToken();
          if (!token) {
            handlers.onError?.("Not signed in");
            return;
          }
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "X-Locale": getCurrentLocale(),
        };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const resp = await fetch(
          `${API_BASE}${isPublic ? "/public/help/ask/stream" : "/help/ask/stream"}`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              question: input.question,
              route: input.route,
            }),
            signal: controller.signal,
          },
        );

        if (!resp.ok || !resp.body) {
          // Detect rate limit — surface as a specific marker the UI can parse
          if (resp.status === 429) {
            const retryAfter =
              resp.headers.get("Retry-After") ||
              resp.headers.get("retry-after") ||
              "60";
            handlers.onError?.(
              `RATE_LIMIT:retry_after=${retryAfter}`,
            );
            return;
          }
          handlers.onError?.(`HTTP ${resp.status}`);
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let sepIdx: number;
          while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);
            dispatchFrame(frame, handlers);
          }
        }

        if (buffer.trim()) {
          dispatchFrame(buffer, handlers);
        }
      } catch (err: unknown) {
        const aborted = (err as { name?: string })?.name === "AbortError";
        if (!aborted) {
          handlers.onError?.(
            err instanceof Error ? err.message : "Stream failed",
          );
        }
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setStreaming(false);
          handlers.onDone?.();
        }
      }
    },
    [getToken, isPublic],
  );

  return { start, stop, isStreaming: streaming };
}

function dispatchFrame(raw: string, handlers: StreamHandlers) {
  if (raw.startsWith(":")) return;

  const lines = raw.split("\n");
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return;

  let frame: StreamFrame;
  try {
    frame = JSON.parse(dataLines.join("\n")) as StreamFrame;
  } catch {
    return;
  }

  switch (frame.type) {
    case "meta":
      handlers.onMeta?.(frame.suggested_docs ?? []);
      break;
    case "token":
      handlers.onToken?.(frame.text ?? "");
      break;
    case "citations":
      handlers.onCitations?.(frame.cited_docs ?? []);
      break;
    case "escalate":
      handlers.onEscalate?.(frame.reason ?? "Needs a human");
      break;
    case "error":
      handlers.onError?.(frame.message ?? "Unknown error");
      break;
    case "done":
      break;
  }
}

// =====================================================================
// answer feedback (👍/👎)
// =====================================================================

export function useAskFeedback() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: {
      question: string;
      answer: string;
      rating: "up" | "down";
      reason?: string;
      cited_doc_ids?: string[];
    }) => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const resp = await fetch(`${API_BASE}/help/ask/feedback`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Locale": getCurrentLocale(),
        },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return (await resp.json()) as { ok: boolean };
    },
  });
}

// =====================================================================
// catalog queries
// =====================================================================

export function useHelpTopics(isPublic: boolean = false) {
  const { getToken, isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["help-topics", { isPublic }],
    enabled: isPublic || !!isSignedIn,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      // Public route: no token needed
      if (isPublic) {
        const resp = await fetch(`${API_BASE}/public/help/topics`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return (await resp.json()) as {
          slug: string;
          category: string;
          count: number;
        }[];
      }
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const resp = await fetch(`${API_BASE}/help/topics`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Locale": getCurrentLocale(),
        },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return (await resp.json()) as {
        slug: string;
        category: string;
        count: number;
      }[];
    },
  });
}

export function useDocsInCategory(
  category: string | null,
  isPublic: boolean = false,
) {
  const { getToken, isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["help-docs-in-category", category, { isPublic }],
    enabled: (isPublic || !!isSignedIn) && !!category,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (isPublic) {
        const resp = await fetch(
          `${API_BASE}/public/help/topics/${encodeURIComponent(category!)}`,
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return (await resp.json()) as {
          id: string;
          title: string;
          category: string;
        }[];
      }
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const resp = await fetch(
        `${API_BASE}/help/topics/${encodeURIComponent(category!)}`,
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Locale": getCurrentLocale(),
          },
        },
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return (await resp.json()) as {
        id: string;
        title: string;
        category: string;
      }[];
    },
  });
}

// =====================================================================
// user's own tickets
// =====================================================================

export type UserTicket = {
  id: string;
  category: "bug" | "feature" | "question" | "other";
  subject: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority?: "low" | "normal" | "high" | "urgent";
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export function useMyTickets() {
  const { getToken, isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["my-help-tickets"],
    enabled: !!isSignedIn,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const resp = await fetch(`${API_BASE}/help/feedback`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Locale": getCurrentLocale(),
        },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return (await resp.json()) as UserTicket[];
    },
  });
}

export function useTicketDetail(
  ticketId: string | null,
  opts?: { refetchInterval?: number | false },
) {
  const { getToken, isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["my-help-ticket", ticketId],
    enabled: !!isSignedIn && !!ticketId,
    staleTime: 10 * 1000,
    refetchInterval: opts?.refetchInterval ?? false,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const resp = await fetch(
        `${API_BASE}/help/feedback/${encodeURIComponent(ticketId!)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Locale": getCurrentLocale(),
          },
        },
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return (await resp.json()) as {
        id: string;
        category: string;
        subject: string;
        description: string;
        status: string;
        created_at: string;
        updated_at: string;
        resolved_at: string | null;
        attached_conversation?: {
          role: "user" | "assistant";
          content: string;
          created_at?: string;
        }[];
        replies: {
          id: string;
          author: string;
          content: string;
          created_at: string;
          edited_at: string | null;
        }[];
      };
    },
  });
}

export function useReplyToTicket(ticketId: string) {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (content: string) => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const resp = await fetch(
        `${API_BASE}/help/feedback/${encodeURIComponent(ticketId)}/reply`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-Locale": getCurrentLocale(),
          },
          body: JSON.stringify({ content }),
        },
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    },
  });
}


// =====================================================================
// filer notification preferences (end-user)
// =====================================================================

export type UserNotifPrefs = {
  user_id: string;
  email_on_ticket_reply: boolean;
  email_on_status_change: boolean;
  email_on_resolved: boolean;
  insights_enabled: boolean;
  insights_dormant_revival: boolean;
  insights_contradiction: boolean;
  insights_decision_drift: boolean;
  insights_rhythm: boolean;
  unsubscribe_token: string;
  updated_at: string | null;
};

export function useUserNotifPrefs() {
  const { getToken, isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["user-notif-prefs"],
    enabled: !!isSignedIn,
    staleTime: 60_000,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const resp = await fetch(`${API_BASE}/help/prefs`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Locale": getCurrentLocale(),
        },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return (await resp.json()) as UserNotifPrefs;
    },
  });
}

export function useUpdateUserNotifPrefs() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      patch: Partial<Omit<UserNotifPrefs, "user_id" | "unsubscribe_token" | "updated_at">>,
    ) => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const resp = await fetch(`${API_BASE}/help/prefs`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Locale": getCurrentLocale(),
        },
        body: JSON.stringify(patch),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return (await resp.json()) as UserNotifPrefs;
    },
    onSuccess: (data) => {
      qc.setQueryData(["user-notif-prefs"], data);
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ["user-notif-prefs"] });
    },
  });
}

/**
 * Public — no auth required. Used by the unsubscribe page.
 * The token is embedded in email footers.
 */
export async function unsubscribeWithToken(
  token: string,
): Promise<{ ok: boolean; email?: string; reason?: string }> {
  const resp = await fetch(
    `${API_BASE}/help/unsubscribe?token=${encodeURIComponent(token)}`,
  );
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return (await resp.json()) as {
    ok: boolean;
    email?: string;
    reason?: string;
  };
}

// =====================================================================
// EDIT REPLY — filer-only, 15-min window
// =====================================================================

export function useEditReply(ticketId: string | null) {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: { replyId: string; content: string }) => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const resp = await fetch(
        `${API_BASE}/help/feedback/${encodeURIComponent(ticketId!)}/replies/${encodeURIComponent(vars.replyId)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-Locale": getCurrentLocale(),
          },
          body: JSON.stringify({ content: vars.content }),
        },
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${resp.status}`);
      }
      return (await resp.json()) as {
        ok: boolean;
        reply: {
          id: string;
          content: string;
          edited_at: string | null;
          created_at: string;
        };
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-help-ticket", ticketId] });
    },
  });
}
