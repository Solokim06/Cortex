"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type SettingsNavItem = {
  id: string;
  label: string;
};

type Props = {
  items: SettingsNavItem[];
  active: string;
};

export function SettingsNav({ items, active }: Props) {
  const t = useTranslations("settings");

  return (
    <nav
      aria-label={t("navAria")}
      className="sticky top-20 hidden md:block w-48 shrink-0"
    >
      <ul className="space-y-0.5">
        {items.map((item) => {
          const isActive = active === item.id;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={cn(
                  "block rounded-md px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
