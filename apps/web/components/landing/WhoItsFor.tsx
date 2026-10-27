"use client";

import { useEffect, useRef, useState } from "react";
import {
  FlaskConical,
  PenLine,
  Wrench,
  GraduationCap,
  BarChart3,
  Rocket,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Six personas. Each card shows a scenario, a 3-step workflow, and one
// headline stat.
// ---------------------------------------------------------------------------

type Persona = {
  Icon: typeof FlaskConical;
  title: string;
  scenario: string;
  workflow: string[];
  stat: string;
};

const PERSONAS: Persona[] = [
  {
    Icon: FlaskConical,
    title: "Researchers",
    scenario:
      "You read 40 papers and forget the argument in half of them. Cortex connects them.",
    workflow: [
      "Save papers as you read",
      'Ask "what have I read on X?"',
      "See how ideas connect across months",
    ],
    stat: "3× faster literature review",
  },
  {
    Icon: PenLine,
    title: "Writers",
    scenario:
      "Drafts, quotes, half-thoughts. Cortex holds them until they become an essay.",
    workflow: [
      "Capture quotes and fragments",
      "Find patterns across your notes",
      "Ask for angles you missed",
    ],
    stat: "2× more finished drafts",
  },
  {
    Icon: Wrench,
    title: "Engineers",
    scenario:
      "Decisions, ADRs, architecture, “why did we do it this way?”",
    workflow: [
      "Log decisions with rationale",
      "Link them to code and context",
      'Ask "how did we solve this before?"',
    ],
    stat: "1 click to any past decision",
  },
  {
    Icon: GraduationCap,
    title: "Students",
    scenario:
      "Lectures, readings, exam prep. Cortex remembers what you forgot you knew.",
    workflow: [
      "Capture notes and readings",
      "Connect ideas across courses",
      "Review before exams",
    ],
    stat: "3× faster revision",
  },
  {
    Icon: BarChart3,
    title: "Product managers",
    scenario:
      "User feedback, roadmap decisions, follow-ups. Cortex keeps the thread.",
    workflow: [
      "Capture feedback and asks",
      "Link decisions to rationale",
      'Recall "why did we cut this?"',
    ],
    stat: "5 hours/week back",
  },
  {
    Icon: Rocket,
    title: "Founders",
    scenario:
      "Customer calls, strategy threads, board notes. Cortex holds the full picture.",
    workflow: [
      "Log calls and insights",
      "Track decisions and reversals",
      "Query your own history",
    ],
    stat: "Full context in one place",
  },
];

// ---------------------------------------------------------------------------
// Single card
// ---------------------------------------------------------------------------

function PersonaCard({
  persona,
  index,
  trigger,
}: {
  persona: Persona;
  index: number;
  trigger: boolean;
}) {
  const { Icon } = persona;

  return (
    <div
      className="relative flex flex-col rounded-2xl border border-border/60 bg-card/40 p-5 transition-all duration-700 ease-out"
      style={{
        opacity: trigger ? 1 : 0,
        transform: trigger ? "translateY(0)" : "translateY(12px)",
        transitionDelay: `${index * 70}ms`,
      }}
    >
      {/* Icon */}
      <div className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 mb-4 shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold tracking-tight mb-2">
        {persona.title}
      </h3>

      {/* Scenario */}
      <p className="text-[12px] text-muted-foreground leading-relaxed mb-4">
        {persona.scenario}
      </p>

      {/* Workflow list */}
      <ol className="space-y-2 mb-5">
        {persona.workflow.map((step, i) => (
          <li
            key={step}
            className="flex items-start gap-2 text-[11px] text-foreground/80 leading-snug transition-all duration-500"
            style={{
              opacity: trigger ? 1 : 0,
              transform: trigger ? "translateX(0)" : "translateX(-4px)",
              transitionDelay: `${index * 70 + 200 + i * 120}ms`,
            }}
          >
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary/10 text-[9px] font-medium text-primary/90 shrink-0 mt-[1px] tabular-nums">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      {/* Stat — pinned to bottom of card */}
      <div className="mt-auto pt-3.5 border-t border-border/40">
        <p className="text-[11px] font-medium text-primary/90">
          {persona.stat}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Band
// ---------------------------------------------------------------------------

export function WhoItsFor() {
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
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-14"
    >
      {/* Section header — centered, matching the Trust band and FAQ */}
      <div className="max-w-2xl mx-auto text-center mb-8 sm:mb-10">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
          Who it&apos;s for
        </p>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">
          Cortex adapts to how you think.
        </h2>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-lg mx-auto">
          Six ways people use it. One system that learns yours.
        </p>
      </div>

      {/* Persona grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {PERSONAS.map((p, i) => (
          <PersonaCard key={p.title} persona={p} index={i} trigger={trigger} />
        ))}
      </div>
    </section>
  );
}
