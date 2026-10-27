"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { Loader2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchBlobUrl, API_BASE, cortexFetch } from "@/lib/api";
import type { Annotation } from "@/lib/annotations";
import { AnnotationOverlay } from "@/components/memory/AnnotationOverlay";
import { AnnotatorModal } from "@/components/capture/AnnotatorModal";

type Props = {
  nodeId: string;
  imageUrl: string;       // e.g. "/files/image/<uuid>"
  imageWidth: number;
  imageHeight: number;
  annotations: Annotation[];
  /** Called after a successful save so the parent can refetch the node */
  onSaved?: () => void;
};

/**
 * Renders an image node inside the SourcePanel:
 *   - the image (fetched with auth as a blob URL)
 *   - the annotations overlay on top
 *   - an "Annotate" button that opens the modal in edit mode
 */
export function SourceImageBlock({
  nodeId,
  imageUrl,
  imageWidth,
  imageHeight,
  annotations,
  onSaved,
}: Props) {
  const t = useTranslations("memory.sourceImage");
  const { getToken } = useAuth();

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // ---- Fetch the image as a blob URL (needs auth) ----
  useEffect(() => {
    if (!imageUrl) return;
    let cancelled = false;
    let created: string | null = null;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = (await getToken()) ?? "";
        const path = imageUrl.startsWith("http")
          ? imageUrl.replace(API_BASE, "")
          : imageUrl;
        const url = await fetchBlobUrl(path, token);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        created = url;
        setBlobUrl(url);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [imageUrl, getToken]);

  // ---- Save annotations on the existing node ----
  const handleSave = async (next: Annotation[]) => {
    setSaving(true);
    try {
      const token = (await getToken()) ?? "";
      await cortexFetch(`/capture/${nodeId}/annotations`, {
        method: "POST",
        body: { annotations: next, re_enrich: false },
        token,
      });
      setModalOpen(false);
      onSaved?.();
    } catch (e) {
      console.error("[Cortex] Save annotations failed:", e);
      // Keep the modal open on error so the user can retry
    } finally {
      setSaving(false);
    }
  };

  // ---- Aspect-ratio wrapper so overlay scales correctly ----
  const aspect = useMemo(() => {
    if (imageWidth > 0 && imageHeight > 0) return imageWidth / imageHeight;
    return 16 / 9;
  }, [imageWidth, imageHeight]);

  return (
    <div className="space-y-2">
      {/* Image + overlay */}
      <div
        className="relative w-full rounded-md border border-border bg-black/40 overflow-hidden"
        style={{ aspectRatio: aspect }}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-center px-4">
            <p className="text-[11px] text-muted-foreground">
              {t("imageUnavailable")}
            </p>
          </div>
        )}
        {blobUrl && !error && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={blobUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-contain"
              draggable={false}
            />
            {annotations.length > 0 && (
              <AnnotationOverlay
                imageWidth={imageWidth}
                imageHeight={imageHeight}
                annotations={annotations}
              />
            )}
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          disabled={saving || !blobUrl}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1",
            "text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40",
            "disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
          )}
        >
          <Pencil className="w-3 h-3" />
          {annotations.length > 0
            ? t("editAnnotations", { count: annotations.length })
            : t("addAnnotations")}
        </button>
      </div>

      {/* Modal in edit mode */}
      <AnnotatorModal
        open={modalOpen}
        imageSrc={blobUrl ?? ""}
        initialAnnotations={annotations}
        onSave={handleSave}
        onCancel={() => setModalOpen(false)}
      />
    </div>
  );
}
