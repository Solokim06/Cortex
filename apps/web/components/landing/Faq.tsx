"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Faq = {
  q: string;
  a: React.ReactNode;
};

const FAQS: Faq[] = [
  {
    q: "Is my data private?",
    a: (
      <>
        Yes. Cortex uses five-category consent with all non-essential
        categories off by default. You can turn off AI processing at any
        time — captures will save as raw text, and nothing is sent to
        Groq or Google. See{" "}
        <Link href="/privacy/cookies" className="text-primary hover:underline">
          our cookie policy
        </Link>{" "}
        for the full breakdown.
      </>
    ),
  },
  {
    q: "Do I need to install anything?",
    a: (
      <>
        No. Cortex runs in the browser at{" "}
        <span className="text-foreground/90">cortex.app</span>. Optionally,
        install the Chrome extension for one-click capture of any page you
        are reading — but it is not required.
      </>
    ),
  },
  {
    q: "Which AI models does Cortex use?",
    a: (
      <>
        Language work runs on Groq (fast inference for concept extraction,
        classification, and chat). Vision and embeddings run on Google
        Gemini. We do not train any models on your content, and neither
        provider does per their public policies.
      </>
    ),
  },
  {
    q: "What happens if I turn off AI processing?",
    a: (
      <>
        Captures save as raw text. No concepts are extracted, no
        classification runs, images are stored but not analyzed, and
        search falls back to keyword matching. Chat and search continue to
        work — you just lose the automatic enrichment on new captures.
      </>
    ),
  },
  {
    q: "Can I export my data?",
    a: (
      <>
        Yes — one click in Settings → Data. You get a complete JSON bundle
        of every capture, decision, reflection, goal, conversation, and
        support ticket. No proprietary format.
      </>
    ),
  },
  {
    q: "How do I delete everything?",
    a: (
      <>
        Settings → Data has a full account delete. Captures, conversations,
        decisions, and reflections are removed from production within 30
        days. Backups are pruned on a rolling cycle. You can also delete
        individual chats or captures at any time.
      </>
    ),
  },
  {
    q: "Is Cortex free?",
    a: (
      <>
        Yes, and there is no credit card required. Cortex is built by an
        independent developer as a long-term project. If a paid tier ever
        exists, the free tier stays free — your existing data and features
        will not be paywalled.
      </>
    ),
  },
  {
    q: "How is this different from Notion or Obsidian?",
    a: (
      <>
        Notion and Obsidian are filing systems — you organize, they store.
        Cortex extracts concepts automatically, connects them into a graph,
        and reasons over them. You do not build the structure; the structure
        emerges as you capture.
      </>
    ),
  },
];

// ---------------------------------------------------------------------------
// Single FAQ row
// ---------------------------------------------------------------------------

function FaqRow({
  faq,
  isOpen,
  onToggle,
}: {
  faq: Faq;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "border-b border-border/50 transition-colors",
        isOpen && "border-primary/30",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-3 py-3.5 text-left group"
      >
        <span
          className={cn(
            "text-[13px] font-medium transition-colors",
            isOpen
              ? "text-foreground"
              : "text-foreground/90 group-hover:text-foreground",
          )}
        >
          {faq.q}
        </span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform duration-300",
            isOpen && "rotate-180 text-primary",
          )}
        />
      </button>

      {/* Animated open/close via max-height */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="pb-4 pr-6 text-[12px] text-muted-foreground leading-relaxed">
            {faq.a}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Band
// ---------------------------------------------------------------------------

export function Faq() {
  // Which FAQ is currently open. Store the global index.
  // null = none open.
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  // Left column: indices 0-3. Right column: indices 4-7.
  const leftColumn = FAQS.slice(0, 4);
  const rightColumn = FAQS.slice(4);

  const toggle = (idx: number) => {
    setOpenIdx((cur) => (cur === idx ? null : idx));
  };

  return (
    <section className="mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-14">
      {/* Section header — centered, matching the Trust band */}
      <div className="max-w-2xl mx-auto text-center mb-8 sm:mb-10">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
          Questions
        </p>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">
          Answers to what people ask first.
        </h2>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-lg mx-auto">
          Practical questions about privacy, cost, and how Cortex works.
        </p>
      </div>

      {/* Two-column FAQ grid */}
      <div className="grid sm:grid-cols-2 gap-x-10 lg:gap-x-14">
        {/* Left column */}
        <div>
          {leftColumn.map((faq, i) => (
            <FaqRow
              key={faq.q}
              faq={faq}
              isOpen={openIdx === i}
              onToggle={() => toggle(i)}
            />
          ))}
        </div>

        {/* Right column */}
        <div>
          {rightColumn.map((faq, i) => {
            const globalIdx = i + 4;
            return (
              <FaqRow
                key={faq.q}
                faq={faq}
                isOpen={openIdx === globalIdx}
                onToggle={() => toggle(globalIdx)}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
