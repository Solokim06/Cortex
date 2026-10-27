"use client";

import { GoalCard } from "./GoalCard";
import { useGoalPlan, countMilestones } from "@/lib/hooks/use-learning";
import type { LearningGoal } from "@/lib/hooks/use-learning";

type Props = {
  goal: LearningGoal;
  highlighted?: boolean;
  onOpen: () => void;
};

export function GoalCardWithProgress({
  goal,
  highlighted = false,
  onOpen,
}: Props) {
  const { data } = useGoalPlan(goal.id);
  const stats = countMilestones(data?.plan);

  const hasPlan = !!data && stats.total > 0;

  return (
    <GoalCard
      goal={goal}
      highlighted={highlighted}
      onOpen={onOpen}
      progressPct={hasPlan ? stats.pct : undefined}
      doneCount={hasPlan ? stats.done : undefined}
      totalCount={hasPlan ? stats.total : undefined}
    />
  );
}
