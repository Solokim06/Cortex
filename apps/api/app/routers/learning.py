from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.i18n import get_locale
from app.services.learning import (
    create_goal,
    get_goal,
    get_plan_for_goal,
    list_goals,
    mark_milestone,
)

router = APIRouter(prefix="/learning", tags=["learning"])


# ---------- Request models ----------

class CreateGoalRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field("", max_length=2000)


class MilestoneRequest(BaseModel):
    phase_index: int = Field(..., ge=0)
    milestone_index: int = Field(..., ge=0)
    done: bool = True
    # Optional — pass to attach or update a note on the milestone.
    # Send null to clear. Omit entirely to leave the note untouched.
    notes: str | None = Field(None, max_length=2000)


# ---------- Endpoints ----------

@router.post("/goal")
async def create_goal_endpoint(
    payload: CreateGoalRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    locale: str = Depends(get_locale),
):
    """Create a learning goal and generate the full plan."""
    goal = await create_goal(
        db, user.id, payload.title, payload.description, locale=locale
    )
    plan = await get_plan_for_goal(db, goal.id)

    return {
        "goal": {
            "id": str(goal.id),
            "title": goal.title,
            "description": goal.description,
            "status": goal.status,
            "summary": (goal.meta or {}).get("summary", ""),
            "created_at": goal.created_at.isoformat(),
        },
        "plan": plan.plan if plan else {},
    }


@router.get("/goals")
async def list_goals_endpoint(
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all learning goals for the current user."""
    goals = await list_goals(db, user.id, limit=limit)

    return {
        "count": len(goals),
        "goals": [
            {
                "id": str(g.id),
                "title": g.title,
                "status": g.status,
                "summary": (g.meta or {}).get("summary", ""),
                "created_at": g.created_at.isoformat(),
            }
            for g in goals
        ],
    }


@router.get("/plan/{goal_id}")
async def get_plan_endpoint(
    goal_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the full learning plan for a goal."""
    goal = await get_goal(db, goal_id)
    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")

    if goal.user_id != user.id:
        raise HTTPException(status_code=404, detail="Goal not found")

    plan = await get_plan_for_goal(db, goal_id)

    return {
        "goal": {
            "id": str(goal.id),
            "title": goal.title,
            "status": goal.status,
        },
        "plan": plan.plan if plan else {},
        "plan_status": plan.status if plan else "none",
    }


@router.post("/progress/{goal_id}")
async def update_progress_endpoint(
    goal_id: str,
    payload: MilestoneRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update a milestone's done state and/or notes.

    - Set `done: true|false` to toggle completion.
    - Pass `notes` to attach or update a note (empty string clears it).
    - Omit `notes` entirely to leave the note unchanged.
    """
    goal = await get_goal(db, goal_id)
    if goal is None or goal.user_id != user.id:
        raise HTTPException(status_code=404, detail="Goal not found")

    plan = await mark_milestone(
        db,
        goal_id,
        payload.phase_index,
        payload.milestone_index,
        payload.done,
        notes=payload.notes,
    )
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found")

    return {
        "goal_id": goal_id,
        "plan_status": plan.status,
        "plan": plan.plan,
    }
