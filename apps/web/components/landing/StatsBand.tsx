"use client";

import {
  FileText,
  Link2,
  Image as ImageIcon,
  Mic,
  Video,
  Pencil,
  Layers,
  Search,
  Users,
  Network,
  GitMerge,
  Globe,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Each row is a self-contained micro-demo. All animations are CSS-only
// (keyframes scoped to this file) — no framer-motion, no JS timers.
// ---------------------------------------------------------------------------

const CAPTURE_ICONS = [
  { Icon: FileText, label: "Text" },
  { Icon: Link2, label: "Link" },
  { Icon: ImageIcon, label: "Image" },
  { Icon: Mic, label: "Voice" },
  { Icon: Video, label: "Video" },
  { Icon: Pencil, label: "Annotate" },
];

const MEMORY_LAYERS = [
  { label: "Rolling summary", Icon: Layers },
  { label: "Cross-conversation recall", Icon: Search },
  { label: "User model", Icon: Users },
];

const AGENTS = [
  { label: "Find orphans", Icon: Network },
  { label: "Suggest links", Icon: Link2 },
  { label: "Merge concepts", Icon: GitMerge },
  { label: "Place URL", Icon: Globe },
  { label: "Reorganize", Icon: Sparkles },
];

// ---------------------------------------------------------------------------
// Row 1 — Capture: chips drop in one at a time
// ---------------------------------------------------------------------------

function CaptureRow() {
  const cycle = 6.0; // seconds
  const slice = cycle / CAPTURE_ICONS.length;

  return (
    <div className="flex flex-col gap-3">
      <Header number={6} label="Capture types" sub="what you can save" />
      <div className="flex flex-wrap gap-1.5">
        {CAPTURE_ICONS.map(({ Icon, label }, i) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/40 px-2 py-1 text-[11px] text-muted-foreground/90"
            style={{
              animation: `captureDrop ${cycle}s ease-out infinite`,
              animationDelay: `${i * slice}s`,
            }}
          >
            <Icon className="w-3 h-3 shrink-0" />
            <span className="whitespace-nowrap">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row 2 — Memory layers: stacked tower that builds up, then highlights the top
// ---------------------------------------------------------------------------

function MemoryRow() {
  const cycle = 5.0;

  return (
    <div className="flex flex-col gap-3">
      <Header number={3} label="Memory layers" sub="how Cortex remembers" />
      <div className="flex flex-col gap-1">
        {MEMORY_LAYERS.map(({ label, Icon }, i) => {
          // Each layer appears at i*0.6s, then the top layer glows at the end
          const appearAt = i * 0.6;
          return (
            <div
              key={label}
              className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-[11px] transition-colors"
              style={{
                animation: `memoryLayer ${cycle}s ease-out infinite`,
                animationDelay: `${appearAt}s`,
                borderColor: "var(--border)",
                backgroundColor: "rgb(from var(--card) r g b / 0.4)",
              }}
              title={label}
            >
              <Icon className="w-3 h-3 shrink-0 text-muted-foreground" />
              <span className="whitespace-nowrap text-muted-foreground/90">
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row 3 — AI agents: fire in a chain with connecting lines
// ---------------------------------------------------------------------------

function AgentsRow() {
  const cycle = 7.0;
  const slice = cycle / AGENTS.length;

  return (
    <div className="flex flex-col gap-3">
      <Header number={5} label="AI agents" sub="what runs on demand" />
      <div className="flex flex-wrap items-center gap-1">
        {AGENTS.map(({ label, Icon }, i) => (
          <div key={label} className="flex items-center gap-1">
            <span
              className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/40 px-2 py-1 text-[11px] text-muted-foreground/90"
              style={{
                animation: `agentFire ${cycle}s ease-out infinite`,
                animationDelay: `${i * slice}s`,
              }}
            >
              <Icon className="w-3 h-3 shrink-0" />
              <span className="whitespace-nowrap">{label}</span>
            </span>
            {i < AGENTS.length - 1 && (
              <ArrowRight
                className="w-3 h-3 text-muted-foreground/40 shrink-0"
                style={{
                  animation: `agentArrow ${cycle}s ease-in-out infinite`,
                  animationDelay: `${i * slice + 0.2}s`,
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared row header
// ---------------------------------------------------------------------------

function Header({
  number,
  label,
  sub,
}: {
  number: number;
  label: string;
  sub: string;
}) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums leading-none">
        {number}
      </span>
      <div className="flex flex-col leading-none">
        <span className="text-[13px] font-medium">{label}</span>
        <span className="text-[10px] text-muted-foreground mt-0.5">
          {sub}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Band
// ---------------------------------------------------------------------------

export function StatsBand({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-12",
        className,
      )}
    >
      <style jsx>{`
        /* -- Capture row: fade + drift down (arriving) -- */
        @keyframes captureDrop {
          0%,
          100% {
            opacity: 0.45;
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
          18% {
            opacity: 0.9;
            transform: translateY(0);
            border-color: rgb(from var(--border) r g b / 0.7);
            background-color: rgb(from var(--card) r g b / 0.4);
          }
        }

        /* -- Memory row: appear from left, glow briefly -- */
        @keyframes memoryLayer {
          0%,
          100% {
            opacity: 0.4;
            transform: translateX(-4px);
          }
          10% {
            opacity: 1;
            transform: translateX(0);
            border-color: rgb(from var(--primary) r g b / 0.7);
            background-color: rgb(from var(--primary) r g b / 0.15);
            box-shadow: 0 0 0 3px rgb(from var(--primary) r g b / 0.06);
          }
          26% {
            opacity: 0.85;
            transform: translateX(0);
            border-color: rgb(from var(--border) r g b / 1);
            background-color: rgb(from var(--card) r g b / 0.4);
            box-shadow: none;
          }
        }

        /* -- Agents row: brighten + scale up -- */
        @keyframes agentFire {
          0%,
          100% {
            opacity: 0.5;
            transform: scale(1);
            border-color: rgb(from var(--border) r g b / 0.7);
            background-color: rgb(from var(--card) r g b / 0.4);
          }
          5% {
            opacity: 1;
            transform: scale(1.04);
            border-color: rgb(from var(--primary) r g b / 0.7);
            background-color: rgb(from var(--primary) r g b / 0.14);
          }
          14% {
            opacity: 0.9;
            transform: scale(1);
            border-color: rgb(from var(--border) r g b / 0.7);
            background-color: rgb(from var(--card) r g b / 0.4);
          }
        }

        /* -- Agents row: arrow flashes when the chain passes -- */
        @keyframes agentArrow {
          0%,
          100% {
            opacity: 0.3;
            color: rgb(from var(--muted-foreground) r g b / 1);
          }
          3% {
            opacity: 1;
            color: rgb(from var(--primary) r g b / 1);
          }
          10% {
            opacity: 0.3;
            color: rgb(from var(--muted-foreground) r g b / 1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          :global(.statsBand-item) {
            animation: none !important;
          }
        }
      `}</style>

      <div className="border-t border-b border-border/50 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-6">
          <CaptureRow />
          <MemoryRow />
          <AgentsRow />
        </div>
      </div>
    </div>
  );
}
