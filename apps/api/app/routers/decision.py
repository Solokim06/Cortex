from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.i18n import get_locale
from app.services.decision import (
    analyze_decision,
    delete_decision,
    detect_patterns,
    get_decision,
    get_due_reviews,
    list_decisions,
    record_outcome,
    update_decision,
)

router = APIRouter(prefix="/decision", tags=["decision"])


# ---------- Request models ----------

class AnalyzeRequest(BaseModel):
    question: str = Field(..., min_length=5, max_length=500)
    context: str = Field("", max_length=3000)
    chosen_option: str = Field("", max_length=500)
    reasoning: str = Field("", max_length=3000)
    expected_outcome: str = Field("", max_length=2000)


class OutcomeRequest(BaseModel):
    actual_outcome: str = Field(..., min_length=3, max_length=3000)


class UpdateDecisionRequest(BaseModel):
    chosen_option: str | None = Field(None, max_length=500)
    reasoning: str | None = Field(None, max_length=3000)
    expected_outcome: str | None = Field(None, max_length=2000)
    review_days: int | None = Field(None, ge=1, le=365)


# ---------- Response helpers ----------

def _decision_summary(d) -> dict:
    return {
        "id": str(d.id),
        "question": d.question,
        "status": d.status,
        "chosen_option": d.chosen_option,
        "lesson": d.lesson,
        "review_at": d.review_at.isoformat() if d.review_at else None,
        "created_at": d.created_at.isoformat(),
    }


# ---------- Endpoints ----------

@router.post("/analyze")
async def analyze_endpoint(
    payload: AnalyzeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    locale: str = Depends(get_locale),
):
    """Analyze a decision using the user's knowledge + past decisions."""
    decision = await analyze_decision(
        db=db,
        user_id=user.id,
        question=payload.question,
        context=payload.context,
        chosen_option=payload.chosen_option,
        reasoning=payload.reasoning,
        expected_outcome=payload.expected_outcome,
        locale=locale,
    )

    return {
        "decision": _decision_summary(decision),
        "options": decision.options or [],
        "analysis": decision.analysis or {},
    }


@router.get("/")
async def list_decisions_endpoint(
    status: str | None = Query(None, pattern="^(open|decided|reviewed|archived)$"),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List decisions, optionally filtered by status."""
    decisions = await list_decisions(db, user.id, status=status, limit=limit)

    return {
        "count": len(decisions),
        "decisions": [_decision_summary(d) for d in decisions],
    }


@router.get("/due")
async def due_reviews_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return decisions that are due for review right now."""
    decisions = await get_due_reviews(db, user.id)

    return {
        "count": len(decisions),
        "decisions": [_decision_summary(d) for d in decisions],
    }


@router.get("/patterns")
async def patterns_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    locale: str = Depends(get_locale),
):
    """Detect recurring patterns across all your decisions."""
    return await detect_patterns(db, user.id, locale=locale)


@router.get("/{decision_id}")
async def get_decision_endpoint(
    decision_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the full details of a single decision."""
    decision = await get_decision(db, decision_id)
    if decision is None:
        raise HTTPException(status_code=404, detail="Decision not found")

    if decision.user_id != user.id:
        raise HTTPException(status_code=404, detail="Decision not found")

    return {
        "id": str(decision.id),
        "question": decision.question,
        "context": decision.context,
        "options": decision.options or [],
        "analysis": decision.analysis or {},
        "chosen_option": decision.chosen_option,
        "reasoning": decision.reasoning,
        "expected_outcome": decision.expected_outcome,
        "actual_outcome": decision.actual_outcome,
        "lesson": decision.lesson,
        "status": decision.status,
        "review_at": decision.review_at.isoformat() if decision.review_at else None,
        "reviewed_at": decision.reviewed_at.isoformat() if decision.reviewed_at else None,
        "created_at": decision.created_at.isoformat(),
    }


@router.post("/{decision_id}/outcome")
async def record_outcome_endpoint(
    decision_id: str,
    payload: OutcomeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    locale: str = Depends(get_locale),
):
    """Record what actually happened. Cortex extracts the lesson."""
    decision = await get_decision(db, decision_id)
    if decision is None or decision.user_id != user.id:
        raise HTTPException(status_code=404, detail="Decision not found")

    updated = await record_outcome(
        db, decision_id, payload.actual_outcome, locale=locale
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Decision not found")

    return {
        "decision": _decision_summary(updated),
        "actual_outcome": updated.actual_outcome,
        "lesson": updated.lesson,
        "analysis": updated.analysis or {},
    }


# ---------- Update (decide-later) ----------

@router.patch("/{decision_id}")
async def update_decision_endpoint(
    decision_id: str,
    payload: UpdateDecisionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update a decision after analysis — pick the chosen option, add reasoning,
    set the expected outcome, and/or reschedule the review window.
    """
    existing = await get_decision(db, decision_id)
    if existing is None or existing.user_id != user.id:
        raise HTTPException(status_code=404, detail="Decision not found")

    updated = await update_decision(
        db,
        decision_id,
        chosen_option=payload.chosen_option,
        reasoning=payload.reasoning,
        expected_outcome=payload.expected_outcome,
        review_days=payload.review_days,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Decision not found")

    return {
        "decision": _decision_summary(updated),
        "options": updated.options or [],
        "analysis": updated.analysis or {},
        "chosen_option": updated.chosen_option,
        "reasoning": updated.reasoning,
        "expected_outcome": updated.expected_outcome,
        "review_at": updated.review_at.isoformat() if updated.review_at else None,
    }


# ---------- Archive / Unarchive ----------

@router.post("/{decision_id}/archive")
async def archive_decision_endpoint(
    decision_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Archive a decision — removes it from active views without deleting."""
    decision = await get_decision(db, decision_id)
    if decision is None or decision.user_id != user.id:
        raise HTTPException(status_code=404, detail="Decision not found")

    decision.status = "archived"
    await db.commit()
    await db.refresh(decision)

    return {"decision": _decision_summary(decision)}


@router.post("/{decision_id}/unarchive")
async def unarchive_decision_endpoint(
    decision_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Restore a decision from the archive."""
    decision = await get_decision(db, decision_id)
    if decision is None or decision.user_id != user.id:
        raise HTTPException(status_code=404, detail="Decision not found")

    decision.status = "decided" if decision.chosen_option else "open"
    await db.commit()
    await db.refresh(decision)

    return {"decision": _decision_summary(decision)}


# ---------- Delete ----------

@router.delete("/{decision_id}")
async def delete_decision_endpoint(
    decision_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Permanently delete a decision.

    Any related nodes captured in Memory are NOT removed — the lessons
    live on even after the decision record is deleted.
    """
    existing = await get_decision(db, decision_id)
    if existing is None or existing.user_id != user.id:
        raise HTTPException(status_code=404, detail="Decision not found")

    ok = await delete_decision(db, decision_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Decision not found")

    return {"deleted": True, "id": decision_id}
