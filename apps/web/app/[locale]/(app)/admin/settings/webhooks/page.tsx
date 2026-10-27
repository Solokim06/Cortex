"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import {
  Plus,
  Webhook,
  Loader2,
  Pencil,
  Trash2,
  Send,
  History,
  Power,
  PowerOff,
  AlertCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { WebhookEditorDialog } from "@/components/admin/settings/WebhookEditorDialog";
import { WebhookDeliveriesDrawer } from "@/components/admin/settings/WebhookDeliveriesDrawer";
import {
  useDeleteWebhook,
  useTestWebhook,
  useTriggerWebhookRetry,
  useUpdateWebhook,
  useWebhooks,
} from "@/lib/hooks/use-admin-webhooks";
import type { WebhookTarget } from "@/lib/admin-api";

export default function WebhooksSettingsPage() {
  const t = useTranslations("admin.settings.webhooks");
  const webhooksQuery = useWebhooks();
  const updateMutation = useUpdateWebhook();
  const deleteMutation = useDeleteWebhook();
  const testMutation = useTestWebhook();
  const retryMutation = useTriggerWebhookRetry();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<WebhookTarget | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WebhookTarget | null>(null);
  const [deliveriesFor, setDeliveriesFor] = useState<WebhookTarget | null>(null);

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (target: WebhookTarget) => {
    setEditing(target);
    setEditorOpen(true);
  };

  const handleTest = (target: WebhookTarget) => {
    testMutation.mutate(target.id, {
      onSuccess: (delivery) => {
        const code = delivery.status_code;
        if (code === null) {
          toast.error(t("test_network_error"));
        } else if (code >= 200 && code < 300) {
          toast.success(t("test_success", { code }));
        } else {
          toast.error(t("test_failed_code", { code }));
        }
      },
      onError: () => toast.error(t("test_request_failed")),
    });
  };

  const handleToggleActive = (target: WebhookTarget) => {
    updateMutation.mutate(
      { id: target.id, is_active: !target.is_active },
      {
        onSuccess: () => {
          toast.success(
            target.is_active ? t("webhook_disabled") : t("webhook_enabled"),
          );
        },
        onError: () => toast.error(t("update_failed")),
      },
    );
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteMutation.mutateAsync(pendingDelete.id);
      toast.success(t("delete_success", { name: pendingDelete.name }));
      setPendingDelete(null);
    } catch {
      toast.error(t("delete_failed"));
    }
  };

  const handleRetryNow = () => {
    retryMutation.mutate(undefined, {
      onSuccess: (data) => {
        if (data.retried === 0) {
          toast.info(t("retry_nothing"));
        } else {
          toast.success(
            t("retry_summary", {
              retried: data.retried,
              succeeded: data.succeeded,
              failed: data.failed,
            }),
          );
        }
      },
      onError: () => toast.error(t("retry_failed")),
    });
  };

  return (
    <div className="px-5 py-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-sm font-medium mb-1">{t("page_title")}</h2>
          <p className="text-xs text-muted-foreground max-w-2xl">
            {t("page_subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRetryNow}
            disabled={retryMutation.isPending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs",
              "border border-border bg-background hover:bg-accent/50 transition-colors",
              "disabled:opacity-40 disabled:pointer-events-none",
            )}
          >
            {retryMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Clock className="w-3 h-3" />
            )}
            {t("retry_now")}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
              "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            {t("new_webhook")}
          </button>
        </div>
      </div>

      {/* Loading */}
      {webhooksQuery.isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-10">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("loading")}
        </div>
      )}

      {/* Error */}
      {webhooksQuery.isError && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-xs text-rose-500">
{t("load_error")}
        </div>
      )}

      {/* Empty */}
      {!webhooksQuery.isLoading && webhooksQuery.data?.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Webhook className="w-8 h-8 opacity-40" />
          <p className="text-sm">{t("empty_title")}</p>
          <button
            type="button"
            onClick={openCreate}
            className="text-xs text-primary hover:underline"
          >
            {t("empty_cta")}
          </button>
        </div>
      )}

      {/* List */}
      {webhooksQuery.data && webhooksQuery.data.length > 0 && (
        <div className="space-y-2">
          {webhooksQuery.data.map((target) => (
            <WebhookRow
              key={target.id}
              target={target}
              onEdit={() => openEdit(target)}
              onDelete={() => setPendingDelete(target)}
              onTest={() => handleTest(target)}
              onToggleActive={() => handleToggleActive(target)}
              onViewDeliveries={() => setDeliveriesFor(target)}
              testBusy={
                testMutation.isPending && testMutation.variables === target.id
              }
              toggleBusy={
                updateMutation.isPending &&
                updateMutation.variables?.id === target.id
              }
            />
          ))}
        </div>
      )}

      {/* Editor dialog */}
      <WebhookEditorDialog
        key={editing?.id ?? "new"}
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditing(null);
        }}
        target={editing}
      />

      {/* Deliveries drawer */}
      <WebhookDeliveriesDrawer
        open={!!deliveriesFor}
        onClose={() => setDeliveriesFor(null)}
        target={deliveriesFor}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t("delete_title")}
        description={
          pendingDelete
            ? t("delete_body", { name: pendingDelete.name })
            : ""
        }
        confirmLabel={t("delete_button")}
        cancelLabel={t("cancel")}
        destructive
        onConfirm={confirmDelete}
        busy={deleteMutation.isPending}
      />
    </div>
  );
}

