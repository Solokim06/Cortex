"use client";

import { useEffect, useRef, useState } from "react";
import {
  Lock,
  EyeOff,
  Download,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Four guarantees. Each has:
//   - icon
//   - short headline
//   - one-line explanation
//   - a "live" status chip that pulses (like the graph strip's edge indicator)
// ---------------------------------------------------------------------------

type Guarantee = {
  Icon: typeof Lock;
  title: string;
  body: string;
  status: string;
};

const GUARANTEES: Guarantee[] = [
  {
    Icon: Lock,
    title: "You control AI processing",
    body: "Turn it off in Settings → Privacy. Captures save as raw text — no concepts extracted, no data sent.",
    status: "Opt-out available",
  },
  {
    Icon: EyeOff,
    title: "No tracking. Ever.",
    body: "No analytics scripts, no fingerprinting, no cross-site pixels. The only cookies are for login and preferences.",
    status: "Verified",
  },
  {
    Icon: Download,
    title: "Full export, one click",
    body: "Download every capture, decision, reflection, and conversation as a complete JSON bundle from Settings → Data.",
    status: "Always on",
  },
  {
    Icon: ShieldCheck,
    title: "GDPR-first consent",
    body: "Five categories, opt-in by default, withdrawable at any time. The same rules apply regardless of where you are.",
    status: "Compliant",
  },
];

// ---------------------------------------------------------------------------
// A single guarantee card
// ---------------------------------------------------------------------------

function GuaranteeCard({
  g,
  index,
  trigger,
}: {
  g: Guarantee;
  index: number;
  trigger: boolean;
}) {
  const { Icon } = g;

  return (
    <div
      className="relative flex flex-col gap-3 rounded-xl border border-border/60 bg-card/40 p-4 sm:p-5 transition-all duration-700 ease-out"
      style={{
        opacity: trigger ? 1 : 0,
        transform: trigger ? "translateY(0)" : "translateY(10px)",
        transitionDelay: `${index * 90}ms`,
      }}
    >
      {/* Icon in a soft rounded square — matches feature cards and how-it-works */}
      <div className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>

      <div className="flex flex-col gap-1.5 min-w-0">
        <h3 className="text-[13px] font-medium leading-snug">{g.title}</h3>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {g.body}
        </p>
      </div>

      {/* Status chip — pulses like the "live" indicators elsewhere */}
      <div className="mt-auto pt-2 flex items-center gap-1.5">
        <span
          className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
          style={{
            animation: "trustPulse 2.8s ease-in-out infinite",
            animationDelay: `${index * 0.35}s`,
          }}
          aria-hidden
        />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {g.status}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Band
// ---------------------------------------------------------------------------

export function TrustBand() {
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
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-14"
    >
      {/* Section header — centered to differentiate from the left-aligned
          sections above. Trust content reads better centered. */}
      <div className="max-w-2xl mx-auto text-center mb-8 sm:mb-10">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
          Your data is yours
        </p>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">
          Four things we don&rsquo;t do.
        </h2>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-lg mx-auto">
          Cortex is built for your thinking, not our metrics. Here&rsquo;s the
          contract — in plain words, not legal boilerplate.
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {GUARANTEES.map((g, i) => (
          <GuaranteeCard key={g.title} g={g} index={i} trigger={trigger} />
        ))}
      </div>

      {/* Footer link */}
      <div className="mt-8 flex justify-center">
        <Link
          href="/privacy/cookies"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-border/70 px-3 py-1.5",
            "text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40",
            "transition-colors",
          )}
        >
          Read the full cookie policy
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <style jsx>{`
        @keyframes trustPulse {
          0%,
          100% {
            opacity: 0.55;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.25);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          :global(.trust-pulse) {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
