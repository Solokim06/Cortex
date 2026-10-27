"""
Outbound email service.

Responsibilities:
  - Choose a backend: Resend → SMTP → Console (dev fallback)
  - Render Jinja2 templates from app/templates/emails/
  - Persist one EmailDelivery row per attempt (audit + retry)
  - Respect the EmailSuppression list
  - Never block the calling request: send happens in a background task

Public API:

    await send_email(
        db,
        to="user@example.com",
        template="new_ticket",
        subject="[Cortex] New ticket: ...",
        context={"ticket": {...}, "filer": {...}},
        ticket_id="...",           # optional, for audit linkage
    )

    # Or queue for delivery + return immediately (fire-and-forget)
    queue_email(to=..., template=..., subject=..., context=..., ticket_id=...)

    # Inspect
    recent_deliveries(db, limit=50)
    suppressed_emails(db)

The two backends are interchangeable — the send function reads
`settings.email_provider` on every call, so toggling between console,
resend, and smtp requires only an .env change + restart.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Any
from uuid import uuid4

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.db.models import EmailDelivery, EmailSettings, EmailSuppression


# =====================================================================
# Jinja2 setup
# =====================================================================

_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates" / "emails"

_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


def _render(template_name: str, context: dict[str, Any]) -> str:
    """Render a template by name — e.g. "new_ticket.html"."""
    tmpl = _env.get_template(template_name)
    return tmpl.render(**context)


def _render_both(
    template_base: str, context: dict[str, Any]
) -> tuple[str, str]:
    """
    Render (html, text) for a template base name.
    `template_base` = "new_ticket" looks for new_ticket.html + new_ticket.txt.
    Falls back to a text-only stub if the .txt is missing.
    """
    html = _render(f"{template_base}.html", context)
    try:
        text = _render(f"{template_base}.txt", context)
    except Exception:  # noqa: BLE001
        # Minimal plaintext fallback — strip tags crudely.
        import re

        text = re.sub(r"<[^>]+>", "", html)
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return html, text


# =====================================================================
# suppression
# =====================================================================


async def _is_suppressed(db: AsyncSession, email: str) -> bool:
    e = email.strip().lower()
    if not e:
        return True
    res = await db.execute(
        select(EmailSuppression).where(EmailSuppression.email == e)
    )
    return res.scalar_one_or_none() is not None


async def suppress_email(
    db: AsyncSession,
    email: str,
    *,
    reason: str = "manual",
    note: str | None = None,
) -> EmailSuppression:
    """Add an address to the suppression list (idempotent)."""
    e = email.strip().lower()
    existing = (
        await db.execute(
            select(EmailSuppression).where(EmailSuppression.email == e)
        )
    ).scalar_one_or_none()
    if existing:
        return existing

    row = EmailSuppression(
        email=e,
        reason=reason,
        note=note,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


# =====================================================================
# runtime settings (singleton row)
# =====================================================================


async def get_email_settings(db: AsyncSession) -> EmailSettings:
    """
    Return the singleton EmailSettings row.

    Creates it lazily from `settings.email_enabled` if it doesn't exist,
    so callers always get a valid row even if the migration was skipped.
    """
    res = await db.execute(
        select(EmailSettings).where(EmailSettings.id == "default")
    )
    row = res.scalar_one_or_none()
    if row is not None:
        return row

    row = EmailSettings(
        id="default",
        enabled=settings.email_enabled,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def set_email_enabled(
    db: AsyncSession,
    *,
    enabled: bool,
    actor_user_id: str | None = None,
) -> EmailSettings:
    """Toggle the master switch. Records who did it."""
    row = await get_email_settings(db)
    row.enabled = enabled
    row.updated_by_user_id = actor_user_id
    await db.commit()
    await db.refresh(row)
    return row


# =====================================================================
# delivery records
# =====================================================================


def _new_delivery(
    *,
    to_email: str,
    template: str,
    subject: str,
    ticket_id: str | None,
    provider: str,
) -> EmailDelivery:
    return EmailDelivery(
        id=str(uuid4()),
        to_email=to_email.strip().lower(),
        template=template,
        subject=subject[:300],
        ticket_id=ticket_id,
        status="queued",
        provider=provider,
        attempt=1,
    )


# =====================================================================
# backends
# =====================================================================


async def _send_via_resend(
    to_email: str,
    subject: str,
    html: str,
    text: str,
    reply_to: str | None,
) -> tuple[bool, str | None, str | None]:
    """
    Returns (ok, message_id, error). Never raises.
    """
    try:
        import resend  # type: ignore
    except ImportError:
        return False, None, "resend package not installed"

    try:
        resend.api_key = settings.resend_api_key

        params: dict[str, Any] = {
            "from": settings.email_from,
            "to": [to_email],
            "subject": subject,
            "html": html,
            "text": text,
        }
        if reply_to:
            params["reply_to"] = reply_to
        elif settings.email_reply_to:
            params["reply_to"] = settings.email_reply_to

        # The resend SDK's `send` is sync in 2.x but runs in a thread.
        # Wrap in asyncio.to_thread to avoid blocking the event loop.
        resp = await asyncio.to_thread(resend.Emails.send, params)

        message_id = None
        if isinstance(resp, dict):
            message_id = resp.get("id")
        else:
            message_id = getattr(resp, "id", None)

        return True, message_id, None
    except Exception as e:  # noqa: BLE001
        return False, None, f"resend: {e}"


async def _send_via_smtp(
    to_email: str,
    subject: str,
    html: str,
    text: str,
    reply_to: str | None,
) -> tuple[bool, str | None, str | None]:
    """
    Returns (ok, message_id, error). Never raises.
    """
    try:
        import aiosmtplib  # type: ignore
    except ImportError:
        return False, None, "aiosmtplib package not installed"

    try:
        msg = EmailMessage()
        msg["From"] = settings.email_from
        msg["To"] = to_email
        msg["Subject"] = subject
        if reply_to:
            msg["Reply-To"] = reply_to
        elif settings.email_reply_to:
            msg["Reply-To"] = settings.email_reply_to

        msg.set_content(text)
        msg.add_alternative(html, subtype="html")

        kwargs: dict[str, Any] = {
            "hostname": settings.smtp_host,
            "port": settings.smtp_port,
            "timeout": 15.0,
        }
        if settings.smtp_username:
            kwargs["username"] = settings.smtp_username
            kwargs["password"] = settings.smtp_password
        if settings.smtp_use_tls:
            kwargs["start_tls"] = True
        else:
            kwargs["use_tls"] = False

        await aiosmtplib.send(msg, **kwargs)
        return True, msg.get("Message-ID"), None
    except Exception as e:  # noqa: BLE001
        return False, None, f"smtp: {e}"


async def _send_via_console(
    to_email: str,
    subject: str,
    html: str,
    text: str,
    reply_to: str | None,  # noqa: ARG001
) -> tuple[bool, str | None, str | None]:
    """
    Dev fallback — prints the email so you can eyeball it. Always succeeds.
    """
    border = "─" * 60
    print(f"\n{'-' * 60}")
    print(f"[email-console] → {to_email}")
    print(f"[email-console]   Subject: {subject}")
    print(f"[email-console]   HTML:    {len(html)} chars")
    print(f"[email-console]   Text:    {len(text)} chars")
    print(f"{'-' * 60}\n")
    # Deterministic fake message id so tests can assert on it
    return True, f"console-{uuid4().hex[:12]}", None


# =====================================================================
# dispatch by provider
# =====================================================================


async def _dispatch(
    provider: str,
    to_email: str,
    subject: str,
    html: str,
    text: str,
    reply_to: str | None,
) -> tuple[bool, str | None, str | None]:
    if provider == "resend":
        return await _send_via_resend(to_email, subject, html, text, reply_to)
    if provider == "smtp":
        return await _send_via_smtp(to_email, subject, html, text, reply_to)
    return await _send_via_console(to_email, subject, html, text, reply_to)


# =====================================================================
# public API
# =====================================================================


async def send_email(
    db: AsyncSession,
    *,
    to: str,
    template: str,
    subject: str,
    context: dict[str, Any] | None = None,
    ticket_id: str | None = None,
    reply_to: str | None = None,
    commit: bool = True,
) -> EmailDelivery:
    """
    Render + send an email, recording one EmailDelivery row.

    - Respects `settings.email_enabled` and the suppression list.
    - Never raises: failures are recorded on the delivery row.
    - `context` is passed to the Jinja2 template as its variables.
    """
    ctx = dict(context or {})
    ctx.setdefault("subject", subject)
    ctx.setdefault("web_url", settings.web_url)

    to_email = to.strip().lower()
    provider = settings.email_provider

    # --- env-level disable (rare; mostly for CI) ---
    if provider == "disabled":
        delivery = _new_delivery(
            to_email=to_email,
            template=template,
            subject=subject,
            ticket_id=ticket_id,
            provider="disabled",
        )
        delivery.status = "failed"
        delivery.error = "email disabled via settings"
        db.add(delivery)
        if commit:
            await db.commit()
            await db.refresh(delivery)
        return delivery

    # --- runtime master switch (DB-backed) ---
    # Read fresh every call so a toggle in the admin UI takes effect
    # immediately, without restarting the server.
    try:
        runtime_settings = await get_email_settings(db)
        if not runtime_settings.enabled:
            delivery = _new_delivery(
                to_email=to_email,
                template=template,
                subject=subject,
                ticket_id=ticket_id,
                provider=provider,
            )
            delivery.status = "failed"
            delivery.error = "email master switch is off"
            db.add(delivery)
            if commit:
                await db.commit()
                await db.refresh(delivery)
            return delivery
    except Exception as e:  # noqa: BLE001
        # Never let a settings lookup kill the send. Fail open.
        print(f"[email] master switch lookup failed, proceeding: {e}")

    # --- suppression check ---
    if await _is_suppressed(db, to_email):
        delivery = _new_delivery(
            to_email=to_email,
            template=template,
            subject=subject,
            ticket_id=ticket_id,
            provider=provider,
        )
        delivery.status = "suppressed"
        delivery.error = "recipient is suppressed"
        db.add(delivery)
        if commit:
            await db.commit()
            await db.refresh(delivery)
        return delivery

    # --- render ---
    try:
        html, text = _render_both(template, ctx)
    except Exception as e:  # noqa: BLE001
        delivery = _new_delivery(
            to_email=to_email,
            template=template,
            subject=subject,
            ticket_id=ticket_id,
            provider=provider,
        )
        delivery.status = "failed"
        delivery.error = f"template error: {e}"
        db.add(delivery)
        if commit:
            await db.commit()
            await db.refresh(delivery)
        print(f"[email] template render failed for {template}: {e}")
        return delivery

    # --- dispatch ---
    delivery = _new_delivery(
        to_email=to_email,
        template=template,
        subject=subject,
        ticket_id=ticket_id,
        provider=provider,
    )
    db.add(delivery)

    ok, message_id, error = await _dispatch(
        provider, to_email, subject, html, text, reply_to
    )

    if ok:
        delivery.status = "sent"
        delivery.message_id = message_id
        delivery.sent_at = datetime.now(timezone.utc)
    else:
        delivery.status = "failed"
        delivery.error = error
        print(f"[email] send failed to {to_email} via {provider}: {error}")

    if commit:
        await db.commit()
        await db.refresh(delivery)

    return delivery


# =====================================================================
# fire-and-forget helper
# =====================================================================


async def queue_email(
    *,
    to: str,
    template: str,
    subject: str,
    context: dict[str, Any] | None = None,
    ticket_id: str | None = None,
    reply_to: str | None = None,
) -> None:
    """
    Send an email without blocking the caller. Opens its own DB session.

    Use this when the caller doesn't want to wait — e.g. inside an API
    request that should respond fast. Failures are logged + recorded but
    never surface to the request.
    """
    from app.db.session import AsyncSessionLocal

    async def _task() -> None:
        try:
            async with AsyncSessionLocal() as db:
                await send_email(
                    db,
                    to=to,
                    template=template,
                    subject=subject,
                    context=context,
                    ticket_id=ticket_id,
                    reply_to=reply_to,
                )
        except Exception as e:  # noqa: BLE001
            print(f"[email] queue_email failed for {to}: {e}")

    # Fire and forget. Keep a reference so it isn't GC'd mid-flight.
    task = asyncio.create_task(_task())
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)


# Keeps a strong ref to fire-and-forget tasks
_BACKGROUND_TASKS: set[asyncio.Task] = set()


# =====================================================================
# inspection helpers (admin)
# =====================================================================


async def recent_deliveries(
    db: AsyncSession,
    *,
    limit: int = 50,
    status: str | None = None,
) -> list[EmailDelivery]:
    stmt = select(EmailDelivery)
    if status:
        stmt = stmt.where(EmailDelivery.status == status)
    stmt = stmt.order_by(EmailDelivery.created_at.desc()).limit(limit)
    res = await db.execute(stmt)
    return list(res.scalars().all())


async def list_suppressions(
    db: AsyncSession,
    *,
    limit: int = 200,
) -> list[EmailSuppression]:
    res = await db.execute(
        select(EmailSuppression)
        .order_by(EmailSuppression.created_at.desc())
        .limit(limit)
    )
    return list(res.scalars().all())


async def remove_suppression(db: AsyncSession, email: str) -> bool:
    e = email.strip().lower()
    res = await db.execute(
        select(EmailSuppression).where(EmailSuppression.email == e)
    )
    row = res.scalar_one_or_none()
    if row is None:
        return False
    await db.delete(row)
    await db.commit()
    return True


def delivery_to_dict(d: EmailDelivery) -> dict:
    return {
        "id": str(d.id),
        "to": d.to_email,
        "template": d.template,
        "subject": d.subject,
        "ticket_id": str(d.ticket_id) if d.ticket_id else None,
        "status": d.status,
        "provider": d.provider,
        "message_id": d.message_id,
        "error": d.error,
        "attempt": d.attempt,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "sent_at": d.sent_at.isoformat() if d.sent_at else None,
    }


# =====================================================================
# template test helper (used by admin "send test email")
# =====================================================================


async def send_test_email(
    db: AsyncSession,
    *,
    to: str,
    template: str = "new_ticket",
) -> EmailDelivery:
    """
    Send a synthetic email using real template variables, so admins can
    verify delivery + rendering without filing a real ticket.
    """
    now = datetime.now(timezone.utc).isoformat()
    fake_context = {
        "ticket": {
            "id": "00000000-0000-0000-0000-000000000000",
            "subject": "Test ticket (admin preview)",
            "description": "This is a synthetic email sent from the admin panel.",
            "category": "question",
            "priority": "normal",
            "status": "open",
            "created_at": now,
        },
        "filer": {
            "name": "Test User",
            "email": "test@example.com",
        },
        "assignee": {
            "name": "Admin",
            "email": to,
        },
        "admin_name": "Admin",
    }
    return await send_email(
        db,
        to=to,
        template=template,
        subject=f"[Cortex TEST] {template}",
        context=fake_context,
    )
