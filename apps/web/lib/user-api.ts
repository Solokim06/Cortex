"use client";

import { API_BASE } from "@/lib/cortex";

async function authedFetch(
  getToken: () => Promise<string | null>,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await getToken();
  if (!token) throw new Error("Not signed in");
  const resp = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const body = await resp.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  return resp;
}


// ---- prefs ----

export type UserPrefs = {
  user_id: string;
  voice: string | null;
  data_contribution_optin: boolean;
  data_contribution_changed_at: string | null;
  agent_auto_apply: Record<string, boolean>;
  updated_at: string | null;
};

export async function fetchUserPrefs(
  getToken: () => Promise<string | null>,
): Promise<UserPrefs> {
  const resp = await authedFetch(getToken, "/user/prefs");
  return resp.json();
}

export async function patchUserPrefs(
  getToken: () => Promise<string | null>,
  patch: {
    voice?: string | null;
    data_contribution_optin?: boolean;
    agent_auto_apply?: Record<string, boolean>;
  },
): Promise<UserPrefs> {
  const resp = await authedFetch(getToken, "/user/prefs", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return resp.json();
}


// ---- export ----

export async function downloadUserExport(
  getToken: () => Promise<string | null>,
): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error("Not signed in");
  const resp = await fetch(`${API_BASE}/user/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  // Trigger a browser download from the response blob
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cortex-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


// ---- delete ----

export async function deleteAllChats(
  getToken: () => Promise<string | null>,
): Promise<{ ok: boolean; deleted_conversations: number }> {
  const resp = await authedFetch(getToken, "/user/chats", {
    method: "DELETE",
  });
  return resp.json();
}

export async function deleteAccount(
  getToken: () => Promise<string | null>,
  confirmEmail: string,
): Promise<{ ok: boolean }> {
  const resp = await authedFetch(
    getToken,
    `/user/account?confirm_email=${encodeURIComponent(confirmEmail)}`,
    { method: "DELETE" },
  );
  return resp.json();
}
