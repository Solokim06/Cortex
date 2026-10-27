"""
Clerk JWT verification using PyJWT.

Why PyJWT instead of python-jose: python-jose has a known bug parsing some
RS256 JWKs (specifically Clerk's), which makes signature verification fail
even when the kid matches. PyJWT's PyJWKClient handles Clerk's keys
correctly and is the library Clerk's own docs recommend.
"""
from typing import Any

import jwt  # PyJWT
from fastapi import HTTPException, status
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientError, InvalidTokenError

from app.config.settings import settings


# PyJWKClient caches keys internally and refreshes on kid miss, which is
# exactly the behavior we want (handles Clerk's key rotation).
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        if not settings.clerk_jwks_url:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="CLERK_JWKS_URL is not configured",
            )
        # cache_keys=True → PyJWKClient caches keys and only re-fetches when
        # it sees an unknown kid. lifespan=300s is a safety net.
        _jwks_client = PyJWKClient(
            settings.clerk_jwks_url,
            cache_keys=True,
            lifespan=300,
        )
    return _jwks_client


async def verify_clerk_token(token: str) -> dict[str, Any]:
    """
    Verify a Clerk session token and return its claims.

    Raises HTTPException(401) if invalid.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        # PyJWKClient picks the right key from the JWT's kid automatically.
        # If the kid isn't cached, it re-fetches the JWKS.
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)

        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=settings.clerk_issuer,
            options={
                # Clerk doesn't set `aud` on session tokens.
                "verify_aud": False,
            },
        )
        return claims

    except PyJWKClientError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not resolve signing key: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )
