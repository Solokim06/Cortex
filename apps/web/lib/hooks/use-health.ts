"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cortexFetch } from "@/lib/cortex";

// =====================================================================
// types
// =====================================================================

export type NodesByType = Record<string, number>;
export type EdgesByType = Record<string, number>;

export type HealthOverview = {
  nodes_total: number;
  nodes_by_type: NodesByType;
  edges_total: number;
  edges_by_type: EdgesByType;
  canonical_concepts: number;
  aliased_concepts: number;
  pending_merges: number;
  orphan_concepts: number;
  dangling_edges: number;
  embedded_nodes: number;
  embedding_coverage: number;
  stale_concepts: number;
  median_degree: number;
};

export type DegreeBucket = {
  degree: number;
  count: number;
};

export type HealthTopology = {
  degree_histogram: DegreeBucket[];
  edge_density: number;
};

export type OrphanNode = {
  id: string;
  title: string;
  type: string;
  created_at: string | null;
};

export type DanglingEdge = {
  id: string;
  type: string;
  from_node_id: string;
  to_node_id: string;
};

export type PendingMerge = {
  alias_row_id: string;
  alias_node_id: string;
  canonical_node_id: string;
  alias_title: string;
  canonical_title: string;
  strategy: string;
  similarity: number;
  note: string;
  created_at: string | null;
};

export type StaleNode = {
  id: string;
  title: string;
  age_days: number | null;
  stale_since: string | null;
};

export type RecentMerge = {
  alias_title: string;
  canonical_title: string;
  strategy: string;
  similarity: number;
  status: string;
  when: string | null;
};

export type HealthIssues = {
  orphans: OrphanNode[];
  dangling_edges: DanglingEdge[];
  pending_merges: PendingMerge[];
  stale: StaleNode[];
};

export type HealthActivity = {
  recent_merges_7d: number;
  recent_captures_7d: number;
  recent_edges_7d: number;
  recent_merges_list: RecentMerge[];
};

export type GraphHealth = {
  overview: HealthOverview;
  topology: HealthTopology;
  issues: HealthIssues;
  activity: HealthActivity;
};

export type AliasAction = "accept" | "reject" | "undo";

export type AliasActionResponse = {
  ok: boolean;
  alias_row_id: string;
};

export type DismissResponse = {
  ok: boolean;
  node_id: string;
  dismissed_until: string | null;
};

// =====================================================================
// hooks
// =====================================================================

export function useGraphHealth() {
  const { getToken, isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["graph-health"],
    enabled: !!isSignedIn,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return cortexFetch<GraphHealth>(
        "/memory/health",
        () => Promise.resolve(token),
      );
    },
  });
}

export function useAliasAction() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      aliasRowId,
      action,
    }: {
      aliasRowId: string;
      action: AliasAction;
    }) => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return cortexFetch<AliasActionResponse>(
        `/memory/aliases/${encodeURIComponent(aliasRowId)}/${action}`,
        () => Promise.resolve(token),
        { method: "POST" },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["graph-health"] });
    },
  });
}

export function useDismissStale() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      nodeId,
      days = 90,
    }: {
      nodeId: string;
      days?: number;
    }) => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return cortexFetch<DismissResponse>(
        `/memory/stale/${encodeURIComponent(nodeId)}/dismiss?days=${days}`,
        () => Promise.resolve(token),
        { method: "POST" },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["graph-health"] });
    },
  });
}
