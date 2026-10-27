"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cortexFetch } from "@/lib/cortex";
import type {
  DecisionAnalysis,
  DecisionDetail,
  DecisionOption,
  DecisionPatternsResponse,
  DecisionSummary,
} from "./use-cortex";

// ---------- Queries ----------

export function useDecisionsList(status?: string, limit = 200) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["decisions-list", status, limit],
    queryFn: async () => {
      const token = await getToken();
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      qs.set("limit", String(limit));
      return cortexFetch<{ count: number; decisions: DecisionSummary[] }>(
        `/decision/?${qs.toString()}`,
        () => Promise.resolve(token),
      );
    },
  });
}

export function useDecisionDetail(id: string | null) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["decision-detail", id],
    enabled: !!id,
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<DecisionDetail>(`/decision/${id}`, () =>
        Promise.resolve(token),
      );
    },
  });
}

export function useDueReviews() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["decisions-due"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<{ count: number; decisions: DecisionSummary[] }>(
        "/decision/due",
        () => Promise.resolve(token),
      );
    },
  });
}

export function useDecisionPatterns() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["decision-patterns"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<DecisionPatternsResponse>("/decision/patterns", () =>
        Promise.resolve(token),
      );
    },
  });
}

// ---------- Mutations ----------

export function useAnalyzeDecision() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      question: string;
      context?: string;
      chosen_option?: string;
      reasoning?: string;
      expected_outcome?: string;
    }) => {
      const token = await getToken();
      return cortexFetch<{
        decision: DecisionSummary;
        options: DecisionOption[];
        analysis: DecisionAnalysis;
      }>("/decision/analyze", () => Promise.resolve(token), {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decisions-list"] });
      qc.invalidateQueries({ queryKey: ["decisions-due"] });
      qc.invalidateQueries({ queryKey: ["decisions-home"] });
      qc.invalidateQueries({ queryKey: ["stats-decisions"] });
    },
  });
}

export function useUpdateDecision(decisionId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      chosen_option?: string;
      reasoning?: string;
      expected_outcome?: string;
      review_days?: number;
    }) => {
      const token = await getToken();
      return cortexFetch<{
        decision: DecisionSummary;
        options: DecisionOption[];
        analysis: DecisionAnalysis;
        chosen_option: string | null;
        reasoning: string | null;
        expected_outcome: string | null;
        review_at: string | null;
      }>(`/decision/${decisionId}`, () => Promise.resolve(token), {
        method: "PATCH",
        body: payload,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decision-detail", decisionId] });
      qc.invalidateQueries({ queryKey: ["decisions-list"] });
      qc.invalidateQueries({ queryKey: ["decisions-due"] });
      qc.invalidateQueries({ queryKey: ["decisions-home"] });
    },
  });
}

export function useRecordOutcome(decisionId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (actualOutcome: string) => {
      const token = await getToken();
      return cortexFetch<{
        decision: DecisionSummary;
        actual_outcome: string;
        lesson: string | null;
        analysis: DecisionAnalysis;
      }>(`/decision/${decisionId}/outcome`, () => Promise.resolve(token), {
        method: "POST",
        body: { actual_outcome: actualOutcome },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decision-detail", decisionId] });
      qc.invalidateQueries({ queryKey: ["decisions-list"] });
      qc.invalidateQueries({ queryKey: ["decisions-due"] });
      qc.invalidateQueries({ queryKey: ["decisions-home"] });
      qc.invalidateQueries({ queryKey: ["lessons"] });
      qc.invalidateQueries({ queryKey: ["lessons-home"] });
    },
  });
}

// ---------- Archive / Unarchive ----------

export function useArchiveDecision(decisionId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return cortexFetch<{ decision: DecisionSummary }>(
        `/decision/${decisionId}/archive`,
        () => Promise.resolve(token),
        { method: "POST" },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decision-detail", decisionId] });
      qc.invalidateQueries({ queryKey: ["decisions-list"] });
      qc.invalidateQueries({ queryKey: ["decisions-due"] });
      qc.invalidateQueries({ queryKey: ["decisions-home"] });
    },
  });
}

export function useUnarchiveDecision(decisionId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return cortexFetch<{ decision: DecisionSummary }>(
        `/decision/${decisionId}/unarchive`,
        () => Promise.resolve(token),
        { method: "POST" },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decision-detail", decisionId] });
      qc.invalidateQueries({ queryKey: ["decisions-list"] });
      qc.invalidateQueries({ queryKey: ["decisions-home"] });
    },
  });
}

// ---------- Delete ----------

export function useDeleteDecision(decisionId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return cortexFetch<{ deleted: boolean; id: string }>(
        `/decision/${decisionId}`,
        () => Promise.resolve(token),
        { method: "DELETE" },
      );
    },
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["decision-detail", decisionId] });
      qc.invalidateQueries({ queryKey: ["decisions-list"] });
      qc.invalidateQueries({ queryKey: ["decisions-due"] });
      qc.invalidateQueries({ queryKey: ["decisions-home"] });
      qc.invalidateQueries({ queryKey: ["stats-decisions"] });
      qc.invalidateQueries({ queryKey: ["decision-patterns"] });
    },
  });
}

// ---------- Derived helpers ----------

export function daysOverdue(iso: string | null): number {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / 86400000));
}

export function daysUntil(iso: string | null): number {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((then - now) / 86400000));
}
