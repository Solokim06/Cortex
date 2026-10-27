"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  X,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  RotateCw,
  Clock,
} from "lucide-react";
import { cn } from "cn";
import { useWebhookDeliveries } from "@/lib/hooks/use-admin-webhooks";
import type { WebhookDelivery, WebhookTarget } from "@/lib/admin-api";

type Props = {
  open: boolean;
  onClose: () => void;
  target: WebhookTarget | null;
};

/**
 * Delivery history drawer.
 *
 * Shows the last 50 attempts to hit one webhook endpoint, newest first.
 * Each row is expandable to reveal the response body.
 *
 * Rows are color-coded:
 *   green  = 2xx
 *   amber  = in-flight / no code (network error)
 *   rose   = 4xx / 5xx
 */
export function WebhookDeliveriesDrawer({ open, onClose, target }: Props) {
  const t = useTranslations("admin.settings.webhooks");
  const deliveriesQuery = useWebhookDeliveries(open ? target?.id ?? null : null);

  if (!open || !target) return null;

  const deliveries = deliveriesQuery.data ?? [];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        className={cn(
          "fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg",
          "bg-popover border-l border-border shadow-2xl",
          "flex flex-col",
        )}
        role="dialog"
        aria-modal="true"
        aria-label={t("drawer_title")}
      >
        {/* Header */}
        <header className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border">
          <Clock className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {t("drawer_title")}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              {t("drawer_subtitle_template", { name: target.name, url: target.url })}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            aria-label={t("cancel")}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Stats strip */}
        <div className="shrink-0 grid grid-cols-3 divide-x divide-border border-b border-border bg-card/30 text-[10px]">
          <Stat label={t("stat_total")} value={deliveries.length} />
          <Stat
            label={t("stat_failed")}
            value={deliveries.filter((d) => !isOk(d.status_code)).length}
            tone="text-rose-500"
          />
          <Stat
            label={t("stat_failures")}
            value={target.failure_count}
            tone={target.failure_count > 0 ? "text-rose-500" : undefined}
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {deliveriesQuery.isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-4 py-6">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t("drawer_loading")}
            </div>
          )}

          {deliveriesQuery.isError && (
            <div className="mx-4 my-4 rounded-md border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-xs text-rose-500">
              {t("drawer_load_error")}
            </div>
          )}

          {!deliveriesQuery.isLoading && deliveries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <RotateCw className="w-6 h-6 opacity-40" />
              <p className="text-xs">{t("drawer_empty_title")}</p>
              <p className="text-[10px] opacity-70">
                {t("drawer_empty_hint")}
              </p>
            </div>
          )}

          {deliveries.map((d) => (
            <DeliveryRow key={d.id} delivery={d} t={t} />
          ))}
        </div>

        {/* Footer */}
        <footer className="shrink-0 border-t border-border bg-card/30 px-4 py-2 text-[10px] text-muted-foreground">
          {t("drawer_footer")}
        </footer>
      </aside>
    </>
  );
}

// =====================================================================
// one delivery row (collapsible)
// =====================================================================

function DeliveryRow({
  delivery,
  t,
}: {
  delivery: WebhookDelivery;
  t: ReturnType<typeof useTranslations>;
}) {
  const [expanded, setExpanded] = useState(false);
  const ok = isOk(delivery.status_code);

  const tone = ok
    ? "text-emerald-500"
    : delivery.status_code === null
      ? "text-amber-500"
      : "text-rose-500";

  const Icon = ok ? CheckCircle2 : XCircle;

  return (
    <div className="border-b border-border/40">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left px-4 py-2.5 hover:bg-accent/20 transition-colors"
      >
        <div className="flex items-start gap-2.5">
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0 mt-1" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0 mt-1" />
          )}
          <Icon className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", tone)} />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono">{delivery.event_kind}</span>
              <span className={cn("text-[10px] font-medium tabular-nums", tone)}>
                {delivery.status_code !== null
                  ? delivery.status_code
                  : t("network_error")}
              </span>
              {delivery.attempt > 1 && (
                <span className="text-[9px] uppercase tracking-wider rounded border border-border px-1 py-0.5 text-muted-foreground">
                  {t("attempt_n", { n: delivery.attempt })}
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
              {formatWhen(delivery.delivered_at, t)}
              {delivery.ticket_id && (
                <>
                  {" · "}
                  {t("ticket_n", { id: delivery.ticket_id.slice(0, 8) })}
                </>
              )}
            </div>
          </div>
        </div>
      </button>

      {expanded && delivery.response_body && (
        <div className="px-4 pb-3">
          <div className="rounded-md border border-border bg-background/60 p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("response_body")}
            </div>
            <pre className="text-[10px] font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto text-foreground/85">
              {delivery.response_body}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// stat cell
// =====================================================================

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="px-3 py-2">
      <div className="uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("text-sm font-medium tabular-nums", tone)}>
        {value}
      </div>
    </div>
  );
}

// =====================================================================
// helpers
// =====================================================================

function isOk(code: number | null): boolean {
  return code !== null && code >= 200 && code < 300;
}

function formatWhen(
  iso: string | null,
  t: ReturnType<typeof useTranslations>,
): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return t("just_now");
  if (diff < 3600) return t("minutes_ago", { n: Math.floor(diff / 60) });
  if (diff < 86400) return t("hours_ago", { n: Math.floor(diff / 3600) });
  return new Date(iso).toLocaleString();
}
