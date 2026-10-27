"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  X,
  Palette,
  Globe,
  User as UserIcon,
  Database,
  Info,
  Bell,
  Sparkles,
  Shield,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { GeneralPanel } from "./panels/GeneralPanel";
import { AgentPanel } from "./panels/AgentPanel";
import { ExtensionPanel } from "./panels/ExtensionPanel";
import { AccountPanel } from "./panels/AccountPanel";
import { DataPanel } from "./panels/DataPanel";
import { NotificationsPanel } from "./panels/NotificationsPanel";
import { AboutPanel } from "./panels/AboutPanel";
import { PrivacyPanel } from "./panels/PrivacyPanel";

type TabKey = "general" | "agent" | "extension" | "account" | "notifications" | "data" | "privacy" | "about";

type Tab = {
  key: TabKey;
  labelKey: "general" | "agent" | "extension" | "account" | "notifications" | "data" | "privacyTab" | "about";
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

const TABS: Tab[] = [
  { key: "general", labelKey: "general", Icon: Palette },
  { key: "agent", labelKey: "agent", Icon: Sparkles },
  { key: "extension", labelKey: "extension", Icon: Globe },
  { key: "account", labelKey: "account", Icon: UserIcon },
  { key: "notifications", labelKey: "notifications", Icon: Bell },
  { key: "data", labelKey: "data", Icon: Database },
  { key: "privacy", labelKey: "privacyTab", Icon: Shield },
  { key: "about", labelKey: "about", Icon: Info },
];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTab?: TabKey;
};

export function SettingsDialog({ open, onOpenChange, defaultTab }: Props) {
  const t = useTranslations("settings");
  const [tab, setTab] = useState<TabKey>(defaultTab ?? "general");

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open && defaultTab && tab !== defaultTab) {
      setTab(defaultTab);
    }
  }

  const Panel = {
    general: GeneralPanel,
    agent: AgentPanel,
    extension: ExtensionPanel,
    account: AccountPanel,
    notifications: NotificationsPanel,
    data: DataPanel,
    privacy: PrivacyPanel,
    about: AboutPanel,
  }[tab];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{
          maxWidth: "min(56rem, calc(100vw - 2rem))",
          width: "56rem",
          height: "min(600px, calc(100vh - 4rem))",
        }}
        className={cn(
          "p-0 gap-0 overflow-hidden",
          "bg-card border-border/70 shadow-2xl shadow-black/40",
          "flex flex-col",
          "sm:max-w-none",
          // Hide the default shadcn X button (we render our own below)
          "[&>button]:hidden",
        )}
      >
        <DialogTitle className="sr-only">{t("title")}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("dialogDescription")}
        </DialogDescription>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5 shrink-0">
          <h2 className="text-[15px] font-semibold tracking-tight">
            {t("title")}
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t("closeAria")}
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Body — stacks vertically on mobile, side-by-side on desktop */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0">
          {/* Tabs */}
          <nav
            aria-label={t("navAria")}
            className={cn(
              "shrink-0 border-b md:border-b-0 md:border-r border-border/60",
              "w-full md:w-52",
              "flex md:flex-col",
              "overflow-x-auto md:overflow-x-hidden",
              "p-3 md:py-4 md:px-3 gap-1",
            )}
          >
            {TABS.map(({ key, labelKey, Icon }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors shrink-0",
                    "text-left whitespace-nowrap",
                    active
                      ? "bg-accent/60 text-foreground"
                      : "text-muted-foreground hover:bg-accent/30 hover:text-foreground",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    className={cn(
                      "w-4 h-4 shrink-0 transition-colors",
                      active
                        ? "text-foreground"
                        : "text-muted-foreground group-hover:text-foreground",
                    )}
                    strokeWidth={1.75}
                  />
                  <span>{t(labelKey)}</span>
                </button>
              );
            })}
          </nav>

          {/* Panel */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            <div
              key={tab}
              className="px-5 md:px-7 py-6 animate-[fadeIn_180ms_ease-out] max-w-2xl"
            >
              <Panel />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
