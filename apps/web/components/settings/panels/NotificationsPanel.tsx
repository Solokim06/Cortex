"use client";

import {
  Loader2,
  Mail,
  MessageSquare,
  Activity,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "cn";
import {
  useUserNotifPrefs,
  useUpdateUserNotifPrefs,
} from "@/lib/hooks/use-help";

/**
 * End-user notification preferences.
 *
 * Three toggles the filer controls:
 *   - email_on_ticket_reply    — when the team replies
 *   - email_on_status_change   — progress updates (open → in_progress)
 *   - email_on_resolved        — when the ticket is resolved/closed
 *
 * Split so users can mute progress noise while still getting the
 * important "it's fixed" email.
 */
export function NotificationsPanel() {
  const t = useTranslations("settings.panels.notifications");
  const prefsQuery = useUserNotifPrefs();
  const updateMutation = useUpdateUserNotifPrefs();

  const prefs = prefsQuery.data;
  const busy = updateMutation.isPending;

  const toggle = (key: keyof NonNullable<typeof prefs>) => {
    if (!prefs) return;
    const current = prefs[key];
    if (typeof current !== "boolean") return;

    updateMutation.mutate(
      { [key]: !current } as Record<string, boolean>,
      {
        onSuccess: () => toast.success(t("toast_updated")),
        onError: () => toast.error(t("toast_update_failed")),
      },
    );
  };

  if (prefsQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-10">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("loading")}
      </div>
    );
  }

  if (!prefs) {
    return (
      <div className="rounded-md border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-xs text-rose-500">
        {t("load_error")}
      </div>
    );
  }

  const toggles = [
    {
      key: "email_on_ticket_reply" as const,
      icon: MessageSquare,
      tone: "text-primary",
      labelKey: "reply_label",
      descKey: "reply_desc",
    },
    {
      key: "email_on_status_change" as const,
      icon: Activity,
      tone: "text-sky-500",
      labelKey: "status_label",
      descKey: "status_desc",
    },
    {
      key: "email_on_resolved" as const,
      icon: CheckCircle2,
      tone: "text-emerald-500",
      labelKey: "resolved_label",
      descKey: "resolved_desc",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div>
        <h3 className="text-sm font-medium mb-1 flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary" strokeWidth={1.75} />
          {t("heading")}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t("intro")}
        </p>
      </div>

      {/* Toggles */}
      <div className="rounded-lg border border-border bg-card/40 divide-y divide-border/60">
        {toggles.map((row) => {
          const Icon = row.icon;
          const value = prefs[row.key];
          const label = t(row.labelKey as Parameters<typeof t>[0]);
          const desc = t(row.descKey as Parameters<typeof t>[0]);
          return (
            <div
              key={row.key}
              className="flex items-start gap-3 px-4 py-3"
            >
              <div
                className={cn(
                  "shrink-0 w-7 h-7 rounded-md flex items-center justify-center mt-0.5 bg-muted/40",
                  row.tone,
                )}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{label}</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {desc}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={value}
                aria-label={t("toggle_aria", { label })}
                onClick={() => toggle(row.key)}
                disabled={busy}
                className={cn(
                  "shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:opacity-50 disabled:pointer-events-none",
                  value ? "bg-primary" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                    value ? "translate-x-4" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>
          );
        })}
      </div>

      {/* Insights section — proactive notifications from your graph */}
      <div className="pt-2">
        <h3 className="text-sm font-medium mb-1 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" strokeWidth={1.75} />
          {t("insights_heading")}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
          {t("insights_intro")}
        </p>

        <div className="rounded-lg border border-border bg-card/40 divide-y divide-border/60">
          {/* Master toggle */}
          <div className="flex items-start gap-3 px-4 py-3">
            <div className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center mt-0.5 bg-primary/10 text-primary">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">
                {t("insights_master_label")}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("insights_master_desc")}
              </p>
            </div>
            <Toggle
              checked={prefs.insights_enabled}
              disabled={busy}
              onClick={() =>
                toggle("insights_enabled")
              }
            />
          </div>

          {/* Per-signal toggles — dimmed when master is off */}
          {[
            {
              key: "insights_dormant_revival" as const,
              label: t("insights_dormant_label"),
              desc: t("insights_dormant_desc"),
            },
            {
              key: "insights_contradiction" as const,
              label: t("insights_contradiction_label"),
              desc: t("insights_contradiction_desc"),
            },
            {
              key: "insights_decision_drift" as const,
              label: t("insights_decision_drift_label"),
              desc: t("insights_decision_drift_desc"),
            },
            {
              key: "insights_rhythm" as const,
              label: t("insights_rhythm_label"),
              desc: t("insights_rhythm_desc"),
            },
          ].map((row) => (
            <div
              key={row.key}
              className={cn(
                "flex items-start gap-3 px-4 py-2.5 pl-14",
                !prefs.insights_enabled && "opacity-50",
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">{row.label}</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {row.desc}
                </p>
              </div>
              <Toggle
                checked={prefs[row.key]}
                disabled={busy || !prefs.insights_enabled}
                onClick={() => toggle(row.key)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Footer note */}
      <p className="text-[10px] text-muted-foreground">
        {t("footer")}
      </p>
    </div>
  );
}


function Toggle({
  checked,
  disabled = false,
  onClick,
}: {
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:opacity-50 disabled:pointer-events-none",
        checked ? "bg-primary" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
