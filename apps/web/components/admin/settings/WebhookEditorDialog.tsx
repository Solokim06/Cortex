"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import {
  Loader2,
  Webhook,
  Info,
  Eye,
  EyeOff,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCreateWebhook,
  useUpdateWebhook,
} from "@/lib/hooks/use-admin-webhooks";
import type { WebhookTarget } from "@/lib/admin-api";

// =====================================================================
// event catalogue — mirrors backend webhooks.ALL_EVENTS
// =====================================================================

const EVENT_GROUPS: {
  labelKey: string;
  events: { key: string; descKey: string }[];
}[] = [
  {
    labelKey: "group_tickets",
    events: [
      { key: "ticket.created", descKey: "ev_ticket_created" },
      { key: "ticket.status_changed", descKey: "ev_ticket_status" },
      { key: "ticket.priority_changed", descKey: "ev_ticket_priority" },
      { key: "ticket.assigned", descKey: "ev_ticket_assigned" },
      { key: "ticket.replied", descKey: "ev_ticket_replied" },
      { key: "ticket.resolved", descKey: "ev_ticket_resolved" },
      { key: "ticket.note_added", descKey: "ev_ticket_note" },
    ],
  },
  {
    labelKey: "group_sla",
    events: [
      { key: "ticket.sla_breached.first_response", descKey: "ev_sla_first" },
      { key: "ticket.sla_breached.resolution", descKey: "ev_sla_res" },
    ],
  },
];

const ALL_EVENT_KEYS = EVENT_GROUPS.flatMap((g) => g.events.map((e) => e.key));
const WILDCARD = "*";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create mode, otherwise edit mode */
  target: WebhookTarget | null;
};

