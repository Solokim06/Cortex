/**
 * Admin API client.
 *
 * Wraps every /admin/* endpoint with a typed function. All calls go
 * through cortexFetch (lib/cortex.ts), which handles Clerk auth.
 *
 * Style: plain async functions taking (getToken, params). The hooks in
 * lib/hooks/use-admin-* wrap these with TanStack Query.
 */

import { cortexFetch } from "@/lib/cortex";

// =====================================================================
// Types (mirror the FastAPI response shapes)
// =====================================================================

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type TicketCategory = "bug" | "feature" | "question" | "other";

export type AdminMe = {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "agent" | "admin";
  is_admin: boolean;
  is_agent: boolean;
  impersonating: { session_id: string; admin_user_id: string } | null;
};

export type Filer = {
  id: string;
  email: string;
  name: string | null;
  role?: string;
};

export type TicketSummary = {
  id: string;
  category: TicketCategory;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  last_replied_by: "user" | "team" | "note" | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  first_response_due_at: string | null;
  resolution_due_at: string | null;
  breached: boolean;
  filer: Filer | null;
  assignee: Filer | null;
  hidden_from_admin_at?: string | null;
};

export type TicketReply = {
  id: string;
  author: "user" | "team" | "note";
  content: string;
  created_at: string;
};

export type TicketEvent = {
  id: string;
  ticket_id: string;
  kind: string;
  actor_kind: "user" | "team" | "system";
  actor_user_id: string | null;
  data: Record<string, unknown>;
  created_at: string;
};

export type SlaStatus = {
  first_response: {
    due_at: string | null;
    responded_at: string | null;
    breached: boolean;
    seconds_remaining: number | null;
  };
  resolution: {
    due_at: string | null;
    resolved_at: string | null;
    breached: boolean;
    seconds_remaining: number | null;
  };
  breached_any: boolean;
};

