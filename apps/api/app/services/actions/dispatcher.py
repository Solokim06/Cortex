"""
Tier 4 -- agent dispatcher.

Routes an instruction to the right agent, persists the proposal as an
agent_actions row, and enforces budget + approval policy.

Every entry point is async and takes a user-scoped AsyncSession.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AgentAction, UserPreferences
from app.services.actions.base import (
    Proposal,
    get_agent,
    list_agents,
)


# =====================================================================
# budget + prefs
# =====================================================================


async def _runs_today(db: AsyncSession, user_id: str) -> int:
    """Count agent_actions created in the last 24h."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    row = (await db.execute(text(
        "SELECT count(*) FROM agent_actions "
        "WHERE user_id = :uid AND created_at >= :cutoff"
    ), {"uid": user_id, "cutoff": cutoff})).first()
    return int(row[0]) if row else 0


async def _prefs_for(db: AsyncSession, user_id: str) -> dict:
    """Return the user's agent_auto_apply prefs (or empty dict)."""
    row = (await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )).scalar_one_or_none()
    if row is None:
        return {}
    return dict(row.agent_auto_apply or {})


def _should_auto_apply(kind: str, prefs: dict, agent_default: bool) -> bool:
    """User override wins; otherwise the agent's default."""
    if kind in prefs:
        return bool(prefs[kind])
    return bool(agent_default)


# =====================================================================
# dispatch
# =====================================================================


