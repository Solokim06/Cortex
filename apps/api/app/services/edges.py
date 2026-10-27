"""
Edge generation --- turn the graph from a tree into a network.

The problem this solves
-----------------------
Before this module, the graph only had one edge type: :contains, from
a thought to each concept extracted from it. That gives us a tree, not
a graph --- no concept-to-concept relationships, no cross-thought links.
Multi-hop reasoning can't walk a tree.

What this module does
---------------------
On every capture (or in the background worker), for each new node:

  1. Find the node's semantically nearest existing nodes (via embeddings)
  2. Ask the LLM which edge types fit between the new node and each
     neighbor, drawn from a controlled 7-type vocabulary
  3. Write each accepted edge to Postgres (Edge table) and mirror it
     into Neo4j

It also runs an "implicit" pass over the whole graph to find concepts
that co-occur in ???2 thoughts and link them with :related_to --- the
cheap, high-confidence edges that don't need an LLM call.

Design notes
------------
- The vocabulary is fixed and small on purpose. Fewer choices ->  higher
  LLM precision, and downstream traversal (Session 5) can be written
  per-type.
- Nodes without embeddings are skipped with return None so the worker
  retries them on the next cycle (same tri-state pattern as insights).
- Edges are deduplicated by (from_id, to_id, type) --- we never create
  the same edge twice, even if multiple passes propose it.
- Every Postgres write mirrors to Neo4j via graph.client.create_graph_edge,
  which now retries on Aura cold-start.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Edge, EdgeCheck, Node
from app.graph.client import create_graph_edge
from app.services.ai import call_llm_json


# =====================================================================
# edge vocabulary
# =====================================================================

# The 7 types. The LLM sees the "meaning" and an example; anything else
# it proposes is discarded.
EDGE_TYPES: dict[str, dict[str, str]] = {
    "refines": {
        "meaning": "New node adds precision, nuance, or specificity to the old one",
        "example": "Old: 'memory is important' ->  New: 'episodic memory specifically drives recall'",
    },
    "contradicts": {
        "meaning": "New node reverses, negates, or meaningfully disagrees with the old one",
        "example": "Old: 'polish before shipping' ->  New: 'shipping rough is better than polishing'",
    },
    "expands": {
        "meaning": "New node broadens the old idea into a larger frame",
        "example": "Old: 'documenting helps' ->  New: 'documentation is one of five learning techniques'",
    },
    "exemplifies": {
        "meaning": "New node is a concrete instance of the old idea",
        "example": "Old: 'short feedback loops matter' ->  New: 'here's how I set up a 5-min demo loop'",
    },
    "supports": {
        "meaning": "New node provides evidence or a reason for the old claim",
        "example": "Old: 'async is better for deep work' ->  New: 'studies show fewer context switches'",
    },
    "questions": {
        "meaning": "New node raises a doubt or open problem about the old one",
        "example": "Old: 'AI will augment every role' ->  New: 'but what about trust in regulated fields?'",
    },
    "related_to": {
        "meaning": "Generic semantic link, no strong direction --- they go together",
        "example": "Two concepts that co-occur across many of my notes",
    },
}


# Tunables
MAX_NEIGHBORS = 5
MIN_NEIGHBOR_SIMILARITY = 0.60        # below this, don't bother asking the LLM
IMPLICIT_MIN_SHARED_THOUGHTS = 2      # concept-to-concept: co-occur at least N times


# =====================================================================
# LLM prompt
# =====================================================================

EDGE_SYSTEM = """You are Cortex's edge-weaver.

You are given a NEW node from a knowledge graph and up to 5 EXISTING
nodes that are semantically close to it. Your job: for each pair, decide
whether one of the 7 allowed edge types fits --- and if so, which one.

RULES:
1. Return valid JSON only. Never wrap it in markdown.
2. Only propose an edge when the relationship is GENUINE and SPECIFIC.
   Do not invent edges to be helpful. Empty results are fine and common.
3. Use only the 7 edge types listed below. Anything else is discarded.
4. Direction matters:
     - refines/expands/exemplifies/supports/questions/contradicts go
       FROM the new node TO the older node
     - related_to is bidirectional (either direction is fine)
5. Never propose an edge to a node that is obviously about a different
   topic --- the semantic similarity was already computed for you, but
   "similar" doesn't mean "related".
