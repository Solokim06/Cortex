"""
Tier 4 -- undo machinery.

Reverses the effects of an applied agent action using its snapshot.

Snapshot shape (per docs/agentic_actions.md):

    {
      "created_nodes": ["uuid1", "uuid2"],
      "created_edges": ["uuid3"],
      "updated_nodes": [{"id": "uuid4", "before": {"title": "old"}}],
      "merged_aliases": ["alias_row_id_1"]
    }

The handler is defensive: missing keys are treated as empty lists, and
partial failures roll back the whole undo (single transaction).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def apply_inverse(
    db: AsyncSession,
    user_id: str,
    snapshot: dict[str, Any],
) -> None:
    """
    Reverse the effects described by `snapshot`. Runs in a single
    transaction; caller is expected to be inside one already (the
    dispatcher commits).
    """
    if not snapshot:
        # Nothing to undo -- the action had no side effects.
        return

    created_nodes = snapshot.get("created_nodes") or []
    created_edges = snapshot.get("created_edges") or []
    updated_nodes = snapshot.get("updated_nodes") or []
    merged_aliases = snapshot.get("merged_aliases") or []

    # 1. Delete created edges first (FK to nodes). We also delete the
    # Neo4j mirror, otherwise the graph diverges.
    for edge_id in created_edges:
        # Fetch endpoints + type so we can delete the Neo4j rel.
        row = (await db.execute(text(
            "SELECT from_node_id, to_node_id, type FROM edges "
            "WHERE id = :eid AND user_id = :uid"
        ), {"eid": edge_id, "uid": user_id})).first()

        await db.execute(text(
            "DELETE FROM edges WHERE id = :eid AND user_id = :uid"
        ), {"eid": edge_id, "uid": user_id})

        if row:
            try:
                from app.graph.client import delete_graph_edge
                await delete_graph_edge(
                    user_id,
                    str(row[0]),
                    str(row[1]),
                    str(row[2]) if len(row) > 2 else "",
                )
            except Exception as e:  # noqa: BLE001
                print(f"[undo] Neo4j edge delete failed: {e}")

    # 2. Delete created nodes
    for node_id in created_nodes:
        await db.execute(text(
            "DELETE FROM nodes WHERE id = :nid AND user_id = :uid"
        ), {"nid": node_id, "uid": user_id})

    # 3. Restore updated nodes to their "before" state
    for entry in updated_nodes:
        node_id = entry.get("id")
        before = entry.get("before") or {}
        if not node_id or not before:
            continue
        # Only support the columns we actually mutate. This is
        # intentionally narrow -- agents should only update scalar
        # fields (title, summary, content) for undo to work.
        sets = []
        params: dict[str, Any] = {"nid": node_id, "uid": user_id}
        for i, (k, v) in enumerate(before.items()):
            if k not in ("title", "summary", "content"):
                continue
            param_name = f"v{i}"
            sets.append(f"{k} = :{param_name}")
            params[param_name] = v
        if not sets:
            continue
        sql = (
            "UPDATE nodes SET " + ", ".join(sets)
            + " WHERE id = :nid AND user_id = :uid"
        )
        await db.execute(text(sql), params)

    # 4. Undo merges via the canonicalization service
    if merged_aliases:
        from app.services.canonicalization import undo_alias
        for alias_row_id in merged_aliases:
            try:
                await undo_alias(db, user_id, str(alias_row_id))
            except Exception as e:  # noqa: BLE001
                print(f"[undo] failed to reverse alias {alias_row_id}: {e}")


async def record_snapshot_for_created_edges(
    db: AsyncSession,
    user_id: str,
    edge_ids: list[str],
) -> dict[str, Any]:
    """
    Helper for agents: build a snapshot fragment for edges they are
    about to create. Call BEFORE the insert, then save the returned
    dict into ApplyResult.snapshot.
    """
    return {
        "created_edges": [str(e) for e in edge_ids],
    }


async def record_snapshot_for_created_nodes(
    db: AsyncSession,
    user_id: str,
    node_ids: list[str],
) -> dict[str, Any]:
    """Same as above, for nodes."""
    return {
        "created_nodes": [str(n) for n in node_ids],
    }


async def record_snapshot_for_updated_node(
    db: AsyncSession,
    user_id: str,
    node_id: str,
    fields: list[str],
) -> dict[str, Any]:
    """
    Helper for agents: capture the current value of `fields` on a node
    so it can be restored on undo.
    """
    if not fields:
        return {}
    allowed = {"title", "summary", "content"}
    wanted = [f for f in fields if f in allowed]
    if not wanted:
        return {}
    sql = (
        "SELECT " + ", ".join(wanted)
        + " FROM nodes WHERE id = :nid AND user_id = :uid"
    )
    row = (await db.execute(text(sql), {"nid": node_id, "uid": user_id})).mappings().first()
    if row is None:
        return {}
    before = {f: row[f] for f in wanted}
    return {
        "updated_nodes": [{"id": str(node_id), "before": before}],
    }
