"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// =====================================================================
// Micro-demo variants
// =====================================================================

type Demo =
  | "typing-link"
  | "typing-ask"
  | "summary"
  | "related"
  | "annotate"
  | "video-moments"
  | "graph-health"
  | "agents";

type Props = {
  icon: React.ReactNode;
  title: string;
  body: string;
  demo: Demo;
  className?: string;
};

export function FeatureCard({ icon, title, body, demo, className }: Props) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border border-border bg-card/40 p-6 overflow-hidden group hover:border-border/80 transition-colors",
        className,
      )}
    >
      {/* subtle hover glow */}
      <div
        className="pointer-events-none absolute -top-20 -right-16 w-48 h-48 rounded-full bg-primary/8 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        aria-hidden
      />

      <div className="relative">
        <div className="mb-4 inline-flex items-center justify-center w-9 h-9 rounded-md bg-primary/10">
          {icon}
        </div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
          {body}
        </p>

        <div className="mt-5 h-16 flex items-center">
          <Demo kind={demo} />
        </div>
      </div>

      <style jsx>{`
        @keyframes vmHead {
          0%,
          100% {
            left: 15%;
            opacity: 0.7;
          }
          50% {
            left: 85%;
            opacity: 1;
          }
        }
        @keyframes ghRing {
          0%,
          100% {
            opacity: 0.4;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.35);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          :global(span[style*="animation"]) {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

// =====================================================================
// Individual micro-demos
// =====================================================================

function Demo({ kind }: { kind: Demo }) {
  switch (kind) {
    case "typing-link":
      return <TypingLink />;
    case "typing-ask":
      return <TypingAsk />;
    case "summary":
      return <SummaryCycle />;
    case "related":
      return <RelatedChips />;
    case "annotate":
      return <AnnotateDemo />;
    case "video-moments":
      return <VideoMomentsDemo />;
    case "graph-health":
      return <GraphHealthDemo />;
    case "agents":
      return <AgentsDemo />;
  }
}

// --- 1. Capture: a URL being typed and turned into a chip ---
const LINK_CYCLE = [
  "https://nautil.us/…",
  "https://arxiv.org/abs/…",
  "https://stripe.com/blog/…",
];

function TypingLink() {
  const [text, setText] = useState("");
  const [which, setWhich] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const target = LINK_CYCLE[which];
    let cancelled = false;
    let i = 0;

    const tick = () => {
      if (cancelled) return;
      if (i <= target.length) {
        setText(target.slice(0, i));
        i++;
        setTimeout(tick, 45);
      } else {
        setDone(true);
        setTimeout(() => {
          if (cancelled) return;
          setDone(false);
          setText("");
          setWhich((w) => (w + 1) % LINK_CYCLE.length);
        }, 2000);
      }
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, [which]);

  return (
    <div className="w-full">
      {done ? (
        <div className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] text-primary">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          Captured · 2s
        </div>
      ) : (
        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-background/60 font-mono text-[10px] text-muted-foreground max-w-full overflow-hidden">
          <span className="truncate">{text}</span>
          <span className="w-0.5 h-3 bg-primary/60 animate-pulse shrink-0" />
        </div>
      )}
    </div>
  );
}

// --- 2. Ask: an input with a blinking cursor ---
function TypingAsk() {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-1.5 text-[11px] text-muted-foreground">
      <span>Ask something…</span>
      <span className="w-0.5 h-3 bg-primary/60 animate-pulse" />
    </div>
  );
}

// --- 3. Reflect: cycling summary snippets ---
const SUMMARIES = [
  "You focused on embeddings this week.",
  "3 decisions reached a review date.",
  "Your busiest topic was capture.",
];

function SummaryCycle() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % SUMMARIES.length);
        setVisible(true);
      }, 300);
    }, 3400);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="text-[11px] text-muted-foreground italic leading-snug transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
    >
      &ldquo;{SUMMARIES[idx]}&rdquo;
    </div>
  );
}

// --- 4. Connect: 3 chips that stagger in ---
const RELATIONS = ["embeddings", "reindexing", "graph db"];

function RelatedChips() {
  const [shown, setShown] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const cycle = () => {
      if (cancelled) return;
      setShown(0);
      let i = 0;
      const step = () => {
        if (cancelled) return;
        i++;
        setShown(i);
        if (i < RELATIONS.length) {
          setTimeout(step, 320);
        } else {
          setTimeout(cycle, 2800);
        }
      };
      setTimeout(step, 300);
    };
    cycle();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div ref={wrapRef} className="flex flex-wrap gap-1.5">
      {RELATIONS.map((r, i) => (
        <span
          key={r}
          className={cn(
            "inline-flex items-center rounded-md border border-border bg-accent/30 px-2 py-0.5 text-[10px] text-muted-foreground transition-all duration-300",
            i < shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1",
          )}
        >
          {r}
        </span>
      ))}
    </div>
  );
}

// --- 5. Annotate: a small image with a dashed box drawing itself ---

function AnnotateDemo() {
  const [phase, setPhase] = useState<"idle" | "drawing" | "label">("idle");

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const cycle = () => {
      if (cancelled) return;
      setPhase("drawing");
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setPhase("label");
          timers.push(
            setTimeout(() => {
              if (cancelled) return;
              setPhase("idle");
              timers.push(setTimeout(cycle, 800));
            }, 1800),
          );
        }, 600),
      );
    };
    timers.push(setTimeout(cycle, 300));
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="relative w-full h-14 rounded-md border border-border bg-gradient-to-br from-foreground/[0.06] to-transparent overflow-hidden">
      {/* faint content lines — like a real screenshot */}
      <div className="absolute inset-2.5 flex flex-col gap-1.5">
        <div className="h-1 w-3/5 rounded bg-foreground/12" />
        <div className="h-1 w-2/5 rounded bg-foreground/10" />
        <div className="h-1 w-1/2 rounded bg-foreground/10" />
        <div className="h-1 w-1/3 rounded bg-foreground/8" />
      </div>

      {/* dashed box — always faintly visible, becomes bold during "drawing" */}
      <div
        className="absolute rounded-sm border-2 border-dashed transition-all duration-500 ease-out"
        style={{
          top: "20%",
          left: "22%",
          width: "46%",
          height: "55%",
          borderColor:
            phase === "idle"
              ? "rgb(from var(--muted-foreground) r g b / 0.25)"
              : "rgb(251 191 36 / 0.85)",
          backgroundColor:
            phase === "idle"
              ? "transparent"
              : "rgb(251 191 36 / 0.08)",
        }}
      />

      {/* label chip — appears only in "label" phase */}
      <div
        className="absolute inline-flex items-center rounded-sm border border-amber-400/60 bg-amber-400/15 px-1.5 py-0.5 text-[8px] font-medium text-amber-400 transition-opacity duration-300"
        style={{
          top: "8%",
          left: "22%",
          opacity: phase === "label" ? 1 : 0,
        }}
      >
        revenue Q3
      </div>
    </div>
  );
}

// --- 6. Video moments: waveform + key moment chips ---

// Deterministic waveform heights — avoids hydration/render jitter
const WAVEFORM_HEIGHTS = [
  35, 52, 42, 68, 80, 55, 90, 72, 48, 65, 88, 60, 45, 78, 95, 62, 50, 70, 85,
  58, 42, 66,
];

function VideoMomentsDemo() {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const cycle = () => {
      if (cancelled) return;
      setShown(0);
      let i = 0;
      const step = () => {
        if (cancelled) return;
        i++;
        setShown(i);
        if (i < 2) {
          timers.push(setTimeout(step, 400));
        } else {
          timers.push(setTimeout(cycle, 3000));
        }
      };
      timers.push(setTimeout(step, 250));
    };
    cycle();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  const moments = [
    { time: "0:22", label: "Decision" },
    { time: "0:48", label: "Action" },
  ];

  return (
    <div className="w-full flex flex-col gap-2.5">
      {/* waveform — subtle scrub indicator in the middle */}
      <div className="relative flex items-center gap-[2px] h-7">
        {WAVEFORM_HEIGHTS.map((h, i) => (
          <span
            key={i}
            className="flex-1 rounded-full bg-primary/45"
            style={{ height: `${h}%` }}
          />
        ))}
        {/* playhead */}
        <span
          className="absolute top-0 bottom-0 w-[1.5px] bg-primary rounded-full shadow-[0_0_6px_rgb(from_var(--primary)_r_g_b_/_0.6)]"
          style={{
            left: "50%",
            animation: "vmHead 3.6s ease-in-out infinite",
          }}
        />
      </div>

      {/* moment chips */}
      <div className="flex gap-1.5">
        {moments.map((m, i) => (
          <span
            key={m.label}
            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/8 px-2 py-0.5 text-[10px] text-primary transition-all duration-300"
            style={{
              opacity: i < shown ? 1 : 0,
              transform: i < shown ? "translateY(0)" : "translateY(4px)",
            }}
          >
            <span className="font-mono opacity-70">{m.time}</span>
            <span className="font-medium">{m.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// --- 7. Graph health: node cluster with a stale warning that resolves ---

function GraphHealthDemo() {
  const [healed, setHealed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const loop = () => {
      if (cancelled) return;
      setHealed(true);
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setHealed(false);
          timers.push(setTimeout(loop, 900));
        }, 2000),
      );
    };
    timers.push(setTimeout(loop, 700));
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  // Layout: 5 nodes in a small cluster
  const nodes = [
    { x: 24, y: 28, r: 3.5 },
    { x: 58, y: 14, r: 3.5 },
    { x: 58, y: 42, r: 3.5 },
    { x: 96, y: 14, r: 3.5 },
    { x: 96, y: 42, r: 3.5, isTarget: true },
  ];
  const edges: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 3],
    [2, 4],
    [1, 2],
  ];

  return (
    <div className="relative w-full h-14">
      <svg viewBox="0 0 120 56" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {/* edges */}
        {edges.map(([a, b], i) => (
          <line
            key={i}
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
            stroke="rgb(from var(--border) r g b / 0.8)"
            strokeWidth="0.8"
          />
        ))}

        {/* nodes */}
        {nodes.map((n, i) => {
          const isTarget = n.isTarget;
          const fill = isTarget
            ? healed
              ? "rgb(16 185 129 / 0.85)"
              : "rgb(251 191 36 / 0.9)"
            : "rgb(from var(--primary) r g b / 0.55)";
          return (
            <g key={i}>
              <circle
                cx={n.x}
                cy={n.y}
                r={n.r}
                fill={fill}
                style={{ transition: "fill 500ms ease" }}
              />
              {/* Warning ring around target node when unhealed */}
              {isTarget && !healed && (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.r + 2}
                  fill="none"
                  stroke="rgb(251 191 36 / 0.5)"
                  strokeWidth="0.7"
                  style={{
                    animation: "ghRing 1.8s ease-in-out infinite",
                    transformOrigin: `${n.x}px ${n.y}px`,
                  }}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// --- 8. Agents: proposal card slides in with apply/undo buttons ---

function AgentsDemo() {
  const [stage, setStage] = useState<"hidden" | "in" | "resolved">("hidden");

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const loop = () => {
      if (cancelled) return;
      setStage("in");
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setStage("resolved");
          timers.push(
            setTimeout(() => {
              if (cancelled) return;
              setStage("hidden");
              timers.push(setTimeout(loop, 700));
            }, 1700),
          );
        }, 1500),
      );
    };
    timers.push(setTimeout(loop, 500));
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div
      className="w-full rounded-md border border-border bg-card/60 px-2.5 py-2 transition-all duration-500 ease-out"
      style={{
        opacity: stage === "hidden" ? 0 : 1,
        transform: stage === "hidden" ? "translateY(6px)" : "translateY(0)",
      }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{
            backgroundColor:
              stage === "resolved"
                ? "rgb(16 185 129 / 0.9)"
                : "rgb(from var(--primary) r g b / 0.7)",
            transition: "background-color 400ms ease",
          }}
        />
        <span className="text-[10px] text-foreground/85 truncate">
          Merge 2 concepts
        </span>
      </div>
      <div className="flex gap-1">
        <span
          className="flex-1 text-center rounded-sm px-1 py-1 text-[9px] font-medium transition-colors"
          style={{
            backgroundColor:
              stage === "resolved"
                ? "rgb(from var(--primary) r g b / 0.15)"
                : "rgb(from var(--border) r g b / 0.5)",
            color:
              stage === "resolved"
                ? "rgb(from var(--primary) r g b / 1)"
                : "rgb(from var(--muted-foreground) r g b / 1)",
          }}
        >
          {stage === "resolved" ? "Applied ✓" : "Apply"}
        </span>
        <span className="flex-1 text-center rounded-sm bg-border/50 px-1 py-1 text-[9px] font-medium text-muted-foreground">
          Undo
        </span>
      </div>
    </div>
  );
}