6. Confidence: 0.0-1.0. Only emit edges with confidence >= 0.6.

ALLOWED EDGE TYPES:
{edge_types_block}

RESPONSE SHAPE (exactly):
{{
  "edges": [
    {{
      "to_index": 0,
      "type": "refines",
      "confidence": 0.85,
      "why": "one short sentence"
    }}
  ]
}}
"""


EDGE_USER_TEMPLATE = """NEW node (index = -1):
Title: {new_title}
Summary: {new_summary}
Content: {new_content}

EXISTING nodes (indices 0..{max_idx}):
{neighbors_block}

Propose edges as specified.
"""


def _format_edge_types() -> str:
    lines = []
    for name, info in EDGE_TYPES.items():
        lines.append(f"- {name}: {info['meaning']}")
        lines.append(f"    example: {info['example']}")
    return "\n".join(lines)


def _format_neighbors(neighbors: list[dict]) -> str:
    lines = []
    for i, n in enumerate(neighbors):
        title = (n.get("title") or "")[:100] or "(untitled)"
        summary = (n.get("summary") or "")[:200]
        content = (n.get("content") or "")[:300]
        body = summary or content
        lines.append(f"[{i}] {title}")
        if body:
            lines.append(f"    {body}")
        lines.append("")
    return "\n".join(lines).strip()


# =====================================================================
# helpers
# =====================================================================


async def _existing_edge(
    db: AsyncSession,
    user_id: str,
    from_id: str,
    to_id: str,
    edge_type: str,
) -> bool:
    """Have we already written this exact edge?"""
    r = await db.execute(
        select(Edge.id).where(
            Edge.user_id == user_id,
            Edge.from_node_id == from_id,
            Edge.to_node_id == to_id,
            Edge.type == edge_type,
        )
    )
    return r.scalar_one_or_none() is not None


async def _write_edge(
    db: AsyncSession,
    user_id: str,
    from_id: str,
    to_id: str,
    edge_type: str,
    weight: float = 1.0,
    created_by: str = "ai",
) -> bool:
    """
    Write an edge to Postgres and mirror it to Neo4j.
    Returns True if created, False if it already existed.
    Never raises --- Neo4j failures are logged but the Postgres write
    still commits (the mirror can be backfilled later).
    """
    if edge_type not in EDGE_TYPES:
        print(f"[edges] refusing unknown edge type: {edge_type}")
        return False

    if await _existing_edge(db, user_id, from_id, to_id, edge_type):
        return False

    edge = Edge(
        id=str(uuid.uuid4()),
        user_id=user_id,
        from_node_id=from_id,
        to_node_id=to_id,
        type=edge_type,
        weight=weight,
        created_by=created_by,
    )
    db.add(edge)
    await db.commit()

    try:
        await create_graph_edge(
            user_id=user_id,
            from_id=from_id,
            to_id=to_id,
            edge_type=edge_type,
            weight=weight,
        )
    except Exception as e:  # noqa: BLE001
        print(f"[edges] Neo4j mirror failed for {edge_type} {from_id[:8]}-> {to_id[:8]}: {e}")

    return True


# =====================================================================
# the main pass: generate edges for one node
# =====================================================================


async def generate_edges_for_node(
    db: AsyncSession,
    user_id: str,
    node_id: str,
) -> int | None:
    """
    Propose and persist edges between `node_id` and its nearest older
    neighbors, using the LLM.

    Returns:
      int   --- number of edges created
      None  --- node has no embedding yet, retry next cycle
    """
    # 1. Load the node
    new_res = await db.execute(select(Node).where(Node.id == node_id))
    new_node = new_res.scalar_one_or_none()
    if new_node is None:
        return 0  # node gone --- nothing to do, safe to mark checked

    new_text = (
        f"{new_node.title or ''}\n{new_node.summary or ''}\n"
        f"{(new_node.content or '')[:1500]}"
    ).strip()
    if len(new_text) < 30:
        return 0  # too short to reason about

    # 2. Ensure the node has an embedding --- otherwise the neighbor
    #    query returns nothing and we'd be making up edges.
    emb_check = await db.execute(
        text("SELECT 1 FROM embeddings WHERE node_id = :nid LIMIT 1"),
        {"nid": node_id},
    )
    if emb_check.scalar() is None:
        print(f"[edges] skipped {node_id[:8]} --- no embedding yet")
        return None

    # 3. Find the top-K semantically nearest OLDER nodes.
    sql = text("""
        SELECT n.id, n.type, n.title, n.summary, n.content,
               1 - (e.embedding <=> (
                   SELECT embedding FROM embeddings WHERE node_id = :new_id
               )) AS score
        FROM embeddings e
        JOIN nodes n ON n.id = e.node_id
        WHERE e.user_id = :uid
          AND n.id != :new_id
          AND n.created_at < (SELECT created_at FROM nodes WHERE id = :new_id)
        ORDER BY e.embedding <=> (
            SELECT embedding FROM embeddings WHERE node_id = :new_id
        )
        LIMIT :k
    """)
    rows = (await db.execute(sql, {
        "uid": user_id,
        "new_id": node_id,
        "k": MAX_NEIGHBORS,
    })).mappings().all()

    neighbors = [
        {
            "id": str(r["id"]),
            "type": r["type"],
            "title": r["title"],
            "summary": r["summary"],
            "content": r["content"],
            "score": float(r["score"]) if r["score"] is not None else 0.0,
        }
        for r in rows
        if r["score"] is not None and float(r["score"]) >= MIN_NEIGHBOR_SIMILARITY
    ]

    if not neighbors:
        return 0  # nothing close enough --- no edges to make

    # 4. Ask the LLM.
    prompt = EDGE_USER_TEMPLATE.format(
        new_title=new_node.title or "(untitled)",
        new_summary=new_node.summary or "",
        new_content=(new_node.content or "")[:1500],
        max_idx=len(neighbors) - 1,
        neighbors_block=_format_neighbors(neighbors),
    )
    system = EDGE_SYSTEM.format(edge_types_block=_format_edge_types())

    try:
        result = await call_llm_json(
            prompt=prompt,
            system=system,
            temperature=0.2,
            max_tokens=1200,
        )
    except Exception as e:  # noqa: BLE001
        print(f"[edges] LLM failed for {node_id[:8]}: {e}")
        return 0  # don't retry on LLM failure --- the model is external

    # Defensive --- the LLM occasionally returns something other than
    # the specified shape. Treat that as "no edges proposed".
    if not isinstance(result, dict):
        return 0
    proposals = result.get("edges") or []
    if not isinstance(proposals, list):
        return 0

    created = 0

    for p in proposals:
        if not isinstance(p, dict):
            continue
        idx = p.get("to_index")
        etype = p.get("type")
        conf = p.get("confidence", 0)
        if not isinstance(idx, int) or idx < 0 or idx >= len(neighbors):
            continue
        if not isinstance(etype, str) or etype not in EDGE_TYPES:
            continue
        try:
            conf = float(conf)
        except (TypeError, ValueError):
            conf = 0.0
        if conf < 0.6:
            continue

        target = neighbors[idx]
        ok = await _write_edge(
            db,
            user_id=user_id,
            from_id=node_id,
            to_id=target["id"],
            edge_type=etype,
            weight=conf,
            created_by="ai",
        )
        if ok:
            created += 1
            print(f"[edges] +{etype} {node_id[:8]}-> {target['id'][:8]} (conf={conf:.2f})")

    return created


# =====================================================================
# implicit concept-to-concept edges (no LLM)
# =====================================================================


async def generate_implicit_concept_edges(
    db: AsyncSession,
    user_id: str,
) -> int:
    """
    Find pairs of concepts that co-occur in ???N thoughts and link them
    with :related_to. No LLM --- pure SQL co-occurrence. Cheap, fast,
    always accurate.

    Idempotent --- runs over the whole graph each time; the dedupe in
    _write_edge prevents duplicates.
    """
    sql = text("""
        SELECT
            e1.to_node_id AS a,
            e2.to_node_id AS b,
            count(*)     AS shared
        FROM edges e1
        JOIN edges e2
          ON e1.from_node_id = e2.from_node_id
         AND e1.to_node_id < e2.to_node_id
         AND e1.user_id = e2.user_id
        JOIN nodes na ON na.id = e1.to_node_id AND na.type = 'concept'
        JOIN nodes nb ON nb.id = e2.to_node_id AND nb.type = 'concept'
        WHERE e1.user_id = :uid
          AND e1.type = 'contains'
          AND e2.type = 'contains'
        GROUP BY e1.to_node_id, e2.to_node_id
        HAVING count(*) >= :min_shared
        ORDER BY count(*) DESC
        LIMIT 200
    """)
    rows = (await db.execute(sql, {
        "uid": user_id,
        "min_shared": IMPLICIT_MIN_SHARED_THOUGHTS,
    })).mappings().all()

    created = 0
    for r in rows:
        # Use related_to with weight proportional to shared count (capped)
        weight = min(1.0, 0.5 + 0.1 * (int(r["shared"]) - IMPLICIT_MIN_SHARED_THOUGHTS))
        ok = await _write_edge(
            db,
            user_id=user_id,
            from_id=str(r["a"]),
            to_id=str(r["b"]),
            edge_type="related_to",
            weight=weight,
            created_by="implicit",
        )
        if ok:
            created += 1

    print(f"[edges] implicit pass created {created} new concept-to-concept edges")
    return created


# =====================================================================
# entry points called by the worker
# =====================================================================


async def evaluate_node_edges(
    db: AsyncSession,
    user_id: str,
    node_id: str,
) -> int | None:
    """
    Wrapper: run generate_edges_for_node and swallow exceptions so a
    single bad node never breaks the worker. Returns None when the
    node should be retried (no embedding yet).
    """
    try:
        return await generate_edges_for_node(db, user_id, node_id)
    except Exception as e:  # noqa: BLE001
        print(f"[edges] evaluate_node_edges failed for {node_id[:8]}: {e}")
        return 0

# =====================================================================
# Tier 4 -- shared edge proposal helper
# =====================================================================
#
# `suggest_links` and `place_url` both need the same logic: given a
# target node, find its nearest concepts, ask the LLM which edges
# apply, and return a list of proposed changes. This helper returns
# the proposal without writing anything -- the caller decides what to
# do with it.


# The 7 edge types a concept-to-concept edge can take. `contains` is
# thought->concept only; we exclude it here.
CONCEPT_EDGE_TYPES: set[str] = {
    "refines", "contradicts", "expands",
    "exemplifies", "supports", "questions", "related_to",
}


EDGE_PROPOSAL_SYSTEM = """You are Cortex's edge-weaver.

