"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Repeat, Star, AlertTriangle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DeltaBadge } from "./DeltaBadge";
import { ConfidenceBar } from "./ConfidenceBar";
import type { DeltaInfo } from "@/lib/hooks/use-cortex";

type Pattern = {
  pattern: string;
  description: string;
  evidence: string;
};

type Strength = {
  strength: string;
  evidence: string;
};

type BlindSpot = {
  spot: string;
  evidence: string;
};

type GrowthArea = {
  area: string;
  reason: string;
};

type Props = {
  patterns: Pattern[];
  strengths: Strength[];
  blindSpots: BlindSpot[];
  growthAreas: GrowthArea[];
  deltas?: {
    patterns?: Record<string, DeltaInfo>;
    strengths?: Record<string, DeltaInfo>;
    blind_spots?: Record<string, DeltaInfo>;
  };
  loading?: boolean;
};

type Tab = "patterns" | "strengths" | "blind_spots" | "growth";

type TabSpec = {
  id: Tab;
  labelKey: "tabPatterns" | "tabStrengths" | "tabBlindSpots" | "tabGrowth";
  emptyKey: "emptyPatterns" | "emptyStrengths" | "emptyBlindSpots" | "emptyGrowth";
  icon: React.ComponentType<{ className?: string }>;
};

const TABS: TabSpec[] = [
  {
    id: "patterns",
    labelKey: "tabPatterns",
    emptyKey: "emptyPatterns",
    icon: Repeat,
  },
  {
    id: "strengths",
    labelKey: "tabStrengths",
    emptyKey: "emptyStrengths",
    icon: Star,
  },
  {
    id: "blind_spots",
    labelKey: "tabBlindSpots",
    emptyKey: "emptyBlindSpots",
    icon: AlertTriangle,
  },
  {
    id: "growth",
    labelKey: "tabGrowth",
    emptyKey: "emptyGrowth",
    icon: TrendingUp,
  },
];

export function PatternsList({
  patterns,
  strengths,
  blindSpots,
  growthAreas,
  deltas,
  loading = false,
}: Props) {
  const t = useTranslations("identity.patterns");
  const [active, setActive] = useState<Tab>("patterns");

  const counts: Record<Tab, number> = {
    patterns: patterns.length,
    strengths: strengths.length,
    blind_spots: blindSpots.length,
    growth: growthAreas.length,
  };

  return (
    <Card className="bg-card/40 border-border h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium">{t("title")}</CardTitle>
          <div className="flex items-center gap-1 flex-wrap">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = active === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActive(tab.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors",
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {t(tab.labelKey)}
                  {counts[tab.id] > 0 && (
                    <span
                      className={cn(
                        "text-[10px] tabular-nums",
                        isActive
                          ? "text-primary/80"
                          : "text-muted-foreground",
                      )}
                    >
                      {counts[tab.id]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 bg-accent/40 rounded w-1/2 animate-pulse" />
                <div className="h-2 bg-accent/30 rounded w-full animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <ActiveList
            tab={active}
            patterns={patterns}
            strengths={strengths}
            blindSpots={blindSpots}
            growthAreas={growthAreas}
            deltas={deltas}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ActiveList({
  tab,
  patterns,
  strengths,
  blindSpots,
  growthAreas,
  deltas,
}: {
  tab: Tab;
  patterns: Pattern[];
  strengths: Strength[];
  blindSpots: BlindSpot[];
  growthAreas: GrowthArea[];
  deltas?: {
    patterns?: Record<string, DeltaInfo>;
    strengths?: Record<string, DeltaInfo>;
    blind_spots?: Record<string, DeltaInfo>;
  };
}) {
  const t = useTranslations("identity.patterns");
  const activeTab = TABS.find((tabSpec) => tabSpec.id === tab)!;

  if (
    (tab === "patterns" && patterns.length === 0) ||
    (tab === "strengths" && strengths.length === 0) ||
    (tab === "blind_spots" && blindSpots.length === 0) ||
    (tab === "growth" && growthAreas.length === 0)
  ) {
    return (
      <p className="text-xs text-muted-foreground">{t(activeTab.emptyKey)}</p>
    );
  }

  if (tab === "patterns") {
    return (
      <div className="space-y-4">
        {patterns.map((p, i) => {
          const delta = deltas?.patterns?.[p.pattern.trim().toLowerCase()];
          const appearances = delta?.appearances ?? 1;
          return (
            <div key={i} className="space-y-1.5">
              <div className="flex items-start gap-2 flex-wrap">
                <p className="text-sm font-medium flex-1 min-w-0">
                  {p.pattern}
                </p>
                {delta && <DeltaBadge delta={delta} compact />}
              </div>
              {p.description && (
                <p className="text-xs text-foreground/80 leading-snug">
                  {p.description}
                </p>
              )}
              {p.evidence && (
                <p className="text-[11px] text-muted-foreground leading-snug italic">
                  {p.evidence}
                </p>
              )}
              <ConfidenceBar appearances={appearances} />
            </div>
          );
        })}
      </div>
    );
  }

  if (tab === "strengths") {
    return (
      <div className="space-y-3">
        {strengths.map((s, i) => {
          const delta = deltas?.strengths?.[s.strength.trim().toLowerCase()];
          return (
            <div key={i} className="space-y-1">
              <div className="flex items-start gap-2 flex-wrap">
                <p className="text-sm font-medium flex-1 min-w-0">
                  {s.strength}
                </p>
                {delta && <DeltaBadge delta={delta} compact />}
              </div>
              {s.evidence && (
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {s.evidence}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (tab === "blind_spots") {
    return (
      <div className="space-y-3">
        {blindSpots.map((b, i) => {
          const delta = deltas?.blind_spots?.[b.spot.trim().toLowerCase()];
          return (
            <div key={i} className="space-y-1">
              <div className="flex items-start gap-2 flex-wrap">
                <p className="text-sm font-medium flex-1 min-w-0">{b.spot}</p>
                {delta && <DeltaBadge delta={delta} compact />}
              </div>
              {b.evidence && (
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {b.evidence}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // growth
  return (
    <div className="space-y-3">
      {growthAreas.map((g, i) => (
        <div key={i} className="space-y-1">
          <p className="text-sm font-medium">{g.area}</p>
          {g.reason && (
            <p className="text-[11px] text-muted-foreground leading-snug">
              {g.reason}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
