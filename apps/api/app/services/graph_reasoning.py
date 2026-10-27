"""
Graph-native reasoning --- multi-hop chat.

Today's chat finds nodes by keyword and feeds a flat list to the LLM.
That works, but the LLM can't tell that "capture A contradicts capture B"
or that "concept X refines concept Y" --- it just sees N unrelated blocks
of text.

This module walks the graph from a seed node, collects the connected
subgraph (nodes + the edges between them), and hands the LLM a structured
picture of how the user's thinking fits together.

Pipeline
--------
1. find_seed_nodes(question)  ??' top-K nodes by embedding similarity
2. walk_subgraph(seed)        ??' BFS-like traversal, hops=2, max_nodes=30
3. build_subgraph_context()   ??' text block with edges rendered inline
4. reason_with_subgraph()     ??' LLM call, same locale handling as chat

Fallback contract
-----------------
If the walk yields fewer than MIN_NODES_FOR_REASONING nodes, the caller
should fall back to the existing flat RAG path. A sparse graph doesn't
make for a good multi-hop answer.
"""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.i18n import DEFAULT_LOCALE, tr
from app.services.ai import call_llm
from app.services.canonicalization import resolve_canonical_id
from app.services.agents import (
    AgentSpec,
    apply_agent_to_system,
    filter_subgraph_for_agent,
    get_agent,
)


# ---- tuning ----
DEFAULT_HOPS = 2
DEFAULT_MAX_NODES = 15          # was 30 --- cuts LLM prompt ~50%
DEFAULT_SEED_K = 3
MIN_NODES_FOR_REASONING = 4

# How many `related_to` edges we're willing to follow out of any single
# node per hop. Semantic edges (refines/contradicts/supports/expands/
# exemplifies/questions) are unrestricted --- they're always strong signal.
RELATED_TO_FANOUT = 1       # was 2 --- reduces subgraph sprawl, boosts precision

# Edge types that are "strong" --- always follow them if we can.
STRONG_EDGE_TYPES = {
    "refines", "contradicts", "expands",
    "exemplifies", "supports", "questions",
}

# Walked edges are ordered: strong edges first so they're never dropped
# if we hit the node cap.
EDGE_PRIORITY = {
    "contradicts": 0,
    "refines": 1,
    "supports": 2,
    "expands": 3,
    "exemplifies": 4,
    "questions": 5,
    "related_to": 6,
    "contains": 7,   # follow once, then don't chain further
}


# =====================================================================
# 1. seed selection --- where does the walk start?
# =====================================================================


async def find_seed_nodes(
    db: AsyncSession,
    user_id: str,
    question: str,
    k: int = DEFAULT_SEED_K,
) -> list[dict]:
    """
    Return the top-K nodes whose embedding is closest to the question.

    Uses pgvector's `<=>` cosine distance --- same operator the memory
    search uses. Returns [] if the user has no embeddings yet.
    """
    from app.services.embeddings import embed_one

    try:
        vec = await embed_one(question)
    except Exception as e:  # noqa: BLE001
        print(f"[graph_reasoning] embed failed: {e}")
        return []

    sql = text("""
        SELECT n.id, n.type, n.title, n.summary, n.content,
               1 - (e.embedding <=> :qvec) AS score
        FROM embeddings e
        JOIN nodes n ON n.id = e.node_id
        WHERE e.user_id = :uid
        ORDER BY e.embedding <=> :qvec
        LIMIT :k
    """)

    rows = (await db.execute(sql, {
        "qvec": vec,
        "uid": user_id,
        "k": k,
    })).mappings().all()

    seeds = [
        {
            "id": str(r["id"]),
            "type": r["type"],
            "title": r["title"],
            "summary": r["summary"],
            "content": r["content"],
            "score": float(r["score"]) if r["score"] is not None else 0.0,
        }
        for r in rows
    ]

    # No score-threshold gate. Voyage cosine cannot separate on-topic
    # from off-topic in this graph --- the fallback questions score 0.72-0.76,
    # squarely inside the on-topic band (see eval run 2026-10-05). The walk
    # is bounded and the prompt already instructs the LLM to decline when
    # the subgraph doesn't cover the question. Remove the gate; let the
    # LLM's own honesty be the fallback signal.
    if not seeds:
        return []

    print(f"[graph_reasoning] top seed score: {seeds[0]['score']:.3f}")
    return seeds


