"""
Browser extension endpoints.

Flow:
  1. User visits /settings → "Generate connect code"
  2. Backend mints a Clerk sign-in token (5 min)
  3. Extension redeems it for a Clerk session
  4. Extension immediately exchanges the Clerk JWT for a **Cortex API token**
     (30 days) via POST /extension/api-token
  5. All subsequent extension calls use the Cortex API token
  6. When the API token expires, the extension re-runs step 4 using its
     still-valid Clerk session — no user interaction needed
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.services.api_tokens import (
    DEFAULT_EXPIRY_DAYS,
    mint_token,
    revoke_token,
)
from app.services.clerk import create_sign_in_token, fetch_user


router = APIRouter(prefix="/extension", tags=["extension"])


# ---------- Request / response models ----------

class ConnectTokenRequest(BaseModel):
    label: str | None = Field(None, max_length=120)


class ConnectTokenResponse(BaseModel):
    ticket: str
    expires_in_seconds: int
    user_id: str


class MeResponse(BaseModel):
    user_id: str
    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None


class MintApiTokenRequest(BaseModel):
    label: str | None = Field(None, max_length=120)
    expires_in_days: int | None = Field(None, ge=1, le=365)


class MintApiTokenResponse(BaseModel):
    token: str
    prefix: str
    expires_at: str
    user_id: str


class RevokeApiTokenRequest(BaseModel):
    token_id: str


# ---------- Helpers ----------

def _require_clerk_id(user: User) -> str:
    if not user.clerk_user_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This account is missing a Clerk user ID. "
                "Sign out and back in to sync it."
            ),
        )
    return user.clerk_user_id


# ---------- Existing endpoints ----------

@router.post("/connect-token", response_model=ConnectTokenResponse)
async def create_connect_token(
    payload: ConnectTokenRequest | None = None,
    user: User = Depends(get_current_user),
):
    """Mint a short-lived Clerk sign-in token for the current user."""
    clerk_user_id = _require_clerk_id(user)
    resp = await create_sign_in_token(clerk_user_id, expires_in_seconds=300)

    ticket = resp.get("token") or resp.get("jwt") or ""
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Clerk returned no ticket. Response: {resp}",
        )

    return ConnectTokenResponse(
        ticket=ticket,
        expires_in_seconds=300,
        user_id=clerk_user_id,
    )


@router.get("/me", response_model=MeResponse)
async def get_me(user: User = Depends(get_current_user)):
    """Echo back the authenticated user."""
    email: str | None = (
        user.email if not user.email.endswith("@clerk.local") else None
    )
    first_name: str | None = None
    last_name: str | None = None

    if user.clerk_user_id:
        try:
            clerk_user = await fetch_user(user.clerk_user_id)
        except HTTPException:
            clerk_user = None

        if clerk_user:
            email_addresses = clerk_user.get("email_addresses") or []
            if email_addresses:
                primary_id = clerk_user.get("primary_email_address_id")
                primary = next(
                    (e for e in email_addresses if e.get("id") == primary_id),
                    email_addresses[0],
                )
                email = primary.get("email_address") or email
            first_name = clerk_user.get("first_name")
            last_name = clerk_user.get("last_name")

    return MeResponse(
        user_id=user.clerk_user_id or user.id,
        email=email,
        first_name=first_name,
        last_name=last_name,
    )


# ---------- Cortex API token (new) ----------

@router.post("/api-token", response_model=MintApiTokenResponse)
async def mint_api_token(
    payload: MintApiTokenRequest | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Exchange an authenticated session for a long-lived Cortex API token.

    Called by the extension right after sign-in. The plaintext token is
    returned ONCE — the client must store it, it cannot be retrieved again.
    """
    label = payload.label if payload else None
    days = (
        payload.expires_in_days
        if payload and payload.expires_in_days
        else DEFAULT_EXPIRY_DAYS
    )

    plaintext, row = await mint_token(
        db,
        user_id=user.id,
        label=label,
        expires_in_days=days,
    )

    expires_at_iso = (
        row.expires_at.isoformat()
        if isinstance(row.expires_at, datetime)
        else str(row.expires_at)
    )

    return MintApiTokenResponse(
        token=plaintext,
        prefix=row.token_prefix,
        expires_at=expires_at_iso,
        user_id=user.clerk_user_id or user.id,
    )


@router.post("/api-token/revoke")
async def revoke_api_token(
    payload: RevokeApiTokenRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Revoke a Cortex API token. Used by 'Disconnect' in the extension UI.

    Scoped to the requesting user — you can only revoke your own tokens.
    """
    ok = await revoke_token(db, payload.token_id, user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="Token not found")
    return {"revoked": True}
