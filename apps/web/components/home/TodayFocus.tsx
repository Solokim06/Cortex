"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { GraduationCap, CheckCircle2, Circle } from "lucide-react";
import { cortexFetch } from "@/lib/cortex";
import { BriefingCard } from "./BriefingCard";

type Goal = {
  id: string;
  title: string;
  status: string;
  summary: string;
  created_at: string;
};

type Milestone = {
  title: string;
  actions: string[];
  done?: boolean;
};

type Phase = {
  phase: string;
  duration_weeks?: number;
  milestones: Milestone[];
};

type PlanData = {
  phases?: Phase[];
  first_action?: string;
  summary?: string;
};

type GoalPlanResponse = {
  goal: { id: string; title: string; status: string };
  plan: PlanData;
  plan_status: string;
};

export function TodayFocus() {
  const t = useTranslations("home.todayFocus");
  const { getToken } = useAuth();

  // Step 1 — find the most recent active goal
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

  // Step 2 — fetch that goal's plan
  const planQuery = useQuery({
    queryKey: ["goal-plan-home", goalId],
    enabled: !!goalId,
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<GoalPlanResponse>(
        `/learning/plan/${goalId}`,
        () => Promise.resolve(token),
      );
    },
  });

  // Find the first un-done milestone across phases
  const plan = planQuery.data?.plan;
  let nextMilestone: Milestone | null = null;
  let nextPhaseName = "";
  if (plan?.phases) {
    for (const phase of plan.phases) {
      for (const m of phase.milestones || []) {
        if (!m.done) {
          nextMilestone = m;
          nextPhaseName = phase.phase;
          break;
        }
      }
      if (nextMilestone) break;
    }
  }

  const loading = goalsQuery.isLoading || planQuery.isLoading;

  return (
    <BriefingCard
      icon={GraduationCap}
      title={t("title")}
      subtitle={activeGoal?.title}
      href={goalId ? `/learning` : "/learning"}
      linkLabel={activeGoal ? t("openPlan") : t("setGoal")}
      loading={loading}
      empty={t("empty")}
    >
      {nextMilestone ? (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {nextPhaseName}
          </p>
          <p className="text-xs font-medium">{nextMilestone.title}</p>
          {nextMilestone.actions.length > 0 && (
            <ul className="space-y-1 mt-1.5">
              {nextMilestone.actions.slice(0, 2).map((a, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px]">
                  <Circle className="w-2.5 h-2.5 text-muted-foreground mt-1 shrink-0" />
                  <span className="text-muted-foreground line-clamp-2">
                    {a}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : plan?.first_action ? (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("firstAction")}
          </p>
          <p className="text-xs">{plan.first_action}</p>
        </div>
      ) : activeGoal ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="w-3.5 h-3.5 text-success" />
          <span>{t("allComplete")}</span>
        </div>
      ) : null}
    </BriefingCard>
  );
}
