"""
Concept canonicalization --- collapse duplicate concept nodes.

The problem
-----------
Every capture creates fresh concept nodes. "Long-term memory" from
Monday and "long-term memory" from Friday are two different UUIDs
with the same meaning. The graph accumulates synonyms instead of
building concepts.

What this module does
---------------------
Given a new concept node, decide whether it's the same as an existing
canonical concept. If yes, mark it as an alias (set
`canonical_concept_id` on the new node, write a ConceptAlias row).
If no, leave it as its own canonical concept.

Matching strategy --- three tiers
--------------------------------
  Tier 1  normalized-name match     (fast, deterministic, zero cost)
  Tier 2  embedding similarity      (cosine >= 0.90 + shared token)
  Tier 3  definition similarity     (cosine >= 0.92 + name containment)

If none match, the node stays canonical. Everything is recorded in
concept_aliases so the merge is reversible.

Alias resolution
----------------
`resolve_canonical_id(node)` walks up the alias chain --- if A is an
alias of B and B is an alias of C, this returns C. Used by the graph
walker so multi-hop reasoning transparently lands on canonical nodes.
"""

from __future__ import annotations

import re
import uuid

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ConceptAlias, Node


# ---- tuning ----
EMBEDDING_MERGE_THRESHOLD = 0.90
DEFINITION_MERGE_THRESHOLD = 0.92
MIN_SHARED_TOKENS = 1  # reject merges where the names have no content words in common


# ---- stop words for token comparison --- never treat these as "shared meaning"
_STOPWORDS = {
    "a", "an", "the", "of", "for", "to", "in", "on", "at", "by", "with",
    "and", "or", "is", "are", "was", "were", "be", "been",
}


def normalize_name(name: str) -> str:
    """Lowercase, strip, collapse whitespace, strip leading articles + trailing punctuation."""
    s = (name or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"^(a|an|the)\s+", "", s)
    s = s.rstrip(".,;:!?")
    return s


def content_tokens(name: str) -> set[str]:
    """Significant words --- used to prevent silly merges on embeddings alone."""
    words = re.findall(r"[a-z0-9]+", (name or "").lower())
    return {w for w in words if w not in _STOPWORDS and len(w) > 2}


def _is_plausible_name_merge(a: str, b: str) -> bool:
    """Require at least one shared content word before we merge on similarity alone."""
    ta = content_tokens(a)
    tb = content_tokens(b)
    if not ta or not tb:
        return False
    return len(ta & tb) >= MIN_SHARED_TOKENS


# =====================================================================
# alias chain resolution
# =====================================================================


async def resolve_canonical_id(
    db: AsyncSession,
    node_id: str,
    max_depth: int = 5,
) -> str:
    """
    Follow `canonical_concept_id` up to its root. Returns the node's own
    id if it's already canonical (or a non-concept node). Never cycles
    more than `max_depth` times.
    """
    current = node_id
    for _ in range(max_depth):
        row = (await db.execute(
            select(Node.canonical_concept_id).where(Node.id == current)
        )).scalar_one_or_none()
        if row is None:
            return current
        current = str(row)
    # pathological cycle --- return last seen
    return current


# =====================================================================
# candidate lookup
# =====================================================================


async def _find_by_normalized_name(
    db: AsyncSession,
    user_id: str,
    normalized: str,
) -> Node | None:
    """Tier 1 --- deterministic. Match on the normalized title."""
    sql = text("""
        SELECT id, title, content
        FROM nodes
        WHERE user_id = :uid
          AND type = 'concept'
          AND canonical_concept_id IS NULL
          AND lower(trim(title)) = :norm
        LIMIT 1
    """)
    row = (await db.execute(sql, {
        "uid": user_id,
        "norm": normalized,
    })).mappings().first()
    if row is None:
        return None
    return await db.get(Node, str(row["id"]))


async def _find_by_embedding(
    db: AsyncSession,
    user_id: str,
    node_id: str,
    threshold: float,
) -> tuple[Node, float] | None:
    """
    Tier 2 --- cosine similarity between the new node's embedding and every
    existing canonical concept's embedding. Returns the best match if it
    clears the threshold.
    """
    sql = text("""
        SELECT n.id, n.title, n.content,
               1 - (e2.embedding <=> e1.embedding) AS score
        FROM embeddings e1
        JOIN embeddings e2 ON e2.user_id = e1.user_id
        JOIN nodes n ON n.id = e2.node_id
        WHERE e1.node_id = :nid
          AND e2.node_id != :nid
          AND n.user_id = :uid
          AND n.type = 'concept'
          AND n.canonical_concept_id IS NULL
        ORDER BY e2.embedding <=> e1.embedding
        LIMIT 1
    """)
    row = (await db.execute(sql, {
        "nid": node_id,
        "uid": user_id,
    })).mappings().first()
    if row is None or row["score"] is None:
        return None

    score = float(row["score"])
    if score < threshold:
        return None

    node = await db.get(Node, str(row["id"]))
    return (node, score) if node is not None else None


# =====================================================================
# the main entry point
# =====================================================================


