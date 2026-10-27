"""
suggest_links agent -- Phase 4.2.

Proposes edges between semantically related concepts. Two modes:

  Targeted:  context={"target_id": "<uuid>"}
             -- find the target's nearest concepts and propose edges

  Sweep:     context={}
             -- find the top-K low-degree concepts, run the LLM pass
                against each, aggregate into one proposal

The heavy lifting (neighbor search + LLM edge proposal) lives in
app.services.edges.propose_edges_for_node, shared with place_url.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.actions.base import (
    ActionAgent,
    ApplyResult,
    Proposal,
    register_agent,
)
from app.services.edges import propose_edges_for_node


async def _find_targets_sweep(
    db: AsyncSession, user_id: str, k: int, max_degree: int
) -> list[dict]:
    """
    Return up to k canonical concepts whose current degree is below
    max_degree. Ordered by degree ascending, with randomness for
    diversity across runs.
    """
    sql = text("""
        SELECT n.id, n.title, n.summary, n.content,
               (SELECT COUNT(*) FROM edges e
                WHERE e.from_node_id = n.id OR e.to_node_id = n.id) AS degree
        FROM nodes n
        WHERE n.user_id = :uid
          AND n.type = 'concept'
          AND n.canonical_concept_id IS NULL
          AND (SELECT COUNT(*) FROM edges e
               WHERE e.from_node_id = n.id OR e.to_node_id = n.id) < :max_deg
          AND EXISTS (SELECT 1 FROM embeddings emb WHERE emb.node_id = n.id)
        ORDER BY degree ASC, random()
        LIMIT :k
    """)
    rows = (await db.execute(sql, {
        "uid": user_id,
        "k": k,
        "max_deg": max_degree,
    })).mappings().all()
    return [dict(r) for r in rows]


class SuggestLinksAgent(ActionAgent):
    name = "suggest_links"
    description = (
        "Propose new edges between semantically related concepts. "
        "Runs against a specific concept or sweeps the graph for "
        "under-connected concepts."
    )
    requires_llm = True
    auto_apply_default = False

    parameters_schema = {
        "type": "object",
        "properties": {
            "target_id": {
                "type": ["string", "null"],
                "description": (
                    "Optional. A concept id to analyze. If omitted or "
                    "null, the agent sweeps for low-degree concepts."
                ),
            },
        },
    }

    async def plan(
        self,
        db: AsyncSession,
        user_id: str,
        instruction: str,
        context: dict[str, Any] | None = None,
    ) -> Proposal | None:
        from app.config.settings import get_settings
        s = get_settings()

        ctx = context or {}
        target_id = ctx.get("target_id")

        # ---- Determine which concepts to analyze ----
        targets: list[dict] = []
        if target_id:
            row = (await db.execute(text(
                "SELECT id, title, summary, content FROM nodes "
                "WHERE id = :tid AND user_id = :uid AND type = 'concept'"
            ), {"tid": target_id, "uid": user_id})).mappings().first()
            if row is None:
                raise ValueError("Target concept not found")
            targets = [dict(row)]
        else:
            targets = await _find_targets_sweep(
                db, user_id,
                k=s.suggest_links_sweep_targets,
                max_degree=s.suggest_links_max_degree,
            )

        if not targets:
            return Proposal(
                action_kind=self.name,
                reasoning=(
                    "No under-connected concepts found. Your graph is "
                    "either dense or too small for this to help."
                ),
                changes=[],
                details=[],
                confidence=1.0,
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            )

        # ---- For each target, run the shared LLM pass ----
        changes: list[dict[str, Any]] = []
        details: list[dict[str, Any]] = []
        seen_edges: set[tuple[str, str, str]] = set()
        cap = s.suggest_links_max_edges

        for target in targets:
            if len(changes) >= cap:
                break

            proposals = await propose_edges_for_node(
                db, user_id, target,
                max_candidates=s.suggest_links_max_candidates,
                similarity_floor=s.suggest_links_similarity_floor,
                min_confidence=s.suggest_links_min_confidence,
            )

            for p in proposals:
                if len(changes) >= cap:
                    break

                # Dedupe by unordered pair + type
                a, b = sorted([p["from_id"], p["to_id"]])
                key = (a, b, p["type"])
                if key in seen_edges:
                    continue
                seen_edges.add(key)

                idx = len(changes)
                changes.append({
                    "op": "create_edge",
                    "from": p["from_id"],
                    "from_title": p["from_title"],
                    "to": p["to_id"],
                    "to_title": p["to_title"],
                    "type": p["type"],
                    "weight": p["weight"],
                })
                details.append({
                    "change_index": idx,
                    "note": (
                        f'"{p["from_title"]}" -> "{p["to_title"]}" '
                        f'as {p["type"]} ({int(p["weight"] * 100)}%): {p["why"]}'
                    ),
                })

        if not changes:
            return Proposal(
                action_kind=self.name,
                reasoning=(
                    "I looked at your under-connected concepts but did "
                    "not find any strong, specific links worth proposing."
                ),
                changes=[],
                details=[],
                confidence=1.0,
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            )

        n = len(changes)
        reasoning = (
            f"Proposing {n} new link{'' if n == 1 else 's'} between "
            f"related concepts. Review each one before applying."
        )

        return Proposal(
            action_kind=self.name,
            reasoning=reasoning,
            changes=changes,
            details=details,
            confidence=0.85,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )

    async def apply(
        self,
        db: AsyncSession,
        proposal: Proposal,
    ) -> ApplyResult:
        """
        Write each proposed edge. Uses edges._write_edge for the
        Postgres insert + Neo4j mirror, so dedupe and mirroring are
        handled the same way as the automatic pass.
        """
        from app.services.edges import _write_edge

        # Resolve the user_id from any change's from_id.
        user_id = ""
        for change in proposal.changes:
            fid = change.get("from")
            if not fid:
                continue
            row = (await db.execute(text(
                "SELECT user_id FROM nodes WHERE id = :nid"
            ), {"nid": str(fid)})).first()
            if row:
                user_id = str(row[0])
                break

        created_ids: list[str] = []
        skipped = 0

        for change in proposal.changes:
            if change.get("op") != "create_edge":
                continue
            from_id = change.get("from")
            to_id = change.get("to")
            etype = change.get("type")
            weight = float(change.get("weight") or 1.0)

            if not (from_id and to_id and etype and user_id):
                skipped += 1
                continue

            ok = await _write_edge(
                db,
                user_id=user_id,
                from_id=str(from_id),
                to_id=str(to_id),
                edge_type=str(etype),
                weight=weight,
                created_by="agent",
            )
            if not ok:
                skipped += 1
                continue

            row = (await db.execute(text(
                "SELECT id FROM edges "
                "WHERE from_node_id = :f AND to_node_id = :t AND type = :ty "
                "ORDER BY created_at DESC LIMIT 1"
            ), {"f": str(from_id), "t": str(to_id), "ty": str(etype)})).first()
            if row:
                created_ids.append(str(row[0]))

        return ApplyResult(
            ok=True,
            message=(
                f"Applied {len(created_ids)} new link"
                f"{'' if len(created_ids) == 1 else 's'}."
                + (f" Skipped {skipped}." if skipped else "")
            ),
            applied=len(created_ids),
            snapshot={"created_edges": created_ids},
        )


register_agent(SuggestLinksAgent())
