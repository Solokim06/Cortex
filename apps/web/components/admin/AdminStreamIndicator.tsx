"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Wifi,
  WifiOff,
  Loader2,
  Radio,
  ChevronDown,
} from "lucide-react";
import { cn } from "cn";
import { useAdminStream } from "@/lib/hooks/use-admin-stream";

/**
 * Live-updates status indicator for the admin header.
 *
 * Shows:
 *   - A colored dot reflecting SSE state:
 *       green  = open
 *       amber  = connecting
 *       red    = error
 *       gray   = idle / closed
 *   - Click → dropdown showing state, mode, last-event, last-message timestamp
 *
 * Sits in the sidebar footer or admin header. Presents itself as a
 * "small, glanceable status" element.
 */
export function AdminStreamIndicator() {
  const t = useTranslations("admin.notifications");
  const { state, lastEvent, lastMessageAt } = useAdminStream(true);
  const [open, setOpen] = useState(false);
  // Elapsed seconds since last received message. We compute this *inside*
  // an interval (not during render), and store only the integer — keeping
  // the component pure.
  const [elapsedSec, setElapsedSec] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;

    const compute = () => {
      if (!lastMessageAt) {
        setElapsedSec(null);
        return;
      }
      setElapsedSec(Math.floor((Date.now() - lastMessageAt) / 1000));
    };

    // First compute happens asynchronously via a microtask — not
    // synchronously within the effect body, so the linter stays happy.
    const t = setTimeout(compute, 0);
    const i = setInterval(compute, 1000);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, [open, lastMessageAt]);

  const meta = statusMeta(state, t);
  const Icon = meta.icon;

  const lastMsgText =
    elapsedSec === null ? "—" : formatRelativeSeconds(elapsedSec, t);

  const lastEventText = lastEvent
    ? lastEvent.kind
    : "—";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px]",
          "border border-border bg-background hover:bg-accent/40 transition-colors",
        )}
        aria-label={t("stream_aria", { label: meta.label })}
      >
        <span className="relative flex w-2 h-2">
          {state === "open" && (
            <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-500 opacity-60 animate-ping" />
          )}
          <span
            className={cn(
              "relative inline-flex w-2 h-2 rounded-full",
              meta.dot,
            )}
          />
        </span>
        <span className="text-muted-foreground hidden sm:inline">
          {meta.label}
        </span>
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </button>

      {open && (
        <>
          {/* Backdrop to catch outside-click */}
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className={cn(
              "absolute right-0 top-full mt-1 z-40 min-w-70",
              "rounded-lg border border-border bg-popover shadow-lg overflow-hidden",
            )}
          >
            <div className="px-3 py-2 border-b border-border bg-card/40 flex items-center gap-2">
              <Icon className={cn("w-3.5 h-3.5", meta.tone)} />
              <span className="text-xs font-medium">{meta.label}</span>
            </div>

            <div className="px-3 py-2.5 space-y-2 text-xs">
              <Row label={t("stream_row_mode")}>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {state === "open"
                    ? t("stream_mode_streaming")
                    : t("stream_mode_disconnected")}
                </span>
              </Row>

              <Row label={t("stream_row_last_message")}>
                <span className="tabular-nums text-muted-foreground">
                  {lastMsgText}
                </span>
              </Row>

              <Row label={t("stream_row_last_event")}>
                <span className="font-mono text-[11px] text-muted-foreground truncate max-w-50">
                  {lastEventText}
                </span>
              </Row>

              {state === "error" && (
                <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-2 py-1.5 text-[10px] text-rose-500">
                  {t("stream_connection_lost")}
                </div>
              )}
            </div>

            <div className="px-3 pb-2.5 text-[10px] text-muted-foreground leading-tight">
              {t("stream_footer")}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// =====================================================================
// subcomponents
// =====================================================================

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

// =====================================================================
// helpers
// =====================================================================

function statusMeta(
  state: "idle" | "connecting" | "open" | "error" | "closed",
  t: ReturnType<typeof useTranslations>,
): {
  label: string;
  icon: typeof Wifi;
  tone: string;
  dot: string;
} {
  switch (state) {
    case "open":
      return {
        label: t("stream_label_live"),
        icon: Radio,
        tone: "text-emerald-500",
        dot: "bg-emerald-500",
      };
    case "connecting":
      return {
        label: t("stream_label_connecting"),
        icon: Loader2,
        tone: "text-amber-500",
        dot: "bg-amber-500",
      };
    case "error":
      return {
        label: t("stream_label_offline"),
        icon: WifiOff,
        tone: "text-rose-500",
        dot: "bg-rose-500",
      };
    case "closed":
      return {
        label: t("stream_label_reconnecting"),
        icon: Loader2,
        tone: "text-amber-500",
        dot: "bg-amber-500",
      };
    default:
      return {
        label: t("stream_label_idle"),
        icon: Wifi,
        tone: "text-muted-foreground",
        dot: "bg-muted-foreground/60",
      };
  }
}

function formatRelativeSeconds(
  sec: number,
  t: ReturnType<typeof useTranslations>,
): string {
  if (sec < 0) return t("stream_time_just_now");
  if (sec < 5) return t("stream_time_just_now");
  if (sec < 60) return t("stream_time_seconds", { n: sec });
  const min = Math.floor(sec / 60);
  if (min < 60) return t("stream_time_minutes", { n: min });
  const hr = Math.floor(min / 60);
  return t("stream_time_hours", { n: hr });
}
