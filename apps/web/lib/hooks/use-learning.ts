"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cortexFetch } from "@/lib/cortex";

// ---------- Types ----------

export type GoalStatus = "active" | "paused" | "completed" | "archived";

export type LearningGoal = {
  id: string;
  title: string;
  status: GoalStatus;
  summary: string;
  description?: string;
  created_at: string;
};

export type LearningSkill = {
  name: string;
  level: "beginner" | "intermediate" | "advanced" | string;
  why: string;
};

export type LearningMilestone = {
  title: string;
  actions: string[];
  done?: boolean;
  notes?: string;
};

export type LearningPhase = {
  phase: string;
  duration_weeks?: number;
  milestones: LearningMilestone[];
};

export type LearningPlanData = {
  summary?: string;
  skills?: LearningSkill[];
  gaps?: string[];
  strengths?: string[];
  phases?: LearningPhase[];
  first_action?: string;
};

export type LearningPlanResponse = {
  goal: {
    id: string;
    title: string;
    status: GoalStatus;
    description?: string;
    summary?: string;
  };
  plan: LearningPlanData;
  plan_status: string;
};

export type CreateGoalResponse = {
  goal: {
    id: string;
    title: string;
    description?: string;
    status: GoalStatus;
    summary: string;
    created_at: string;
  };
  plan: LearningPlanData;
};

// ---------- Hooks ----------

export function useGoalsList(limit = 100) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["learning-goals", limit],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<{ count: number; goals: LearningGoal[] }>(
        `/learning/goals?limit=${limit}`,
        () => Promise.resolve(token),
      );
    },
  });
}

export function useGoalPlan(goalId: string | null) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["learning-plan", goalId],
    enabled: !!goalId,
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<LearningPlanResponse>(
        `/learning/plan/${goalId}`,
        () => Promise.resolve(token),
      );
    },
  });
}

export function useCreateGoal() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { title: string; description?: string }) => {
      const token = await getToken();
      return cortexFetch<CreateGoalResponse>(
        "/learning/goal",
        () => Promise.resolve(token),
        {
          method: "POST",
          body: {
            title: payload.title,
            description: payload.description ?? "",
          },
        },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["learning-goals"] });
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["goals-home"] });
    },
  });
}

/**
 * Toggle a milestone's done state with an optimistic update.
 *
 * - The local cache is flipped BEFORE the request goes out, so the checkbox
 *   responds instantly even on a slow connection.
 * - On error, we roll back to the previous snapshot.
 * - On success, we replace with the authoritative server plan.
 */
export function useToggleMilestone(goalId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      phaseIndex: number;
      milestoneIndex: number;
      done: boolean;
    }) => {
      const token = await getToken();
      return cortexFetch<{
        goal_id: string;
        plan_status: string;
        plan: LearningPlanData;
      }>(`/learning/progress/${goalId}`, () => Promise.resolve(token), {
        method: "POST",
        body: {
          phase_index: payload.phaseIndex,
          milestone_index: payload.milestoneIndex,
          done: payload.done,
        },
      });
    },

    // Optimistic update — flip the checkbox immediately
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["learning-plan", goalId] });
      const previous = qc.getQueryData<LearningPlanResponse>([
        "learning-plan",
        goalId,
      ]);

      if (previous) {
        const next: LearningPlanResponse = {
          ...previous,
          plan: clonePlanWithToggle(
            previous.plan,
            vars.phaseIndex,
            vars.milestoneIndex,
            vars.done,
          ),
        };
        qc.setQueryData(["learning-plan", goalId], next);
      }

      return { previous };
    },

    // Roll back on error
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(["learning-plan", goalId], ctx.previous);
      }
    },

    // Reconcile with server response
    onSuccess: (data) => {
      qc.setQueryData<LearningPlanResponse | undefined>(
        ["learning-plan", goalId],
        (prev) =>
          prev
            ? { ...prev, plan: data.plan, plan_status: data.plan_status }
            : prev,
      );
      qc.invalidateQueries({ queryKey: ["learning-goals"] });
      qc.invalidateQueries({ queryKey: ["goals-home"] });
    },
  });
}

// ---------- Optimistic helper ----------

function clonePlanWithToggle(
  plan: LearningPlanData,
  phaseIndex: number,
  milestoneIndex: number,
  done: boolean,
): LearningPlanData {
  const phases = (plan.phases ?? []).map((phase, pIdx) => {
    if (pIdx !== phaseIndex) return phase;
    return {
      ...phase,
      milestones: (phase.milestones ?? []).map((m, mIdx) => {
        if (mIdx !== milestoneIndex) return m;
        return { ...m, done };
      }),
    };
  });
  return { ...plan, phases };
}

// ---------- Derived helpers ----------

export function countMilestones(plan: LearningPlanData | undefined): {
  done: number;
  total: number;
  pct: number;
} {
  const phases = plan?.phases ?? [];
  let done = 0;
  let total = 0;
  for (const phase of phases) {
    for (const m of phase.milestones ?? []) {
      total += 1;
      if (m.done) done += 1;
    }
  }
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, pct };
}

export function currentPhaseIndex(plan: LearningPlanData | undefined): number {
  const phases = plan?.phases ?? [];
  for (let i = 0; i < phases.length; i++) {
    const m = phases[i].milestones ?? [];
    if (m.some((x) => !x.done)) return i;
  }
  return Math.max(0, phases.length - 1);
}

export function nextMilestone(
  plan: LearningPlanData | undefined,
): {
  phaseIndex: number;
  milestoneIndex: number;
  milestone: LearningMilestone;
} | null {
  const phases = plan?.phases ?? [];
  for (let p = 0; p < phases.length; p++) {
    const ms = phases[p].milestones ?? [];
    for (let m = 0; m < ms.length; m++) {
      if (!ms[m].done)
        return { phaseIndex: p, milestoneIndex: m, milestone: ms[m] };
    }
  }
  return null;
}
