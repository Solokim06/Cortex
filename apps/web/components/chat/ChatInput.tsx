"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, CornerDownLeft, Mic, Square } from "lucide-react";
import { AttachmentButton } from "@/components/attachments/AttachmentButton";
import { AttachmentPreview } from "@/components/attachments/AttachmentPreview";
import { validateFile } from "@/lib/attachments";
import { useCortex } from "@/lib/hooks/use-cortex";
import { toast } from "sonner";

type Props = {
  onSubmit: (message: string) => void;
  onSubmitWithFile?: (file: File, message: string) => void;
  onUrlRequested?: () => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  /** True while an SSE reply is streaming — swaps Send for Stop. */
  isStreaming?: boolean;
  /** Called when the user clicks Stop. Aborts the stream. */
  onStop?: () => void;
  /** Currently-selected agent name, or null for plain chat. */
  agent?: string | null;
  /** Called when the user picks a different agent. */
  onAgentChange?: (agent: string | null) => void;
};

export function ChatInput({
  onSubmit,
  onSubmitWithFile,
  onUrlRequested,
  disabled = false,
  loading = false,
  placeholder,
  isStreaming = false,
  onStop,
  agent = null,
  onAgentChange,
}: Props) {
  const t = useTranslations("chat.input");
  const [value, setValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Inline voice recording state
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const cortex = useCortex();

  const effectivePlaceholder = placeholder ?? t("placeholder");

  // Auto-grow
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  // Focus when idle
  useEffect(() => {
    if (!disabled && !loading && !recording && !transcribing) {
      textareaRef.current?.focus();
    }
  }, [disabled, loading, recording, transcribing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const handleFileSelected = useCallback((selectedFile: File) => {
    setFile(selectedFile);
  }, []);

  const handleRemoveFile = () => setFile(null);

  const handleVoiceRequested = useCallback(async () => {
    // Guard: mic unavailable
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error(t("voiceUnavailable"), {
        description: t("voiceUnavailableHint"),
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());

        const blob = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });

        if (blob.size === 0) {
          toast.error(t("nothingRecorded"));
          return;
        }

        setTranscribing(true);
        try {
          const file = new File([blob], `recording-${Date.now()}.webm`, {
            type: blob.type,
          });
          const result = (await cortex.transcribe(file)) as {
            text: string;
            language: string;
            duration: number | null;
          };

          if (result.text?.trim()) {
            setValue((prev) =>
              prev ? `${prev} ${result.text.trim()}` : result.text.trim(),
            );
            toast.success(t("transcribed"), {
              description: t("transcribedHint", {
                duration: result.duration?.toFixed(1) ?? "?",
              }),
            });
          } else {
            toast.error(t("nothingTranscribed"));
          }
        } catch (e: unknown) {
          toast.error(t("transcriptionFailed"), {
            description:
              e instanceof Error ? e.message : t("couldNotTranscribe"),
          });
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
    } catch (e: unknown) {
      const name = e instanceof Error ? e.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        toast.error(t("micDenied"), {
          description: t("micDeniedHint"),
        });
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        toast.error(t("noMicrophone"), {
          description: t("noMicrophoneHint"),
        });
      } else {
        toast.error(t("couldNotStartRecording"), {
          description: e instanceof Error ? e.message : t("unknownError"),
        });
      }
    }
  }, [cortex, t]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    mediaRecorderRef.current?.stop();
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (disabled || loading || recording || transcribing) return;

    if (file && onSubmitWithFile) {
      onSubmitWithFile(file, trimmed);
      setValue("");
      setFile(null);
      requestAnimationFrame(() => {
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      });
      return;
    }

    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

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
              toast.success(t("attachmentAdded"));
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

  const canSend =
    !disabled &&
    !loading &&
    !recording &&
    !transcribing &&
    (value.trim().length > 0 || file !== null);

  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div
      onPaste={handlePaste}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={[
        "rounded-xl border bg-card/60 backdrop-blur-sm p-2 transition-colors relative",
        dragOver
          ? "border-primary bg-primary/5"
          : recording
            ? "border-destructive/60 bg-destructive/5"
            : "border-border focus-within:border-primary/40",
      ].join(" ")}
    >
      {file && (
        <div className="px-1 pt-1 pb-2">
          <AttachmentPreview file={file} onRemove={handleRemoveFile} />
        </div>
      )}

      <div className="flex items-end gap-2">
        <AttachmentButton
          onFileSelected={handleFileSelected}
          onVoiceRequested={handleVoiceRequested}
          onUrlRequested={onUrlRequested}
          disabled={disabled || loading || recording || transcribing}
        />

        {recording ? (
          <div className="flex-1 flex items-center gap-3 min-h-[40px] px-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
            </span>
            <span className="text-sm text-destructive font-medium">
              {t("recordingTimer", { mm, ss })}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("recordingHint")}
            </span>
          </div>
        ) : transcribing ? (
          <div className="flex-1 flex items-center gap-2 min-h-[40px] px-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              {t("transcribing")}
            </span>
          </div>
        ) : (
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              file ? t("placeholderWithFile") : effectivePlaceholder
            }
            disabled={disabled || loading}
            rows={1}
            className="flex-1 min-h-[40px] max-h-[200px] resize-none border-0 bg-transparent p-2 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
          />
        )}

        {/* Voice stop button while recording */}
        {recording ? (
          <Button
            type="button"
            size="icon"
            variant="destructive"
            onClick={stopRecording}
            className="h-9 w-9 shrink-0 mb-1"
            aria-label={t("stopRecording")}
          >
            <Square className="w-4 h-4 fill-current" />
          </Button>
        ) : (
          <>
            {onAgentChange && (
              <select
                value={agent ?? ""}
                onChange={(e) => onAgentChange(e.target.value || null)}
                disabled={isStreaming || loading}
                className="mr-1 h-9 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                aria-label={t("agentLabel")}
              >
                <option value="">{t("agentOff")}</option>
                <option value="devil_advocate">{t("agentDevil")}</option>
                <option value="steelman">{t("agentSteelman")}</option>
                <option value="historian">{t("agentHistorian")}</option>
              </select>
            )}
            <Button
              type="button"
              size="icon"
              onClick={isStreaming && onStop ? onStop : handleSubmit}
              disabled={isStreaming ? false : !canSend}
              className="h-9 w-9 shrink-0 mb-1"
              aria-label={isStreaming ? t("stopRecording") : t("sendMessage")}
            >
              {isStreaming ? (
                <Square className="w-4 h-4 fill-current" />
              ) : loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </>
        )}
      </div>

      <div className="flex items-center justify-between px-2 pt-1.5 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          {recording ? (
            <>
              <Mic className="w-3 h-3 text-destructive" />
              <span className="text-destructive">{t("recording")}</span>
            </>
          ) : transcribing ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{t("transcribingShort")}</span>
            </>
          ) : (
            <>
              <CornerDownLeft className="w-3 h-3" />
              <span>{t("enterToSend")}</span>
              <span className="mx-1.5">·</span>
              <span>{t("shiftEnterForNewline")}</span>
            </>
          )}
        </span>
        <span className="flex items-center gap-3 tabular-nums">
          {file && (
            <span className="text-primary">
              {t("fileCount", { count: 1 })}
            </span>
          )}
          {value.length > 0 && (
            <span>{t("charCount", { count: value.length })}</span>
          )}
        </span>
      </div>
    </div>
  );
}
