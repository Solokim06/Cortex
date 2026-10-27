"use client";

import { useTranslations } from "next-intl";
import { User } from "lucide-react";
import { useIdentity, useIdentityDiff } from "@/lib/hooks/use-cortex";
import { SignatureQuote } from "@/components/identity/SignatureQuote";
import { IdentityNarrative } from "@/components/identity/IdentityNarrative";
import { RebuildButton } from "@/components/identity/RebuildButton";
import { MaturityScore } from "@/components/identity/MaturityScore";
import { ValuesRadar } from "@/components/identity/ValuesRadar";
import { ValuesList } from "@/components/identity/ValuesList";
import { PatternsList } from "@/components/identity/PatternsList";
import { TimelineList } from "@/components/identity/TimelineList";

export default function IdentityPage() {
  const t = useTranslations("identity.page");
  const identityQuery = useIdentity();
  const diffQuery = useIdentityDiff();

  const data = identityQuery.data;
  const diff = diffQuery.data;
  const loading = identityQuery.isLoading;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            <h1 className="text-3xl font-semibold tracking-tight">
              {t("title")}
            </h1>
          </div>
          <p className="mt-2 text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        <div className="shrink-0">
          <RebuildButton hasModel={data?.has_model ?? false} />
        </div>
      </div>

      {/* Signature quote — always visible, has its own loading + empty states */}
      <SignatureQuote />

      {/* Loading skeleton */}
      {loading ? (
        <div className="space-y-4">
          <div className="h-32 bg-card/40 border border-border rounded-lg animate-pulse" />
          <div className="h-64 bg-card/40 border border-border rounded-lg animate-pulse" />
          <div className="h-80 bg-card/40 border border-border rounded-lg animate-pulse" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-64 bg-card/40 border border-border rounded-lg animate-pulse" />
            <div className="h-64 bg-card/40 border border-border rounded-lg animate-pulse" />
          </div>
          <div className="h-40 bg-card/40 border border-border rounded-lg animate-pulse" />
        </div>
      ) : (
        <>
          {/* Narrative */}
          <IdentityNarrative
            narrative={data?.narrative ?? ""}
            thinkingStyle={data?.thinking_style ?? ""}
            hasModel={data?.has_model ?? false}
            lastRebuiltAt={data?.last_rebuilt_at ?? null}
          />

          {/* Maturity score */}
          {data?.has_model && <MaturityScore />}

          {/* Values radar */}
          {data?.has_model && <ValuesRadar values={data.values ?? []} />}

          {/* Values + Insights with deltas */}
          {data?.has_model && (
            <div className="grid gap-4 md:grid-cols-2">
              <ValuesList
                values={data.values ?? []}
                deltas={diff?.available ? diff.values : undefined}
              />
              <PatternsList
                patterns={data.patterns ?? []}
                strengths={data.strengths ?? []}
                blindSpots={data.blind_spots ?? []}
                growthAreas={data.growth_areas ?? []}
                deltas={
                  diff?.available
                    ? {
                        patterns: diff.patterns,
                        strengths: diff.strengths,
                        blind_spots: diff.blind_spots,
                      }
                    : undefined
                }
              />
            </div>
          )}

          {/* Timeline */}
          {data?.has_model && <TimelineList />}
        </>
      )}
    </div>
  );
}
