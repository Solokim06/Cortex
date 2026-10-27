"use client";

import { useState, useEffect } from "react";
import { useTheme } from "@teispace/next-themes";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { Sun, Moon, Monitor, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  locales,
  localeNamesLocalized,
  type Locale,
} from "@/i18n/config";
import {
  useUserPrefs,
  usePatchUserPrefs,
} from "@/lib/hooks/use-user-prefs";

const VOICES = [
  { id: "mira", label: "Mira" },
  { id: "aria", label: "Aria" },
  { id: "atlas", label: "Atlas" },
  { id: "lyra", label: "Lyra" },
  { id: "orion", label: "Orion" },
];

/**
 * Persist the chosen locale in the NEXT_LOCALE cookie.
 * Extracted into a helper so React 19's `react-hooks/immutability` lint
 * rule doesn't flag direct mutation of `document.cookie` inside the
 * component body.
 */
function setLocaleCookie(locale: string) {
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=${
    60 * 60 * 24 * 365
  }; samesite=lax`;
}

export function GeneralPanel() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const t = useTranslations("settings");
  const currentLocale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();

  // Voice is server-persisted per-user. We fall back to "mira" until
  // the prefs query resolves.
  const prefsQuery = useUserPrefs();
  const patchPrefs = usePatchUserPrefs();
  const voice = prefsQuery.data?.voice ?? "mira";
  // keep the setter name for the rest of the component
  const setVoice = (id: string) => {
    patchPrefs.mutate(
      { voice: id },
      {
        onSuccess: () => {
          const label = VOICES.find((v) => v.id === id)?.label ?? id;
          toast.success(`Voice switched to ${label}`);
        },
        onError: () => {
          toast.error("Couldn't switch voice. Try again.");
        },
      },
    );
  };

  const switchLocale = (locale: Locale) => {
    if (locale === currentLocale) return;

    setLocaleCookie(locale);

    // Strip an existing locale prefix from the current path.
    let path = pathname ?? "/";
    for (const loc of locales) {
      if (path === `/${loc}`) {
        path = "/";
        break;
      }
      if (path.startsWith(`/${loc}/`)) {
        path = path.slice(loc.length + 1);
        break;
      }
    }

    const target = locale === "en" ? path : `/${locale}${path}`;
    router.push(target);
    router.refresh();
  };

  const handleVoice = (id: string) => {
    setVoice(id);
  };

  const themeOptions = [
    { key: "light" as const, label: t("themeLight"), Icon: Sun },
    { key: "dark" as const, label: t("themeDark"), Icon: Moon },
    { key: "system" as const, label: t("themeSystem"), Icon: Monitor },
  ];

  const languageOptions = locales.map((loc) => ({
    value: loc,
    label: localeNamesLocalized[currentLocale][loc] ?? loc.toUpperCase(),
  }));

  return (
    <div className="space-y-6">
      {/* Theme */}
      <div>
        <p className="text-sm font-medium mb-1">{t("themeTitle")}</p>
        <p className="text-xs text-muted-foreground mb-3">
          {t("themeDescription")}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {themeOptions.map(({ key, label, Icon }) => {
            const active = theme === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTheme(key)}
                className={cn(
                  "group relative flex flex-col items-center gap-2 rounded-lg border p-3.5 transition-all",
                  active
                    ? "border-primary/60 bg-primary/5"
                    : "border-border bg-card/40 hover:border-primary/40 hover:bg-card/60",
                )}
                aria-pressed={active}
              >
                <Icon
                  className={cn(
                    "w-4 h-4 transition-colors",
                    active
                      ? "text-primary"
                      : "text-muted-foreground group-hover:text-foreground",
                  )}
                  strokeWidth={1.75}
                />
                <span
                  className={cn(
                    "text-xs font-medium",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
                {active && (
                  <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          {t("themeCurrentlyUsing", {
            theme:
              resolvedTheme === "dark"
                ? t("themeDark").toLowerCase()
                : t("themeLight").toLowerCase(),
          })}
        </p>
      </div>

      {/* Language */}
      <div className="border-t border-border/60 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t("languageTitle")}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {t("languageDescription")}
            </p>
          </div>
          <div className="shrink-0">
            <Select
              value={currentLocale}
              options={languageOptions}
              onChange={(v) => switchLocale(v as Locale)}
            />
          </div>
        </div>
      </div>

      {/* Voice */}
      <div className="border-t border-border/60 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t("voiceTitle")}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {t("voiceDescription")}
            </p>
          </div>
          <div className="shrink-0">
            <Select
              value={voice}
              options={VOICES.map((v) => ({
                value: v.id,
                label: v.label,
              }))}
              onChange={handleVoice}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

type SelectOption = { value: string; label: string };

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-select-root]")) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div className="relative" data-select-root>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-2 rounded-md border border-border bg-background/40 px-3 py-1.5 text-xs text-foreground transition-colors min-w-32.5 justify-between",
          "hover:border-primary/40 hover:bg-card/60",
          open && "border-primary/60",
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{current.label}</span>
        <ChevronDown
          className={cn(
            "w-3 h-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          strokeWidth={1.75}
        />
      </button>

      {open && (
        <div
          className={cn(
            "absolute right-0 top-full mt-1.5 z-50",
            "min-w-full max-h-64 overflow-y-auto",
            "rounded-md border border-border bg-popover shadow-lg",
            "py-1",
          )}
          role="listbox"
        >
          {options.map((opt) => {
            const isActive = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors",
                  isActive
                    ? "bg-accent/60 text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
                )}
                role="option"
                aria-selected={isActive}
              >
                <span className="flex-1 truncate">{opt.label}</span>
                {isActive && (
                  <Check
                    className="w-3 h-3 shrink-0 text-primary"
                    strokeWidth={2}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
