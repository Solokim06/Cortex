from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.services.memory import (
    find_similar_nodes,
    hybrid_search,
    reindex_user,
    semantic_search,
)
from app.services.graph_health import compute_health
from app.services.canonicalization import (
    accept_pending_alias,
    reject_pending_alias,
    undo_alias,
)
from app.services.stale import dismiss_stale

router = APIRouter(prefix="/memory", tags=["memory"])


class SearchHit(BaseModel):
    id: str
    type: str
    title: str | None
    content: str | None
    summary: str | None
    score: float
    meta: dict | None = None


class SearchResponse(BaseModel):
    query: str
    results: list[SearchHit]
    count: int


@router.get("/search", response_model=SearchResponse)
async def search_endpoint(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    mode: str = Query("hybrid", pattern="^(semantic|hybrid)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if mode == "semantic":
        results = await semantic_search(db, user.id, q, limit=limit)
    else:
        results = await hybrid_search(db, user.id, q, limit=limit)

    return SearchResponse(query=q, results=results, count=len(results))


@router.get("/similar/{node_id}", response_model=SearchResponse)
async def similar_endpoint(
    node_id: str,
    limit: int = Query(10, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    results = await find_similar_nodes(db, user.id, node_id, limit=limit)
    return SearchResponse(
        query=f"similar to {node_id}",
        results=results,
        count=len(results),
    )


@router.post("/reindex")
async def reindex_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await reindex_user(db, user.id)
    return result


# =====================================================================
# Tier 8 -- graph health
# =====================================================================


class HealthResponse(BaseModel):
    overview: dict
    topology: dict
    issues: dict
    activity: dict


class AliasActionResponse(BaseModel):
    ok: bool
    alias_row_id: str


class DismissResponse(BaseModel):
    ok: bool
    node_id: str
    dismissed_until: str | None


@router.get("/health", response_model=HealthResponse)
async def graph_health_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Composite graph-health payload: overview, topology, issues, activity."""
    result = await compute_health(db, user.id)
    return HealthResponse(**result)


@router.post("/aliases/{alias_row_id}/accept", response_model=AliasActionResponse)
async def accept_alias_endpoint(
    alias_row_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Approve a pending (Tier 3) merge."""
    ok = await accept_pending_alias(db, user.id, alias_row_id)
    if not ok:
        raise HTTPException(
            status_code=404, detail="Pending alias not found"
        )
    return AliasActionResponse(ok=True, alias_row_id=alias_row_id)


@router.post("/aliases/{alias_row_id}/reject", response_model=AliasActionResponse)
async def reject_alias_endpoint(
    alias_row_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reject a pending (Tier 3) merge. Keeps the concepts separate."""
    ok = await reject_pending_alias(db, user.id, alias_row_id)
    if not ok:
        raise HTTPException(
            status_code=404, detail="Pending alias not found"
        )
    return AliasActionResponse(ok=True, alias_row_id=alias_row_id)


@router.post("/aliases/{alias_row_id}/undo", response_model=AliasActionResponse)
async def undo_alias_endpoint(
    alias_row_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revert an accepted merge (Tier 1 or Tier 2)."""
    ok = await undo_alias(db, user.id, alias_row_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Alias not found")
    return AliasActionResponse(ok=True, alias_row_id=alias_row_id)


@router.post("/stale/{node_id}/dismiss", response_model=DismissResponse)
async def dismiss_stale_endpoint(
    node_id: str,
    days: int = Query(90, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mute the stale flag for this concept for `days`."""
    ok = await dismiss_stale(db, user.id, node_id, days=days)
    if not ok:
        raise HTTPException(status_code=404, detail="Concept not found")
    from datetime import datetime, timedelta, timezone
    until = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
    return DismissResponse(ok=True, node_id=node_id, dismissed_until=until)
