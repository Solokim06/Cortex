"use client";

import {
  Loader2,
  Mail,
  Bell,
  UserCheck,
  MessageSquare,
  Flame,
  CalendarClock,
  Info,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { toast } from "sonner";
import { cn } from "cn";
import { useAdminPrefs, useUpdatePrefs } from "@/lib/hooks/use-admin-prefs";
import type { NotificationPrefs } from "@/lib/admin-api";

type PrefKey = Exclude<keyof NotificationPrefs, "user_id" | "updated_at">;

type PrefDef = {
  key: PrefKey;
  icon: typeof Bell;
  labelKey: string;
  descKey: string;
  tone?: string;
  disabledHintKey?: string;
};

const PREFS: PrefDef[] = [
  {
    key: "email_on_new_ticket",
    icon: Bell,
    labelKey: "pref_new_ticket_label",
    descKey: "pref_new_ticket_desc",
    tone: "text-primary",
  },
  {
    key: "email_on_assignment",
    icon: UserCheck,
    labelKey: "pref_assignment_label",
    descKey: "pref_assignment_desc",
    tone: "text-violet-500",
  },
  {
    key: "email_on_user_reply",
    icon: MessageSquare,
    labelKey: "pref_user_reply_label",
    descKey: "pref_user_reply_desc",
    tone: "text-sky-500",
  },
  {
    key: "email_on_sla_breach",
    icon: Flame,
    labelKey: "pref_sla_breach_label",
    descKey: "pref_sla_breach_desc",
    tone: "text-rose-500",
  },
  {
    key: "email_digest_daily",
    icon: CalendarClock,
    labelKey: "pref_digest_label",
    descKey: "pref_digest_desc",
    tone: "text-muted-foreground",
    disabledHintKey: "pref_digest_disabled_hint",
  },
];

export default function PrefsSettingsPage() {
  const t = useTranslations("admin.settings.prefs");
  const prefsQuery = useAdminPrefs();
  const updateMutation = useUpdatePrefs();

  const handleToggle = (key: PrefKey, value: boolean) => {
    updateMutation.mutate(
      { [key]: value },
      {
        onSuccess: () => toast.success(t("toast_updated")),
        onError: () => toast.error(t("toast_update_failed")),
      },
    );
  };

  return (
    <div className="px-5 py-5 max-w-2xl">
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-sm font-medium mb-1">{t("page_title")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("page_subtitle")}
        </p>
      </div>

      {/* Info banner */}
      <div className="mb-4 flex items-start gap-2 rounded-md border border-border bg-card/40 px-3 py-2">
        <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
        <div className="text-[11px] text-muted-foreground">
          {t("banner_before")}
          <strong className="text-foreground font-medium">
            {t("banner_bold")}
          </strong>
          {t("banner_mid")}
          <Link
            href="/admin/settings/emails"
            className="text-primary hover:underline"
          >
            {t("banner_link")}
          </Link>
          {t("banner_after")}
        </div>
      </div>

      {/* Loading */}
      {prefsQuery.isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-10">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("loading")}
        </div>
      )}

      {/* Error */}
      {prefsQuery.isError && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-xs text-rose-500">
          {t("load_error")}
        </div>
      )}

      {/* Prefs list */}
      {prefsQuery.data && (
        <div className="rounded-lg border border-border bg-card/40 divide-y divide-border/60">
          {PREFS.map((pref) => (
            <PrefRow
              key={pref.key}
              pref={pref}
              value={prefsQuery.data[pref.key]}
              onToggle={(v) => handleToggle(pref.key, v)}
              busy={
                updateMutation.isPending &&
                updateMutation.variables?.[pref.key] !== undefined
              }
              t={t}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-5 flex items-start gap-2 text-[11px] text-muted-foreground">
        <Mail className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-60" />
        <p>
          {t("footer_before")}
          <span className="text-foreground/80 font-medium">
            {t("footer_bold")}
          </span>
          {t("footer_after")}
        </p>
      </div>
    </div>
  );
}

// =====================================================================
// row
// =====================================================================

function PrefRow({
  pref,
  value,
  onToggle,
  busy,
  t,
}: {
  pref: PrefDef;
  value: boolean;
  onToggle: (v: boolean) => void;
  busy: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const Icon = pref.icon;
  const isDisabled = !!pref.disabledHintKey;
  const label = t(pref.labelKey as Parameters<typeof t>[0]);
  const desc = t(pref.descKey as Parameters<typeof t>[0]);

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3",
        isDisabled && "opacity-60",
      )}
    >
      <div
        className={cn(
          "shrink-0 w-7 h-7 rounded-md flex items-center justify-center mt-0.5",
          "bg-muted/40",
          pref.tone,
        )}
      >
        <Icon className="w-3.5 h-3.5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{label}</span>
          {isDisabled && (
            <span className="text-[10px] uppercase tracking-wider rounded border border-border px-1.5 py-0.5 text-muted-foreground">
              {t("not_wired_badge")}
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
        {pref.disabledHintKey && (
          <p className="text-[10px] text-muted-foreground mt-0.5 italic">
            {t(pref.disabledHintKey as Parameters<typeof t>[0])}
          </p>
        )}
      </div>

      {/* Toggle switch */}
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={t("toggle_aria", { label })}
        onClick={() => !busy && onToggle(!value)}
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
}
