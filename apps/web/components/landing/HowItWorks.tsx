"use client";

import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Link2,
  Image as ImageIcon,
  Mic,
  ArrowRight,
  Sparkles,
  Tag,
  MessageSquare,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Stage 01 — Capture: chips drop in one at a time
// ---------------------------------------------------------------------------

const CAPTURE_SOURCES = [
  { Icon: FileText, label: "Thought" },
  { Icon: Link2, label: "Link" },
  { Icon: ImageIcon, label: "Screenshot" },
  { Icon: Mic, label: "Voice note" },
];

function StageCapture() {
  const cycle = 5.6;
  const slice = cycle / CAPTURE_SOURCES.length;

  return (
    <div className="flex flex-col gap-2">
      {CAPTURE_SOURCES.map(({ Icon, label }, i) => (
        <div
          key={label}
          className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-card/40 px-2 py-1 text-[11px] text-muted-foreground/90 max-w-[200px]"
          style={{
            animation: `hiwDrop ${cycle}s ease-out infinite`,
            animationDelay: `${i * slice}s`,
          }}
        >
          <Icon className="w-3 h-3 shrink-0" />
          <span className="truncate">{label}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage 02 — Extract: tags fade in as Cortex pulls concepts out
// ---------------------------------------------------------------------------

const EXTRACT_TAGS = [
  "distributed systems",
  "consensus",
  "Raft",
  "fault tolerance",
  "replication",
];

function StageExtract() {
  const cycle = 6.0;
  const slice = cycle / EXTRACT_TAGS.length;

  return (
    <div className="flex flex-col gap-2">
      {/* Faux source capture */}
      <div className="rounded-md border border-border/70 bg-card/40 px-2.5 py-2 text-[11px] text-muted-foreground leading-snug">
        <div className="h-1.5 w-3/4 rounded bg-foreground/20 mb-1" />
        <div className="h-1.5 w-5/6 rounded bg-foreground/15 mb-1" />
        <div className="h-1.5 w-2/3 rounded bg-foreground/15" />
      </div>

      {/* Extracted concept tags — pop in one at a time */}
      <div className="flex flex-wrap gap-1">
        {EXTRACT_TAGS.map((tag, i) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] text-primary whitespace-nowrap"
            style={{
              animation: `hiwTag ${cycle}s ease-out infinite`,
              animationDelay: `${i * slice + 0.4}s`,
            }}
          >
            <Tag className="w-2.5 h-2.5 shrink-0" />
            <span>{tag}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage 03 — Think: mini Q&A loop
// ---------------------------------------------------------------------------

const THINK_QUESTIONS = [
  { q: "What did I capture about Raft?", a: "3 notes — one links to consensus." },
  { q: "Who's working on replication?", a: "Recurring name across 4 captures." },
  { q: "What connects to my Kafka note?", a: "Distributed systems · 6 edges." },
];

function StageThink() {
  const [idx, setIdx] = useState(0);
  const [step, setStep] = useState<"typing" | "thinking" | "showing">("typing");
  const [typed, setTyped] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const cur = THINK_QUESTIONS[idx];
    let cancelled = false;

    const clearAll = () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current = [];
    };

    const schedule = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timers.current.push(t);
    };

    // reset
    // Intentional: this effect drives the rotating "how it works" demo
    // animation. It re-runs on `idx` changes (~every 3.6s), not on every
    // render, so the cascading-render cost is ~2 renders per cycle —
    // negligible. See components/landing/FinalCtaDemo.tsx and
    // components/consent/ConsentContext.tsx for the same pattern.
    //
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep("typing");
    setTyped("");

    // type
    let i = 0;
    const typeTick = () => {
      if (cancelled) return;
      i += 1;
      setTyped(cur.q.slice(0, i));
      if (i < cur.q.length) {
        schedule(typeTick, 45);
      } else {
        schedule(() => setStep("thinking"), 420);
        schedule(() => setStep("showing"), 1150);
        schedule(() => {
          clearAll();
          setIdx((n) => (n + 1) % THINK_QUESTIONS.length);
        }, 3600);
      }
    };
    schedule(typeTick, 200);

    return () => {
      cancelled = true;
      clearAll();
    };
  }, [idx]);

  const cur = THINK_QUESTIONS[idx];

  return (
    <div className="flex flex-col gap-2">
      <div className="inline-flex items-center gap-1.5 self-start rounded-md bg-primary/15 px-2 py-1 text-[10px] text-foreground/90 max-w-[200px]">
        <MessageSquare className="w-2.5 h-2.5 shrink-0 text-primary" />
        <span className="truncate">
          {typed}
          {step === "typing" && (
            <span className="inline-block w-0.5 h-2.5 align-text-bottom ml-0.5 bg-primary/70 animate-pulse" />
          )}
        </span>
      </div>

      {step === "thinking" && (
        <div className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" />
          Thinking…
        </div>
      )}

      {step === "showing" && (
        <div
          className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5 text-[10px] text-foreground/85 leading-relaxed max-w-[220px]"
          style={{ animation: "hiwAnswer 260ms ease-out" }}
        >
          {cur.a}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage wrapper
// ---------------------------------------------------------------------------

type StageProps = {
  number: string;
  title: string;
  body: string;
  children: React.ReactNode;
  /** Delay in ms for the fade-up entrance */
  delay: number;
  trigger: boolean;
};

function Stage({
  number,
  title,
  body,
  children,
  delay,
  trigger,
}: StageProps) {
  return (
    <div
      className="relative flex-1 min-w-0 rounded-2xl border border-border/60 bg-card/40 p-5 transition-all duration-700 ease-out flex flex-col min-h-[340px]"
      style={{
        opacity: trigger ? 1 : 0,
        transform: trigger ? "translateY(0)" : "translateY(14px)",
        transitionDelay: `${delay}ms`,
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2.5 mb-3">
        <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
          {number}
        </span>
        <span className="h-px flex-1 bg-border/60" />
        <Sparkles className="w-3 h-3 text-primary/70" />
      </div>

      <h3 className="text-sm font-semibold tracking-tight mb-1.5">{title}</h3>
      <p className="text-[12px] text-muted-foreground leading-relaxed mb-4">
        {body}
      </p>

      {/* Live mini-demo — fills remaining card height so all three align */}
      <div className="pt-3 mt-auto border-t border-border/40 min-h-[140px]">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Arrow between stages
// ---------------------------------------------------------------------------

function Connector() {
  return (
    <div
      className="flex items-center justify-center shrink-0 self-center py-1 sm:py-0 sm:w-4"
      aria-hidden
    >
      {/* Horizontal arrow on desktop, vertical divider on mobile */}
      <ArrowRight
        className="hidden sm:block w-4 h-4 text-muted-foreground"
        style={{ animation: "hiwArrow 3.2s ease-in-out infinite" }}
      />
      <span
        className="sm:hidden block w-px h-4 bg-border/60"
        aria-hidden
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Band
// ---------------------------------------------------------------------------

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const [trigger, setTrigger] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTrigger(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="mx-auto max-w-5xl px-4 sm:px-6 pt-14 sm:pt-16 pb-6 sm:pb-8"
    >
      {/* Section header */}
      <div className="max-w-2xl mb-8 sm:mb-10">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
          How it works
        </p>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">
          Three steps. Then it thinks with you.
        </h2>
      </div>

      {/* Stages */}
      <div className="flex flex-col sm:flex-row items-stretch gap-3 sm:gap-3">
        <Stage
          number="01"
          title="Capture"
          body="Drop in a thought, link, or file. Text, voice, images, videos — all welcome."
          delay={0}
          trigger={trigger}
        >
          <StageCapture />
        </Stage>

        <Connector />

        <Stage
          number="02"
          title="Extract"
          body="Cortex reads what you saved and pulls out the concepts worth connecting."
          delay={140}
          trigger={trigger}
        >
          <StageExtract />
        </Stage>

        <Connector />

        <Stage
          number="03"
          title="Think"
          body="Ask questions in plain English. See how your ideas connect. Let the graph reason back."
          delay={280}
          trigger={trigger}
        >
          <StageThink />
        </Stage>
      </div>

      <style jsx>{`
        @keyframes hiwDrop {
          0%,
          100% {
            opacity: 0.35;
            transform: translateY(-3px);
            border-color: rgb(from var(--border) r g b / 0.7);
            background-color: rgb(from var(--card) r g b / 0.4);
          }
          6% {
            opacity: 1;
            transform: translateY(0);
            border-color: rgb(from var(--primary) r g b / 0.6);
            background-color: rgb(from var(--primary) r g b / 0.12);
          }
          20% {
            opacity: 0.9;
            transform: translateY(0);
            border-color: rgb(from var(--border) r g b / 0.7);
            background-color: rgb(from var(--card) r g b / 0.4);
          }
        }

        @keyframes hiwTag {
          0%,
          100% {
            opacity: 0.3;
            transform: scale(0.94);
          }
          8% {
            opacity: 1;
            transform: scale(1.06);
            box-shadow: 0 0 0 3px rgb(from var(--primary) r g b / 0.08);
          }
          22% {
            opacity: 0.9;
            transform: scale(1);
            box-shadow: none;
          }
        }

        @keyframes hiwArrow {
          0%,
          100% {
            opacity: 0.5;
            transform: translateX(0);
            color: rgb(from var(--muted-foreground) r g b / 1);
          }
          50% {
            opacity: 1;
            transform: translateX(3px);
            color: rgb(from var(--primary) r g b / 1);
            filter: drop-shadow(0 0 6px rgb(from var(--primary) r g b / 0.45));
          }
        }

        @keyframes hiwAnswer {
          from {
            opacity: 0;
            transform: translateY(3px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          :global(.hiw-animated) {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
