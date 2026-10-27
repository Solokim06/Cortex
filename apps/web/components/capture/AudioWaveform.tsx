"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** Web Audio AnalyserNode — used while actively recording. */
  analyser?: AnalyserNode | null;
  /** Frozen amplitudes (0..1) — used when playback is paused / after stop. */
  amplitudes?: number[];
  /** Number of bars to render. */
  bars?: number;
  /** Height in pixels. */
  height?: number;
  /** Tailwind classes for bar color. */
  barClassName?: string;
  className?: string;
  /** Show a moving pulse when idle (no data). */
  idlePulse?: boolean;
};

const DEFAULT_BARS = 40;

/**
 * Renders a small bar-graph waveform.
 *
 * - If `analyser` is provided, samples live frequency data at ~30fps.
 * - Else, uses `amplitudes` (frozen).
 * - Else, shows a low idle pattern (optionally pulsing).
 */
export function AudioWaveform({
  analyser = null,
  amplitudes,
  bars = DEFAULT_BARS,
  height = 40,
  barClassName,
  className,
  idlePulse = false,
}: Props) {
  const [liveAmplitudes, setLiveAmplitudes] = useState<number[]>(
    () => new Array(bars).fill(0.05),
  );
  const rafRef = useRef<number | null>(null);

  // Live sampling while an analyser is attached
  useEffect(() => {
    if (!analyser) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }

    const buffer = new Uint8Array(analyser.frequencyBinCount);
    let last = 0;

    const tick = (t: number) => {
      // Throttle to ~30fps
      if (t - last > 33) {
        last = t;
        analyser.getByteFrequencyData(buffer);

        // Downsample the frequency bins into `bars` values.
        const next: number[] = new Array(bars);
        const step = Math.floor(buffer.length / bars) || 1;
        for (let i = 0; i < bars; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) {
            sum += buffer[i * step + j] ?? 0;
          }
          next[i] = Math.min(1, sum / step / 200);
        }
        setLiveAmplitudes(next);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [analyser, bars]);

  const data =
    analyser !== null
      ? liveAmplitudes
      : amplitudes && amplitudes.length > 0
        ? amplitudes
        : liveAmplitudes;

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-[2px]",
        idlePulse && !analyser && "opacity-60",
        className,
      )}
      style={{ height }}
      aria-hidden="true"
    >
      {data.map((v, i) => {
        const pct = Math.max(4, Math.min(100, Math.round(v * 100)));
        return (
          <span
            key={i}
            className={cn(
              "w-[3px] rounded-full bg-primary/70 transition-[height] duration-75",
              barClassName,
              idlePulse && !analyser && "animate-pulse",
            )}
            style={{ height: `${pct}%` }}
          />
        );
      })}
    </div>
  );
}
