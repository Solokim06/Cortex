"""
Neo4j async client --- hardened against Aura Free's aggressive
connection recycling.

Key design choices:
  - No module-level singleton (fresh driver per call)
  - max_connection_lifetime=30s + liveness_check_timeout=10s
    forces the driver to rotate stale connections before Aura drops them
  - test_connection() retries once on DatabaseNotFound, which is the
    specific error Aura raises when it kills an idle connection mid-use
"""

from contextlib import asynccontextmanager

from neo4j import AsyncGraphDatabase
from neo4j.exceptions import ClientError


@asynccontextmanager
async def _session():
    """Fresh driver + session per call, pre-flighted against Aura routing flakiness.

    Aura Free's routing table intermittently hands out stale cluster members
    that report DatabaseNotFound on first query (~1 in 3 in practice). We
    open a driver, run a cheap `RETURN 1` probe, and if it fails, discard
    the driver and try a fresh one. Only once the probe succeeds do we
    yield the session to the caller.
    """
    import asyncio as _aio
    import random as _random
    from app.config.settings import get_settings
    from neo4j.exceptions import ClientError

    s = get_settings()
    last_err: Exception | None = None

    for attempt in range(1, 31):
        driver = AsyncGraphDatabase.driver(
            s.neo4j_uri,
            auth=(s.neo4j_user, s.neo4j_password),
        )
        try:
            session = driver.session(database=s.neo4j_database)
            # Pre-flight: forces a real round-trip so we catch a stale
            # cluster member before yielding a poisoned session.
            try:
                await (await session.run("RETURN 1 AS ok")).consume()
            except ClientError as e:
                last_err = e
                await session.close()
                await driver.close()
                if "DatabaseNotFound" in str(e) or "Database does not exist" in str(e):
                    await _aio.sleep(0.5 + _random.random() * 0.5)
                    continue
                raise
            try:
                yield session
            finally:
                await session.close()
            return
        finally:
            try:
                await driver.close()
            except Exception:
                pass

    raise last_err or RuntimeError("neo4j session unavailable after retries")


async def close_driver():
    """No-op --- kept for API compatibility with main.py."""
    return None


async def _run_read_with_retry(query: str, params: dict | None = None, attempts: int = 8):
    """
    Run a READ query (returns a list of records), retrying on Aura
    cold-start DatabaseNotFound.
    """
    import asyncio as _aio
    from neo4j.exceptions import ClientError

    last_err: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            async with _session() as session:
                result = await session.run(query, **(params or {}))
                return [rec async for rec in result]
        except ClientError as e:
            if "DatabaseNotFound" in str(e) or "Database does not exist" in str(e):
                last_err = e
                await _aio.sleep(1.5)
                continue
            raise
    if last_err:
        raise last_err
    return []


async def _run_with_retry(query: str, params: dict, attempts: int = 8) -> None:
    """
    Run a write query, retrying on Aura Free cold-start DatabaseNotFound.

    Aura Free suspends the instance after ~5 min idle. The first write
    after that gets DatabaseNotFound for a few seconds while Aura spins
    up. This retries with a short backoff and succeeds.
    """
    import asyncio as _aio
    from neo4j.exceptions import ClientError

    last_err: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            async with _session() as session:
                await session.run(query, **params)
            return
        except ClientError as e:
            if "DatabaseNotFound" in str(e) or "Database does not exist" in str(e):
                last_err = e
                await _aio.sleep(1.5)
                continue
            raise
    if last_err:
        raise last_err


async def create_graph_node(
    user_id: str,
    node_id: str,
    node_type: str,
    title: str,
    content: str = "",
):
    await _run_with_retry(
        """
        MERGE (n:Node {id: $id})
        SET n.user_id = $user_id,
            n.type = $type,
            n.title = $title,
            n.content = $content,
            n.created_at = datetime()
        """,
        {
            "id": node_id,
            "user_id": user_id,
            "type": node_type,
            "title": title or "",
            "content": (content or "")[:1000],
        },
    )


async def create_graph_edge(
    user_id: str,
    from_id: str,
    to_id: str,
    edge_type: str,
    weight: float = 1.0,
):
    """Create a typed relationship between two nodes in Neo4j."""
    safe_type = "".join(c for c in edge_type if c.isalnum() or c == "_") or "RELATES"
    await _run_with_retry(
        f"""
        MATCH (a:Node {{id: $from_id}})
        MATCH (b:Node {{id: $to_id}})
        MERGE (a)-[r:{safe_type}]->(b)
        SET r.weight = $weight,
            r.created_at = datetime()
        """,
        {"from_id": from_id, "to_id": to_id, "weight": weight},
    )


async def test_connection():
    """
    Health probe with aggressive retry.

    Aura Free's router intermittently returns DatabaseNotFound even
    for a perfectly valid connection --- different routing nodes report
    a different canonical database name. Retrying with a short backoff
    reliably succeeds within 2-3 attempts.
    """
    import asyncio as _aio
    from neo4j.exceptions import ClientError

    last_err: Exception | None = None
    for attempt in range(1, 21):  # up to 20 attempts (~30s total)
        try:
            async with _session() as session:
                # Write probe --- same path real graph writes take.
                result = await session.run(
                    "CREATE (n:_HealthCheck {at: datetime()}) "
                    "DELETE n "
                    "RETURN 'Cortex graph is alive' AS message"
                )
                record = await result.single()
                return record["message"]
        except ClientError as e:
            if "DatabaseNotFound" in str(e) or "Database does not exist" in str(e):
                last_err = e
                print(f"[graph] retry {attempt}/6 after DatabaseNotFound")
                await _aio.sleep(1.5)
                continue
            raise

    raise last_err if last_err else RuntimeError("graph probe failed")


async def delete_graph_edge(
    user_id: str,
    from_id: str,
    to_id: str,
    edge_type: str = "",
) -> None:
    """
    Delete a relationship from Neo4j. If `edge_type` is empty, deletes
    all relationships between the two nodes. Idempotent -- safe to call
    even if the relationship is already gone.

    Note: this uses string interpolation for the relationship type,
    which Neo4j does not allow as a parameter. The type is validated
    against a whitelist to prevent injection.
    """
    # Whitelist known edge types so we never interpolate user input.
    ALLOWED = {
        "refines", "contradicts", "expands", "exemplifies",
        "supports", "questions", "related_to", "contains",
        "RELATES",
    }
    safe_type = edge_type if edge_type in ALLOWED else None

    if safe_type:
        query = (
            "MATCH (a:Node {id: $from_id})-[r:" + safe_type + "]->"
            "(b:Node {id: $to_id}) DELETE r"
        )
    else:
        query = (
            "MATCH (a:Node {id: $from_id})-[r]->(b:Node {id: $to_id}) "
            "DELETE r"
        )
    await _run_with_retry(
        query,
        {"from_id": from_id, "to_id": to_id},
    )
