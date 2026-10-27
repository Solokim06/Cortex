"""
Tier 2 cross-conversation recall.

Every chat message is embedded and stored in message_embeddings.
recall_relevant() searches past messages AND captured nodes for
semantically similar content, returning hits to inject into the
prompt as a system message.

Never raises --- a failure to recall must not break the chat path.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.embeddings import embed_one, content_hash


DEFAULT_TOP_K = 3
DEFAULT_THRESHOLD = 0.55
DEFAULT_MAX_CONTEXT_TOKENS = 600
_CHARS_PER_TOKEN = 4


async def embed_message(
    db: AsyncSession,
    *,
    user_id: str,
    message_id: str,
    conversation_id: str,
    role: str,
    text_content: str,
) -> bool:
    """
    Embed one chat message and upsert into message_embeddings.

    Idempotent via ON CONFLICT(message_id) DO UPDATE, and skips the
    embed call entirely if content_hash matches what's stored.

    Never raises --- returns False on any failure.
    """
    if not text_content or not text_content.strip():
        return False

    try:
        chash = content_hash(text_content)
        existing = (await db.execute(
            text(
                "SELECT content_hash FROM message_embeddings "
                "WHERE message_id = :mid"
            ),
            {"mid": message_id},
        )).first()
        if existing is not None and existing[0] == chash:
            return False

        vec = await embed_one(text_content[:8000])
        vec_literal = "[" + ",".join(str(x) for x in vec) + "]"

        await db.execute(
            text(
                "INSERT INTO message_embeddings "
                "(id, message_id, conversation_id, user_id, role, "
                " model, dim, content_hash, embedding) "
                "VALUES "
                "(:id, :message_id, :conversation_id, :user_id, :role, "
                " :model, :dim, :content_hash, "
                " CAST(CAST(:embedding AS text) AS vector)) "
                "ON CONFLICT (message_id) DO UPDATE "
                "SET embedding = EXCLUDED.embedding, "
                "    content_hash = EXCLUDED.content_hash, "
                "    model = EXCLUDED.model, "
                "    dim = EXCLUDED.dim"
            ),
            {
                "id": str(uuid.uuid4()),
                "message_id": message_id,
                "conversation_id": conversation_id,
                "user_id": user_id,
                "role": role,
                "model": "gemini-embedding-001",
                "dim": len(vec),
                "content_hash": chash,
                "embedding": vec_literal,
            },
        )
        await db.commit()
        return True
    except Exception as e:  # noqa: BLE001
        print(f"[recall] embed_message failed for {message_id}: {e}")
        return False


async def _message_vector_search(
    db: AsyncSession,
    user_id: str,
    query_vec: list[float],
    *,
    exclude_conversation_id: str | None,
    limit: int,
) -> list[dict]:
    """Return top-K messages by cosine similarity, excluding a conversation."""
    vec_literal = "[" + ",".join(str(x) for x in query_vec) + "]"
    # Use a nil UUID when no exclusion is requested - clearer type
    # information for asyncpg than an IS NULL guard.
    exclude_conv = (
        exclude_conversation_id
        if exclude_conversation_id
        else "00000000-0000-0000-0000-000000000000"
    )
    sql = text(
        "SELECT me.message_id, me.conversation_id, me.role, "
        "       1 - (me.embedding <=> CAST(CAST(:qvec AS text) AS vector)) AS score, "
        "       cm.content, cm.created_at, "
        "       cc.title AS conversation_title "
        "FROM message_embeddings me "
        "JOIN chat_messages cm ON cm.id = me.message_id "
        "JOIN chat_conversations cc ON cc.id = me.conversation_id "
        "WHERE me.user_id = :user_id "
        "  AND me.conversation_id <> CAST(:exclude_conv AS uuid) "
        "ORDER BY me.embedding <=> CAST(CAST(:qvec AS text) AS vector) "
        "LIMIT :lim"
    )
    rows = (await db.execute(sql, {
        "qvec": vec_literal,
        "user_id": user_id,
        "exclude_conv": exclude_conv,
        "lim": limit,
    })).mappings().all()
    return [dict(r) for r in rows]


async def _node_vector_search(
    db: AsyncSession,
    user_id: str,
    query_vec: list[float],
    *,
    limit: int,
) -> list[dict]:
    """Return top-K nodes by cosine similarity."""
    vec_literal = "[" + ",".join(str(x) for x in query_vec) + "]"
    sql = text(
        "SELECT n.id AS node_id, n.type, n.title, n.summary, n.content, "
        "       n.created_at, "
        "       1 - (e.embedding <=> CAST(CAST(:qvec AS text) AS vector)) AS score "
        "FROM embeddings e "
        "JOIN nodes n ON n.id = e.node_id "
        "WHERE e.user_id = :user_id "
        "ORDER BY e.embedding <=> CAST(CAST(:qvec AS text) AS vector) "
        "LIMIT :lim"
    )
    rows = (await db.execute(sql, {
        "qvec": vec_literal,
        "user_id": user_id,
        "lim": limit,
    })).mappings().all()
    return [dict(r) for r in rows]


async def recall_relevant(
    db: AsyncSession,
    user_id: str,
    query: str,
    *,
    top_k: int = DEFAULT_TOP_K,
    threshold: float = DEFAULT_THRESHOLD,
    exclude_conversation_id: str | None = None,
) -> list[dict]:
    """
    Return top_k most relevant past hits for the query.

    Message hits are returned as user<->assistant pairs. Node hits are
    returned as-is. Sorted by similarity, capped at top_k.

    Never raises --- returns [] on any failure.
    """
    if not query or not query.strip():
        return []

    try:
        query_vec = await embed_one(query[:8000])
    except Exception as e:  # noqa: BLE001
        print(f"[recall] query embed failed: {e}")
        return []

    fetch_k = max(top_k * 2, 6)

    try:
        msg_hits = await _message_vector_search(
            db, user_id, query_vec,
            exclude_conversation_id=exclude_conversation_id,
            limit=fetch_k,
        )
    except Exception as e:  # noqa: BLE001
        print(f"[recall] message search failed: {e}")
        msg_hits = []

    try:
        node_hits = await _node_vector_search(db, user_id, query_vec, limit=fetch_k)
    except Exception as e:  # noqa: BLE001
        print(f"[recall] node search failed: {e}")
        node_hits = []

    msg_hits = [h for h in msg_hits if (h.get("score") or 0.0) >= threshold]
    node_hits = [h for h in node_hits if (h.get("score") or 0.0) >= threshold]

    pairs = _collapse_to_pairs(msg_hits, exclude_conversation_id)

    merged: list[dict] = []
    for p in pairs:
        merged.append(p)
    for n in node_hits:
        merged.append({
            "kind": "node",
            "similarity": float(n.get("score") or 0.0),
            "node_title": n.get("title") or "",
            "node_content": (n.get("content") or n.get("summary") or "")[:400],
            "created_at": n.get("created_at"),
        })

    merged.sort(key=lambda h: h.get("similarity") or 0.0, reverse=True)
    return merged[:top_k]


def _collapse_to_pairs(
    msg_hits: list[dict],
    exclude_conversation_id: str | None,
) -> list[dict]:
    """Turn raw message hits into user<->assistant pairs."""
    by_conv: dict[str, list[dict]] = {}
    for h in msg_hits:
        cid = str(h.get("conversation_id"))
        by_conv.setdefault(cid, []).append(h)

    pairs: list[dict] = []
    for cid, hits in by_conv.items():
        hits_sorted = sorted(
            hits, key=lambda h: h.get("created_at") or datetime.min
        )
        for i, h in enumerate(hits_sorted):
            role = h.get("role")
            user_text = None
            assistant_text = None
            if role == "user":
                user_text = (h.get("content") or "")[:400]
            elif role == "assistant":
                assistant_text = (h.get("content") or "")[:400]

            for j, other in enumerate(hits_sorted):
                if i == j:
                    continue
                other_role = other.get("role")
                if user_text is None and other_role == "user":
                    user_text = (other.get("content") or "")[:400]
                if assistant_text is None and other_role == "assistant":
                    assistant_text = (other.get("content") or "")[:400]
                if user_text and assistant_text:
                    break

            if not (user_text or assistant_text):
                continue

            pairs.append({
                "kind": "message",
                "similarity": float(h.get("score") or 0.0),
                "conversation_title": h.get("conversation_title") or "",
                "conversation_id": cid,
                "user_text": user_text,
                "assistant_text": assistant_text,
                "created_at": h.get("created_at"),
            })

    seen: set[tuple[str, int]] = set()
    deduped: list[dict] = []
    for p in sorted(pairs, key=lambda x: x["similarity"], reverse=True):
        bucket = int(p["similarity"] * 100)
        key = (p["conversation_id"], bucket)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(p)
    return deduped


def format_recall_block(
    hits: list[dict],
    max_tokens: int = DEFAULT_MAX_CONTEXT_TOKENS,
) -> str:
    """Render hits into a compact text block for the system prompt."""
    if not hits:
        return ""

    max_chars = max_tokens * _CHARS_PER_TOKEN
    lines: list[str] = [
        "Relevant context from earlier conversations and captured notes "
        "(use only if it helps answer the current question):"
    ]
    used = len(lines[0])

    for h in hits:
        if h.get("kind") == "message":
            date = _fmt_date(h.get("created_at"))
            title = (h.get("conversation_title") or "earlier chat")[:60]
            block = f'- [{date} | "{title}"]'
            u = (h.get("user_text") or "").strip().replace("\n", " ")
            a = (h.get("assistant_text") or "").strip().replace("\n", " ")
            if u:
                block += f"\n    User: {u}"
            if a:
                block += f"\n    Cortex: {a}"
        elif h.get("kind") == "node":
            date = _fmt_date(h.get("created_at"))
            title = (h.get("node_title") or "capture")[:80]
            content = (h.get("node_content") or "").strip().replace("\n", " ")[:300]
            block = f'- [{date}] Capture "{title}": {content}'
        else:
            continue

        if used + len(block) > max_chars:
            break
        lines.append(block)
        used += len(block)

    if len(lines) == 1:
        return ""

    lines.append(
        "If you draw on a recalled conversation, you may briefly note "
        '"you mentioned this before" - otherwise do not reference '
        "this block directly."
    )
    return "\n".join(lines)


def _fmt_date(dt) -> str:
    """Format a datetime as YYYY-MM-DD, or (unknown) if None."""
    if dt is None:
        return "(unknown)"
    try:
        return dt.strftime("%Y-%m-%d")
    except Exception:  # noqa: BLE001
        return "(unknown)"