# =====================================================================
# 2. subgraph walk --- the multi-hop traversal
# =====================================================================


async def _neighbors_of(
    db: AsyncSession,
    user_id: str,
    node_id: str,
    direction: str = "both",
) -> list[dict]:
    """
    Return every edge touching `node_id`. Each row has:
      neighbor_id, neighbor_type, neighbor_title, neighbor_summary,
      neighbor_content, edge_type, direction ("out" | "in"), weight
    """
    if direction == "out":
        sql = text("""
            SELECT
                n.id AS neighbor_id, n.type AS neighbor_type,
                n.title AS neighbor_title, n.summary AS neighbor_summary,
                n.content AS neighbor_content,
                e.type AS edge_type, 'out' AS direction, e.weight AS weight
            FROM edges e
            JOIN nodes n ON n.id = e.to_node_id
            WHERE e.user_id = :uid AND e.from_node_id = :nid
        """)
    elif direction == "in":
        sql = text("""
            SELECT
                n.id AS neighbor_id, n.type AS neighbor_type,
                n.title AS neighbor_title, n.summary AS neighbor_summary,
                n.content AS neighbor_content,
                e.type AS edge_type, 'in' AS direction, e.weight AS weight
            FROM edges e
            JOIN nodes n ON n.id = e.from_node_id
            WHERE e.user_id = :uid AND e.to_node_id = :nid
        """)
    else:
        sql = text("""
            SELECT * FROM (
                SELECT
                    n.id AS neighbor_id, n.type AS neighbor_type,
                    n.title AS neighbor_title, n.summary AS neighbor_summary,
                    n.content AS neighbor_content,
                    e.type AS edge_type, 'out' AS direction, e.weight AS weight
                FROM edges e
                JOIN nodes n ON n.id = e.to_node_id
                WHERE e.user_id = :uid AND e.from_node_id = :nid
                UNION ALL
                SELECT
                    n.id AS neighbor_id, n.type AS neighbor_type,
                    n.title AS neighbor_title, n.summary AS neighbor_summary,
                    n.content AS neighbor_content,
                    e.type AS edge_type, 'in' AS direction, e.weight AS weight
                FROM edges e
                JOIN nodes n ON n.id = e.from_node_id
                WHERE e.user_id = :uid AND e.to_node_id = :nid
            ) AS all_edges
        """)

    rows = (await db.execute(sql, {"uid": user_id, "nid": node_id})).mappings().all()

    return [
        {
            "neighbor_id": str(r["neighbor_id"]),
            "neighbor_type": r["neighbor_type"],
            "neighbor_title": r["neighbor_title"],
            "neighbor_summary": r["neighbor_summary"],
            "neighbor_content": r["neighbor_content"],
            "edge_type": r["edge_type"],
            "direction": r["direction"],
            "weight": float(r["weight"]) if r["weight"] is not None else 1.0,
        }
        for r in rows
    ]


def _rank_neighbors(neighbors: list[dict]) -> list[dict]:
    """
    Sort neighbors so strong edges come first, and within a node's
    out-edges cap `related_to` to RELATED_TO_FANOUT.
    """
    strong = [n for n in neighbors if n["edge_type"] in STRONG_EDGE_TYPES]
    related = [n for n in neighbors if n["edge_type"] == "related_to"]
    contains = [n for n in neighbors if n["edge_type"] == "contains"]

    strong.sort(key=lambda n: (EDGE_PRIORITY.get(n["edge_type"], 99), -n["weight"]))
    related.sort(key=lambda n: -n["weight"])
    contains.sort(key=lambda n: -n["weight"])

    return strong + related[:RELATED_TO_FANOUT] + contains


