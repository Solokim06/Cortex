"""
Gemini Vision integration.

Sends an image to Gemini and gets back STRUCTURED data:
  - content_markdown : a flowing description that becomes the node body
  - image_analysis   : a dict stored on node.meta["image_analysis"] with
                       { type, scene_type, visible_text, objects, layout,
                         entities, context }

Uses Google's gemini-3.8-flash model via the REST API with JSON response mode.
"""

import base64
import hashlib
import json
import re
from typing import Any

import httpx

from app.config.settings import settings


GEMINI_VISION_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent"
)

DEFAULT_VISION_MODEL = "gemini-3.8-flash"

# In-memory cache to avoid re-processing identical images.
# Value shape: (content_markdown, image_analysis_dict)
_vision_cache: dict[str, tuple[str, dict[str, Any]]] = {}
_CACHE_MAX = 100


VISION_PROMPT = """You are Cortex's Vision Engine. Analyze this image and return ONLY a JSON object.

Your goal: extract everything a person could learn from this image, so it can be captured as knowledge.

Return this exact JSON shape:

{
  "description": "<flowing 3-8 sentence markdown description of what is in the image. Include main subject(s), layout/composition, colors/style/tone, any diagrams/arrows/flow, and chart axis labels or key numbers where relevant. Be exhaustive but concise. Never invent details. Mark unclear items as [unclear].>",
  "visible_text": "<Transcribe ALL legible text exactly as it appears. Preserve headers, bullets, columns using markdown. Use empty string if no text is visible.>",
  "type": "<one of: photo | screenshot | whiteboard | diagram | chart | document | meme | artwork | other>",
  "scene_type": "<short specific label, e.g. 'screenshot of a tweet', 'handwritten meeting notes', 'architecture diagram', 'bar chart of revenue'. Use empty string if uncertain.>",
  "objects": ["<notable objects or UI elements, one per array entry>"],
  "layout": [
    {"region": "<top-left|top|top-right|left|center|right|bottom-left|bottom|bottom-right>", "role": "<what is in this region>"}
  ],
  "entities": ["<named people, places, organizations, products, or technical terms>"],
  "context": "<one short sentence guessing the purpose or setting, or empty string if unclear>"
}

Rules:
- Return ONLY the JSON object. No markdown fences, no commentary before or after.
- All top-level keys must be present. Use empty arrays [] and empty strings "" when there is nothing to report.
- Never invent details that are not in the image.
"""


def _hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _get_cached(data: bytes) -> tuple[str, dict[str, Any]] | None:
    return _vision_cache.get(_hash(data))


def _set_cached(data: bytes, value: tuple[str, dict[str, Any]]) -> None:
    if len(_vision_cache) >= _CACHE_MAX:
        # Evict oldest key (dict preserves insertion order)
        first_key = next(iter(_vision_cache))
        _vision_cache.pop(first_key, None)
    _vision_cache[_hash(data)] = value


