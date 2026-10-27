/**
 * Bidirectional conversion between Cortex's Annotation[] and tldraw shapes.
 *
 * The image is placed as a locked, non-selectable tldraw image shape.
 * User annotations are placed on top as geo (box), arrow, and text shapes.
 *
 * Coordinates in Annotation are IMAGE PIXEL SPACE. tldraw shapes store
 * their own coordinates in tldraw's page space, which here is scaled so
 * that (0,0) is the top-left of the image and image pixels map 1:1 to
 * tldraw page units.
 */

import type { Editor } from "tldraw";
import type { Annotation, AnnotationColor } from "./annotations";

// Convert a plain label string into tldraw's rich-text format.
// In tldraw 5.x, geo / arrow / text shapes store labels as `richText`, not
// a plain `text` string, and the schema rejects unknown props.
function labelToRichText(s: string): Record<string, unknown> {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: s ? [{ type: "text", text: s }] : [],
      },
    ],
  };
}

export const IMAGE_SHAPE_ID = "shape:image" as const;

const COLOR_TO_TLDRAW: Record<AnnotationColor, string> = {
  yellow: "yellow",
  red: "red",
  green: "green",
  blue: "blue",
};

const TLDRAW_TO_COLOR: Record<string, AnnotationColor> = {
  yellow: "yellow",
  red: "red",
  green: "green",
  blue: "blue",
};

// ---------------------------------------------------------------------------
// CREATE SHAPES — called once on mount with the image dimensions
// ---------------------------------------------------------------------------

export function buildImageShape(opts: {
  src: string;
  width: number;
  height: number;
}): Record<string, unknown> {
  return {
    id: IMAGE_SHAPE_ID,
    type: "image",
    x: 0,
    y: 0,
    props: {
      w: opts.width,
      h: opts.height,
      assetId: null,
      playing: false,
      url: opts.src,
      crop: null,
      flipX: false,
      flipY: false,
    },
    meta: { locked: true, isBackground: true },
  };
}

export function annotationToShape(
  a: Annotation,
  index: number,
): Record<string, unknown> {
  const id = `shape:annotation-${index}`;
  const color = a.color ? COLOR_TO_TLDRAW[a.color] : "yellow";

  if (a.kind === "box") {
    return {
      id,
      type: "geo",
      x: a.x,
      y: a.y,
      props: {
        geo: "rectangle",
        w: a.w,
        h: a.h,
        color,
        fill: "none",
        dash: "draw",
        size: "m",
        labelColor: color,
        richText: labelToRichText(a.label),
        font: "draw",
        align: "middle",
        verticalAlign: "middle",
        growY: 0,
        url: "",
        scale: 1,
      },
    };
  }

  if (a.kind === "arrow") {
    return {
      id,
      type: "arrow",
      x: a.x1,
      y: a.y1,
      props: {
        color,
        dash: "draw",
        size: "m",
        arrowheadStart: "none",
        arrowheadEnd: "arrow",
        font: "draw",
        richText: labelToRichText(a.label),
        bend: 0,
        start: { x: 0, y: 0 },
        end: { x: a.x2 - a.x1, y: a.y2 - a.y1 },
        labelPosition: 0.5,
        scale: 1,
      },
    };
  }

  // text
  return {
    id,
    type: "text",
    x: a.x,
    y: a.y,
    props: {
      color,
      size: "m",
      font: "draw",
        richText: labelToRichText(a.text),
      autoSize: true,
      scale: 1,
    },
  };
}

// ---------------------------------------------------------------------------
// EXTRACT — called on save. Walks the editor's current shapes and returns
// our Annotation[] shape, skipping the background image.
// ---------------------------------------------------------------------------

export function extractAnnotations(editor: Editor): Annotation[] {
  const shapes = editor.getCurrentPageShapes();
  const out: Annotation[] = [];

  for (const shape of shapes) {
    if (shape.id === IMAGE_SHAPE_ID) continue;
    if ((shape.meta as Record<string, unknown> | undefined)?.isBackground) {
      continue;
    }

    const color = TLDRAW_TO_COLOR[(shape.props as { color?: string }).color ?? "yellow"];

    const p = shape.props as unknown as Record<string, unknown>;

    if (shape.type === "geo") {
      if (p.geo === "rectangle") {
        out.push({
          kind: "box",
          x: shape.x,
          y: shape.y,
          w: typeof p.w === "number" ? p.w : 0,
          h: typeof p.h === "number" ? p.h : 0,
          label: readText(p),
          color,
        });
      }
    } else if (shape.type === "arrow") {
      const start = (p.start ?? { x: 0, y: 0 }) as { x: number; y: number };
      const end = (p.end ?? { x: 0, y: 0 }) as { x: number; y: number };
      out.push({
        kind: "arrow",
        x1: shape.x + (start.x ?? 0),
        y1: shape.y + (start.y ?? 0),
        x2: shape.x + (end.x ?? 0),
        y2: shape.y + (end.y ?? 0),
        label: readText(p),
        color,
      });
    } else if (shape.type === "text") {
      out.push({
        kind: "text",
        x: shape.x,
        y: shape.y,
        text: readText(p),
        color,
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Defensive text reader — tldraw 5.x stores shape text on different props
// depending on shape type and version: `text`, `richText`, or neither.
// ---------------------------------------------------------------------------

function readText(props: Record<string, unknown>): string {
  // Plain string field (older format, or user-set)
  if (typeof props.text === "string" && props.text.length > 0) {
    return props.text;
  }
  // tldraw 5.x stores text as a rich text object
  const rt = props.richText;
  if (rt && typeof rt === "object") {
    return richTextToString(rt as Record<string, unknown>);
  }
  return "";
}

function richTextToString(rt: Record<string, unknown>): string {
  // tldraw's rich text is a document with a content array of blocks.
  try {
    const content = rt.content as unknown[];
    if (!Array.isArray(content)) return "";
    const out: string[] = [];
    for (const block of content) {
      const b = block as Record<string, unknown>;
      if (b.type === "paragraph" && Array.isArray(b.content)) {
        for (const node of b.content as unknown[]) {
          const n = node as Record<string, unknown>;
          if (n.type === "text" && typeof n.text === "string") {
            out.push(n.text);
          }
        }
      }
    }
    return out.join(" ").trim();
  } catch {
    return "";
  }
}
