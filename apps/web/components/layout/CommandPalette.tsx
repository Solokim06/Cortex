"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Command } from "cmdk";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { NAV_ITEMS } from "@/lib/nav";
import { Plus, Search, Languages as LanguagesIcon } from "lucide-react";
import { localeNamesLocalized, locales, type Locale } from "@/i18n/config";

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

type PaletteContextType = {
  open: () => void;
  close: () => void;
  isOpen: boolean;
};

const PaletteContext = createContext<PaletteContextType | null>(null);

export function useCommandPalette() {
  const ctx = useContext(PaletteContext);
  if (!ctx) {
    throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  }
  return ctx;
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = useLocale() as Locale;
  const t = useTranslations("commandPalette");
  const tSidebar = useTranslations("sidebar");

  // Global Ctrl+K / Cmd+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        if (isOpen) return;
      }
      e.preventDefault();
      setIsOpen((v) => !v);
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [isOpen]);

  const navigate = (href: string) => {
    setIsOpen(false);
    router.push(href);
  };

  /**
   * Switch locale by rewriting the current pathname with the new prefix.
   * English (default) gets no prefix; others get /<locale>/...
   *
   * Also persists the choice in the NEXT_LOCALE cookie BEFORE navigating,
   * so the middleware negotiates the new locale on the next request.
   */
  const switchLocale = (locale: Locale) => {
    setIsOpen(false);
    if (locale === currentLocale) return;

    setLocaleCookie(locale);

    // Strip any existing locale prefix from pathname
    let path = pathname;
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

  return (
    <PaletteContext.Provider
      value={{
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        isOpen,
      }}
    >
      {children}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="p-0 overflow-hidden max-w-xl bg-card border-border">
          <Command className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4">
            <div className="flex items-center border-b border-border px-3">
              <Search className="w-4 h-4 text-muted-foreground mr-2" />
              <Command.Input
                placeholder={t("searchPlaceholder")}
                className="flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <Command.List className="max-h-80 overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t("noResults")}
              </Command.Empty>

              <Command.Group heading={t("quickActions")}>
                <Command.Item
                  onSelect={() => navigate("/capture")}
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm cursor-pointer data-[selected=true]:bg-accent data-[selected=true]:text-foreground"
                >
                  <Plus className="w-4 h-4 text-primary" />
                  <span>{tSidebar("capture")}</span>
                </Command.Item>
              </Command.Group>

              <Command.Group heading={t("navigate")}>
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const key = item.href.replace("/", "") as Parameters<
                    typeof tSidebar
                  >[0];
                  return (
                    <Command.Item
                      key={item.href}
                      onSelect={() => navigate(item.href)}
                      className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm cursor-pointer data-[selected=true]:bg-accent data-[selected=true]:text-foreground"
                    >
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <span className="flex-1">{tSidebar(key)}</span>
                      {item.hint && (
                        <span className="text-xs text-muted-foreground">
                          {item.hint}
                        </span>
                      )}
                    </Command.Item>
                  );
                })}
              </Command.Group>

              <Command.Group heading={t("languages")}>
                {locales.map((loc) => (
                  <Command.Item
                    key={loc}
                    onSelect={() => switchLocale(loc)}
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm cursor-pointer data-[selected=true]:bg-accent data-[selected=true]:text-foreground"
                  >
                    <LanguagesIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="flex-1">
                      {localeNamesLocalized[currentLocale][loc] ??
                        loc.toUpperCase()}
                    </span>
                    {loc === currentLocale && (
                      <span className="text-xs text-primary">
                        {t("current")}
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </PaletteContext.Provider>
  );
}
