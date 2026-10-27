"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  GraduationCap,
  Loader2,
  CheckCircle2,
  Sparkles,
  Target,
  AlertTriangle,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useGoalPlan,
  useToggleMilestone,
  countMilestones,
  currentPhaseIndex,
  type LearningPhase,
} from "@/lib/hooks/use-learning";
import { MilestoneRow } from "./MilestoneRow";
import { toast } from "sonner";

type Props = {
  goalId: string;
  onBack: () => void;
};

type Tab = "plan" | "knowledge";

export function GoalDetail({ goalId, onBack }: Props) {
  const t = useTranslations("learning.detail");
  const { data, isLoading, isError, error } = useGoalPlan(goalId);
  const toggle = useToggleMilestone(goalId);
  const [tab, setTab] = useState<Tab>("plan");

  const stats = useMemo(() => countMilestones(data?.plan), [data?.plan]);
  const phaseIndex = useMemo(
    () => currentPhaseIndex(data?.plan),
    [data?.plan],
  );

  const plan = data?.plan;
  const phases: LearningPhase[] = plan?.phases ?? [];
  const skills = plan?.skills ?? [];
  const gaps = plan?.gaps ?? [];
  const strengths = plan?.strengths ?? [];

  const pendingKey =
    toggle.isPending && toggle.variables
      ? `${toggle.variables.phaseIndex}:${toggle.variables.milestoneIndex}`
      : null;

  const handleToggle = async (
    p: number,
    m: number,
    currentlyDone: boolean,
  ) => {
    try {
      await toggle.mutateAsync({
        phaseIndex: p,
        milestoneIndex: m,
        done: !currentlyDone,
      });
      const nextDone = stats.done + (currentlyDone ? -1 : 1);
      if (nextDone === stats.total && stats.total > 0) {
        toast.success(t("goalCompleteTitle"), {
          description: t("goalCompleteDescription"),
        });
      }
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : t("saveRejectedFallback");
      toast.error(t("saveFailedTitle"), { description: msg });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 space-y-4">
        <div className="h-4 w-24 bg-accent/30 rounded animate-pulse" />
        <div className="h-8 w-2/3 bg-accent/40 rounded animate-pulse" />
        <div className="h-3 w-full bg-accent/20 rounded animate-pulse" />
        <div className="h-3 w-5/6 bg-accent/20 rounded animate-pulse" />
        <div className="pt-4 space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-lg bg-accent/20 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
        <button
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          {t("backToGoals")}
        </button>
        <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-destructive">
          {error instanceof Error ? error.message : t("loadFailed")}
        </div>
      </div>
    );
  }

  const goal = data.goal;
  const isComplete = stats.total > 0 && stats.done === stats.total;

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-5">
      {/* Back */}
      <button
        onClick={onBack}
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
      >
        <ArrowLeft className="w-3 h-3" />
        {t("backToGoals")}
      </button>

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2 shrink-0">
          <GraduationCap className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {goal.title}
          </h1>
          {plan?.summary && (
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              {plan.summary}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] gap-1",
                isComplete
                  ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                  : "border-primary/40 text-primary",
              )}
            >
              {isComplete ? (
                <>
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  {t("statusCompleted")}
                </>
              ) : (
                <>
                  <GraduationCap className="w-2.5 h-2.5" />
                  {t("statusActive")}
                </>
              )}
            </Badge>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {t("progressSummary", {
                done: stats.done,
                total: stats.total,
                pct: stats.pct,
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Top progress bar — visible now */}
      {stats.total > 0 && (
        <div className="space-y-1.5">
          <div className="relative h-2 rounded-full bg-foreground/10 border border-border/60 overflow-hidden">
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-[width] duration-500",
                isComplete ? "bg-emerald-500/80" : "bg-primary/80",
              )}
              style={{ width: `${stats.pct}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-between px-1 pointer-events-none opacity-40">
              {[0, 25, 50, 75, 100].map((tick) => (
                <span
                  key={tick}
                  className="w-px h-1.5 bg-foreground/30 first:opacity-0 last:opacity-0"
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* First action banner */}
      {plan?.first_action && !isComplete && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3.5 flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-1.5 shrink-0 mt-0.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-primary/80 font-medium">
              {t("firstActionLabel")}
            </p>
            <p className="text-sm mt-1 leading-relaxed">{plan.first_action}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border/60">
        <TabButton active={tab === "plan"} onClick={() => setTab("plan")}>
          {t("tabPlan")}
        </TabButton>
        <TabButton
          active={tab === "knowledge"}
          onClick={() => setTab("knowledge")}
        >
          {t("tabKnowledge")}
        </TabButton>
      </div>

      {tab === "plan" && (
        <div className="space-y-4">
          {phases.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card/20 px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                {t("noPhases")}
              </p>
            </div>
          ) : (
            phases.map((phase, pIdx) => {
              const ms = phase.milestones ?? [];
              const done = ms.filter((m) => m.done).length;
              const total = ms.length;
              const pct = total === 0 ? 0 : Math.round((done / total) * 100);
              const isCurrent = pIdx === phaseIndex && !isComplete;

              return (
                <div
                  key={pIdx}
                  className={cn(
                    "rounded-lg border bg-card/40 overflow-hidden transition-colors",
                    isCurrent ? "border-primary/40" : "border-border",
                  )}
                >
                  <div className="px-4 py-3 border-b border-border/60 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {phase.phase}
                        </p>
                        {isCurrent && (
                          <span className="text-[10px] text-primary border border-primary/40 rounded-full px-1.5 py-0.5 shrink-0">
                            {t("currentBadge")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground tabular-nums">
                        {typeof phase.duration_weeks === "number" && (
                          <>
                            <span>
                              {t("weeksCount", { count: phase.duration_weeks })}
                            </span>
                            <span className="text-muted-foreground/40">·</span>
                          </>
                        )}
                        <span>
                          {t("milestoneProgress", {
                            done,
                            total,
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="w-24 shrink-0 mt-1">
                      <div className="relative h-2 rounded-full bg-foreground/10 border border-border/60 overflow-hidden">
                        <div
                          className={cn(
                            "absolute inset-y-0 left-0 rounded-full transition-[width] duration-500",
                            pct === 100
                              ? "bg-emerald-500/80"
                              : "bg-primary/70",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-1.5">
                    {ms.map((m, mIdx) => {
                      const isRowPending =
                        pendingKey === `${pIdx}:${mIdx}`;
                      return (
                        <div
                          key={mIdx}
                          className={cn(
                            "relative transition-opacity",
                            isRowPending && "opacity-60",
                          )}
                        >
                          <MilestoneRow
                            milestone={m}
                            done={!!m.done}
                            onToggle={() =>
                              handleToggle(pIdx, mIdx, !!m.done)
                            }
                          />
                          {isRowPending && (
                            <Loader2 className="absolute right-3 top-2.5 w-3.5 h-3.5 text-primary animate-spin pointer-events-none" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === "knowledge" && (
        <div className="space-y-4">
          {skills.length > 0 && (
            <Section
              icon={Target}
              title={t("skillsToBuild")}
              items={skills.map((s) => ({
                key: s.name,
                primary: s.name,
                secondary: `${s.level} · ${s.why}`,
              }))}
            />
          )}
          {gaps.length > 0 && (
            <Section
              icon={AlertTriangle}
              title={t("gapsTitle")}
              items={gaps.map((g, i) => ({ key: `g-${i}`, primary: g }))}
              tone="amber"
            />
          )}
          {strengths.length > 0 && (
            <Section
              icon={TrendingUp}
              title={t("strengthsTitle")}
              items={strengths.map((s, i) => ({ key: `s-${i}`, primary: s }))}
              tone="emerald"
            />
          )}
          {skills.length === 0 &&
            gaps.length === 0 &&
            strengths.length === 0 && (
              <div className="rounded-lg border border-dashed border-border bg-card/20 px-6 py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  {t("noKnowledge")}
                </p>
              </div>
            )}

          <p className="text-[10px] text-muted-foreground text-center pt-2">
            <Link
              href="/memory"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              {t("searchMemory")}
              <ChevronRight className="w-3 h-3" />
            </Link>
          </p>
        </div>
      )}

      {/* Floating saving pill */}
      {toggle.isPending && (
        <div className="fixed bottom-6 right-6 z-40 rounded-full bg-card border border-border shadow-lg px-3 py-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin text-primary" />
          {t("saving")}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Section({
  icon: Icon,
  title,
  items,
  tone = "primary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: Array<{ key: string; primary: string; secondary?: string }>;
  tone?: "primary" | "amber" | "emerald";
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : tone === "emerald"
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : "bg-primary/10 text-primary";

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className={cn("rounded-md p-1.5 shrink-0", toneClass)}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <p className="text-sm font-medium">{title}</p>
      </div>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.key} className="text-sm">
            <p className="font-medium leading-snug">{it.primary}</p>
            {it.secondary && (
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                {it.secondary}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
