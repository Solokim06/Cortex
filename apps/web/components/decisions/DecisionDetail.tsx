"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  GitBranch,
  Clock,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Eye,
  HelpCircle,
  TrendingUp,
  BookOpen,
  Sparkles,
  Archive,
  ArchiveRestore,
  Trash2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  useDecisionDetail,
  useArchiveDecision,
  useUnarchiveDecision,
  daysOverdue,
} from "@/lib/hooks/use-decisions";
import { DecideDialog } from "./DecideDialog";
import { OutcomeDialog } from "./OutcomeDialog";
import { DeleteDialog } from "./DeleteDialog";
import { toast } from "sonner";

type Props = {
  decisionId: string;
  onBack: () => void;
};

type BadgeTranslator = ReturnType<typeof useTranslations>;

function statusBadge(status: string, t: BadgeTranslator) {
  if (status === "reviewed")
    return {
      label: t("statusReviewed"),
      Icon: CheckCircle2,
      tone: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
    };
  if (status === "decided")
    return {
      label: t("statusDecided"),
      Icon: Clock,
      tone: "border-primary/40 text-primary",
    };
  if (status === "archived")
    return {
      label: t("statusArchived"),
      Icon: Circle,
      tone: "border-border text-muted-foreground",
    };
  return {
    label: t("statusOpen"),
    Icon: AlertTriangle,
    tone: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  };
}