async def walk_subgraph(
    db: AsyncSession,
    user_id: str,
    seed_ids: list[str],
    hops: int = DEFAULT_HOPS,
    max_nodes: int = DEFAULT_MAX_NODES,
) -> dict:
    """
    BFS from the seeds up to `hops` levels, collecting nodes and edges.

    Returns:
      {
        "nodes": [ { id, type, title, summary, content, depth, is_seed } ],
        "edges": [ { from_id, to_id, type, weight } ]
      }
    """
    visited_nodes: dict[str, dict] = {}
    visited_edges: set[tuple[str, str, str]] = set()
    edges_out: list[dict] = []

    # Resolve every seed to its canonical concept (if it's an alias)
    resolved_seeds = []
    for sid in seed_ids:
        try:
            resolved_seeds.append(await resolve_canonical_id(db, sid))
        except Exception:  # noqa: BLE001
            resolved_seeds.append(sid)
    seed_ids = resolved_seeds

    frontier = list(seed_ids)
    depth = 0

    while frontier and depth <= hops and len(visited_nodes) < max_nodes:
        next_frontier: list[str] = []

        for node_id in frontier:
            if len(visited_nodes) >= max_nodes:
                break
            if node_id in visited_nodes:
                continue

            # Fetch node row
            node_row = (await db.execute(
                text("""
                    SELECT id, type, title, summary, content
                    FROM nodes WHERE id = :nid AND user_id = :uid
                """),
                {"nid": node_id, "uid": user_id},
            )).mappings().first()

            if node_row is None:
                continue

            visited_nodes[node_id] = {
                "id": str(node_row["id"]),
                "type": node_row["type"],
                "title": node_row["title"],
                "summary": node_row["summary"],
                "content": node_row["content"],
                "depth": depth,
                "is_seed": node_id in seed_ids,
            }

            # Fetch + rank neighbors
            neighbors = await _neighbors_of(db, user_id, node_id)
            ranked = _rank_neighbors(neighbors)

            for nb in ranked:
                nb_id = nb["neighbor_id"]
                etype = nb["edge_type"]

                # Resolve aliases so we don't traverse the same concept
                # under different UUIDs
                try:
                    nb_id = await resolve_canonical_id(db, nb_id)
                except Exception:  # noqa: BLE001
                    pass

                # Canonical edge key --- direction doesn't matter for dedupe
                if nb["direction"] == "out":
                    from_id, to_id = node_id, nb_id
                else:
                    from_id, to_id = nb_id, node_id
                key = (from_id, to_id, etype)
                if key in visited_edges:
                    continue
                visited_edges.add(key)

                edges_out.append({
                    "from_id": from_id,
                    "to_id": to_id,
                    "type": etype,
                    "weight": nb["weight"],
                })

                if nb_id not in visited_nodes and len(visited_nodes) < max_nodes:
                    next_frontier.append(nb_id)

        frontier = next_frontier
        depth += 1

    return {
        "nodes": list(visited_nodes.values()),
        "edges": edges_out,
    }


# =====================================================================
# 3. context rendering
# =====================================================================


def _short_label(node: dict) -> str:
    t = (node.get("title") or "").strip()
    if t:
        return t[:80]
    s = (node.get("summary") or "").strip()
    if s:
        return s[:80]
    c = (node.get("content") or "").strip()
    if c:
        return c[:80]
    return "(untitled)"


def build_subgraph_context(
    subgraph: dict,
    locale: str = DEFAULT_LOCALE,
) -> str:
    """
    Render the subgraph as a text block the LLM can reason over.

    Format:
      NODES
        [n1] type  "title"
             Summary: ...
             Content: ...
        [n2] ...

      RELATIONSHIPS
        [n1] --refines--> [n2]
        [n3] --contradicts--> [n1]
    """
    nodes = subgraph.get("nodes") or []
    edges = subgraph.get("edges") or []

    if not nodes:
        return ""

    # Build id ??' short label mapping for edge rendering
    id_to_index = {n["id"]: i for i, n in enumerate(nodes)}
    id_to_label = {n["id"]: _short_label(n) for n in nodes}

    lines: list[str] = ["NODES"]
    for i, n in enumerate(nodes):
        seed_mark = " [SEED]" if n.get("is_seed") else ""
        lines.append(f'  [n{i}] {n["type"]}{seed_mark}: "{_short_label(n)}"')
        summary = (n.get("summary") or "").strip()
        content = (n.get("content") or "").strip()
        if summary:
            lines.append(f"        Summary: {summary[:200]}")
        if content and content != summary:
            lines.append(f"        Content: {content[:200]}")

    if edges:
        lines.append("")
        lines.append("RELATIONSHIPS")
        for e in edges:
            fi = id_to_index.get(e["from_id"])
            ti = id_to_index.get(e["to_id"])
            if fi is None or ti is None:
                continue
            lines.append(f'  [n{fi}] --{e["type"]}--> [n{ti}]')

    return "\n".join(lines)


