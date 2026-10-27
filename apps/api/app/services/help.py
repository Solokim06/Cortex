"""
Help & Feedback — AI help assistant.

Loads the product knowledge base (help_docs.json) at import time, embeds
every article once, and caches the embeddings in memory. At query time,
embeds the user's question, does cosine similarity against the cached
embeddings, and feeds the top-k articles to the LLM along with a
help-specific system prompt.

The LLM returns structured JSON:

    {
      "answer": "…",
      "cited_doc_ids": ["what-is-cortex", "first-capture"],
      "suggested_doc_ids": ["install-extension"],
      "escalate": false,
      "escalate_reason": null
    }

`escalate: true` tells the frontend to offer the "File a ticket" button
with the answer prefilled.

Wave 2 additions:
  - stream_help_answer(): async generator that yields SSE-friendly
    chunks (meta → tokens → citations → done)
  - log_help_feedback(): record 👍/👎 on an answer
  - recent_answer_feedback(): debug helper
"""

import json
import math
from pathlib import Path
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from app.i18n import DEFAULT_LOCALE, normalize_locale
from app.services.ai import call_llm, call_llm_json
from app.services.embeddings import embed_one


# ---------- Knowledge base ----------

_DOCS_PATH = Path(__file__).parent / "help_docs.json"
_I18N_PATH = Path(__file__).parent / "help_docs_i18n.json"

with open(_DOCS_PATH, "r", encoding="utf-8") as f:
    HELP_DOCS: list[dict] = json.load(f)

try:
    with open(_I18N_PATH, "r", encoding="utf-8") as f:
        _DOCS_I18N: dict[str, dict[str, dict]] = json.load(f)
except FileNotFoundError:
    _DOCS_I18N = {}

_DOCS_BY_ID: dict[str, dict] = {d["id"]: d for d in HELP_DOCS}

_DOC_EMBEDDINGS: dict[str, list[float]] = {}


def _localize(doc: dict, locale: str) -> dict:
    """Return a shallow copy of `doc` with title/category/body replaced by the
    locale override when one exists. English (DEFAULT_LOCALE) falls through
    to the raw doc since help_docs.json is authored in English."""
    override = _DOCS_I18N.get(locale, {}).get(doc["id"])
    if not override:
        return doc
    return {
        **doc,
        "title": override.get("title", doc["title"]),
        "category": override.get("category", doc["category"]),
        "body": override.get("body", doc["body"]),
    }


# ---------- Prompt ----------

HELP_SYSTEM = """You are Cortex's Help Assistant.

You help users understand and use Cortex — the product itself, not their
personal knowledge. You answer questions about features, workflows,
settings, troubleshooting, and the browser extension.

You have access to a curated knowledge base of Cortex help articles below.
Every article has an ID, title, category, tags, and body.

RULES:
1. Always answer. Your job is to be helpful, not to punt.
2. When the knowledge base directly covers the question, ground your
   answer in it and cite the specific articles by exact title in
   [brackets]. Example: "...from Settings → Data [Exporting or deleting your data]."
3. When the knowledge base only partially covers the question, answer
   what you can from the docs and supplement with cautious general
   product reasoning. Clearly mark inference: start those sentences
   with "I believe…" or "Typically…". NEVER invent specific Cortex
   menu names, settings, or feature names that aren't in the docs.
4. When the knowledge base doesn't cover the question at all, still give
   the user the best general guidance you can, then note that the docs
   don't cover this exact case and offer to connect them with a human.
5. Do NOT reference the user's captured knowledge, their graph, or their
   personal data. You only have access to the product documentation.
6. Be warm, clear, concise. Short paragraphs. Bold key terms.
7. Always return valid JSON. Never wrap it in markdown.

ESCALATION — set "escalate": true ONLY when:
  - the user reports a bug or broken behavior,
  - the user is asking for a refund, billing change, or account action,
  - the user explicitly asks to talk to a human.

NEVER escalate for:
  - "does Cortex support X?" feature-availability questions,
  - questions the docs don't cover,
  - how-to questions,
  - anything you can answer with general product reasoning.

If a "does Cortex support X?" feature isn't documented, say the docs
don't cover it, give your best general guidance, set "escalate": false,
and set "confidence": "low" or "medium" as appropriate.

CONFIDENCE — always include a "confidence" field:
  - "high"   — the docs directly answer the question and you cited them
  - "medium" — docs partially cover it or you supplemented with inference
  - "low"    — no relevant docs; you gave general guidance only

Response shape (exactly):
{
  "answer": "Your answer as markdown. Cite docs by [Title].",
  "cited_doc_ids": ["id-of-cited-doc", "..."],
  "suggested_doc_ids": ["id-of-related-doc", "..."],
  "escalate": false,
  "escalate_reason": null,
  "confidence": "high"
}
"""


