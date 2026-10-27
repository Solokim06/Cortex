"use client";

import { useTranslations } from "next-intl";

import {
  AlertTriangle,
  Mail,
  Webhook,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { cn } from "cn";
import { timeAgo } from "@/components/admin/TicketBadges";
import { Link } from "@/i18n/navigation";
import {
  isError,
  type RecentFailure,
} from "@/lib/hooks/use-admin-health";

// =====================================================================
// component
// =====================================================================

type Props = {
  failures: RecentFailure[] | { error: string } | null;
};

export function RecentFailuresPanel({ failures }: Props) {
  const t = useTranslations("admin.health");
  const isErr = failures !== null && isError(failures);
  const list = Array.isArray(failures) ? failures : [];

  return (
    <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <div
          className={cn(
            "rounded-md p-1.5",
            isErr || list.length > 0
              ? "bg-rose-500/10"
              : "bg-emerald-500/10",
          )}
        >
          <AlertTriangle
            className={cn(
              "w-3.5 h-3.5",
              isErr || list.length > 0
                ? "text-rose-500"
                : "text-emerald-500",
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">{t("failures_title")}</h3>
          <p className="text-[10px] text-muted-foreground">
            {list.length > 0
              ? t("failures_subtitle_count", { n: list.length, y: list.length === 1 ? "y" : "ies" })
              : t("failures_subtitle_empty")}
          </p>
        </div>
        {list.length > 0 && (
          <span className="text-[10px] uppercase tracking-wider rounded-full border border-rose-500/40 bg-rose-500/5 text-rose-500 px-2 py-0.5">
            {list.length}
          </span>
        )}
      </div>

      {/* Body */}
      {failures === null && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-4 py-6">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t("diagnostics_loading")}
        </div>
      )}

      {isErr && (
        <div className="px-4 py-4 text-xs text-rose-500 break-words">
          {(failures as { error: string }).error}
        </div>
      )}

      {!isErr && failures !== null && list.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
          <CheckCircle2 className="w-5 h-5 text-emerald-500/60" />
          <p className="text-xs">{t("failures_empty")}</p>
          <p className="text-[10px] text-muted-foreground">
            {t("failures_empty_hint")}
          </p>
        </div>
      )}

      {!isErr && list.length > 0 && (
        <ul className="divide-y divide-border/40">
          {list.map((f) => (
            <FailureRow key={`${f.kind}-${f.id}`} failure={f} />
          ))}
        </ul>
      )}

      {/* Footer hint — where to look */}
      {list.length > 0 && (
        <div className="px-4 py-2 border-t border-border/60 bg-card/60 text-[10px] text-muted-foreground">
          {t("failures_full_history")}{" "}
          <Link
            href="/admin/settings/emails"
            className="text-primary hover:underline"
          >
            {t("failures_link_emails")}
          </Link>{" "}
          ·{" "}
          <Link
            href="/admin/settings/webhooks"
            className="text-primary hover:underline"
          >
            {t("failures_link_webhooks")}
          </Link>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// row
// =====================================================================

function FailureRow({ failure }: { failure: RecentFailure }) {
  const t = useTranslations("admin.health");
  const isEmail = failure.kind === "email";
  const Icon = isEmail ? Mail : Webhook;
  const tone = isEmail ? "text-amber-500" : "text-orange-500";

  // Target display: email address OR target_id prefix
  const target = isEmail
    ? failure.target
    : `→ ${failure.target.slice(0, 8)}`;

  // Event / template context
  const context = isEmail
    ? failure.template
    : failure.event_kind;

  const statusCode = !isEmail ? failure.status_code : undefined;

  return (
    <li className="px-4 py-2.5 hover:bg-accent/20 transition-colors">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "shrink-0 w-6 h-6 rounded-md bg-muted/40 flex items-center justify-center mt-0.5",
            tone,
          )}
        >
          <Icon className="w-3 h-3" strokeWidth={1.75} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium">{target}</span>
            {context && (
              <span className="text-[10px] uppercase tracking-wider rounded border border-border px-1.5 py-0.5 text-muted-foreground font-mono">
                {context}
              </span>
            )}
            {statusCode !== undefined && statusCode !== null && (
              <span
                className={cn(
                  "text-[10px] font-medium tabular-nums",
                  statusCode >= 500
                    ? "text-rose-500"
                    : statusCode >= 400
                      ? "text-orange-500"
                      : "text-muted-foreground",
                )}
              >
                HTTP {statusCode}
              </span>
            )}
            {statusCode === null && (
              <span className="text-[10px] font-medium text-rose-500">
                {t("failures_network_error")}
              </span>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2 break-words">
            {failure.error || t("failures_no_message")}
          </p>

          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
            <span className="tabular-nums">
              {failure.at ? timeAgo(failure.at, t) : "—"}
            </span>
            <span className="opacity-40">·</span>
            <span className="font-mono">
              {failure.id.slice(0, 8)}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

// =====================================================================
// helpers
// =====================================================================

