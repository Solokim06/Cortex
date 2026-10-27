"use client";

import { useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cortexFetch } from "@/lib/cortex";
import { useNow } from "@/lib/hooks/use-now";

// =====================================================================
// types
// =====================================================================

export type ProposalChange = {
  op: string;
  [key: string]: unknown;
};

export type ProposalDetail = {
  change_index: number;
  note: string;
};

export type AgentProposal = {
  id: string;
  action_kind: string;
  reasoning: string;
  changes: ProposalChange[];
  details: ProposalDetail[];
  confidence: number;
  expires_at: string | null;
};

export type AgentAction = {
  id: string;
  action_kind: string;
  instruction: string | null;
  proposal: AgentProposal;
  status: "pending" | "applied" | "rejected" | "failed" | "undone";
  result: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
  created_at: string | null;
  applied_at: string | null;
  undone_at: string | null;
  expires_at: string | null;
};

export type AgentActionsList = {
  actions: AgentAction[];
  count: number;
};

export type DispatchResult = {
  action_id: string;
  action_kind: string;
  status: string;
  proposal: AgentProposal;
  auto_applied: boolean;
  message: string | null;
};

// =====================================================================
// queries
// =====================================================================

export function useAgentActions(status?: string, limit = 50, since?: string) {
  const { getToken, isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["agent-actions", status ?? "all", limit, since ?? "all"],
    enabled: !!isSignedIn,
    staleTime: 15 * 1000,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      if (since) qs.set("since", since);
      qs.set("limit", String(limit));
      return cortexFetch<AgentActionsList>(
        `/agent/actions?${qs.toString()}`,
        () => Promise.resolve(token),
      );
    },
  });
}

export function useAgentAction(actionId: string | null) {
  const { getToken, isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["agent-action", actionId],
    enabled: !!isSignedIn && !!actionId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return cortexFetch<AgentAction>(
        `/agent/actions/${encodeURIComponent(actionId!)}`,
        () => Promise.resolve(token),
      );
    },
  });
}

// =====================================================================
// mutations
// =====================================================================

export function useApplyAgentAction() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (actionId: string) => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return cortexFetch<AgentAction>(
        `/agent/actions/${encodeURIComponent(actionId)}/apply`,
        () => Promise.resolve(token),
        { method: "POST" },
      );
    },
    onSuccess: (_data, actionId) => {
      qc.invalidateQueries({ queryKey: ["agent-actions"] });
      qc.invalidateQueries({ queryKey: ["agent-action", actionId] });
    },
  });
}

export function useRejectAgentAction() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (actionId: string) => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return cortexFetch<AgentAction>(
        `/agent/actions/${encodeURIComponent(actionId)}/reject`,
        () => Promise.resolve(token),
        { method: "POST" },
      );
    },
    onSuccess: (_data, actionId) => {
      qc.invalidateQueries({ queryKey: ["agent-actions"] });
      qc.invalidateQueries({ queryKey: ["agent-action", actionId] });
    },
  });
}

export function useUndoAgentAction() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (actionId: string) => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return cortexFetch<AgentAction>(
        `/agent/actions/${encodeURIComponent(actionId)}/undo`,
        () => Promise.resolve(token),
        { method: "POST" },
      );
    },
    onSuccess: (_data, actionId) => {
      qc.invalidateQueries({ queryKey: ["agent-actions"] });
      qc.invalidateQueries({ queryKey: ["agent-action", actionId] });
    },
  });
}

export function useDispatchAgent() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      instruction: string;
      action_kind: string;
      context?: Record<string, unknown>;
    }) => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return cortexFetch<DispatchResult>(
        `/agent/actions/plan`,
        () => Promise.resolve(token),
        { method: "POST", body: payload },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-actions"] });
    },
  });
}

// =====================================================================
// summary hook -- for badges, cards, and banners
// =====================================================================

export type AgentActionsSummary = {
  pending: number;
  failed: number;
  recent: number;   // applied in last 24h
  total: number;    // pending + failed -- the "needs attention" count
};

export function useAgentActionsSummary(): AgentActionsSummary {
  const { data } = useAgentActions(undefined, 200);
  const now = useNow();
  return useMemo<AgentActionsSummary>(() => {
    const dayAgo = now - 24 * 60 * 60 * 1000;
    let pending = 0;
    let failed = 0;
    let recent = 0;
    for (const a of data?.actions ?? []) {
      if (a.status === "pending") pending++;
      else if (a.status === "failed") failed++;
      else if (
        a.status === "applied" &&
        a.applied_at &&
        new Date(a.applied_at).getTime() > dayAgo
      ) {
        recent++;
      }
    }
    return { pending, failed, recent, total: pending + failed };
  }, [data, now]);
}