export type AttachedConversationMessage = {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

export type TicketDetail = {
  id: string;
  category: TicketCategory;
  subject: string;
  description: string;
  context: Record<string, unknown>;
  attached_conversation?: AttachedConversationMessage[];
  attachment_url: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  last_replied_by: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  first_responded_at: string | null;
  filer: Filer | null;
  assignee: Filer | null;
  tags: string[];
  sla: SlaStatus;
  replies: TicketReply[];
  events: TicketEvent[];
};

export type TicketListResponse = {
  items: TicketSummary[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

export type AdminStats = {
  total: number;
  by_status: Record<TicketStatus, number>;
  unassigned_open: number;
  sla_breached_open: number;
  generated_at: string;
};

export type TagCount = { tag: string; count: number };

export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "agent" | "admin";
  created_at: string | null;
};

export type SlaPolicy = {
  priority: TicketPriority;
  first_response_minutes: number;
  resolution_minutes: number;
  updated_at: string | null;
};

export type Macro = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  created_at: string | null;
  updated_at: string | null;
};

export type MacroUsage = {
  macro_id: string;
  title: string;
  uses: number;
};

export type WebhookTarget = {
  id: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  has_secret: boolean;
  last_status_code: number | null;
  last_delivery_at: string | null;
  failure_count: number;
  created_at: string | null;
};

export type WebhookDelivery = {
  id: string;
  target_id: string;
  event_kind: string;
  ticket_id: string | null;
  status_code: number | null;
  response_body: string | null;
  attempt: number;
  delivered_at: string | null;
};

export type TriageResult = {
  category: TicketCategory;
  priority: TicketPriority;
  rationale: string;
  draft_reply: string;
  confidence: number;
  generated_at: string;
  model: string;
  cached: boolean;
};

// ---- AI pipeline shapes (stored in ticket.context on the backend) ----

export type AiDraftReply = {
  content: string;
  confidence: number;
  category: TicketCategory | null;
  generated_at: string;
};

export type AiTriagePipeline = {
  processed_at?: string;
  started_at?: string;
  auto_sent?: boolean;
  reply_id?: string | null;
  confidence?: number;
  category?: TicketCategory;
  priority?: TicketPriority;
  applied_diff?: {
    category_before?: TicketCategory;
    category_after?: TicketCategory;
    priority_before?: TicketPriority;
    priority_after?: TicketPriority;
  };
  error?: string;
};

export type ApproveDraftResponse = {
  ok: boolean;
  reply_id?: string;
  reason?: string;
};

export type NotificationPrefs = {
  user_id: string;
  email_on_new_ticket: boolean;
  email_on_assignment: boolean;
  email_on_user_reply: boolean;
  email_on_sla_breach: boolean;
  email_digest_daily: boolean;
  updated_at: string | null;
};

export type AdminHealth = {
  db_ok: boolean;
  pubsub_mode: string;
  pubsub_subscribers: number;
  data: {
    users: number;
    tickets: {
      total: number;
      oldest_created: string | null;
      oldest_resolved_age_days: number | null;
    };
    replies: number;
    events: { total: number; oldest_age_days: number | null };
    webhook_deliveries: {
      total: number;
      oldest_age_days: number | null;
    };
    impersonation_sessions: number;
    generated_at: string;
  };
  failed_webhook_deliveries: number;
  generated_at: string;
};

// =====================================================================
// Query params
// =====================================================================

export type TicketFilters = {
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: TicketCategory;
  assigned_to_user_id?: string;
  unassigned?: boolean;
  search?: string;
  tag?: string;
  breached?: boolean;
  sort?: "updated_desc" | "updated_asc" | "created_desc" | "created_asc" | "priority_desc";
  limit?: number;
  offset?: number;
  show_hidden?: boolean | null;
};

function buildQuery(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

// =====================================================================
// Identity
// =====================================================================

export async function fetchAdminMe(
  getToken: () => Promise<string | null>,
): Promise<AdminMe> {
  return cortexFetch<AdminMe>("/admin/me", getToken);
}

// =====================================================================
// Stats + tags
// =====================================================================

export async function fetchAdminStats(
  getToken: () => Promise<string | null>,
): Promise<AdminStats> {
  return cortexFetch<AdminStats>("/admin/stats", getToken);
}

export async function fetchAllTags(
  getToken: () => Promise<string | null>,
): Promise<TagCount[]> {
  return cortexFetch<TagCount[]>("/admin/tags", getToken);
}

// =====================================================================
// Tickets
// =====================================================================

export async function fetchTickets(
  getToken: () => Promise<string | null>,
  filters: TicketFilters = {},
): Promise<TicketListResponse> {
  return cortexFetch<TicketListResponse>(
    `/admin/tickets${buildQuery(filters)}`,
    getToken,
  );
}

export async function fetchTicket(
  getToken: () => Promise<string | null>,
  ticketId: string,
): Promise<TicketDetail> {
  return cortexFetch<TicketDetail>(`/admin/tickets/${ticketId}`, getToken);
}

export async function fetchTicketEvents(
  getToken: () => Promise<string | null>,
  ticketId: string,
  opts: { include_system?: boolean } = {},
): Promise<TicketEvent[]> {
  return cortexFetch<TicketEvent[]>(
    `/admin/tickets/${ticketId}/events${buildQuery(opts)}`,
    getToken,
  );
}

export async function searchTickets(
  getToken: () => Promise<string | null>,
  params: { q: string; status?: TicketStatus; priority?: TicketPriority; limit?: number; offset?: number },
): Promise<TicketListResponse & { query: string }> {
  return cortexFetch<TicketListResponse & { query: string }>(
    `/admin/search${buildQuery(params)}`,
    getToken,
  );
}

// =====================================================================
// Ticket mutations
// =====================================================================

export async function updateTicketStatus(
  getToken: () => Promise<string | null>,
  ticketId: string,
  status: TicketStatus,
  expectedUpdatedAt?: string,
): Promise<{ ok: boolean; status: TicketStatus }> {
  return cortexFetch(
    `/admin/tickets/${ticketId}/status`,
    getToken,
    {
      method: "PATCH",
      body: { status, expected_updated_at: expectedUpdatedAt },
    },
  );
}

export async function updateTicketPriority(
  getToken: () => Promise<string | null>,
  ticketId: string,
  priority: TicketPriority,
): Promise<{ ok: boolean; priority: TicketPriority }> {
  return cortexFetch(
    `/admin/tickets/${ticketId}/priority`,
    getToken,
    { method: "PATCH", body: { priority } },
  );
}

export async function assignTicket(
  getToken: () => Promise<string | null>,
  ticketId: string,
  userId: string | null,
): Promise<{ ok: boolean; assigned_to_user_id: string | null }> {
  return cortexFetch(
    `/admin/tickets/${ticketId}/assign`,
    getToken,
    { method: "PATCH", body: { user_id: userId } },
  );
}

export async function postTeamReply(
  getToken: () => Promise<string | null>,
  ticketId: string,
  content: string,
): Promise<{ ok: boolean; reply: TicketReply }> {
  return cortexFetch(
    `/admin/tickets/${ticketId}/reply`,
    getToken,
    { method: "POST", body: { content } },
  );
}

export async function postInternalNote(
  getToken: () => Promise<string | null>,
  ticketId: string,
  content: string,
): Promise<{ ok: boolean; note: TicketReply }> {
  return cortexFetch(
    `/admin/tickets/${ticketId}/note`,
    getToken,
    { method: "POST", body: { content } },
  );
}

export async function addTicketTag(
  getToken: () => Promise<string | null>,
  ticketId: string,
  tag: string,
): Promise<{ ok: boolean; tags: string[] }> {
  return cortexFetch(
    `/admin/tickets/${ticketId}/tags`,
    getToken,
    { method: "POST", body: { tag } },
  );
}

export async function removeTicketTag(
  getToken: () => Promise<string | null>,
  ticketId: string,
  tag: string,
): Promise<{ ok: boolean; tags: string[] }> {
  return cortexFetch(
    `/admin/tickets/${ticketId}/tags/${encodeURIComponent(tag)}`,
    getToken,
    { method: "DELETE" },
  );
}

// =====================================================================
// Bulk
// =====================================================================

export type BulkUpdatePayload = {
  ticket_ids: string[];
  status?: TicketStatus;
  priority?: TicketPriority;
  assign_to_user_id?: string;
  assign_to_me?: boolean;
  add_tag?: string;
};

export async function bulkUpdateTickets(
  getToken: () => Promise<string | null>,
  payload: BulkUpdatePayload,
): Promise<{ updated: number; skipped: number; errors: { id: string; reason: string }[] }> {
  return cortexFetch("/admin/tickets/bulk", getToken, {
    method: "POST",
    body: payload,
  });
}

// =====================================================================
// Triage
// =====================================================================

export async function triageTicket(
  getToken: () => Promise<string | null>,
  ticketId: string,
  force = false,
): Promise<TriageResult> {
  return cortexFetch(
    `/admin/tickets/${ticketId}/triage`,
    getToken,
    { method: "POST", body: { force } },
  );
}

export async function clearTriageCache(
  getToken: () => Promise<string | null>,
  ticketId: string,
): Promise<{ ok: boolean }> {
  return cortexFetch(
    `/admin/tickets/${ticketId}/triage`,
    getToken,
    { method: "DELETE" },
  );
}

export async function hideTicket(
  getToken: () => Promise<string | null>,
  ticketId: string,
): Promise<{ ok: boolean; reason?: string }> {
  return cortexFetch(
    `/admin/tickets/${ticketId}/hide`,
    getToken,
    { method: "POST" },
  );
}

export async function restoreTicket(
  getToken: () => Promise<string | null>,
  ticketId: string,
): Promise<{ ok: boolean; reason?: string }> {
  return cortexFetch(
    `/admin/tickets/${ticketId}/restore`,
    getToken,
    { method: "POST" },
  );
}

export async function bulkHideTickets(
  getToken: () => Promise<string | null>,
  ticketIds: string[],
): Promise<{ hidden: number; skipped: { id: string; reason?: string }[] }> {
  return cortexFetch(
    `/admin/tickets/bulk-hide`,
    getToken,
    {
      method: "POST",
      body: { ticket_ids: ticketIds },
    },
  );
}

export async function approveDraft(
  getToken: () => Promise<string | null>,
  ticketId: string,
): Promise<ApproveDraftResponse> {
  return cortexFetch(
    `/admin/tickets/${ticketId}/triage/approve-draft`,
    getToken,
    { method: "POST" },
  );
}

export async function discardDraft(
  getToken: () => Promise<string | null>,
  ticketId: string,
): Promise<{ ok: boolean }> {
  return cortexFetch(
    `/admin/tickets/${ticketId}/triage/discard-draft`,
    getToken,
    { method: "POST" },
  );
}

// =====================================================================
// Users
// =====================================================================

export async function fetchUsers(
  getToken: () => Promise<string | null>,
  params: { search?: string; role?: string; limit?: number; offset?: number } = {},
): Promise<AdminUser[]> {
  return cortexFetch<AdminUser[]>(
    `/admin/users${buildQuery(params)}`,
    getToken,
  );
}

export async function setUserRole(
  getToken: () => Promise<string | null>,
  userId: string,
  role: "user" | "agent" | "admin",
): Promise<{ ok: boolean; id: string; email: string; role: string }> {
  return cortexFetch(
    `/admin/users/${userId}/role`,
    getToken,
    { method: "PATCH", body: { role } },
  );
}

// =====================================================================
// SLA
// =====================================================================

export async function fetchSlaPolicies(
  getToken: () => Promise<string | null>,
): Promise<SlaPolicy[]> {
  return cortexFetch<SlaPolicy[]>("/admin/sla/policies", getToken);
}

export async function updateSlaPolicy(
  getToken: () => Promise<string | null>,
  priority: TicketPriority,
  firstResponseMinutes: number,
  resolutionMinutes: number,
): Promise<{ priority: TicketPriority; first_response_minutes: number; resolution_minutes: number }> {
  return cortexFetch(
    `/admin/sla/policies/${priority}`,
    getToken,
    {
      method: "PUT",
      body: {
        first_response_minutes: firstResponseMinutes,
        resolution_minutes: resolutionMinutes,
      },
    },
  );
}

export async function triggerSlaScan(
  getToken: () => Promise<string | null>,
): Promise<{ scanned: number; breached_total: number; alerted: number; recomputed: number }> {
  return cortexFetch("/admin/sla/scan-now", getToken, { method: "POST" });
}

// =====================================================================
// Macros
// =====================================================================

export async function fetchMacros(
  getToken: () => Promise<string | null>,
): Promise<Macro[]> {
  return cortexFetch<Macro[]>("/admin/macros", getToken);
}

export async function createMacro(
  getToken: () => Promise<string | null>,
  payload: { title: string; body: string; tags?: string[] },
): Promise<Macro> {
  return cortexFetch("/admin/macros", getToken, { method: "POST", body: payload });
}

export async function updateMacro(
  getToken: () => Promise<string | null>,
  macroId: string,
  payload: { title?: string; body?: string; tags?: string[] },
): Promise<Macro> {
  return cortexFetch(`/admin/macros/${macroId}`, getToken, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteMacro(
  getToken: () => Promise<string | null>,
  macroId: string,
): Promise<{ ok: boolean }> {
  return cortexFetch(`/admin/macros/${macroId}`, getToken, { method: "DELETE" });
}

export async function fetchMacroUsage(
  getToken: () => Promise<string | null>,
): Promise<MacroUsage[]> {
  return cortexFetch<MacroUsage[]>("/admin/macros/usage/stats", getToken);
}

export async function suggestMacros(
  getToken: () => Promise<string | null>,
  ticketId: string,
): Promise<Macro[]> {
  return cortexFetch<Macro[]>(
    `/admin/tickets/${ticketId}/macros/suggest`,
    getToken,
  );
}

export async function previewMacro(
  getToken: () => Promise<string | null>,
  ticketId: string,
  macroId: string,
  overrideBody?: string,
): Promise<{ macro_id: string; macro_title: string; ticket_id: string; rendered: string }> {
  return cortexFetch(
    `/admin/tickets/${ticketId}/macros/preview`,
    getToken,
    {
      method: "POST",
      body: { macro_id: macroId, override_body: overrideBody },
    },
  );
}

export async function replyWithMacro(
  getToken: () => Promise<string | null>,
  ticketId: string,
  macroId: string,
  extraNote?: string,
  overrideBody?: string,
): Promise<{ ok: boolean; reply: TicketReply }> {
  return cortexFetch(
    `/admin/tickets/${ticketId}/reply-with-macro`,
    getToken,
    {
      method: "POST",
      body: {
        macro_id: macroId,
        extra_note: extraNote,
        override_body: overrideBody,
      },
    },
  );
}

// =====================================================================
// Webhooks
// =====================================================================

export async function fetchWebhooks(
  getToken: () => Promise<string | null>,
): Promise<WebhookTarget[]> {
  return cortexFetch<WebhookTarget[]>("/admin/webhooks", getToken);
}

export async function createWebhook(
  getToken: () => Promise<string | null>,
  payload: { name: string; url: string; events?: string[]; secret?: string },
): Promise<WebhookTarget> {
  return cortexFetch("/admin/webhooks", getToken, { method: "POST", body: payload });
}

export async function updateWebhook(
  getToken: () => Promise<string | null>,
  targetId: string,
  payload: {
    name?: string;
    url?: string;
    events?: string[];
    secret?: string;
    is_active?: boolean;
  },
): Promise<WebhookTarget> {
  return cortexFetch(`/admin/webhooks/${targetId}`, getToken, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteWebhook(
  getToken: () => Promise<string | null>,
  targetId: string,
): Promise<{ ok: boolean }> {
  return cortexFetch(`/admin/webhooks/${targetId}`, getToken, { method: "DELETE" });
}

export async function testWebhook(
  getToken: () => Promise<string | null>,
  targetId: string,
): Promise<WebhookDelivery> {
  return cortexFetch(`/admin/webhooks/${targetId}/test`, getToken, { method: "POST" });
}

export async function fetchWebhookDeliveries(
  getToken: () => Promise<string | null>,
  targetId: string,
): Promise<WebhookDelivery[]> {
  return cortexFetch<WebhookDelivery[]>(
    `/admin/webhooks/${targetId}/deliveries`,
    getToken,
  );
}

export async function triggerWebhookRetry(
  getToken: () => Promise<string | null>,
): Promise<{ scanned: number; retried: number; succeeded: number; failed: number; skipped: number }> {
  return cortexFetch("/admin/webhooks/retry-now", getToken, { method: "POST" });
}

// =====================================================================
// Prefs
// =====================================================================

export async function fetchPrefs(
  getToken: () => Promise<string | null>,
): Promise<NotificationPrefs> {
  return cortexFetch<NotificationPrefs>("/admin/prefs", getToken);
}

export async function updatePrefs(
  getToken: () => Promise<string | null>,
  payload: Partial<Omit<NotificationPrefs, "user_id" | "updated_at">>,
): Promise<NotificationPrefs> {
  return cortexFetch("/admin/prefs", getToken, { method: "PUT", body: payload });
}

// =====================================================================
// Health
// =====================================================================

export async function fetchAdminHealth(
  getToken: () => Promise<string | null>,
): Promise<AdminHealth> {
  return cortexFetch<AdminHealth>("/admin/health", getToken);
}

// =====================================================================
// SSE stream
// =====================================================================

/**
 * Opens an SSE connection to /admin/stream. Returns an EventSource.
 *
 * Note: browser EventSource cannot send Authorization headers. We work
 * around this by passing the Clerk token as a query param... except our
 * backend doesn't accept that. The clean fix is to proxy through Next.js
 * or use fetch + ReadableStream. For now we use EventSource with a
 * token query param and update the backend to accept it (TODO).
 *
 * Actually — simpler: the SSE endpoint is behind get_current_admin which
 * reads the Authorization header. EventSource can't set headers. So we
 * use fetch() + ReadableStream parsing here instead. See use-admin-stream.ts.
 */
export const STREAM_PATH = "/admin/stream";
