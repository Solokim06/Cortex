"""
Admin impersonation (D2.b — full impersonation).

Model:
  1. Admin calls POST /admin/impersonate/{user_id} with a reason.
  2. We create an ImpersonationSession row (is_active=True) and mint a
     short-lived JWT signed with settings.jwt_secret.
  3. The JWT claims are:
        {
          "sub":  "<target_user_id>",           # acts as the target
          "act":  {"sub": "<admin_user_id>"},   # actor chain (RFC 8693)
          "imp":  true,
          "sid":  "<impersonation_session_id>",
          "iat":  ..., "exp": ...,
        }
  4. The admin frontend stores this token and sends it as the Bearer
     token. The API's `get_current_user` detects `imp=true` and:
        - verifies `act.sub` is an admin (fresh DB check)
        - verifies the session row still exists with is_active=True
        - returns the *target* user as the effective user
        - attaches impersonation metadata to request.state
  5. Every write during impersonation is logged with actor=admin,
     target=user via TicketEvent(kind="impersonated_action").
  6. Kill switch: POST /admin/impersonate/end marks the session
     is_active=False. Any outstanding JWT is immediately rejected.

JWT TTL is settings.impersonation_ttl_minutes (default 15).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.db.models import ImpersonationSession, User


# ---------------------------------------------------------------------
# error type — routers convert this to a 4xx
# ---------------------------------------------------------------------


class ImpersonationError(Exception):
    """Raised for any impersonation failure. Router maps to HTTP 400/403."""


# ---------------------------------------------------------------------
# session lifecycle
# ---------------------------------------------------------------------


async def start_session(
    db: AsyncSession,
    *,
    admin_user_id: str,
    target_user_id: str,
    reason: str | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> tuple[ImpersonationSession, str]:
    """
    Create an impersonation session and return (session, jwt_token).

    Raises ImpersonationError if the admin tries to impersonate themselves.
    """
    if admin_user_id == target_user_id:
        raise ImpersonationError("Cannot impersonate yourself")

    # Verify both users exist
    admin_res = await db.execute(select(User).where(User.id == admin_user_id))
    admin = admin_res.scalar_one_or_none()
    if admin is None:
        raise ImpersonationError("Admin user not found")

    target_res = await db.execute(select(User).where(User.id == target_user_id))
    target = target_res.scalar_one_or_none()
    if target is None:
        raise ImpersonationError("Target user not found")

    session = ImpersonationSession(
        id=str(uuid4()),
        admin_user_id=admin_user_id,
        target_user_id=target_user_id,
        reason=(reason or "").strip() or None,
        ip=(ip or "").strip() or None,
        user_agent=(user_agent or "").strip()[:500] or None,
        is_active=True,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    token = _mint_token(session)
    return session, token


async def end_session(
    db: AsyncSession,
    *,
    session_id: str,
    ended_by_user_id: str | None = None,
) -> ImpersonationSession | None:
    """
    Kill switch: mark the session inactive. Any JWT referring to it is
    immediately rejected on the next request.

    `ended_by_user_id` is accepted for future audit use but not required.
    """
    result = await db.execute(
        select(ImpersonationSession).where(ImpersonationSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        return None

    session.is_active = False
    session.ended_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(session)
    return session


async def end_all_for_admin(
    db: AsyncSession,
    admin_user_id: str,
) -> int:
    """
    Kill every active session owned by an admin. Returns count ended.
    Useful as a panic button.
    """
    result = await db.execute(
        select(ImpersonationSession).where(
            ImpersonationSession.admin_user_id == admin_user_id,
            ImpersonationSession.is_active.is_(True),
        )
    )
    sessions = list(result.scalars().all())
    now = datetime.now(timezone.utc)
    for s in sessions:
        s.is_active = False
        s.ended_at = now
    await db.commit()
    return len(sessions)


# ---------------------------------------------------------------------
# token minting / verification
# ---------------------------------------------------------------------


def _mint_token(session: ImpersonationSession) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.impersonation_ttl_minutes)

    claims = {
        "sub": str(session.target_user_id),
        "act": {"sub": str(session.admin_user_id)},
        "imp": True,
        "sid": str(session.id),
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict:
    """
    Verify signature + expiry. Raises ImpersonationError on any failure.
    """
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            options={"require": ["sub", "exp", "act", "sid", "imp"]},
        )
    except jwt.ExpiredSignatureError:
        raise ImpersonationError("Impersonation token expired")
    except jwt.InvalidTokenError as e:
        raise ImpersonationError(f"Invalid impersonation token: {e}")

    if not claims.get("imp"):
        raise ImpersonationError("Token is not an impersonation token")

    act = claims.get("act") or {}
    if not isinstance(act, dict) or not act.get("sub"):
        raise ImpersonationError("Impersonation token missing 'act.sub'")

    return claims


# ---------------------------------------------------------------------
# request-time resolution
# ---------------------------------------------------------------------


async def resolve_impersonation(
    db: AsyncSession,
    claims: dict,
) -> tuple[User, User, ImpersonationSession]:
    """
    Given verified JWT claims, resolve (target_user, admin_user, session).

    Used by get_current_user in deps.py. Raises ImpersonationError if
    the session is dead, the admin is no longer an admin, etc.
    """
    from app.services.roles import is_admin  # avoid circular import

    target_id = claims.get("sub")
    admin_id = (claims.get("act") or {}).get("sub")
    session_id = claims.get("sid")

    if not (target_id and admin_id and session_id):
        raise ImpersonationError("Malformed impersonation claims")

    # Session must still be active (kill switch check)
    sess_res = await db.execute(
        select(ImpersonationSession).where(
            ImpersonationSession.id == session_id
        )
    )
    session = sess_res.scalar_one_or_none()
    if session is None:
        raise ImpersonationError("Impersonation session not found")
    if not session.is_active:
        raise ImpersonationError("Impersonation session has ended")

    # Admin must still be an admin (revoked while token was valid)
    admin_res = await db.execute(select(User).where(User.id == admin_id))
    admin = admin_res.scalar_one_or_none()
    if admin is None or not is_admin(admin):
        # Auto-kill the session for safety
        session.is_active = False
        session.ended_at = datetime.now(timezone.utc)
        await db.commit()
        raise ImpersonationError("Admin no longer authorized")

    # Target user must exist
    target_res = await db.execute(select(User).where(User.id == target_id))
    target = target_res.scalar_one_or_none()
    if target is None:
        raise ImpersonationError("Target user no longer exists")

    return target, admin, session


# ---------------------------------------------------------------------
# query helpers
# ---------------------------------------------------------------------


async def list_active_sessions(
    db: AsyncSession,
) -> list[ImpersonationSession]:
    result = await db.execute(
        select(ImpersonationSession)
        .where(ImpersonationSession.is_active.is_(True))
        .order_by(ImpersonationSession.started_at.desc())
    )
    return list(result.scalars().all())


async def get_session(
    db: AsyncSession,
    session_id: str,
) -> ImpersonationSession | None:
    result = await db.execute(
        select(ImpersonationSession).where(ImpersonationSession.id == session_id)
    )
    return result.scalar_one_or_none()


# ---------------------------------------------------------------------
# serialization
# ---------------------------------------------------------------------


def session_to_dict(
    s: ImpersonationSession,
    *,
    admin_email: str | None = None,
    target_email: str | None = None,
) -> dict:
    return {
        "id": str(s.id),
        "admin_user_id": str(s.admin_user_id),
        "admin_email": admin_email,
        "target_user_id": str(s.target_user_id),
        "target_email": target_email,
        "reason": s.reason,
        "is_active": s.is_active,
        "ip": s.ip,
        "user_agent": s.user_agent,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "ended_at": s.ended_at.isoformat() if s.ended_at else None,
    }
