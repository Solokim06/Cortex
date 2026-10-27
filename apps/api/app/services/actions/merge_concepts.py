"""
merge_concepts agent -- Phase 4.3.

Scans the user's canonical concepts for duplicate pairs and proposes
merges. Also surfaces any concept_aliases rows already queued as
'pending' (Tier 3 matches from the write path).

The heavy lifting (three-tier matching) lives in
app.services.canonicalization -- this agent reuses the matcher
functions but does not write. Writes happen in apply().
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ConceptAlias, Node
from app.services.actions.base import (
    ActionAgent,
    ApplyResult,
    Proposal,
    register_agent,
)


MAX_SCAN_CONCEPTS = 200  # safety cap on graph scan size


async def _fetch_canonical_concepts(
    db: AsyncSession, user_id: str, limit: int = MAX_SCAN_CONCEPTS
) -> list[dict]:
    """Return canonical concept nodes with their embeddings available."""
    rows = (await db.execute(text("""
        SELECT n.id, n.title, n.content
        FROM nodes n
        WHERE n.user_id = :uid
          AND n.type = 'concept'
          AND n.canonical_concept_id IS NULL
          AND EXISTS (SELECT 1 FROM embeddings emb WHERE emb.node_id = n.id)
        ORDER BY n.created_at ASC
        LIMIT :lim
    """), {"uid": user_id, "lim": limit})).mappings().all()
    return [dict(r) for r in rows]


async def _scan_for_merge(
    db: AsyncSession, user_id: str, concept_id: str
) -> dict | None:
    """
    Run the same three-tier match used by canonicalize_new_concept but
    WITHOUT writing anything. Returns a match dict, or None.

    Result shape:
      {
        "alias_id": str,
        "alias_title": str,
        "canonical_id": str,
        "canonical_title": str,
        "strategy": "name_normalized" | "embedding" | "definition",
        "similarity": float,
      }
    """
    from app.services.canonicalization import (
        EMBEDDING_MERGE_THRESHOLD,
        DEFINITION_MERGE_THRESHOLD,
        _find_by_embedding,
        _find_by_normalized_name,
        _definition_similarity,
        _is_plausible_name_merge,
        content_tokens,
        normalize_name,
    )

    node = await db.get(Node, concept_id)
    if node is None or node.type != "concept":
        return None
    if node.canonical_concept_id:
        return None  # already aliased

    title = node.title or ""
    norm = normalize_name(title)

    # ---- Tier 1: name match ----
    if norm:
        match = await _find_by_normalized_name(db, user_id, norm)
        if match is not None and str(match.id) != concept_id:
            return {
                "alias_id": concept_id,
                "alias_title": title,
                "canonical_id": str(match.id),
                "canonical_title": match.title or "(untitled)",
                "strategy": "name_normalized",
                "similarity": 1.0,
            }

    # ---- Tier 2: embedding similarity ----
    emb = await _find_by_embedding(
        db, user_id, concept_id, EMBEDDING_MERGE_THRESHOLD
    )
    if emb is not None:
        candidate, score = emb
        if _is_plausible_name_merge(title, candidate.title or ""):
            return {
                "alias_id": concept_id,
                "alias_title": title,
                "canonical_id": str(candidate.id),
                "canonical_title": candidate.title or "(untitled)",
                "strategy": "embedding",
                "similarity": float(score),
            }

    # ---- Tier 3: definition similarity + name containment ----
    defs = await _definition_similarity(
        db, user_id, concept_id, DEFINITION_MERGE_THRESHOLD
    )
    if defs is not None:
        candidate, score = defs
        a_tokens = content_tokens(title)
        b_tokens = content_tokens(candidate.title or "")
        if a_tokens and b_tokens and (a_tokens <= b_tokens or b_tokens <= a_tokens):
            return {
                "alias_id": concept_id,
                "alias_title": title,
                "canonical_id": str(candidate.id),
                "canonical_title": candidate.title or "(untitled)",
                "strategy": "definition",
                "similarity": float(score),
            }

    return None


async def _fetch_pending_aliases(
    db: AsyncSession, user_id: str, limit: int = 20
) -> list[dict]:
    """
    Return concept_aliases rows already queued as 'pending' by the
    write path. These are Tier 3 matches the write path refused to
    auto-apply.
    """
    rows = (await db.execute(text("""
        SELECT ca.id AS alias_row_id,
               ca.alias_node_id,
               ca.canonical_node_id,
               ca.match_strategy,
               ca.similarity,
               na.title AS alias_title,
               nc.title AS canonical_title
        FROM concept_aliases ca
        JOIN nodes na ON na.id = ca.alias_node_id
        JOIN nodes nc ON nc.id = ca.canonical_node_id
        WHERE ca.user_id = :uid AND ca.status = 'pending'
        ORDER BY ca.created_at DESC
        LIMIT :lim
    """), {"uid": user_id, "lim": limit})).mappings().all()
    return [dict(r) for r in rows]


class MergeConceptsAgent(ActionAgent):
    name = "merge_concepts"
    description = (
        "Scan for duplicate concepts and propose merges. Also surfaces "
        "any merges already queued as pending."
    )
    requires_llm = False  # the write path already used the LLM; we reuse matches
    auto_apply_default = False

    parameters_schema = {
        "type": "object",
        "properties": {},
    }

    async def plan(
        self,
        db: AsyncSession,
        user_id: str,
        instruction: str,
        context: dict[str, Any] | None = None,
    ) -> Proposal | None:
        # 1. Existing pending aliases (from the write path)
        pending = await _fetch_pending_aliases(db, user_id)

        # 2. Scan for missed merges
        concepts = await _fetch_canonical_concepts(db, user_id)
        scanned: list[dict] = []
        seen_pairs: set[tuple[str, str]] = set()

        for c in concepts:
            match = await _scan_for_merge(db, user_id, str(c["id"]))
            if match is None:
                continue
            # Dedupe by unordered pair
            a, b = sorted([match["alias_id"], match["canonical_id"]])
            key = (a, b)
            if key in seen_pairs:
                continue
            seen_pairs.add(key)
            scanned.append(match)

        # 3. Merge pending + scanned, deduping by alias_id
        changes: list[dict[str, Any]] = []
        details: list[dict[str, Any]] = []
        claimed_aliases: set[str] = set()

        # Pending first -- user already saw them queued
        for p in pending:
            alias_id = str(p["alias_node_id"])
            if alias_id in claimed_aliases:
                continue
            claimed_aliases.add(alias_id)
            idx = len(changes)
            changes.append({
                "op": "merge_nodes",
                "alias_id": alias_id,
                "alias_title": p["alias_title"] or "(untitled)",
                "canonical_id": str(p["canonical_node_id"]),
                "canonical_title": p["canonical_title"] or "(untitled)",
                "strategy": p["match_strategy"],
                "similarity": float(p["similarity"] or 0.0),
                "alias_row_id": str(p["alias_row_id"]),
            })
            details.append({
                "change_index": idx,
                "note": (
                    f'Queued as pending: "{p["alias_title"]}" -> '
                    f'"{p["canonical_title"]}" ({p["match_strategy"]}, '
                    f'{int(float(p["similarity"] or 0) * 100)}%)'
                ),
            })

        # Then new scans
        for m in scanned:
            if m["alias_id"] in claimed_aliases:
                continue
            claimed_aliases.add(m["alias_id"])
            idx = len(changes)
            changes.append({
                "op": "merge_nodes",
                "alias_id": m["alias_id"],
                "alias_title": m["alias_title"],
                "canonical_id": m["canonical_id"],
                "canonical_title": m["canonical_title"],
                "strategy": m["strategy"],
                "similarity": m["similarity"],
                "alias_row_id": None,
            })
            details.append({
                "change_index": idx,
                "note": (
                    f'New match: "{m["alias_title"]}" -> '
                    f'"{m["canonical_title"]}" ({m["strategy"]}, '
                    f'{int(m["similarity"] * 100)}%)'
                ),
            })

        if not changes:
            return Proposal(
                action_kind=self.name,
                reasoning=(
                    "No duplicate concepts found. Your graph is either "
                    "already clean, or the concepts are too distinct "
                    "to merge confidently."
                ),
                changes=[],
                details=[],
                confidence=1.0,
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            )

        n = len(changes)
        reasoning = (
            f"Proposing {n} concept merge{'' if n == 1 else 's'}. "
            f"Each one consolidates two similar concepts into one."
        )

        return Proposal(
            action_kind=self.name,
            reasoning=reasoning,
            changes=changes,
            details=details,
            confidence=0.9,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )

    async def apply(
        self,
        db: AsyncSession,
        proposal: Proposal,
    ) -> ApplyResult:
        """
        For each merge_nodes change:
          - If alias_row_id is set (existing pending) -> accept it
          - Otherwise, call _record_alias with status='accepted'
        """
        from app.services.canonicalization import (
            _record_alias,
            accept_pending_alias,
        )

        merged_ids: list[str] = []
        skipped = 0

        # Resolve user_id from any alias node
        user_id = ""
        for change in proposal.changes:
            aid = change.get("alias_id")
            if not aid:
                continue
            row = (await db.execute(text(
                "SELECT user_id FROM nodes WHERE id = :nid"
            ), {"nid": str(aid)})).first()
            if row:
                user_id = str(row[0])
                break

        for change in proposal.changes:
            if change.get("op") != "merge_nodes":
                continue
            alias_id = change.get("alias_id")
            canonical_id = change.get("canonical_id")
            strategy = change.get("strategy") or "embedding"
            similarity = float(change.get("similarity") or 0.0)
            existing_row_id = change.get("alias_row_id")

            if not (alias_id and canonical_id and user_id):
                skipped += 1
                continue

            if existing_row_id:
                ok = await accept_pending_alias(db, user_id, str(existing_row_id))
                if ok:
                    merged_ids.append(str(existing_row_id))
                else:
                    skipped += 1
                continue

            # New merge -- record it directly
            row_id = await _record_alias(
                db,
                user_id=user_id,
                alias_id=str(alias_id),
                canonical_id=str(canonical_id),
                strategy=str(strategy),
                similarity=similarity,
                note=f"agent merge ({strategy}, {int(similarity * 100)}%)",
                status="accepted",
            )
            if row_id:
                merged_ids.append(row_id)
            else:
                skipped += 1

        return ApplyResult(
            ok=True,
            message=(
                f"Merged {len(merged_ids)} pair"
                f"{'' if len(merged_ids) == 1 else 's'}."
                + (f" Skipped {skipped}." if skipped else "")
            ),
            applied=len(merged_ids),
            snapshot={"merged_aliases": merged_ids},
        )


register_agent(MergeConceptsAgent())
