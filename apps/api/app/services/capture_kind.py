"""
Capture kind classification.

Classifies a capture (voice transcript, image description, or manual text)
into a small set of kinds. The result is stored on the node as
meta.capture_classification = {kind, confidence, reasoning}.

Kinds:
  idea | task | question | reflection   -- base taxonomy (user-facing filter)
  note | reference | decision | other    -- extensions the LLM may return
"""

from __future__ import annotations

from typing import Any

from app.config.settings import get_settings
from app.services.ai import call_llm_json

# Base kinds that the Memory page filter exposes. The LLM may return
# any of ALL_KINDS, but only BASE_KINDS get dedicated filter chips.
BASE_KINDS: tuple[str, ...] = ("idea", "task", "question", "reflection")
EXTRA_KINDS: tuple[str, ...] = ("note", "reference", "decision", "other")
ALL_KINDS: tuple[str, ...] = BASE_KINDS + EXTRA_KINDS

_SYSTEM = """You classify short captures into a single kind.

Allowed kinds:
  idea       -- a thought, hypothesis, or something to explore
  task       -- something to do, a reminder, an action item
  question   -- an open question the user wants answered
  reflection -- a personal observation, feeling, or retrospective
  note       -- a neutral factual jotting
  reference  -- a pointer to external material (link, book, quote)
  decision   -- a choice made or to be made, with rationale
  other      -- none of the above

Return ONLY a JSON object:
{
  "kind": "<one of the allowed kinds>",
  "confidence": <float 0.0-1.0>,
  "reasoning": "<one short sentence>"
}

Be decisive. Prefer the base kinds (idea/task/question/reflection) when
they fit. Use the others only when clearly better."""


def _fallback(kind: str, confidence: float, reasoning: str) -> dict[str, Any]:
    return {"kind": kind, "confidence": confidence, "reasoning": reasoning}


async def classify_capture(
    text: str,
    source_type: str = "manual",
    locale: str = "en",
) -> dict[str, Any]:
    """
    Classify a capture into a kind.

    Returns:
        {
          "kind": "idea" | "task" | "question" | "reflection"
                | "note" | "reference" | "decision" | "other",
          "confidence": float,
          "reasoning": str,
        }

    Never raises: on any failure returns a safe fallback so the capture
    pipeline is never blocked by classification.
    """
    s = get_settings()

    if not s.capture_classify_enabled:
        return _fallback("other", 0.0, "disabled")

    stripped = (text or "").strip()
    if not stripped:
        return _fallback("other", 0.0, "empty input")

    word_count = len(stripped.split())
    if word_count < s.capture_classify_min_words:
        # Too short to classify meaningfully ("remind me at 3pm").
        return _fallback("note", 0.5, f"short input ({word_count} words)")

    prompt = (
        f"Source: {source_type}\n"
        f"Capture:\n\"\"\"\n{stripped[:4000]}\n\"\"\"\n\n"
        "Classify it."
    )

    try:
        raw = await call_llm_json(
            prompt=prompt,
            system=_SYSTEM,
            temperature=0.1,
            max_tokens=s.capture_classify_max_tokens,
            locale=locale,
        )
    except Exception as e:
        return _fallback("other", 0.0, f"llm error: {e}")

    kind = str(raw.get("kind", "")).strip().lower()
    if kind not in ALL_KINDS:
        kind = "other"

    try:
        confidence = float(raw.get("confidence", 0.0))
    except (TypeError, ValueError):
        confidence = 0.0
    confidence = max(0.0, min(1.0, confidence))

    reasoning = str(raw.get("reasoning", "")).strip()[:300]

    return {"kind": kind, "confidence": confidence, "reasoning": reasoning}
