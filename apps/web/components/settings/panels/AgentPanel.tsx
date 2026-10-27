"use client";

import { useTranslations } from "next-intl";
import { Loader2, Sparkles, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useUserPrefs,
  usePatchUserPrefs,
} from "@/lib/hooks/use-user-prefs";

// One row per action kind. `locked` rows cannot be auto-applied.
const KINDS = [
  { id: "find_orphans", locked: false, defaultAuto: true },
  { id: "suggest_links", locked: false, defaultAuto: false },
  { id: "place_url", locked: false, defaultAuto: false },
  { id: "merge_concepts", locked: false, defaultAuto: false },
  { id: "reorganize", locked: true, defaultAuto: false },
] as const;

export function AgentPanel() {
  const t = useTranslations("settings.panels.agent");
  const prefsQuery = useUserPrefs();
  const patchPrefs = usePatchUserPrefs();

  const prefs = prefsQuery.data;
  const busy = patchPrefs.isPending;

  const value = (kind: string, defaultAuto: boolean): boolean => {
    const map = prefs?.agent_auto_apply ?? {};
    if (kind in map) return !!map[kind];
    return defaultAuto;
  };

  const toggle = (kind: string, next: boolean) => {
    const current = prefs?.agent_auto_apply ?? {};
    const updated = { ...current, [kind]: next };
    patchPrefs.mutate(
      { agent_auto_apply: updated },
      {
        onError: () => toast.error(t("saveFailed")),
      },
    );
  };

  if (prefsQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-8">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {t("loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card/40 p-4">
        <div className="flex items-start gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-primary mt-0.5" />
          <div className="min-w-0">
            <div className="text-sm font-semibold">{t("title")}</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("subtitle")}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {KINDS.map((k) => {
            const on = value(k.id, k.defaultAuto);
            const disabled = k.locked || busy;
            return (
              <div
                key={k.id}
                className={cn(
                  "flex items-center gap-3 rounded-md border border-border bg-background/60 px-3 py-2.5",
                  k.locked && "opacity-70",
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {t(`kinds.${k.id}.label`)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t(`kinds.${k.id}.description`)}
                  </div>
                </div>

                {k.locked ? (
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <Lock className="w-3 h-3" />
                    {t("locked")}
                  </div>
                ) : (
                  <Toggle
                    on={on}
                    disabled={disabled}
                    onChange={(next) => toggle(k.id, next)}
                    ariaLabel={t(`kinds.${k.id}.label`)}
                  />
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">
          {t("explainer")}
        </p>
      </div>
    </div>
  );
}

function Toggle({
  on,
  disabled,
  onChange,
  ariaLabel,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        on ? "bg-primary" : "bg-muted",
        disabled && "opacity-40 pointer-events-none",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-background shadow transition-transform",
          on ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}
