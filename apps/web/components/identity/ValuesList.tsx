"use client";

import { useTranslations } from "next-intl";
import { Compass } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DeltaBadge } from "./DeltaBadge";
import { useEnumLabel } from "@/lib/i18n-enums";
import type { DeltaInfo } from "@/lib/hooks/use-cortex";

type Value = {
  value: string;
  evidence: string;
  strength: string;
};

type Props = {
  values: Value[];
  deltas?: Record<string, DeltaInfo>;
  loading?: boolean;
};

function strengthStyle(strength: string): string {
  const s = strength.toLowerCase();
  if (s === "high") return "bg-primary/15 text-primary border-primary/30";
  if (s === "medium") return "bg-accent/40 text-foreground/80 border-border";
  return "bg-muted text-muted-foreground border-border";
}

export function ValuesList({ values, deltas, loading = false }: Props) {
  const t = useTranslations("identity.values");
  const enumLabel = useEnumLabel();

  return (
    <Card className="bg-card/40 border-border h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-primary/10 p-1.5">
            <Compass className="w-3.5 h-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium">{t("title")}</CardTitle>
          {values.length > 0 && (
            <span className="text-xs text-muted-foreground ml-auto">
              {values.length}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading ? (
          <>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 bg-accent/40 rounded w-1/3 animate-pulse" />
                <div className="h-2 bg-accent/30 rounded w-full animate-pulse" />
              </div>
            ))}
          </>
        ) : values.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          values.map((v, i) => {
            const delta = deltas?.[v.value.trim().toLowerCase()];
            return (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-muted-foreground tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm font-medium flex-1 truncate">
                    {v.value}
                  </span>
                  {delta && <DeltaBadge delta={delta} compact />}
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] shrink-0",
                      strengthStyle(v.strength),
                    )}
                  >
                    {enumLabel.confidence(v.strength)}
                  </Badge>
                </div>
                {v.evidence && (
                  <p className="text-[11px] text-muted-foreground leading-snug pl-6">
                    {v.evidence}
                  </p>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
