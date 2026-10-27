from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.i18n import get_locale
from app.services.reflection import (
    extract_lesson_from_decision,
    generate_report,
    get_pending_reviews,
    get_reflection,
    list_reflections,
)

router = APIRouter(prefix="/reflection", tags=["reflection"])


# ---------- Request models ----------

class ExtractLessonRequest(BaseModel):
    decision_id: str


class GenerateReportRequest(BaseModel):
    days: int = 30


# ---------- Helpers ----------

def _reflection_summary(r) -> dict:
    return {
        "id": str(r.id),
        "kind": r.kind,
        "title": r.title,
        "content": r.content,
        "meta": r.meta or {},
        "decision_id": str(r.decision_id) if r.decision_id else None,
        "created_at": r.created_at.isoformat(),
    }


# ---------- Endpoints ----------

@router.get("/pending")
async def pending_reviews_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Decisions that are due for review right now."""
    decisions = await get_pending_reviews(db, user.id)

    return {
        "count": len(decisions),
        "decisions": [
            {
                "id": str(d.id),
                "question": d.question,
                "status": d.status,
                "chosen_option": d.chosen_option,
                "review_at": d.review_at.isoformat() if d.review_at else None,
                "created_at": d.created_at.isoformat(),
            }
            for d in decisions
        ],
    }


@router.post("/extract-lesson")
async def extract_lesson_endpoint(
    payload: ExtractLessonRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    locale: str = Depends(get_locale),
):
    """Extract a lesson from a reviewed decision and store it as knowledge."""
    reflection = await extract_lesson_from_decision(
        db, user.id, payload.decision_id, locale=locale
    )
    if reflection is None:
        raise HTTPException(status_code=404, detail="Decision not found")

    return {
        "reflection": _reflection_summary(reflection),
    }


@router.post("/report")
async def generate_report_endpoint(
    payload: GenerateReportRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    locale: str = Depends(get_locale),
):
    """Generate a reflective report over the last N days."""
    days = max(1, min(payload.days, 365))
    reflection = await generate_report(db, user.id, days=days, locale=locale)

    return {
        "reflection": _reflection_summary(reflection),
    }


@router.get("/")
async def list_reflections_endpoint(
    kind: str | None = Query(
        None,
        pattern="^(lesson|weekly_report|pattern_insight|identity_update)$",
    ),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all reflections, optionally filtered by kind."""
    reflections = await list_reflections(db, user.id, kind=kind, limit=limit)

    return {
        "count": len(reflections),
        "reflections": [_reflection_summary(r) for r in reflections],
    }


@router.get("/lessons")
async def list_lessons_endpoint(
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Shorthand: list only lesson reflections."""
    reflections = await list_reflections(db, user.id, kind="lesson", limit=limit)

    return {
        "count": len(reflections),
        "lessons": [_reflection_summary(r) for r in reflections],
    }


@router.get("/{reflection_id}")
async def get_reflection_endpoint(
    reflection_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get one reflection by ID."""
    reflection = await get_reflection(db, reflection_id)
    if reflection is None:
        raise HTTPException(status_code=404, detail="Reflection not found")

    # Ensure ownership
    if reflection.user_id != user.id:
        raise HTTPException(status_code=404, detail="Reflection not found")

    return _reflection_summary(reflection)
