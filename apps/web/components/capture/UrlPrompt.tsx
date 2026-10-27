"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Link2,
  Loader2,
  Globe,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { useUrlPreview } from "@/lib/hooks/use-cortex";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (url: string) => Promise<void>;
};

const URL_RE = /^https?:\/\/.+/i;

export function UrlPrompt({ open, onOpenChange, onSubmit }: Props) {
  const t = useTranslations("capture.urlPrompt");
  const tCommon = useTranslations("common");
  const [url, setUrl] = useState("");
  const [debouncedUrl, setDebouncedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Reset state on open/close transition without setState-in-effect ──
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setUrl("");
      setDebouncedUrl(null);
      setError(null);
    }
  }

  // Focus the input after the dialog opens (safe — DOM side effect, not state)
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [open]);

  // ── Debounce URL → only update inside the timeout callback (async) ──
  useEffect(() => {
    const trimmed = url.trim();
    if (!URL_RE.test(trimmed)) {
      const timer = setTimeout(() => setDebouncedUrl(null), 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setDebouncedUrl(trimmed), 600);
    return () => clearTimeout(timer);
  }, [url]);

  const {
    data: preview,
    isFetching: previewLoading,
    isError: previewErrored,
  } = useUrlPreview(debouncedUrl);

  const previewFailed = useMemo(
    () => !previewLoading && (previewErrored || !!(preview && preview.error)),
    [previewLoading, previewErrored, preview],
  );

  const handleSubmit = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError(t("errorEmpty"));
      return;
    }
    if (!URL_RE.test(trimmed)) {
      setError(t("errorInvalid"));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      onOpenChange(false);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : t("errorFetch");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const domain =
    preview?.domain ||
    (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return null;
      }
    })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            ref={inputRef}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("placeholder")}
            disabled={loading}
            className="w-full"
          />

          {/* Preview card */}
          {debouncedUrl && (
            <PreviewCard
              preview={preview}
              loading={previewLoading}
              failed={previewFailed}
              fallbackDomain={domain}
            />
          )}

          {error && (
            <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !url.trim() || !URL_RE.test(url.trim())}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                {t("fetching")}
              </>
            ) : (
              t("extractAndCapture")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewCard({
  preview,
  loading,
  failed,
  fallbackDomain,
}: {
  preview:
    | {
        url: string;
        domain: string | null;
        title: string | null;
        description: string | null;
        site_name: string | null;
        image: string | null;
        favicon: string | null;
        error: string | null;
      }
    | undefined;
  loading: boolean;
  failed: boolean;
  fallbackDomain: string | null;
}) {
  const t = useTranslations("capture.urlPrompt");
  const tCapture = useTranslations("capture");

  // Loading skeleton
  if (loading) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-border bg-card/40 p-3">
        <Skeleton className="w-16 h-16 rounded shrink-0" />
        <div className="flex-1 space-y-2 min-w-0">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    );
  }

  // Failed
  if (failed) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span className="leading-relaxed">
          {t("previewFailed")}
        </span>
      </div>
    );
  }

  if (!preview) return null;

  const displayTitle =
    preview.title || preview.domain || fallbackDomain || tCapture("result.capturedFallback");
  const displayDomain = preview.domain || fallbackDomain;

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 rounded-md border border-border bg-card/40 p-3 transition-colors hover:bg-accent/30"
    >
      {preview.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.image}
          alt=""
          className="w-16 h-16 rounded object-cover shrink-0 bg-muted"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <div className="w-16 h-16 rounded bg-muted flex items-center justify-center shrink-0">
          <Globe className="w-5 h-5 text-muted-foreground" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
          {preview.favicon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.favicon}
              alt=""
              className="w-3 h-3 rounded-sm"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
          <span className="truncate">{preview.site_name || displayDomain}</span>
          <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </div>

        <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug">
          {displayTitle}
        </p>

        {preview.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-snug">
            {preview.description}
          </p>
        )}
      </div>
    </a>
  );
}