# Streaming system prompt — plain text output, no JSON wrapper.
HELP_STREAM_SYSTEM = """You are Cortex's Help Assistant.

You help users understand and use Cortex — the product itself, not their
personal knowledge. You answer questions about features, workflows,
settings, troubleshooting, and the browser extension.

RULES:
1. Always answer. Your job is to be helpful, not to punt.
2. When the knowledge base directly covers the question, ground your
   answer in it and cite the specific articles by exact title in
   [brackets]. Example: "...from Settings → Data [Exporting or deleting your data]."
3. When the knowledge base only partially covers the question, answer
   what you can from the docs and supplement with cautious general
   product reasoning. Clearly mark inference: start those sentences
   with "I believe…" or "Typically…". NEVER invent specific Cortex
   menu names, settings, or feature names that aren't in the docs.
4. When the knowledge base doesn't cover the question at all, still give
   the user the best general guidance you can, then note that the docs
   don't cover this exact case and offer to connect them with a human.
5. Do NOT reference the user's captured knowledge or personal data.
6. Be warm, clear, concise. Short paragraphs. Bold key terms.
7. Do NOT return JSON. Write prose only.

ESCALATION — end your answer with a line containing ONLY
[[ESCALATE: <short reason>]] — but ONLY when:
  - the user reports a bug or broken behavior,
  - the user is asking for a refund, billing change, or account action,
  - the user explicitly asks to talk to a human.

NEVER escalate for:
  - "does Cortex support X?" feature-availability questions,
  - questions the docs don't cover,
  - how-to questions,
  - anything you can answer with general product reasoning.

If a "does Cortex support X?" feature isn't documented, say the docs
don't cover it, give your best general guidance, and stop there — do
NOT add an escalation marker.
"""


# ---------- Embedding helpers ----------

def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


async def _ensure_doc_embeddings() -> None:
    if _DOC_EMBEDDINGS:
        return

    # NOTE: embeddings are intentionally built from the English source
    # body (help_docs.json), never the localized body. This keeps a single
    # search index that works across all locales — retrieval quality is
    # identical regardless of the user's UI language, and reindexing is
    # not needed when a new locale is added.
    for doc in HELP_DOCS:
        text = f"{doc['title']}\n{' '.join(doc.get('tags', []))}\n{doc['body']}"
        try:
            vec = await embed_one(text)
            _DOC_EMBEDDINGS[doc["id"]] = vec
        except Exception as e:
            print(f"[Cortex] Help doc embedding failed for {doc['id']}: {e}")


# Cosine score below this = retrieval is weak; prompt should lean on
# general reasoning and mark inference explicitly.
_WEAK_RETRIEVAL_THRESHOLD = 0.35


async def _retrieve_docs(
    question: str, top_k: int = 6
) -> tuple[list[dict], bool]:
    """
    Returns (docs, weak).

    `weak` is True when retrieval confidence is low — the caller should
    tell the LLM to lean on general reasoning rather than doc quotes.
    """
    await _ensure_doc_embeddings()

    if not _DOC_EMBEDDINGS:
        q_terms = set(w.lower() for w in question.split() if len(w) > 3)
        scored = []
        for doc in HELP_DOCS:
            haystack = (
                doc["title"]
                + " "
                + " ".join(doc.get("tags", []))
                + " "
                + doc["body"]
            ).lower()
            score = sum(1 for t in q_terms if t in haystack)
            scored.append((score, doc))
        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[:top_k]
        weak = not top or top[0][0] == 0
        return [d for _, d in top], weak

    try:
        q_vec = await embed_one(question)
    except Exception as e:
        print(f"[Cortex] Help question embedding failed: {e}")
        # Can't embed the question — treat as weak retrieval.
        return HELP_DOCS[:top_k], True

    scored = []
    for doc in HELP_DOCS:
        vec = _DOC_EMBEDDINGS.get(doc["id"])
        if vec:
            scored.append((_cosine(q_vec, vec), doc))
    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:top_k]
    weak = (not top) or (top[0][0] < _WEAK_RETRIEVAL_THRESHOLD)
    return [d for _, d in top], weak


# ---------- Prompt builder ----------

def _format_docs(docs: list[dict], locale: str = DEFAULT_LOCALE) -> str:
    lines = []
    for d in docs:
        d_loc = _localize(d, locale)
        lines.append(f"=== [{d_loc['id']}] {d_loc['title']} ===")
        lines.append(f"Category: {d_loc['category']}")
        if d.get("tags"):
            lines.append(f"Tags: {', '.join(d['tags'])}")
        # Body: use the localized version when available so the LLM can
        # ground its answer in the user's language. Falls back to the
        # English body automatically.
        lines.append(d_loc["body"])
        lines.append("")
    return "\n".join(lines)


