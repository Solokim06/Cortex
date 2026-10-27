"""
Cross-capture synthesis — "topic pages".

Given a concept node, gather the captures/thoughts that relate to it,
feed them to the LLM, and produce a structured synthesis with citations.

Retrieval: embeddings (vector nearest-neighbours). The graph currently
stores only :contains edges and has no read path — embeddings give us
"what's near this concept" with a single query.

Caching: one row per (user_id, concept_id). Regenerated when the source
set changes (content_hash mismatch) or when force=True.
"""

import hashlib
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Node, TopicSynthesis
from app.i18n import DEFAULT_LOCALE, normalize_locale
from app.services.ai import call_llm_json


import time as _cache_time

# In-process response cache. Keyed by (user_id, concept_id, locale, hash).
# Short TTL because the underlying data changes when captures are added;
# hash mismatch already forces a regen, so a small TTL is safe.
_RESPONSE_CACHE: dict[tuple, tuple[float, dict]] = {}
_RESPONSE_CACHE_TTL_SECONDS = 300


def _cache_get(key: tuple) -> dict | None:
    entry = _RESPONSE_CACHE.get(key)
    if entry is None:
        return None
    ts, payload = entry
    if _cache_time.monotonic() - ts > _RESPONSE_CACHE_TTL_SECONDS:
        _RESPONSE_CACHE.pop(key, None)
        return None
    return payload


def _cache_put(key: tuple, payload: dict) -> None:
    _RESPONSE_CACHE[key] = (_cache_time.monotonic(), payload)
    # Crude size cap — drop oldest when we exceed 1000 entries.
    if len(_RESPONSE_CACHE) > 1000:
        oldest = min(_RESPONSE_CACHE.items(), key=lambda kv: kv[1][0])
        _RESPONSE_CACHE.pop(oldest[0], None)


MAX_SOURCE_NODES = 15
MAX_CHARS_PER_SOURCE = 600


SYNTHESIS_SYSTEM = """You are Cortex, a synthesis engine for a personal knowledge graph.

Your job: read a concept and the captures that reference it, then write a
structured synthesis that helps the user see patterns they might have missed.

You are not a chatbot. You are not conversational. You produce a structured
report, always in JSON.

Rules:
1. Cite specific captures by their index number in [brackets] — e.g. [0], [2].
2. Quote the user's own words sparingly — when a phrase captures a pattern.
3. Do not invent facts. If the captures don't say something, do not say it.
4. Write in the user's language (a locale directive is prepended).
5. Be concise. No filler, no "in conclusion", no restating the question.
6. If the captures are sparse (fewer than 3), keep the synthesis short and
   say less — never pad.
"""


SYNTHESIS_USER_TEMPLATE = """Concept: "{concept_title}"
Definition: "{concept_definition}"

Related captures (indexed, most-relevant first):
{sources}

Return JSON in exactly this shape:
{{
  "headline": "one sentence (max 120 chars) capturing the essence of this concept",
  "what_youve_said": "1-3 short paragraphs synthesizing what the user has written, citing [indices]",
  "patterns": [
    {{ "label": "short pattern name", "detail": "one sentence explaining it, with [citations]" }}
  ],
  "tensions": [
    {{ "label": "short tension name", "detail": "one sentence describing the tension, with [citations]" }}
  ],
  "open_questions": [
    "a question the captures leave unanswered"
  ],
  "related_concepts": [
    "2-5 other concept names that would deepen this view"
  ]
}}
"""


def _hash_inputs(node_ids: list[str], concept_id: str) -> str:
    h = hashlib.sha256()
    h.update(concept_id.encode("utf-8"))
    for nid in sorted(node_ids):
        h.update(b"|")
        h.update(nid.encode("utf-8"))
    return h.hexdigest()


