"use client";

import { useTranslations } from "next-intl";

import {
  Users,
  Ticket,
  Activity,
  Mail,
  Webhook,
  AlertCircle,
  Clock,
} from "lucide-react";
import { cn } from "cn";
import {
  formatNumber,
  formatAge,
  isError,
  type DataHealth,
} from "@/lib/hooks/use-admin-health";

// =====================================================================
// row definitions
// =====================================================================

type RowDef = {
  key: keyof DataHealth;
  labelKey: string;
  icon: typeof Users;
  tone: string;
  /** Render mode */
  render?: "count" | "age";
};

const ROWS: RowDef[] = [
  { key: "users", labelKey: "data_users", icon: Users, tone: "text-primary" },
  { key: "tickets", labelKey: "data_tickets", icon: Ticket, tone: "text-sky-500" },
  { key: "events", labelKey: "data_events", icon: Activity, tone: "text-violet-500" },
  { key: "email_deliveries", labelKey: "data_email_deliveries", icon: Mail, tone: "text-emerald-500" },
  { key: "webhook_deliveries", labelKey: "data_webhook_deliveries", icon: Webhook, tone: "text-amber-500" },
  { key: "oldest_event_age_days", labelKey: "data_oldest_event", icon: Clock, tone: "text-muted-foreground", render: "age" },
  { key: "oldest_ticket_age_days", labelKey: "data_oldest_ticket", icon: Clock, tone: "text-muted-foreground", render: "age" },
];

// =====================================================================
// component
// =====================================================================

type Props = {
  data: DataHealth | { error: string } | null;
};

export function DataHealthPanel({ data }: Props) {
  const t = useTranslations("admin.health");
  // Handle error state from the backend
  if (data && isError(data)) {
    return (
      <PanelShell>
        <div className="px-4 py-4 text-xs text-rose-500 break-words">
          {data.error}
        </div>
      </PanelShell>
    );
  }

  // Loading state
  if (!data) {
    return (
      <PanelShell>
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-4 py-6">
          <AlertCircle className="w-3.5 h-3.5" />
          {t("diagnostics_loading")}
        </div>
      </PanelShell>
    );
  }

  const typed = data as DataHealth;

  return (
    <PanelShell>
      <ul className="divide-y divide-border/40">
        {ROWS.map((row) => {
          const Icon = row.icon;
          const raw = typed[row.key];
          const display =
            row.render === "age"
              ? formatAge(raw as number | null)
              : formatNumber(raw as number | null);

          return (
            <li
              key={row.key}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <div
                className={cn(
                  "shrink-0 w-6 h-6 rounded-md bg-muted/40 flex items-center justify-center",
                  row.tone,
                )}
              >
                <Icon className="w-3 h-3" strokeWidth={1.75} />
              </div>
              <span className="text-xs text-muted-foreground flex-1 truncate">
                {t(row.labelKey as Parameters<typeof t>[0])}
              </span>
              <span className="text-xs font-medium tabular-nums">
                {display}
              </span>
            </li>
          );
        })}
      </ul>
    </PanelShell>
  );
}

// =====================================================================
// shell
// =====================================================================

function PanelShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("admin.health");
  return (
    <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <div className="rounded-md bg-primary/10 p-1.5">
          <Activity className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">{t("data_title")}</h3>
          <p className="text-[10px] text-muted-foreground">
            {t("data_subtitle")}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}