# =====================================================================
# 4. the LLM call
# =====================================================================


GRAPH_SYSTEM = """You are Cortex, the user's external mind --- now reasoning over a connected subgraph of their own captured knowledge.

The user's thinking has been organized into a small network of NODES
connected by typed RELATIONSHIPS. Your job is to reason *over the
structure* of that network, not just its individual pieces.

NODE TYPES
  thought     --- a raw capture the user wrote
  concept     --- an extracted idea or topic
  decision    --- a choice the user committed to
  reflection  --- a synthesized insight

RELATIONSHIP TYPES
  refines      --- the source sharpens or narrows the target
  contradicts  --- the source reverses or negates the target
  expands      --- the source broadens the target into a larger frame
  exemplifies  --- the source is a concrete instance of the target
  supports     --- the source provides evidence for the target
  questions    --- the source raises a doubt about the target
  related_to   --- a generic semantic link (no strong direction)
  contains     --- the source (a thought) is where the target (a concept) came from

RULES
1. Ground your answer in the subgraph. Cite nodes by [nX] --- e.g. [n0], [n3].
2. When a relationship matters to your answer, say so explicitly:
   "...which contradicts what you wrote in [n2]" or
   "...and [n1] refines that into a narrower claim".
3. If the subgraph doesn't actually cover the question, say so briefly,
   then answer from general knowledge --- mark it clearly.
4. Never invent facts or edges. Only use what's in the subgraph.
5. Be warm, concise. Short paragraphs. Bold key terms.
6. If you notice a contradiction or a refinement chain, highlight it ---
   the user often doesn't see these in their own writing.
7. CROSS-CONVERSATION RECALL
   If a system message beginning with "Relevant context from earlier
   conversations and captured notes" appears in your context, it comes
   from the user's own past -- messages from other chats and captures
   they made earlier. Treat it as legitimate background. Draw on it
   whenever it sharpens your answer, and feel free to note that you
   remember the earlier exchange ("you mentioned before that...").
   Do not quote this block directly or refer to it as "recall".
"""


def _build_prompt(subgraph_context: str, question: str) -> str:
    return f"""Subgraph of the user's knowledge:

{subgraph_context}

---

The user asks:
{question}

Instructions:
- Reason over the subgraph above. Cite nodes as [nX].
- If relationships matter, reference them explicitly.
- If the subgraph doesn't cover the question, say so and fall back to
  general knowledge --- clearly marked.
"""


