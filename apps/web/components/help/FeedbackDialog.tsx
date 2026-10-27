"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { cortexFetch } from "@/lib/cortex";
import { ScreenshotDropzone } from "./ScreenshotDropzone";
import {
  ConversationPreview,
  type ConversationMessage,
} from "./ConversationPreview";
import { cn } from "@/lib/utils";

type Category = "bug" | "feature" | "question" | "other";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: {
    category?: string;
    subject?: string;
    description?: string;
    context?: Record<string, unknown>;
    /** Optional chat transcript to attach (last N messages). */
    conversation?: ConversationMessage[];
  };
};

export function FeedbackDialog({ open, onOpenChange, initial }: Props) {
  const t = useTranslations("help.feedback");
  const tCommon = useTranslations("common");
  const { getToken } = useAuth();
  const pathname = usePathname();

  const [category, setCategory] = useState<Category>("bug");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [attachedConversation, setAttachedConversation] = useState<
    ConversationMessage[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      const c = (initial?.category as Category) || "bug";
      setCategory(
        ["bug", "feature", "question", "other"].includes(c) ? c : "bug",
      );
      setSubject(initial?.subject ?? "");
      setDescription(initial?.description ?? "");
      setScreenshotUrl(null);
      setAttachedConversation(initial?.conversation ?? []);
      setError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [open]);

  const submit = async () => {
    const s = subject.trim();
    const d = description.trim();
    if (s.length < 3) {
      setError(t("errorSubject"));
      return;
    }
    if (d.length < 3) {
      setError(t("errorDescription"));
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await cortexFetch("/help/feedback", getToken, {
        method: "POST",
        body: {
          category,
          subject: s,
          description: d,
          attachment_url: screenshotUrl || undefined,
          conversation:
            attachedConversation.length > 0 ? attachedConversation : undefined,
          context: {
            route: pathname,
            user_agent:
              typeof navigator !== "undefined" ? navigator.userAgent : "",
            ...(initial?.context ?? {}),
          },
        },
      });
      toast.success(t("successTitle"), {
        description: t("successDescription"),
      });
      onOpenChange(false);
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : t("errorGeneric"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const categories: { key: Category; label: string }[] = [
    { key: "bug", label: t("catBug") },
    { key: "feature", label: t("catFeature") },
    { key: "question", label: t("catQuestion") },
    { key: "other", label: t("catOther") },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">
              {t("categoryLabel")}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {categories.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-xs font-medium transition-colors text-left",
                    category === c.key
                      ? "border-primary/60 bg-primary/5 text-foreground"
                      : "border-border bg-card/40 text-muted-foreground hover:text-foreground hover:border-primary/40",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              {t("subjectLabel")}
            </label>
            <Input
              ref={inputRef}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("subjectPlaceholder")}
              maxLength={200}
              disabled={submitting}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              {t("descriptionLabel")}
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              rows={6}
              maxLength={5000}
              disabled={submitting}
              className="resize-none"
            />
          </div>

          {attachedConversation.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                {t("attached.label")}
              </label>
              <ConversationPreview
                messages={attachedConversation}
                onRemove={() => setAttachedConversation([])}
              />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              {t("attachmentLabel")}
            </label>
            <ScreenshotDropzone
              value={screenshotUrl}
              onUploaded={(url) => setScreenshotUrl(url || null)}
              disabled={submitting}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              {t("attachmentHint")}
            </p>
          </div>

          {error && (
            <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {tCommon("cancel")}
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                {t("submitting")}
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5 mr-1.5" />
                {t("submit")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
