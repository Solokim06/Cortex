import type { Metadata } from "next";
import Link from "next/link";
import {
  Mail,
  Bug,
  Sparkles,
  HelpCircle,
  FileText,
  Clock,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { ContactForm } from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact — Cortex",
  description:
    "Send a bug report, feature request, or question. We read every message.",
};

const SLA_ROWS = [
  { Icon: Bug, label: "Bug report", sla: "4 hours" },
  { Icon: Sparkles, label: "Feature request", sla: "3 days" },
  { Icon: HelpCircle, label: "Question", sla: "24 hours" },
  { Icon: FileText, label: "Something else", sla: "3 days" },
];

const STEPS = [
  {
    n: "1",
    title: "AI triage",
    body: "Your message is classified and routed automatically — bugs jump the queue.",
  },
  {
    n: "2",
    title: "Human review",
    body: "A person reads it within the SLA window for its category.",
  },
  {
    n: "3",
    title: "Reply or fix",
    body: "You get an answer, or we ship a fix and follow up.",
  },
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
      {/* Hero */}
      <header className="max-w-3xl mb-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 pl-2 pr-3 py-1 mb-6">
          <Mail className="w-3 h-3 text-primary" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Contact
          </span>
        </div>

        <h1 className="text-[2rem] leading-[1.05] sm:text-5xl font-semibold tracking-tight sm:leading-[1]">
          Tell us what&apos;s going on.
        </h1>

        <p className="mt-5 text-base text-muted-foreground leading-relaxed max-w-2xl">
          Bug reports, feature requests, questions — we read every message.
          Filed anonymously or attached to your account, whichever you prefer.
        </p>
      </header>

      {/* Two-column: form + context panel */}
      <div className="grid lg:grid-cols-[1fr_minmax(0,360px)] gap-8 lg:gap-10 items-start">
        {/* Left: form */}
        <ContactForm />

        {/* Right: context */}
        <aside className="space-y-6 lg:sticky lg:top-20">
          {/* What happens next */}
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-3.5 h-3.5 text-primary" />
              <h2 className="text-[13px] font-medium">What happens next</h2>
            </div>

            <ol className="space-y-3.5">
              {STEPS.map(({ n, title, body }) => (
                <li key={n} className="flex items-start gap-3">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-[10px] font-medium text-primary shrink-0 mt-[1px] tabular-nums">
                    {n}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium leading-snug">
                      {title}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* SLA table */}
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              <h2 className="text-[13px] font-medium">
                Expected response
              </h2>
            </div>

            <ul className="space-y-2.5">
              {SLA_ROWS.map(({ Icon, label, sla }) => (
                <li
                  key={label}
                  className="flex items-center justify-between text-[12px]"
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                    {label}
                  </span>
                  <span className="text-foreground/90 font-medium tabular-nums">
                    {sla}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Try the AI first */}
          <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <h2 className="text-[13px] font-medium">
                Questions answered instantly
              </h2>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
              The help assistant can answer most product questions in
              seconds. Try it before filing a ticket.
            </p>
            <Link
              href="/support"
              className="inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline font-medium"
            >
              Open the help assistant
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
