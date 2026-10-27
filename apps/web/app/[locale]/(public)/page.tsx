import { ArrowRight, Sparkles, Inbox, Search, Lightbulb, Link2, Pencil, Film, Activity, Wand2, Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { auth } from "@clerk/nextjs/server";
import { LiveAskDemo } from "@/components/landing/LiveAskDemo";
import { FeatureCard } from "@/components/landing/FeatureCard";
import { GraphStrip } from "@/components/landing/GraphStrip";
import { StatsBand } from "@/components/landing/StatsBand";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { TrustBand } from "@/components/landing/TrustBand";
import { WhoItsFor } from "@/components/landing/WhoItsFor";
import { Faq } from "@/components/landing/Faq";
import { FinalCtaDemo } from "@/components/landing/FinalCtaDemo";

export default async function LandingPage() {
  const { userId } = await auth();
  const signedIn = !!userId;

  return (
    <>
      {/* ============== HERO ============== */}
      <section className="relative overflow-hidden">
        {/* ambient glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-primary/10 blur-[120px] pointer-events-none"
          aria-hidden
        />

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 pt-12 pb-10 sm:pt-16 sm:pb-14 grid lg:grid-cols-[1fr_minmax(0,440px)] gap-10 lg:gap-12 items-start">
          {/* Left — pitch */}
          <div className="max-w-xl lg:pt-6">
            {/* Status pill */}
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 pl-2 pr-3 py-1 mb-6">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 animate-ping" />
                <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Live
              </span>
            </div>

            <h1 className="text-[2rem] leading-[1.05] sm:text-5xl lg:text-[3.75rem] font-semibold tracking-tight sm:leading-[1]">
              Your external mind.
            </h1>

            <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-lg">
              Capture anything. Ask it questions. Watch your knowledge
              graph think back.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Link
                href={signedIn ? "/home" : "/sign-in"}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                {signedIn ? "Open Cortex" : "Start free"}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/support"
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border/70 bg-card/40 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Try the AI first
              </Link>
            </div>

            {/* Proof stack */}
            <div className="mt-8 pt-6 border-t border-border/50 space-y-2.5">
              <ProofLine>
                Text · Voice · Image · Video · Annotations
              </ProofLine>
              <ProofLine>
                3 memory layers · 5 AI agents
              </ProofLine>
              <ProofLine>
                No tracking. Your data is yours.
              </ProofLine>
            </div>
          </div>

          {/* Right — live demo */}
          <div className="w-full lg:sticky lg:top-20">
            <LiveAskDemo />
          </div>
        </div>
      </section>

      {/* ============== HOW IT WORKS ============== */}
      <HowItWorks />

      {/* ============== STATS BAND ============== */}
      <StatsBand />

      {/* ============== FEATURES ============== */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
        <div className="max-w-2xl mb-8 sm:mb-10">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">
            Built for thinking, not for filing.
          </h2>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            Cortex captures the raw material, links it together, and helps
            you reason about it later.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <FeatureCard
            icon={<Inbox className="w-4 h-4 text-primary" />}
            title="Capture"
            body="Links, text, voice notes, screenshots — all land in one connected graph."
            demo="typing-link"
          />
          <FeatureCard
            icon={<Search className="w-4 h-4 text-primary" />}
            title="Ask"
            body="Semantic search across your entire mind. Plain English in, sources out."
            demo="typing-ask"
          />
          <FeatureCard
            icon={<Lightbulb className="w-4 h-4 text-primary" />}
            title="Reflect"
            body="Weekly AI summaries of your own thinking — focus, patterns, drift."
            demo="summary"
          />
          <FeatureCard
            icon={<Link2 className="w-4 h-4 text-primary" />}
            title="Connect"
            body="Related nodes surface automatically as your graph grows."
            demo="related"
          />

          <FeatureCard
            icon={<Pencil className="w-4 h-4 text-primary" />}
            title="Annotate"
            body="Draw boxes and labels on screenshots. Cortex focuses its extraction on what you mark."
            demo="annotate"
          />
          <FeatureCard
            icon={<Film className="w-4 h-4 text-primary" />}
            title="Video moments"
            body="Paste a video, get a searchable transcript with clickable key moments."
            demo="video-moments"
          />
          <FeatureCard
            icon={<Activity className="w-4 h-4 text-primary" />}
            title="Graph health"
            body="See which concepts are stale, orphaned, or ready to merge. Fix them in one click."
            demo="graph-health"
          />
          <FeatureCard
            icon={<Wand2 className="w-4 h-4 text-primary" />}
            title="Agentic actions"
            body="Cortex proposes reorganizations you can apply or undo. Review before anything changes."
            demo="agents"
          />
        </div>
      </section>

      {/* ============== GRAPH STRIP ============== */}
      <GraphStrip />

      {/* ============== TRUST BAND ============== */}
      <TrustBand />

      {/* ============== WHO IT'S FOR ============== */}
      <WhoItsFor />

      {/* ============== FAQ ============== */}
      <Faq />

      {/* ============== CLOSING CTA ============== */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-14">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/6 via-card/40 to-card/40 px-6 sm:px-10 py-8 sm:py-10 text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Start building your external mind.
          </h2>

          {/* Live preview of the first-capture experience */}
          <div className="mt-6">
            <FinalCtaDemo />
          </div>

          <p className="mt-6 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            Free forever. No credit card. Your captures are yours alone.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href={signedIn ? "/home" : "/sign-in"}
              className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {signedIn ? "Open Cortex" : "Start free"}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/support"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              or try the AI first →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// ProofLine — a small check-marked line for the hero proof stack
// ---------------------------------------------------------------------------

function ProofLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-primary/10 shrink-0">
        <Check className="w-2.5 h-2.5 text-primary" strokeWidth={2.5} />
      </span>
      <span>{children}</span>
    </div>
  );
}

