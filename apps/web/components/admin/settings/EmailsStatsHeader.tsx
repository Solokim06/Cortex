"use client";

import {
  Loader2,
  Mail,
  MailX,
  AlertTriangle,
  Send,
  RefreshCw,
  Zap,
  ZapOff,
  Info,
  Clock,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "cn";
import {
  useEmailPrefs,
  useEmailStats,
  useSetEmailEnabled,
  useTriggerEmailRetry,
} from "@/lib/hooks/use-admin-emails";

/**
 * Top section of the Emails settings page:
 *   - Master on/off switch
 *   - Provider info (which backend is sending, from address)
 *   - Stat tiles (sent / failed / retry queue for last 30 days)
 *   - Global "Retry now" button
 */
export function EmailsStatsHeader() {
  const t = useTranslations("admin.settings.emails");
  const prefsQuery = useEmailPrefs();
  const statsQuery = useEmailStats();
  const toggleMutation = useSetEmailEnabled();
  const retryMutation = useTriggerEmailRetry();

  const prefs = prefsQuery.data;
  const stats = statsQuery.data;
  const loading = prefsQuery.isLoading || statsQuery.isLoading;

  const toggleEnabled = () => {
    if (!prefs) return;
    toggleMutation.mutate(!prefs.enabled, {
      onSuccess: (data) => {
        toast.success(
          data.enabled ? t("toast_enabled") : t("toast_disabled"),
        );
      },
      onError: (e: Error) => toast.error(e.message || t("toast_toggle_failed")),
    });
  };

  const retryNow = () => {
    retryMutation.mutate(undefined, {
      onSuccess: (data) => {
        if (data.retried === 0) {
          toast.info(t("toast_retry_nothing"));
        } else {
          toast.success(
            t("toast_retry_summary", {
              retried: data.retried,
              succeeded: data.succeeded,
              failed: data.failed,
            }),
          );
        }
      },
      onError: (e: Error) => toast.error(e.message || t("toast_retry_failed")),
    });
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card/40 px-5 py-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t("loading_config")}
        </div>
      </div>
    );
  }

  if (!prefs || !stats) {
    return (
      <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 px-5 py-4 text-xs text-rose-500">
        {t("load_error")}
      </div>
    );
  }

  const isEnabled = prefs.enabled;

  return (
    <div className="space-y-3">
      {/* Master toggle + provider row */}
      <div
        className={cn(
          "rounded-lg border px-5 py-4 flex items-center gap-4 flex-wrap",
          isEnabled
            ? "border-border bg-card/40"
            : "border-amber-500/40 bg-amber-500/5",
        )}
      >
        {/* Toggle + label */}
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "rounded-md p-2 shrink-0",
              isEnabled
                ? "bg-primary/10 text-primary"
                : "bg-amber-500/15 text-amber-500",
            )}
          >
            {isEnabled ? (
              <Zap className="w-4 h-4" />
            ) : (
              <ZapOff className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {isEnabled ? t("enabled_title") : t("disabled_title")}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {isEnabled ? t("enabled_subtitle") : t("disabled_subtitle")}
            </div>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          onClick={toggleEnabled}
          disabled={toggleMutation.isPending}
          className={cn(
            "shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:opacity-50 disabled:pointer-events-none",
            isEnabled ? "bg-primary" : "bg-muted",
          )}
        >
          <span
            className={cn(
              "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
              isEnabled ? "translate-x-5" : "translate-x-0.5",
            )}
          />
        </button>

        <div className="w-px h-10 bg-border/60 hidden sm:block" aria-hidden />

        {/* Provider info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium capitalize">
                {t("provider_label", { provider: prefs.provider })}
              </span>
              <ProviderBadge provider={prefs.provider} t={t} />
              {!prefs.configured && prefs.provider === "console" && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-500">
                  <Info className="w-2.5 h-2.5" />
                  {t("console_only_warning")}
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
              {t("from_label", { address: prefs.from_address })}
            </div>
          </div>
        </div>

        {/* Retry button */}
        <button
          type="button"
          onClick={retryNow}
          disabled={retryMutation.isPending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs shrink-0",
            "border border-border bg-background hover:bg-accent/50 transition-colors",
            "disabled:opacity-40 disabled:pointer-events-none",
          )}
        >
          {retryMutation.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          {t("retry_now")}
        </button>
      </div>

      {/* Stats tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile
          icon={Send}
          label={t("stat_sent_30d")}
          value={stats.last_30_days.sent}
          tone="text-emerald-500"
        />
        <StatTile
          icon={MailX}
          label={t("stat_failed_30d")}
          value={stats.last_30_days.failed}
          tone={
            stats.last_30_days.failed > 0
              ? "text-rose-500"
              : "text-muted-foreground"
          }
          emphasize={stats.last_30_days.failed > 0}
        />
        <StatTile
          icon={AlertTriangle}
          label={t("stat_suppressed_30d")}
          value={stats.last_30_days.suppressed}
          tone="text-muted-foreground"
        />
        <StatTile
          icon={Clock}
          label={t("stat_retry_queue")}
          value={stats.retry_queue}
          tone={
            stats.retry_queue > 0 ? "text-amber-500" : "text-muted-foreground"
          }
          emphasize={stats.retry_queue > 0}
        />
      </div>
    </div>
  );
}

// =====================================================================
// small components
// =====================================================================

function ProviderBadge({
  provider,
  t,
}: {
  provider: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const meta = {
    resend: { label: t("provider_resend"), tone: "text-emerald-500 border-emerald-500/40 bg-emerald-500/5" },
    smtp: { label: t("provider_smtp"), tone: "text-sky-500 border-sky-500/40 bg-sky-500/5" },
    console: { label: t("provider_console"), tone: "text-amber-500 border-amber-500/40 bg-amber-500/5" },
    disabled: { label: t("provider_disabled"), tone: "text-muted-foreground border-border bg-muted/30" },
  }[provider] ?? {
    label: provider,
    tone: "text-muted-foreground border-border",
  };

  return (
    <span
      className={cn(
        "text-[10px] uppercase tracking-wider rounded-full border px-1.5 py-0.5",
        meta.tone,
      )}
    >
      {meta.label}
    </span>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
  emphasize = false,
}: {
  icon: typeof Send;
  label: string;
  value: number;
  tone: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card/40 px-3 py-2.5 flex items-center gap-2.5",
        emphasize && "border-rose-500/40 bg-rose-500/5",
      )}
    >
      <Icon className={cn("w-4 h-4 shrink-0", tone)} />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">
          {label}
        </div>
        <div className={cn("text-base font-semibold tabular-nums leading-tight", emphasize && tone)}>
          {value}
        </div>
      </div>
    </div>
  );
}
