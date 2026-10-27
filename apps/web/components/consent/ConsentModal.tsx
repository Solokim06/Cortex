"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Cookie, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CATEGORIES,
  type ConsentCategory,
  type ConsentState,
  defaultConsent,
} from "@/lib/consent";
import { useConsent } from "./ConsentContext";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

type ToggleRowProps = {
  category: ConsentCategory;
  label: string;
  description: string;
  checked: boolean;
  locked?: boolean;
  onChange: (v: boolean) => void;
};

function ToggleRow({
  label,
  description,
  checked,
  locked,
  onChange,
}: ToggleRowProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-lg border border-border/60 px-4 py-3.5",
        locked ? "bg-accent/20" : "bg-card/40",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{label}</p>
          {locked && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Lock className="w-2.5 h-2.5" />
            </span>
          )}
        </div>
        <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
          {description}
        </p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={locked}
        onClick={() => !locked && onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          checked ? "bg-primary" : "bg-muted",
          locked && "opacity-60 cursor-not-allowed",
        )}
      >
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4.75" : "translate-x-0.75",
          )}
        />
      </button>
    </div>
  );
}

export function ConsentModal({ open, onOpenChange }: Props) {
  const t = useTranslations("consent.modal");
  const tCat = useTranslations("consent.categories");
  const { consent, acceptAll, analyticsOnly, saveSettings } = useConsent();

  // Local working copy. Initialized from the current consent state (or
  // defaults) on mount. The parent Dialog re-keys the inner content when
  // it opens, so this initializer runs fresh on each open without needing
  // an effect.
  const [draft, setDraft] = useState<ConsentState>(
    () => consent ?? defaultConsent(),
  );


  const toggle = (cat: ConsentCategory) => (v: boolean) => {
    setDraft((d) => ({ ...d, [cat]: v }));
  };

  const handleSave = () => {
    // saveSettings picks the togglable categories and keeps essential locked.
    saveSettings({
      personalization: draft.personalization,
      performance: draft.performance,
      aiProcessing: draft.aiProcessing,
      marketing: draft.marketing,
    });
    onOpenChange(false);
  };

  const handleAcceptAll = () => {
    acceptAll();
    onOpenChange(false);
  };

  const handleAnalyticsOnly = () => {
    analyticsOnly();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
      <DialogContent
        key="consent-modal-content"
        showCloseButton={false}
        style={{
          maxWidth: "min(56rem, calc(100vw - 2rem))",
          width: "44rem",
        }}
        className="p-0 gap-0 overflow-hidden bg-card border-border/70"
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-6 pt-6 pb-4 border-b border-border/60">
          <div className="rounded-md bg-primary/10 p-2 shrink-0">
            <Cookie className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold tracking-tight">
              {t("title")}
            </h2>
            <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
              {t("subtitle")}{" "}
              <a
                href="/privacy/cookies"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                {t("learnMore")}
              </a>
            </p>
          </div>
        </div>

        {/* Categories */}
        <div className="px-6 py-5 space-y-2.5 max-h-[60vh] overflow-y-auto">
          {CATEGORIES.map(({ key, locked }) => (
            <ToggleRow
              key={key}
              category={key}
              label={tCat(`${key}.label`)}
              description={tCat(`${key}.description`)}
              checked={draft[key] === true}
              locked={locked}
              onChange={toggle(key)}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-t border-border/60 bg-accent/10">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              className="text-[12px] h-9"
            >
              {t("saveSettings")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAnalyticsOnly}
              className="text-[12px] h-9 text-muted-foreground"
            >
              {t("analyticsOnly")}
            </Button>
          </div>

          <Button
            size="sm"
            onClick={handleAcceptAll}
            className="text-[12px] h-9"
          >
            {t("acceptAll")}
          </Button>
        </div>
      </DialogContent>
      )}
    </Dialog>
  );
}
