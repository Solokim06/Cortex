from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.models import (
    Decision,
    Goal,
    IdentitySnapshot,
    Node,
    Reflection,
    User,
)
from app.db.session import get_db
from app.i18n import get_locale
from app.services.identity import (
    generate_milestones,
    get_insights,
    get_signature_quote,
    get_timeline,
    rebuild_identity,
)

router = APIRouter(prefix="/identity", tags=["identity"])


# ---------- Helpers ----------

def _snapshot_summary(s) -> dict:
    return {
        "id": str(s.id),
        "narrative": s.narrative or "",
        "model": s.model or {},
        "locale": s.locale,
        "created_at": s.created_at.isoformat(),
    }


# ---------- Endpoints ----------

@router.get("/")
async def get_identity_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current self-model (or a 'has_model: false' response if not built)."""
    return await get_insights(db, user.id)


@router.post("/rebuild")
async def rebuild_identity_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    locale: str = Depends(get_locale),
):
    """
    Rebuild the identity model from the user's latest data.

    When the current locale differs from the previous snapshot's locale,
    the identity engine translates item names into the new language
    instead of preserving them.
    """
    model = await rebuild_identity(db, user.id, locale=locale)

    return {
        "rebuilt": True,
        "locale": model.locale,
        "narrative": model.narrative or "",
        "model": model.model or {},
        "source_stats": model.source_stats or {},
        "last_rebuilt_at": model.last_rebuilt_at.isoformat()
        if model.last_rebuilt_at
        else None,
    }


@router.post("/translate")
async def translate_identity_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    locale: str = Depends(get_locale),
):
    """
    Rebuild the identity model in the current locale.

    Semantically this is the same as /rebuild — the identity engine reads
    the previous snapshot's locale and, if it differs, translates item
    names instead of preserving them. Kept as a distinct endpoint so the
    frontend can label the button appropriately when the model's language
    doesn't match the current UI language.
    """
    model = await rebuild_identity(db, user.id, locale=locale)

    return {
        "translated": True,
        "locale": model.locale,
        "narrative": model.narrative or "",
        "model": model.model or {},
        "source_stats": model.source_stats or {},
        "last_rebuilt_at": model.last_rebuilt_at.isoformat()
        if model.last_rebuilt_at
        else None,
    }


@router.get("/timeline")
async def timeline_endpoint(
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Chronological snapshots of the identity model — how you've changed."""
    snapshots = await get_timeline(db, user.id, limit=limit)

    return {
        "count": len(snapshots),
        "snapshots": [_snapshot_summary(s) for s in snapshots],
    }


@router.get("/milestones")
async def milestones_endpoint(
    limit: int = Query(10, ge=1, le=30),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    locale: str = Depends(get_locale),
):
    """Return snapshots enriched with AI-generated milestone titles."""
    milestones = await generate_milestones(db, user.id, limit=limit, locale=locale)

    return {
        "count": len(milestones),
        "milestones": milestones,
    }


@router.get("/signature")
async def signature_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the user's most-defining thought — the semantic centroid
    of everything they've captured.
    """
    return await get_signature_quote(db, user.id)


@router.get("/maturity")
async def maturity_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a 0–100 maturity score for the user's knowledge graph."""

    nodes_count = (
        await db.execute(
            select(func.count()).select_from(Node).where(Node.user_id == user.id)
        )
    ).scalar() or 0

    concepts_count = (
        await db.execute(
            select(func.count())
            .select_from(Node)
            .where(Node.user_id == user.id)
            .where(Node.type == "concept")
        )
    ).scalar() or 0

    goals_count = (
        await db.execute(
            select(func.count()).select_from(Goal).where(Goal.user_id == user.id)
        )
    ).scalar() or 0

    decisions_count = (
        await db.execute(
            select(func.count())
            .select_from(Decision)
            .where(Decision.user_id == user.id)
        )
    ).scalar() or 0

    reflections_count = (
        await db.execute(
            select(func.count())
            .select_from(Reflection)
            .where(Reflection.user_id == user.id)
        )
    ).scalar() or 0

    snapshots_count = (
        await db.execute(
            select(func.count())
            .select_from(IdentitySnapshot)
            .where(IdentitySnapshot.user_id == user.id)
        )
    ).scalar() or 0

    score = 0.0
    score += min(nodes_count, 25) * 1.0
    score += min(concepts_count, 30) * 0.5
    score += min(goals_count, 3) * 5.0
    score += min(decisions_count, 3) * 5.0
    score += min(reflections_count, 3) * 5.0
    score += min(snapshots_count, 5) * 3.0
    score = min(round(score), 100)

    if score <= 20:
        tier = "Emerging"
        narrative = "You're starting. A few more captures will strengthen your model."
    elif score <= 40:
        tier = "Forming"
        narrative = "Patterns are emerging. Keep capturing — depth comes from repetition."
    elif score <= 60:
        tier = "Building"
        narrative = "A clear framework is taking shape. Consider setting goals or making decisions to ground it."
    elif score <= 80:
        tier = "Grounding"
        narrative = "Your model is rich and interconnected. Focus on translating insight into action."
    else:
        tier = "Deep"
        narrative = "A deep, mature self-model. Few users reach this level."

    return {
        "score": score,
        "tier": tier,
        "narrative": narrative,
        "breakdown": {
            "nodes": nodes_count,
            "concepts": concepts_count,
            "goals": goals_count,
            "decisions": decisions_count,
            "reflections": reflections_count,
            "snapshots": snapshots_count,
        },
    }


