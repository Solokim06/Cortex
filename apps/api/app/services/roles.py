"""
Role resolution for the admin/support surface.

The DB column `users.role` is the source of truth. Clerk's
`publicMetadata.role` is *mirrored* into it, but only during bootstrapping —
once a user has been promoted (either via env bootstrap or manual DB edit),
their DB role wins and Clerk is ignored.

Bootstrapping flow:
  1. env ADMIN_EMAILS / AGENT_EMAILS lists promote a user on first sight
  2. Clerk publicMetadata.role is read from the JWT claims and mirrors
     into the DB only if the DB role is still "user"
  3. Manual DB edits (UPDATE users SET role='admin') are never overwritten

Valid roles: "user" | "agent" | "admin"
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.db.models import User

ROLE_USER = "user"
ROLE_AGENT = "agent"
ROLE_ADMIN = "admin"

VALID_ROLES = {ROLE_USER, ROLE_AGENT, ROLE_ADMIN}

# Ordered by privilege level — a role can do everything a lower role can.
_ROLE_RANK = {ROLE_USER: 0, ROLE_AGENT: 1, ROLE_ADMIN: 2}


# ---------------------------------------------------------------------
# basic predicates
# ---------------------------------------------------------------------


def is_valid_role(role: str | None) -> bool:
    return role in VALID_ROLES


def role_rank(role: str | None) -> int:
    return _ROLE_RANK.get(role or ROLE_USER, 0)


def has_at_least(user: User | None, minimum: str) -> bool:
    """True if the user's role is at least `minimum` in the privilege order."""
    if user is None:
        return False
    return role_rank(user.role) >= role_rank(minimum)


def is_admin(user: User | None) -> bool:
    return has_at_least(user, ROLE_ADMIN)


def is_agent(user: User | None) -> bool:
    """Admins are agents too."""
    return has_at_least(user, ROLE_AGENT)


# ---------------------------------------------------------------------
# bootstrap from environment
# ---------------------------------------------------------------------


def _bootstrap_role_from_env(email: str | None) -> str | None:
    """
    Return the role env wants for this email, or None if email isn't listed.
    Admin list wins over agent list.
    """
    if not email:
        return None
    e = email.strip().lower()
    if e in settings.admin_email_set:
        return ROLE_ADMIN
    if e in settings.agent_email_set:
        return ROLE_AGENT
    return None


def _bootstrap_role_from_clerk(claims: dict | None) -> str | None:
    """
    Clerk-metadata bootstrap has been DISABLED.

    Earlier in this project, Clerk public_metadata.role was being read
    and promoted to the user's DB role on every request, which caused
    a promotion loop that was hard to escape from the admin UI.

    The environment bootstrap (ADMIN_EMAILS / AGENT_EMAILS) remains
    active. If you want Clerk metadata to drive roles in the future,
    re-enable this function but only call it at user creation — not on
    every request.
    """
    return None


# ---------------------------------------------------------------------
# main entry point: resolve + sync
# ---------------------------------------------------------------------


async def resolve_and_sync_role(
    db: AsyncSession,
    user: User,
    clerk_claims: dict | None = None,
    *,
    commit: bool = True,
) -> str:
    """
    Return the effective role for `user`, promoting them if bootstrap
    conditions apply. Mutates `user.role` in the DB when a promotion
    happens.

    Promotion rules (in order, first match wins):
      1. env ADMIN_EMAILS / AGENT_EMAILS — always wins if higher than current
      2. Clerk publicMetadata.role — only if current DB role is still "user"
      3. otherwise, current DB role is kept

    Never demotes. To remove an admin, edit the DB directly.
    """
    current = user.role if is_valid_role(user.role) else ROLE_USER

    # 1. env bootstrap
    env_role = _bootstrap_role_from_env(user.email)
    if env_role and role_rank(env_role) > role_rank(current):
        user.role = env_role
        if commit:
            await db.commit()
            await db.refresh(user)
        return env_role

    # 2. Clerk mirror — only if DB is still user-level
    if current == ROLE_USER:
        clerk_role = _bootstrap_role_from_clerk(clerk_claims)
        if clerk_role and clerk_role != ROLE_USER:
            user.role = clerk_role
            if commit:
                await db.commit()
                await db.refresh(user)
            return clerk_role

    # 3. no change
    return current


# ---------------------------------------------------------------------
# admin helpers
# ---------------------------------------------------------------------


async def list_users_with_roles(
    db: AsyncSession,
    *,
    search: str | None = None,
    role: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[User]:
    """List users for the admin UI (assignee picker, impersonation target)."""
    stmt = select(User)

    if role and is_valid_role(role):
        stmt = stmt.where(User.role == role)

    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(
            (User.email.ilike(like)) | (User.name.ilike(like))
        )

    stmt = stmt.order_by(User.created_at.desc()).limit(limit).offset(offset)

    result = await db.execute(stmt)
    return list(result.scalars().all())


async def set_role(
    db: AsyncSession,
    user_id: str,
    role: str,
) -> User | None:
    """Directly set a user's role. For the admin UI."""
    if role not in VALID_ROLES:
        return None

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        return None

    user.role = role
    await db.commit()
    await db.refresh(user)
    return user
