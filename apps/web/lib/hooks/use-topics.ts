"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cortexFetch } from "@/lib/cortex";

// =====================================================================
// types
// =====================================================================

export type TopicListItem = {
  id: string;
  title: string;
  summary: string;
  has_synthesis: boolean;
  headline: string | null;
  generated_at: string | null;
  stale: boolean;
};

export type TopicListItemResponse = {
  concepts: TopicListItem[];
  count: number;
};

export type SynthesisPattern = {
  label: string;
  detail: string;
};

export type TopicSynthesis = {
  concept_id: string;
  concept_title: string;
  concept_summary: string;
  headline: string;
  what_youve_said: string;
  patterns: SynthesisPattern[];
  tensions: SynthesisPattern[];
  open_questions: string[];
  related_concepts: string[];
  source_node_ids: string[];
  locale: string;
  generated_at: string | null;
  stale: boolean;
};

// =====================================================================
// hooks
// =====================================================================

export function useTopicsList(limit = 200) {
  const { getToken, isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["topics-list", limit],
    enabled: !!isSignedIn,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return cortexFetch<TopicListItemResponse>(
        `/topics?limit=${limit}`,
        () => Promise.resolve(token),
      );
    },
  });
}

export function useTopicSynthesis(conceptId: string | null) {
  const { getToken, isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["topic-synthesis", conceptId],
    enabled: !!isSignedIn && !!conceptId,
    // Cached syntheses are stable for a while — 5 min matches the
    // backend's in-process response cache TTL.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return cortexFetch<TopicSynthesis>(
        `/topics/${encodeURIComponent(conceptId!)}`,
        () => Promise.resolve(token),
      );
    },
  });
}

export function useRegenerateSynthesis(conceptId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return cortexFetch<TopicSynthesis>(
        `/topics/${encodeURIComponent(conceptId)}?force=true`,
        () => Promise.resolve(token),
      );
    },
    onSuccess: (data) => {
      qc.setQueryData(["topic-synthesis", conceptId], data);
      qc.invalidateQueries({ queryKey: ["topics-list"] });
    },
  });
}
