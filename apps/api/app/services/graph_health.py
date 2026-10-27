"""
Tier 8 graph health -- compute stats and issues for a user's knowledge graph.

Pure read. No writes, no LLM calls. Feeds GET /memory/health.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


# =====================================================================
# public entry point
# =====================================================================


async def compute_health(db: AsyncSession, user_id: str) -> dict:
    """
    Return a composite stats payload for the user's graph.

    All queries are read-only. Sections:
      overview   -- counts and coverage metrics
      topology   -- graph shape (degree, density)
      issues     -- orphans, dangling edges, pending merges, stale
      activity   -- recent activity (7-day windows)
    """
    overview = await _overview(db, user_id)
    topology = await _topology(db, user_id)
    issues = await _issues(db, user_id)
    activity = await _activity(db, user_id)
    return {
        "overview": overview,
        "topology": topology,
        "issues": issues,
        "activity": activity,
    }


# =====================================================================
# overview
# =====================================================================


async def _overview(db: AsyncSession, user_id: str) -> dict:
    # Node counts by type
    rows = (await db.execute(text(
        "SELECT type, count(*) AS c FROM nodes "
        "WHERE user_id = :uid GROUP BY type"
    ), {"uid": user_id})).mappings().all()
    nodes_by_type = {r["type"]: int(r["c"]) for r in rows}
    nodes_total = sum(nodes_by_type.values())

    # Edge counts by type
    rows = (await db.execute(text(
        "SELECT type, count(*) AS c FROM edges "
        "WHERE user_id = :uid GROUP BY type"
    ), {"uid": user_id})).mappings().all()
    edges_by_type = {r["type"]: int(r["c"]) for r in rows}
    edges_total = sum(edges_by_type.values())

    # Concept canonicalization state
    canonical = (await db.execute(text(
        "SELECT count(*) FROM nodes "
        "WHERE user_id = :uid AND type = 'concept' "
        "AND canonical_concept_id IS NULL"
    ), {"uid": user_id})).scalar() or 0
    aliased = (await db.execute(text(
        "SELECT count(*) FROM nodes "
        "WHERE user_id = :uid AND type = 'concept' "
        "AND canonical_concept_id IS NOT NULL"
    ), {"uid": user_id})).scalar() or 0
    pending = (await db.execute(text(
        "SELECT count(*) FROM concept_aliases "
        "WHERE user_id = :uid AND status = 'pending'"
    ), {"uid": user_id})).scalar() or 0

    # Orphan concepts = canonical concept nodes with no edges touching them
    orphan = (await db.execute(text(
        "SELECT count(*) FROM nodes n "
        "WHERE n.user_id = :uid AND n.type = 'concept' "
        "AND n.canonical_concept_id IS NULL "
        "AND NOT EXISTS (SELECT 1 FROM edges e "
        "                WHERE e.from_node_id = n.id OR e.to_node_id = n.id)"
    ), {"uid": user_id})).scalar() or 0

    # Dangling edges = edges that point at missing or aliased nodes
    dangling = (await db.execute(text(
        "SELECT count(*) FROM edges e "
        "WHERE e.user_id = :uid "
        "AND (NOT EXISTS (SELECT 1 FROM nodes WHERE id = e.from_node_id) "
        "     OR NOT EXISTS (SELECT 1 FROM nodes WHERE id = e.to_node_id))"
    ), {"uid": user_id})).scalar() or 0

    # Embedding coverage
    embedded = (await db.execute(text(
        "SELECT count(*) FROM embeddings WHERE user_id = :uid"
    ), {"uid": user_id})).scalar() or 0
    coverage = (embedded / nodes_total) if nodes_total > 0 else 0.0

    # Stale concepts
    stale = (await db.execute(text(
        "SELECT count(*) FROM nodes "
        "WHERE user_id = :uid AND type = 'concept' "
        "AND stale_since IS NOT NULL"
    ), {"uid": user_id})).scalar() or 0

    # Median degree (over all non-alias nodes)
    degree_rows = (await db.execute(text(
        "SELECT degree FROM ( "
        "  SELECT n.id, "
        "         (SELECT count(*) FROM edges e "
        "          WHERE e.from_node_id = n.id OR e.to_node_id = n.id) AS degree "
        "  FROM nodes n "
        "  WHERE n.user_id = :uid AND n.canonical_concept_id IS NULL "
        ") sub "
        "ORDER BY degree"
    ), {"uid": user_id})).all()
    degrees = [int(r[0]) for r in degree_rows]
    median = degrees[len(degrees) // 2] if degrees else 0

    return {
        "nodes_total": nodes_total,
        "nodes_by_type": nodes_by_type,
        "edges_total": edges_total,
        "edges_by_type": edges_by_type,
        "canonical_concepts": int(canonical),
        "aliased_concepts": int(aliased),
        "pending_merges": int(pending),
        "orphan_concepts": int(orphan),
        "dangling_edges": int(dangling),
        "embedded_nodes": int(embedded),
        "embedding_coverage": round(float(coverage), 3),
        "stale_concepts": int(stale),
        "median_degree": int(median),
    }


# =====================================================================
# topology
# =====================================================================


async def _topology(db: AsyncSession, user_id: str) -> dict:
    # Degree histogram --- for each node, count its edges, then bucket by degree
    rows = (await db.execute(text(
        "SELECT degree, count(*) AS c FROM ( "
        "  SELECT n.id, "
        "         (SELECT count(*) FROM edges e "
        "          WHERE e.from_node_id = n.id OR e.to_node_id = n.id) AS degree "
        "  FROM nodes n "
        "  WHERE n.user_id = :uid AND n.canonical_concept_id IS NULL "
        ") sub "
        "GROUP BY degree ORDER BY degree"
    ), {"uid": user_id})).mappings().all()
    histogram = [{"degree": int(r["degree"]), "count": int(r["c"])} for r in rows]

    # Edge density = edges per node
    n_nodes = (await db.execute(text(
        "SELECT count(*) FROM nodes WHERE user_id = :uid "
        "AND canonical_concept_id IS NULL"
    ), {"uid": user_id})).scalar() or 0
    n_edges = (await db.execute(text(
        "SELECT count(*) FROM edges WHERE user_id = :uid"
    ), {"uid": user_id})).scalar() or 0
    density = (n_edges / n_nodes) if n_nodes > 0 else 0.0

    return {
        "degree_histogram": histogram,
        "edge_density": round(float(density), 3),
    }


# =====================================================================
# issues
# =====================================================================


async def _issues(db: AsyncSession, user_id: str) -> dict:
    orphans = await _fetch_orphans(db, user_id)
    dangling = await _fetch_dangling(db, user_id)
    pending = await _fetch_pending_merges(db, user_id)
    stale = await _fetch_stale(db, user_id)
    return {
        "orphans": orphans,
        "dangling_edges": dangling,
        "pending_merges": pending,
        "stale": stale,
    }


async def _fetch_orphans(db: AsyncSession, user_id: str, limit: int = 50) -> list[dict]:
    rows = (await db.execute(text(
        "SELECT n.id, n.title, n.type, n.created_at "
        "FROM nodes n "
        "WHERE n.user_id = :uid AND n.type = 'concept' "
        "AND n.canonical_concept_id IS NULL "
        "AND NOT EXISTS (SELECT 1 FROM edges e "
        "                WHERE e.from_node_id = n.id OR e.to_node_id = n.id) "
        "ORDER BY n.created_at DESC LIMIT :lim"
    ), {"uid": user_id, "lim": limit})).mappings().all()
    return [
        {
            "id": str(r["id"]),
            "title": r["title"] or "(untitled)",
            "type": r["type"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]


async def _fetch_dangling(db: AsyncSession, user_id: str, limit: int = 50) -> list[dict]:
    rows = (await db.execute(text(
        "SELECT e.id, e.type, e.from_node_id, e.to_node_id "
        "FROM edges e "
        "WHERE e.user_id = :uid "
        "AND (NOT EXISTS (SELECT 1 FROM nodes WHERE id = e.from_node_id) "
        "     OR NOT EXISTS (SELECT 1 FROM nodes WHERE id = e.to_node_id)) "
        "LIMIT :lim"
    ), {"uid": user_id, "lim": limit})).mappings().all()
    return [
        {
            "id": str(r["id"]),
            "type": r["type"],
            "from_node_id": str(r["from_node_id"]),
            "to_node_id": str(r["to_node_id"]),
        }
        for r in rows
    ]


async def _fetch_pending_merges(db: AsyncSession, user_id: str, limit: int = 50) -> list[dict]:
    rows = (await db.execute(text(
        "SELECT ca.id, ca.alias_node_id, ca.canonical_node_id, "
        "       ca.match_strategy, ca.similarity, ca.note, ca.created_at, "
        "       na.title AS alias_title, nc.title AS canonical_title "
        "FROM concept_aliases ca "
        "JOIN nodes na ON na.id = ca.alias_node_id "
        "JOIN nodes nc ON nc.id = ca.canonical_node_id "
        "WHERE ca.user_id = :uid AND ca.status = 'pending' "
        "ORDER BY ca.created_at DESC LIMIT :lim"
    ), {"uid": user_id, "lim": limit})).mappings().all()
    return [
        {
            "alias_row_id": str(r["id"]),
            "alias_node_id": str(r["alias_node_id"]),
            "canonical_node_id": str(r["canonical_node_id"]),
            "alias_title": r["alias_title"] or "(untitled)",
            "canonical_title": r["canonical_title"] or "(untitled)",
            "strategy": r["match_strategy"],
            "similarity": float(r["similarity"] or 0.0),
            "note": r["note"] or "",
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]


async def _fetch_stale(db: AsyncSession, user_id: str, limit: int = 50) -> list[dict]:
    rows = (await db.execute(text(
        "SELECT id, title, stale_since, created_at FROM nodes "
        "WHERE user_id = :uid AND type = 'concept' "
        "AND stale_since IS NOT NULL "
        "ORDER BY stale_since DESC LIMIT :lim"
    ), {"uid": user_id, "lim": limit})).mappings().all()
    now = datetime.now(timezone.utc)
    out = []
    for r in rows:
        created = r["created_at"]
        age_days = None
        if created is not None:
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            age_days = (now - created).days
        out.append({
            "id": str(r["id"]),
            "title": r["title"] or "(untitled)",
            "age_days": age_days,
            "stale_since": r["stale_since"].isoformat() if r["stale_since"] else None,
        })
    return out


# =====================================================================
# activity
# =====================================================================


async def _activity(db: AsyncSession, user_id: str) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)

    merges = (await db.execute(text(
        "SELECT count(*) FROM concept_aliases "
        "WHERE user_id = :uid AND created_at >= :cutoff"
    ), {"uid": user_id, "cutoff": cutoff})).scalar() or 0

    captures = (await db.execute(text(
        "SELECT count(*) FROM nodes "
        "WHERE user_id = :uid AND created_at >= :cutoff"
    ), {"uid": user_id, "cutoff": cutoff})).scalar() or 0

    edges = (await db.execute(text(
        "SELECT count(*) FROM edges "
        "WHERE user_id = :uid AND created_at >= :cutoff"
    ), {"uid": user_id, "cutoff": cutoff})).scalar() or 0

    # Recent merges list (last 10, any status)
    rows = (await db.execute(text(
        "SELECT ca.match_strategy, ca.similarity, ca.created_at, ca.status, "
        "       na.title AS alias_title, nc.title AS canonical_title "
        "FROM concept_aliases ca "
        "JOIN nodes na ON na.id = ca.alias_node_id "
        "JOIN nodes nc ON nc.id = ca.canonical_node_id "
        "WHERE ca.user_id = :uid "
        "ORDER BY ca.created_at DESC LIMIT 10"
    ), {"uid": user_id})).mappings().all()
    recent_list = [
        {
            "alias_title": r["alias_title"] or "(untitled)",
            "canonical_title": r["canonical_title"] or "(untitled)",
            "strategy": r["match_strategy"],
            "similarity": float(r["similarity"] or 0.0),
            "status": r["status"],
            "when": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]

    return {
        "recent_merges_7d": int(merges),
        "recent_captures_7d": int(captures),
        "recent_edges_7d": int(edges),
        "recent_merges_list": recent_list,
    }
