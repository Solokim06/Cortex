"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAdminMe } from "@/lib/hooks/use-admin-me";
import { useAdminStream } from "@/lib/hooks/use-admin-stream";
import { AdminSubNav } from "@/components/admin/AdminSubNav";

/**
 * Admin shell.
 *
 * Responsibilities:
 *   1. Gate the route on is_admin (via /admin/me)
 *   2. Open a live SSE stream and invalidate caches on remote mutations
 *   3. Provide a consistent page frame (title bar slot + content area)
 *
 * Non-admins are redirected back to /home instead of being shown a 403 —
 * there's no reason to advertise the admin URL's existence to them.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const { isAdmin, isLoading } = useAdminMe();
  const queryClient = useQueryClient();

  // Live updates: any event starting with "ticket." or equal to
  // "tickets.bulk_updated" invalidates the relevant caches. We don't
  // touch caches on "connected" or pings — those aren't mutations.
  useAdminStream(!!isAdmin, (event) => {
    if (event.kind.startsWith("ticket.") || event.kind === "tickets.bulk_updated") {
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["admin-search"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-all-tags"] });

      // If the event targets a specific ticket, invalidate its detail
      if (event.ticket_id) {
        queryClient.invalidateQueries({
          queryKey: ["admin-ticket", event.ticket_id],
        });
        queryClient.invalidateQueries({
          queryKey: ["admin-ticket-events", event.ticket_id],
        });
      }
    }
  });

  // Redirect non-admins once we know who they are
  useEffect(() => {
    if (!isLoading && !isAdmin) {
      router.replace("/home");
    }
  }, [isLoading, isAdmin, router]);

  // While we're still checking, show a spinner
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If we've checked and they aren't admin, render nothing while the
  // redirect fires — avoids a flash of the "denied" screen.
  if (!isAdmin) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 min-h-[50vh] text-muted-foreground">
        <ShieldAlert className="w-8 h-8" />
        <p className="text-sm">{t("redirecting")}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <AdminSubNav />
      <div className="flex-1 flex flex-col min-h-0">
        {children}
      </div>
    </div>
  );
}
