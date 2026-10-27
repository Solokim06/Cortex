"""
Help & Feedback API.

Endpoints:
  POST   /help/ask                     → AI help assistant (JSON)
  POST   /help/ask/stream              → AI help assistant (SSE)   [NEW]
  POST   /help/ask/feedback            → 👍/👎 on an answer          [NEW]
  GET    /help/topics                  → list categories + doc counts
  GET    /help/topics/{category}       → list docs in a category
  GET    /help/docs/{doc_id}           → fetch a single help article
  POST   /help/feedback                → file a ticket
  GET    /help/feedback                → list user's own tickets
  GET    /help/feedback/{id}           → ticket detail + replies
  POST   /help/feedback/{id}/reply     → user reply on a ticket
"""

import asyncio
import json
from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import uploads as uploads_service

from app.auth.deps import get_current_user
from app.config.settings import settings
from app.db.models import User
from app.db.session import get_db
from app.i18n import get_locale
from app.services import feedback as feedback_service
from app.services import help as help_service
from app.services import notifications as notifications_service
from app.services import rate_limit as rate_limit_service
from app.services import roles as roles_service

router = APIRouter(prefix="/help", tags=["help"])


def _client_ip(request: Request) -> str:
    """Best-effort client IP for rate limiting.

    Prefers x-forwarded-for (from the reverse proxy), then x-real-ip,
    then the direct connection. Returns "unknown" as a safe default.
    """
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host if request.client else "unknown"


# =====================================================================
# Rate limiting dependency
# =====================================================================


async def enforce_help_rate_limit(
    user: User = Depends(get_current_user),
) -> None:
    """
    Rate limit /help/ask and /help/ask/stream per user.

    Admins/agents are exempt if settings.help_rate_limit_admin_bypass is on.

    Raises 429 with Retry-After header when the limit is exceeded.
    """
    from fastapi import HTTPException, status

    if settings.help_rate_limit_admin_bypass and roles_service.is_agent(user):
        return

    result = await rate_limit_service.check_rate_limit(f"help:ask:{user.id}")

    if not result.allowed:
        retry_after = max(1, result.reset_after_seconds)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Rate limit exceeded. Try again in {retry_after}s "
                f"({result.limit} requests / "
                f"{settings.help_rate_limit_window_seconds}s)."
            ),
            headers={
                "Retry-After": str(retry_after),
                "X-RateLimit-Limit": str(result.limit),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(retry_after),
            },
        )


# ---------- Request / response models ----------

@router.get("/notifications/stream")
async def user_notifications_stream(
    request: Request,
    user: User = Depends(get_current_user),
):
    """
    SSE stream of in-app bell notifications for the current user.

    Consumes the shared pubsub channel and filters events addressed
    specifically to this user via `recipient_user_id`.

    Emits keep-alive pings every 25s.
    """
    from app.services import pubsub as pubsub_service

    my_id = str(user.id)

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

                # Only forward user_notification events addressed to me.
                if event.get("kind") == "user_notification":
                    notif = event.get("notification") or {}
                    if str(notif.get("recipient_user_id")) != my_id:
                        continue
                    # Strip the recipient field before sending to client
                    clean = {k: v for k, v in notif.items() if k != "recipient_user_id"}
                    yield _sse_pack({"kind": "notification", "notification": clean})
                # Everything else is admin-scoped — drop it silently.

                # Keep-alive ping every 25s
                now = asyncio.get_event_loop().time()
                if now - last_ping > 25:
                    yield ": ping\n\n"
                    last_ping = now
        except Exception as e:  # noqa: BLE001
            print(f"[help/notifications/stream] error: {e}")
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


class AskRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=1000)
    route: str | None = Field(None, max_length=200)


class CitedDoc(BaseModel):
    id: str
    title: str
    category: str


class AskResponse(BaseModel):
    answer: str
    cited_docs: list[CitedDoc]
    suggested_docs: list[CitedDoc]
    escalate: bool
    escalate_reason: str | None = None
    confidence: str = "medium"
    retrieval_weak: bool = False


