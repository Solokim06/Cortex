"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Globe,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useExtensionMe,
  useGenerateConnectTicket,
  useCountdown,
  formatCountdown,
} from "@/lib/hooks/use-extension";

export function ExtensionConnectCard() {
  const t = useTranslations("settings.extensionCard");
  const meQuery = useExtensionMe();
  const generate = useGenerateConnectTicket();

  const [ticket, setTicket] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const { secondsLeft, expired } = useCountdown(deadline);

  const handleGenerate = async () => {
    try {
      const res = await generate.mutateAsync(undefined);
      setTicket(res.ticket);
      setDeadline(Date.now() + res.expires_in_seconds * 1000);
      setCopied(false);
    } catch (e: unknown) {
      toast.error(t("couldNotGenerate"), {
        description:
          e instanceof Error
            ? e.message
            : typeof e === "string"
              ? e
              : t("genericError"),
      });
    }
  };

  const handleCopy = async () => {
    if (!ticket) return;
    try {
      await navigator.clipboard.writeText(ticket);
      setCopied(true);
      toast.success(t("codeCopied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const handleReset = () => {
    setTicket(null);
    setDeadline(null);
    setCopied(false);
  };

  const user = meQuery.data;
  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() ||
    user?.email ||
    t("yourAccountFallback");

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-md border border-border bg-background/40 px-3 py-2.5">
        <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">
            {t.rich("signedInAs", {
              name: displayName,
              b: (chunks) => <span className="text-foreground">{chunks}</span>,
            })}
          </p>
          {user?.email && (
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              {user.email}
            </p>
          )}
        </div>
      </div>

      {!ticket && (
        <>
          <ol className="text-xs text-muted-foreground space-y-2 leading-relaxed list-none">
            <Step n={1}>
              {t.rich("step1", {
                chrome: (chunks) => (
                  <a
                    href="https://chrome.google.com/webstore"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {chunks}
                  </a>
                ),
                firefox: (chunks) => (
                  <a
                    href="https://addons.mozilla.org"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </Step>
            <Step n={2}>
              {t.rich("step2", {
                strong: (chunks) => (
                  <strong className="text-foreground">{chunks}</strong>
                ),
              })}
            </Step>
            <Step n={3}>{t("step3")}</Step>
          </ol>

          <div className="flex items-center gap-2 pt-1">
            <Button
              onClick={handleGenerate}
              disabled={generate.isPending}
              size="sm"
            >
              {generate.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  {t("generating")}
                </>
              ) : (
                <>
                  <Globe className="w-3.5 h-3.5 mr-1.5" />
                  {t("generateCode")}
                </>
              )}
            </Button>
          </div>
        </>
      )}

      {ticket && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium">{t("yourCode")}</p>
            <div
              className={cn(
                "text-[11px] tabular-nums rounded-full px-2 py-0.5 border",
                expired
                  ? "border-destructive/40 text-destructive bg-destructive/5"
                  : "border-border text-muted-foreground",
              )}
            >
              {expired
                ? t("expired")
                : t("expiresIn", { time: formatCountdown(secondsLeft) })}
            </div>
          </div>

          <div
            className={cn(
              "rounded-md border bg-background/60 px-3 py-3 font-mono text-[11px] leading-relaxed break-all select-all transition-opacity",
              expired ? "border-destructive/30 opacity-50" : "border-border",
            )}
          >
            {ticket}
          </div>

          {expired && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{t("expiredHint")}</span>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={handleCopy}
              disabled={expired || copied}
              size="sm"
              variant={copied ? "outline" : "default"}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                  {t("copied")}
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  {t("copyCode")}
                </>
              )}
            </Button>

            <Button
              onClick={handleGenerate}
              disabled={generate.isPending}
              size="sm"
              variant="outline"
            >
              {generate.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              )}
              {t("regenerate")}
            </Button>

            <Button onClick={handleReset} size="sm" variant="ghost">
              {t("done")}
            </Button>
          </div>

          <div className="flex items-start gap-2 pt-1 text-[10px] text-muted-foreground leading-relaxed">
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            <span>{t("securityNotice")}</span>
          </div>
        </div>
      )}

      {meQuery.isError && !ticket && (
        <p className="text-[11px] text-destructive">
          {t("loadFailed")}
        </p>
      )}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="shrink-0 w-5 h-5 rounded-full border border-border text-[10px] flex items-center justify-center mt-0.5 tabular-nums">
        {n}
      </span>
      <span className="flex-1">{children}</span>
    </li>
  );
}
