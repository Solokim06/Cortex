"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";

// ---------------------------------------------------------------------------
// Three rotating samples. Each produces different concept tags so the demo
// reinforces the "any input, any extraction" story.
// ---------------------------------------------------------------------------

type Sample = {
  kind: "thought" | "link" | "voice";
  prompt: string;
  tags: string[];
  summary: string;
};

const SAMPLES: Sample[] = [
  {
    kind: "thought",
    prompt: "Raft consensus is really about handling leader failures without losing committed entries.",
    tags: ["Raft", "consensus", "leader election", "fault tolerance"],
    summary: "Captured in 2s · +4 concepts",
  },
  {
    kind: "link",
    prompt: "https://arxiv.org/abs/2401.04088",
    tags: ["distributed systems", "paper", "consensus", "reading list"],
    summary: "Captured in 3s · +4 concepts",
  },
  {
    kind: "voice",
    prompt: "Note to self — review the embeddings pipeline before the next deploy.",
    tags: ["embeddings", "pipeline", "deploy", "task"],
    summary: "Transcribed in 4s · +4 concepts",
  },
];

// Phase timings (ms). The whole loop is ~9s.
const T_START_PAUSE = 500;
const T_TYPING_PER_CHAR = 22;
const T_AFTER_TYPING = 220;
const T_EXTRACTING = 900;
const T_BETWEEN_TAGS = 220;
const T_AFTER_LAST_TAG = 400;
const T_HOLD = 2200;
const T_FADE = 300;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Phase = "idle" | "typing" | "extracting" | "tagging" | "done";

export function FinalCtaDemo() {
  const [sampleIdx, setSampleIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [typed, setTyped] = useState("");
  const [tagCount, setTagCount] = useState(0);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cancelled = useRef(false);

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    cancelled.current = false;

    const clearAll = () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current = [];
    };

    const schedule = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        if (!cancelled.current) fn();
      }, ms);
      timers.current.push(t);
    };

    const sample = SAMPLES[sampleIdx];

    // Reduced motion: jump to final state
    if (prefersReduced) {
      // Intentional: this effect is the driver of the rotating landing-page
      // demo animation. It re-runs on `sampleIdx` changes (~every 8s), not
      // on every render, so the cascading-render cost is ~3 renders per
      // 8-second cycle — negligible. A `useSyncExternalStore` or reducer
      // refactor would touch the entire animation loop for no perceptible
      // benefit. See the same pattern (with more detailed reasoning) in
      // components/consent/ConsentContext.tsx.
      //
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTyped(sample.prompt);
      setTagCount(sample.tags.length);
      setPhase("done");
      schedule(() => {
        setTyped("");
        setTagCount(0);
        setPhase("idle");
        schedule(() => setSampleIdx((i) => (i + 1) % SAMPLES.length), T_HOLD);
      }, T_HOLD * 2);
      return () => {
        cancelled.current = true;
        clearAll();
      };
    }

    // Reset
    setTyped("");
    setTagCount(0);
    setPhase("idle");

    // ---- Type the prompt ----
    schedule(() => {
      setPhase("typing");
      let i = 0;
      const tick = () => {
        if (cancelled.current) return;
        i += 1;
        setTyped(sample.prompt.slice(0, i));
        if (i < sample.prompt.length) {
          schedule(tick, T_TYPING_PER_CHAR);
        } else {
          schedule(() => {
            setPhase("extracting");
            schedule(() => {
              setPhase("tagging");
              // Fade tags in one at a time
              let n = 0;
              const step = () => {
                if (cancelled.current) return;
                n += 1;
                setTagCount(n);
                if (n < sample.tags.length) {
                  schedule(step, T_BETWEEN_TAGS);
                } else {
                  schedule(() => setPhase("done"), T_AFTER_LAST_TAG);
                  schedule(() => {
                    setPhase("idle");
                    schedule(() => {
                      setTyped("");
                      setTagCount(0);
                      setSampleIdx((i) => (i + 1) % SAMPLES.length);
                    }, T_FADE);
                  }, T_HOLD);
                }
              };
              step();
            }, T_EXTRACTING);
          }, T_AFTER_TYPING);
        }
      };
      tick();
    }, T_START_PAUSE);

    return () => {
      cancelled.current = true;
      clearAll();
    };
  }, [sampleIdx, prefersReduced]);

  const sample = SAMPLES[sampleIdx];
  const showTags = phase === "tagging" || phase === "done";
  const showSuccess = phase === "done";

  return (
    <div className="relative w-full max-w-md mx-auto rounded-lg border border-border/70 bg-background/60 backdrop-blur-sm overflow-hidden shadow-lg shadow-black/20">
      {/* Input row */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/50 px-3 py-2">
          {/* Kind indicator */}
          <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded bg-primary/10">
            <Sparkles className="w-2.5 h-2.5 text-primary" />
          </span>

          {/* Typed prompt */}
          <div className="flex-1 min-w-0 text-[12px] text-foreground/90 font-mono leading-tight truncate">
            {typed}
            {phase === "typing" && (
              <span className="inline-block w-0.5 h-3 align-text-bottom ml-0.5 bg-primary/70 animate-pulse" />
            )}
          </div>
        </div>
      </div>

      {/* Status row */}
      <div className="px-4 pb-2 min-h-[18px]">
        {phase === "extracting" && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin text-primary/70" />
            <span>Extracting concepts…</span>
          </div>
        )}
        {showSuccess && (
          <div className="flex items-center gap-2 text-[11px]">
            <Check className="w-3 h-3 text-emerald-500" />
            <span className="text-muted-foreground">{sample.summary}</span>
          </div>
        )}
      </div>

      {/* Concept tags */}
      <div className="px-4 pb-3 min-h-[32px]">
        <div className="flex flex-wrap gap-1.5">
          {sample.tags.map((tag, i) => (
            <span
              key={`${sampleIdx}-${tag}`}
              className="inline-flex items-center rounded-md border border-primary/30 bg-primary/8 px-2 py-0.5 text-[10px] text-primary transition-all duration-300"
              style={{
                opacity: showTags && i < tagCount ? 1 : 0,
                transform:
                  showTags && i < tagCount
                    ? "translateY(0)"
                    : "translateY(4px)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Footer hint */}
      <div className="px-4 pb-2.5 border-t border-border/40 pt-1.5">
        <p className="text-[10px] text-muted-foreground text-center">
          Sample capture — this is what happens on your first save.
        </p>
      </div>
    </div>
  );
}