async def reason_with_subgraph(
    db: AsyncSession,
    user_id: str,
    question: str,
    locale: str = DEFAULT_LOCALE,
    hops: int = DEFAULT_HOPS,
    max_nodes: int = DEFAULT_MAX_NODES,
    history: list[dict] | None = None,
) -> dict | None:
    """
    Try graph-native reasoning. Returns a chat-shaped dict:
      { reply, sources, nodes_used, mode: "graph" }
    or None if the subgraph is too thin --- caller should fall back.
    """
    seeds = await find_seed_nodes(db, user_id, question, k=DEFAULT_SEED_K)
    if not seeds:
        return None

    seed_ids = [s["id"] for s in seeds]
    subgraph = await walk_subgraph(db, user_id, seed_ids, hops=hops, max_nodes=max_nodes)

    if len(subgraph["nodes"]) < MIN_NODES_FOR_REASONING:
        return None

    context = build_subgraph_context(subgraph, locale)
    if not context:
        return None

    prompt = _build_prompt(context, question)
    print(
        f"[graph_reasoning] walk: {len(subgraph['nodes'])} nodes, "
        f"{len(subgraph['edges'])} edges, prompt={len(prompt)} chars",
        flush=True,
    )

    try:
        reply = await call_llm(
            prompt=prompt,
            system=GRAPH_SYSTEM,
            temperature=0.5,
            max_tokens=2200,
            locale=locale,
            history=history,
        )
    except Exception as e:  # noqa: BLE001
        # Do NOT return None here. The caller treats None as "walk was
        # empty, fall back to flat". An LLM error is a different thing ---
        # rate limit, network, auth. Re-raise so it surfaces as an error
        # rather than silently masquerading as a legitimate fallback.
        print(f"[graph_reasoning] LLM call failed: {e}")
        raise

    # Sources: every node that appeared in the subgraph
    sources = [
        {
            "id": n["id"],
            "type": n["type"],
            "title": n["title"],
            "depth": n.get("depth", 0),
            "is_seed": n.get("is_seed", False),
        }
        for n in subgraph["nodes"]
    ]

    # Decline detection: the prompt tells the LLM to say so when the
    # subgraph doesn't cover the question, then answer from general
    # knowledge. There's no fixed wording for that decline, but there IS
    # a reliable structural signal: if the reply cites zero nodes, the
    # LLM decided the subgraph was irrelevant. Mark it so the eval can
    # count honest declines separately from real graph answers.
    import re as _re
    has_citation = bool(_re.search(r"\[n\d+\]", reply))
    mode = "graph" if has_citation else "graph_declined"

    return {
        "reply": reply.strip(),
        "sources": sources,
        "nodes_used": len(subgraph["nodes"]),
        "mode": mode,
        "edge_count": len(subgraph["edges"]),
    }

# =====================================================================
# 5. streaming variant --- yields tokens as the LLM produces them
# =====================================================================


