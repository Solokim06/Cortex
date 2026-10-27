"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ADMIN_NAV_ITEM, NAV_ITEMS, type NavItem } from "@/lib/nav";
import { useAgentActionsSummary } from "@/lib/hooks/use-agent-actions";
import { Brain, Settings as SettingsIcon } from "lucide-react";
import { useSettingsDialog } from "@/lib/hooks/use-settings-dialog";
import { useAdminMe } from "@/lib/hooks/use-admin-me";
import { ChatsSection } from "./ChatsSection";
import { RELEASES } from "@/lib/changelog";

type Props = {
  onNavigate?: () => void;
};

export function Sidebar({ onNavigate }: Props = {}) {
  const pathname = usePathname();
  const { toggle: toggleSettings } = useSettingsDialog();
  const t = useTranslations("sidebar");
  const tCommon = useTranslations("common");
  const agentSummary = useAgentActionsSummary();
  const { isAdmin } = useAdminMe();

  // Admins see one extra entry at the bottom of the nav.
  const navItems: NavItem[] = isAdmin
    ? [...NAV_ITEMS, ADMIN_NAV_ITEM]
    : NAV_ITEMS;

  return (
    <aside
      className="hidden md:flex md:flex-col w-70 shrink-0 border-r border-border bg-card/40 backdrop-blur-sm"
      style={{ paddingLeft: "var(--safe-left)" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 h-14 border-b border-border">
        <Brain className="w-5 h-5 text-primary" />
        <span className="font-semibold tracking-tight">
          {tCommon("appName")}
        </span>
      </div>

      {/* Nav + Chats --- shared scroll container */}
      <div className="flex-1 overflow-y-auto">
        <nav className="p-3 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          // Translate when a key exists; otherwise use the hardcoded label.
          // Admin entries aren't in messages/*.json --- this keeps them quiet.
          const derivedKey = item.href.replace("/", "");
          let label: string;
          if (derivedKey === "admin") {
            label = item.label;
          } else {
            label = t(derivedKey as Parameters<typeof t>[0]);
          }

          // Show a badge on the Chat item when there are pending/failed
          // agent actions that need attention.
          const showBadge = derivedKey === "chat" && agentSummary.total > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "w-4 h-4 shrink-0 transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              <span className="flex-1 truncate">{label}</span>
              {showBadge && (
                <span className="shrink-0 rounded-full bg-amber-500/15 text-amber-500 px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                  {agentSummary.total}
                </span>
              )}
              {active && (
                <span className="w-1 h-1 rounded-full bg-primary" aria-hidden />
              )}
            </Link>
          );
        })}
        </nav>

        {/* Chat history */}
        <div className="px-3 pb-3">
          <ChatsSection />
        </div>
      </div>

      {/* Settings + Footer */}
      <div className="p-3 border-t border-border space-y-2">
        <button
          type="button"
          onClick={() => {
            toggleSettings();
            onNavigate?.();
          }}
          className={cn(
            "group w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
            "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
        >
          <SettingsIcon className="w-4 h-4 shrink-0 transition-colors text-muted-foreground group-hover:text-foreground" />
          <span className="flex-1 text-left">{t("settings")}</span>
          <kbd className="text-[10px] font-mono text-muted-foreground border border-border rounded px-1 py-0.5 shrink-0">
            &#8984;,
          </kbd>
        </button>

        <div className="px-3 pt-1 pb-0.5">
          <p className="text-[10px] font-medium text-muted-foreground">
            Cortex {RELEASES[0]?.version ?? "v0.1"}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <span aria-hidden className="opacity-40">&middot;</span>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <span aria-hidden className="opacity-40">&middot;</span>
            <Link
              href="/contact"
              className="hover:text-foreground transition-colors"
            >
              Contact
            </Link>
          </p>
        </div>
      </div>
    </aside>
  );
}
