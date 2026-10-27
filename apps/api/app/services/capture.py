import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Node, Edge
from app.graph.client import create_graph_node, create_graph_edge
from app.services.extractor import extract_concepts



async def _enqueue_embedding(db: AsyncSession, user_id: str, node_id: str) -> None:
    """
    Add a node to the embedding queue. Never raises — capture must not
    fail because the queue insert failed.
    """
    try:
        from sqlalchemy import text as _sql_text
        await db.execute(
            _sql_text(
                "INSERT INTO embedding_queue (node_id, user_id) "
                "VALUES (:node_id, :user_id) "
                "ON CONFLICT (node_id) DO NOTHING"
            ),
            {"node_id": node_id, "user_id": user_id},
        )
        await db.commit()
    except Exception as e:  # noqa: BLE001
        print(f"[capture] enqueue embedding failed for {node_id}: {e}")

async def capture_text(
    db: AsyncSession,
    user_id: str,
    text: str,
    title: str | None = None,
    source_type: str = "manual",
    metadata: dict | None = None,
) -> Node:
    """
    Capture raw text, extract concepts via AI, and build the graph.

    Steps:
    1. Save raw thought node in Postgres
    2. Run AI extraction (summary, concepts, tags)
    3. Save summary + tags on the thought node
    4. Create concept nodes and connect them
    5. Mirror everything in Neo4j
    """
    # 1. Save the raw thought
    thought = Node(
        id=str(uuid.uuid4()),
        user_id=user_id,
        type="thought",
        title=title or text[:80],
        content=text,
        meta={"source_type": source_type, **(metadata or {})},
        confidence=1.0,
    )
    db.add(thought)
    await db.commit()
    await db.refresh(thought)

    # 2. AI extraction (gated by AI processing consent)
    from app.services.consent import is_ai_processing_allowed
    if await is_ai_processing_allowed(db, str(user_id)):
        try:
            extraction = await extract_concepts(text)
        except Exception as e:
            extraction = {"summary": "", "concepts": [], "tags": []}
            print(f"[Cortex] Extraction failed: {e}")
    else:
        extraction = {"summary": "", "concepts": [], "tags": []}
        print("[Cortex] Extraction skipped — AI processing disabled")

    # 3. Update the thought with summary + tags
    thought.summary = extraction.get("summary") or ""
    thought.meta = {
        **(thought.meta or {}),
        "tags": extraction.get("tags", []),
        "source_type": source_type,
    }
    await db.commit()
    await db.refresh(thought)

    # Queue the thought for embedding (worker embeds it within ~5 min)
    await _enqueue_embedding(db, str(user_id), str(thought.id))

    # 4. Create concept nodes and edges
    concept_nodes: list[Node] = []
    for c in extraction.get("concepts", []):
        concept = Node(
            id=str(uuid.uuid4()),
            user_id=user_id,
            type="concept",
            title=c["name"][:200],
            content=c.get("definition", ""),
            meta={"extracted_from": thought.id},
            confidence=0.8,
        )
        db.add(concept)
        await db.flush()

        edge = Edge(
            id=str(uuid.uuid4()),
            user_id=user_id,
            from_node_id=thought.id,
            to_node_id=concept.id,
            type="contains",
            weight=1.0,
            created_by="ai",
        )
        db.add(edge)
        concept_nodes.append(concept)

    await db.commit()

    # 4b. Canonicalize each concept — merge into existing canonicals
    # where duplicates are found. Best-effort; a failure here never
    # breaks the capture.
    try:
        from app.services.canonicalization import canonicalize_new_concept
        for concept in concept_nodes:
            try:
                await canonicalize_new_concept(db, str(user_id), str(concept.id))
            except Exception as _e:  # noqa: BLE001
                print(f"[capture] canonicalize failed for {concept.id[:8]}: {_e}")
    except Exception as _e:  # noqa: BLE001
        print(f"[capture] canonicalization module failed: {_e}")

    # 5. Mirror everything in Neo4j
    try:
        await create_graph_node(
            user_id=user_id,
            node_id=thought.id,
            node_type="thought",
            title=thought.title or "",
            content=thought.content or "",
        )
        for concept in concept_nodes:
            await create_graph_node(
                user_id=user_id,
                node_id=concept.id,
                node_type="concept",
                title=concept.title or "",
                content=concept.content or "",
            )
            await create_graph_edge(
                user_id=user_id,
                from_id=thought.id,
                to_id=concept.id,
                edge_type="contains",
                weight=1.0,
            )
    except Exception as e:
        print(f"[Cortex] Neo4j mirror failed: {e}")

    # Queue each new concept for embedding
    for _cn in concept_nodes:
        await _enqueue_embedding(db, str(user_id), str(_cn.id))

    return thought


