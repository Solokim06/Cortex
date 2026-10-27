"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Check,
  MessageSquare,
  Link as LinkIcon,
  Network,
  AlertTriangle,
  X,
  ExternalLink,
} from "lucide-react";
import { SourceTypeChip } from "./SourceTypeChip";
import { RelatedNodesList } from "./RelatedNodesList";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type CaptureNode = {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  summary: string | null;
  created_at: string;
  source_type?: string | null;
  extraction_metadata?: Record<string, unknown> | null;
  extraction_error?: string | null;
};

type Props = {
  node: CaptureNode;
  source?: "text" | "voice";
  onDismiss: () => void;
};

function getMetaString(
  meta: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!meta) return null;
  const v = meta[key];
  if (typeof v === "string" && v.trim()) return v;
  if (typeof v === "number") return String(v);
  return null;
}

function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function wordCount(text: string | null | undefined): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function CaptureResult({ node, source, onDismiss }: Props) {
  const t = useTranslations("capture.result");
  const router = useRouter();

  const sourceType = node.source_type ?? source ?? node.type;

  const meta = node.extraction_metadata ?? null;
  const originalFilename = getMetaString(meta, "original_filename");
  const originalUrl = getMetaString(meta, "original_url");
  const domain = domainOf(originalUrl);
  const words = wordCount(node.content);
  const hasError = !!node.extraction_error;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(node.id);
      toast.success(t("nodeIdCopied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const askCortex = () => {
    const q = node.title
      ? t("askAboutTitle", { title: node.title })
      : t("askAboutLatest");
    router.push(`/chat?q=${encodeURIComponent(q)}`);
  };

  return (
    <Card className="bg-card/40 border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="rounded-md bg-primary/10 p-2 mt-0.5 shrink-0">
              <Check className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base font-medium truncate">
                {node.title || t("capturedFallback")}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <SourceTypeChip type={sourceType} />
                <span className="text-xs text-muted-foreground">
                  {new Date(node.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDismiss}
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={t("dismissAria")}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        {node.summary && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              {t("summaryLabel")}
            </p>
            <p className="text-foreground/90 leading-relaxed">{node.summary}</p>
          </div>
        )}

        {node.content && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              {t("contentLabel")}
            </p>
            <p className="text-foreground/80 line-clamp-4 whitespace-pre-wrap">
              {node.content}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
          <MetaPill label={t("wordsLabel")} value={words.toLocaleString()} />
          <MetaPill
            label={t("statusLabel")}
            value={hasError ? t("statusPartial") : t("statusOk")}
            tone={hasError ? "warn" : "ok"}
          />
          {originalFilename && (
            <MetaPill
              label={t("fileLabel")}
              value={originalFilename}
              truncate
            />
          )}
          {domain && originalUrl ? (
            <a
              href={originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <span className="text-muted-foreground">
                {t("siteLabel")}:
              </span>
              <span className="font-medium truncate max-w-[180px]">
                {domain}
              </span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          ) : domain ? (
            <MetaPill label={t("siteLabel")} value={domain} />
          ) : null}
        </div>

        {node.extraction_error && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span className="leading-relaxed">{node.extraction_error}</span>
          </div>
        )}

        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Network className="w-3.5 h-3.5 text-primary" />
            <p className="text-xs font-medium text-muted-foreground">
              {t("connectedLabel")}
            </p>
          </div>
          <RelatedNodesList nodeId={node.id} />
        </div>

        <Separator className="my-1" />

        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={askCortex}
            className="h-7 text-xs"
          >
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
            {t("askCortex")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={copyLink}
            className="h-7 text-xs text-muted-foreground"
          >
            <LinkIcon className="w-3.5 h-3.5 mr-1.5" />
            {t("copyNodeId")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MetaPill({
  label,
  value,
  tone = "neutral",
  truncate = false,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "warn";
  truncate?: boolean;
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground/80";
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-muted-foreground">{label}:</span>
      <span
        className={cn(
          "font-medium",
          toneClass,
          truncate && "truncate max-w-[180px]",
        )}
      >
        {value}
      </span>
    </span>
  );
}