async def dispatch(
    db: AsyncSession,
    user_id: str,
    *,
    instruction: str,
    action_kind: str,
    context: dict[str, Any] | None = None,
) -> dict:
    """
    Run an agent, persist the proposal, and possibly auto-apply.

    Returns a dict shaped for the frontend:
      {
        "action_id": str,
        "action_kind": str,
        "status": "pending" | "applied" | "rejected" | "failed",
        "proposal": {...},
        "auto_applied": bool,
        "message": str | None,
      }
    """
    from app.config.settings import get_settings
    s = get_settings()
    if not s.agent_enabled:
        raise ValueError("Agentic actions are disabled.")

    agent = get_agent(action_kind)
    if agent is None:
        raise ValueError(f"Unknown action kind: {action_kind}")

    # Budget guard
    runs = await _runs_today(db, user_id)
    if runs >= s.agent_daily_runs_cap:
        raise ValueError(
            f"Daily agent run limit reached ({runs}/{s.agent_daily_runs_cap}). "
            "Try again tomorrow."
        )

    # Plan
    proposal = await agent.plan(db, user_id, instruction, context)
    if proposal is None:
        raise ValueError("Agent produced no proposal.")

    # Ensure the proposal has an expiry
    if proposal.expires_at is None:
        proposal.expires_at = (
            datetime.now(timezone.utc)
            + timedelta(minutes=s.agent_proposal_ttl_minutes)
        )

    # Validate
    proposal = await agent.validate(db, proposal)

    # Persist as pending
    row = AgentAction(
        id=str(uuid.uuid4()),
        user_id=user_id,
        action_kind=action_kind,
        instruction=instruction,
        proposal=proposal.to_dict(),
        status="pending",
        expires_at=proposal.expires_at,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    # Auto-apply?
    prefs = await _prefs_for(db, user_id)
    should_auto = _should_auto_apply(action_kind, prefs, agent.auto_apply_default)

    result_message: str | None = None
    auto_applied = False
    if should_auto:
        try:
            applied = await apply_action(db, user_id, row.id)
            auto_applied = True
            result_message = applied.get("message")
        except Exception as e:  # noqa: BLE001
            print(f"[dispatch] auto-apply failed for {row.id}: {e}")

    # Reload to reflect any status change
    await db.refresh(row)

    return {
        "action_id": str(row.id),
        "action_kind": row.action_kind,
        "status": row.status,
        "proposal": row.proposal,
        "auto_applied": auto_applied,
        "message": result_message,
    }


# =====================================================================
# list + get
# =====================================================================


async def list_actions(
    db: AsyncSession,
    user_id: str,
    *,
    status: str | None = None,
    since: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """
    List agent actions for a user, newest first.

    `since` -- ISO timestamp; only actions created at or after this
    instant are returned. Used by the chat panel to scope proposals
    to the current conversation.
    """
    from datetime import datetime as _dt

    stmt = select(AgentAction).where(AgentAction.user_id == user_id)
    if status:
        stmt = stmt.where(AgentAction.status == status)
    if since:
        try:
            since_dt = _dt.fromisoformat(since.replace("Z", "+00:00"))
            stmt = stmt.where(AgentAction.created_at >= since_dt)
        except Exception as e:  # noqa: BLE001
            print(f"[list_actions] bad 'since' value '{since}': {e}")
    stmt = stmt.order_by(AgentAction.created_at.desc()).limit(limit)
    rows = list((await db.execute(stmt)).scalars().all())
    return [_row_to_dict(r) for r in rows]


async def get_action(
    db: AsyncSession, user_id: str, action_id: str
) -> dict | None:
    row = (await db.execute(
        select(AgentAction).where(
            AgentAction.id == action_id,
            AgentAction.user_id == user_id,
        )
    )).scalar_one_or_none()
    return _row_to_dict(row) if row else None


def _row_to_dict(r: AgentAction) -> dict:
    return {
        "id": str(r.id),
        "action_kind": r.action_kind,
        "instruction": r.instruction,
        "proposal": r.proposal,
        "status": r.status,
        "result": r.result,
        "snapshot": r.snapshot,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "applied_at": r.applied_at.isoformat() if r.applied_at else None,
        "undone_at": r.undone_at.isoformat() if r.undone_at else None,
        "expires_at": r.expires_at.isoformat() if r.expires_at else None,
    }


# =====================================================================
# apply / reject / undo
# =====================================================================


async def apply_action(
    db: AsyncSession, user_id: str, action_id: str
) -> dict:
    """
    Apply a pending proposal. Idempotent -- calling twice on the same
    applied row is a no-op.
    """
    row = (await db.execute(
        select(AgentAction).where(
            AgentAction.id == action_id,
            AgentAction.user_id == user_id,
        )
    )).scalar_one_or_none()
    if row is None:
        raise ValueError("Action not found")
    if row.status == "applied":
        return _row_to_dict(row)
    if row.status != "pending":
        raise ValueError(f"Cannot apply from status '{row.status}'")

    # Expiry check
    if row.expires_at:
        exp = row.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            row.status = "failed"
            row.result = {"ok": False, "message": "Proposal expired"}
            await db.commit()
            raise ValueError("Proposal expired")

    agent = get_agent(row.action_kind)
    if agent is None:
        row.status = "failed"
        row.result = {"ok": False, "message": "Agent not available"}
        await db.commit()
        raise ValueError("Agent not available")

    proposal = Proposal.from_dict(row.proposal or {})
    try:
        result = await agent.apply(db, proposal)
    except Exception as e:  # noqa: BLE001
        row.status = "failed"
        row.result = {"ok": False, "message": str(e)}
        await db.commit()
        raise

    row.status = "applied" if result.ok else "failed"
    row.result = result.to_dict()
    row.snapshot = result.snapshot or {}
    row.applied_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return _row_to_dict(row)


async def reject_action(
    db: AsyncSession, user_id: str, action_id: str
) -> dict:
    row = (await db.execute(
        select(AgentAction).where(
            AgentAction.id == action_id,
            AgentAction.user_id == user_id,
        )
    )).scalar_one_or_none()
    if row is None:
        raise ValueError("Action not found")
    if row.status != "pending":
        return _row_to_dict(row)
    row.status = "rejected"
    await db.commit()
    await db.refresh(row)
    return _row_to_dict(row)


async def undo_action(
    db: AsyncSession, user_id: str, action_id: str
) -> dict:
    """
    Reverse an applied action using its snapshot. Delegates to the
    agent module if it defines custom undo, else uses the generic
    inverse in app/services/actions/undo.py.
    """
    row = (await db.execute(
        select(AgentAction).where(
            AgentAction.id == action_id,
            AgentAction.user_id == user_id,
        )
    )).scalar_one_or_none()
    if row is None:
        raise ValueError("Action not found")
    if row.status != "applied":
        raise ValueError(f"Cannot undo from status '{row.status}'")

    from app.services.actions.undo import apply_inverse

    try:
        await apply_inverse(db, user_id, row.snapshot or {})
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"Undo failed: {e}")

    row.status = "undone"
    row.undone_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return _row_to_dict(row)