export function DecisionDetail({ decisionId, onBack }: Props) {
  const t = useTranslations("decisions.detail");
  const { data, isLoading, isError, error } = useDecisionDetail(decisionId);
  const [decideOpen, setDecideOpen] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const archive = useArchiveDecision(decisionId);
  const unarchive = useUnarchiveDecision(decisionId);

  const handleArchive = async () => {
    try {
      await archive.mutateAsync();
      toast.success(t("archivedTitle"), {
        description: t("archivedDescription"),
      });
    } catch (e: unknown) {
      toast.error(t("archiveFailedTitle"), {
        description: e instanceof Error ? e.message : t("tryAgain"),
      });
    }
  };

  const handleUnarchive = async () => {
    try {
      await unarchive.mutateAsync();
      toast.success(t("restoredTitle"), {
        description: t("restoredDescription"),
      });
    } catch (e: unknown) {
      toast.error(t("restoreFailedTitle"), {
        description: e instanceof Error ? e.message : t("tryAgain"),
      });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-4">
        <div className="h-4 w-24 bg-accent/30 rounded animate-pulse" />
        <div className="h-8 w-3/4 bg-accent/40 rounded animate-pulse" />
        <div className="space-y-3 pt-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-lg bg-accent/20 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
        <button
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          {t("backToDecisions")}
        </button>
        <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-destructive">
          {error instanceof Error ? error.message : t("loadFailed")}
        </div>
      </div>
    );
  }

  const { label, Icon, tone } = statusBadge(data.status, t);
  const overdue = data.status === "decided" ? daysOverdue(data.review_at) : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-5">
      <button
        onClick={onBack}
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
      >
        <ArrowLeft className="w-3 h-3" />
        {t("backToDecisions")}
      </button>

      {/* Header */}
      <div>
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 shrink-0 mt-0.5">
            <GitBranch className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {data.question}
            </h1>
            {data.context && (
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {data.context}
              </p>
            )}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <Badge variant="outline" className={cn("text-[10px] gap-1", tone)}>
                <Icon className="w-2.5 h-2.5" />
                {label}
              </Badge>
              {overdue > 0 && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400">
                  {t("reviewOverdue", { count: overdue })}
                </span>
              )}
              <span className="text-[11px] text-muted-foreground">
                {new Date(data.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Framing */}
      {data.analysis.framing && (
        <div className="rounded-lg border border-border bg-card/40 p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            {t("framingLabel")}
          </p>
          <p className="text-sm leading-relaxed">{data.analysis.framing}</p>
        </div>
      )}

      {/* Options */}
      {data.options.length > 0 && (
        <div>
          <h2 className="text-sm font-medium mb-2.5">{t("optionsHeading")}</h2>
          <div className="space-y-3">
            {data.options.map((opt, i) => {
              const isChosen =
                data.chosen_option &&
                opt.name.trim().toLowerCase() ===
                  data.chosen_option.trim().toLowerCase();
              return (
                <div
                  key={i}
                  className={cn(
                    "rounded-lg border bg-card/40 p-4 transition-colors",
                    isChosen ? "border-primary/60 bg-primary/5" : "border-border",
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <p className="text-sm font-medium">{opt.name}</p>
                    {isChosen && (
                      <Badge
                        variant="outline"
                        className="text-[10px] border-primary/40 text-primary shrink-0"
                      >
                        <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                        {t("chosenBadge")}
                      </Badge>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1.5">
                        {t("prosLabel")}
                      </p>
                      <ul className="space-y-1">
                        {opt.pros.map((p, j) => (
                          <li
                            key={j}
                            className="text-xs leading-relaxed flex items-start gap-1.5"
                          >
                            <span className="text-emerald-500 shrink-0">
                              +
                            </span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-rose-600 dark:text-rose-400 mb-1.5">
                        {t("consLabel")}
                      </p>
                      <ul className="space-y-1">
                        {opt.cons.map((c, j) => (
                          <li
                            key={j}
                            className="text-xs leading-relaxed flex items-start gap-1.5"
                          >
                            <span className="text-rose-500 shrink-0">
                              &minus;
                            </span>
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {opt.best_if && (
                    <p className="text-[11px] text-muted-foreground mt-3 italic leading-relaxed">
                      {t("bestIf", { condition: opt.best_if })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Analysis sections */}
      {(data.analysis.tradeoffs?.length ||
        data.analysis.patterns_noticed?.length ||
        data.analysis.blind_spots?.length ||
        data.analysis.questions_to_ask_self?.length) && (
        <>
          <Separator />
          <div className="space-y-4">
            <ListSection
              icon={TrendingUp}
              title={t("tradeoffsHeading")}
              items={data.analysis.tradeoffs ?? []}
              tone="primary"
            />
            <ListSection
              icon={Eye}
              title={t("patternsHeading")}
              items={data.analysis.patterns_noticed ?? []}
              tone="sky"
            />
            <ListSection
              icon={AlertTriangle}
              title={t("blindSpotsHeading")}
              items={data.analysis.blind_spots ?? []}
              tone="amber"
            />
            <ListSection
              icon={HelpCircle}
              title={t("questionsHeading")}
              items={data.analysis.questions_to_ask_self ?? []}
              tone="violet"
            />
          </div>
        </>
      )}

      {/* Decision commit */}
      {(data.chosen_option || data.reasoning || data.expected_outcome) && (
        <>
          <Separator />
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <p className="text-sm font-medium">{t("yourDecisionLabel")}</p>
            </div>
            {data.chosen_option && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  {t("chosenLabel")}
                </p>
                <p className="text-sm font-medium">{data.chosen_option}</p>
              </div>
            )}
            {data.reasoning && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  {t("reasoningLabel")}
                </p>
                <p className="text-xs leading-relaxed">{data.reasoning}</p>
              </div>
            )}
            {data.expected_outcome && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  {t("expectedOutcomeLabel")}
                </p>
                <p className="text-xs leading-relaxed">
                  {data.expected_outcome}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Outcome + lesson */}
      {data.actual_outcome && (
        <>
          <Separator />
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-primary" />
                {t("whatHappenedLabel")}
              </p>
              <p className="text-xs text-foreground/85 leading-relaxed">
                {data.actual_outcome}
              </p>
            </div>

            {data.lesson && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                <p className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1.5">
                  {t("lessonLabel")}
                </p>
                <p className="text-sm leading-relaxed italic">
                  &ldquo;{data.lesson}&rdquo;
                </p>
                {data.analysis.what_was_right && (
                  <div className="mt-3 pt-3 border-t border-emerald-500/20">
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mb-1">
                      {t("whatWasRightLabel")}
                    </p>
                    <p className="text-xs leading-relaxed">
                      {data.analysis.what_was_right}
                    </p>
                  </div>
                )}
                {data.analysis.what_was_wrong && (
                  <div className="mt-3 pt-3 border-t border-emerald-500/20">
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mb-1">
                      {t("whatWasWrongLabel")}
                    </p>
                    <p className="text-xs leading-relaxed">
                      {data.analysis.what_was_wrong}
                    </p>
                  </div>
                )}
                {data.analysis.recommendation_for_future && (
                  <div className="mt-3 pt-3 border-t border-emerald-500/20">
                    <p className="text-[10px] text-muted-foreground mb-1">
                      {t("recommendationLabel")}
                    </p>
                    <p className="text-xs leading-relaxed">
                      {data.analysis.recommendation_for_future}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Footer actions */}
      <Separator />
      <div className="flex items-center gap-2 flex-wrap">
        {data.status === "open" && (
          <Button onClick={() => setDecideOpen(true)} size="sm">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            {t("decideNow")}
          </Button>
        )}
        {data.status === "decided" && (
          <>
            <Button onClick={() => setOutcomeOpen(true)} size="sm">
              <BookOpen className="w-3.5 h-3.5 mr-1.5" />
              {t("recordOutcome")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDecideOpen(true)}
            >
              {t("editDecision")}
            </Button>
          </>
        )}
        {data.status === "reviewed" && (
          <p className="text-xs text-muted-foreground">
            {t("reviewedOn", {
              date: data.reviewed_at
                ? new Date(data.reviewed_at).toLocaleDateString()
                : "",
            })}
          </p>
        )}

        <div className="ml-auto flex items-center gap-2">
          {data.status === "archived" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnarchive}
              disabled={unarchive.isPending}
            >
              {unarchive.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <ArchiveRestore className="w-3.5 h-3.5 mr-1.5" />
              )}
              {t("restore")}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleArchive}
              disabled={archive.isPending}
              className="text-muted-foreground hover:text-foreground"
            >
              {archive.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Archive className="w-3.5 h-3.5 mr-1.5" />
              )}
              {t("archive")}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            {t("delete")}
          </Button>
        </div>
      </div>

      <DecideDialog
        open={decideOpen}
        onOpenChange={setDecideOpen}
        decision={data}
      />
      <OutcomeDialog
        open={outcomeOpen}
        onOpenChange={setOutcomeOpen}
        decision={data}
      />
      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        decisionId={data.id}
        question={data.question}
        onDeleted={onBack}
      />
    </div>
  );
}

function ListSection({
  icon: Icon,
  title,
  items,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: string[];
  tone: "primary" | "amber" | "sky" | "violet";
}) {
  if (items.length === 0) return null;
  const toneClass =
    tone === "amber"
      ? "text-amber-600 dark:text-amber-400"
      : tone === "sky"
        ? "text-sky-600 dark:text-sky-400"
        : tone === "violet"
          ? "text-violet-600 dark:text-violet-400"
          : "text-primary";
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={cn("w-3.5 h-3.5", toneClass)} />
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
      </div>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li
            key={i}
            className="text-xs leading-relaxed flex items-start gap-1.5"
          >
            <span className="text-muted-foreground shrink-0 mt-0.5">
              &middot;
            </span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
