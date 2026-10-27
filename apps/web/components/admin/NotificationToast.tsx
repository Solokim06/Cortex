"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Bell,
  X,
  AlertCircle,
  UserPlus,
  MessageSquare,
  Flame,
  Flag,
  Inbox,
  ExternalLink,
} from "lucide-react";
import { cn } from "cn";
import { useRouter } from "@/i18n/navigation";
import type { AdminNotification } from "@/lib/hooks/use-admin-notifications";

// =====================================================================
// config
// =====================================================================

type Meta = {
  icon: typeof Bell;
  tone: string;
  border: string;
  /** Auto-dismiss delay in ms */
  ttl: number;
  labelKey: string;
};

const PRIORITY_META: Record<AdminNotification["priority"], Meta> = {
  urgent: {
    icon: Flame,
    tone: "text-rose-500",
    border: "border-l-rose-500",
    ttl: 15_000,
    labelKey: "priority_urgent",
  },
  high: {
    icon: AlertCircle,
    tone: "text-amber-500",
    border: "border-l-amber-500",
    ttl: 10_000,
    labelKey: "priority_high",
  },
  normal: {
    icon: Bell,
    tone: "text-primary",
    border: "border-l-primary",
    ttl: 6_000,
    labelKey: "priority_normal",
  },
  low: {
    icon: Bell,
    tone: "text-muted-foreground",
    border: "border-l-border",
    ttl: 4_000,
    labelKey: "priority_low",
  },
};

const KIND_ICONS: Record<string, typeof Bell> = {
  "ticket.created": Inbox,
  "ticket.assigned_to_me": UserPlus,
  "ticket.user_replied": MessageSquare,
  "ticket.team_replied": MessageSquare,
  "ticket.status_changed_by_other": Bell,
  "ticket.priority_escalated": Flag,
};

// =====================================================================
// component
// =====================================================================

type Props = {
  notification: AdminNotification;
  onDismiss: (id: string) => void;
};

export function NotificationToast({ notification, onDismiss }: Props) {
  const t = useTranslations("admin.notifications");
  const router = useRouter();
  const meta = PRIORITY_META[notification.priority];
  const Icon = KIND_ICONS[notification.event_kind] ?? meta.icon;

  const [progress, setProgress] = useState(100);
  const [paused, setPaused] = useState(false);

  // Auto-dismiss with a progress bar. Pauses on hover.
  useEffect(() => {
    if (paused) return;

    const start = Date.now();
    const startProgress = progress;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remainingMs = (meta.ttl * startProgress) / 100 - elapsed;

      if (remainingMs <= 0) {
        clearInterval(interval);
        onDismiss(notification.id);
        return;
      }

      setProgress((remainingMs / meta.ttl) * 100);
    }, 50);

    return () => clearInterval(interval);
    // We intentionally exclude `progress` from deps so a hover pause
    // doesn't restart the timer — the reset happens when paused flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, meta.ttl, notification.id, onDismiss]);

  const handleClick = () => {
    if (notification.click_url) {
      // Use the i18n-aware router so locale prefix is preserved
      router.push(notification.click_url);
    }
    onDismiss(notification.id);
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDismiss(notification.id);
  };

  return (
    <div
      className={cn(
        "group relative w-[360px] max-w-[calc(100vw-2rem)]",
        "rounded-lg border border-border bg-popover shadow-2xl",
        "border-l-4 cursor-pointer overflow-hidden",
        "animate-in slide-in-from-right-4 fade-in duration-200",
        meta.border,
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="flex gap-3 px-4 py-3">
        {/* Icon */}
        <div
          className={cn(
            "shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5",
            "bg-muted/40",
          )}
        >
          <Icon className={cn("w-4 h-4", meta.tone)} strokeWidth={2} />
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug break-words">
                {notification.title}
              </p>
              {notification.body && (
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed break-words line-clamp-2">
                  {notification.body}
                </p>
              )}
            </div>

            {/* Dismiss */}
            <button
              type="button"
              onClick={handleDismiss}
              className={cn(
                "shrink-0 rounded p-1 -m-1 transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
              )}
              aria-label={t("toast_dismiss")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Footer hint */}
          {notification.click_url && (
            <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
              <span>{t("toast_click_to_open")}</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-border/40">
        <div
          className={cn(
            "h-full transition-[width] duration-50 ease-linear",
            notification.priority === "urgent" || notification.priority === "high"
              ? "bg-amber-500/60"
              : "bg-primary/40",
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