def _hydrate_ids(ids: list[str], locale: str = DEFAULT_LOCALE) -> list[dict]:
    out = []
    for doc_id in ids:
        d = _DOCS_BY_ID.get(doc_id)
        if d:
            d_loc = _localize(d, locale)
            out.append({
                "id": d_loc["id"],
                "title": d_loc["title"],
                "category": d_loc["category"],
            })
    return out


# ---------- Non-streaming (original) ----------

async def ask_help(
    db: AsyncSession,
    user_id: str,
    question: str,
    context: dict | None = None,
    locale: str = DEFAULT_LOCALE,
) -> dict:
    """
    Answer a help question using the product knowledge base.
    (Unchanged from Phase 1 — still used by POST /help/ask.)
    """
    locale = normalize_locale(locale)
    context = context or {}

    docs, weak = await _retrieve_docs(question, top_k=6)
    docs_text = _format_docs(docs, locale)

    route = context.get("route") or "(unknown)"
    route_line = f"\nThe user is currently on the page: {route}\n" if route else ""

    weak_line = ""
    if weak:
        weak_line = (
            "\nNOTE: Retrieval confidence is LOW — the docs below may not "
            "directly answer the question. Give your best general guidance, "
            "mark any inference with \"I believe\u2026\" or \"Typically\u2026\", "
            "and note that the docs don't cover this exact case.\n"
        )

    prompt = f"""Knowledge base articles:
{docs_text}
{route_line}{weak_line}
The user asks:
{question}

Answer using the knowledge base above. Follow the rules exactly.
"""

    try:
        result = await call_llm_json(
            prompt=prompt,
            system=HELP_SYSTEM,
            temperature=0.2,
            max_tokens=1500,
            locale=locale,
        )
    except Exception as e:
        print(f"[Cortex] Help answer failed: {e}")
        result = {
            "answer": (
                "I'm having trouble reaching my knowledge base right now. "
                "Please try again, or file a ticket and a human will follow up."
            ),
            "cited_doc_ids": [],
            "suggested_doc_ids": [],
            "escalate": True,
            "escalate_reason": "Help engine unavailable",
            "confidence": "low",
        }

    cited = _hydrate_ids(result.get("cited_doc_ids") or [], locale)
    suggested = _hydrate_ids(result.get("suggested_doc_ids") or [], locale)

    if not cited and not suggested:
        suggested = [
            {
                "id": d["id"],
                "title": _localize(d, locale)["title"],
                "category": _localize(d, locale)["category"],
            }
            for d in docs[:3]
        ]

    confidence = (result.get("confidence") or "").lower().strip()
    if confidence not in ("high", "medium", "low"):
        # Infer from citations if the model forgot the field.
        if cited:
            confidence = "high"
        elif weak:
            confidence = "low"
        else:
            confidence = "medium"

    return {
        "answer": (result.get("answer") or "").strip(),
        "cited_docs": cited,
        "suggested_docs": suggested,
        "escalate": bool(result.get("escalate", False)),
        "escalate_reason": result.get("escalate_reason"),
        "confidence": confidence,
        "retrieval_weak": weak,
    }


# =====================================================================
# WAVE 2 — Streaming
# =====================================================================


