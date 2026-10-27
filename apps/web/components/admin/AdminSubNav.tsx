"use client";

import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Inbox, BarChart3, Activity, Settings as SettingsIcon } from "lucide-react";
import { cn } from "cn";
import { AdminStreamIndicator } from "./AdminStreamIndicator";
import { AdminToaster } from "./AdminToaster";

type SubNavItem = {
  href: string;
  labelKey: string;
  icon: typeof Inbox;
};

const ITEMS: SubNavItem[] = [
  { href: "/admin/tickets", labelKey: "tickets", icon: Inbox },
  { href: "/admin/analytics", labelKey: "analytics", icon: BarChart3 },
  { href: "/admin/settings", labelKey: "settings", icon: SettingsIcon },
  { href: "/admin/health", labelKey: "health", icon: Activity },
];

/**
 * Top-level admin sub-navigation. Sits above all admin pages.
 *
 * Left side:  Tickets | Settings (active state via pathname prefix)
 * Right side: AdminStreamIndicator (live SSE status dot)
 */
export function AdminSubNav() {
  const pathname = usePathname();
  const t = useTranslations("admin.subnav");

  return (
    <nav className="shrink-0 flex items-center gap-1 px-4 border-b border-border bg-card/30">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium",
              "border-b-2 -mb-px transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {t(item.labelKey as Parameters<typeof t>[0])}
          </Link>
        );
      })}

      <div className="ml-auto py-1 flex items-center gap-2">
        <AdminToaster />
        <AdminStreamIndicator />
      </div>
    </nav>
  );
}
