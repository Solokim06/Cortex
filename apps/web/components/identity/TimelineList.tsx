"use client";

import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIdentityMilestones } from "@/lib/hooks/use-cortex";
import { MilestoneCard } from "./MilestoneCard";

export function TimelineList() {
  const t = useTranslations("identity.timeline");
  const milestonesQuery = useIdentityMilestones(10);
  const milestones = milestonesQuery.data?.milestones ?? [];
  const loading = milestonesQuery.isLoading;

  return (
    <Card className="bg-card/40 border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-primary/10 p-1.5">
            <Clock className="w-3.5 h-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium">{t("title")}</CardTitle>
          {milestones.length > 0 && (
            <span className="text-xs text-muted-foreground ml-auto">
              {t("milestoneCount", { count: milestones.length })}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading ? (
          <>
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-24 bg-accent/20 border border-border rounded-lg animate-pulse"
              />
            ))}
          </>
        ) : milestones.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          milestones.map((m, i) => (
            <MilestoneCard key={m.id} milestone={m} isLatest={i === 0} />
          ))
        )}
      </CardContent>
    </Card>
  );
}