async def get_node(db: AsyncSession, node_id: str) -> Node | None:
    result = await db.execute(select(Node).where(Node.id == node_id))
    return result.scalar_one_or_none()


async def list_nodes(
    db: AsyncSession,
    user_id: str,
    limit: int = 50,
    offset: int = 0,
) -> list[Node]:
    result = await db.execute(
        select(Node)
        .where(Node.user_id == user_id)
        .order_by(Node.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def get_concepts_for_thought(
    db: AsyncSession,
    thought_id: str,
) -> list[Node]:
    result = await db.execute(
        select(Node)
        .join(Edge, Edge.to_node_id == Node.id)
        .where(Edge.from_node_id == thought_id)
        .where(Edge.type == "contains")
    )
    return list(result.scalars().all())


# ---------- URL existence check ----------

def _normalize_url(url: str) -> str:
    """
    Normalize a URL for comparison purposes.

    - Trim whitespace
    - Lowercase the scheme and host
    - Strip a single trailing slash from the path (except root)
    - Strip common tracking query params (utm_*, fbclid, gclid)
    """
    from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

    try:
        p = urlparse(url.strip())
    except Exception:
        return url.strip()

    scheme = (p.scheme or "").lower()
    netloc = (p.netloc or "").lower()
    path = p.path or ""
    if path.endswith("/") and len(path) > 1:
        path = path[:-1]

    # Filter tracking params
    drop_keys = {"utm_source", "utm_medium", "utm_campaign", "utm_term",
                 "utm_content", "fbclid", "gclid", "mc_cid", "mc_eid"}
    qs_pairs = [
        (k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
        if k.lower() not in drop_keys
    ]
    # Sort for stable comparison
    qs_pairs.sort()
    query = urlencode(qs_pairs)

    # Strip fragment
    return urlunparse((scheme, netloc, path, p.params, query, ""))


async def check_url_exists(
    db: AsyncSession,
    user_id: str,
    url: str,
) -> dict:
    """
    Return whether this URL has already been captured by the user.

    Matches against `meta.original_url` on thought nodes. Uses a
    normalized URL for comparison so tracking params / trailing slashes
    don't create false negatives.

    Note: `Node.meta` is a plain JSON column, not JSONB — so we can't use
    Postgres's `.astext` operator. We fetch candidates and compare in
    Python instead. Fine for reasonable graph sizes; add a dedicated URL
    column or JSONB index later if this becomes a hot path.
    """
    normalized = _normalize_url(url)

    if not normalized:
        return {"exists": False, "count": 0, "node_id": None, "title": None}

    # Fetch the user's recent thought nodes and compare in Python.
    result = await db.execute(
        select(Node)
        .where(Node.user_id == user_id)
        .where(Node.type == "thought")
        .order_by(Node.created_at.desc())
        .limit(500)
    )
    candidates = list(result.scalars().all())

    for node in candidates:
        meta = node.meta or {}
        candidate_url = meta.get("original_url")
        if not isinstance(candidate_url, str):
            continue
        if _normalize_url(candidate_url) == normalized:
            return {
                "exists": True,
                "count": 1,
                "node_id": node.id,
                "title": node.title,
            }

    return {"exists": False, "count": 0, "node_id": None, "title": None}
