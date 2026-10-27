"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Trash2, MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useUserPrefs,
  usePatchUserPrefs,
  useDownloadExport,
} from "@/lib/hooks/use-user-prefs";
import { ConfirmDeleteChatsDialog } from "@/components/settings/dialogs/ConfirmDeleteChatsDialog";
import { ConfirmDeleteAccountDialog } from "@/components/settings/dialogs/ConfirmDeleteAccountDialog";

export function DataPanel() {
  const t = useTranslations("settings.panels.data");

  const prefsQuery = useUserPrefs();
  const patchPrefs = usePatchUserPrefs();
  const exportMutation = useDownloadExport();

  const [deleteChatsOpen, setDeleteChatsOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);

  const [email, setEmail] = useState<string>("");
  // Lazily fetch email from Clerk (client-side).
  // We do this in a tiny effect so we don't depend on a server prop.
  // (Clerk exposes window.Clerk.user.primaryEmailAddress.emailAddress)

  const consentOn = !!prefsQuery.data?.data_contribution_optin;
  const consentChangedAt = prefsQuery.data?.data_contribution_changed_at;

  const handleToggleConsent = (next: boolean) => {
    patchPrefs.mutate(
      { data_contribution_optin: next },
      {
        onSuccess: () => {
          toast.success(
            next ? t("consentEnabled") : t("consentDisabled"),
          );
        },
        onError: () => toast.error(t("consentToggleFailed")),
      },
    );
  };

  const handleExport = () => {
    exportMutation.mutate(undefined, {
      onSuccess: () => {
        // No toast needed — browser shows the download.
      },
      onError: () => toast.error(t("exportFailed")),
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium">{t("heading")}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {t("headingDescription")}
        </p>
      </div>

      {/* Consent toggle */}
      <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-background/40 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("telemetryTitle")}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            {t("telemetryDescription")}{" "}
            <span className="text-foreground/80">{t("telemetryDefault")}</span>
          </p>
          {consentChangedAt && (
            <p className="text-[10px] text-muted-foreground mt-1.5">
              {t("consentChangedOn", {
                date: new Date(consentChangedAt).toLocaleDateString(),
              })}
            </p>
          )}
        </div>
        <Toggle
          checked={consentOn}
          onChange={handleToggleConsent}
          disabled={patchPrefs.isPending || prefsQuery.isLoading}
        />
      </div>

      {/* Export */}
      <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-background/40 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("exportTitle")}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            {t("exportDescription")}
          </p>
        </div>
        <Button
          onClick={handleExport}
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={exportMutation.isPending}
        >
          {exportMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5 mr-1.5" />
          )}
          {t("exportButton")}
        </Button>
      </div>

      {/* Delete chats */}
      <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-background/40 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("deleteChatsTitle")}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            {t("deleteChatsDescription")}
          </p>
        </div>
        <Button
          onClick={() => setDeleteChatsOpen(true)}
          variant="outline"
          size="sm"
          className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
          {t("deleteAllButton")}
        </Button>
      </div>

      {/* Danger zone */}
      <div className="border-t border-border/60 pt-5">
        <p className="text-[10px] uppercase tracking-wider text-destructive font-medium mb-2">
          {t("dangerZone")}
        </p>
        <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-destructive">
              {t("deleteAccountTitle")}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              {t("deleteAccountDescription")}
            </p>
          </div>
          <Button
            onClick={() => setDeleteAccountOpen(true)}
            variant="destructive"
            size="sm"
            className="shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            {t("deleteButton")}
          </Button>
        </div>
      </div>

      {/* Dialogs */}
      <ConfirmDeleteChatsDialog
        open={deleteChatsOpen}
        onOpenChange={setDeleteChatsOpen}
      />
      <ConfirmDeleteAccountDialog
        open={deleteAccountOpen}
        onOpenChange={setDeleteAccountOpen}
        userEmail={email}
      />

      {/* Hidden hook: extract email from Clerk once mounted */}
      <EmailReader onChange={setEmail} />
    </div>
  );
}


// =====================================================================
// Toggle
// =====================================================================

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted",
        disabled && "opacity-50 pointer-events-none",
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow-sm transition-transform",
          checked ? "translate-x-4.5" : "translate-x-1",
        )}
      />
    </button>
  );
}


// =====================================================================
// EmailReader — reads Clerk email on the client, calls back once.
// =====================================================================

type ClerkGlobalWithUser = {
  user?: {
    primaryEmailAddress?: {
      emailAddress?: string;
    };
  };
};

function EmailReader({ onChange }: { onChange: (e: string) => void }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const clerk = (window as Window & { Clerk?: ClerkGlobalWithUser }).Clerk;
      const addr = clerk?.user?.primaryEmailAddress?.emailAddress;
      if (typeof addr === "string" && addr.length > 0) {
        onChange(addr);
      }
    } catch {
      // ignore
    }
  }, [onChange]);

  return null;
}
