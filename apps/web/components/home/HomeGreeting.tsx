"use client";

import { useSyncExternalStore } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { cortexFetch } from "@/lib/cortex";
import { useNow } from "@/lib/hooks/use-now";

type Decision = {
  id: string;
  question: string;
  status: string;
  review_at: string | null;
};

type Goal = {
  id: string;
  title: string;
  status: string;
};

type Milestone = {
  title: string;
  actions: string[];
  done?: boolean;
};

type Phase = {
  phase: string;
  milestones: Milestone[];
};

type GoalPlanResponse = {
  goal: { id: string; title: string; status: string };
  plan: { phases?: Phase[]; first_action?: string; summary?: string };
  plan_status: string;
};

type NodeItem = {
  id: string;
  created_at: string;
};

type Maturity = {
  score: number;
  tier: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hydration-safe "is this the client?" hook.
 *
 * Returns `false` during SSR and the first client render, then `true`
 * after hydration. Uses useSyncExternalStore so we never call setState
 * inside an effect (which React 19's stricter lint rules forbid).
 */
const emptySubscribe = () => () => {};
function useIsClient(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,   // client snapshot
    () => false,  // server snapshot (and first render)
  );
}

type GreetingTranslator = (
  key:
    | "stillUp"
    | "goodMorning"
    | "goodAfternoon"
    | "goodEvening"
    | "workingLate",
) => string;

function timeOfDayGreeting(hour: number, t: GreetingTranslator): string {
  if (hour < 5) return t("stillUp");
  if (hour < 12) return t("goodMorning");
  if (hour < 18) return t("goodAfternoon");
  if (hour < 22) return t("goodEvening");
  return t("workingLate");
}

export function HomeGreeting() {
  const t = useTranslations("home.greeting");
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const now = useNow();
  const isClient = useIsClient();

  const firstName =
    user?.firstName || user?.username?.split("@")[0] || t("defaultName");
  const hour = new Date(now).getHours();
  const part = timeOfDayGreeting(hour, t);

  // ── Data sources ──
  const decisionsQuery = useQuery({
    queryKey: ["decisions-due-home"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<{ count: number; decisions: Decision[] }>(
        "/decision/due",
        () => Promise.resolve(token),
      );
    },
  });

  const goalsQuery = useQuery({
    queryKey: ["goals-home"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<{ count: number; goals: Goal[] }>(
        "/learning/goals",
        () => Promise.resolve(token),
      );
    },
  });

  const goals = goalsQuery.data?.goals ?? [];
  const activeGoal = goals.find((g) => g.status === "active") ?? goals[0];
  const goalId = activeGoal?.id;

  const planQuery = useQuery({
    queryKey: ["goal-plan-home", goalId],
    enabled: !!goalId,
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<GoalPlanResponse>(`/learning/plan/${goalId}`, () =>
        Promise.resolve(token),
      );
    },
  });

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

  const maturityQuery = useQuery({
    queryKey: ["stats-maturity"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<Maturity>("/identity/maturity", () =>
        Promise.resolve(token),
      );
    },
  });

  // ── Priority chain ──
  const dueCount = decisionsQuery.data?.count ?? 0;
  const firstDue = decisionsQuery.data?.decisions?.[0];

  let nextMilestone: Milestone | null = null;
  const plan = planQuery.data?.plan;
  if (plan?.phases) {
    for (const phase of plan.phases) {
      for (const m of phase.milestones || []) {
        if (!m.done) {
          nextMilestone = m;
          break;
        }
      }
      if (nextMilestone) break;
    }
  }

  const nodes = nodesQuery.data?.nodes ?? [];
  const totalNodes = nodesQuery.data?.count ?? nodes.length;
  const capturesToday = nodes.filter((n) => {
    const t = new Date(n.created_at).getTime();
    return t >= now - DAY_MS && t <= now;
  }).length;

  const maturityScore = maturityQuery.data?.score ?? 0;

  const loading =
    !isLoaded ||
    decisionsQuery.isLoading ||
    goalsQuery.isLoading ||
    nodesQuery.isLoading;

  // ── Build the greeting parts ──
  const headline = t("headline", { part, name: firstName });

  // We build the subtitle as a translated string with rich-text tags
  // (<b>…</b>) and mark it as raw so RichText can parse it.
  let subtitleKey:
    | "subtitleDefault"
    | "subtitleDecisionOne"
    | "subtitleDecisionMany"
    | "subtitleFocusToday"
    | "subtitleCaptureOne"
    | "subtitleCaptureMany"
    | "subtitleGraphGrowing" = "subtitleDefault";
  let subtitleValues: Record<string, string | number> = {};

  if (!loading) {
    if (dueCount > 0) {
      const q = firstDue?.question;
      if (dueCount === 1) {
        subtitleKey = "subtitleDecisionOne";
        subtitleValues = {
          question: q ? truncate(q, 60) : "",
        };
      } else {
        subtitleKey = "subtitleDecisionMany";
        subtitleValues = { count: dueCount };
      }
    } else if (nextMilestone && activeGoal) {
      subtitleKey = "subtitleFocusToday";
      subtitleValues = {
        milestone: truncate(nextMilestone.title, 60),
        goal: activeGoal.title,
      };
    } else if (capturesToday > 0) {
      if (capturesToday === 1) {
        subtitleKey = "subtitleCaptureOne";
        subtitleValues = { nodes: totalNodes };
      } else {
        subtitleKey = "subtitleCaptureMany";
        subtitleValues = { count: capturesToday, nodes: totalNodes };
      }
    } else if (maturityScore > 0 && totalNodes > 0) {
      subtitleKey = "subtitleGraphGrowing";
      subtitleValues = { nodes: totalNodes };
    }
  }

  // ── Stable placeholder for SSR + first client render ──
  if (!isClient || !isLoaded) {
    return (
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("welcomeHeadline")}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {t("welcomeSubtitle")}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">{headline}</h1>
      <p className="mt-2 text-muted-foreground">
        <RichText
          text={t.raw(subtitleKey) as string}
          values={subtitleValues}
        />
      </p>
    </div>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Renders translated strings that contain <b>…</b> emphasis tags.
 * We use a tokenizer instead of dangerouslySetInnerHTML so the content
 * stays escaped; only literal `<b>` and `</b>` are honored.
 */
function RichText({
  text,
  values,
}: {
  text: string;
  values: Record<string, string | number>;
}) {
  // Fallback: if t.rich isn't available on the typed surface, do a
  // simple {name} interpolation here.
  const interpolated = text.replace(/\{(\w+)\}/g, (_, k) =>
    String(values[k] ?? `{${k}}`),
  );

  const parts = interpolated.split(/(<b>[\s\S]*?<\/b>)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("<b>") && p.endsWith("</b>")) {
          return (
            <span key={i} className="text-foreground font-medium">
              {p.slice(3, -4)}
            </span>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}