async def stream_reason_with_subgraph(
    db: AsyncSession,
    user_id: str,
    question: str,
    locale: str = DEFAULT_LOCALE,
    hops: int = DEFAULT_HOPS,
    max_nodes: int = DEFAULT_MAX_NODES,
    history: list[dict] | None = None,
    agent: str | None = None,
):
    """
    Async generator. Yields:
      { "type": "meta",  "mode": "graph"|"flat"|"error",
        "sources": [...], "nodes_used": N }
      { "type": "token", "text": "..." }
      { "type": "done" }
      { "type": "error", "message": "..." }
    """
    from typing import AsyncIterator
    from app.services.ai import stream_llm

    # --- Resolve the agent (if any) ---
    spec: AgentSpec | None = None
    if agent:
        spec = get_agent(agent)
        if spec is None:
            # Unknown agent name --- treat as no agent rather than erroring,
            # so a stale client doesn't break chat. Log it for debugging.
            print(f"[graph_reasoning] unknown agent '{agent}' --- ignoring")

    # --- Try the graph path ---
    try:
        seeds = await find_seed_nodes(db, user_id, question, k=DEFAULT_SEED_K)
    except Exception as e:  # noqa: BLE001
        print(f"[graph_reasoning] seed lookup failed: {e}")
        seeds = []

    if seeds:
        import time as _t
        _tt = [_t.monotonic()]
        def _lap(l):
            _n = _t.monotonic()
            print(f"[graph_reasoning] {l}: {(_n-_tt[0])*1000:.0f}ms", flush=True)
            _tt[0] = _n

        _lap("seeds found")
        try:
            seed_ids = [s["id"] for s in seeds]
            subgraph = await walk_subgraph(
                db, user_id, seed_ids, hops=hops, max_nodes=max_nodes
            )
        except Exception as e:  # noqa: BLE001
            print(f"[graph_reasoning] walk failed: {e}")
            subgraph = {"nodes": [], "edges": []}
        _lap("walk done")

        # Agent lens: tighten the subgraph to the edges this agent cares about.
        # Connector raises NotImplementedError here --- caught below and turned
        # into an error frame so the client shows an honest message.
        if spec is not None:
            try:
                subgraph = filter_subgraph_for_agent(subgraph, spec)
                _lap(f"agent '{spec.name}' filtered")
            except NotImplementedError as e:
                yield {"type": "meta", "mode": "error", "sources": [], "nodes_used": 0,
                       "agent": spec.name}
                yield {"type": "error", "message": str(e)}
                yield {"type": "done"}
                return

        if len(subgraph["nodes"]) >= MIN_NODES_FOR_REASONING:
            context = build_subgraph_context(subgraph, locale)
            if context:
                prompt = _build_prompt(context, question)
                _lap("prompt built")

                sources = [
                    {
                        "id": n["id"],
                        "type": n["type"],
                        "title": n["title"],
                        "depth": n.get("depth", 0),
                        "is_seed": n.get("is_seed", False),
                    }
                    for n in subgraph["nodes"]
                ]

                # Build id -> index map so edges can be expressed as
                # (from_index, to_index) matching [nX] citations.
                id_to_index = {n["id"]: i for i, n in enumerate(subgraph["nodes"])}
                edges_payload: list[dict] = []
                for e in subgraph["edges"]:
                    from_id = e.get("from_id")
                    to_id = e.get("to_id")
                    if from_id not in id_to_index or to_id not in id_to_index:
                        continue  # edge references a node outside the walked set
                    edges_payload.append({
                        "from": id_to_index[from_id],
                        "to": id_to_index[to_id],
                        "type": e.get("type", "related_to"),
                    })

                yield {
                    "type": "meta",
                    "mode": "graph",
                    "sources": sources,
                    "edges": edges_payload,
                    "nodes_used": len(subgraph["nodes"]),
                    "edge_count": len(subgraph["edges"]),
                    "agent": spec.name if spec else None,
                }

                try:
                    effective_system = apply_agent_to_system(GRAPH_SYSTEM, spec)
                    effective_temp = spec.temperature if spec else 0.5
                    effective_max = spec.max_tokens if spec else 2200
                    async for chunk in stream_llm(
                        prompt=prompt,
                        system=effective_system,
                        temperature=effective_temp,
                        max_tokens=effective_max,
                        locale=locale,
                        history=history,
                    ):
                        _lap("first LLM token")
                        yield {"type": "token", "text": chunk}
                except Exception as e:  # noqa: BLE001
                    yield {"type": "error", "message": f"LLM stream failed: {e}"}

                yield {"type": "done"}
                return

    # --- Fallback: flat keyword RAG, streamed the same way ---
    from app.services.chat import (
        find_relevant_nodes as flat_find_relevant_nodes,
        build_context as flat_build_context,
        CHAT_SYSTEM as FLAT_SYSTEM,
    )

    nodes = await flat_find_relevant_nodes(db, user_id, question, limit=8)
    context, _ = flat_build_context(nodes, locale)

    prompt = f"""{context}

---

The user asks:
{question}

Instructions:
- If the user's captured knowledge above is relevant to their question, answer using it and cite specific titles in [brackets].
- If the knowledge above is NOT relevant, briefly say so, then answer from your general knowledge. Clearly mark any general-knowledge content.
- Be concise. Use short paragraphs. Bold key terms when helpful.
"""

    sources = [
        {"id": n.id, "type": n.type, "title": n.title, "depth": 0, "is_seed": False}
        for n in nodes
    ]
    yield {
        "type": "meta",
        "mode": "flat",
        "sources": sources,
        "nodes_used": len(nodes),
    }

    try:
        async for chunk in stream_llm(
            prompt=prompt,
            system=FLAT_SYSTEM,
            temperature=0.6,
            max_tokens=2000,
            locale=locale,
            history=history,
        ):
            yield {"type": "token", "text": chunk}
    except Exception as e:  # noqa: BLE001
        yield {"type": "error", "message": f"LLM stream failed: {e}"}

    yield {"type": "done"}


