"""
Find orphans agent.

Read-only. Surfaces canonical concepts with zero edges -- the "orphan"
nodes that clutter the graph. Zero risk: no mutations, no LLM call.

The proposal returned has changes=[] because orphans are informational.
The UI shows them as a list; the user can click through to /memory to
link or delete them manually.
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


MAX_ORPHANS = 50


class FindOrphansAgent(ActionAgent):
    name = "find_orphans"
    description = (
        "Find concepts in the user's graph that have no connections to "
        "anything else. Useful for spotting capture that never got linked."
    )
    requires_llm = False
    auto_apply_default = True  # read-only, nothing to approve

    async def plan(
        self,
        db: AsyncSession,
        user_id: str,
        instruction: str,
        context: dict[str, Any] | None = None,
    ) -> Proposal | None:
        # Query canonical concepts with zero edges
        rows = (await db.execute(text(
            "SELECT n.id, n.title, n.summary, n.created_at "
            "FROM nodes n "
            "WHERE n.user_id = :uid "
            "  AND n.type = 'concept' "
            "  AND n.canonical_concept_id IS NULL "
            "  AND NOT EXISTS ("
            "    SELECT 1 FROM edges e "
            "    WHERE e.from_node_id = n.id OR e.to_node_id = n.id"
            "  ) "
            "ORDER BY n.created_at DESC "
            "LIMIT :lim"
        ), {"uid": user_id, "lim": MAX_ORPHANS})).mappings().all()

        if not rows:
            return Proposal(
                action_kind=self.name,
                reasoning=(
                    "No orphan concepts found. Every concept in your "
                    "graph is connected to something."
                ),
                changes=[],
                details=[],
                confidence=1.0,
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            )

        orphans = []
        details = []
        for i, r in enumerate(rows):
            orphans.append({
                "id": str(r["id"]),
                "title": (r["title"] or "(untitled)")[:200],
                "summary": (r["summary"] or "")[:200],
                "created_at": (
                    r["created_at"].isoformat() if r["created_at"] else None
                ),
            })
            details.append({
                "change_index": i,
                "note": (
                    f'\"{orphans[-1]["title"]}\" has no edges. '
                    "Consider linking it to a related concept."
                ),
            })

        reasoning = (
            f"Found {len(orphans)} orphan concept"
            f"{'s' if len(orphans) != 1 else ''} in your graph. "
            "These have no connections to other concepts. You can link "
            "them or remove them from the Memory page."
        )

        # Non-mutating proposal: changes list is empty, orphans live
        # in `details[].context` so the UI can render them.
        changes: list[dict[str, Any]] = []
        for o in orphans:
            changes.append({"op": "inform_orphan", "node": o})

        return Proposal(
            action_kind=self.name,
            reasoning=reasoning,
            changes=changes,
            details=details,
            confidence=1.0,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )

    async def apply(
        self,
        db: AsyncSession,
        proposal: Proposal,
    ) -> ApplyResult:
        # Read-only agent -- nothing to apply. Return success so the
        # action history shows "applied: 0 changes (informational)".
        return ApplyResult(
            ok=True,
            message="Informational proposal -- no changes applied.",
            applied=0,
            snapshot={},
        )


# Register on import
register_agent(FindOrphansAgent())
