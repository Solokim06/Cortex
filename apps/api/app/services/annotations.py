"""
Image annotation helpers (server-side).

Cortex's frontend lets users draw boxes / arrows / text on an image. The
raw annotations are sent as a JSON string in the "annotations" Form field
of POST /capture/file. This module:

1. Parses and validates that JSON
2. Formats the annotations as a text block that's prepended to the vision
   prompt, so Gemini focuses its extraction on the annotated regions.

Coordinates are in IMAGE PIXEL SPACE (0,0 = top-left of the image, in
natural pixel dimensions).

Mirror of lib/annotations.ts's formatAnnotationsForLLM — keep the two
in sync when either changes.
"""

from __future__ import annotations

import json
from typing import Any


_VALID_KINDS = {"box", "arrow", "text"}


def parse_annotations(raw: str | None) -> list[dict[str, Any]]:
    """Parse and validate the raw JSON string. Returns [] on any failure."""
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(parsed, list):
        return []
    return [a for a in parsed if isinstance(a, dict) and a.get("kind") in _VALID_KINDS]


def _describe_point(x: float, y: float, w: float, h: float) -> str:
    """Return 'upper-left', 'middle-center', etc. for a coordinate."""
    xr = x / w if w > 0 else 0.5
    yr = y / h if h > 0 else 0.5
    vertical = "upper" if yr < 0.33 else "middle" if yr < 0.67 else "lower"
    horizontal = "left" if xr < 0.33 else "center" if xr < 0.67 else "right"
    if vertical == "middle" and horizontal == "center":
        return "center"
    return f"{vertical}-{horizontal}"


def format_annotations_for_llm(
    annotations: list[dict[str, Any]],
    image_width: int,
    image_height: int,
) -> str:
    """
    Turn the annotation list into a text block that can be prepended to
    the vision prompt. Mirrors lib/annotations.ts.
    """
    if not annotations:
        return ""

    lines: list[str] = [
        "The user has marked up this image. Treat these marks as the regions of interest:",
        "",
    ]

    for i, a in enumerate(annotations, start=1):
        kind = a.get("kind")
        if kind == "box":
            x = float(a.get("x", 0))
            y = float(a.get("y", 0))
            w = float(a.get("w", 0))
            h = float(a.get("h", 0))
            cx, cy = x + w / 2, y + h / 2
            region = _describe_point(cx, cy, image_width, image_height)
            label = str(a.get("label", "") or "")
            lines.append(
                f'{i}. Box ({region}) labelled "{label}" — '
                f"{round(w)}x{round(h)}px at ({round(x)},{round(y)})"
            )
        elif kind == "arrow":
            x1 = float(a.get("x1", 0))
            y1 = float(a.get("y1", 0))
            x2 = float(a.get("x2", 0))
            y2 = float(a.get("y2", 0))
            src = _describe_point(x1, y1, image_width, image_height)
            dst = _describe_point(x2, y2, image_width, image_height)
            label = str(a.get("label", "") or "")
            lines.append(f'{i}. Arrow from {src} to {dst}, labelled "{label}"')
        elif kind == "text":
            x = float(a.get("x", 0))
            y = float(a.get("y", 0))
            at = _describe_point(x, y, image_width, image_height)
            text = str(a.get("text", "") or "")
            lines.append(f'{i}. Text note at {at}: "{text}"')

    lines.extend(
        [
            "",
            "In your description, prioritise what the annotations point to. "
            "Explicitly mention the labelled regions and their content. "
            "Do not describe the marks themselves (the boxes, arrows, or labels) "
            "as if they were part of the image — describe what they point at.",
        ]
    )

    return "\n".join(lines)