async def canonicalize_new_concept(
    db: AsyncSession,
    user_id: str,
    concept_id: str,
) -> dict:
    """
    Decide whether `concept_id` should alias into an existing canonical
    concept. Returns a result dict:

      { "action": "created_canonical" }
      { "action": "aliased", "canonical_id": ..., "strategy": ..., "score": ... }

    Never raises --- canonicalization is best-effort; if it fails, the
    new concept just stays canonical.
    """
    # Load the new node
    new_node = await db.get(Node, concept_id)
    if new_node is None or new_node.type != "concept":
        return {"action": "skipped", "reason": "not_a_concept"}

    # If it somehow already has a canonical_id, nothing to do
    if new_node.canonical_concept_id:
        return {"action": "already_aliased", "canonical_id": str(new_node.canonical_concept_id)}

    title = new_node.title or ""
    definition = new_node.content or ""
    norm = normalize_name(title)

    # ---- Tier 1 --- normalized name match ----
    if norm:
        match = await _find_by_normalized_name(db, user_id, norm)
        if match is not None and str(match.id) != concept_id:
            await _record_alias(
                db,
                user_id=user_id,
                alias_id=concept_id,
                canonical_id=str(match.id),
                strategy="name_normalized",
                similarity=1.0,
                note=f"normalized name match: '{norm}'",
            )
            return {
                "action": "aliased",
                "canonical_id": str(match.id),
                "strategy": "name_normalized",
                "score": 1.0,
            }

    # ---- Tier 2 --- embedding similarity (auto-apply + notify) ----
    emb_match = await _find_by_embedding(db, user_id, concept_id, EMBEDDING_MERGE_THRESHOLD)
    if emb_match is not None:
        candidate, score = emb_match
        # Safety gate: require at least one shared content token
        if _is_plausible_name_merge(title, candidate.title or ""):
            alias_row_id = await _record_alias(
                db,
                user_id=user_id,
                alias_id=concept_id,
                canonical_id=str(candidate.id),
                strategy="embedding",
                similarity=score,
                note=f"embedding match: {title!r} ??? {candidate.title!r}",
                status="accepted",
            )
            # Fire a "we merged these" notification with an undo link.
            await _notify_auto_merge(
                db,
                user_id=user_id,
                alias_id=concept_id,
                canonical_id=str(candidate.id),
                alias_title=title,
                canonical_title=candidate.title or "",
                similarity=score,
                alias_row_id=alias_row_id,
            )
            return {
                "action": "aliased",
                "canonical_id": str(candidate.id),
                "strategy": "embedding",
                "score": score,
            }

    # ---- Tier 3 --- definition similarity with name containment ----
    # Tier 3 matches are lower confidence -- queue as PENDING instead of
    # auto-applying. The two concepts stay separate until the user
    # approves from the Graph Health page.
    defs = await _definition_similarity(db, user_id, concept_id, DEFINITION_MERGE_THRESHOLD)
    if defs is not None:
        candidate, score = defs
        a_tokens = content_tokens(title)
        b_tokens = content_tokens(candidate.title or "")
        # Require the token sets to be subset/superset of each other
        if a_tokens and b_tokens and (a_tokens <= b_tokens or b_tokens <= a_tokens):
            await _record_alias(
                db,
                user_id=user_id,
                alias_id=concept_id,
                canonical_id=str(candidate.id),
                strategy="definition",
                similarity=score,
                note=f"definition match: {title!r} ??? {candidate.title!r}",
                status="pending",
            )
            return {
                "action": "queued_pending",
                "canonical_id": str(candidate.id),
                "strategy": "definition",
                "score": score,
            }

    # ---- No merge --- this concept is canonical ----
    return {"action": "created_canonical"}


async def _definition_similarity(
    db: AsyncSession,
    user_id: str,
    node_id: str,
    threshold: float,
) -> tuple[Node, float] | None:
    """
    Same as _find_by_embedding but queries on the *definition* embedding
    (the `content` field is what gets embedded for concepts).

    Actually --- since upsert_embedding embeds title+summary+content, this
    is the same query as _find_by_embedding. Kept as a distinct helper
    for a future where we embed definitions separately.
    """
    return await _find_by_embedding(db, user_id, node_id, threshold)


async def _record_alias(
    db: AsyncSession,
    *,
    user_id: str,
    alias_id: str,
    canonical_id: str,
    strategy: str,
    similarity: float,
    note: str,
    status: str = "accepted",
) -> str:
    """
    Write a ConceptAlias row.

    - status="accepted" (default): also set canonical_concept_id on the
      alias node so the graph walker resolves it. Classic auto-merge.
    - status="pending": do NOT set canonical_concept_id. The alias row
      is a proposal awaiting user approval.

    Returns the ConceptAlias.id so callers can reference it.
    """
    alias_node = await db.get(Node, alias_id)
    if alias_node is None:
        return ""

    if status == "accepted":
        alias_node.canonical_concept_id = canonical_id

    alias_row_id = str(uuid.uuid4())
    db.add(ConceptAlias(
        id=alias_row_id,
        user_id=user_id,
        alias_node_id=alias_id,
        canonical_node_id=canonical_id,
        match_strategy=strategy,
        similarity=float(similarity),
        note=note[:255],
        status=status,
    ))
    await db.commit()
    print(
        f"[canonical] {alias_id[:8]} -> {canonical_id[:8]} "
        f"({strategy}, {similarity:.2f}, {status})"
    )
    return alias_row_id


