"use client";

import { useTranslations } from "next-intl";

import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Loader2,
} from "lucide-react";
import { cn } from "cn";
import type { HealthComponent, HealthStatus } from "@/lib/hooks/use-admin-health";

// =====================================================================
// config
// =====================================================================

const LEVEL_META: Record<
  HealthStatus,
  { icon: typeof CheckCircle2; tone: string; labelKey: string }
> = {
  operational: {
    icon: CheckCircle2,
    tone: "text-emerald-500",
    labelKey: "status_operational",
  },
  degraded: {
    icon: AlertTriangle,
    tone: "text-amber-500",
    labelKey: "status_degraded",
  },
  down: {
    icon: XCircle,
    tone: "text-rose-500",
    labelKey: "status_down",
  },
  unknown: {
    icon: HelpCircle,
    tone: "text-muted-foreground",
    labelKey: "status_unknown",
  },
};

// =====================================================================
// component
// =====================================================================

type Props = {
  overall: HealthStatus;
  components: HealthComponent[] | null;
  loading?: boolean;
};

export function SystemProbes({ overall, components, loading }: Props) {
  const t = useTranslations("admin.health");
  const overallMeta = LEVEL_META[overall];
  const OverallIcon = overallMeta.icon;

  return (
    <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <div
          className={cn(
            "rounded-md p-1.5 bg-muted/40",
            overallMeta.tone,
          )}
        >
          <OverallIcon className="w-3.5 h-3.5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">{t("probes_title")}</h3>
          <p className="text-[10px] text-muted-foreground">
            {t("probes_subtitle")}
          </p>
        </div>
        <span
          className={cn(
            "text-[10px] uppercase tracking-wider rounded-full border px-2 py-0.5",
            overallMeta.tone,
            "border-current/30 bg-current/5",
          )}
        >
          {t(overallMeta.labelKey as Parameters<typeof t>[0])}
        </span>
      </div>

      {/* Loading */}
      {loading && !components && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-4 py-6">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t("probes_loading")}
        </div>
      )}

      {/* Components */}
      {components && components.length > 0 && (
        <ul className="divide-y divide-border/40">
          {components.map((c) => (
            <ComponentRow key={c.key} component={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

// =====================================================================
// row
// =====================================================================

function ComponentRow({ component }: { component: HealthComponent }) {
  const t = useTranslations("admin.health");
  const meta = LEVEL_META[component.status];
  const Icon = meta.icon;

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div
        className={cn(
          "shrink-0 w-6 h-6 rounded-md bg-muted/40 flex items-center justify-center mt-0.5",
          meta.tone,
        )}
      >
        <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{component.label}</span>
          {component.provider && (
            <span className="text-[10px] uppercase tracking-wider rounded border border-border px-1.5 py-0.5 text-muted-foreground">
              {component.provider}
            </span>
          )}
          <span className={cn("text-[11px]", meta.tone)}>
            {t(meta.labelKey as Parameters<typeof t>[0])}
          </span>
        </div>
        {component.detail && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed break-words">
            {component.detail}
          </p>
        )}
      </div>

      {component.latency_ms !== null && (
        <div className="shrink-0 text-right ml-2">
          <p className="text-xs font-medium tabular-nums">
            {component.latency_ms}
            <span className="text-[10px] text-muted-foreground ml-0.5">
              ms
            </span>
          </p>
        </div>
      )}
    </li>
  );
}
