"""
FastAPI auth dependencies.

Extracts a Bearer token from the Authorization header and resolves the
corresponding User row.

Token kinds accepted:
  1. Clerk session JWT (issued by Clerk, ~60s TTL)
  2. Cortex API token (issued by us, ~30-day TTL) — used by the extension
  3. Impersonation JWT (issued by /admin/impersonate) — HS256, short TTL

Role checks:
  - get_current_user    → any authenticated user
  - get_current_agent   → role in {agent, admin}
  - get_current_admin   → role == admin

Impersonation:
  When the bearer token is an impersonation JWT, `get_current_user`
  resolves to the *target* user, but stashes the admin+session on
  request.state so downstream code can audit. Impersonation on any
  non-GET request should be treated as a team action.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.clerk import verify_clerk_token
from app.db.models import User
from app.db.session import get_db
from app.services import impersonation as imp_service
from app.services import roles as roles_service
from app.services.api_tokens import lookup_token, touch_token


# ---------------------------------------------------------------------
# Impersonation context (attached to request.state)
# ---------------------------------------------------------------------


@dataclass
class ImpersonationContext:
    admin_user_id: str
    target_user_id: str
    session_id: str


def get_impersonation_context(request: Request) -> ImpersonationContext | None:
    """
    Return the active impersonation context for this request, or None.
    Downstream code can use this to attribute actions to the admin
    rather than the target user.
    """
    return getattr(request.state, "impersonation", None)


def require_impersonation(request: Request) -> ImpersonationContext:
    ctx = get_impersonation_context(request)
    if ctx is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This endpoint requires an active impersonation session",
        )
    return ctx


# ---------------------------------------------------------------------
# token extraction
# ---------------------------------------------------------------------


# ---------------------------------------------------------------------
# In-process auth cache
#
# Clerk JWT verification + user resolution costs 3 DB round-trips
# (verify → SELECT user → role sync). From Nairobi to Supabase eu-west-1
# that's ~600-1000ms per request. We cache the fully-resolved User by
# the SHA-256 of the incoming token, with a short TTL that's always
# shorter than the Clerk JWT lifetime (~60s).
#
# Cache hit  → ~0ms
# Cache miss → pay the verification cost once, then serve from cache
#               until the token rotates or the TTL expires.
# ---------------------------------------------------------------------

import hashlib as _hashlib
import time as _time

_AUTH_CACHE: dict[str, tuple[float, "User"]] = {}
_AUTH_CACHE_TTL_SECONDS = 45


def _token_key(token: str) -> str:
    return _hashlib.sha256(token.encode("utf-8")).hexdigest()


def _auth_cache_get(token: str) -> "User | None":
    entry = _AUTH_CACHE.get(_token_key(token))
    if entry is None:
        return None
    ts, user = entry
    if _time.monotonic() - ts > _AUTH_CACHE_TTL_SECONDS:
        _AUTH_CACHE.pop(_token_key(token), None)
        return None
    return user


def _auth_cache_put(token: str, user: "User") -> None:
    _AUTH_CACHE[_token_key(token)] = (_time.monotonic(), user)
    if len(_AUTH_CACHE) > 2000:
        oldest = min(_AUTH_CACHE.items(), key=lambda kv: kv[1][0])
        _AUTH_CACHE.pop(oldest[0], None)


def _extract_bearer_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization") or request.headers.get("authorization")
    if not auth:
        return None
    parts = auth.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1]


# ---------------------------------------------------------------------
# API token path
# ---------------------------------------------------------------------


async def _resolve_by_api_token(
    db: AsyncSession,
    plaintext: str,
) -> User | None:
    row = await lookup_token(db, plaintext)
    if row is None:
        return None

    result = await db.execute(select(User).where(User.id == row.user_id))
    user = result.scalar_one_or_none()
    if user is None:
        return None

    await touch_token(db, row)
    return user


# ---------------------------------------------------------------------
# Clerk path
# ---------------------------------------------------------------------


async def _resolve_by_clerk(
    db: AsyncSession,
    token: str,
) -> tuple[User, dict]:
    claims = await verify_clerk_token(token)

    clerk_user_id = claims.get("sub")
    if not clerk_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing 'sub' claim",
        )

    email = claims.get("email") or f"{clerk_user_id}@clerk.local"
    first_name = claims.get("first_name") or ""
    last_name = claims.get("last_name") or ""
    full_name = (f"{first_name} {last_name}").strip() or None

    result = await db.execute(
        select(User).where(User.clerk_user_id == clerk_user_id)
    )
    user = result.scalar_one_or_none()

    if user is None:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    if user is None:
        user = User(
            clerk_user_id=clerk_user_id,
            email=email,
            name=full_name,
            role="user",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        changed = False
        if user.clerk_user_id != clerk_user_id:
            user.clerk_user_id = clerk_user_id
            changed = True
        if (
            not user.email or user.email.endswith("@clerk.local")
        ) and not email.endswith("@clerk.local"):
            user.email = email
            changed = True
        if full_name and user.name != full_name:
            user.name = full_name
            changed = True

        if changed:
            await db.commit()
            await db.refresh(user)

    # Role bootstrap (env + Clerk publicMetadata)
    await roles_service.resolve_and_sync_role(db, user, clerk_claims=claims)

    return user, claims


# ---------------------------------------------------------------------
# main dependency
# ---------------------------------------------------------------------


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Resolve the current user from:
      - a Clerk session JWT
      - a Cortex API token (starts with "cx_")
      - an impersonation JWT (has imp=true claim)

    For impersonation tokens, the returned User is the *target*, and
    request.state.impersonation is populated with admin + session info.
    """
    token = _extract_bearer_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Cortex API token (prefix "cx_")
    if token.startswith("cx_"):
        user = await _resolve_by_api_token(db, token)
        if user is not None:
            return user
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired API token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 2. Impersonation JWT — try first, fall back to Clerk
    #    (Impersonation tokens are HS256; Clerk are RS256. Try to decode
    #    as HS256 — if it fails, treat as Clerk.)
    impersonation_claims: dict | None = None
    try:
        impersonation_claims = imp_service.decode_token(token)
    except imp_service.ImpersonationError:
        impersonation_claims = None

    if impersonation_claims is not None:
        try:
            target, admin, session = await imp_service.resolve_impersonation(
                db, impersonation_claims
            )
        except imp_service.ImpersonationError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=str(e),
                headers={"WWW-Authenticate": "Bearer"},
            )

        request.state.impersonation = ImpersonationContext(
            admin_user_id=str(admin.id),
            target_user_id=str(target.id),
            session_id=str(session.id),
        )
        request.state.impersonated_by = admin
        return target

    # 3. Clerk session JWT — try the in-process cache first.
    cached_user = _auth_cache_get(token)
    if cached_user is not None:
        return cached_user

    user, _claims = await _resolve_by_clerk(db, token)
    _auth_cache_put(token, user)
    return user