# =====================================================================
# Tier 4 -- tool-aware streaming wrapper
#
# Streams the same frame shapes as stream_reason_with_subgraph, plus
# optional {"type": "proposal", "data": {...}} frames when the LLM
# invokes an agent as a tool.
#
# Zero behavior change when agent_enabled is off or when the LLM never
# calls a tool -- it falls straight through to the existing path.
# =====================================================================


async def stream_reason_with_tools(
    db: AsyncSession,
    user_id: str,
    question: str,
    locale: str = DEFAULT_LOCALE,
    hops: int = DEFAULT_HOPS,
    max_nodes: int = DEFAULT_MAX_NODES,
    history: list[dict] | None = None,
    agent: str | None = None,
):
    """
    Tool-aware wrapper around stream_reason_with_subgraph.

    Identical frame shapes plus:
      { "type": "proposal", "data": {...} }

    The proposal frame is emitted whenever the LLM invokes an agent.
    Frontends may render it inline; older clients ignore it.
    """
    from app.config.settings import get_settings

    s = get_settings()
    if not s.agent_enabled:
        async for frame in stream_reason_with_subgraph(
            db, user_id, question,
            locale=locale, hops=hops, max_nodes=max_nodes,
            history=history, agent=agent,
        ):
            yield frame
        return

    # Try to import the tool surface
    try:
        from app.services.actions import tools_schema
        from app.services.actions.tool_runner import (
            run_tool_call,
            tool_result_message,
        )
        from app.services.ai import stream_llm_with_tools
    except Exception as e:  # noqa: BLE001
        print(f"[graph_reasoning] tool imports failed, falling back: {e}")
        async for frame in stream_reason_with_subgraph(
            db, user_id, question,
            locale=locale, hops=hops, max_nodes=max_nodes,
            history=history, agent=agent,
        ):
            yield frame
        return

    tool_list = tools_schema()
    if not tool_list:
        async for frame in stream_reason_with_subgraph(
            db, user_id, question,
            locale=locale, hops=hops, max_nodes=max_nodes,
            history=history, agent=agent,
        ):
            yield frame
        return

    # ---- Step 1: build the subgraph context (same as the non-tool path) ----
    try:
        seeds = await find_seed_nodes(db, user_id, question, k=DEFAULT_SEED_K)
    except Exception as e:  # noqa: BLE001
        print(f"[graph_reasoning] seed lookup failed: {e}")
        seeds = []

    subgraph = {"nodes": [], "edges": []}
    context = ""
    sources: list[dict] = []
    mode = "flat"

    if seeds:
        try:
            seed_ids = [s["id"] for s in seeds]
            subgraph = await walk_subgraph(
                db, user_id, seed_ids, hops=hops, max_nodes=max_nodes
            )
        except Exception as e:  # noqa: BLE001
            print(f"[graph_reasoning] walk failed: {e}")
            subgraph = {"nodes": [], "edges": []}

    if len(subgraph["nodes"]) >= MIN_NODES_FOR_REASONING:
        context = build_subgraph_context(subgraph, locale)
        if context:
            mode = "graph"
            sources = [
                {
                    "id": n["id"],
                    "type": n["type"],
                    "title": n["title"],
                    "depth": n.get("depth", 0),
                    "is_seed": n.get("is_seed", False),
                }
                for n in subgraph["nodes"]
            ]

    # Fall back to flat context if the graph is too thin
    if mode != "graph":
        try:
            from app.services.chat import (
                find_relevant_nodes as flat_find_relevant_nodes,
                build_context as flat_build_context,
            )
            nodes = await flat_find_relevant_nodes(db, user_id, question, limit=8)
            flat_ctx, _ = flat_build_context(nodes, locale)
            context = flat_ctx
            sources = [
                {"id": n.id, "type": n.type, "title": n.title, "depth": 0, "is_seed": False}
                for n in nodes
            ]
            mode = "flat"
        except Exception as e:  # noqa: BLE001
            print(f"[graph_reasoning] flat context failed: {e}")

    # ---- Step 2: yield the meta frame ----
    yield {
        "type": "meta",
        "mode": mode,
        "sources": sources,
        "nodes_used": len(sources),
        "agent": agent,
    }

    # ---- Step 3: build the prompt ----
    if mode == "graph":
        base_prompt = _build_prompt(context, question)
        base_system = GRAPH_SYSTEM
        base_temp = 0.5
    else:
        base_prompt = (
            f"{context}\n\n---\n\nThe user asks:\n{question}\n\n"
            "Instructions:\n"
            "- If the user's captured knowledge above is relevant, answer "
            "using it and cite specific titles in [brackets].\n"
            "- If the knowledge above is NOT relevant, briefly say so, "
            "then answer from general knowledge. Clearly mark any "
            "general-knowledge content.\n"
            "- Be concise. Use short paragraphs. Bold key terms when helpful.\n"
        )
        base_system = (
            "You are Cortex, the user's external mind. You can also "
            "perform actions on the user's knowledge graph when they "
            "ask. Use the provided tools when the request is about "
            "finding, organizing, or linking things in the graph."
        )
        base_temp = 0.6

    # Strengthen tool-use directive regardless of graph/flat mode.
    # Without this, the LLM prefers to reason from the visible subgraph
    # and never calls the tool -- which means the user never gets an
    # actionable proposal they can review.
    tool_directive = (
        "\n\nTOOLS:\n"
        "You have tools that can query or modify the user's knowledge "
        "graph. When the user's request is about graph structure, "
        "organization, or finding specific nodes (for example: 'find "
        "orphans', 'any disconnected concepts', 'organize my captures'), "
        "call the appropriate tool rather than reasoning from the visible "
        "subgraph. The visible subgraph is only a small window -- the tool "
        "sees the whole graph. Prefer the tool when the user is asking a "
        "graph-wide question."
    )
    base_system = base_system + tool_directive

    # ---- Step 4: tool loop ----
    max_calls = max(1, int(s.agent_max_tool_calls))
    convo_history: list[dict] = list(history or [])

    for iteration in range(max_calls + 1):
        # Decide whether to still allow tools on this iteration
        allow_tools = iteration < max_calls
        this_tools = tool_list if allow_tools else None

        pending_tool: dict | None = None

        try:
            async for ev in stream_llm_with_tools(
                prompt=base_prompt,
                system=base_system,
                temperature=base_temp,
                max_tokens=2200,
                locale=locale,
                history=convo_history,
                tools=this_tools,
            ):
                if ev["type"] == "token":
                    yield {"type": "token", "text": ev["text"]}
                elif ev["type"] == "tool_call":
                    pending_tool = ev
                elif ev["type"] == "done":
                    pass
        except Exception as e:  # noqa: BLE001
            yield {"type": "error", "message": f"LLM stream failed: {e}"}
            yield {"type": "done"}
            return

        # If no tool was called, we're finished.
        if pending_tool is None:
            yield {"type": "done"}
            return

        # Execute the tool call via the runner.
        try:
            result = await run_tool_call(
                db, user_id, pending_tool["name"], pending_tool.get("args") or {}
            )
        except Exception as e:  # noqa: BLE001
            result = {
                "name": pending_tool["name"],
                "status": "failed",
                "summary": f"Tool error: {e}",
                "error": str(e),
            }

        # Emit a proposal frame so the UI can render inline.
        yield {
            "type": "proposal",
            "data": {
                "name": result.get("name"),
                "action_id": result.get("action_id"),
                "status": result.get("status"),
                "summary": result.get("summary"),
                "proposal": result.get("proposal"),
                "auto_applied": result.get("auto_applied", False),
            },
        }

        # Feed the tool result back into the conversation and loop.
        convo_history = convo_history + [
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": pending_tool["id"],
                        "type": "function",
                        "function": {
                            "name": pending_tool["name"],
                            "arguments": "{}",
                        },
                    }
                ],
            },
            tool_result_message(
                pending_tool["id"],
                pending_tool["name"],
                result,
            ),
        ]

        # Reset the prompt -- the tool result is now the fresh input
        base_prompt = "Based on the tool result above, tell the user what you found."