You are given a NEW node and up to 5 EXISTING concepts that are
semantically close to it. For each pair, decide whether one of the 7
allowed edge types fits -- and if so, which one.

RULES:
1. Return valid JSON only. Never wrap it in markdown.
2. Only propose an edge when the relationship is GENUINE and SPECIFIC.
   Empty results are fine and common.
3. Use only the 7 edge types listed below.
4. Direction matters:
     - refines / expands / exemplifies / supports / questions / contradicts
       go FROM the new node TO the older node
     - related_to is bidirectional
5. Never propose an edge to a node about a different topic. "Similar"
   does not mean "related".
6. Confidence: 0.0-1.0. Only emit edges with confidence >= 0.6.

ALLOWED EDGE TYPES:
  - refines:      new adds precision, nuance, or specificity to the old
  - contradicts:  new reverses or meaningfully disagrees with the old
  - expands:      new broadens the old idea into a larger frame
  - exemplifies:  new is a concrete instance of the old idea
  - supports:     new provides evidence or a reason for the old claim
  - questions:    new raises a doubt or open problem about the old
  - related_to:   generic semantic link, no strong direction

RESPONSE SHAPE (exactly):
{
  "edges": [
    {
      "to_index": 0,
      "type": "refines",
      "confidence": 0.85,
      "why": "one short sentence"
    }
  ]
}
"""


EDGE_PROPOSAL_USER = """NEW node (index = -1):
Title: {new_title}
Summary: {new_summary}
Content: {new_content}

