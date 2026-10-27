"""
Rate limiting.

Fixed-window counter: for each (key, window_start), increment a counter.
If the counter exceeds `max`, reject.

Redis (preferred):
  - Key: f"{prefix}:{key}:{window_bucket}"
  - Uses INCR + EXPIRE for atomic counting
  - Window bucket = int(now / window_seconds)
  - Key expires automatically (window_seconds + small buffer)

In-memory fallback (dev / Redis unavailable):
  - Dict of {(key, bucket): count}
  - Pruned opportunistically on each check
  - Single-worker only — but that's the point of "fallback"

Public API:

    result = await check_rate_limit("help:ask", user_id, max=20, window=300)
    if not result.allowed:
        raise HTTPException(429, detail=..., headers={"Retry-After": ...})

`check_rate_limit` returns a dataclass with:
    allowed: bool
    limit: int
    remaining: int
    reset_after_seconds: int
    count: int
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

from app.config.settings import settings


# =====================================================================
# result type
# =====================================================================


@dataclass
class RateLimitResult:
    allowed: bool
    limit: int
    remaining: int
    reset_after_seconds: int
    count: int


# =====================================================================
# backend detection
# =====================================================================

_MODE_UNSET = "unset"
_MODE_REDIS = "redis"
_MODE_MEMORY = "memory"

_mode: str = _MODE_UNSET
_redis_client = None

# In-memory store: {(key, bucket): count}
_memory_store: dict[tuple[str, int], int] = {}
_memory_lock = asyncio.Lock()


async def _try_init_redis() -> bool:
    """Attempt to connect to Redis. Returns True on success."""
    global _redis_client

    if _mode == _MODE_REDIS and _redis_client is not None:
        return True

    try:
        import redis.asyncio as redis  # type: ignore
    except ImportError:
        return False

    try:
        client = redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        await client.ping()
        _redis_client = client
        return True
    except Exception:  # noqa: BLE001
        _redis_client = None
        return False


async def _resolve_mode() -> str:
    global _mode
    if _mode != _MODE_UNSET:
        return _mode

    ok = await _try_init_redis()
    _mode = _MODE_REDIS if ok else _MODE_MEMORY
    print(f"[rate-limit] mode = {_mode}")
    return _mode


# =====================================================================
# helpers
# =====================================================================


def _bucket(now: float, window: int) -> int:
    """Which window are we in? Increments once per `window` seconds."""
    return int(now // window)


def _redis_key(prefix: str, key: str, bucket: int) -> str:
    return f"{prefix}:{key}:{bucket}"


def _prune_memory(now_bucket: int) -> None:
    """Drop entries from old buckets. Called opportunistically."""
    stale = [k for k in _memory_store if k[1] < now_bucket]
    for k in stale:
        del _memory_store[k]


# =====================================================================
# Redis path
# =====================================================================


async def _check_redis(
    key: str,
    *,
    max_count: int,
    window: int,
) -> RateLimitResult:
    now = time.time()
    bucket = _bucket(now, window)
    rkey = _redis_key(settings.rate_limit_key_prefix, key, bucket)

    try:
        # Atomic increment
        count = await _redis_client.incr(rkey)
        # Set expiry on first hit of this window
        if count == 1:
            # Add a small buffer so late-arriving requests still see the key
            await _redis_client.expire(rkey, window + 5)
    except Exception as e:  # noqa: BLE001
        # Redis failed mid-request — fall back for this call
        print(f"[rate-limit] redis error, falling back: {e}")
        return await _check_memory(key, max_count=max_count, window=window)

    remaining = max(0, max_count - int(count))
    reset_after = window - int(now) % window

    return RateLimitResult(
        allowed=int(count) <= max_count,
        limit=max_count,
        remaining=remaining,
        reset_after_seconds=reset_after,
        count=int(count),
    )


# =====================================================================
# In-memory path
# =====================================================================


async def _check_memory(
    key: str,
    *,
    max_count: int,
    window: int,
) -> RateLimitResult:
    now = time.time()
    bucket = _bucket(now, window)

    async with _memory_lock:
        _prune_memory(bucket)
        k = (key, bucket)
        count = _memory_store.get(k, 0) + 1
        _memory_store[k] = count

    remaining = max(0, max_count - count)
    reset_after = window - int(now) % window

    return RateLimitResult(
        allowed=count <= max_count,
        limit=max_count,
        remaining=remaining,
        reset_after_seconds=reset_after,
        count=count,
    )


# =====================================================================
# public API
# =====================================================================


async def check_rate_limit(
    key: str,
    *,
    max_count: int | None = None,
    window: int | None = None,
) -> RateLimitResult:
    """
    Increment and check the rate limit for `key`.

    `key` should be a namespaced identifier, e.g. f"help:ask:{user_id}".

    Defaults come from settings.helprate_limit_*.
    """
    max_count = max_count if max_count is not None else settings.help_rate_limit_max
    window = window if window is not None else settings.help_rate_limit_window_seconds

    mode = await _resolve_mode()

    if mode == _MODE_REDIS:
        return await _check_redis(key, max_count=max_count, window=window)
    return await _check_memory(key, max_count=max_count, window=window)


# =====================================================================
# admin helper — inspect / reset
# =====================================================================


async def peek(key: str, *, window: int | None = None) -> int:
    """
    Read the current counter for a key without incrementing.
    Returns 0 if no counter exists.
    """
    window = window if window is not None else settings.help_rate_limit_window_seconds
    now = time.time()
    bucket = _bucket(now, window)

    mode = await _resolve_mode()

    if mode == _MODE_REDIS:
        try:
            rkey = _redis_key(settings.rate_limit_key_prefix, key, bucket)
            val = await _redis_client.get(rkey)
            return int(val or 0)
        except Exception:  # noqa: BLE001
            return 0

    return _memory_store.get((key, bucket), 0)


async def reset(key: str, *, window: int | None = None) -> bool:
    """
    Delete the current counter for a key. Returns True if something was
    deleted.
    """
    window = window if window is not None else settings.help_rate_limit_window_seconds
    now = time.time()
    bucket = _bucket(now, window)

    mode = await _resolve_mode()

    if mode == _MODE_REDIS:
        try:
            rkey = _redis_key(settings.rate_limit_key_prefix, key, bucket)
            n = await _redis_client.delete(rkey)
            return int(n) > 0
        except Exception:  # noqa: BLE001
            return False

    k = (key, bucket)
    if k in _memory_store:
        del _memory_store[k]
        return True
    return False


# =====================================================================
# shutdown
# =====================================================================


async def shutdown() -> None:
    global _redis_client, _mode
    if _redis_client is not None:
        try:
            await _redis_client.close()
        except Exception:  # noqa: BLE001
            pass
    _redis_client = None
    _mode = _MODE_UNSET


def current_mode() -> str:
    return _mode
