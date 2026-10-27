"use client";

import dynamic from "next/dynamic";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Annotation } from "@/lib/annotations";
import { annotationToShape, extractAnnotations } from "@/lib/annotations-tldraw";

// ----------------------------------------------------------------------------
// tldraw is a big client-only library. Import it lazily so it doesn't inflate
// the initial page load — it only downloads when the annotator is opened.
// ----------------------------------------------------------------------------

// Minimal shape of the props we actually pass. Using `any` for the
// component type because tldraw's TldrawProps has dozens of optional
// fields and we only touch `onMount` and `components`.
type TldrawComponent = React.ComponentType<{
  onMount?: (editor: Editor) => void;
  components?: Record<string, React.ComponentType<unknown>>;
  hideUi?: boolean;
  inferDarkMode?: boolean;
  persistenceKey?: string;
}>;

const Tldraw = dynamic(
  () => import("tldraw").then((m) => m.Tldraw as unknown as TldrawComponent),
  { ssr: false },
);

// ----------------------------------------------------------------------------
// The editor instance type. We don't import the tldraw Editor type at top
// level because that would pull tldraw into the module graph for non-users.
// ----------------------------------------------------------------------------

type Editor = {
  createShape: (shape: Record<string, unknown>) => void;
  getCurrentPageShapes: () => Array<{
    id: string;
    type: string;
    x: number;
    y: number;
    props: Record<string, unknown>;
    meta?: Record<string, unknown>;
  }>;
  setCurrentTool: (tool: string) => void;
  setCamera: (camera: { x: number; y: number; z: number }) => void;
  getCamera: () => { x: number; y: number; z: number };
  updateInstanceState: (update: Record<string, unknown>) => void;
  getInstanceState: () => Record<string, unknown>;
};

export type ImageAnnotatorHandle = {
  getAnnotations: () => Annotation[];
  getEditor: () => Editor | null;
};

type Props = {
  /** Blob URL or backend URL for the image */
  imageSrc: string;
  /** Optional existing annotations to load (for post-capture editing) */
  initialAnnotations?: Annotation[];
  /** Called once when the editor instance is ready (for the toolbar) */
  onEditorReady?: (editor: Editor) => void;
  className?: string;
};

export const ImageAnnotator = forwardRef<ImageAnnotatorHandle, Props>(
  function ImageAnnotator(
    { imageSrc, initialAnnotations, onEditorReady, className },
    ref,
  ) {
    const editorRef = useRef<Editor | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(
      null,
    );
    const [error, setError] = useState<string | null>(null);
    const [viewportScale, setViewportScale] = useState(1);
    const [viewportOffset, setViewportOffset] = useState({ x: 0, y: 0 });

    // ---- Load the image to get its natural dimensions ----
    useEffect(() => {
      setError(null);
      setImageSize(null);
      const img = new Image();
      img.onload = () => {
        setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
      };
      img.onerror = () => {
        setError("Could not load the image.");
      };
      img.src = imageSrc;
      return () => {
        img.onload = null;
        img.onerror = null;
      };
    }, [imageSrc]);

    // ---- When the editor mounts and the image is sized, seed the shapes ----
    const onMount = useCallback(
      (editor: Editor) => {
        editorRef.current = editor;
        onEditorReady?.(editor);

        if (!imageSize) return;

        // Re-hydrate any existing annotations. These are in IMAGE PIXEL SPACE,
        // which is also the tldraw page coordinate system because we set the
        // camera so that (0,0) is the image's top-left and 1 page unit = 1
        // image pixel.
        (initialAnnotations ?? []).forEach((a, i) => {
          editor.createShape(annotationToShape(a, i));
        });

        // Default tool: rectangle (tldraw's "geo" tool)
        editor.setCurrentTool("geo");

        try {
          editor.updateInstanceState({
            isGridMode: false,
            isDebugMode: false,
          });
        } catch {
          /* some state fields vary between versions */
        }

        // Position the camera so the image fits inside the container.
        // The image is rendered as a background <img> at the same
        // container size, so we set the camera zoom to 1 and offset 0 —
        // tldraw's coordinates then line up 1:1 with the display pixels,
        // and the background image is scaled to match via CSS.
        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const scale = Math.min(
            rect.width / imageSize.w,
            rect.height / imageSize.h,
          );
          // Center the image in the viewport
          const offsetX = (rect.width - imageSize.w * scale) / 2;
          const offsetY = (rect.height - imageSize.h * scale) / 2;

          try {
            editor.setCamera({ x: offsetX, y: offsetY, z: scale });
          } catch {
            /* ignore */
          }

          // Store the computed scale/offsets for the extraction mapping
          setViewportScale(scale);
          setViewportOffset({ x: offsetX, y: offsetY });
        }

        // Force all of tldraw's background layers to be transparent so the
        // background <img> shows through. We do this in JS (inline styles)
        // because tldraw's CSS has high specificity and fights stylesheet
        // overrides. Inline !important is the only guaranteed winner.
        const forceTransparent = () => {
          const container = containerRef.current;
          if (!container) return;
          container
            .querySelectorAll<HTMLElement>(
              ".tl-container, .tl-canvas, .tl-background, .tl-html-layer, canvas",
            )
            .forEach((el) => {
              el.style.setProperty("background", "transparent", "important");
              el.style.setProperty("background-color", "transparent", "important");
              el.style.setProperty("background-image", "none", "important");
            });
        };

        // Run now, on the next frame, and again after 300ms to catch
        // any late-mounted layers.
        forceTransparent();
        requestAnimationFrame(forceTransparent);
        setTimeout(forceTransparent, 300);
      },
      [imageSize, initialAnnotations, onEditorReady],
    );

    // ---- Expose getAnnotations() to the parent ----
    // These are kept in state because we may need them for coordinate
    // reconciliation in future revisions. Not currently read.
    void viewportScale;
    void viewportOffset;

    useImperativeHandle(
      ref,
      () => ({
        getAnnotations: () => {
          const editor = editorRef.current;
          if (!editor) return [];
          // Reconstruct the shape of the editor for the extractor
          return extractAnnotations(editor as never);
        },
        getEditor: () => editorRef.current,
      }),
      [],
    );

    // ---- Render ----
    if (error) {
      return (
        <div
          className={cn(
            "flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground",
            className,
          )}
        >
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm">{error}</p>
        </div>
      );
    }

    if (!imageSize) {
      return (
        <div
          className={cn(
            "flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground",
            className,
          )}
        >
          <Loader2 className="w-5 h-5 animate-spin" />
          <p className="text-xs">Loading image…</p>
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        className={cn(
          "cortex-annotator relative w-full h-full overflow-hidden",
          className,
        )}
      >
        {/* Background image — positioned so that tldraw's page coordinates
            (which we align to image pixels via setCamera in onMount) line up
            with the rendered image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
        />

        {/* tldraw canvas on top, transparent background.
            hideUi strips tldraw's own toolbars/panels/help — we render
            our own toolbar above. */}
        <div className="absolute inset-0">
          <Tldraw onMount={onMount} hideUi />
        </div>

        {/* Force tldraw's various background layers to be transparent so
            the underlying <img> shows through. */}
        <style jsx global>{`
          .cortex-annotator .tl-container,
          .cortex-annotator .tl-canvas,
          .cortex-annotator .tl-background,
          .cortex-annotator .tl-html-layer {
            background: transparent !important;
            background-color: transparent !important;
            background-image: none !important;
          }
          .cortex-annotator canvas {
            background: transparent !important;
          }
        `}</style>
      </div>
    );
  },
);
