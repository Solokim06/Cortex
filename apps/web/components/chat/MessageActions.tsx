"use client";

import { Copy, RefreshCw, Pencil, Check, LifeBuoy } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  /** Which actions to show */
  role: "user" | "assistant";
  /** The raw text to copy */
  content: string;
  /** Is this the last user message? (enables edit) */
  isLastUserMessage?: boolean;
  /** Is this the last assistant message? (enables regenerate) */
  isLastAssistantMessage?: boolean;
  /** Callback for regenerate */
  onRegenerate?: () => void;
  /** Callback for edit */
  onEdit?: () => void;
  /**
   * Opens the feedback dialog with the surrounding chat transcript
   * attached. Shown on both user and assistant messages.
   */
  onSendToSupport?: () => void;
};

export function MessageActions({
  role,
  content,
  isLastUserMessage = false,
  isLastAssistantMessage = false,
  onRegenerate,
  onEdit,
  onSendToSupport,
}: Props) {
  const t = useTranslations("chat.actions");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success(t("copied"));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity",
      )}
    >
      {/* Copy — always available */}
      <ActionButton
        onClick={handleCopy}
        aria-label={t("copyAria")}
        title={t("copy")}
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-success" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </ActionButton>

      {/* Regenerate — only for last assistant message */}
      {role === "assistant" &&
        isLastAssistantMessage &&
        onRegenerate && (
          <ActionButton
            onClick={onRegenerate}
            aria-label={t("regenerateAria")}
            title={t("regenerate")}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </ActionButton>
        )}

      {/* Edit — only for last user message */}
      {role === "user" && isLastUserMessage && onEdit && (
        <ActionButton
          onClick={onEdit}
          aria-label={t("editAria")}
          title={t("edit")}
        >
          <Pencil className="w-3.5 h-3.5" />
        </ActionButton>
      )}

      {/* Send to support — available on any message */}
      {onSendToSupport && (
        <ActionButton
          onClick={onSendToSupport}
          aria-label={t("sendToSupportAria")}
          title={t("sendToSupport")}
        >
          <LifeBuoy className="w-3.5 h-3.5" />
        </ActionButton>
      )}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  ...props
}: {
  children: React.ReactNode;
  onClick: () => void;
  [key: string]: unknown;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
      {...props}
    >
      {children}
    </button>
  );
}
