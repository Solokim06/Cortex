"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, Upload } from "lucide-react";
import { useCortex } from "@/lib/hooks/use-cortex";
import { toast } from "sonner";
import { AttachmentButton } from "@/components/attachments/AttachmentButton";
import { AttachmentPreview } from "@/components/attachments/AttachmentPreview";
import { UrlPrompt } from "./UrlPrompt";
import { AnnotatorModal } from "./AnnotatorModal";
import { validateFile } from "@/lib/attachments";
import type { Annotation } from "@/lib/annotations";
import { Pencil, AlertCircle } from "lucide-react";
import { useConsent } from "@/components/consent/ConsentContext";

type CaptureResult = {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  summary: string | null;
  created_at: string;
  source_type?: string | null;
  extraction_metadata?: Record<string, unknown> | null;
  extraction_error?: string | null;
};

type Props = {
  onCaptured: (node: CaptureResult) => void;
};

export function CaptureBox({ onCaptured }: Props) {
  const t = useTranslations("capture.box");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [urlPromptOpen, setUrlPromptOpen] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotatorOpen, setAnnotatorOpen] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cortex = useCortex();
  const { hasDecided, canUseAiProcessing } = useConsent();

  // Compute a stable data URL for the selected image. We use a data URL
  // (not a blob URL) because tldraw's image shape validator only accepts
  // http/https/data protocols — blob: is rejected as an invalid URL.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    const reader = new FileReader();
    reader.onload = () => {
      if (!cancelled && typeof reader.result === "string") {
        setImagePreviewUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
    return () => {
      cancelled = true;
      reader.abort();
    };
  }, [file]);

  // Derived: when there is no file, there is no preview — even if
  // `imagePreviewUrl` still holds a stale value from a previous file.
  const effectivePreviewUrl = file ? imagePreviewUrl : null;

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 400)}px`;
  }, [text]);

  const handleFileSelected = useCallback((selectedFile: File) => {
    setFile(selectedFile);
  }, []);

  const handleRemoveFile = () => {
    setFile(null);
    setAnnotations([]);
  };

  // Voice requested from attachment menu — scroll to voice card + pulse
  const handleVoiceRequested = useCallback(() => {
    const voiceCard = document.getElementById("voice-capture-card");
    if (voiceCard) {
      voiceCard.scrollIntoView({ behavior: "smooth", block: "center" });
      // Add a brief highlight
      voiceCard.classList.add("ring-2", "ring-primary");
      setTimeout(() => {
        voiceCard.classList.remove("ring-2", "ring-primary");
      }, 2000);
    }
    toast.info(t("voiceBelow"), {
      description: t("voiceBelowHint"),
    });
  }, [t]);

  // URL requested — open the prompt dialog
  const handleUrlRequested = useCallback(() => {
    setUrlPromptOpen(true);
  }, []);

  // URL submit handler
  const handleUrlSubmit = useCallback(
    async (url: string) => {
      const node = (await cortex.captureUrl(url)) as CaptureResult;
      toast.success(t("linkCaptured"), {
        description: t("linkCapturedHint"),
      });
      onCaptured(node);
    },
    [cortex, onCaptured, t],
  );

  // Global paste handler (Cmd/Ctrl+V anywhere in the capture box)
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

  // Drag-and-drop handlers
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
    const trimmedText = text.trim();
    const trimmedTitle = title.trim();

    if (!trimmedText && !file) {
      toast.error(t("addSomeTextOrFile"));
      return;
    }

    setLoading(true);
    try {
      let node: CaptureResult;

      if (file) {
        toast.loading(t("extracting"), {
          id: "capture-file",
          description: file.name,
        });
        node = (await cortex.captureFile(
          file,
          trimmedTitle || undefined,
          annotations.length > 0 ? annotations : undefined,
        )) as CaptureResult;
        toast.success(t("captured"), {
          id: "capture-file",
          description: t("fileCapturedHint"),
        });
      } else {
        node = (await cortex.captureText(
          trimmedText,
          trimmedTitle || undefined,
        )) as CaptureResult;
        toast.success(t("captured"), {
          description: t("thoughtCapturedHint"),
        });
      }

      setText("");
      setTitle("");
      setFile(null);
      onCaptured(node);
      textareaRef.current?.focus();
    } catch (e: unknown) {
      toast.dismiss("capture-file");
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

  return (
    <>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
        className={[
          "rounded-lg border bg-card/40 p-5 space-y-3 transition-colors relative",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border focus-within:border-primary/40",
        ].join(" ")}
      >
        {dragOver && (
          <div className="absolute inset-0 rounded-lg border-2 border-dashed border-primary flex items-center justify-center bg-primary/5 z-10 pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-primary">
              <Upload className="w-6 h-6" />
              <span className="text-sm font-medium">{t("dropToAttach")}</span>
            </div>
          </div>
        )}

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("titlePlaceholder")}
          className="w-full bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground outline-none"
          disabled={loading}
        />

        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            file ? t("contextPlaceholder") : t("mainPlaceholder")
          }
          className="min-h-[140px] resize-none border-0 bg-transparent p-0 text-base focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
          disabled={loading}
        />

        {file && (
          <div className="pt-1 flex items-center gap-2 flex-wrap">
            <AttachmentPreview file={file} onRemove={handleRemoveFile} />
            {file.type.startsWith("image/") && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAnnotatorOpen(true)}
                className="h-7 text-[11px]"
              >
                <Pencil className="w-3 h-3 mr-1" />
                {annotations.length > 0
                  ? t("annotateWithCount", { count: annotations.length })
                  : t("annotate")}
              </Button>
            )}
          </div>
        )}

        {hasDecided && !canUseAiProcessing && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span className="leading-relaxed">
              AI processing is off. Captures will save as raw text — no
              concepts, classification, or image analysis.
            </span>
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-border/60">
          <div className="flex items-center gap-1">
            <AttachmentButton
              onFileSelected={handleFileSelected}
              onVoiceRequested={handleVoiceRequested}
              onUrlRequested={handleUrlRequested}
              disabled={loading}
            />
            <div className="flex items-center gap-3 text-xs text-muted-foreground ml-2">
              {file ? (
                <span className="text-primary">{t("oneFileAttached")}</span>
              ) : (
                <span>{t("charCount", { count: text.length })}</span>
              )}
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={loading || (!text.trim() && !file)}
            size="sm"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                {file ? t("extracting") : t("capturing")}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-1.5" />
                {t("capture")}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* URL Prompt Dialog */}
      <UrlPrompt
        open={urlPromptOpen}
        onOpenChange={setUrlPromptOpen}
        onSubmit={handleUrlSubmit}
      />

      {/* Image Annotator */}
      <AnnotatorModal
        open={annotatorOpen}
        imageSrc={effectivePreviewUrl ?? ""}
        initialAnnotations={annotations}
        onSave={(next) => {
          setAnnotations(next);
          setAnnotatorOpen(false);
        }}
        onCancel={() => setAnnotatorOpen(false)}
      />
    </>
  );
}

function getErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return fallback;
}