class AskFeedbackRequest(BaseModel):
    """👍/👎 on an answer."""
    question: str = Field(..., min_length=1, max_length=1000)
    answer: str = Field(..., min_length=1, max_length=10000)
    rating: str = Field(..., pattern="^(up|down)$")
    reason: str | None = Field(None, max_length=500)
    cited_doc_ids: list[str] = Field(default_factory=list)


class ConversationMessage(BaseModel):
    """One message inside an attached chat transcript."""
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=4000)
    created_at: str | None = Field(None, max_length=64)


class CreateTicketRequest(BaseModel):
    category: str = Field(..., pattern="^(bug|feature|question|other)$")
    subject: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=3, max_length=5000)
    context: dict | None = None
    attachment_url: str | None = Field(None, max_length=2000)
    # Optional chat transcript to attach — capped at 100 messages by service.
    conversation: list[ConversationMessage] | None = Field(None, max_length=100)


class CreateAnonymousTicketRequest(BaseModel):
    """Payload for POST /help/feedback/public. No auth required."""
    category: str = Field(..., pattern="^(bug|feature|question|other)$")
    subject: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=3, max_length=5000)
    # Optional: reply-to address. If provided, admin can follow up.
    contact_email: str | None = Field(None, max_length=320)
    # Honeypot — bots fill this; humans don't. If non-empty, reject silently.
    website: str | None = None


class ReplyRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)


class EditReplyRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)


class UpdateNotifPrefsRequest(BaseModel):
    email_on_ticket_reply: bool | None = None
    email_on_status_change: bool | None = None
    email_on_resolved: bool | None = None
    insights_enabled: bool | None = None
    insights_dormant_revival: bool | None = None
    insights_contradiction: bool | None = None
    insights_decision_drift: bool | None = None
    insights_rhythm: bool | None = None


class CategoryItem(BaseModel):
    category: str
    count: int


class DocItem(BaseModel):
    id: str
    title: str
    category: str


class DocDetail(BaseModel):
    id: str
    title: str
    category: str
    tags: list[str]
    body: str
    related: list[str]


# ---------- Help assistant (non-streaming) ----------

@router.post("/ask", response_model=AskResponse)
async def ask_endpoint(
    payload: AskRequest,
    _rl: None = Depends(enforce_help_rate_limit),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    locale: str = Depends(get_locale),
):
    """Answer a product help question using the curated knowledge base."""
    context = {"route": payload.route} if payload.route else {}
    result = await help_service.ask_help(
        db=db,
        user_id=user.id,
        question=payload.question,
        context=context,
        locale=locale,
    )
    return AskResponse(**result)


# ---------- Help assistant (streaming, SSE) ----------

@router.post("/ask/stream")
async def ask_stream_endpoint(
    payload: AskRequest,
    _rl: None = Depends(enforce_help_rate_limit),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    locale: str = Depends(get_locale),
):
    """
    Streaming variant of /help/ask.

    Emits Server-Sent Events. Frame types:
      - meta:       {"type":"meta","suggested_docs":[...],"cited_docs":[]}
      - token:      {"type":"token","text":"..."}
      - citations:  {"type":"citations","cited_docs":[...]}
      - escalate:   {"type":"escalate","reason":"..."}
      - error:      {"type":"error","message":"..."}
      - done:       {"type":"done"}

    The frontend should append `text` to the current answer bubble as
    tokens arrive, then use the citations/escalate frames to render the
    trailing chips and the "file a ticket" button.
    """
    context = {"route": payload.route} if payload.route else {}

    async def event_source():
        try:
            async for frame in help_service.stream_help_answer(
                db=db,
                user_id=user.id,
                question=payload.question,
                context=context,
                locale=locale,
            ):
                yield f"data: {json.dumps(frame, default=str)}\n\n"
        except Exception as e:  # noqa: BLE001
            print(f"[help/ask/stream] unexpected error: {e}")
            err = json.dumps({"type": "error", "message": str(e)})
            yield f"data: {err}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------- Answer feedback ----------

