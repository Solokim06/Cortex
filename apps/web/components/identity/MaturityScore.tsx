"use client";

import { useTranslations } from "next-intl";
import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIdentityMaturity } from "@/lib/hooks/use-cortex";
import { useEnumLabel } from "@/lib/i18n-enums";
import { cn } from "@/lib/utils";

function scoreColor(score: number): string {
  if (score <= 20) return "text-muted-foreground";
  if (score <= 40) return "text-info";
  if (score <= 60) return "text-primary";
  if (score <= 80) return "text-success";
  return "text-warning";
}

function barColor(score: number): string {
  if (score <= 20) return "bg-muted-foreground";
  if (score <= 40) return "bg-info";
  if (score <= 60) return "bg-primary";
  if (score <= 80) return "bg-success";
  return "bg-warning";
}

export function MaturityScore() {
  const t = useTranslations("identity.maturity");
  const enumLabel = useEnumLabel();
  const { data, isLoading } = useIdentityMaturity();

  const score = data?.score ?? 0;
  const tierRaw = data?.tier ?? "—";
  const tierLabel = tierRaw === "—" ? tierRaw : enumLabel.tier(tierRaw);
  const narrative = data?.narrative ?? "";
  const breakdown = data?.breakdown;

  return (
    <Card className="bg-card/40 border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-primary/10 p-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium">
            {t("title")}
          </CardTitle>
          {tierRaw !== "—" && (
            <span className="text-xs text-muted-foreground ml-auto">
              {tierLabel}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-16 bg-accent/40 rounded animate-pulse" />
            <div className="h-2 bg-accent/30 rounded animate-pulse" />
            <div className="h-4 bg-accent/30 rounded w-3/4 animate-pulse" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Big score */}
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  "text-5xl font-semibold tabular-nums tracking-tight",
                  scoreColor(score),
                )}
              >
                {score}
              </span>
              <span className="text-sm text-muted-foreground">
                {t("outOfHundred")}
              </span>
              <span
                className={cn(
                  "ml-auto text-xs font-medium px-2 py-1 rounded-md bg-accent/40",
                  scoreColor(score),
                )}
              >
                {tierLabel}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 w-full bg-accent/40 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-500",
                  barColor(score),
                )}
                style={{ width: `${score}%` }}
              />
            </div>

            {/* Narrative */}
            {narrative && (
              <p className="text-xs text-muted-foreground leading-snug">
                {narrative}
              </p>
            )}

            {/* Breakdown */}
            {breakdown && (
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/60">
                <Stat label={t("statNodes")} value={breakdown.nodes} />
                <Stat label={t("statConcepts")} value={breakdown.concepts} />
                <Stat label={t("statGoals")} value={breakdown.goals} />
                <Stat label={t("statDecisions")} value={breakdown.decisions} />
                <Stat
                  label={t("statReflections")}
                  value={breakdown.reflections}
                />
                <Stat label={t("statSnapshots")} value={breakdown.snapshots} />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-xs font-medium tabular-nums">{value}</p>
    </div>
  );
}
