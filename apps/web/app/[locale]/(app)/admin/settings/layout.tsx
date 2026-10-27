"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Clock, Wand2, Webhook, Bell, Mail } from "lucide-react";
import { cn } from "cn";

type SettingsTab = {
  href: string;
  labelKey: string;
  icon: typeof Clock;
};

const TABS: SettingsTab[] = [
  { href: "/admin/settings/sla", labelKey: "sla", icon: Clock },
  { href: "/admin/settings/macros", labelKey: "macros", icon: Wand2 },
  { href: "/admin/settings/webhooks", labelKey: "webhooks", icon: Webhook },
  { href: "/admin/settings/emails", labelKey: "emails", icon: Mail },
  { href: "/admin/settings/prefs", labelKey: "prefs", icon: Bell },
];

/**
 * Settings sub-layout.
 *
 * Renders a horizontal tab strip at the top; each tab is a real route.
 * Content is rendered by the matching page.tsx inside this layout.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useTranslations("admin.settings");

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header + tabs */}
      <header className="shrink-0 border-b border-border bg-card/20">
        <div className="px-5 pt-4 pb-3">
          <h1 className="text-base font-semibold">{t("title")}</h1>
        </div>

        <div className="flex items-center gap-1 px-3 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active =
              pathname === tab.href || pathname.startsWith(tab.href + "/");

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap",
                  "border-b-2 -mb-px transition-colors",
                  active
                    ? "border-primary text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {t(`tabs.${tab.labelKey}` as Parameters<typeof t>[0])}
              </Link>
            );
          })}
        </div>
      </header>

      {/* Page content */}
      <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
    </div>
  );
}