async def stream_help_answer(
    db: AsyncSession,
    user_id: str,
    question: str,
    context: dict | None = None,
    locale: str = DEFAULT_LOCALE,
) -> AsyncIterator[dict]:
    """
    Async generator that yields dicts the router converts into SSE frames.

    Frame shapes:
      {"type": "meta",       "cited_docs": [...], "suggested_docs": [...]}
      {"type": "token",      "text": "..."}
      {"type": "escalate",   "reason": "..."}
      {"type": "done"}
      {"type": "error",      "message": "..."}

    Order:
      1. meta  — retrieved doc summaries so the UI can render citation
                 chips immediately (even before tokens arrive)
      2. token — one or more chunks of the answer
      3. escalate (optional) — if the LLM signaled [[ESCALATE: ...]]
      4. done  — always the last frame
    """
    locale = normalize_locale(locale)
    context = context or {}

    # --- Retrieve + build prompt (same as non-streaming) ---
    docs, weak = await _retrieve_docs(question, top_k=6)
    docs_text = _format_docs(docs, locale)

    route = context.get("route") or "(unknown)"
    route_line = f"\nThe user is currently on the page: {route}\n" if route else ""

    weak_line = ""
    if weak:
        weak_line = (
            "\nNOTE: Retrieval confidence is LOW — the docs below may not "
            "directly answer the question. Give your best general guidance, "
            "mark any inference with \"I believe\u2026\" or \"Typically\u2026\", "
            "and note that the docs don't cover this exact case.\n"
        )

    prompt = f"""Knowledge base articles:
{docs_text}
{route_line}{weak_line}
The user asks:
{question}

Answer using the knowledge base above. Write prose only. Follow the rules exactly.
"""

    # --- Emit meta frame immediately so UI can show context ---
    yield {
        "type": "meta",
        "cited_docs": [],  # populated after the answer if we can detect citations
        "suggested_docs": [
            {
                "id": d["id"],
                "title": _localize(d, locale)["title"],
                "category": _localize(d, locale)["category"],
            }
            for d in docs[:4]
        ],
        "retrieval_weak": weak,
    }

    # --- Stream tokens ---
    #
    # We hold back a small tail of the accumulated text so we never emit
    # a partial "[[" or "[[ESCALATE:" that would leak into the UI. When
    # the whole marker has arrived, we extract the reason and drop it.
    buffer = ""            # full text seen so far (for citation detection)
    emitted_upto = 0       # how many chars of `buffer` we've already sent
    escalate_reason: str | None = None
    MARKER_OPEN = "[[ESCALATE:"
    MARKER_CLOSE = "]]"
    SAFE_TAIL = len(MARKER_OPEN) + 8  # keep enough to catch a split opener

    try:
        async for chunk in _call_llm_stream(
            prompt=prompt,
            system=HELP_STREAM_SYSTEM,
            temperature=0.2,
            max_tokens=1500,
            locale=locale,
        ):
            buffer += chunk

            if escalate_reason is None:
                idx = buffer.find(MARKER_OPEN)
                if idx != -1:
                    # Marker start seen. Emit everything before it (if not
                    # already emitted), then wait for the closer.
                    if idx > emitted_upto:
                        yield {"type": "token", "text": buffer[emitted_upto:idx]}
                        emitted_upto = idx

                    close_idx = buffer.find(MARKER_CLOSE, idx + len(MARKER_OPEN))
                    if close_idx != -1:
                        escalate_reason = (
                            buffer[idx + len(MARKER_OPEN):close_idx].strip()
                        )
                        # Advance past the marker
                        emitted_upto = close_idx + len(MARKER_CLOSE)
                        # Trim the marker out of `buffer` so citation
                        # detection later doesn't see it.
                        buffer = buffer[:idx] + buffer[close_idx + len(MARKER_CLOSE):]
                        emitted_upto = idx  # recompute against trimmed buffer
                    # else: wait for more chunks
                    continue

                # No marker yet — emit up to a safe boundary. Keep the
                # last SAFE_TAIL chars un-emitted so a marker that straddles
                # a chunk boundary can still be caught.
                safe_end = len(buffer) - SAFE_TAIL
                if safe_end > emitted_upto:
                    # Don't cross a potential "[" opener
                    emit_end = safe_end
                    yield {"type": "token", "text": buffer[emitted_upto:emit_end]}
                    emitted_upto = emit_end
            # else: marker already closed — swallow everything after it

        # Flush any remaining safe text (no marker was ever seen)
        if escalate_reason is None and emitted_upto < len(buffer):
            yield {"type": "token", "text": buffer[emitted_upto:]}
            emitted_upto = len(buffer)

    except Exception as e:
        print(f"[Cortex] Help stream failed: {e}")
        yield {
            "type": "error",
            "message": "I couldn't complete that answer. Try again in a moment.",
        }
        yield {"type": "done"}
        return

    # --- Post-stream: detect which docs were cited in the final text ---
    cited_ids: list[str] = []
    for doc in docs:
        if f"[{doc['title']}]" in buffer:
            cited_ids.append(doc["id"])

    # Infer confidence from citations + retrieval quality.
    if cited_ids:
        confidence = "high"
    elif weak:
        confidence = "low"
    else:
        confidence = "medium"

    if cited_ids:
        yield {
            "type": "citations",
            "cited_docs": _hydrate_ids(cited_ids, locale),
            "confidence": confidence,
        }
    else:
        # Still emit confidence so the UI can show a soft banner if low.
        yield {
            "type": "citations",
            "cited_docs": [],
            "confidence": confidence,
        }

    if escalate_reason is not None:
        yield {"type": "escalate", "reason": escalate_reason}

    yield {"type": "done"}


