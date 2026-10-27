"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchBlobUrl, API_BASE } from "@/lib/api";
import type { MemorySearchHit } from "@/lib/hooks/use-cortex";

// ----------------------------------------------------------------------------
// Types & helpers
// ----------------------------------------------------------------------------

type Segment = {
  start: number;
  end: number;
  text: string;
};

type Moment = {
  start: number;
  end: number;
  label: string;
  why: string;
};

function readVideoMeta(hit: MemorySearchHit): {
  videoUrl: string | null;
  segments: Segment[];
  moments: Moment[];
} {
  const meta = (hit.meta ?? {}) as Record<string, unknown>;
  const videoUrl = (meta.video_url as string | undefined) ?? null;
  const va = (meta.video_analysis ?? {}) as Record<string, unknown>;
  const segments = Array.isArray(va.transcript_segments)
    ? (va.transcript_segments as Segment[])
    : [];
  const moments = Array.isArray(va.key_moments)
    ? (va.key_moments as Moment[])
    : [];
  return { videoUrl, segments, moments };
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

type Props = {
  hit: MemorySearchHit;
  /** Prevents the parent card's onClick from firing when the user
      interacts with the video element or transcript. */
  onInteract?: (e: React.MouseEvent) => void;
};

export function VideoResult({ hit, onInteract }: Props) {
  const t = useTranslations("memory.result.video");
  const { getToken } = useAuth();

  const { videoUrl, segments, moments } = useMemo(() => readVideoMeta(hit), [hit]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  // ---- Fetch the blob once on mount ----
  useEffect(() => {
    if (!videoUrl) return;

    let cancelled = false;
    let createdUrl: string | null = null;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = (await getToken()) ?? "";
        // videoUrl is "/files/video/<node_id>" — path-relative to API_BASE
        const path = videoUrl.startsWith("http")
          ? videoUrl.replace(API_BASE, "")
          : videoUrl;
        const url = await fetchBlobUrl(path, token);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        createdUrl = url;
        setBlobUrl(url);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [videoUrl, getToken]);

  // ---- Seek helper ----
  const seekTo = (seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, seconds);
    void v.play().catch(() => {
      /* autoplay may be blocked; that's fine */
    });
  };

  // ---- Track current time for highlighting active segment ----
  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (v) setCurrentTime(v.currentTime);
  };

  // ---- Find the currently-active segment index ----
  const activeIndex = useMemo(() => {
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (currentTime >= s.start && currentTime <= s.end) return i;
    }
    return -1;
  }, [currentTime, segments]);

  if (!videoUrl) return null;

  return (
    <div
      className="mb-3 rounded-lg border border-border overflow-hidden bg-black/40"
      onClick={(e) => {
        // Prevent the parent card's onOpen from firing on any interaction
        e.stopPropagation();
        onInteract?.(e);
      }}
    >
      {/* ---- Video ---- */}
      <div className="relative aspect-video bg-black flex items-center justify-center">
        {loading && (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-[11px]">{t("loadingVideo")}</span>
          </div>
        )}
        {error && !loading && (
          <div className="flex flex-col items-center gap-2 text-muted-foreground px-4 text-center">
            <AlertCircle className="w-5 h-5" />
            <span className="text-xs font-medium">{t("videoUnavailable")}</span>
            <span className="text-[11px] opacity-70">{t("videoUnavailableHint")}</span>
          </div>
        )}
        {blobUrl && !error && (
          <video
            ref={videoRef}
            src={blobUrl}
            controls
            preload="metadata"
            onTimeUpdate={onTimeUpdate}
            className="w-full h-full"
          />
        )}
      </div>

      {/* ---- Key moments ---- */}
      {moments.length > 0 && (
        <div className="border-t border-border px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
            {t("keyMoments")}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {moments.map((m, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  seekTo(m.start);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5",
                  "text-[10px] transition-colors hover:border-primary/60 hover:bg-primary/10",
                  "border-border bg-card/40",
                )}
                title={m.why}
              >
                <span className="font-mono text-muted-foreground">
                  {formatTime(m.start)}
                </span>
                <span className="font-medium">
                  {t(`momentLabels.${m.label}` as never)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---- Transcript ---- */}
      {segments.length > 0 && (
        <div className="border-t border-border">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-3 pt-2 pb-1">
            {t("transcript")}
          </div>
          <div className="max-h-40 overflow-y-auto px-3 pb-3 space-y-1">
            {segments.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  seekTo(s.start);
                }}
                className={cn(
                  "w-full text-left flex items-start gap-2 rounded px-1.5 py-1 transition-colors",
                  i === activeIndex
                    ? "bg-primary/10 text-foreground"
                    : "hover:bg-muted/40 text-muted-foreground",
                )}
              >
                <span className="font-mono text-[10px] pt-0.5 shrink-0 text-muted-foreground">
                  {formatTime(s.start)}
                </span>
                <span className="text-[11px] leading-relaxed">{s.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {segments.length === 0 && moments.length === 0 && !loading && !error && (
        <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          {t("noTranscript")}
        </div>
      )}
    </div>
  );
}
