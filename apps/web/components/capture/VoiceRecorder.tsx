"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Mic,
  Square,
  Loader2,
  Play,
  Pause,
  RotateCcw,
  Check,
  X,
  AlertTriangle,
  Languages,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCortex } from "@/lib/hooks/use-cortex";
import { toast } from "sonner";
import { AudioWaveform } from "./AudioWaveform";

type VoiceNode = {
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

type VoiceResult = {
  transcript: string;
  language: string;
  duration: number | null;
  node: VoiceNode | null;
  error: string | null;
};

type Props = {
  onCaptured: (result: VoiceResult) => void;
};

type Stage = "idle" | "recording" | "reviewing" | "transcribing" | "editing";

const MAX_SECONDS = 5 * 60;
const WARN_SECONDS = 4 * 60 + 30;
const MIN_SECONDS = 1;

/**
 * Language names are intentionally NOT translated — language pickers
 * conventionally show names in a stable form (native or English) so a
 * user can always find their language regardless of the current UI locale.
 */
const LANGUAGES: Array<{ code: string | null; label: string; short: string }> = [
  { code: null, label: "Auto-detect", short: "Auto" },
  { code: "en", label: "English", short: "EN" },
  { code: "fr", label: "French", short: "FR" },
  { code: "es", label: "Spanish", short: "ES" },
  { code: "de", label: "German", short: "DE" },
  { code: "pt", label: "Portuguese", short: "PT" },
  { code: "it", label: "Italian", short: "IT" },
];

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VoiceRecorder({ onCaptured }: Props) {
  const t = useTranslations("capture.voice");
  const [stage, setStage] = useState<Stage>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [language, setLanguage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Recorded blob + URL for playback
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  // Transcript (editable)
  const [transcript, setTranscript] = useState("");
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [edited, setEdited] = useState(false);

  // Analyser lives in state (not a ref) so it can be safely rendered.
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const cortex = useCortex();

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // ── Revoke object URL when it changes ──
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // ── Playback: sync `playing` state with audio element ──
  useEffect(() => {
    const el = audioElRef.current;
    if (!el) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, [audioUrl]);

  // ────────── Handlers (all declared before the effects that use them) ──────────

  function resetAll() {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setAnalyser(null);

    setAudioUrl(null);
    setAudioBlob(null);
    setPlaying(false);
    setElapsed(0);
    setTranscript("");
    setDetectedLang(null);
    setEdited(false);
    setError(null);
    setStage("idle");
  }

  function cancelRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    resetAll();
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
  }

  // ── Auto-stop at MAX_SECONDS, warn at WARN_SECONDS ──
  useEffect(() => {
    if (stage !== "recording") return;
    if (elapsed >= MAX_SECONDS) {
      stopRecording();
    } else if (elapsed === WARN_SECONDS) {
      toast.info(t("thirtySecondsLeft"), {
        description: t("thirtySecondsLeftHint"),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, stage]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (stage === "recording") {
        e.preventDefault();
        cancelRecording();
      } else if (stage === "reviewing" || stage === "editing") {
        e.preventDefault();
        resetAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // ────────── Actions ──────────

  async function startRecording() {
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t("unsupported"));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up analyser for live waveform
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new AudioCtx();
        const source = ctx.createMediaStreamSource(stream);
        const node = ctx.createAnalyser();
        node.fftSize = 256;
        node.smoothingTimeConstant = 0.75;
        source.connect(node);
        audioCtxRef.current = ctx;
        setAnalyser(node);
      } catch {
        setAnalyser(null);
      }

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

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        audioCtxRef.current?.close().catch(() => {});
        audioCtxRef.current = null;
        setAnalyser(null);

        const blob = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });

        if (blob.size === 0) {
          setError(t("nothingRecorded"));
          setStage("idle");
          return;
        }

        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setStage("reviewing");
      };

      recorder.start();
      setStage("recording");
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
    } catch (e: unknown) {
      const name = e instanceof Error ? e.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError(t("micDenied"));
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setError(t("noMicrophone"));
      } else {
        setError(
          (e instanceof Error ? e.message : "") || t("couldNotStart"),
        );
      }
    }
  }

  function playPause() {
    const el = audioElRef.current;
    if (!el) return;
    if (playing) el.pause();
    else el.play().catch(() => toast.error(t("playbackFailed")));
  }

  async function transcribe() {
    if (!audioBlob) return;
    if (elapsed < MIN_SECONDS) {
      setError(t("tooShort"));
      return;
    }
    setError(null);
    setStage("transcribing");
    try {
      const file = new File([audioBlob], `recording-${Date.now()}.webm`, {
        type: audioBlob.type,
      });
      const result = (await cortex.transcribe(file, language ?? undefined)) as {
        text?: string;
        transcript?: string;
        language?: string;
        error?: string | null;
      };
      const text = result.transcript ?? result.text ?? "";
      if (!text.trim()) {
        setError(t("noSpeech"));
        setStage("reviewing");
        return;
      }
      setTranscript(text);
      setDetectedLang(result.language ?? null);
      setEdited(false);
      setStage("editing");
    } catch (e: unknown) {
      setError(
        (e instanceof Error ? e.message : "") || t("transcriptionFailed"),
      );
      setStage("reviewing");
    }
  }

  async function capture() {
    const trimmed = transcript.trim();
    if (!trimmed) {
      setError(t("transcriptEmpty"));
      return;
    }
    setStage("transcribing");
    try {
      let node: VoiceNode;
      if (!edited && audioBlob) {
        const file = new File([audioBlob], `recording-${Date.now()}.webm`, {
          type: audioBlob.type,
        });
        const res = (await cortex.voiceCapture(
          file,
          undefined,
          language ?? undefined,
        )) as VoiceResult;
        if (res.error || !res.node) {
          throw new Error(res.error || t("voiceCaptureFailed"));
        }
        node = res.node;
      } else {
        const res = (await cortex.captureText(
          trimmed,
          undefined,
          "voice",
        )) as VoiceNode;
        node = res;
      }

      toast.success(t("voiceCaptured"), {
        description: edited
          ? t("editedSaved")
          : t("transcribedDuration", {
              duration: formatDuration(elapsed),
            }),
      });

      onCaptured({
        transcript: trimmed,
        language: detectedLang ?? language ?? "auto",
        duration: elapsed,
        node,
        error: null,
      });

      resetAll();
    } catch (e: unknown) {
      setError((e instanceof Error ? e.message : "") || t("captureFailed"));
      setStage("editing");
    }
  }

  const activeLanguage = useMemo(
    () => LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0],
    [language],
  );

  return (
    <div className="space-y-3">
      {/* ────────── IDLE ────────── */}
      {stage === "idle" && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startRecording}
          >
            <Mic className="w-4 h-4 mr-2" />
            {t("record")}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-md px-2 h-8 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors">
              <Languages className="w-3.5 h-3.5" />
              {activeLanguage.short}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {LANGUAGES.map((l) => (
                <DropdownMenuItem
                  key={l.short}
                  onClick={() => setLanguage(l.code)}
                >
                  {l.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="text-xs text-muted-foreground">
            {t("idleHint")}
          </span>
        </div>
      )}

      {/* ────────── RECORDING ────────── */}
      {stage === "recording" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <span className="text-sm font-medium tabular-nums">
              {formatDuration(elapsed)}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("recordingHint")}
            </span>

            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={cancelRecording}
                className="text-muted-foreground"
              >
                <X className="w-3.5 h-3.5 mr-1.5" />
                {t("cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={stopRecording}
              >
                <Square className="w-4 h-4 mr-2 fill-current" />
                {t("stop")}
              </Button>
            </div>
          </div>

          <AudioWaveform analyser={analyser} bars={48} height={48} />
        </div>
      )}

      {/* ────────── REVIEWING ────────── */}
      {stage === "reviewing" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={playPause}
              className="h-9 w-9"
              aria-label={playing ? t("pause") : t("play")}
            >
              {playing ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </Button>
            <span className="text-sm font-medium tabular-nums">
              {formatDuration(elapsed)}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("reviewHint")}
            </span>

            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetAll}
                className="text-muted-foreground"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                {t("reRecord")}
              </Button>
              <Button type="button" size="sm" onClick={transcribe}>
                {t("transcribe")}
              </Button>
            </div>
          </div>

          <AudioWaveform bars={48} height={48} idlePulse />

          {audioUrl && (
            <audio ref={audioElRef} src={audioUrl} preload="auto" hidden />
          )}
        </div>
      )}

      {/* ────────── TRANSCRIBING ────────── */}
      {stage === "transcribing" && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          {t("transcribingHint")}
        </div>
      )}

      {/* ────────── EDITING ────────── */}
      {stage === "editing" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t("transcriptLabel")}</span>
            {detectedLang && (
              <span className="text-[10px] uppercase tracking-wide rounded border border-border px-1.5 py-0.5">
                {detectedLang}
              </span>
            )}
            {edited && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400">
                {t("editedSaveAsText")}
              </span>
            )}
          </div>

          <Textarea
            value={transcript}
            onChange={(e) => {
              setTranscript(e.target.value);
              setEdited(true);
            }}
            rows={Math.min(10, transcript.split("\n").length + 1)}
            className="resize-none text-sm"
          />

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetAll}
              className="text-muted-foreground"
            >
              <X className="w-3.5 h-3.5 mr-1.5" />
              {t("discard")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={capture}
              disabled={!transcript.trim()}
            >
              <Check className="w-3.5 h-3.5 mr-1.5" />
              {t("capture")}
            </Button>
          </div>
        </div>
      )}

      {/* ────────── ERROR BANNER ────────── */}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span className="leading-relaxed flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-destructive/70 hover:text-destructive"
            aria-label={t("dismissErrorAria")}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <span className="sr-only" aria-live="polite">
        {stage === "recording" && t("srRecording")}
        {stage === "transcribing" && t("srTranscribing")}
        {stage === "editing" && t("srEditing")}
      </span>
    </div>
  );
}
