"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { Sparkles, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { cortexFetch } from "@/lib/cortex";
import type { IdentityModel } from "@/lib/hooks/use-cortex";
import { Badge } from "@/components/ui/badge";

export function IdentityBanner() {
  const t = useTranslations("home.identityBanner");
  const { getToken } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["identity-home"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<IdentityModel>("/identity/", () =>
        Promise.resolve(token),
      );
    },
  });

  // Not yet built — show a soft prompt instead
  if (!isLoading && data && !data.has_model) {
    return (
      <Link
        href="/identity"
        className="block rounded-lg border border-dashed border-border bg-card/20 p-5 hover:border-primary/40 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2">
            <UserIcon className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">{t("notBuiltTitle")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("notBuiltHint")}
            </p>
          </div>
        </div>
      </Link>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card/40 p-5 space-y-3">
        <div className="h-3 bg-accent/40 rounded w-3/4 animate-pulse" />
        <div className="h-3 bg-accent/40 rounded w-1/2 animate-pulse" />
      </div>
    );
  }

  const narrative = data?.narrative || "";
  const topValues = (data?.values || []).slice(0, 4);
  const thinkingStyle = data?.thinking_style || "";

  return (
    <div className="rounded-lg border border-border bg-gradient-to-br from-card/60 to-card/30 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2 shrink-0">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          {/* Narrative */}
          {narrative ? (
            <p className="text-sm text-foreground/90 leading-relaxed">
              {narrative}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("buildingModel")}
            </p>
          )}

          {/* Values + thinking style */}
          <div className="flex flex-wrap items-center gap-2">
            {topValues.map((v) => (
              <Badge
                key={v.value}
                variant="outline"
                className="text-[10px] gap-1"
              >
                {v.value}
                <span className="text-muted-foreground">
                  {v.strength}
                </span>
              </Badge>
            ))}
          </div>

          {thinkingStyle && (
            <p className="text-[11px] text-muted-foreground italic">
              {t("thinkingStyle", { style: thinkingStyle })}
            </p>
          )}

          <Link
            href="/identity"
            className="inline-block text-[11px] text-primary hover:underline"
          >
            {t("viewFull")}
          </Link>
        </div>
      </div>
    </div>
  );
}
