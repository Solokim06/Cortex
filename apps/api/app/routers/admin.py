"""
Admin API — the triage surface.

Prefix: /admin
Auth:   all endpoints require role=admin (except /me, which requires
        role>=agent so the frontend can decide whether to show the nav).

Sections:
  - identity         /me
  - impersonation    /impersonate/*
  - tickets          /tickets/*
  - search           /search
  - bulk             /tickets/bulk
  - export           /tickets/export
  - macros           /macros/*  (+ preview, + reply-with-macro)
  - stats / tags     /stats, /tags
  - users            /users/*
  - sla              /sla/*
  - webhooks         /webhooks/*
  - maintenance      /maintenance/*      (Wave C)
  - prefs            /prefs               (Wave C)
  - stream           /stream              (Wave C — SSE)
  - diagnostics      /health              (Wave C)
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    status,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import (
    actor_user_id_for,
    get_current_admin,
    get_current_agent,
    get_impersonation_context,
)
from app.db.models import User
from app.db.session import get_db
from app.services import analytics as analytics_service
from app.services import email as email_service
from app.services import email_retry as email_retry_service
from app.services import export as export_service
from app.services import feedback as feedback_service
from app.services import impersonation as imp_service
from app.services import macros as macros_service
from app.services import maintenance as maintenance_service
from app.services import prefs as prefs_service
from app.services import pubsub as pubsub_service
from app.services import roles as roles_service
from app.services import sla as sla_service
from app.services import sla_jobs as sla_jobs_service
from app.services import ticket_events as events_service
from app.services import triage as triage_service
from app.services import webhook_retry as webhook_retry_service
from app.services import webhooks as webhooks_service

router = APIRouter(prefix="/admin", tags=["admin"])


# =====================================================================
# request models
# =====================================================================


class ImpersonateRequest(BaseModel):
    reason: str | None = Field(None, max_length=500)


class EndImpersonationRequest(BaseModel):
    session_id: str


class StatusChangeRequest(BaseModel):
    status: str = Field(..., pattern="^(open|in_progress|resolved|closed)$")
    expected_updated_at: datetime | None = None


class PriorityChangeRequest(BaseModel):
    priority: str = Field(..., pattern="^(low|normal|high|urgent)$")


class AssignRequest(BaseModel):
    user_id: str | None = None


class ReplyRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)


class NoteRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)


class TagRequest(BaseModel):
    tag: str = Field(..., min_length=1, max_length=64)


class RoleChangeRequest(BaseModel):
    role: str = Field(..., pattern="^(user|agent|admin)$")


class SlaPolicyUpdateRequest(BaseModel):
    first_response_minutes: int = Field(..., ge=1, le=100000)
    resolution_minutes: int = Field(..., ge=1, le=100000)


class MacroCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    body: str = Field(..., min_length=1, max_length=10000)
    tags: list[str] = Field(default_factory=list)


class MacroUpdateRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=120)
    body: str | None = Field(None, min_length=1, max_length=10000)
    tags: list[str] | None = None


class WebhookCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    url: str = Field(..., min_length=4, max_length=2000)
    events: list[str] = Field(default_factory=lambda: ["*"])
    secret: str | None = Field(None, max_length=256)


class WebhookUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    url: str | None = Field(None, min_length=4, max_length=2000)
    events: list[str] | None = None
    secret: str | None = None
    is_active: bool | None = None


class BulkUpdateRequest(BaseModel):
    ticket_ids: list[str] = Field(..., min_length=1, max_length=500)
    status: str | None = Field(None, pattern="^(open|in_progress|resolved|closed)$")
    priority: str | None = Field(None, pattern="^(low|normal|high|urgent)$")
    assign_to_user_id: str | None = None
    assign_to_me: bool = False
    add_tag: str | None = Field(None, max_length=64)


class MacroReplyRequest(BaseModel):
    macro_id: str
    extra_note: str | None = Field(None, max_length=4000)
    override_body: str | None = Field(None, max_length=10000)


class TriageRequest(BaseModel):
    force: bool = False


class RedactUserRequest(BaseModel):
    user_id: str
    reason: str | None = Field(None, max_length=500)


class PurgeTicketsRequest(BaseModel):
    older_than_days: int = Field(180, ge=1, le=3650)
    dry_run: bool = True


class PurgeDeliveriesRequest(BaseModel):
    older_than_days: int = Field(30, ge=1, le=3650)
    keep_failures: bool = True
    dry_run: bool = True


class PrefsUpdateRequest(BaseModel):
    email_on_new_ticket: bool | None = None
    email_on_assignment: bool | None = None
    email_on_user_reply: bool | None = None
    email_on_sla_breach: bool | None = None
    email_digest_daily: bool | None = None


# =====================================================================
# email — request models
# =====================================================================


class TestEmailRequest(BaseModel):
    to: str = Field(..., min_length=3, max_length=320)
    template: str = Field(
        "new_ticket",
        pattern="^(new_ticket|assignment|user_reply|sla_breach)$",
    )


class SuppressEmailRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    reason: str = Field("manual", max_length=64)
    note: str | None = Field(None, max_length=500)


class EmailPrefsUpdateRequest(BaseModel):
    enabled: bool


# =====================================================================
# identity
# =====================================================================


@router.get("/me")
async def admin_me(
    request: Request,
    user: User = Depends(get_current_agent),
):
    ctx = get_impersonation_context(request)
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "is_admin": roles_service.is_admin(user),
        "is_agent": roles_service.is_agent(user),
        "impersonating": (
            {
                "session_id": ctx.session_id,
                "admin_user_id": ctx.admin_user_id,
            }
            if ctx
            else None
        ),
    }


# =====================================================================
# impersonation
# =====================================================================


@router.post("/impersonate/{user_id}")
async def impersonate_user(
    user_id: str,
    payload: ImpersonateRequest,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        session, token = await imp_service.start_session(
            db,
            admin_user_id=str(admin.id),
            target_user_id=user_id,
            reason=payload.reason,
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except imp_service.ImpersonationError as e:
        raise HTTPException(status_code=400, detail=str(e))

    target = await feedback_service.get_user_by_id(db, user_id)
    from app.config.settings import settings

    return {
        "session": imp_service.session_to_dict(
            session,
            admin_email=admin.email,
            target_email=target.email if target else None,
        ),
        "token": token,
        "ttl_minutes": settings.impersonation_ttl_minutes,
    }


@router.post("/impersonate/end")
async def end_impersonation(
    payload: EndImpersonationRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    session = await imp_service.end_session(
        db, session_id=payload.session_id, ended_by_user_id=str(admin.id)
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return imp_service.session_to_dict(session)


@router.post("/impersonate/end-all")
async def end_all_impersonations(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    n = await imp_service.end_all_for_admin(db, str(admin.id))
    return {"ended": n}


@router.get("/impersonation/active")
async def list_active_impersonations(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    sessions = await imp_service.list_active_sessions(db)
    out = []
    for s in sessions:
        admin_u = await feedback_service.get_user_by_id(db, s.admin_user_id)
        target_u = await feedback_service.get_user_by_id(db, s.target_user_id)
        out.append(
            imp_service.session_to_dict(
                s,
                admin_email=admin_u.email if admin_u else None,
                target_email=target_u.email if target_u else None,
            )
        )
    return out


# =====================================================================
# tickets — list & detail
# =====================================================================


@router.get("/tickets")
async def list_tickets_admin(
    status_: str | None = Query(None, alias="status"),
    priority: str | None = None,
    category: str | None = None,
    assigned_to_user_id: str | None = None,
    unassigned: bool = False,
    search: str | None = None,
    tag: str | None = None,
    breached: bool | None = None,
    sort: str = "updated_desc",
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: User = Depends(get_current_admin),
    show_hidden: bool | None = Query(
        None,
        description="true = only cleared tickets, false = include all, null = default (hide cleared)",
    ),
    db: AsyncSession = Depends(get_db),
):
    tickets = await feedback_service.list_all_tickets(
        db,
        status=status_,
        priority=priority,
        category=category,
        assigned_to_user_id=assigned_to_user_id,
        unassigned=unassigned,
        search=search,
        tag=tag,
        breached=breached,
        sort=sort,
        limit=limit,
        offset=offset,
        show_hidden=show_hidden,
    )
    total = await feedback_service.count_tickets(
        db,
        status=status_,
        priority=priority,
        category=category,
        assigned_to_user_id=assigned_to_user_id,
        unassigned=unassigned,
        search=search,
        tag=tag,
        show_hidden=show_hidden,
    )

    items = []
    for t in tickets:
        filer = await feedback_service.get_user_by_id(db, t.user_id)
        assignee = (
            await feedback_service.get_user_by_id(db, t.assigned_to_user_id)
            if t.assigned_to_user_id
            else None
        )
        items.append(feedback_service.ticket_admin_summary(t, filer, assignee))

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(items) < total,
    }


@router.get("/tickets/{ticket_id}")
async def get_ticket_admin(
    ticket_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    ticket = await feedback_service.get_ticket_any(db, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return await feedback_service.ticket_admin_detail(db, ticket)


# =====================================================================
# tickets — mutations
# =====================================================================


@router.patch("/tickets/{ticket_id}/status")
async def change_status(
    ticket_id: str,
    payload: StatusChangeRequest,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    actor_id = actor_user_id_for(request, admin)
    existing = await feedback_service.get_ticket_any(db, ticket_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if payload.expected_updated_at is not None:
        cur = existing.updated_at
        if cur.tzinfo is None:
            cur = cur.replace(tzinfo=payload.expected_updated_at.tzinfo)
        exp = payload.expected_updated_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=cur.tzinfo)
        if abs((cur - exp).total_seconds()) > 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ticket was modified by someone else. Refresh and retry.",
            )

    updated = await feedback_service.admin_status_change(
        db,
        ticket_id=ticket_id,
        new_status=payload.status,
        actor_user_id=actor_id,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    await pubsub_service.emit_ticket_event(
        "ticket.status_changed",
        ticket_id,
        data={"status": updated.status},
    )
    return {"ok": True, "status": updated.status}


@router.patch("/tickets/{ticket_id}/priority")
async def change_priority(
    ticket_id: str,
    payload: PriorityChangeRequest,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    actor_id = actor_user_id_for(request, admin)
    try:
        updated = await feedback_service.set_priority(
            db,
            ticket_id=ticket_id,
            new_priority=payload.priority,
            actor_user_id=actor_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if updated is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    await pubsub_service.emit_ticket_event(
        "ticket.priority_changed",
        ticket_id,
        data={"priority": updated.priority},
    )
    return {"ok": True, "priority": updated.priority}


@router.patch("/tickets/{ticket_id}/assign")
async def assign(
    ticket_id: str,
    payload: AssignRequest,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    actor_id = actor_user_id_for(request, admin)
    try:
        updated = await feedback_service.assign_ticket(
            db,
            ticket_id=ticket_id,
            assignee_user_id=payload.user_id,
            actor_user_id=actor_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if updated is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    await pubsub_service.emit_ticket_event(
        "ticket.assigned",
        ticket_id,
        data={"assigned_to_user_id": updated.assigned_to_user_id},
    )
    return {"ok": True, "assigned_to_user_id": updated.assigned_to_user_id}


@router.post("/tickets/{ticket_id}/reply")
async def team_reply(
    ticket_id: str,
    payload: ReplyRequest,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    actor_id = actor_user_id_for(request, admin)
    reply = await feedback_service.add_team_reply_with_event(
        db,
        ticket_id=ticket_id,
        content=payload.content,
        actor_user_id=actor_id,
    )
    if reply is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    await pubsub_service.emit_ticket_event(
        "ticket.replied",
        ticket_id,
        data={"reply_id": str(reply.id), "author": "team"},
    )
    return {
        "ok": True,
        "reply": {
            "id": str(reply.id),
            "author": reply.author,
            "content": reply.content,
            "created_at": reply.created_at.isoformat(),
        },
    }


@router.post("/tickets/{ticket_id}/note")
async def add_note(
    ticket_id: str,
    payload: NoteRequest,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    actor_id = actor_user_id_for(request, admin)
    note = await feedback_service.add_note(
        db,
        ticket_id=ticket_id,
        content=payload.content,
        actor_user_id=actor_id,
    )
    if note is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {
        "ok": True,
        "note": {
            "id": str(note.id),
            "author": note.author,
            "content": note.content,
            "created_at": note.created_at.isoformat(),
        },
    }


@router.post("/tickets/{ticket_id}/tags")
async def add_ticket_tag(
    ticket_id: str,
    payload: TagRequest,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    actor_id = actor_user_id_for(request, admin)
    tags = await feedback_service.add_tag(
        db,
        ticket_id=ticket_id,
        tag=payload.tag,
        actor_user_id=actor_id,
    )
    return {"ok": True, "tags": tags}


@router.delete("/tickets/{ticket_id}/tags/{tag}")
async def remove_ticket_tag(
    ticket_id: str,
    tag: str,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    actor_id = actor_user_id_for(request, admin)
    tags = await feedback_service.remove_tag(
        db,
        ticket_id=ticket_id,
        tag=tag,
        actor_user_id=actor_id,
    )
    return {"ok": True, "tags": tags}


@router.get("/tickets/{ticket_id}/events")
async def ticket_events(
    ticket_id: str,
    include_system: bool = True,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    events = await events_service.list_events(
        db,
        ticket_id,
        include_system=include_system,
        limit=limit,
        offset=offset,
    )
    return [events_service.event_to_dict(e) for e in events]


# =====================================================================
# tickets — AI triage
# =====================================================================


@router.post("/tickets/{ticket_id}/triage")
async def triage_ticket(
    ticket_id: str,
    payload: TriageRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await triage_service.triage_ticket(
            db, ticket_id, force=payload.force
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Triage failed: {e}")
    return result


@router.post("/tickets/{ticket_id}/triage/approve-draft")
async def approve_draft_reply(
    ticket_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Send the AI-generated draft reply as a real team reply.
    Also clears the draft so it can't be sent twice.
    """
    from app.services import triage as triage_service

    result = await triage_service.approve_draft(db, ticket_id, admin_user_id=str(admin.id))
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("reason", "Not found"))
    return result


