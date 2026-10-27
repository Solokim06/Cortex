"use client";

import { useAuth } from "@clerk/nextjs";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  addTicketTag,
  approveDraft,
  assignTicket,
  bulkHideTickets,
  bulkUpdateTickets,
  clearTriageCache,
  discardDraft,
  fetchTicket,
  hideTicket,
  restoreTicket,
  fetchTicketEvents,
  fetchTickets,
  postInternalNote,
  postTeamReply,
  removeTicketTag,
  searchTickets,
  triageTicket,
  updateTicketPriority,
  updateTicketStatus,
  type BulkUpdatePayload,
  type TicketDetail,
  type TicketFilters,
  type TicketListResponse,
  type TicketStatus,
  type TicketPriority,
  type TicketEvent,
  type TriageResult,
} from "@/lib/admin-api";

// =====================================================================
// helpers
// =====================================================================

/**
 * Invalidate everything that might be stale after a ticket mutation.
 * Called from every mutation's onSuccess.
 */
function invalidateTicketRelated(qc: QueryClient, ticketId?: string) {
  qc.invalidateQueries({ queryKey: ["admin-tickets"] });
  qc.invalidateQueries({ queryKey: ["admin-search"] });
  qc.invalidateQueries({ queryKey: ["admin-stats"] });
  qc.invalidateQueries({ queryKey: ["admin-all-tags"] });
  if (ticketId) {
    qc.invalidateQueries({ queryKey: ["admin-ticket", ticketId] });
    qc.invalidateQueries({ queryKey: ["admin-ticket-events", ticketId] });
  }
}

// =====================================================================
// queries
// =====================================================================

/**
 * Ticket list, filtered + paginated.
 *
 * Query key includes the whole filter object so TanStack caches each
 * combination separately (status=open vs status=closed are two caches).
 */
export function useAdminTickets(filters: TicketFilters = {}) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery<TicketListResponse>({
    queryKey: ["admin-tickets", filters],
    enabled: !!isSignedIn,
    staleTime: 10_000,
    queryFn: () => fetchTickets(getToken, filters),
  });
}

/**
 * Full-text search. Uses a separate query key so results don't clash
 * with the regular list.
 */
export function useAdminSearch(params: {
  q: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  limit?: number;
  offset?: number;
}) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery<TicketListResponse & { query: string }>({
    queryKey: ["admin-search", params],
    enabled: !!isSignedIn && params.q.trim().length > 0,
    staleTime: 10_000,
    queryFn: () => searchTickets(getToken, params),
  });
}

/**
 * One ticket with everything: filer, assignee, replies, events, tags, SLA.
 */
export function useAdminTicket(ticketId: string | null) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery<TicketDetail>({
    queryKey: ["admin-ticket", ticketId],
    enabled: !!isSignedIn && !!ticketId,
    staleTime: 5_000,
    queryFn: () => fetchTicket(getToken, ticketId!),
  });
}

/**
 * Raw event timeline for a ticket. Most detail views read events from
 * the ticket detail payload — use this only if you need events without
 * re-fetching the whole ticket.
 */
export function useAdminTicketEvents(
  ticketId: string | null,
  opts: { include_system?: boolean } = { include_system: true },
) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery<TicketEvent[]>({
    queryKey: ["admin-ticket-events", ticketId, opts],
    enabled: !!isSignedIn && !!ticketId,
    staleTime: 5_000,
    queryFn: () => fetchTicketEvents(getToken, ticketId!, opts),
  });
}

// =====================================================================
// mutations — single ticket
// =====================================================================

export function useUpdateTicketStatus(ticketId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (vars: { status: TicketStatus; expectedUpdatedAt?: string }) =>
      updateTicketStatus(getToken, ticketId, vars.status, vars.expectedUpdatedAt),
    onSuccess: () => invalidateTicketRelated(qc, ticketId),
  });
}

export function useUpdateTicketPriority(ticketId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (priority: TicketPriority) =>
      updateTicketPriority(getToken, ticketId, priority),
    onSuccess: () => invalidateTicketRelated(qc, ticketId),
  });
}

export function useAssignTicket(ticketId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (userId: string | null) =>
      assignTicket(getToken, ticketId, userId),
    onSuccess: () => invalidateTicketRelated(qc, ticketId),
  });
}

export function usePostTeamReply(ticketId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (content: string) => postTeamReply(getToken, ticketId, content),
    onSuccess: () => invalidateTicketRelated(qc, ticketId),
  });
}

export function usePostInternalNote(ticketId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (content: string) => postInternalNote(getToken, ticketId, content),
    onSuccess: () => invalidateTicketRelated(qc, ticketId),
  });
}

export function useAddTicketTag(ticketId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (tag: string) => addTicketTag(getToken, ticketId, tag),
    onSuccess: () => invalidateTicketRelated(qc, ticketId),
  });
}

export function useRemoveTicketTag(ticketId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (tag: string) => removeTicketTag(getToken, ticketId, tag),
    onSuccess: () => invalidateTicketRelated(qc, ticketId),
  });
}

// =====================================================================
// mutations — triage
// =====================================================================

export function useTriageTicket(ticketId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation<TriageResult, unknown, { force?: boolean } | void>({
    mutationFn: (vars) =>
      triageTicket(getToken, ticketId, !!(vars && vars.force)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ticket", ticketId] });
    },
  });
}

export function useClearTriageCache(ticketId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => clearTriageCache(getToken, ticketId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ticket", ticketId] });
    },
  });
}

export function useApproveDraft(ticketId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => approveDraft(getToken, ticketId),
    onSuccess: () => invalidateTicketRelated(qc, ticketId),
  });
}

export function useDiscardDraft(ticketId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => discardDraft(getToken, ticketId),
    onSuccess: () => invalidateTicketRelated(qc, ticketId),
  });
}

export function useHideTicket(ticketId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => hideTicket(getToken, ticketId),
    onSuccess: () => invalidateTicketRelated(qc, ticketId),
  });
}

export function useRestoreTicket(ticketId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => restoreTicket(getToken, ticketId),
    onSuccess: () => invalidateTicketRelated(qc, ticketId),
  });
}

export function useBulkHideTickets() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => bulkHideTickets(getToken, ids),
    onSuccess: () => invalidateTicketRelated(qc),
  });
}

// =====================================================================
// mutations — bulk
// =====================================================================

export function useBulkUpdateTickets() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: BulkUpdatePayload) =>
      bulkUpdateTickets(getToken, payload),
    onSuccess: () => invalidateTicketRelated(qc),
  });
}
