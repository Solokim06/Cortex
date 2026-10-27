"use client";

import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { Command, Menu, Brain, Settings as SettingsIcon } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useCommandPalette } from "@/components/layout/CommandPalette";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Bell } from "@/components/layout/Bell";
import { NAV_ITEMS, ADMIN_NAV_ITEM } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { RELEASES } from "@/lib/changelog";
import { useAdminMe } from "@/lib/hooks/use-admin-me";
import { useSettingsDialog } from "@/lib/hooks/use-settings-dialog";
import { ChatsSection } from "./ChatsSection";

export function Topbar() {
  const { open } = useCommandPalette();
  const { toggle: toggleSettings } = useSettingsDialog();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("topbar");
  const tCommon = useTranslations("common");
  const tSidebar = useTranslations("sidebar");
  const { isAdmin } = useAdminMe();

  const navItems = isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

  return (
    <header
      className="flex items-center justify-between h-14 px-4 md:px-6 border-b border-border bg-background/60 backdrop-blur-sm sticky z-30"
      style={{ top: "var(--safe-top)" }}
    >
      {/* Mobile: hamburger + logo */}
      <div className="md:hidden flex items-center gap-2">
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger
            aria-label={t("openMenu")}
            className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Menu className="w-5 h-5" />
          </SheetTrigger>
          
          <SheetContent
            side="left"
            className="p-0 w-64 bg-card border-r border-border flex flex-col h-full"
          >
            {/* Drawer logo */}
            <div className="flex items-center gap-2 px-5 h-14 border-b border-border shrink-0">
              <Brain className="w-5 h-5 text-primary" />
              <span className="font-semibold tracking-tight">
                {tCommon("appName")}
              </span>
            </div>

            {/* Scrollable middle area */}
            <div className="flex-1 overflow-y-auto">
              {/* Drawer nav */}
              <nav className="p-3 space-y-0.5">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");
                  
                  let label: string;
                  const derivedKey = item.href.replace("/", "");
                  if (derivedKey === "admin") {
                    label = item.label;
                  } else {
                    label = tSidebar(derivedKey as Parameters<typeof tSidebar>[0]);
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setDrawerOpen(false)}
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
                      {active && (
                        <span
                          className="w-1 h-1 rounded-full bg-primary"
                          aria-hidden
                        />
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

            {/* Fixed Footer */}
            <div className="p-3 pb-8 border-t border-border shrink-0 space-y-2">
              <button
                type="button"
                onClick={() => {
                  toggleSettings();
                  setDrawerOpen(false);
                }}
                className="group w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              >
                <SettingsIcon className="w-4 h-4 shrink-0 transition-colors text-muted-foreground group-hover:text-foreground" />
                <span className="flex-1 text-left">{tSidebar("settings")}</span>
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
                  <Link href="/contact" className="hover:text-foreground transition-colors">
                    Contact
                  </Link>
                </p>
              </div>
            </div>
          </SheetContent>
        </Sheet>
        
        <span className="font-semibold tracking-tight">
          {tCommon("appName")}
        </span>
      </div>

      {/* Desktop: command palette trigger */}
      <button
        onClick={open}
        className="hidden md:flex items-center gap-3 w-72 rounded-md border border-border bg-card/40 px-3 py-1.5 text-sm text-muted-foreground hover:bg-card/70 transition-colors"
      >
        <Command className="w-3.5 h-3.5" />
        <span className="flex-1 text-left">{t("searchPlaceholder")}</span>
        <kbd className="pointer-events-none select-none rounded border border-border bg-background px-1.5 text-[10px] font-mono text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      {/* Mobile: search trigger */}
      <button
        onClick={open}
        className="md:hidden flex items-center justify-center h-9 w-9 rounded-md border border-border bg-card/40 text-muted-foreground hover:bg-card/70 transition-colors"
        aria-label={t("searchPlaceholder")}
      >
        <Command className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-2">
        <Bell />
        <UserButton
          appearance={{
            elements: {
              avatarBox: "w-8 h-8",
            },
          }}
        />
      </div>
    </header>
  );
}