# =====================================================================
# backfill --- merge every existing duplicate concept
# =====================================================================


async def backfill_canonicalization(
    db: AsyncSession,
    user_id: str,
) -> dict:
    """
    Walk every concept for a user, in creation order, and canonicalize
    each one against the ones that came before it. Idempotent --- re-running
    only processes nodes that don't yet have a canonical decision.

    Returns:
      { "aliased": N, "left_canonical": M, "already_done": K }
    """
    rows = (await db.execute(text("""
        SELECT id FROM nodes
        WHERE user_id = :uid
          AND type = 'concept'
          AND canonical_concept_id IS NULL
        ORDER BY created_at ASC
    """), {"uid": user_id})).mappings().all()

    aliased = 0
    left_canonical = 0
    already_done = 0

    for row in rows:
        cid = str(row["id"])
        # Check if we've already written an alias row for this node
        existing = (await db.execute(
            select(ConceptAlias.id).where(ConceptAlias.alias_node_id == cid)
        )).scalar_one_or_none()
        if existing is not None:
            already_done += 1
            continue

        result = await canonicalize_new_concept(db, user_id, cid)
        if result.get("action") == "aliased":
            aliased += 1
        elif result.get("action") == "created_canonical":
            left_canonical += 1

    return {
        "aliased": aliased,
        "left_canonical": left_canonical,
        "already_done": already_done,
    }


# =====================================================================
# Tier 8 -- auto-merge notification + user actions
# =====================================================================


async def _notify_auto_merge(
    db: AsyncSession,
    *,
    user_id: str,
    alias_id: str,
    canonical_id: str,
    alias_title: str,
    canonical_title: str,
    similarity: float,
    alias_row_id: str,
) -> None:
    """
    Fire a user notification: "We merged X into Y". Best-effort; a
    failure must never break the capture path.
    """
    try:
        from app.services import notifications as notifications_service

        await notifications_service.push_user_notification(
            user_id,
            event_kind="graph.auto_merge",
            title="Two concepts merged",
            body=(
                f'"{alias_title}" looked like the same idea as '
                f'"{canonical_title}" ({similarity:.0%} match), so they '
                f'are now linked. You can undo this from Graph Health.'
            ),
            click_url="/memory/health?tab=merges",
            extra={
                "alias_node_id": alias_id,
                "canonical_node_id": canonical_id,
                "alias_row_id": alias_row_id,
                "similarity": float(similarity),
            },
        )
    except Exception as e:  # noqa: BLE001
        print(f"[canonical] auto-merge notification failed: {e}")


async def undo_alias(
    db: AsyncSession,
    user_id: str,
    alias_row_id: str,
) -> bool:
    """
    Revert a merge. Clears canonical_concept_id on the alias node and
    marks the alias row 'rejected' (so we do not re-queue it).
    """
    from sqlalchemy import select as _select

    row = (await db.execute(
        _select(ConceptAlias).where(
            ConceptAlias.id == alias_row_id,
            ConceptAlias.user_id == user_id,
        )
    )).scalar_one_or_none()
    if row is None:
        return False

    alias_node = await db.get(Node, str(row.alias_node_id))
    if alias_node is not None:
        alias_node.canonical_concept_id = None

    row.status = "rejected"
    await db.commit()
    print(f"[canonical] undo {alias_row_id[:8]} (alias={row.alias_node_id})")
    return True


async def accept_pending_alias(
    db: AsyncSession,
    user_id: str,
    alias_row_id: str,
) -> bool:
    """
    Approve a pending (Tier 3) merge. Applies canonical_concept_id and
    flips status to 'accepted'.
    """
    from sqlalchemy import select as _select

    row = (await db.execute(
        _select(ConceptAlias).where(
            ConceptAlias.id == alias_row_id,
            ConceptAlias.user_id == user_id,
            ConceptAlias.status == "pending",
        )
    )).scalar_one_or_none()
    if row is None:
        return False

    alias_node = await db.get(Node, str(row.alias_node_id))
    if alias_node is None:
        return False
    alias_node.canonical_concept_id = str(row.canonical_node_id)

    row.status = "accepted"
    await db.commit()
    print(f"[canonical] accept {alias_row_id[:8]}")
    return True


async def reject_pending_alias(
    db: AsyncSession,
    user_id: str,
    alias_row_id: str,
) -> bool:
    """
    Reject a pending merge. Leaves the two concepts separate and marks
    the row 'rejected' so we do not re-queue it.
    """
    from sqlalchemy import select as _select

    row = (await db.execute(
        _select(ConceptAlias).where(
            ConceptAlias.id == alias_row_id,
            ConceptAlias.user_id == user_id,
            ConceptAlias.status == "pending",
        )
    )).scalar_one_or_none()
    if row is None:
        return False

    row.status = "rejected"
    await db.commit()
    print(f"[canonical] reject {alias_row_id[:8]}")
    return True
