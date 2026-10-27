"use client";

import { useTranslations } from "next-intl";
import { Upload, Camera, Mic, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

type MenuAction = "upload" | "camera" | "voice" | "url";

type Props = {
  onSelect: (action: MenuAction) => void;
  onClose: () => void;
  className?: string;
};

type MenuItem = {
  action: MenuAction;
  labelKey: string;
  descriptionKey: string;
  icon: React.ComponentType<{ className?: string }>;
};

const MENU_ITEMS: MenuItem[] = [
  {
    action: "upload",
    labelKey: "uploadLabel",
    descriptionKey: "uploadDescription",
    icon: Upload,
  },
  {
    action: "camera",
    labelKey: "cameraLabel",
    descriptionKey: "cameraDescription",
    icon: Camera,
  },
  {
    action: "voice",
    labelKey: "voiceLabel",
    descriptionKey: "voiceDescription",
    icon: Mic,
  },
  {
    action: "url",
    labelKey: "urlLabel",
    descriptionKey: "urlDescription",
    icon: Link2,
  },
];

export function AttachmentMenu({ onSelect, onClose, className }: Props) {
  const t = useTranslations("attachments.menu");

  return (
    <div
      className={cn(
        "absolute bottom-full mb-2 left-0 z-50 w-64 rounded-lg border border-border bg-popover shadow-lg overflow-hidden",
        className,
      )}
      role="menu"
    >
      {MENU_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.action}
            type="button"
            onClick={() => {
              onSelect(item.action);
              onClose();
            }}
            className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors"
            role="menuitem"
          >
            <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight">
                {t(item.labelKey as Parameters<typeof t>[0])}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t(item.descriptionKey as Parameters<typeof t>[0])}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