export function WebhookEditorDialog({ open, onOpenChange, target }: Props) {
  const t = useTranslations("admin.settings.webhooks");
  const isEdit = !!target;

  const [name, setName] = useState(target?.name ?? "");
  const [url, setUrl] = useState(target?.url ?? "");
  const [secret, setSecret] = useState(""); // never pre-filled (write-only)
  const [showSecret, setShowSecret] = useState(false);
  const [events, setEvents] = useState<string[]>(target?.events ?? [WILDCARD]);

  const createMutation = useCreateWebhook();
  const updateMutation = useUpdateWebhook();
  const busy = createMutation.isPending || updateMutation.isPending;

  const usingWildcard = events.includes(WILDCARD);

  // ----------------------------------------------------------------
  // event toggling
  // ----------------------------------------------------------------

  const toggleWildcard = () => {
    if (usingWildcard) {
      setEvents([]);
    } else {
      setEvents([WILDCARD]);
    }
  };

  const toggleEvent = (key: string) => {
    setEvents((prev) => {
      // If wildcard is active, switch to explicit list
      if (prev.includes(WILDCARD)) {
        return [key];
      }
      if (prev.includes(key)) {
        const next = prev.filter((k) => k !== key);
        return next;
      }
      return [...prev, key];
    });
  };

  const selectAll = () => setEvents([...ALL_EVENT_KEYS]);
  const selectNone = () => setEvents([]);

  // ----------------------------------------------------------------
  // validation
  // ----------------------------------------------------------------

  const urlValid = /^https?:\/\/.+/i.test(url.trim());
  const canSave =
    name.trim().length > 0 &&
    urlValid &&
    events.length > 0 &&
    !busy;

  // ----------------------------------------------------------------
  // save
  // ----------------------------------------------------------------

  const handleSave = async () => {
    if (!canSave) return;

    const payload: {
      name: string;
      url: string;
      events: string[];
      secret?: string;
    } = {
      name: name.trim(),
      url: url.trim(),
      events,
    };
    // Only send secret if the user typed one (edit mode: blank = keep existing)
    if (secret.trim()) payload.secret = secret.trim();

    try {
      if (isEdit && target) {
        await updateMutation.mutateAsync({ id: target.id, ...payload });
        toast.success(t("webhook_updated"));
      } else {
        await createMutation.mutateAsync(payload);
        toast.success(t("webhook_created"));
      }
      onOpenChange(false);
    } catch {
      toast.error(isEdit ? t("update_failed") : t("create_failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Webhook className="w-4 h-4 text-primary" />
            {isEdit ? t("dialog_edit_title") : t("dialog_new_title")}
          </DialogTitle>
          <DialogDescription>
            {t("dialog_description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium mb-1.5">
              {t("field_name")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("field_name_placeholder")}
              maxLength={120}
              disabled={busy}
              className={cn(
                "w-full px-3 py-2 text-sm rounded-md",
                "border border-border bg-background",
                "focus:outline-none focus:ring-1 focus:ring-ring",
                "disabled:opacity-60",
              )}
            />
          </div>

          {/* URL */}
          <div>
            <label className="block text-xs font-medium mb-1.5">
              {t("field_url")}
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("field_url_placeholder")}
              disabled={busy}
              className={cn(
                "w-full px-3 py-2 text-sm rounded-md font-mono",
                "border bg-background",
                "focus:outline-none focus:ring-1 focus:ring-ring",
                "disabled:opacity-60",
                url.trim() && !urlValid
                  ? "border-rose-500/50 focus:ring-rose-500/50"
                  : "border-border",
              )}
            />
            {url.trim() && !urlValid && (
              <div className="text-[10px] text-rose-500 mt-1">
                {t("field_url_invalid")}
              </div>
            )}
          </div>

          {/* Secret */}
          <div>
            <label className="block text-xs font-medium mb-1.5">
              {t("field_secret")}{" "}
              <span className="text-muted-foreground font-normal">
                {t("field_secret_optional")}
              </span>
            </label>
            <div className="relative">
              <input
                type={showSecret ? "text" : "password"}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={
                  isEdit && target?.has_secret
                    ? t("field_secret_placeholder_edit")
                    : t("field_secret_placeholder_new")
                }
                disabled={busy}
                className={cn(
                  "w-full px-3 py-2 pr-9 text-sm rounded-md font-mono",
                  "border border-border bg-background",
                  "focus:outline-none focus:ring-1 focus:ring-ring",
                  "disabled:opacity-60",
                )}
              />
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showSecret ? t("hide_secret") : t("show_secret")}
                tabIndex={-1}
              >
                {showSecret ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {t("field_secret_hint_before")}
              <code className="text-primary bg-primary/5 px-1 rounded">
                {t("field_secret_hint_code")}
              </code>
              {t("field_secret_hint_after")}
            </div>
          </div>

          {/* Events */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium">{t("field_events")}</label>
              <div className="flex items-center gap-2 text-[10px]">
                <button
                  type="button"
                  onClick={selectAll}
                  disabled={busy}
                  className="text-primary hover:underline disabled:opacity-50"
                >
                  {t("select_all")}
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  onClick={selectNone}
                  disabled={busy}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {t("clear")}
                </button>
              </div>
            </div>

            {/* Wildcard row */}
            <EventRow
              label={t("wildcard_label")}
              desc={t("wildcard_desc")}
              checked={usingWildcard}
              onToggle={toggleWildcard}
              disabled={busy}
              emphasized
            />

            {/* Grouped events */}
            <div className={cn("mt-2 space-y-3", usingWildcard && "opacity-50 pointer-events-none")}>
              {EVENT_GROUPS.map((group) => (
                <div key={group.labelKey}>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mb-1">
                    {t(group.labelKey as Parameters<typeof t>[0])}
                  </div>
                  <div className="rounded-md border border-border bg-background overflow-hidden">
                    {group.events.map((e) => (
                      <EventRow
                        key={e.key}
                        label={e.key}
                        desc={t(e.descKey as Parameters<typeof t>[0])}
                        checked={events.includes(e.key)}
                        onToggle={() => toggleEvent(e.key)}
                        disabled={busy}
                        mono
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Test note */}
          <div className="flex items-start gap-2 rounded-md border border-border bg-card/30 px-3 py-2">
            <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground">
              {t("test_note_before")}
              <strong className="text-foreground">{t("test_note_bold")}</strong>
              {t("test_note_after")}
            </p>
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="text-xs text-muted-foreground hover:text-foreground px-3 py-2"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-40 disabled:pointer-events-none",
            )}
          >
            {busy ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Webhook className="w-3 h-3" />
            )}
            {isEdit ? t("save_changes") : t("create_webhook")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// event row
// =====================================================================

function EventRow({
  label,
  desc,
  checked,
  onToggle,
  disabled,
  mono = false,
  emphasized = false,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  mono?: boolean;
  emphasized?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors",
        "border-b border-border/40 last:border-b-0",
        "hover:bg-accent/30 disabled:opacity-50 disabled:pointer-events-none",
        emphasized && "bg-primary/5",
      )}
    >
      <div
        className={cn(
          "shrink-0 w-3.5 h-3.5 rounded border transition-colors mt-0.5",
          "flex items-center justify-center",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background",
        )}
      >
        {checked && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-xs",
            mono && "font-mono text-[11px]",
            emphasized && "font-medium",
          )}
        >
          {label}
        </div>
        <div className="text-[10px] text-muted-foreground">{desc}</div>
      </div>
    </button>
  );
}
