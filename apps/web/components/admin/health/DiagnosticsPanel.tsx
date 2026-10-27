"use client";

import { useTranslations } from "next-intl";

import {
  Settings as SettingsIcon,
  Radio,
  Wifi,
  Flame,
  AlertCircle,
  ShieldCheck,
  Mail,
  Zap,
  Clock,
  Gauge,
  Users as UsersIcon,
} from "lucide-react";
import { cn } from "cn";
import {
  isError,
  formatNumber,
  type PubsubInfo,
  type SlaHealth,
  type EnvInfo,
} from "@/lib/hooks/use-admin-health";

// =====================================================================
// component
// =====================================================================

type Props = {
  pubsub: PubsubInfo | { error: string } | null;
  sla: SlaHealth | { error: string } | null;
  env: EnvInfo | null;
};

export function DiagnosticsPanel({ pubsub, sla, env }: Props) {
  return (
    <div className="space-y-3">
      <RuntimeSection pubsub={pubsub} sla={sla} />
      <EnvSection env={env} />
    </div>
  );
}

// =====================================================================
// runtime (pubsub + sla)
// =====================================================================

function RuntimeSection({
  pubsub,
  sla,
}: {
  pubsub: PubsubInfo | { error: string } | null;
  sla: SlaHealth | { error: string } | null;
}) {
  const t = useTranslations("admin.health");
  return (
    <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
      <SectionHeader
        icon={Radio}
        title={t("diagnostics_runtime_title")}
        subtitle={t("diagnostics_runtime_subtitle")}
      />

      <ul className="divide-y divide-border/40">
        {/* Pubsub mode */}
        {pubsub && !isError(pubsub) ? (
          <>
            <Row
              icon={Radio}
              tone={
                pubsub.mode === "redis"
                  ? "text-emerald-500"
                  : "text-sky-500"
              }
              label={t("diagnostics_pubsub_mode")}
              value={pubsub.mode}
              badge={pubsub.mode === "memory" ? t("diagnostics_single_worker") : undefined}
            />
            <Row
              icon={Wifi}
              tone="text-muted-foreground"
              label={t("diagnostics_subscribers")}
              value={formatNumber(pubsub.subscribers)}
            />
          </>
        ) : pubsub && isError(pubsub) ? (
          <ErrorRow error={pubsub.error} />
        ) : (
          <LoadingRow />
        )}

        {/* SLA breaches */}
        {sla && !isError(sla) ? (
          <>
            <Row
              icon={Flame}
              tone={
                sla.breached_open > 0 ? "text-rose-500" : "text-emerald-500"
              }
              label={t("diagnostics_breached")}
              value={formatNumber(sla.breached_open)}
              emphasize={sla.breached_open > 0}
            />
            <Row
              icon={AlertCircle}
              tone="text-muted-foreground"
              label={t("diagnostics_open_total")}
              value={formatNumber(sla.open_total)}
            />
          </>
        ) : sla && isError(sla) ? (
          <ErrorRow error={sla.error} />
        ) : (
          <LoadingRow />
        )}
      </ul>
    </div>
  );
}

// =====================================================================
// env
// =====================================================================

function EnvSection({ env }: { env: EnvInfo | null }) {
  const t = useTranslations("admin.health");
  if (!env) {
    return (
      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        <SectionHeader
          icon={SettingsIcon}
          title={t("diagnostics_config_title")}
          subtitle={t("diagnostics_config_subtitle")}
        />
        <LoadingRow />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
      <SectionHeader
        icon={SettingsIcon}
        title={t("diagnostics_config_title")}
        subtitle={t("diagnostics_config_subtitle")}
      />

      <ul className="divide-y divide-border/40">
        <Row
          icon={Mail}
          tone={env.email_enabled ? "text-emerald-500" : "text-rose-500"}
          label={t("diagnostics_email_sending")}
          value={env.email_enabled ? t("diagnostics_enabled") : t("diagnostics_disabled")}
          badge={env.email_provider}
        />
        <Row
          icon={Zap}
          tone="text-violet-500"
          label={t("diagnostics_embedding_provider")}
          value={env.embedding_provider}
        />
        <Row
          icon={Gauge}
          tone="text-sky-500"
          label={t("diagnostics_help_rate_limit")}
          value={t("diagnostics_help_rate_limit_value", { n: env.help_rate_limit_max })}
        />
        <Row
          icon={Clock}
          tone="text-muted-foreground"
          label={t("diagnostics_webhook_max_attempts")}
          value={String(env.webhook_max_attempts)}
        />
        <Row
          icon={ShieldCheck}
          tone="text-muted-foreground"
          label={t("diagnostics_impersonation_ttl")}
          value={t("diagnostics_impersonation_ttl_value", { n: env.impersonation_ttl_minutes })}
        />
        <Row
          icon={UsersIcon}
          tone={
            env.admin_emails_configured
              ? "text-emerald-500"
              : "text-muted-foreground"
          }
          label={t("diagnostics_admin_emails")}
          value={env.admin_emails_configured ? t("diagnostics_yes") : t("diagnostics_no")}
        />
        <Row
          icon={UsersIcon}
          tone={
            env.agent_emails_configured
              ? "text-emerald-500"
              : "text-muted-foreground"
          }
          label={t("diagnostics_agent_emails")}
          value={env.agent_emails_configured ? t("diagnostics_yes") : t("diagnostics_no")}
        />
      </ul>
    </div>
  );
}

// =====================================================================
// building blocks
// =====================================================================

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Radio;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
      <div className="rounded-md bg-primary/10 p-1.5">
        <Icon className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-[10px] text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  tone,
  label,
  value,
  badge,
  emphasize = false,
}: {
  icon: typeof Radio;
  tone: string;
  label: string;
  value: string;
  badge?: string;
  emphasize?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-4 py-2.5",
        emphasize && "bg-rose-500/5",
      )}
    >
      <div
        className={cn(
          "shrink-0 w-6 h-6 rounded-md bg-muted/40 flex items-center justify-center",
          tone,
        )}
      >
        <Icon className="w-3 h-3" strokeWidth={1.75} />
      </div>
      <span className="text-xs text-muted-foreground flex-1 truncate">
        {label}
      </span>
      {badge && (
        <span className="text-[10px] uppercase tracking-wider rounded border border-border px-1.5 py-0.5 text-muted-foreground">
          {badge}
        </span>
      )}
      <span
        className={cn(
          "text-xs font-medium tabular-nums",
          emphasize && "text-rose-500",
        )}
      >
        {value}
      </span>
    </li>
  );
}

function ErrorRow({ error }: { error: string }) {
  return (
    <li className="px-4 py-3 text-xs text-rose-500 break-words">
      {error}
    </li>
  );
}

function LoadingRow() {
  const t = useTranslations("admin.health");
  return (
    <li className="px-4 py-3 text-xs text-muted-foreground">
      {t("diagnostics_loading")}
    </li>
  );
}
