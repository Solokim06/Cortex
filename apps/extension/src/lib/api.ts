/**
 * Cortex API client for the extension.
 *
 * Uses the long-lived Cortex API token (cx_...) for every request.
 */

import { getSession } from "./storage";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired. Sign in again.");
    this.name = "SessionExpiredError";
  }
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `API error ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type FetchOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  anonymous?: boolean;
  useClerkToken?: boolean;
};

export async function apiFetch<T = unknown>(
  path: string,
  opts: FetchOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  if (!opts.anonymous) {
    const session = await getSession();
    if (!session) throw new SessionExpiredError();

    if (opts.useClerkToken) {
      headers["Authorization"] = `Bearer ${session.clerkToken}`;
    } else {
      headers["Authorization"] = `Bearer ${session.cortexApiToken}`;
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401) {
    if (!opts.useClerkToken) {
      const { clearSession } = await import("./storage");
      await clearSession();
    }
    throw new SessionExpiredError();
  }

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) throw new ApiError(res.status, body, undefined);
  return body as T;
}

// ---------- Typed helpers ----------

export type CaptureResponse = {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  summary: string | null;
  created_at: string;
};

export async function captureText(
  text: string,
  title?: string,
): Promise<CaptureResponse> {
  return apiFetch<CaptureResponse>("/capture/text", {
    method: "POST",
    body: { text, title, source_type: "manual" },
  });
}

export async function captureUrl(
  url: string,
  title?: string,
): Promise<CaptureResponse> {
  return apiFetch<CaptureResponse>("/capture/url", {
    method: "POST",
    body: { url, title },
  });
}

export async function healthCheck(): Promise<{ status: string }> {
  return apiFetch<{ status: string }>("/health", { anonymous: true });
}

export async function getMe(): Promise<{
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
}> {
  return apiFetch("/extension/me");
}

export type RecentNode = {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  created_at: string;
};

export async function listRecentNodes(
  limit = 10,
): Promise<{ count: number; nodes: RecentNode[] }> {
  return apiFetch(`/capture/?limit=${limit}`);
}

export type MemoryHit = {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  summary: string | null;
  score: number;
};

export async function searchMemory(
  q: string,
  limit = 10,
): Promise<{
  query: string;
  count: number;
  results: MemoryHit[];
}> {
  return apiFetch(
    `/memory/search?q=${encodeURIComponent(q)}&limit=${limit}&mode=hybrid`,
  );
}

// ---------- URL check (for badge) ----------

export type UrlCheckResult = {
  exists: boolean;
  count: number;
  node_id: string | null;
  title: string | null;
};

export async function checkUrl(url: string): Promise<UrlCheckResult> {
  return apiFetch<UrlCheckResult>(
    `/capture/check?url=${encodeURIComponent(url)}`,
  );
}

// ---------- Cortex API token management ----------

export type MintApiTokenResponse = {
  token: string;
  prefix: string;
  expires_at: string;
  user_id: string;
};

export async function mintApiToken(
  clerkToken: string,
  label?: string,
): Promise<MintApiTokenResponse> {
  const res = await fetch(`${API_BASE}/extension/api-token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${clerkToken}`,
    },
    body: JSON.stringify({ label: label ?? "browser extension" }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body, `Mint failed (${res.status})`);
  }

  return (await res.json()) as MintApiTokenResponse;
}

// =====================================================================
// Tier 4 -- agentic actions
// =====================================================================

export type AgentProposal = {
  id: string;
  action_kind: string;
  reasoning: string;
  changes: unknown[];
  details: unknown[];
  confidence: number;
  expires_at: string | null;
};

export type DispatchResult = {
  action_id: string;
  action_kind: string;
  status: string;
  proposal: AgentProposal;
  auto_applied: boolean;
  message: string | null;
};

/**
 * Ask the backend to run an agent and produce a proposal. Used by the
 * "Ask Cortex to place this URL" context-menu item. The agent's plan()
 * runs server-side; nothing is mutated until the user approves.
 */
export async function planAgentAction(payload: {
  instruction: string;
  action_kind: string;
  context?: Record<string, unknown>;
}): Promise<DispatchResult> {
  return apiFetch<DispatchResult>("/agent/actions/plan", {
    method: "POST",
    body: payload,
  });
}
