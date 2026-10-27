"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Bell, CheckCheck, X } from "lucide-react";
import { cn } from "cn";
import { useRouter } from "@/i18n/navigation";
import { NotificationToast } from "./NotificationToast";
import {
  useAdminNotifications,
  type AdminNotification,
} from "@/lib/hooks/use-admin-notifications";

const MAX_VISIBLE_TOASTS = 3;

/**
 * Admin toaster.
 *
 * Mounts the SSE subscription for real-time notifications and renders
 * the visible toast stack + the bell button.
 *
 * Behavior:
 *   - On any new notification, the hook adds it to a local buffer and
 *     calls onNewNotification here.
 *   - We keep at most MAX_VISIBLE_TOASTS on screen at once (oldest
 *     fades out when a newer one arrives).
 *   - The bell shows unread count and, on click, a dropdown of the
 *     last 20 notifications.
 *   - Clicking a toast or a bell row navigates to the ticket.
 */
export function AdminToaster() {
  const t = useTranslations("bell");
  const router = useRouter();

  // Which notification ids are currently visible as toasts (subset of
  // the hook's full buffer).
  const [visible, setVisible] = useState<AdminNotification[]>([]);
  const [bellOpen, setBellOpen] = useState(false);

  const handleNewNotification = useCallback((n: AdminNotification) => {
    setVisible((prev) => {
      const next = [n, ...prev];
      return next.slice(0, MAX_VISIBLE_TOASTS);
    });
  }, []);

  const {
    notifications,
    unreadCount,
    state,
    dismiss,
    clearAll,
    markAllRead,
  } = useAdminNotifications(true, handleNewNotification);

  const dismissVisible = useCallback((id: string) => {
    setVisible((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const handleBellToggle = () => {
    setBellOpen((o) => !o);
    if (!bellOpen) {
      // Opening the bell marks everything read
      markAllRead();
    }
  };

  const handleBellItemClick = (n: AdminNotification) => {
    if (n.click_url) router.push(n.click_url);
    setBellOpen(false);
  };

  return (
    <>
      {/* Toast stack — bottom right */}
      <div
        className={cn(
          "fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 pointer-events-none",
        )}
        aria-live="polite"
        aria-atomic="true"
      >
        {visible.map((n) => (
          <div key={n.id} className="pointer-events-auto">
            <NotificationToast
              notification={n}
              onDismiss={dismissVisible}
            />
          </div>
        ))}
      </div>

      {/* Bell — rendered into the admin sub-nav via a portal-like
          sibling. AdminSubNav places <AdminToaster /> inline; the bell
          is absolutely positioned within the nav. */}

      {/* Backdrop for bell dropdown — catches outside clicks */}
      {bellOpen && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setBellOpen(false)}
          aria-hidden
        />
      )}

      {/* Bell button + dropdown — positioned absolutely within the
          sub-nav's right slot. AdminSubNav contains a
          `<div data-notif-bell-slot />` for this. */}
      <div className="relative z-40">
        <button
          type="button"
          onClick={handleBellToggle}
          aria-label={t("admin_aria", { n: unreadCount })}
          className={cn(
            "relative inline-flex items-center justify-center rounded-md",
            "h-7 w-7",
            "border border-border bg-background hover:bg-accent/40 transition-colors",
            state === "open" ? "" : "opacity-70",
          )}
        >
          <Bell className="w-3.5 h-3.5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute -top-1 -right-1 min-w-[16px] h-4 px-1",
                "rounded-full bg-rose-500 text-white",
                "text-[9px] font-medium leading-4 text-center",
              )}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {bellOpen && (
          <div
            className={cn(
              "absolute right-0 top-full mt-1 z-40",
              "w-80 max-w-[calc(100vw-2rem)]",
              "rounded-lg border border-border bg-popover shadow-2xl",
              "overflow-hidden",
            )}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <Bell className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">
                {t("admin_title")}
              </span>
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className={cn(
                    "ml-auto inline-flex items-center gap-1 text-[10px]",
                    "text-muted-foreground hover:text-foreground transition-colors",
                  )}
                >
                  <CheckCheck className="w-3 h-3" />
                  {t("admin_clear_all")}
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-1.5 text-muted-foreground">
                  <Bell className="w-4 h-4 opacity-40" />
                  <p className="text-[11px]">{t("admin_empty")}</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <BellRow
                    key={n.id}
                    notification={n}
                    onClick={() => handleBellItemClick(n)}
                    onDismiss={() => dismiss(n.id)}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// =====================================================================
// bell row
// =====================================================================

function BellRow({
  notification,
  onClick,
  onDismiss,
}: {
  notification: AdminNotification;
  onClick: () => void;
  onDismiss: () => void;
}) {
  const t = useTranslations("bell");
  const tone =
    notification.priority === "urgent"
      ? "text-rose-500"
      : notification.priority === "high"
        ? "text-amber-500"
        : "text-muted-foreground";

  return (
    <div
      className={cn(
        "group flex items-start gap-2.5 px-3 py-2",
        "hover:bg-accent/20 cursor-pointer transition-colors",
        "border-b border-border/40 last:border-b-0",
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className={cn("shrink-0 w-6 h-6 rounded-md flex items-center justify-center mt-0.5 bg-muted/40", tone)}>
        <Bell className="w-3 h-3" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium leading-snug break-words">
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
            {notification.body}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
          {timeAgo(notification.at, t)}
        </p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className={cn(
          "shrink-0 rounded p-1 -m-1 text-muted-foreground/40 hover:text-foreground",
          "opacity-0 group-hover:opacity-100 transition-opacity",
        )}
        aria-label={t("admin_dismiss_aria")}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// =====================================================================
// helpers
// =====================================================================

function timeAgo(
  iso: string,
  t: ReturnType<typeof useTranslations>,
): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return t("admin_time_just_now");
  if (diff < 3600) return t("admin_time_minutes", { n: Math.floor(diff / 60) });
  if (diff < 86400) return t("admin_time_hours", { n: Math.floor(diff / 3600) });
  return new Date(iso).toLocaleDateString();
}
