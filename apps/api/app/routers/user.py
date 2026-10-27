"""
User account + preferences API.

Endpoints:
  GET    /user/prefs       ->  read prefs
  PATCH  /user/prefs       ->  update prefs (voice, consent)
  GET    /user/export      ->  download a JSON bundle of everything
  DELETE /user/chats       ->  wipe all chats (keeps captures/graph)
  DELETE /user/account     ->  wipe everything + the Clerk user
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import delete as sql_delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.models import (
    Notification,
    ChatConversation,
    ChatMessageRecord,
    Decision,
    FeedbackReply,
    FeedbackTicket,
    Goal,
    Node,
    Reflection,
    User,
)
from app.db.session import get_db
from app.services import prefs_user as prefs_service

router = APIRouter(prefix="/user", tags=["user"])


# =====================================================================
# prefs
# =====================================================================


class PrefsUpdateRequest(BaseModel):
    voice: str | None = Field(None, max_length=32)
    data_contribution_optin: bool | None = None
    # Tier 4 -- per-kind approval overrides for agentic actions.
    # Shape: {"find_orphans": true, "suggest_links": false, ...}
    # Sanitized server-side to known kinds + boolean values.
    agent_auto_apply: dict | None = None
    # Tier 5.5 -- consent: whether Cortex may send captures to Groq /
    # Gemini for concept extraction, classification, and vision.
    # Persisted per-user so it survives across devices.
    ai_processing: bool | None = None


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host if request.client else "unknown"


@router.get("/prefs", response_model=dict)
async def get_prefs_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await prefs_service.get_prefs(db, str(user.id))
    return prefs_service.prefs_to_dict(row)


@router.patch("/prefs", response_model=dict)
async def update_prefs_endpoint(
    payload: PrefsUpdateRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await prefs_service.update_prefs(
        db,
        str(user.id),
        voice=payload.voice,
        data_contribution_optin=payload.data_contribution_optin,
        agent_auto_apply=payload.agent_auto_apply,
        ai_processing=payload.ai_processing,
        client_ip=_client_ip(request),
    )
    return prefs_service.prefs_to_dict(row)


# =====================================================================
# export
# =====================================================================


@router.get("/export")
async def export_data_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a JSON bundle of everything the user has captured."""
    uid = str(user.id)

    payload: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "user": {
            "id": uid,
            "email": user.email,
            "name": user.name,
        },
        "captures": [],
        "decisions": [],
        "reflections": [],
        "goals": [],
        "conversations": [],
        "tickets": [],
    }

    # Captures / nodes
    rows = (await db.execute(select(Node).where(Node.user_id == uid))).scalars().all()
    payload["captures"] = [
        {
            "id": str(n.id),
            "type": n.type,
            "title": n.title,
            "content": n.content,
            "summary": n.summary,
            "confidence": n.confidence,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in rows
    ]

    # Decisions
    rows = (await db.execute(select(Decision).where(Decision.user_id == uid))).scalars().all()
    payload["decisions"] = [
        {
            "id": str(d.id),
            "question": d.question,
            "context": d.context,
            "chosen_option": d.chosen_option,
            "reasoning": d.reasoning,
            "expected_outcome": d.expected_outcome,
            "actual_outcome": d.actual_outcome,
            "lesson": d.lesson,
            "status": d.status,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        }
        for d in rows
    ]

    # Reflections
    rows = (await db.execute(select(Reflection).where(Reflection.user_id == uid))).scalars().all()
    payload["reflections"] = [
        {
            "id": str(r.id),
            "kind": r.kind,
            "title": r.title,
            "content": r.content,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]

    # Goals
    rows = (await db.execute(select(Goal).where(Goal.user_id == uid))).scalars().all()
    payload["goals"] = [
        {
            "id": str(g.id),
            "title": g.title,
            "description": g.description,
            "status": g.status,
            "created_at": g.created_at.isoformat() if g.created_at else None,
        }
        for g in rows
    ]

    # Conversations (metadata only --- messages are large)
    convs = (
        await db.execute(select(ChatConversation).where(ChatConversation.user_id == uid))
    ).scalars().all()
    payload["conversations"] = [
        {
            "id": str(c.id),
            "title": c.title,
            "message_count": c.message_count,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in convs
    ]

    # Tickets
    rows = (
        await db.execute(select(FeedbackTicket).where(FeedbackTicket.user_id == uid))
    ).scalars().all()
    payload["tickets"] = [
        {
            "id": str(t.id),
            "category": t.category,
            "subject": t.subject,
            "description": t.description,
            "status": t.status,
            "priority": t.priority,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in rows
    ]

    body = json.dumps(payload, indent=2, default=str)
    filename = f"cortex-export-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.json"

    return Response(
        content=body,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


# =====================================================================
# delete chats
# =====================================================================


@router.delete("/chats")
async def delete_chats_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete all of the user's chat conversations + messages.
    Keeps captures, decisions, reflections, tickets --- only chats go.
    """
    uid = str(user.id)

    conv_ids = (
        await db.execute(select(ChatConversation.id).where(ChatConversation.user_id == uid))
    ).scalars().all()

    if conv_ids:
        await db.execute(
            sql_delete(ChatMessageRecord).where(
                ChatMessageRecord.conversation_id.in_(conv_ids)
            )
        )
        await db.execute(
            sql_delete(ChatConversation).where(ChatConversation.id.in_(conv_ids))
        )
        await db.commit()

    return {"ok": True, "deleted_conversations": len(conv_ids)}


# =====================================================================
# delete account
# =====================================================================


@router.delete("/account")
async def delete_account_endpoint(
    confirm_email: str = Query(..., description="Must match the user's email"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Permanently delete the user's account + all data.

    Requires confirm_email to match the user's email exactly.
    Also deletes the Clerk user (best-effort).
    """
    if (confirm_email or "").strip().lower() != (user.email or "").strip().lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="email_mismatch",
        )

    uid = str(user.id)

    # Best-effort Clerk deletion first, so we don't leave a login pointing
    # at a deleted account if our DB delete succeeds but Clerk fails.
    try:
        from app.services import clerk as clerk_service

        if hasattr(clerk_service, "delete_user"):
            await clerk_service.delete_user(str(user.id))
    except Exception as e:  # noqa: BLE001
        print(f"[user] clerk delete failed (non-fatal): {e}")

    # --- Local data ---
    try:
        # Delete children first (some tables don't have cascade from user)
        await db.execute(
            sql_delete(ChatMessageRecord).where(
                ChatMessageRecord.conversation_id.in_(
                    select(ChatConversation.id).where(ChatConversation.user_id == uid)
                )
            )
        )
        await db.execute(sql_delete(ChatConversation).where(ChatConversation.user_id == uid))

        await db.execute(
            sql_delete(FeedbackReply).where(
                FeedbackReply.ticket_id.in_(
                    select(FeedbackTicket.id).where(FeedbackTicket.user_id == uid)
                )
            )
        )
        await db.execute(sql_delete(FeedbackTicket).where(FeedbackTicket.user_id == uid))

        # Everything else has ondelete=CASCADE from users --- removing
        # the user row cleans up nodes, edges, embeddings, decisions,
        # reflections, goals, self_model, identity snapshots, api_tokens,
        # and the prefs tables.
        await db.execute(sql_delete(User).where(User.id == uid))
        await db.commit()
    except Exception as e:  # noqa: BLE001
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"delete_failed: {e}")

    return {"ok": True}


# =====================================================================
# Notifications
# =====================================================================


class NotificationReadResponse(BaseModel):
    ok: bool = True


@router.get("/notifications", response_model=dict)
async def list_notifications_endpoint(
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the current user's notifications (most recent first).

    Filters out notifications past their expires_at, and hides any whose
    associated ticket was deleted.
    """
    from datetime import datetime, timezone
    from sqlalchemy import or_

    now = datetime.now(timezone.utc)
    stmt = (
        select(Notification)
        .where(Notification.user_id == str(user.id))
        .where(
            or_(
                Notification.expires_at.is_(None),
                Notification.expires_at > now,
            )
        )
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()

    # Count unread
    unread = sum(1 for r in rows if r.read_at is None)

    items = [
        {
            "id": str(r.id),
            "event_kind": r.event_kind,
            "title": r.title,
            "body": r.body,
            "ticket_id": str(r.ticket_id) if r.ticket_id else None,
            "ticket_subject": r.ticket_subject,
            "click_url": r.click_url,
            "extra": r.extra or {},
            "read": r.read_at is not None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]

    return {"items": items, "unread_count": unread}


@router.post("/notifications/{notification_id}/read", response_model=NotificationReadResponse)
async def mark_notification_read(
    notification_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone

    row = (await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == str(user.id),
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="not_found")
    if row.read_at is None:
        row.read_at = datetime.now(timezone.utc)
        await db.commit()
    return NotificationReadResponse(ok=True)


@router.post("/notifications/read-all", response_model=NotificationReadResponse)
async def mark_all_notifications_read(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone
    from sqlalchemy import update

    now = datetime.now(timezone.utc)
    await db.execute(
        update(Notification)
        .where(Notification.user_id == str(user.id))
        .where(Notification.read_at.is_(None))
        .values(read_at=now)
    )
    await db.commit()
    return NotificationReadResponse(ok=True)


@router.delete("/notifications/{notification_id}", response_model=NotificationReadResponse)
async def delete_notification(
    notification_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import delete as sql_delete

    await db.execute(
        sql_delete(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == str(user.id),
        )
    )
    await db.commit()
    return NotificationReadResponse(ok=True)


@router.delete("/notifications", response_model=NotificationReadResponse)
async def clear_all_notifications(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import delete as sql_delete

    await db.execute(
        sql_delete(Notification).where(Notification.user_id == str(user.id))
    )
    await db.commit()
    return NotificationReadResponse(ok=True)