@router.get("/diff")
async def diff_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Compare the current self-model to the previous snapshot.
    Returns the delta for each value, pattern, strength, and blind spot.
    """
    result = await db.execute(
        select(IdentitySnapshot)
        .where(IdentitySnapshot.user_id == user.id)
        .order_by(IdentitySnapshot.created_at.desc())
        .limit(2)
    )
    snapshots = list(result.scalars().all())

    if len(snapshots) < 2:
        return {
            "available": False,
            "reason": "Need at least 2 snapshots to compute growth.",
            "values": {},
            "patterns": {},
            "strengths": {},
            "blind_spots": {},
        }

    current = snapshots[0].model or {}
    previous = snapshots[1].model or {}

    def diff_list(key: str, name_field: str) -> dict:
        curr_items = {
            (item.get(name_field) or "").strip().lower(): item
            for item in (current.get(key) or [])
            if isinstance(item, dict)
        }
        prev_items = {
            (item.get(name_field) or "").strip().lower(): item
            for item in (previous.get(key) or [])
            if isinstance(item, dict)
        }

        deltas: dict = {}
        for name, item in curr_items.items():
            if not name:
                continue
            prev = prev_items.get(name)
            if prev is None:
                deltas[name] = {"type": "new"}
            else:
                curr_strength = (item.get("strength") or "").lower()
                prev_strength = (prev.get("strength") or "").lower()
                rank = {"low": 1, "medium": 2, "high": 3}
                curr_rank = rank.get(curr_strength, 0)
                prev_rank = rank.get(prev_strength, 0)
                if curr_rank > prev_rank:
                    deltas[name] = {
                        "type": "stronger",
                        "delta": curr_rank - prev_rank,
                    }
                elif curr_rank < prev_rank:
                    deltas[name] = {
                        "type": "weaker",
                        "delta": curr_rank - prev_rank,
                    }
                else:
                    deltas[name] = {"type": "stable"}
        return deltas

    values_delta = diff_list("values", "value")
    patterns_delta = diff_list("patterns", "pattern")
    strengths_delta = diff_list("strengths", "strength")
    blind_spots_delta = diff_list("blind_spots", "spot")

    all_snapshots_result = await db.execute(
        select(IdentitySnapshot)
        .where(IdentitySnapshot.user_id == user.id)
        .order_by(IdentitySnapshot.created_at.desc())
        .limit(10)
    )
    all_snapshots = list(all_snapshots_result.scalars().all())

    def count_persistence(key: str, name_field: str) -> dict:
        counts: dict = {}
        for snap in all_snapshots:
            model = snap.model or {}
            for item in model.get(key) or []:
                if not isinstance(item, dict):
                    continue
                name = (item.get(name_field) or "").strip().lower()
                if name:
                    counts[name] = counts.get(name, 0) + 1
        return counts

    values_counts = count_persistence("values", "value")
    patterns_counts = count_persistence("patterns", "pattern")
    strengths_counts = count_persistence("strengths", "strength")
    blind_spots_counts = count_persistence("blind_spots", "spot")

    for name, delta in values_delta.items():
        count = values_counts.get(name, 0)
        delta["appearances"] = count
        if count >= 3 and delta["type"] == "stable":
            delta["persistent"] = True

    for name, delta in patterns_delta.items():
        count = patterns_counts.get(name, 0)
        delta["appearances"] = count
        if count >= 3:
            delta["persistent"] = True

    for name, delta in strengths_delta.items():
        count = strengths_counts.get(name, 0)
        delta["appearances"] = count
        if count >= 3:
            delta["persistent"] = True

    for name, delta in blind_spots_delta.items():
        count = blind_spots_counts.get(name, 0)
        delta["appearances"] = count
        if count >= 3:
            delta["persistent"] = True

    return {
        "available": True,
        "current_snapshot_at": snapshots[0].created_at.isoformat(),
        "previous_snapshot_at": snapshots[1].created_at.isoformat(),
        "values": values_delta,
        "patterns": patterns_delta,
        "strengths": strengths_delta,
        "blind_spots": blind_spots_delta,
    }


@router.get("/insights")
async def insights_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Alias for GET /identity/ — a compact view of the current model."""
    return await get_insights(db, user.id)
