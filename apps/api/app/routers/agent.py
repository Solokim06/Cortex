"""
Tier 4 -- agentic action endpoints.

Thin router over app.services.actions.dispatcher. All user-scoped,
all authenticated, all return JSON.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.services.actions.dispatcher import (
    apply_action,
    dispatch,
    get_action,
    list_actions,
    reject_action,
    undo_action,
)

router = APIRouter(prefix="/agent", tags=["agent"])


# ---------- request / response models ----------


class PlanRequest(BaseModel):
    instruction: str = Field(..., min_length=1, max_length=2000)
    action_kind: str = Field(..., min_length=1, max_length=32)
    context: dict | None = None


class ActionResponse(BaseModel):
    id: str
    action_kind: str
    instruction: str | None
    proposal: dict
    status: str
    result: dict | None
    snapshot: dict | None
    created_at: str | None
    applied_at: str | None
    undone_at: str | None
    expires_at: str | None


class ListResponse(BaseModel):
    actions: list[ActionResponse]
    count: int


class DispatchResponse(BaseModel):
    action_id: str
    action_kind: str
    status: str
    proposal: dict
    auto_applied: bool
    message: str | None


# ---------- endpoints ----------


@router.get("/actions", response_model=ListResponse)
async def list_actions_endpoint(
    status: str | None = Query(None, description="pending | applied | rejected | failed | undone"),
    since: str | None = Query(
        None,
        description="ISO timestamp; only actions at or after this instant",
    ),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List the user's past agent actions, newest first."""
    actions = await list_actions(
        db, user.id, status=status, since=since, limit=limit
    )
    return ListResponse(actions=actions, count=len(actions))


@router.get("/actions/{action_id}", response_model=ActionResponse)
async def get_action_endpoint(
    action_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return one action by id."""
    row = await get_action(db, user.id, action_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Action not found")
    return ActionResponse(**row)


@router.post("/actions/plan", response_model=DispatchResponse)
async def plan_endpoint(
    payload: PlanRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Run an agent to produce a proposal.

    The proposal is persisted as an agent_actions row with status
    'pending' (or 'applied' if the user has auto-apply enabled for
    this kind). The endpoint returns the persisted row, not just the
    in-memory proposal.
    """
    try:
        result = await dispatch(
            db,
            user.id,
            instruction=payload.instruction,
            action_kind=payload.action_kind,
            context=payload.context,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return DispatchResponse(**result)


@router.post("/actions/{action_id}/apply", response_model=ActionResponse)
async def apply_action_endpoint(
    action_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Apply a pending proposal. Idempotent."""
    try:
        row = await apply_action(db, user.id, action_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ActionResponse(**row)


@router.post("/actions/{action_id}/reject", response_model=ActionResponse)
async def reject_action_endpoint(
    action_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reject a pending proposal. Idempotent for already-rejected rows."""
    try:
        row = await reject_action(db, user.id, action_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ActionResponse(**row)


@router.post("/actions/{action_id}/undo", response_model=ActionResponse)
async def undo_action_endpoint(
    action_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reverse an applied proposal using its snapshot."""
    try:
        row = await undo_action(db, user.id, action_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ActionResponse(**row)
