"use client";

import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Props = {
  narrative: string;
  thinkingStyle: string;
  hasModel: boolean;
  lastRebuiltAt: string | null;
};

type TimeTranslator = (
  key: "justNow" | "minutesAgo" | "hoursAgo" | "daysAgo",
  values?: Record<string, string | number>,
) => string;

function timeAgo(iso: string, t: TimeTranslator): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return t("justNow");
  if (diff < 3600) return t("minutesAgo", { count: Math.floor(diff / 60) });
  if (diff < 86400) return t("hoursAgo", { count: Math.floor(diff / 3600) });
  if (diff < 604800) return t("daysAgo", { count: Math.floor(diff / 86400) });
  return new Date(iso).toLocaleDateString();
}

export function IdentityNarrative({
  narrative,
  thinkingStyle,
  hasModel,
  lastRebuiltAt,
}: Props) {
  const t = useTranslations("identity.narrative");

  if (!hasModel || !narrative) {
    return (
      <Card className="bg-card/40 border-dashed border-border">
        <CardContent className="py-6">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-primary/10 p-2 shrink-0">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("notBuiltTitle")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("notBuiltHint")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-card/60 to-card/20 border-border overflow-hidden">
      <CardContent className="pt-6 pb-6">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-base leading-relaxed text-foreground/95">
              {narrative}
            </p>

            {thinkingStyle && (
              <p className="text-xs text-muted-foreground italic">
                {t("thinkingStyle", { style: thinkingStyle })}
              </p>
            )}

            {lastRebuiltAt && (
              <Badge variant="outline" className="text-[10px] font-normal">
                {t("lastRebuilt", { time: timeAgo(lastRebuiltAt, t) })}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