# ---------------------------------------------------------------------
# role-gated dependencies
# ---------------------------------------------------------------------


async def get_current_agent(
    user: User = Depends(get_current_user),
) -> User:
    """
    Require role >= agent (agent or admin).

    Note: an impersonation token resolving to a normal user will be
    rejected here, even if the *admin* is an admin — impersonation is
    for acting *as* the user, not for gaining privileges.
    """
    if not roles_service.is_agent(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent access required",
        )
    return user


async def get_current_admin(
    user: User = Depends(get_current_user),
) -> User:
    """Require role == admin."""
    if not roles_service.is_admin(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user


# ---------------------------------------------------------------------
# actor resolution helper
# ---------------------------------------------------------------------


def actor_user_id_for(request: Request, user: User) -> str:
    """
    Return the id to attribute this request to.

    - Normal requests: the user's own id.
    - Impersonated requests: the *admin's* id (they're the real actor).

    Use this when writing TicketEvent rows or any audit trail so we
    record "admin X did this" rather than "user Y did this".
    """
    ctx = get_impersonation_context(request)
    if ctx is not None:
        return ctx.admin_user_id
    return str(user.id)


def actor_kind_for(request: Request) -> str:
    """
    Returns "team" if impersonating, else "user".

    Impersonated actions are team actions — the admin is the real actor.
    """
    return "team" if get_impersonation_context(request) is not None else "user"
