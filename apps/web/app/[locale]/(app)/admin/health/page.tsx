"use client";

import { useTranslations } from "next-intl";

import {
  Activity,
  RefreshCw,
  Loader2,
  Clock,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { timeAgo } from "@/components/admin/TicketBadges";
import { useQueryClient } from "@tanstack/react-query";
import { SystemProbes } from "@/components/admin/health/SystemProbes";
import { DataHealthPanel } from "@/components/admin/health/DataHealthPanel";
import { DiagnosticsPanel } from "@/components/admin/health/DiagnosticsPanel";
import { RecentFailuresPanel } from "@/components/admin/health/RecentFailuresPanel";
import {
  useDetailedHealth,
  isError,
} from "@/lib/hooks/use-admin-health";

export default function HealthPage() {
  const t = useTranslations("admin.health");
  const tTickets = useTranslations("admin.tickets");
  const query = useDetailedHealth();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ["admin-health-detailed"] });
    setRefreshing(false);
    toast.success(t("refresh_toast"));
  };

  if (query.isLoading && !query.data) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="px-5 py-8 max-w-6xl mx-auto">
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 px-4 py-3 text-sm text-rose-500">
          <AlertCircle className="w-4 h-4 inline mr-2" />
          {t("load_error")}
          {query.error instanceof Error && (
            <p className="text-xs mt-1 opacity-80">{query.error.message}</p>
          )}
        </div>
      </div>
    );
  }

  const data = query.data;

  // Narrow the union with an inline check so TypeScript knows
  // `data.probes` is either the healthy shape or the error shape.
  const probes = data.probes;
  const components = isError(probes) ? [] : probes.components;
  const overall = isError(probes) ? "unknown" : probes.overall;

  return (
    <div className="px-5 py-5 max-w-6xl space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-primary/10 p-1.5">
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <h1 className="text-base font-semibold tracking-tight">
              {t("title")}
            </h1>
          </div>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
            <Clock className="w-3 h-3" />
            <span className="tabular-nums">
              {t("updated_at", { when: timeAgo(data.generated_at, tTickets) })}
            </span>
            <span className="opacity-40">·</span>
            <span>{t("auto_refresh")}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
            <ShieldCheck className="w-3 h-3" />
            {t("admin_only")}
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px]",
              "border border-border bg-background hover:bg-accent/40 transition-colors",
              "disabled:opacity-40 disabled:pointer-events-none",
            )}
          >
            <RefreshCw
              className={cn("w-3 h-3", refreshing && "animate-spin")}
            />
            {t("refresh")}
          </button>
        </div>
      </div>

      {/* Probes — full width */}
      <SystemProbes
        overall={overall}
        components={components}
        loading={query.isFetching && !query.data}
      />

      {/* Two-column grid: Data health (left) + Diagnostics (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <DataHealthPanel data={data.data_health} />
        <DiagnosticsPanel
          pubsub={data.pubsub}
          sla={data.sla}
          env={data.env}
        />
      </div>

      {/* Recent failures — full width */}
      <RecentFailuresPanel failures={data.recent_failures} />

      {/* Footer note */}
      <p className="text-[10px] text-muted-foreground text-center pt-2">
        Detailed diagnostics update every 30 seconds. The public status page is
        at{" "}
        <a
          href="/status"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          /status
        </a>
        .
      </p>
    </div>
  );
}

// =====================================================================
// helpers
// =====================================================================

