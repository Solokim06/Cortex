"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import {
  Clock,
  Loader2,
  Save,
  RotateCw,
  Flame,
  AlertCircle,
  Minus,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import {
  useSlaPolicies,
  useTriggerSlaScan,
  useUpdateSlaPolicy,
} from "@/lib/hooks/use-admin-sla";
import type { SlaPolicy, TicketPriority } from "@/lib/admin-api";

// =====================================================================
// page
// =====================================================================

export default function SlaSettingsPage() {
  const t = useTranslations("admin.settings.sla");
  const policiesQuery = useSlaPolicies();
  const scanMutation = useTriggerSlaScan();

  const handleScanNow = () => {
    scanMutation.mutate(undefined, {
      onSuccess: (data) => {
        toast.success(
          t("scan_success", { scanned: data.scanned, alerted: data.alerted }),
        );
      },
      onError: () => toast.error("Scan failed"),
    });
  };

  return (
    <div className="px-5 py-5 max-w-3xl">
      {/* Intro */}
      <div className="mb-6">
        <div className="flex items-start gap-2 mb-3">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              {t("intro_1_before")}
              <strong className="text-foreground">{t("intro_1_bold")}</strong>
              {t("intro_1_after")}
            </p>
            <p>
              {t("intro_2_before")}
              <strong className="text-foreground">{t("intro_2_bold")}</strong>
              {t("intro_2_after")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleScanNow}
            disabled={scanMutation.isPending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs",
              "border border-border bg-background hover:bg-accent/50 transition-colors",
              "disabled:opacity-40 disabled:pointer-events-none",
            )}
          >
            {scanMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RotateCw className="w-3 h-3" />
            )}
            {t("run_scan")}
          </button>
          <span className="text-[10px] text-muted-foreground">
            {t("scan_hint")}
          </span>
        </div>
      </div>

      {/* Loading */}
      {policiesQuery.isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-10">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("loading")}
        </div>
      )}

      {/* Error */}
      {policiesQuery.isError && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-xs text-rose-500">
{t("load_error")}
        </div>
      )}

      {/* Policies — always render 4 rows, in priority order, even if only
          some exist in the backend. Missing ones use settings defaults
          (urgent first, low last). */}
      {policiesQuery.data && (
        <div className="space-y-2">
          {(["urgent", "high", "normal", "low"] as TicketPriority[]).map(
            (priority) => {
              const policy = policiesQuery.data.find(
                (p) => p.priority === priority,
              );
              return (
                <SlaRow
                  key={priority}
                  priority={priority}
                  policy={policy}
                />
              );
            },
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// one row = one priority
// =====================================================================

const PRIORITY_META: Record<
  TicketPriority,
  { labelKey: string; hintKey: string; icon: typeof Flame; tone: string }
> = {
  urgent: {
    labelKey: "urgent",
    hintKey: "hint_urgent",
    icon: Flame,
    tone: "text-rose-500",
  },
  high: {
    labelKey: "high",
    hintKey: "hint_high",
    icon: AlertCircle,
    tone: "text-orange-500",
  },
  normal: {
    labelKey: "normal",
    hintKey: "hint_normal",
    icon: Minus,
    tone: "text-foreground",
  },
  low: {
    labelKey: "low",
    hintKey: "hint_low",
    icon: Minus,
    tone: "text-muted-foreground",
  },
};

function SlaRow({
  priority,
  policy,
}: {
  priority: TicketPriority;
  policy: SlaPolicy | undefined;
}) {
  const t = useTranslations("admin.settings.sla");
  const tPriority = useTranslations("admin.priority");
  const meta = PRIORITY_META[priority];
  const Icon = meta.icon;

  const updateMutation = useUpdateSlaPolicy();

  // Local draft so we don't fire a request on every keystroke
  const [firstResponse, setFirstResponse] = useState(
    policy?.first_response_minutes ?? 60,
  );
  const [resolution, setResolution] = useState(
    policy?.resolution_minutes ?? 240,
  );

  const [lastSynced, setLastSynced] = useState(
    `${policy?.first_response_minutes ?? 60}:${policy?.resolution_minutes ?? 240}`,
  );
  const currentKey = `${firstResponse}:${resolution}`;
  const isDirty = currentKey !== lastSynced;

  const reset = () => {
    if (policy) {
      setFirstResponse(policy.first_response_minutes);
      setResolution(policy.resolution_minutes);
    }
  };

  const save = () => {
    if (!Number.isFinite(firstResponse) || firstResponse < 1) {
      toast.error(t("validation_first"));
      return;
    }
    if (!Number.isFinite(resolution) || resolution < 1) {
      toast.error(t("validation_resolution"));
      return;
    }

    updateMutation.mutate(
      {
        priority,
        firstResponseMinutes: firstResponse,
        resolutionMinutes: resolution,
      },
      {
        onSuccess: () => {
          toast.success(t("sla_updated", { priority: tPriority(meta.labelKey as Parameters<typeof tPriority>[0]) }));
          setLastSynced(currentKey);
        },
        onError: () => toast.error("Update failed"),
      },
    );
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card/40 px-4 py-3",
        isDirty && "border-primary/40 bg-primary/[0.02]",
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className={cn("w-4 h-4 shrink-0", meta.tone)} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{tPriority(meta.labelKey as Parameters<typeof tPriority>[0])}</div>
          <div className="text-[10px] text-muted-foreground">
            {t(meta.hintKey as Parameters<typeof t>[0])}
          </div>
        </div>
        {!policy && (
          <span className="text-[10px] text-amber-500">
            {t("default_not_customized")}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <DurationField
          label={t("first_response")}
          value={firstResponse}
          onChange={setFirstResponse}
          disabled={updateMutation.isPending}
        />
        <DurationField
          label={t("resolution")}
          value={resolution}
          onChange={setResolution}
          disabled={updateMutation.isPending}
        />
      </div>

      {isDirty && (
        <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-border/60">
          <button
            type="button"
            onClick={reset}
            disabled={updateMutation.isPending}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={updateMutation.isPending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-40 disabled:pointer-events-none",
            )}
          >
            {updateMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Save className="w-3 h-3" />
            )}
            {t("save")}
          </button>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// minutes input
// =====================================================================

function DurationField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("admin.settings.sla");
  return (
    <label className="block">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        <Clock className="w-3 h-3" />
        {label}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          step={1}
          value={value}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          disabled={disabled}
          className={cn(
            "w-24 px-2 py-1.5 text-sm tabular-nums rounded border border-border bg-background",
            "focus:outline-none focus:ring-1 focus:ring-ring",
            "disabled:opacity-50",
          )}
        />
        <span className="text-xs text-muted-foreground">{t("minutes")}</span>
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          ≈ {formatMinutes(value)}
        </span>
      </div>
    </label>
  );
}

function formatMinutes(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "—";
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  const rem = min % 60;
  if (hours < 24) return rem ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH ? `${days}d ${remH}h` : `${days}d`;
}
