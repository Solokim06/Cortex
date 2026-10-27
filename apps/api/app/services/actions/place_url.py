"""
place_url agent -- Phase 4.3.

Captures a URL and proposes edges from the newly captured content into
the existing graph.

Flow:
  1. Fetch + extract the URL via extract_url()
  2. Capture as a thought via capture_text() (creates concept nodes,
     mirrors to Neo4j, enqueues embeddings)
  3. For each new node (thought + its concepts), run the shared edge
     proposal pass
  4. Return a Proposal containing only create_edge ops

The capture itself happens during plan(). The proposal covers only the
edges -- those are the risky additions that need user approval. If the
user dismisses the proposal, the captured nodes remain (they're
additive and harmless).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Node
from app.services.actions.base import (
    ActionAgent,
    ApplyResult,
    Proposal,
    register_agent,
)
from app.services.edges import propose_edges_for_node


async def _fetch_and_capture(
    db: AsyncSession,
    user_id: str,
    url: str,
    title: str | None,
) -> dict:
    """
    Fetch the URL, extract its content, and capture it as a node.

    Returns:
      {"node_id": str, "concept_ids": [str], "bookmark_only": bool, "error": str | None}
    """
    from app.services.extract import extract_url
    from app.services.capture import capture_text

    extraction = await extract_url(url)
    extracted_text = extraction.get("text", "")
    source_type = extraction.get("source_type", "url")
    extraction_error = extraction.get("error")
    metadata = extraction.get("metadata", {}) or {}

    display_title = title or metadata.get("title") or url

    # Fallback: extraction failed -> bookmark node
    if not extracted_text.strip():
        bookmark_body = (
            f"[Bookmarked URL: {url}]\n\n"
            f"Cortex could not extract readable content "
            f"({extraction_error or 'unknown reason'}).\n\n"
            f"Open the link to view it directly."
        )
        node = await capture_text(
            db=db,
            user_id=user_id,
            text=bookmark_body,
            title=display_title,
            source_type="url",
        )
        node.meta = {
            **(node.meta or {}),
            "source_type": "url",
            "original_url": url,
            "extraction_metadata": metadata,
            "bookmark_only": True,
        }
        await db.commit()
        await db.refresh(node)
        return {
            "node_id": str(node.id),
            "concept_ids": [],
            "bookmark_only": True,
            "error": extraction_error or "No extractable content.",
        }

    # Normal path: capture_text creates the thought + concepts + mirrors
    node = await capture_text(
        db=db,
        user_id=user_id,
        text=extracted_text,
        title=display_title,
        source_type=source_type,
    )
    node.meta = {
        **(node.meta or {}),
        "source_type": source_type,
        "original_url": url,
        "extraction_metadata": metadata,
    }
    await db.commit()
    await db.refresh(node)

    # Fetch the concept nodes that capture_text created for this thought
    # The Node.meta field is stored in a column named "metadata".
    # It's a JSON (not JSONB) column, so we cast to jsonb to use ->>
    # which avoids a JSON parse round-trip per row.
    concept_rows = (await db.execute(text(
        "SELECT id FROM nodes "
        "WHERE user_id = :uid AND type = 'concept' "
        "AND (CAST(metadata AS jsonb)->>'extracted_from') = :tid"
    ), {"uid": user_id, "tid": str(node.id)})).all()

    return {
        "node_id": str(node.id),
        "concept_ids": [str(r[0]) for r in concept_rows],
        "bookmark_only": False,
        "error": None,
    }


class PlaceUrlAgent(ActionAgent):
    name = "place_url"
    description = (
        "Capture a URL and auto-link it to related concepts in the "
        "graph. The captured page becomes a thought node; the proposal "
        "covers only the new edges."
    )
    requires_llm = True
    auto_apply_default = False

    parameters_schema = {
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "The URL to capture.",
            },
            "title": {
                "type": ["string", "null"],
                "description": (
                    "Optional human-readable title. Pass null if unknown."
                ),
            },
        },
        "required": ["url"],
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
        url = str(ctx.get("url") or "").strip()
        title = ctx.get("title")

        if not url:
            raise ValueError("place_url requires context.url")
        if not url.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")

        # 1. Fetch + capture
        info = await _fetch_and_capture(db, user_id, url, title)

        # 2. If bookmark-only, no edges to propose
        if info["bookmark_only"]:
            return Proposal(
                action_kind=self.name,
                reasoning=(
                    f"Bookmarked {url}. Cortex could not extract readable "
                    f"content ({info['error']}), so there are no links "
                    f"to propose. The bookmark is saved in your graph."
                ),
                changes=[],
                details=[],
                confidence=1.0,
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            )

        # 3. Collect all new nodes to propose edges for
        node_ids = [info["node_id"]] + info["concept_ids"]

        # Load each as a target dict
        targets: list[dict] = []
        for nid in node_ids:
            row = (await db.execute(text(
                "SELECT id, title, summary, content FROM nodes "
                "WHERE id = :nid AND user_id = :uid"
            ), {"nid": nid, "uid": user_id})).mappings().first()
            if row is not None:
                targets.append(dict(row))

        # 4. Run the shared LLM pass for each new node
        changes: list[dict[str, Any]] = []
        details: list[dict[str, Any]] = []
        seen_edges: set[tuple[str, str, str]] = set()
        cap = s.suggest_links_max_edges  # reuse the same cap

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

        n = len(changes)
        n_concepts = len(info["concept_ids"])
        if n == 0:
            reasoning = (
                f"Captured {url} and extracted {n_concepts} concept"
                f"{'' if n_concepts == 1 else 's'}. No strong links to "
                f"existing concepts were found."
            )
        else:
            reasoning = (
                f"Captured {url} and extracted {n_concepts} concept"
                f"{'' if n_concepts == 1 else 's'}. "
                f"Proposing {n} new link{'' if n == 1 else 's'} to "
                f"related concepts."
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
        from app.services.edges import _write_edge

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


register_agent(PlaceUrlAgent())
