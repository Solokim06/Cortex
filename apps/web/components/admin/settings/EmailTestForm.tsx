"use client";

import { useState } from "react";
import {
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  FlaskConical,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "cn";
import {
  EMAIL_TEMPLATES,
  useSendTestEmail,
  type EmailTemplate,
} from "@/lib/hooks/use-admin-emails";

/**
 * Inline card that sends a real email using a chosen template.
 *
 * Uses `/admin/emails/test` — the backend substitutes realistic
 * placeholder values (fake ticket, fake filer, "Admin" sender) so the
 * recipient sees exactly what a real notification looks like.
 *
 * Useful for:
 *   - Verifying provider setup after rotating keys
 *   - Spot-checking a template after editing
 *   - Debugging SMTP / Resend errors
 */
export function EmailTestForm() {
  const t = useTranslations("admin.settings.emails");
  const [to, setTo] = useState("");
  const [template, setTemplate] = useState<EmailTemplate>("new_ticket");

  const mutation = useSendTestEmail();

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());
  const canSend = emailValid && !mutation.isPending;

  const send = async () => {
    if (!canSend) return;
    try {
      const delivery = await mutation.mutateAsync({
        to: to.trim(),
        template,
      });
      if (delivery.status === "sent") {
        toast.success(t("test_sent_toast"), {
          description: t("test_sent_description", {
            provider: delivery.provider,
          }),
        });
        setTo("");
      } else {
        toast.error(t("test_failed_toast"), {
          description: delivery.error ?? t("test_failed_unknown"),
        });
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("test_failed_catch"),
      );
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card/40 px-5 py-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="rounded-md bg-primary/10 p-1.5">
          <FlaskConical className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{t("test_title")}</h3>
          <p className="text-[11px] text-muted-foreground">
            {t("test_subtitle")}
          </p>
        </div>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        {/* To */}
        <div className="flex-1 min-w-[220px]">
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            {t("test_to_label")}
          </label>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
            placeholder={t("test_to_placeholder")}
            disabled={mutation.isPending}
            className={cn(
              "w-full px-2.5 py-1.5 text-xs rounded-md",
              "border border-border bg-background",
              "placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-1 focus:ring-ring",
              "disabled:opacity-60",
              to && !emailValid && "border-rose-500/50",
            )}
          />
        </div>

        {/* Template */}
        <div className="min-w-[160px]">
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            {t("test_template_label")}
          </label>
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value as EmailTemplate)}
            disabled={mutation.isPending}
            className={cn(
              "w-full appearance-none px-2.5 py-1.5 text-xs rounded-md",
              "border border-border bg-background",
              "focus:outline-none focus:ring-1 focus:ring-ring",
              "disabled:opacity-60",
            )}
          >
            {EMAIL_TEMPLATES.map((tpl) => (
              <option key={tpl} value={tpl}>
                {humanizeTemplate(tpl, t)}
              </option>
            ))}
          </select>
        </div>

        {/* Send */}
        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-40 disabled:pointer-events-none",
          )}
        >
          {mutation.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Send className="w-3 h-3" />
          )}
          {mutation.isPending ? t("test_sending") : t("test_send")}
        </button>
      </div>

      {/* Last result hint (below the form, subtle) */}
      {mutation.data && !mutation.isPending && (
        <div className="mt-3 flex items-start gap-2 text-[11px]">
          {mutation.data.status === "sent" ? (
            <>
              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
              <span className="text-muted-foreground">
                {mutation.data.sent_at
                  ? t("test_last_success_at", {
                      provider: mutation.data.provider,
                      time: new Date(
                        mutation.data.sent_at,
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      }),
                    })
                  : t("test_last_success", {
                      provider: mutation.data.provider,
                    })}
              </span>
            </>
          ) : (
            <>
              <XCircle className="w-3 h-3 text-rose-500 shrink-0 mt-0.5" />
              <span className="text-rose-500/90 break-words">
                {mutation.data.error ?? t("test_last_failed")}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// helpers
// =====================================================================

function humanizeTemplate(
  tpl: EmailTemplate,
  t: ReturnType<typeof useTranslations>,
): string {
  switch (tpl) {
    case "new_ticket":
      return t("template_new_ticket");
    case "assignment":
      return t("template_assignment");
    case "user_reply":
      return t("template_user_reply");
    case "sla_breach":
      return t("template_sla_breach");
  }
}
