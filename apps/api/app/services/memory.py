import asyncio

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Node
from app.services.embeddings import embed_one, content_hash


async def upsert_embedding(
    db: AsyncSession,
    user_id: str,
    node_id: str,
    text_for_embedding: str,
) -> None:
    """Create or update the embedding for a node."""
    vec = await embed_one(text_for_embedding)
    chash = content_hash(text_for_embedding)
    vec_literal = "[" + ",".join(str(x) for x in vec) + "]"

    # Note: double cast is required. asyncpg rejects a Python string for
    # a param the SQL casts directly to `vector`; the text intermediate
    # makes the type unambiguous.
    sql = text("""
        INSERT INTO embeddings (node_id, user_id, model, dim, content_hash, embedding)
        VALUES (:node_id, :user_id, :model, :dim, :content_hash,
                CAST(CAST(:embedding AS text) AS vector))
        ON CONFLICT (node_id) DO UPDATE
        SET embedding = EXCLUDED.embedding,
            content_hash = EXCLUDED.content_hash,
            model = EXCLUDED.model,
            dim = EXCLUDED.dim
    """)

    await db.execute(sql, {
        "node_id": node_id,
        "user_id": user_id,
        "model": "voyage-3-lite",
        "dim": len(vec),
        "content_hash": chash,
        "embedding": vec_literal,
    })
    await db.commit()


async def semantic_search(
    db: AsyncSession,
    user_id: str,
    query: str,
    limit: int = 10,
) -> list[dict]:
    """Search for nodes by meaning, using vector similarity."""
    query_vec = await embed_one(query)
    vec_literal = "[" + ",".join(str(x) for x in query_vec) + "]"

    sql = text("""
        SELECT
            n.id, n.type, n.title, n.content, n.summary, n.metadata,
            1 - (e.embedding <=> CAST(CAST(:qvec AS text) AS vector)) AS score
        FROM embeddings e
        JOIN nodes n ON n.id = e.node_id
        WHERE e.user_id = :user_id
        ORDER BY e.embedding <=> CAST(CAST(:qvec AS text) AS vector)
        LIMIT :limit
    """)

    rows = (await db.execute(sql, {
        "qvec": vec_literal,
        "user_id": user_id,
        "limit": limit,
    })).mappings().all()

    return [
        {
            "id": str(r["id"]),
            "type": r["type"],
            "title": r["title"],
            "content": (r["content"] or "")[:400],
            "summary": r["summary"] or "",
            "score": float(r["score"]) if r["score"] is not None else 0.0,
            "meta": r["metadata"] or {},
        }
        for r in rows
    ]


async def hybrid_search(
    db: AsyncSession,
    user_id: str,
    query: str,
    limit: int = 10,
) -> list[dict]:
    """Combine semantic search with keyword fallback."""
    semantic = await semantic_search(db, user_id, query, limit=limit)

    if len(semantic) >= limit // 2:
        return semantic

    keywords = [w for w in query.split() if len(w) > 3]
    if not keywords:
        return semantic

    k_sql = text("""
        SELECT id, type, title, content, summary, metadata
        FROM nodes
        WHERE user_id = :user_id
          AND (
              title ILIKE ANY(:patterns) OR
              content ILIKE ANY(:patterns) OR
              summary ILIKE ANY(:patterns)
          )
        ORDER BY created_at DESC
        LIMIT :limit
    """)

    patterns = [f"%{kw}%" for kw in keywords]
    k_rows = (await db.execute(k_sql, {
        "user_id": user_id,
        "patterns": patterns,
        "limit": limit,
    })).mappings().all()

    seen = {r["id"] for r in semantic}
    for r in k_rows:
        if r["id"] not in seen:
            semantic.append({
                "id": str(r["id"]),
                "type": r["type"],
                "title": r["title"],
                "content": (r["content"] or "")[:400],
                "summary": r["summary"] or "",
                "score": 0.0,
                "meta": r["metadata"] or {},
            })

    return semantic[:limit]


async def find_similar_nodes(
    db: AsyncSession,
    user_id: str,
    node_id: str,
    limit: int = 10,
) -> list[dict]:
    """Find nodes semantically similar to a given node."""
    sql = text("""
        SELECT
            n.id, n.type, n.title, n.content, n.summary,
            1 - (e.embedding <=> (SELECT embedding FROM embeddings WHERE node_id = :node_id)) AS score
        FROM embeddings e
        JOIN nodes n ON n.id = e.node_id
        WHERE e.user_id = :user_id AND n.id != :node_id
        ORDER BY e.embedding <=> (SELECT embedding FROM embeddings WHERE node_id = :node_id)
        LIMIT :limit
    """)

    rows = (await db.execute(sql, {
        "node_id": node_id,
        "user_id": user_id,
        "limit": limit,
    })).mappings().all()

    return [
        {
            "id": str(r["id"]),
            "type": r["type"],
            "title": r["title"],
            "content": (r["content"] or "")[:400],
            "summary": r["summary"] or "",
            "score": float(r["score"]) if r["score"] is not None else 0.0,
            "meta": r["metadata"] or {},
        }
        for r in rows
    ]


async def reindex_user(
    db: AsyncSession,
    user_id: str,
) -> dict:
    """Embed every node the user has, with rate limiting for Voyage's free tier."""
    result = await db.execute(
        select(Node).where(Node.user_id == user_id)
    )
    nodes = list(result.scalars().all())

    indexed = 0
    failed = 0
    for n in nodes:
        text_for_embedding = f"{n.title or ''}\n{n.summary or ''}\n{n.content or ''}".strip()
        if not text_for_embedding:
            continue
        try:
            await upsert_embedding(db, user_id, n.id, text_for_embedding)
            indexed += 1
            # Voyage free tier: ~3 req/sec. Sleep 400ms between successful calls.
            await asyncio.sleep(0.4)
        except Exception as e:
            failed += 1
            print(f"[Cortex] Embedding failed for {n.id}: {e}")
            # Back off longer on failure (rate limit or transient error)
            await asyncio.sleep(2.0)

    return {"indexed": indexed, "failed": failed, "total": len(nodes)}