def _format_sources(rows: list[dict]) -> str:
    lines = []
    for i, r in enumerate(rows):
        title = (r.get("title") or "").strip() or "(untitled)"
        summary = (r.get("summary") or "").strip()
        content = (r.get("content") or "").strip()
        body = summary or content
        if len(body) > MAX_CHARS_PER_SOURCE:
            body = body[:MAX_CHARS_PER_SOURCE].rstrip() + "\u2026"

        created = r.get("created_at")
        if isinstance(created, datetime):
            date_str = created.strftime("%Y-%m-%d")
        else:
            date_str = str(created or "")[:10]

        node_type = r.get("type") or "thought"
        lines.append(f'[{i}] (created {date_str}, type={node_type}) "{title}"')
        if body:
            lines.append(body)
        lines.append("")
    return "\n".join(lines).strip()


async def _load_concept(db: AsyncSession, user_id: str, concept_id: str) -> dict | None:
    result = await db.execute(
        select(Node).where(Node.id == concept_id, Node.user_id == user_id)
    )
    node = result.scalar_one_or_none()
    if not node:
        return None
    return {
        "id": node.id,
        "type": node.type,
        "title": node.title or "",
        "summary": getattr(node, "summary", None) or "",
        "content": node.content or "",
    }


async def _load_sources(db: AsyncSession, user_id: str, concept_id: str) -> list[dict]:
    sql = text("""
        SELECT
            n.id, n.type, n.title, n.content, n.summary, n.created_at,
            1 - (e.embedding <=> (SELECT embedding FROM embeddings WHERE node_id = :concept_id)) AS score
        FROM embeddings e
        JOIN nodes n ON n.id = e.node_id
        WHERE e.user_id = :user_id
          AND n.id != :concept_id
        ORDER BY e.embedding <=> (SELECT embedding FROM embeddings WHERE node_id = :concept_id)
        LIMIT :limit
    """)

    rows = (await db.execute(sql, {
        "concept_id": concept_id,
        "user_id": user_id,
        "limit": MAX_SOURCE_NODES,
    })).mappings().all()

    return [
        {
            "id": str(r["id"]),
            "type": r["type"],
            "title": r["title"],
            "content": r["content"] or "",
            "summary": r["summary"] or "",
            "created_at": r["created_at"],
            "score": float(r["score"]) if r["score"] is not None else 0.0,
        }
        for r in rows
    ]


async def get_or_generate(
    db: AsyncSession,
    user_id: str,
    concept_id: str,
    locale: str = DEFAULT_LOCALE,
    force: bool = False,
) -> dict | None:
    """
    Cache-aware, single-round-trip fetch.

    Order:
      1. In-process cache — if we just served this (same user/concept/
         locale/hash), return in ~0ms.
      2. If not cached, load the concept + sources + existing synthesis
         in the minimum number of queries.
      3. If nothing changed, return the existing synthesis.
      4. Otherwise, call the LLM and persist.
    """
    locale = normalize_locale(locale)

    # Step 1 — fast path. We cache by (user_id, concept_id, locale) but
    # we don't know the source hash yet, so we use a placeholder key that
    # gets invalidated when new captures land. Because we also re-check
    # the source hash on miss, staleness is bounded.
    fast_key = (user_id, concept_id, locale, "fast")
    if not force:
        cached = _cache_get(fast_key)
        if cached is not None:
            return cached

    # Step 2 — single concept fetch (also validates ownership).
    concept = await _load_concept(db, user_id, concept_id)
    if not concept:
        return None

    # Step 3 — sources (one vector query).
    sources = await _load_sources(db, user_id, concept_id)
    source_ids = [s["id"] for s in sources]
    new_hash = _hash_inputs(source_ids, concept_id)

    # Step 4 — existing synthesis row.
    result = await db.execute(
        select(TopicSynthesis).where(
            TopicSynthesis.user_id == user_id,
            TopicSynthesis.concept_id == concept_id,
        )
    )
    existing = result.scalar_one_or_none()

    needs_regen = (
        force
        or existing is None
        or existing.content_hash != new_hash
        or existing.locale != locale
    )

    if not needs_regen and existing is not None:
        payload = _serialize(existing, concept, stale=False)
        _cache_put(fast_key, payload)
        return payload

    payload = await _synthesize(concept, sources, locale)

    if existing is None:
        row = TopicSynthesis(
            id=str(uuid.uuid4()),
            user_id=user_id,
            concept_id=concept_id,
        )
        db.add(row)
    else:
        row = existing

    row.source_node_ids = source_ids
    row.content_hash = new_hash
    row.headline = (payload.get("headline") or "").strip()[:300]
    row.payload = payload
    row.model = "groq"
    row.locale = locale
    row.generated_at = datetime.now(timezone.utc)
    row.stale = False

    await db.commit()
    await db.refresh(row)

    serialized = _serialize(row, concept, stale=False)
    _cache_put(fast_key, serialized)
    return serialized