// =====================================================================
// row
// =====================================================================

function WebhookRow({
  target,
  onEdit,
  onDelete,
  onTest,
  onToggleActive,
  onViewDeliveries,
  testBusy,
  toggleBusy,
}: {
  target: WebhookTarget;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  onToggleActive: () => void;
  onViewDeliveries: () => void;
  testBusy: boolean;
  toggleBusy: boolean;
}) {
  const t = useTranslations("admin.settings.webhooks");
  const lastOk =
    target.last_status_code !== null &&
    target.last_status_code >= 200 &&
    target.last_status_code < 300;

  return (
    <div
      className={cn(
        "group rounded-lg border bg-card/40 px-4 py-3 transition-colors",
        target.is_active
          ? "border-border hover:border-primary/30"
          : "border-border/60 opacity-70",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Active indicator */}
        <div
          className={cn(
            "shrink-0 w-7 h-7 rounded-md flex items-center justify-center mt-0.5",
            target.is_active
              ? "bg-primary/10 text-primary"
              : "bg-muted/40 text-muted-foreground",
          )}
        >
          <Webhook className="w-3.5 h-3.5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">
              {target.name}
            </span>
            {!target.is_active && (
              <span className="text-[10px] uppercase tracking-wider rounded border border-border px-1.5 py-0.5 text-muted-foreground">
                {t("disabled_badge")}
              </span>
            )}
            {target.failure_count > 0 && target.is_active && (
              <span className="inline-flex items-center gap-1 text-[10px] text-rose-500">
                <AlertCircle className="w-3 h-3" />
                {t("recent_failures", { n: target.failure_count })}
              </span>
            )}
            {target.failure_count === 0 &&
              target.last_status_code !== null &&
              lastOk && (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500">
                  <CheckCircle2 className="w-3 h-3" />
                  {t("healthy")}
                </span>
              )}
          </div>

          <div className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
            {target.url}
          </div>

          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground flex-wrap">
            <span>
              {target.events.includes("*")
                ? t("all_events")
                : t("n_events", { n: target.events.length })}
            </span>
            {target.last_delivery_at && (
              <>
                <span className="opacity-40">·</span>
                <span>{t("last_delivery", { when: formatWhen(target.last_delivery_at, t) })}</span>
              </>
            )}
            {target.has_secret && (
              <>
                <span className="opacity-40">·</span>
                <span>{t("signed")}</span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity shrink-0">
          <IconButton
            onClick={onTest}
            busy={testBusy}
            title={t("tooltip_test")}
            icon={Send}
          />
          <IconButton
            onClick={onViewDeliveries}
            title={t("tooltip_history")}
            icon={History}
          />
          <IconButton
            onClick={onToggleActive}
            busy={toggleBusy}
            title={target.is_active ? t("tooltip_disable") : t("tooltip_enable")}
            icon={target.is_active ? PowerOff : Power}
          />
          <IconButton
            onClick={onEdit}
            title={t("tooltip_edit")}
            icon={Pencil}
          />
          <IconButton
            onClick={onDelete}
            title={t("tooltip_delete")}
            icon={Trash2}
            tone="destructive"
          />
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// small icon button
// =====================================================================

function IconButton({
  onClick,
  icon: Icon,
  title,
  busy = false,
  tone,
}: {
  onClick: () => void;
  icon: typeof Send;
  title: string;
  busy?: boolean;
  tone?: "destructive";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={title}
      aria-label={title}
      className={cn(
        "rounded-md p-1.5 transition-colors",
        "disabled:opacity-40 disabled:pointer-events-none",
        tone === "destructive"
          ? "text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
      )}
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Icon className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

// =====================================================================
// helper
// =====================================================================

function formatWhen(
  iso: string | null,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return t("just_now");
  if (diff < 3600) return t("minutes_ago", { n: Math.floor(diff / 60) });
  if (diff < 86400) return t("hours_ago", { n: Math.floor(diff / 3600) });
  return new Date(iso).toLocaleDateString();
}