EXISTING concepts (indices 0..{max_idx}):
{neighbors_block}

Propose edges as specified.
"""


def _format_propose_neighbors(neighbors: list[dict]) -> str:
    lines = []
    for i, n in enumerate(neighbors):
        title = (n.get("title") or "")[:100] or "(untitled)"
        summary = (n.get("summary") or "")[:200]
        content = (n.get("content") or "")[:300]
        body = summary or content
        lines.append(f"[{i}] {title}")
        if body:
            lines.append(f"    {body}")
        lines.append("")
    return "\n".join(lines).strip()


async def find_neighbors_for_proposal(
    db: AsyncSession,
    user_id: str,
    target_id: str,
    *,
    k: int = 5,
    floor: float = 0.70,
) -> list[dict]:
    """
    Return up to k concepts nearest to `target_id` by embedding cosine
    similarity, filtered to those above `floor`. Excludes nodes already
    connected to the target.
    """
    sql = text("""
        SELECT n.id, n.title, n.summary, n.content,
               1 - (e.embedding <=> (
                   SELECT embedding FROM embeddings WHERE node_id = :tid
               )) AS score
        FROM embeddings e
        JOIN nodes n ON n.id = e.node_id
        WHERE e.user_id = :uid
          AND n.id != :tid
          AND n.type = 'concept'
          AND n.canonical_concept_id IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM edges ee
              WHERE (ee.from_node_id = :tid AND ee.to_node_id = n.id)
                 OR (ee.to_node_id = :tid AND ee.from_node_id = n.id)
          )
        ORDER BY e.embedding <=> (
            SELECT embedding FROM embeddings WHERE node_id = :tid
        )
        LIMIT :k
    """)
    rows = (await db.execute(sql, {
        "uid": user_id,
        "tid": target_id,
        "k": k,
    })).mappings().all()

    out: list[dict] = []
    for r in rows:
        score = float(r["score"]) if r["score"] is not None else 0.0
        if score >= floor:
            out.append({
                "id": str(r["id"]),
                "title": r["title"],
                "summary": r["summary"],
                "content": r["content"],
                "score": score,
            })
    return out


async def propose_edges_for_node(
    db: AsyncSession,
    user_id: str,
    target: dict,
    *,
    max_candidates: int = 5,
    similarity_floor: float = 0.70,
    min_confidence: float = 0.60,
) -> list[dict]:
    """
    Run the LLM pass for one target node. Returns a list of proposals
    shaped as:
      {
        "from_id": str,
        "from_title": str,
        "to_id": str,
        "to_title": str,
        "type": str,
        "weight": float,
        "why": str,
      }
    Never writes. Never raises -- returns [] on any failure.
    """
    from app.services.ai import call_llm_json

    target_id = str(target["id"])
    neighbors = await find_neighbors_for_proposal(
        db, user_id, target_id,
        k=max_candidates, floor=similarity_floor,
    )
    if not neighbors:
        return []

    prompt = EDGE_PROPOSAL_USER.format(
        new_title=(target.get("title") or "(untitled)")[:200],
        new_summary=(target.get("summary") or "")[:400],
        new_content=(target.get("content") or "")[:800],
        max_idx=len(neighbors) - 1,
        neighbors_block=_format_propose_neighbors(neighbors),
    )

    try:
        result = await call_llm_json(
            prompt=prompt,
            system=EDGE_PROPOSAL_SYSTEM,
            temperature=0.2,
            max_tokens=1200,
        )
    except Exception as e:  # noqa: BLE001
        print(f"[edges] propose_edges_for_node LLM failed for {target_id[:8]}: {e}")
        return []

    if not isinstance(result, dict):
        return []
    proposals = result.get("edges") or []
    if not isinstance(proposals, list):
        return []

    from_title = target.get("title") or "(untitled)"
    out: list[dict] = []
    seen: set[tuple[str, str, str]] = set()

    for p in proposals:
        if not isinstance(p, dict):
            continue
        idx = p.get("to_index")
        etype = p.get("type")
        conf = p.get("confidence", 0)
        why = p.get("why", "")

        if not isinstance(idx, int) or idx < 0 or idx >= len(neighbors):
            continue
        if not isinstance(etype, str) or etype not in CONCEPT_EDGE_TYPES:
            continue
        try:
            conf_f = float(conf)
        except (TypeError, ValueError):
            continue

        # related_to gets a higher bar -- it is the catch-all type
        effective_floor = (
            min_confidence + 0.10 if etype == "related_to" else min_confidence
        )
        if conf_f < effective_floor:
            continue

        nb = neighbors[idx]
        # Dedupe bidirectional (a,b) pairs by canonical unordered key
        a, b = sorted([target_id, nb["id"]])
        key = (a, b, etype)
        if key in seen:
            continue
        seen.add(key)

        out.append({
            "from_id": target_id,
            "from_title": from_title,
            "to_id": nb["id"],
            "to_title": nb.get("title") or "(untitled)",
            "type": etype,
            "weight": conf_f,
            "why": str(why)[:240],
        })

    return out