async def _synthesize(concept: dict, sources: list[dict], locale: str) -> dict:
    if not sources:
        return {
            "headline": "",
            "what_youve_said": "",
            "patterns": [],
            "tensions": [],
            "open_questions": [],
            "related_concepts": [],
        }

    sources_text = _format_sources(sources)
    prompt = SYNTHESIS_USER_TEMPLATE.format(
        concept_title=concept["title"] or "(unnamed concept)",
        concept_definition=concept["summary"] or concept["content"][:200] or "",
        sources=sources_text,
    )

    try:
        payload = await call_llm_json(
            prompt=prompt,
            system=SYNTHESIS_SYSTEM,
            temperature=0.3,
            max_tokens=2500,
            locale=locale,
        )
    except Exception as e:
        print(f"[topic_synthesis] LLM call failed for concept {concept['id']}: {e}")
        payload = {}

    return {
        "headline": str(payload.get("headline") or "")[:300],
        "what_youve_said": str(payload.get("what_youve_said") or ""),
        "patterns": _coerce_list(payload.get("patterns")),
        "tensions": _coerce_list(payload.get("tensions")),
        "open_questions": _coerce_string_list(payload.get("open_questions")),
        "related_concepts": _coerce_string_list(payload.get("related_concepts")),
    }


def _coerce_list(raw) -> list[dict]:
    out: list[dict] = []
    if not isinstance(raw, list):
        return out
    for item in raw:
        if isinstance(item, dict):
            label = str(item.get("label") or "").strip()
            detail = str(item.get("detail") or "").strip()
            if label or detail:
                out.append({"label": label, "detail": detail})
    return out[:8]


def _coerce_string_list(raw) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [str(x).strip() for x in raw if str(x).strip()][:8]


def _serialize(row: TopicSynthesis, concept: dict, stale: bool) -> dict:
    return {
        "concept_id": row.concept_id,
        "concept_title": concept["title"],
        "concept_summary": concept["summary"],
        "headline": row.headline,
        "what_youve_said": row.payload.get("what_youve_said", ""),
        "patterns": row.payload.get("patterns", []),
        "tensions": row.payload.get("tensions", []),
        "open_questions": row.payload.get("open_questions", []),
        "related_concepts": row.payload.get("related_concepts", []),
        "source_node_ids": row.source_node_ids or [],
        "locale": row.locale,
        "generated_at": row.generated_at.isoformat() if row.generated_at else None,
        "stale": stale,
    }


async def list_concepts(
    db: AsyncSession,
    user_id: str,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    sql = text("""
        SELECT
            n.id, n.title, n.summary,
            ts.headline, ts.generated_at, ts.stale
        FROM nodes n
        LEFT JOIN topic_syntheses ts
          ON ts.user_id = n.user_id AND ts.concept_id = n.id
        WHERE n.user_id = :user_id AND n.type = 'concept'
        ORDER BY n.created_at DESC
        LIMIT :limit OFFSET :offset
    """)

    rows = (await db.execute(sql, {
        "user_id": user_id,
        "limit": limit,
        "offset": offset,
    })).mappings().all()

    return [
        {
            "id": str(r["id"]),
            "title": r["title"] or "",
            "summary": r["summary"] or "",
            "has_synthesis": r["headline"] is not None,
            "headline": r["headline"],
            "generated_at": r["generated_at"].isoformat() if r["generated_at"] else None,
            "stale": bool(r["stale"]) if r["stale"] is not None else False,
        }
        for r in rows
    ]
