"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import {
  Sparkles,
  Network,
  GraduationCap,
  GitBranch,
  Lightbulb,
  TrendingUp,
} from "lucide-react";
import { cortexFetch } from "@/lib/cortex";
import { useNow } from "@/lib/hooks/use-now";
import { StatTile } from "./StatTile";

type NodeItem = {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  created_at: string;
};

type Goal = {
  id: string;
  title: string;
  status: string;
  created_at: string;
};

type Decision = {
  id: string;
  question: string;
  status: string;
  created_at: string;
};

type Lesson = {
  id: string;
  kind: string;
  title: string | null;
  content: string;
  created_at: string;
};

type Maturity = {
  score: number;
  tier: string;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function countInWindow(
  nodes: NodeItem[],
  startMs: number,
  endMs: number,
): number {
  return nodes.filter((n) => {
    const t = new Date(n.created_at).getTime();
    return t >= startMs && t < endMs;
  }).length;
}

export function ActivityStats() {
  const t = useTranslations("home.stats");
  const { getToken } = useAuth();
  // `now` is a stable number from a custom hook — pure to read in render.
  const now = useNow();

  const nodesQuery = useQuery({
    queryKey: ["stats-nodes"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<{ count: number; nodes: NodeItem[] }>(
        "/capture/?limit=200",
        () => Promise.resolve(token),
      );
    },
  });

  const goalsQuery = useQuery({
    queryKey: ["stats-goals"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<{ count: number; goals: Goal[] }>(
        "/learning/goals?limit=200",
        () => Promise.resolve(token),
      );
    },
  });

  const decisionsQuery = useQuery({
    queryKey: ["stats-decisions"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<{ count: number; decisions: Decision[] }>(
        "/decision/?limit=200",
        () => Promise.resolve(token),
      );
    },
  });

  const lessonsQuery = useQuery({
    queryKey: ["stats-lessons"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<{ count: number; lessons: Lesson[] }>(
        "/reflection/lessons?limit=200",
        () => Promise.resolve(token),
      );
    },
  });

  const maturityQuery = useQuery({
    queryKey: ["stats-maturity"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<Maturity>("/identity/maturity", () =>
        Promise.resolve(token),
      );
    },
  });

  // ── Pure derivations from stable inputs ──
  const nodes = nodesQuery.data?.nodes ?? [];
  const totalNodes = nodesQuery.data?.count ?? nodes.length;

  const thisWeek = countInWindow(nodes, now - WEEK_MS, now);
  const lastWeek = countInWindow(nodes, now - 2 * WEEK_MS, now - WEEK_MS);
  const delta = thisWeek - lastWeek;
  const deltaSub =
    nodes.length === 0
      ? undefined
      : delta > 0
        ? t("deltaUp", { count: delta })
        : delta < 0
          ? t("deltaDown", { count: delta })
          : t("deltaEven");
  const deltaTone: "positive" | "negative" | "neutral" =
    delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral";

  const goals = goalsQuery.data?.goals ?? [];
  const activeGoals = goals.filter(
    (g) => g.status === "active" || g.status === "in_progress",
  ).length;

  const decisions = decisionsQuery.data?.decisions ?? [];
  const totalDecisions = decisionsQuery.data?.count ?? decisions.length;

  const lessons = lessonsQuery.data?.lessons ?? [];
  const totalLessons = lessonsQuery.data?.count ?? lessons.length;

  const maturity = maturityQuery.data;
  const maturityScore = maturity?.score ?? 0;
  const maturityTier = maturity?.tier ?? "";

  const loading =
    nodesQuery.isLoading ||
    goalsQuery.isLoading ||
    decisionsQuery.isLoading ||
    lessonsQuery.isLoading ||
    maturityQuery.isLoading;

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
      <StatTile
        icon={Sparkles}
        value={thisWeek}
        label={t("capturesThisWeek")}
        sub={deltaSub}
        subTone={deltaTone}
        tone="primary"
        href="/capture"
        loading={loading}
      />
      <StatTile
        icon={Network}
        value={totalNodes}
        label={t("inYourGraph")}
        tone="sky"
        loading={loading}
      />
      <StatTile
        icon={GraduationCap}
        value={activeGoals}
        label={t("activeGoals")}
        tone="violet"
        href="/learning"
        loading={loading}
      />
      <StatTile
        icon={GitBranch}
        value={totalDecisions}
        label={t("decisionsLogged")}
        tone="amber"
        href="/decisions"
        loading={loading}
      />
      <StatTile
        icon={Lightbulb}
        value={totalLessons}
        label={t("lessonsLearned")}
        tone="emerald"
        href="/reflections"
        loading={loading}
      />
      <StatTile
        icon={TrendingUp}
        value={maturityScore > 0 ? maturityScore : "—"}
        label={maturityTier || t("maturity")}
        tone="rose"
        href="/identity"
        loading={loading}
      />
    </div>
  );
}