@router.post("/ask/feedback")
async def ask_feedback_endpoint(
    payload: AskFeedbackRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record 👍/👎 on a help answer."""
    return await help_service.log_help_feedback(
        db=db,
        user_id=user.id,
        question=payload.question,
        answer=payload.answer,
        rating=payload.rating,
        reason=payload.reason,
        cited_doc_ids=payload.cited_doc_ids,
    )


# ---------- Topics / docs ----------

@router.get("/topics", response_model=list[CategoryItem])
async def topics_endpoint(
    user: User = Depends(get_current_user),
    locale: str = Depends(get_locale),
):
    result = help_service.list_categories(locale)
    print(f"[/help/topics] locale={locale!r} first={result[0] if result else None}")
    return result


@router.get("/topics/{category}", response_model=list[DocItem])
async def topics_in_category_endpoint(
    category: str,
    user: User = Depends(get_current_user),
    locale: str = Depends(get_locale),
):
    docs = help_service.list_docs_by_category(category, locale)
    if not docs:
        raise HTTPException(status_code=404, detail="Category not found")
    return docs


@router.get("/docs/{doc_id}", response_model=DocDetail)
async def doc_endpoint(
    doc_id: str,
    user: User = Depends(get_current_user),
    locale: str = Depends(get_locale),
):
    doc = help_service.get_doc(doc_id, locale)
    if doc is None:
        raise HTTPException(status_code=404, detail="Doc not found")
    return DocDetail(
        id=doc["id"],
        title=doc["title"],
        category=doc["category"],
        tags=doc.get("tags", []),
        body=doc["body"],
        related=doc.get("related", []),
    )


# ---------- Filer notification preferences ----------


@router.get("/prefs", response_model=dict)
async def get_my_notif_prefs(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current user's filer-side notification preferences."""
    prefs = await notifications_service.get_user_prefs(db, str(user.id))
    return notifications_service.user_prefs_to_dict(prefs)


@router.put("/prefs", response_model=dict)
async def update_my_notif_prefs(
    payload: UpdateNotifPrefsRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Patch the current user's filer-side notification preferences."""
    prefs = await notifications_service.update_user_prefs(
        db,
        str(user.id),
        email_on_ticket_reply=payload.email_on_ticket_reply,
        email_on_status_change=payload.email_on_status_change,
        email_on_resolved=payload.email_on_resolved,
            insights_enabled=payload.insights_enabled,
            insights_dormant_revival=payload.insights_dormant_revival,
            insights_contradiction=payload.insights_contradiction,
            insights_decision_drift=payload.insights_decision_drift,
            insights_rhythm=payload.insights_rhythm,
    )
    return notifications_service.user_prefs_to_dict(prefs)


# ---------- Unsubscribe (public, token-based) ----------


@router.get("/unsubscribe", response_model=dict)
async def unsubscribe_endpoint(
    token: str = Query(..., min_length=8, max_length=64),
    db: AsyncSession = Depends(get_db),
):
    """
    Public unsubscribe endpoint — no auth required.

    Links in emails carry a per-user token. Hitting this sets all three
    filer toggles to false. Idempotent — safe to click multiple times.

    Returns {"ok": true} on success, {"ok": false, "reason": "..."} on failure.
    """
    user = await notifications_service.unsubscribe_all(db, token)
    if user is None:
        return {"ok": False, "reason": "invalid_token"}
    return {"ok": True, "email": user.email}


# ---------- File uploads ----------

@router.post("/feedback/upload", response_model=dict)
async def upload_screenshot_endpoint(
    file: UploadFile = File(..., description="PNG, JPG, or WebP"),
    user: User = Depends(get_current_user),
):
    """
    Upload a screenshot to attach to a feedback ticket.

    Returns {"url": "/uploads/feedback/<id>.<ext>", ...}. The url is
    relative to the API host — the frontend should prefix it with
    NEXT_PUBLIC_API_URL when displaying.
    """
    return await uploads_service.save_image(file, namespace="feedback")


# ---------- Feedback tickets ----------

@router.post("/feedback", response_model=dict)
async def create_ticket_endpoint(
    payload: CreateTicketRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ticket = await feedback_service.create_ticket(
        db=db,
        user_id=user.id,
        category=payload.category,
        subject=payload.subject,
        description=payload.description,
        context=payload.context,
        attachment_url=payload.attachment_url,
        conversation=(
            [m.model_dump() for m in payload.conversation]
            if payload.conversation
            else None
        ),
    )
    return feedback_service.ticket_summary(ticket)


@router.post("/feedback/public", response_model=dict)
async def create_anonymous_ticket_endpoint(
    payload: CreateAnonymousTicketRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Anonymous ticket submission from the /contact page.

    - No authentication required.
    - Rate-limited by IP: 5 tickets per hour (via the shared rate_limit service).
    - Honeypot field ("website") silently rejects obvious bots.
    - contact_email is optional. If provided, admin can reply by email.
    """
    from app.services import rate_limit as rate_limit_service
    from app.services import feedback as feedback_service

    # 1. Honeypot — any non-empty value = bot. Return success (silent reject).
    if (payload.website or "").strip():
        # Lie to the bot with a fake ticket ID so it doesn't retry.
        import uuid as _uuid
        return {
            "id": str(_uuid.uuid4()),
            "category": payload.category,
            "subject": payload.subject,
            "status": "open",
            "priority": "normal",
            "created_at": __import__("datetime").datetime.utcnow().isoformat(),
        }

    # 2. Rate limit by client IP.
    ip = _client_ip(request) or "unknown"
    result = await rate_limit_service.check_rate_limit(
        f"help:feedback:public:{ip}",
        max_count=5,
        window=3600,
    )
    if not result.allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many messages from this address. Please try again later.",
            headers={"Retry-After": str(result.reset_after_seconds)},
        )

    # 3. Build context — mark anonymous and store optional reply address.
    ctx: dict = {"anonymous": True}
    if payload.contact_email:
        ctx["contact_email"] = payload.contact_email.strip()[:320]

    # 4. Create the ticket with user_id=None.
    ticket = await feedback_service.create_ticket(
        db=db,
        user_id=None,
        category=payload.category,
        subject=payload.subject,
        description=payload.description,
        context=ctx,
        attachment_url=None,
        priority="normal",
        conversation=None,
    )
    return feedback_service.ticket_summary(ticket)


@router.get("/feedback", response_model=list[dict])
async def list_tickets_endpoint(
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tickets = await feedback_service.list_tickets(db, user.id, limit=limit)
    return [feedback_service.ticket_summary(t) for t in tickets]


@router.get("/feedback/{ticket_id}", response_model=dict)
async def get_ticket_endpoint(
    ticket_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ticket = await feedback_service.get_ticket(db, user.id, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    replies = await feedback_service.list_replies(db, ticket.id)
    return feedback_service.ticket_detail(ticket, replies)


@router.patch("/feedback/{ticket_id}/replies/{reply_id}", response_model=dict)
async def edit_reply_endpoint(
    ticket_id: str,
    reply_id: str,
    payload: EditReplyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Edit a user reply (author-only, within a 15-minute window)."""
    result = await feedback_service.edit_reply(
        db,
        user_id=user.id,
        ticket_id=ticket_id,
        reply_id=reply_id,
        new_content=payload.content,
    )
    if not result.get("ok"):
        reason = result.get("reason", "edit_failed")
        status = {
            "ticket_not_found": 404,
            "reply_not_found": 404,
            "not_editable": 403,
            "edit_window_expired": 403,
            "empty_content": 400,
        }.get(reason, 400)
        raise HTTPException(status_code=status, detail=reason)
    return result


@router.post("/feedback/{ticket_id}/reply", response_model=dict)
async def reply_endpoint(
    ticket_id: str,
    payload: ReplyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    reply = await feedback_service.add_user_reply(
        db=db,
        user_id=user.id,
        ticket_id=ticket_id,
        content=payload.content,
    )
    if reply is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    ticket = await feedback_service.get_ticket(db, user.id, ticket_id)
    replies = await feedback_service.list_replies(db, ticket_id)
    return feedback_service.ticket_detail(ticket, replies)

# =====================================================================
# SSE helper
# =====================================================================


def _sse_pack(event: dict) -> str:
    return f"data: {json.dumps(event, default=str)}\n\n"