@router.post("/tickets/{ticket_id}/triage/discard-draft")
async def discard_draft_reply(
    ticket_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Remove the AI draft reply from the ticket without sending it."""
    from app.services import triage as triage_service

    ok = await triage_service.discard_draft(db, ticket_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {"ok": True}


@router.post("/tickets/{ticket_id}/hide")
async def hide_ticket_endpoint(
    ticket_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """Hide a resolved/closed ticket from the admin list."""
    actor = actor_user_id_for(request, admin) if request else str(admin.id)
    result = await feedback_service.hide_ticket(
        db, ticket_id, actor_user_id=actor,
    )
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("reason", "hide_failed"))
    return result


@router.post("/tickets/{ticket_id}/restore")
async def restore_ticket_endpoint(
    ticket_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """Restore a previously cleared ticket."""
    actor = actor_user_id_for(request, admin) if request else str(admin.id)
    result = await feedback_service.restore_ticket(
        db, ticket_id, actor_user_id=actor,
    )
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("reason", "not_found"))
    return result


@router.post("/tickets/bulk-hide")
async def bulk_hide_tickets(
    payload: BulkUpdateRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """Hide many tickets at once. Skips ones that aren't resolved/closed."""
    actor = actor_user_id_for(request, admin) if request else str(admin.id)
    hidden = 0
    skipped: list[dict] = []
    for tid in payload.ticket_ids:
        r = await feedback_service.hide_ticket(db, tid, actor_user_id=actor)
        if r.get("ok"):
            hidden += 1
        else:
            skipped.append({"id": tid, "reason": r.get("reason")})
    return {"hidden": hidden, "skipped": skipped}


@router.delete("/tickets/{ticket_id}/triage")
async def clear_triage_cache(
    ticket_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    ok = await triage_service.clear_cache(db, ticket_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {"ok": True}


# =====================================================================
# search
# =====================================================================


@router.get("/search")
async def search_tickets(
    q: str = Query(..., min_length=1, max_length=200),
    status_: str | None = Query(None, alias="status"),
    priority: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    results, total = await feedback_service.search_tickets(
        db,
        query=q,
        status=status_,
        priority=priority,
        limit=limit,
        offset=offset,
    )

    items = []
    for t, rank in results:
        filer = await feedback_service.get_user_by_id(db, t.user_id)
        assignee = (
            await feedback_service.get_user_by_id(db, t.assigned_to_user_id)
            if t.assigned_to_user_id
            else None
        )
        summary = feedback_service.ticket_admin_summary(t, filer, assignee)
        summary["rank"] = rank
        items.append(summary)

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(items) < total,
        "query": q,
    }


# =====================================================================
# bulk
# =====================================================================


@router.post("/tickets/bulk")
async def bulk_update(
    payload: BulkUpdateRequest,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    actor_id = actor_user_id_for(request, admin)
    try:
        result = await feedback_service.bulk_update(
            db,
            ticket_ids=payload.ticket_ids,
            actor_user_id=actor_id,
            status=payload.status,
            priority=payload.priority,
            assign_to_user_id=payload.assign_to_user_id,
            assign_to_me_user_id=str(admin.id) if payload.assign_to_me else None,
            add_tag_value=payload.add_tag,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await pubsub_service.publish(
        {
            "kind": "tickets.bulk_updated",
            "data": {
                "updated": result["updated"],
                "skipped": result["skipped"],
            },
        }
    )
    return result


# =====================================================================
# export
# =====================================================================


@router.get("/tickets/export")
async def export_tickets(
    fmt: str = Query("csv", pattern="^(csv|json)$"),
    status_: str | None = Query(None, alias="status"),
    priority: str | None = None,
    category: str | None = None,
    assigned_to_user_id: str | None = None,
    unassigned: bool = False,
    search: str | None = None,
    tag: str | None = None,
    limit: int = Query(5000, ge=1, le=20000),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    filters = dict(
        status=status_,
        priority=priority,
        category=category,
        assigned_to_user_id=assigned_to_user_id,
        unassigned=unassigned,
        search=search,
        tag=tag,
        limit=limit,
    )

    if fmt == "csv":
        gen = export_service.export_csv(db, **filters)
        media_type = "text/csv"
    else:
        gen = export_service.export_json(db, **filters)
        media_type = "application/json"

    filename = export_service.export_filename(fmt)

    return StreamingResponse(
        gen,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


# =====================================================================
# stats / tags
# =====================================================================


@router.get("/stats")
async def admin_stats(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    return await feedback_service.admin_stats(db)


@router.get("/tags")
async def all_tags(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    pairs = await feedback_service.list_all_tags(db)
    return [{"tag": t, "count": c} for t, c in pairs]


# =====================================================================
# users
# =====================================================================


@router.get("/users")
async def list_users(
    search: str | None = None,
    role: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    users = await roles_service.list_users_with_roles(
        db, search=search, role=role, limit=limit, offset=offset
    )
    return [
        {
            "id": str(u.id),
            "email": u.email,
            "name": u.name,
            "role": u.role,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.patch("/users/{user_id}/role")
async def set_user_role(
    user_id: str,
    payload: RoleChangeRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    updated = await roles_service.set_role(db, user_id, payload.role)
    if updated is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "ok": True,
        "id": str(updated.id),
        "email": updated.email,
        "role": updated.role,
    }


# =====================================================================
# sla
# =====================================================================


@router.get("/sla/policies")
async def list_sla_policies(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    policies = await sla_service.list_policies(db)
    return [
        {
            "priority": p.priority,
            "first_response_minutes": p.first_response_minutes,
            "resolution_minutes": p.resolution_minutes,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        }
        for p in policies
    ]


@router.put("/sla/policies/{priority}")
async def update_sla_policy(
    priority: str,
    payload: SlaPolicyUpdateRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    updated = await sla_service.update_policy(
        db,
        priority,
        first_response_minutes=payload.first_response_minutes,
        resolution_minutes=payload.resolution_minutes,
        updated_by_user_id=str(admin.id),
    )
    if updated is None:
        raise HTTPException(status_code=400, detail="Invalid priority")
    return {
        "priority": updated.priority,
        "first_response_minutes": updated.first_response_minutes,
        "resolution_minutes": updated.resolution_minutes,
    }


@router.get("/sla/near-breach")
async def near_breach(
    within_minutes: int = Query(60, ge=1, le=1440),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Open tickets whose first_response or resolution SLA will breach soon."""
    tickets = await sla_jobs_service.near_breach_tickets(
        db, within_minutes=within_minutes
    )
    items = []
    for t in tickets:
        filer = await feedback_service.get_user_by_id(db, t.user_id)
        assignee = (
            await feedback_service.get_user_by_id(db, t.assigned_to_user_id)
            if t.assigned_to_user_id
            else None
        )
        items.append(feedback_service.ticket_admin_summary(t, filer, assignee))
    return {"items": items, "within_minutes": within_minutes}


@router.post("/sla/scan-now")
async def trigger_sla_scan(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Run an SLA breach scan immediately. Returns stats."""
    stats = await sla_jobs_service.scan_sla_breaches(db)
    return stats


# =====================================================================
# macros
# =====================================================================


@router.get("/macros")
async def list_macros(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    macros = await feedback_service.list_all_macros(db)
    return [feedback_service.macro_to_dict(m) for m in macros]


@router.post("/macros")
async def create_macro(
    payload: MacroCreateRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    macro = await feedback_service.create_macro(
        db,
        title=payload.title,
        body=payload.body,
        tags=payload.tags,
        actor_user_id=str(admin.id),
    )
    return feedback_service.macro_to_dict(macro)


@router.patch("/macros/{macro_id}")
async def update_macro(
    macro_id: str,
    payload: MacroUpdateRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    macro = await feedback_service.update_macro(
        db,
        macro_id,
        title=payload.title,
        body=payload.body,
        tags=payload.tags,
    )
    if macro is None:
        raise HTTPException(status_code=404, detail="Macro not found")
    return feedback_service.macro_to_dict(macro)


@router.delete("/macros/{macro_id}")
async def delete_macro(
    macro_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    ok = await feedback_service.delete_macro(db, macro_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Macro not found")
    return {"ok": True}


@router.get("/macros/usage/stats")
async def macro_usage_stats(
    limit: int = Query(20, ge=1, le=100),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    return await macros_service.usage_stats(db, limit=limit)


@router.get("/tickets/{ticket_id}/macros/suggest")
async def suggest_macros_for_ticket(
    ticket_id: str,
    limit: int = Query(5, ge=1, le=20),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    macros = await macros_service.suggest_for_ticket(db, ticket_id, limit=limit)
    return [feedback_service.macro_to_dict(m) for m in macros]


@router.post("/tickets/{ticket_id}/macros/preview")
async def preview_macro_for_ticket(
    ticket_id: str,
    payload: MacroReplyRequest,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    actor_id = actor_user_id_for(request, admin)
    result = await macros_service.preview(
        db,
        ticket_id=ticket_id,
        macro_id=payload.macro_id,
        actor_user_id=actor_id,
        override_body=payload.override_body,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Ticket or macro not found")
    return result


@router.post("/tickets/{ticket_id}/reply-with-macro")
async def reply_with_macro(
    ticket_id: str,
    payload: MacroReplyRequest,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    actor_id = actor_user_id_for(request, admin)
    try:
        reply = await feedback_service.reply_with_macro(
            db,
            ticket_id=ticket_id,
            macro_id=payload.macro_id,
            actor_user_id=actor_id,
            extra_note=payload.extra_note,
            override_body=payload.override_body,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if reply is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    await pubsub_service.emit_ticket_event(
        "ticket.replied",
        ticket_id,
        data={"reply_id": str(reply.id), "author": "team", "via_macro": True},
    )
    return {
        "ok": True,
        "reply": {
            "id": str(reply.id),
            "author": reply.author,
            "content": reply.content,
            "created_at": reply.created_at.isoformat(),
        },
    }


# =====================================================================
# webhooks
# =====================================================================


@router.get("/webhooks")
async def list_webhooks(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    targets = await webhooks_service.list_targets(db)
    return [webhooks_service.target_to_dict(t) for t in targets]


@router.post("/webhooks")
async def create_webhook(
    payload: WebhookCreateRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    target = await webhooks_service.create_target(
        db,
        name=payload.name,
        url=payload.url,
        events=payload.events,
        secret=payload.secret,
        created_by_user_id=str(admin.id),
    )
    return webhooks_service.target_to_dict(target)


@router.patch("/webhooks/{target_id}")
async def update_webhook(
    target_id: str,
    payload: WebhookUpdateRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    target = await webhooks_service.update_target(
        db,
        target_id,
        name=payload.name,
        url=payload.url,
        events=payload.events,
        secret=payload.secret,
        is_active=payload.is_active,
    )
    if target is None:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return webhooks_service.target_to_dict(target)


@router.delete("/webhooks/{target_id}")
async def delete_webhook(
    target_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    ok = await webhooks_service.delete_target(db, target_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return {"ok": True}


@router.post("/webhooks/{target_id}/test")
async def test_webhook(
    target_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    delivery = await webhooks_service.test_target(db, target_id)
    if delivery is None:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return webhooks_service.delivery_to_dict(delivery)


@router.get("/webhooks/{target_id}/deliveries")
async def list_webhook_deliveries(
    target_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    deliveries = await webhooks_service.list_deliveries(
        db, target_id, limit=limit, offset=offset
    )
    return [webhooks_service.delivery_to_dict(d) for d in deliveries]


@router.post("/webhooks/retry-now")
async def trigger_webhook_retry(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    return await webhook_retry_service.retry_due_deliveries(db)




# =====================================================================
# analytics
# =====================================================================


def _resolve_analytics_window(
    days: int | None,
    from_date: str | None,
    to_date: str | None,
):
    """Wrap the service helper so we can raise HTTP errors uniformly."""
    try:
        return analytics_service.resolve_window(
            days=days, from_date=from_date, to_date=to_date
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            status_code=400, detail=f"Invalid date range: {e}"
        )


@router.get("/analytics/overview")
async def analytics_overview(
    days: int | None = Query(None, ge=1, le=365),
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Headline metrics for a date range.

    Range precedence:
      - explicit `from` / `to` (YYYY-MM-DD)
      - else `days` (default 30)
    """
    start, end = _resolve_analytics_window(days, from_date, to_date)
    return await analytics_service.overview(db, start=start, end=end)


@router.get("/analytics/timeseries")
async def analytics_timeseries(
    days: int | None = Query(None, ge=1, le=365),
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    granularity: str = Query("day", pattern="^(day|hour)$"),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Per-day (or per-hour) created/resolved counts within range."""
    start, end = _resolve_analytics_window(days, from_date, to_date)
    return await analytics_service.timeseries(
        db, start=start, end=end, granularity=granularity  # type: ignore[arg-type]
    )


@router.get("/analytics/breakdown")
async def analytics_breakdown(
    days: int | None = Query(None, ge=1, le=365),
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Category / priority / tag distribution within range."""
    start, end = _resolve_analytics_window(days, from_date, to_date)
    return await analytics_service.breakdown(db, start=start, end=end)


@router.get("/analytics/at-risk")
async def analytics_at_risk(
    within_minutes: int = Query(60, ge=5, le=10080),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Currently open tickets whose next SLA deadline is within N minutes
    (or already breached). Sorted by most urgent.
    """
    return await analytics_service.at_risk(
        db, within_minutes=within_minutes
    )


# =====================================================================
# notifications (real-time toasts + bell)
# =====================================================================


@router.get("/notifications/stream")
async def notifications_stream(
    request: Request,
    admin: User = Depends(get_current_admin),
):
    """
    SSE stream of admin notifications targeted at the current user.

    Filters by recipient server-side:
      - recipients_mode="admins"    → everyone
      - recipients_mode="assignee"  → only if user is in `recipients`
      - recipients_mode="explicit"  → only if user is in `recipients`

    Emits keep-alive pings every 25s.
    """
    from app.services import pubsub as pubsub_service

    my_id = str(admin.id)

    async def event_source():
        yield _sse_pack(
            {
                "kind": "connected",
                "at": datetime.now(timezone.utc).isoformat(),
                "user_id": my_id,
            }
        )

        last_ping = asyncio.get_event_loop().time()

        try:
            async for event in pubsub_service.subscribe():
                if await request.is_disconnected():
                    break

                if event.get("kind") == "notification":
                    notif = event.get("notification") or {}
                    mode = notif.get("recipients_mode")
                    recipients = notif.get("recipients") or []

                    if mode == "admins":
                        pass
                    elif mode in ("assignee", "explicit"):
                        if my_id not in recipients:
                            continue
                    else:
                        continue

                    yield _sse_pack(event)
                else:
                    yield _sse_pack(event)

                now = asyncio.get_event_loop().time()
                if now - last_ping > 25:
                    yield ": ping\n\n"
                    last_ping = now
        except asyncio.CancelledError:
            return
        except Exception as e:  # noqa: BLE001
            yield _sse_pack({"kind": "error", "message": str(e)})

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


_RECENT_NOTIFICATIONS: dict[str, list[dict]] = {}
_RECENT_LIMIT = 50


def _remember_notification(notif: dict) -> None:
    mode = notif.get("recipients_mode")
    recipients = notif.get("recipients") or []
    if mode == "admins":
        bucket = _RECENT_NOTIFICATIONS.setdefault("_all", [])
        bucket.insert(0, notif)
        del bucket[_RECENT_LIMIT:]
    else:
        for uid in recipients:
            bucket = _RECENT_NOTIFICATIONS.setdefault(uid, [])
            bucket.insert(0, notif)
            del bucket[_RECENT_LIMIT:]


async def _notifications_tailer() -> None:
    from app.services import pubsub as pubsub_service

    try:
        async for event in pubsub_service.subscribe():
            if event.get("kind") != "notification":
                continue
            notif = event.get("notification")
            if isinstance(notif, dict):
                _remember_notification(notif)
    except asyncio.CancelledError:
        return
    except Exception as e:  # noqa: BLE001
        print(f"[notifications] tailer error: {e}")


@router.get("/notifications/recent")
async def notifications_recent(
    limit: int = Query(20, ge=1, le=100),
    admin: User = Depends(get_current_admin),
):
    my_id = str(admin.id)
    mine = list(_RECENT_NOTIFICATIONS.get(my_id, []))
    broadcast = list(_RECENT_NOTIFICATIONS.get("_all", []))

    seen: set[str] = set()
    merged: list[dict] = []
    for n in mine + broadcast:
        nid = n.get("id")
        if nid in seen:
            continue
        seen.add(nid)
        merged.append(n)

    merged.sort(key=lambda n: n.get("at", ""), reverse=True)
    return merged[:limit]


# =====================================================================
# maintenance (Wave C)
# =====================================================================


@router.get("/maintenance/health")
async def maintenance_health(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Snapshot of table sizes + age extremes."""
    return await maintenance_service.data_health(db)


@router.post("/maintenance/redact-user")
async def redact_user(
    payload: RedactUserRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Anonymize a user's PII (GDPR-style). Tickets/replies are preserved
    but the user's email, name, and Clerk link are scrubbed.
    """
    return await maintenance_service.redact_user(
        db, payload.user_id, reason=payload.reason
    )


@router.post("/maintenance/purge-tickets")
async def purge_tickets(
    payload: PurgeTicketsRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete resolved/closed tickets older than N days. dry_run=True by default."""
    return await maintenance_service.purge_closed_tickets(
        db,
        older_than_days=payload.older_than_days,
        dry_run=payload.dry_run,
    )


@router.post("/maintenance/purge-deliveries")
async def purge_deliveries(
    payload: PurgeDeliveriesRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Trim old webhook deliveries. Keeps failed ones by default."""
    return await maintenance_service.purge_webhook_deliveries(
        db,
        older_than_days=payload.older_than_days,
        keep_failures=payload.keep_failures,
        dry_run=payload.dry_run,
    )


# =====================================================================
# prefs (Wave C)
# =====================================================================


@router.get("/prefs")
async def get_my_prefs(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    p = await prefs_service.get_prefs(db, str(admin.id))
    return prefs_service.prefs_to_dict(p)


@router.put("/prefs")
async def update_my_prefs(
    payload: PrefsUpdateRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    p = await prefs_service.update_prefs(
        db,
        str(admin.id),
        email_on_new_ticket=payload.email_on_new_ticket,
        email_on_assignment=payload.email_on_assignment,
        email_on_user_reply=payload.email_on_user_reply,
        email_on_sla_breach=payload.email_on_sla_breach,
        email_digest_daily=payload.email_digest_daily,
    )
    return prefs_service.prefs_to_dict(p)


@router.get("/prefs/recent-emails")
async def recent_emails(
    limit: int = Query(20, ge=1, le=100),
    admin: User = Depends(get_current_admin),
):
    """Debug endpoint — shows recently 'sent' emails (stub)."""
    return prefs_service.recent_sent(limit=limit)


# =====================================================================
# SSE stream (Wave C)
# =====================================================================


@router.get("/stream")
async def admin_stream(
    request: Request,
    admin: User = Depends(get_current_admin),
):
    """
    Server-Sent Events stream of admin events.

    Emits events as they're published to the pubsub bus (which happens
    on any admin mutation — status change, reply, assignment, bulk, etc.).

    Client-side, consume with:
        const es = new EventSource('/admin/stream')
        es.onmessage = (e) => console.log(JSON.parse(e.data))
    """

    async def event_source():
        # Initial hello so the client knows it's connected.
        yield _sse_pack(
            {
                "kind": "connected",
                "at": datetime.now(timezone.utc).isoformat(),
                "mode": pubsub_service.current_mode(),
            }
        )

        # Ping every 25s so proxies don't kill the connection.
        last_ping = asyncio.get_event_loop().time()

        try:
            async for event in pubsub_service.subscribe():
                # Client disconnected?
                if await request.is_disconnected():
                    break

                yield _sse_pack(event)

                now = asyncio.get_event_loop().time()
                if now - last_ping > 25:
                    yield ": ping\n\n"
                    last_ping = now
        except asyncio.CancelledError:
            return
        except Exception as e:  # noqa: BLE001
            yield _sse_pack({"kind": "error", "message": str(e)})

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _sse_pack(event: dict) -> str:
    """Format a dict as an SSE message chunk."""
    return f"data: {json.dumps(event, default=str)}\n\n"


# =====================================================================
# diagnostics (Wave C)
# =====================================================================


@router.get("/health/detailed")
async def admin_health_detailed(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Rich diagnostics payload for the admin health page.

    Combines subsystem probes, table row counts, pubsub mode, failed
    deliveries feed, SLA breach count, and feature flags. Never raises.
    """
    from app.services import status as status_service

    return await status_service.detailed_diagnostics()


@router.get("/health")
async def admin_health(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Combined health snapshot for the admin dashboard header."""
    from sqlalchemy import text

    # DB ping
    db_ok = True
    try:
        await db.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        db_ok = False

    # Data health
    data = await maintenance_service.data_health(db)

    # Recent failed deliveries count
    failed_deliveries = 0
    try:
        failed_deliveries = await webhook_retry_service.count_failed_deliveries(db) \
            if hasattr(webhook_retry_service, "count_failed_deliveries") else 0
    except Exception:  # noqa: BLE001
        pass

    return {
        "db_ok": db_ok,
        "pubsub_mode": pubsub_service.current_mode(),
        "pubsub_subscribers": pubsub_service.subscriber_count(),
        "data": data,
        "failed_webhook_deliveries": failed_deliveries,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }



# =====================================================================
# email (Wave: notifications)
# =====================================================================


@router.get("/emails/deliveries")
async def list_email_deliveries(
    status: str | None = Query(None, pattern="^(queued|sending|sent|failed|suppressed)$"),
    limit: int = Query(50, ge=1, le=200),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Recent email delivery attempts (newest first)."""
    rows = await email_service.recent_deliveries(
        db, limit=limit, status=status
    )
    return [email_service.delivery_to_dict(d) for d in rows]


@router.get("/emails/stats")
async def email_stats(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Counts by status for the last 30 days + retry queue depth."""
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import func, select as sql_select

    from app.config.settings import settings as _settings
    from app.db.models import EmailDelivery as _EmailDelivery

    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    result = await db.execute(
        sql_select(_EmailDelivery.status, func.count())
        .where(_EmailDelivery.created_at >= cutoff)
        .group_by(_EmailDelivery.status)
    )
    counts = {row[0]: int(row[1]) for row in result.all()}
    failed_pending = await email_retry_service.count_failed_emails(db)

    return {
        "provider": _settings.email_provider,
        "last_30_days": {
            "sent": counts.get("sent", 0),
            "failed": counts.get("failed", 0),
            "suppressed": counts.get("suppressed", 0),
        },
        "retry_queue": failed_pending,
    }


@router.post("/emails/test")
async def send_test_email_endpoint(
    payload: TestEmailRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Send a synthetic email using real template variables. Useful for
    verifying provider setup without filing a real ticket.
    """
    delivery = await email_service.send_test_email(
        db, to=payload.to, template=payload.template
    )
    return email_service.delivery_to_dict(delivery)


@router.get("/emails/prefs")
async def get_email_prefs(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Read the runtime email preferences.

    Returns the DB-backed master switch + the read-only env-level info
    (provider, from address, retry tuning) so the UI can show a
    complete picture in one request.
    """
    from app.config.settings import settings as _settings

    row = await email_service.get_email_settings(db)
    return {
        "enabled": row.enabled,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "updated_by_user_id": (
            str(row.updated_by_user_id) if row.updated_by_user_id else None
        ),
        # Env-level (read-only, for display)
        "provider": _settings.email_provider,
        "from_address": _settings.email_from,
        "reply_to": _settings.email_reply_to or None,
        "max_attempts": _settings.email_max_attempts,
        "retry_base_seconds": _settings.email_retry_base_seconds,
        "configured": _settings.email_configured,
    }


@router.put("/emails/prefs")
async def update_email_prefs(
    payload: EmailPrefsUpdateRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Toggle the runtime master email switch.

    When `enabled=false`, every outbound email is short-circuited (still
    recorded as a delivery with status="failed" so it shows up in the log).
    """
    row = await email_service.set_email_enabled(
        db,
        enabled=payload.enabled,
        actor_user_id=str(admin.id),
    )
    return {
        "enabled": row.enabled,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "updated_by_user_id": (
            str(row.updated_by_user_id) if row.updated_by_user_id else None
        ),
    }


@router.post("/emails/retry-now")
async def trigger_email_retry(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Run one email retry pass immediately."""
    stats = await email_retry_service.retry_failed_emails(db)
    return stats


@router.get("/emails/suppressions")
async def list_email_suppressions(
    limit: int = Query(200, ge=1, le=500),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Addresses that will never receive Cortex emails."""
    rows = await email_service.list_suppressions(db, limit=limit)
    return [
        {
            "email": s.email,
            "reason": s.reason,
            "note": s.note,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in rows
    ]


@router.post("/emails/suppress")
async def add_email_suppression(
    payload: SuppressEmailRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Add an address to the suppression list (idempotent)."""
    row = await email_service.suppress_email(
        db, payload.email, reason=payload.reason, note=payload.note
    )
    return {
        "email": row.email,
        "reason": row.reason,
        "note": row.note,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.delete("/emails/suppressions/{email}")
async def remove_email_suppression(
    email: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Remove an address from the suppression list."""
    ok = await email_service.remove_suppression(db, email)
    if not ok:
        raise HTTPException(status_code=404, detail="Suppression not found")
    return {"ok": True}
