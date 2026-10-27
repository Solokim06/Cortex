/**
 * Annotation types and helpers.
 *
 * An annotation is a user-drawn mark on an image. Coordinates are in
 * IMAGE PIXEL SPACE, not viewport space — so they survive resizing.
 *
 * Storage shape (node.meta.annotations):
 *   [{kind: "box" | "arrow" | "text", ...}, ...]
 *
 * The annotator (ImageAnnotator.tsx) produces this shape from tldraw,
 * and this module serializes / parses / formats it for the LLM.
 */

export type AnnotationColor = "yellow" | "red" | "green" | "blue";

export type BoxAnnotation = {
  kind: "box";
  /** Top-left corner, in image pixels */
  x: number;
  y: number;
  /** Size, in image pixels */
  w: number;
  h: number;
  /** Short label (user-facing + sent to LLM) */
  label: string;
  color?: AnnotationColor;
};

export type ArrowAnnotation = {
  kind: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  color?: AnnotationColor;
};

export type TextAnnotation = {
  kind: "text";
  x: number;
  y: number;
  text: string;
  color?: AnnotationColor;
};

export type Annotation = BoxAnnotation | ArrowAnnotation | TextAnnotation;

// ---------------------------------------------------------------------------
// Serialization — for the wire (JSON string in a FormData field)
// ---------------------------------------------------------------------------

export function serializeAnnotations(annotations: Annotation[]): string {
  return JSON.stringify(annotations);
}

export function parseAnnotations(raw: string | null | undefined): Annotation[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAnnotation);
  } catch {
    return [];
  }
}

function isAnnotation(x: unknown): x is Annotation {
  if (!x || typeof x !== "object") return false;
  const a = x as Record<string, unknown>;
  if (a.kind === "box") {
    return (
      typeof a.x === "number" &&
      typeof a.y === "number" &&
      typeof a.w === "number" &&
      typeof a.h === "number" &&
      typeof a.label === "string"
    );
  }
  if (a.kind === "arrow") {
    return (
      typeof a.x1 === "number" &&
      typeof a.y1 === "number" &&
      typeof a.x2 === "number" &&
      typeof a.y2 === "number" &&
      typeof a.label === "string"
    );
  }
  if (a.kind === "text") {
    return (
      typeof a.x === "number" &&
      typeof a.y === "number" &&
      typeof a.text === "string"
    );
  }
  return false;
}

// ---------------------------------------------------------------------------
// LLM formatting — turns the annotation list into a readable text block
// that Gemini can reason about. Kept short and factual.
// ---------------------------------------------------------------------------

export function formatAnnotationsForLLM(
  annotations: Annotation[],
  imageWidth: number,
  imageHeight: number,
): string {
  if (annotations.length === 0) return "";

  const lines: string[] = [
    "The user has marked up this image. Treat these marks as the regions of interest:",
    "",
  ];

  annotations.forEach((a, i) => {
    const n = i + 1;
    if (a.kind === "box") {
      const region = describeRegion(a.x, a.y, a.w, a.h, imageWidth, imageHeight);
      lines.push(
        `${n}. Box (${region}) labelled "${a.label}" — ${Math.round(a.w)}×${Math.round(a.h)}px at (${Math.round(a.x)},${Math.round(a.y)})`,
      );
    } else if (a.kind === "arrow") {
      const from = describePoint(a.x1, a.y1, imageWidth, imageHeight);
      const to = describePoint(a.x2, a.y2, imageWidth, imageHeight);
      lines.push(
        `${n}. Arrow from ${from} to ${to}, labelled "${a.label}"`,
      );
    } else if (a.kind === "text") {
      const at = describePoint(a.x, a.y, imageWidth, imageHeight);
      lines.push(`${n}. Text note at ${at}: "${a.text}"`);
    }
  });

  lines.push(
    "",
    "In your description, prioritise what the annotations point to. " +
      "Explicitly mention the labelled regions and their content. " +
      "Do not describe the marks themselves (the boxes, arrows, or labels) " +
      "as if they were part of the image — describe what they point at.",
  );

  return lines.join("\n");
}

function describePoint(
  x: number,
  y: number,
  w: number,
  h: number,
): string {
  const xr = x / w;
  const yr = y / h;
  const vertical = yr < 0.33 ? "upper" : yr < 0.67 ? "middle" : "lower";
  const horizontal = xr < 0.33 ? "left" : xr < 0.67 ? "center" : "right";
  if (vertical === "middle" && horizontal === "center") return "center";
  return `${vertical}-${horizontal}`;
}

function describeRegion(
  x: number,
  y: number,
  w: number,
  h: number,
  imgW: number,
  imgH: number,
): string {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return describePoint(cx, cy, imgW, imgH);
}

// ---------------------------------------------------------------------------
// Read-only overlay math — for rendering annotations over an image
// at arbitrary display size.
// ---------------------------------------------------------------------------

export function scaleToDisplay(
  px: number,
  imageDim: number,
  displayDim: number,
): number {
  if (imageDim <= 0) return 0;
  return (px / imageDim) * displayDim;
}
