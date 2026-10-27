"use client";

import { useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Upload, Loader2, X, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { API_BASE } from "@/lib/cortex";

type Props = {
  /** Called with the uploaded file's URL (e.g. "/uploads/feedback/x.png") */
  onUploaded: (url: string) => void;
  /** Current URL, if any */
  value: string | null;
  disabled?: boolean;
};

const MAX_MB = 5;
const ACCEPT = "image/png,image/jpeg,image/webp";

/**
 * Drag-and-drop (or click) screenshot uploader.
 *
 * Immediately uploads on selection and calls `onUploaded(url)`. Shows a
 * thumbnail preview with a remove button once uploaded.
 */
export function ScreenshotDropzone({ onUploaded, value, disabled }: Props) {
  const { getToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const openPicker = () => {
    if (disabled || uploading) return;
    inputRef.current?.click();
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    // Client-side checks (server also validates)
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`File too large (max ${MAX_MB} MB)`);
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Only PNG, JPG, or WebP are supported");
      return;
    }

    setUploading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");

      const form = new FormData();
      form.append("file", file);

      const resp = await fetch(`${API_BASE}/help/feedback/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${resp.status}`);
      }

      const data = (await resp.json()) as { url: string };
      onUploaded(data.url);
      toast.success("Screenshot attached");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Upload failed",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  // ---- Preview state ----
  if (value) {
    const fullUrl = value.startsWith("http") ? value : `${API_BASE}${value}`;
    return (
      <div className="relative inline-block rounded-md border border-border overflow-hidden group">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fullUrl}
          alt="Attached screenshot"
          className="max-h-40 max-w-full object-contain bg-card/30"
        />
        <button
          type="button"
          onClick={() => onUploaded("")}
          disabled={disabled}
          className={cn(
            "absolute top-1.5 right-1.5 rounded-full bg-black/70 backdrop-blur-sm text-white",
            "p-1 hover:bg-black/90 transition-colors",
            "disabled:opacity-40",
          )}
          aria-label="Remove screenshot"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-2 py-1 flex items-center gap-1.5">
          <ImageIcon className="w-3 h-3" />
          Attached
        </div>
      </div>
    );
  }

  // ---- Dropzone state ----
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={(e) => void handleFiles(e.target.files)}
        className="hidden"
      />
      <div
        onClick={openPicker}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !uploading) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled && !uploading) {
            void handleFiles(e.dataTransfer.files);
          }
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed",
          "py-5 px-4 cursor-pointer transition-colors text-center",
          dragOver
            ? "border-primary/60 bg-primary/5"
            : "border-border hover:border-primary/40 hover:bg-accent/30",
          (disabled || uploading) && "opacity-60 pointer-events-none",
        )}
      >
        {uploading ? (
          <>
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <span className="text-xs text-muted-foreground">
              Uploading…
            </span>
          </>
        ) : (
          <>
            <Upload className="w-5 h-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Click or drag an image here
            </span>
            <span className="text-[10px] text-muted-foreground">
              PNG, JPG, or WebP · max {MAX_MB} MB
            </span>
          </>
        )}
      </div>
    </>
  );
}