async def _call_llm_stream(
    prompt: str,
    system: str,
    temperature: float = 0.2,
    max_tokens: int = 1500,
    locale: str = DEFAULT_LOCALE,
) -> AsyncIterator[str]:
    """
    Stream tokens from the LLM. Falls back to non-streaming if the AI
    service doesn't expose a streaming client — in which case we yield
    the full text as a single chunk.

    Tries a few common entry points on services.ai, in order:
      - stream_llm(...)                 (preferred, if it exists)
      - a raw Groq/OpenAI client on ai.client / ai.groq
      - call_llm(...)                   (non-streaming fallback)
    """
    # Import here so tests can patch
    from app.services import ai as ai_service  # type: ignore
    from app.config.settings import settings

    # --- Preferred: ai_service.stream_llm ---
    stream_fn = getattr(ai_service, "stream_llm", None)
    if callable(stream_fn):
        async for chunk in stream_fn(
            prompt=prompt,
            system=system,
            temperature=temperature,
            max_tokens=max_tokens,
            locale=locale,
        ):
            yield chunk
        return

    # --- Fallback: raw Groq client on ai_service.client / .groq ---
    client = getattr(ai_service, "client", None) or getattr(ai_service, "groq", None)
    if client is not None and hasattr(client, "chat"):
        try:
            stream = await client.chat.completions.create(
                model=settings.groq_model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
            )
            async for event in stream:
                delta = event.choices[0].delta.content or ""
                if delta:
                    yield delta
            return
        except Exception as e:
            print(f"[Cortex] Groq stream failed, falling back to non-streaming: {e}")

    # --- Last resort: non-streaming, yield as one chunk ---
    text = await call_llm(
        prompt=prompt,
        system=system,
        temperature=temperature,
        max_tokens=max_tokens,
        locale=locale,
    )
    # Chunk it so the frontend still sees the streaming animation
    for i in range(0, len(text), 40):
        yield text[i : i + 40]


# =====================================================================
# WAVE 2 — Answer feedback
# =====================================================================

_FEEDBACK_LOG: list[dict] = []  # ring buffer, debug only


async def log_help_feedback(
    db: AsyncSession,
    user_id: str,
    question: str,
    answer: str,
    rating: str,          # "up" | "down"
    reason: str | None = None,
    cited_doc_ids: list[str] | None = None,
) -> dict:
    """
    Record 👍/👎 feedback on an answer.

    Currently in-memory + print. When you want persistence, add a
    `help_answer_feedback` table and swap the body here — the router
    doesn't need to change.
    """
    from datetime import datetime, timezone

    entry = {
        "user_id": user_id,
        "question": question[:500],
        "answer_preview": answer[:300],
        "rating": rating,
        "reason": (reason or "")[:500] or None,
        "cited_doc_ids": cited_doc_ids or [],
        "at": datetime.now(timezone.utc).isoformat(),
    }
    print(
        f"[help-feedback] {rating} · {user_id[:8]} · "
        f"q={question[:60]!r} · reason={entry['reason']!r}"
    )
    _FEEDBACK_LOG.append(entry)
    if len(_FEEDBACK_LOG) > 500:
        _FEEDBACK_LOG.pop(0)

    return {"ok": True}


def recent_answer_feedback(limit: int = 50) -> list[dict]:
    """Debug helper — most recent feedback entries."""
    return list(reversed(_FEEDBACK_LOG))[:limit]


# =====================================================================
# Catalog helpers (unchanged)
# =====================================================================


def list_categories(locale: str = DEFAULT_LOCALE) -> list[dict]:
    # Group by the *English* category (stable slug), then emit the
    # localized display name. Frontend keys icons/tones on `slug`.
    grouped: dict[str, dict] = {}
    for d in HELP_DOCS:
        slug = d["category"]
        loc_cat = _localize(d, locale)["category"]
        entry = grouped.setdefault(slug, {"slug": slug, "category": loc_cat, "count": 0})
        entry["count"] += 1
    return sorted(grouped.values(), key=lambda e: e["category"])


def list_docs_by_category(category: str, locale: str = DEFAULT_LOCALE) -> list[dict]:
    # `category` may be either the stable English slug or the localized
    # display name (frontend uses the slug it got from /topics).
    out = []
    for d in HELP_DOCS:
        d_loc = _localize(d, locale)
        if d["category"] == category or d_loc["category"] == category:
            out.append({
                "id": d_loc["id"],
                "title": d_loc["title"],
                "category": d_loc["category"],
            })
    return out


def get_doc(doc_id: str, locale: str = DEFAULT_LOCALE) -> dict | None:
    doc = _DOCS_BY_ID.get(doc_id)
    if not doc:
        return None
    return _localize(doc, locale)
