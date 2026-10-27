"use client";

import { useState } from "react";
import { Bell as BellIcon, Check, CheckCheck, X, Inbox, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import {
  useNotifications,
  type UserNotification,
} from "@/lib/hooks/use-notifications";

export function Bell() {
  const t = useTranslations("bell");
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const [open, setOpen] = useState(false);

  const {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    dismiss,
    clearAll,
  } = useNotifications(!!isSignedIn);

  const handleClick = async (n: UserNotification) => {
    setOpen(false);
    if (!n.read) await markRead(n.id);
    if (n.click_url) router.push(n.click_url);
  };

  const hasUnread = unreadCount > 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("ariaLabel")}
        className={cn(
          "relative inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
          open && "bg-accent text-foreground",
        )}
      >
        <BellIcon className="w-4 h-4" />
        {hasUnread && (
          <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-11 z-50 w-80 max-h-96 overflow-hidden rounded-lg border border-border bg-popover shadow-xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
              <span className="text-xs font-medium text-foreground">
                {t("title")}
                {hasUnread && (
                  <span className="ml-2 text-[10px] text-muted-foreground font-normal">
                    {t("unread_count", { n: unreadCount })}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                {hasUnread && (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    title={t("mark_all_read_title")}
                  >
                    <CheckCheck className="w-3 h-3" />
                    {t("mark_read")}
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void clearAll()}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-rose-500 transition-colors"
                    title={t("clear_all_title")}
                  >
                    <Trash2 className="w-3 h-3" />
                    {t("clearAll")}
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                  <Inbox className="w-5 h-5 opacity-50" />
                  <p className="text-xs">{t("empty")}</p>
                </div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {notifications.map((n) => (
                    <li key={n.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => void handleClick(n)}
                        className={cn(
                          "w-full text-left px-3 py-2.5 hover:bg-accent/40 transition-colors",
                          !n.read && "bg-primary/4",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {/* Unread dot */}
                          <span
                            className={cn(
                              "mt-1.5 w-1.5 h-1.5 rounded-full shrink-0",
                              n.read ? "bg-transparent" : "bg-primary",
                            )}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "text-xs truncate",
                                n.read
                                  ? "text-muted-foreground font-normal"
                                  : "text-foreground font-medium",
                              )}
                            >
                              {n.title}
                            </p>
                            {n.body && (
                              <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2 leading-snug">
                                {n.body}
                              </p>
                            )}
                            {n.ticket_subject && (
                              <p className="mt-1 text-[10px] text-muted-foreground truncate">
                                {n.ticket_subject}
                              </p>
                            )}
                          </div>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              void dismiss(n.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.stopPropagation();
                                void dismiss(n.id);
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 rounded p-1 hover:bg-accent/60 transition-opacity shrink-0"
                            aria-label={t("dismiss_aria")}
                          >
                            <X className="w-3 h-3 text-muted-foreground" />
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="border-t border-border px-3 py-1.5 flex items-center justify-center shrink-0">
                <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  {t("live")}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
