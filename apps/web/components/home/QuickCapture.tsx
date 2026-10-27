"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles,
  Loader2,
  Upload,
  Check,
  X,
  ArrowRight,
} from "lucide-react";
import { useCortex } from "@/lib/hooks/use-cortex";
import { toast } from "sonner";
import { AttachmentButton } from "@/components/attachments/AttachmentButton";
import { AttachmentPreview } from "@/components/attachments/AttachmentPreview";
import { UrlPrompt } from "@/components/capture/UrlPrompt";
import { validateFile } from "@/lib/attachments";
import { cn } from "@/lib/utils";

type CaptureResult = {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  summary: string | null;
  created_at: string;
  source_type?: string | null;
};

const URL_RE = /^https?:\/\/\S+$/i;

export function QuickCapture() {
  const t = useTranslations("home.quickCapture");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [urlPromptOpen, setUrlPromptOpen] = useState(false);
  const [lastResult, setLastResult] = useState<CaptureResult | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cortex = useCortex();
  const router = useRouter();

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  // Cleanup dismiss timer on unmount
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  const signalRefetch = useCallback(() => {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("cortex:capture"));
    }, 300);
  }, []);

  const showResult = useCallback((node: CaptureResult) => {
    setLastResult(node);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      setLastResult(null);
    }, 3000);
  }, []);

  const handleFileSelected = useCallback((selectedFile: File) => {
    setFile(selectedFile);
  }, []);

  const handleRemoveFile = () => setFile(null);

  const handleVoiceRequested = useCallback(() => {
    router.push("/capture#voice-capture-card");
  }, [router]);

  const handleUrlRequested = useCallback(() => {
    setUrlPromptOpen(true);
  }, []);

  const handleUrlSubmit = useCallback(
    async (url: string) => {
      const node = (await cortex.captureUrl(url)) as CaptureResult;
      toast.success(t("linkCaptured"), {
        description: t("linkCapturedHint"),
      });
      showResult(node);
      signalRefetch();
    },
    [cortex, showResult, signalRefetch, t],
  );

  // Paste — accept files from clipboard
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.kind === "file") {
          const pasted = item.getAsFile();
          if (pasted) {
            const validation = validateFile(pasted);
            if (validation.valid) {
              e.preventDefault();
              setFile(pasted);
              toast.success(t("attachmentAdded"), {
                description: pasted.name || t("pastedFromClipboard"),
              });
            } else {
              toast.error(t("cannotAttach"), {
                description: validation.error,
              });
            }
            return;
          }
        }
      }
    },
    [t],
  );

  // Drag-and-drop
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);

    const dropped = e.dataTransfer.files?.[0];
    if (!dropped) return;

    const validation = validateFile(dropped);
    if (!validation.valid) {
      toast.error(t("cannotAttachFile"), { description: validation.error });
      return;
    }

    setFile(dropped);
    toast.success(t("attachmentAdded"), { description: dropped.name });
  };

  const handleSubmit = async () => {
    const trimmed = text.trim();

    if (!trimmed && !file) {
      toast.error(t("addSomeTextOrFile"));
      return;
    }

    setLoading(true);
    try {
      let node: CaptureResult;

      if (file) {
        toast.loading(t("extracting"), {
          id: "quick-capture",
          description: file.name,
        });
        node = (await cortex.captureFile(file)) as CaptureResult;
        toast.success(t("captured"), {
          id: "quick-capture",
          description: t("fileCapturedHint"),
        });
      } else if (URL_RE.test(trimmed)) {
        toast.loading(t("fetchingLink"), {
          id: "quick-capture",
          description: trimmed,
        });
        node = (await cortex.captureUrl(trimmed)) as CaptureResult;
        toast.success(t("linkCaptured"), {
          id: "quick-capture",
          description: t("linkCapturedHint2"),
        });
      } else {
        node = (await cortex.captureText(trimmed)) as CaptureResult;
        toast.success(t("captured"), {
          description: t("thoughtCapturedHint"),
        });
      }

      setText("");
      setFile(null);
      showResult(node);
      signalRefetch();
      textareaRef.current?.focus();
    } catch (e: unknown) {
      toast.dismiss("quick-capture");
      toast.error(t("captureFailed"), {
        description: getErrorMessage(e, t("genericError")),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSubmit = !loading && (!!text.trim() || !!file);

  return (
    <>
      <div className="space-y-2">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onPaste={handlePaste}
          className={cn(
            "rounded-lg border bg-card/40 p-3 transition-colors relative",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border focus-within:border-primary/40",
          )}
        >
          {dragOver && (
            <div className="absolute inset-0 rounded-lg border-2 border-dashed border-primary flex items-center justify-center bg-primary/5 z-10 pointer-events-none">
              <div className="flex flex-col items-center gap-1 text-primary">
                <Upload className="w-5 h-5" />
                <span className="text-xs font-medium">
                  {t("dropToAttach")}
                </span>
              </div>
            </div>
          )}

          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("placeholder")}
            className="min-h-[52px] resize-none border-0 bg-transparent p-1 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
            disabled={loading}
          />

          {file && (
            <div className="pt-1.5 pl-1">
              <AttachmentPreview file={file} onRemove={handleRemoveFile} />
            </div>
          )}

          <div className="flex items-center justify-between pt-2 mt-1 border-t border-border/60">
            <div className="flex items-center gap-1">
              <AttachmentButton
                onFileSelected={handleFileSelected}
                onVoiceRequested={handleVoiceRequested}
                onUrlRequested={handleUrlRequested}
                disabled={loading}
              />
              <span className="text-[10px] text-muted-foreground ml-1 hidden sm:inline">
                {t("keyboardHint")}
              </span>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              size="sm"
              className="h-7 text-xs"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  {t("capturing")}
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  {t("capture")}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Inline success pill */}
        {lastResult && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-emerald-700 dark:text-emerald-300 font-medium shrink-0">
              {t("captured")}
            </span>
            <span className="text-muted-foreground truncate">
              {lastResult.title || t("untitled")}
            </span>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => router.push("/capture")}
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("open")}
                <ArrowRight className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setLastResult(null)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t("dismissAria")}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      <UrlPrompt
        open={urlPromptOpen}
        onOpenChange={setUrlPromptOpen}
        onSubmit={handleUrlSubmit}
      />
    </>
  );
}

function getErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return fallback;
}
