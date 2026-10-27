"""
reorganize agent -- Phase 4.4.

Composes find_orphans, merge_concepts, and suggest_links into a single proposal.

Flow:
  1. Call each sub-agent's plan() with the same user_id
  2. Tag each change with its originating agent kind
  3. Cap the combined proposal at reorganize_max_changes
  4. Return a single composite Proposal

apply() dispatches each change back to the correct sub-agent's
apply() by re-constructing a temporary sub-proposal from the changes
belonging to that agent. Snapshots merge into one for undo.

Note: place_url is NOT included -- its plan() has side effects
(it captures the URL). Reorganize only composes side-effect-free
scanners.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.actions.base import (
    ActionAgent,
    ApplyResult,
    Proposal,
    get_agent,
    register_agent,
)
from app.services.actions.merge_concepts import MergeConceptsAgent
from app.services.actions.suggest_links import SuggestLinksAgent


# Order matters -- cheaper/more impactful first.
# find_orphans is read-only (informational), so it goes first.
# merge_concepts and suggest_links then contribute the actionable changes.
SUB_AGENT_ORDER = ["find_orphans", "merge_concepts", "suggest_links"]


class ReorganizeAgent(ActionAgent):
    name = "reorganize"
    description = (
        "Comprehensive organizational pass over the user's graph: "
        "detects duplicate concepts and proposes merges, proposes new "
        "links between related concepts, AND surfaces orphan concepts. "
        "Use this whenever the user says 'organize my graph', "
        "'tidy up', 'clean up my graph', 'run all agents', or asks "
        "for a full health check. This is a superset of find_orphans, "
        "suggest_links, and merge_concepts combined."
    )
    requires_llm = True
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
        from app.config.settings import get_settings
        s = get_settings()
        cap = s.reorganize_max_changes

        all_changes: list[dict[str, Any]] = []
        all_details: list[dict[str, Any]] = []
        sub_summaries: list[str] = []
        seen_edges: set[tuple[str, str, str]] = set()
        seen_merges: set[str] = set()

        for agent_name in SUB_AGENT_ORDER:
            if len(all_changes) >= cap:
                break

            agent = get_agent(agent_name)
            if agent is None:
                print(f"[reorganize] sub-agent '{agent_name}' not registered -- skipping")
                continue

            try:
                sub_proposal = await agent.plan(
                    db, user_id, instruction, context or {}
                )
            except Exception as e:  # noqa: BLE001
                print(f"[reorganize] {agent_name}.plan() failed: {e}")
                continue

            if sub_proposal is None or not sub_proposal.changes:
                sub_summaries.append(f"{agent_name}: 0 changes")
                continue

            added = 0
            for change in sub_proposal.changes:
                if len(all_changes) >= cap:
                    break

                op = change.get("op")
                # Dedupe edges and merges across sub-agents
                if op == "create_edge":
                    a, b = sorted([str(change.get("from")), str(change.get("to"))])
                    key = (a, b, str(change.get("type")))
                    if key in seen_edges:
                        continue
                    seen_edges.add(key)
                elif op == "merge_nodes":
                    aid = str(change.get("alias_id") or "")
                    if aid in seen_merges:
                        continue
                    seen_merges.add(aid)

                tagged = dict(change)
                tagged["_agent"] = agent_name
                all_changes.append(tagged)
                added += 1

            sub_summaries.append(f"{agent_name}: {added} changes")

        if not all_changes:
            return Proposal(
                action_kind=self.name,
                reasoning=(
                    "Ran the full organizational pass: no merges to "
                    "suggest and no strong links to propose. Your graph "
                    "is either already tidy or too small for this to help."
                ),
                changes=[],
                details=[],
                confidence=1.0,
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            )

        # Build details array with indices aligned to the combined changes
        for i, change in enumerate(all_changes):
            agent_name = change.get("_agent")
            op = change.get("op")

            if op == "create_edge":
                note = (
                    f'[{agent_name}] "{change.get("from_title")}" -> '
                    f'"{change.get("to_title")}" as {change.get("type")} '
                    f'({int(float(change.get("weight") or 0) * 100)}%)'
                )
            elif op == "merge_nodes":
                note = (
                    f'[{agent_name}] Merge "{change.get("alias_title")}" '
                    f'into "{change.get("canonical_title")}" '
                    f'({change.get("strategy")})'
                )
            else:
                note = f"[{agent_name}] {op}"

            all_details.append({"change_index": i, "note": note})

        n = len(all_changes)
        n_edges = sum(1 for c in all_changes if c.get("op") == "create_edge")
        n_merges = sum(1 for c in all_changes if c.get("op") == "merge_nodes")

        reasoning = (
            f"Ran the full organizational pass. "
            f"Proposing {n} change{'' if n == 1 else 's'} "
            f"({n_merges} merge{'' if n_merges == 1 else 's'}, "
            f"{n_edges} link{'' if n_edges == 1 else 's'}). "
            f"Review each one before applying."
        )

        return Proposal(
            action_kind=self.name,
            reasoning=reasoning,
            changes=all_changes,
            details=all_details,
            confidence=0.85,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )

    async def apply(
        self,
        db: AsyncSession,
        proposal: Proposal,
    ) -> ApplyResult:
        """
        Dispatch each change to its origin sub-agent's apply().

        Reconstructs a temporary Proposal per sub-agent containing only
        the changes that belong to it, calls that sub-agent's apply(),
        and merges the snapshots.
        """
        # Group changes by sub-agent
        by_agent: dict[str, list[dict[str, Any]]] = {}
        for change in proposal.changes:
            agent_name = change.get("_agent")
            if not agent_name:
                print(f"[reorganize] change has no _agent tag: {change.get('op')}")
                continue
            by_agent.setdefault(agent_name, []).append(change)

        total_applied = 0
        merged_snapshot: dict[str, Any] = {
            "created_edges": [],
            "merged_aliases": [],
        }
        messages: list[str] = []

        for agent_name, changes in by_agent.items():
            agent = get_agent(agent_name)
            if agent is None:
                messages.append(f"{agent_name}: agent not found")
                continue

            # Strip the _agent tag before handing to the sub-agent
            clean_changes = [{k: v for k, v in c.items() if k != "_agent"} for c in changes]
            sub_proposal = Proposal(
                action_kind=agent_name,
                reasoning="",
                changes=clean_changes,
                details=[],
                confidence=1.0,
            )

            try:
                sub_result = await agent.apply(db, sub_proposal)
            except Exception as e:  # noqa: BLE001
                messages.append(f"{agent_name}: FAILED ({e})")
                continue

            total_applied += sub_result.applied
            messages.append(f"{agent_name}: {sub_result.applied} applied")

            # Merge snapshots
            snap = sub_result.snapshot or {}
            if snap.get("created_edges"):
                merged_snapshot["created_edges"].extend(snap["created_edges"])
            if snap.get("merged_aliases"):
                merged_snapshot["merged_aliases"].extend(snap["merged_aliases"])

        return ApplyResult(
            ok=True,
            message=(
                f"Reorganize applied {total_applied} change"
                f"{'' if total_applied == 1 else 's'}. "
                + " | ".join(messages)
            ),
            applied=total_applied,
            snapshot=merged_snapshot,
        )


register_agent(ReorganizeAgent())