async def extract_image_text(
    image_bytes: bytes,
    filename: str = "image.jpg",
    model: str = DEFAULT_VISION_MODEL,
    annotation_context: str = "",
) -> tuple[str, dict[str, Any]]:
    """
    Send an image to Gemini Vision and return (content_markdown, image_analysis).

    content_markdown -- ready to become the node body.
    image_analysis   -- structured dict for node.meta["image_analysis"].
                        On error, contains {"error": "..."} and content is a
                        descriptive fallback string.

    annotation_context -- optional text block describing user-drawn
                          annotations. If provided, it's appended to the
                          vision prompt so Gemini focuses on annotated
                          regions.

    Never raises.
    """

    def _fallback(msg: str) -> tuple[str, dict[str, Any]]:
        return (f"# Image: {filename}\n\n{msg}", {"error": msg})

    if not image_bytes:
        return _fallback("(empty image)")

    # Cache check. Skip when annotations are present so that an annotated
    # upload always gets a fresh extraction (the same image without
    # annotations may be cached from an earlier request).
    if not annotation_context.strip():
        cached = _get_cached(image_bytes)
        if cached is not None:
            return cached

    if not settings.gemini_api_key:
        return _fallback("(image uploaded, but GEMINI_API_KEY is not configured)")

    # Detect MIME type from filename (Gemini needs it)
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
    mime_map = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "gif": "image/gif",
        "bmp": "image/bmp",
        "tiff": "image/tiff",
        "heic": "image/heic",
        "heif": "image/heif",
    }
    mime_type = mime_map.get(ext, "image/jpeg")

    b64 = base64.b64encode(image_bytes).decode("ascii")
    url = GEMINI_VISION_URL.format(model=model)

    # Compose the effective prompt. If annotations exist, append the
    # annotation context so Gemini focuses on the marked regions.
    effective_prompt = VISION_PROMPT
    if annotation_context.strip():
        effective_prompt = (
            f"{VISION_PROMPT}\n\n---\n\n{annotation_context.strip()}"
        )

    body: dict[str, Any] = {
        "contents": [
            {
                "parts": [
                    {"text": effective_prompt},
                    {"inline_data": {"mime_type": mime_type, "data": b64}},
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 2500,
            "responseMimeType": "application/json",
        },
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            # Retry once on 5xx (model is often transiently overloaded)
            r = await client.post(
                url,
                params={"key": settings.gemini_api_key},
                headers={"Content-Type": "application/json"},
                json=body,
            )
            if r.status_code >= 500:
                import asyncio as _asyncio
                await _asyncio.sleep(3)
                r = await client.post(
                    url,
                    params={"key": settings.gemini_api_key},
                    headers={"Content-Type": "application/json"},
                    json=body,
                )

            if r.status_code == 429:
                return _fallback(
                    "(image uploaded, but Gemini Vision rate limit was hit "
                    "-- try again in a minute)"
                )
            if r.status_code >= 400:
                print(f"[Cortex] Gemini Vision error {r.status_code}: {r.text[:300]}")
                if r.status_code == 503:
                    return _fallback(
                        "(image uploaded, but Gemini Vision is temporarily "
                        "overloaded — try re-uploading in a minute)"
                    )
                if r.status_code == 429:
                    return _fallback(
                        "(image uploaded, but Gemini Vision rate limit was hit "
                        "-- try again in a minute)"
                    )
                # Extract Gemini's own error message if available
                try:
                    err_body = r.json().get("error", {}) or {}
                    msg = (
                        err_body.get("message")
                        or err_body.get("status")
                        or r.text[:150]
                    )
                except Exception:
                    msg = r.text[:150]
                return _fallback(
                    f"(image uploaded, but Gemini Vision returned {r.status_code}: {msg})"
                )

            data = r.json()

        candidates = data.get("candidates") or []
        if not candidates:
            return _fallback("(image uploaded, but Gemini returned no content)")

        parts = candidates[0].get("content", {}).get("parts") or []
        text_parts = [p.get("text", "") for p in parts if "text" in p]
        raw = "\n".join(text_parts).strip()
        if not raw:
            return _fallback("(image uploaded, but Gemini returned an empty response)")

        # Gemini sometimes wraps JSON in ```json fences despite responseMimeType.
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as e:
            print(f"[Cortex] Vision JSON parse failed: {e}; raw[:300]={raw[:300]}")
            return _fallback("(image uploaded, but Gemini returned malformed JSON)")

        if not isinstance(parsed, dict):
            return _fallback("(image uploaded, but Gemini returned non-object JSON)")

        # ---- Build content_markdown from the structured fields ----
        description = str(parsed.get("description", "")).strip()
        visible_text = str(parsed.get("visible_text", "")).strip()

        sections: list[str] = [f"# Image: {filename}"]
        if description:
            sections.append(description)
        if visible_text:
            sections.append("## Visible text\n\n" + visible_text)

        content_markdown = "\n\n".join(sections)

        # ---- Build image_analysis dict (everything except description) ----
        def _as_list(v: Any) -> list:
            return v if isinstance(v, list) else []

        image_analysis: dict[str, Any] = {
            "type": str(parsed.get("type", "")).strip().lower(),
            "scene_type": str(parsed.get("scene_type", "")).strip(),
            "visible_text": visible_text,
            "objects": _as_list(parsed.get("objects")),
            "layout": _as_list(parsed.get("layout")),
            "entities": _as_list(parsed.get("entities")),
            "context": str(parsed.get("context", "")).strip(),
        }

        result = (content_markdown, image_analysis)
        if not annotation_context.strip():
            _set_cached(image_bytes, result)
        return result

    except httpx.HTTPError as e:
        # Never let this string be empty — httpx raises with an empty
        # message for some errors (e.g. ReadTimeout with no wrapped error).
        msg = str(e) or type(e).__name__
        print(f"[Cortex] Gemini Vision HTTP error: {msg}")
        return _fallback(f"(image uploaded, but the vision API request failed: {msg})")
    except Exception as e:
        print(f"[Cortex] Gemini Vision unexpected error: {e}")
        return _fallback(
            f"(image uploaded, but vision processing failed: {type(e).__name__})"
        )


def is_vision_available() -> bool:
    """Check whether vision is configured."""
    return bool(settings.gemini_api_key)
