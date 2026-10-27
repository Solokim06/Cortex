"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cortexFetch } from "@/lib/cortex";
import type { Reflection, ReflectionKind } from "./use-cortex";

// ---------- Queries ----------

export function useReflectionsList(kind?: ReflectionKind, limit = 200) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["reflections-list", kind ?? "all", limit],
    queryFn: async () => {
      const token = await getToken();
      const qs = new URLSearchParams();
      if (kind) qs.set("kind", kind);
      qs.set("limit", String(limit));
      return cortexFetch<{ count: number; reflections: Reflection[] }>(
        `/reflection/?${qs.toString()}`,
        () => Promise.resolve(token),
      );
    },
  });
}

export function useReflectionDetail(id: string | null) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["reflection-detail", id],
    enabled: !!id,
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<Reflection>(`/reflection/${id}`, () =>
        Promise.resolve(token),
      );
    },
  });
}

export function usePendingReviews() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["reflection-pending"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<{
        count: number;
        decisions: Array<{
          id: string;
          question: string;
          status: string;
          chosen_option: string | null;
          review_at: string | null;
          created_at: string;
        }>;
      }>("/reflection/pending", () => Promise.resolve(token));
    },
  });
}

// ---------- Mutations ----------

export function useGenerateReport() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (days: number) => {
      const token = await getToken();
      return cortexFetch<{ reflection: Reflection }>(
        "/reflection/report",
        () => Promise.resolve(token),
        {
          method: "POST",
          body: { days },
        },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reflections-list"] });
      qc.invalidateQueries({ queryKey: ["lessons"] });
      qc.invalidateQueries({ queryKey: ["lessons-home"] });
      qc.invalidateQueries({ queryKey: ["stats-lessons"] });
    },
  });
}

export function useExtractLesson() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (decisionId: string) => {
      const token = await getToken();
      return cortexFetch<{ reflection: Reflection }>(
        "/reflection/extract-lesson",
        () => Promise.resolve(token),
        {
          method: "POST",
          body: { decision_id: decisionId },
        },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reflections-list"] });
      qc.invalidateQueries({ queryKey: ["reflection-pending"] });
      qc.invalidateQueries({ queryKey: ["lessons"] });
      qc.invalidateQueries({ queryKey: ["lessons-home"] });
    },
  });
}

// ---------- Derived helpers ----------

export function kindLabel(kind: string): string {
  if (kind === "lesson") return "Lesson";
  if (kind === "weekly_report") return "Weekly report";
  if (kind === "pattern_insight") return "Pattern insight";
  if (kind === "identity_update") return "Identity update";
  return kind.replace(/_/g, " ");
}

export function kindTone(kind: string): string {
  if (kind === "lesson")
    return "border-emerald-500/40 text-emerald-600 dark:text-emerald-400";
  if (kind === "weekly_report")
    return "border-sky-500/40 text-sky-600 dark:text-sky-400";
  if (kind === "pattern_insight")
    return "border-violet-500/40 text-violet-600 dark:text-violet-400";
  if (kind === "identity_update")
    return "border-primary/40 text-primary";
  return "border-border text-muted-foreground";
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
