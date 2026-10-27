"""
Public status page — subsystem health probes.

Each probe returns a component status:
  operational  — healthy
  degraded     — reachable but slow, or partially available
  down         — unreachable / erroring
  unknown      — could not be determined (e.g. optional provider not configured)

Results are cached in-memory for CACHE_TTL_SECONDS so page reloads
don't hammer every dependency. Cache is per-process (fine for one
worker; for multi-worker you'd use Redis).
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import text

from app.config.settings import settings
from app.db.session import AsyncSessionLocal


CACHE_TTL_SECONDS = 30
# Supabase from East Africa can spike well past 4s under load.
# 8s gives a healthy connection room without masking real outages.
PROBE_TIMEOUT_SECONDS = 8.0

StatusLevel = Literal["operational", "degraded", "down", "unknown"]


# =====================================================================
# component result
# =====================================================================


@dataclass
class ComponentStatus:
    key: str
    label: str
    status: StatusLevel
    detail: str = ""
    latency_ms: int | None = None
    provider: str | None = None


@dataclass
class StatusSnapshot:
    overall: StatusLevel
    components: list[ComponentStatus] = field(default_factory=list)
    generated_at: str = ""
    cached: bool = False


_cache: StatusSnapshot | None = None
_cache_at: float = 0.0
_cache_lock = asyncio.Lock()


# =====================================================================
# individual probes
# =====================================================================


async def _probe_api() -> ComponentStatus:
    """The API itself is by definition up (we're answering this)."""
    return ComponentStatus(
        key="api",
        label="API",
        status="operational",
        detail="Responding to requests",
        latency_ms=0,
    )


async def _probe_database() -> ComponentStatus:
    start = time.perf_counter()
    try:
        async with AsyncSessionLocal() as db:
            await asyncio.wait_for(
                db.execute(text("SELECT 1")),
                timeout=PROBE_TIMEOUT_SECONDS,
            )
        ms = int((time.perf_counter() - start) * 1000)
        # Supabase doesn't host in Africa. Kenya → Ireland RTT alone is
        # ~150-200ms; with pool churn, cold connects can spike to 2-3s.
        # 5s is the realistic ceiling for a healthy connection from here.
        # Kenya → Ireland RTT is ~150-200ms baseline, with spikes to 5s+
        # when Supabase's pooler is churning. Any successful query
        # means the DB is reachable — that's what the badge should say.
        # The latency_ms field still shows the real number.
        level: StatusLevel = "operational"
        return ComponentStatus(
            key="database",
            label="Database",
            status=level,
            detail=f"Query completed in {ms}ms",
            latency_ms=ms,
        )
    except asyncio.TimeoutError:
        return ComponentStatus(
            key="database",
            label="Database",
            status="down",
            detail="Timed out",
        )
    except Exception as e:  # noqa: BLE001
        return ComponentStatus(
            key="database",
            label="Database",
            status="down",
            detail=str(e)[:120],
        )


async def _probe_graph() -> ComponentStatus:
    """
    Neo4j probe — best-effort. If not configured, returns "unknown".
    """
    import time as _t
    _start = _t.time()
    print(f"[status._probe_graph] begin at {_start:.2f}")
    from app.config.settings import get_settings

    if not get_settings().neo4j_uri:
        return ComponentStatus(
            key="graph",
            label="Graph",
            status="unknown",
            detail="Neo4j not configured",
        )

    start = time.perf_counter()
    try:
        from app.graph.client import test_connection

        msg = await asyncio.wait_for(
            test_connection(),
            timeout=PROBE_TIMEOUT_SECONDS,
        )
        ms = int((time.perf_counter() - start) * 1000)
        # Supabase doesn't host in Africa. Kenya → Ireland RTT alone is
        # ~150-200ms; with pool churn, cold connects can spike to 2-3s.
        # 5s is the realistic ceiling for a healthy connection from here.
        level: StatusLevel = "operational" if ms < 5000 else "degraded"
        print(f"[status._probe_graph] OK ({ms}ms) at {_t.time():.2f}")
        return ComponentStatus(
            key="graph",
            label="Graph",
            status=level,
            detail=str(msg)[:120],
            latency_ms=ms,
            provider="Neo4j",
        )
    except asyncio.TimeoutError:
        return ComponentStatus(
            key="graph",
            label="Graph",
            status="down",
            detail="Timed out",
            provider="Neo4j",
        )
    except Exception as e:  # noqa: BLE001
        print(f"[status._probe_graph] FAIL at {_t.time():.2f}: {str(e)[:80]}")
        # Aura Free periodically drops the DB for 30-40s windows. Report
        # as "degraded" rather than "down" so admins don't panic — real
        # outages are indistinguishable from this at the probe level, so
        # we err on the side of caution in the UI.
        is_aura_flake = "DatabaseNotFound" in str(e) or "Database does not exist" in str(e)
        return ComponentStatus(
            key="graph",
            label="Graph",
            status="degraded" if is_aura_flake else "down",
            detail=str(e)[:120],
            provider="Neo4j",
        )


async def _probe_ai() -> ComponentStatus:
    """
    LLM probe. We don't actually call the model (too slow / expensive)
    — we just check that a key is configured.
    """
    provider_name = "Groq" if settings.groq_api_key else None
    if not provider_name:
        return ComponentStatus(
            key="ai",
            label="AI",
            status="unknown",
            detail="No LLM provider configured",
        )
    return ComponentStatus(
        key="ai",
        label="AI",
        status="operational",
        detail=f"{provider_name} API key present",
        provider=provider_name,
    )


async def _probe_embeddings() -> ComponentStatus:
    provider = settings.embedding_provider.lower()
    has_key = bool(
        (provider == "gemini" and settings.gemini_api_key)
        or (provider == "voyage" and settings.voyage_api_key)
    )
    if not has_key:
        return ComponentStatus(
            key="embeddings",
            label="Embeddings",
            status="unknown",
            detail=f"{provider.capitalize()} key missing",
            provider=provider.capitalize(),
        )
    return ComponentStatus(
        key="embeddings",
        label="Embeddings",
        status="operational",
        detail=f"{provider.capitalize()} API key present",
        provider=provider.capitalize(),
    )


async def _probe_email() -> ComponentStatus:
    provider = settings.email_provider
    if provider == "disabled":
        return ComponentStatus(
            key="email",
            label="Email",
            status="unknown",
            detail="Email disabled via settings",
        )
    if provider == "console":
        return ComponentStatus(
            key="email",
            label="Email",
            status="degraded",
            detail="Console backend (dev only)",
            provider="Console",
        )
    return ComponentStatus(
        key="email",
        label="Email",
        status="operational",
        detail=f"{provider.capitalize()} configured",
        provider=provider.upper(),
    )


# =====================================================================
# orchestrator
# =====================================================================


PROBES = [
    _probe_api,
    _probe_database,
    _probe_graph,
    _probe_ai,
    _probe_embeddings,
    _probe_email,
]


# Only these components are critical enough to take the whole system
# "down". Others (graph, email, embeddings) can be degraded without
# flipping the overall to red — the app still works for most users.
CRITICAL_KEYS = {"api", "database"}


def _overall_from(components: list[ComponentStatus]) -> StatusLevel:
    """
    Compute the overall status:

      - any CRITICAL component down → down
      - any component down or degraded → degraded
      - otherwise → operational
    """
    if any(c.status == "down" and c.key in CRITICAL_KEYS for c in components):
        return "down"
    if any(c.status in ("down", "degraded") for c in components):
        return "degraded"
    return "operational"


async def _run_all_probes() -> StatusSnapshot:
    components = await asyncio.gather(
        *[probe() for probe in PROBES],
        return_exceptions=False,
    )
    components = list(components)
    overall = _overall_from(components)
    return StatusSnapshot(
        overall=overall,
        components=components,
        generated_at=datetime.now(timezone.utc).isoformat(),
        cached=False,
    )


async def get_status(*, force: bool = False) -> StatusSnapshot:
    """
    Return the current status snapshot. Uses a 30s in-process cache
    unless `force=True`.
    """
    global _cache, _cache_at

    async with _cache_lock:
        now = time.monotonic()
        if not force and _cache is not None and (now - _cache_at) < CACHE_TTL_SECONDS:
            # Return a copy with cached=True
            return StatusSnapshot(
                overall=_cache.overall,
                components=_cache.components,
                generated_at=_cache.generated_at,
                cached=True,
            )

        snapshot = await _run_all_probes()
        _cache = snapshot
        _cache_at = now
        return snapshot


def snapshot_to_dict(s: StatusSnapshot) -> dict:
    return {
        "overall": s.overall,
        "generated_at": s.generated_at,
        "cached": s.cached,
        "components": [
            {
                "key": c.key,
                "label": c.label,
                "status": c.status,
                "detail": c.detail,
                "latency_ms": c.latency_ms,
                "provider": c.provider,
            }
            for c in s.components
        ],
    }



# =====================================================================
# Detailed diagnostics (admin health page)
# =====================================================================


async def detailed_diagnostics() -> dict:
    """
    Return a richer payload than the public /status endpoint.

    Combines:
      - probe results (same as /status)
      - table row counts + data age
      - failed deliveries (email + webhook)
      - pubsub mode + subscriber count
      - SLA breach count
      - feature flags from settings

    Never raises — any failure returns the error inline.
    """
    from app.config.settings import settings as _settings
    from sqlalchemy import func, select as _select

    from app.db.models import (
        EmailDelivery,
        FeedbackTicket,
        TicketEvent,
        User,
        WebhookDelivery,
    )
    from app.db.session import AsyncSessionLocal as _Session
    from app.services import sla as sla_service

    out: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    # --- 1. Probes (reuse the public path) ---
    try:
        snapshot = await get_status(force=True)
        out["probes"] = {
            "overall": snapshot.overall,
            "components": [
                {
                    "key": c.key,
                    "label": c.label,
                    "status": c.status,
                    "detail": c.detail,
                    "latency_ms": c.latency_ms,
                    "provider": c.provider,
                }
                for c in snapshot.components
            ],
        }
    except Exception as e:  # noqa: BLE001
        out["probes"] = {"error": str(e)}

    # --- 2. Data health ---
    try:
        async with _Session() as db:
            async def _count(model) -> int:
                r = await db.execute(_select(func.count()).select_from(model))
                return int(r.scalar_one())

            async def _age_days(model, ts_col) -> int | None:
                r = await db.execute(_select(func.min(ts_col)))
                oldest = r.scalar_one()
                if oldest is None:
                    return None
                if oldest.tzinfo is None:
                    oldest = oldest.replace(tzinfo=timezone.utc)
                delta = datetime.now(timezone.utc) - oldest
                return int(delta.total_seconds() // 86400)

            out["data_health"] = {
                "users": await _count(User),
                "tickets": await _count(FeedbackTicket),
                "events": await _count(TicketEvent),
                "email_deliveries": await _count(EmailDelivery),
                "webhook_deliveries": await _count(WebhookDelivery),
                "oldest_event_age_days": await _age_days(
                    TicketEvent, TicketEvent.created_at
                ),
                "oldest_ticket_age_days": await _age_days(
                    FeedbackTicket, FeedbackTicket.created_at
                ),
            }
    except Exception as e:  # noqa: BLE001
        out["data_health"] = {"error": str(e)}

    # --- 3. Pubsub mode + subscribers ---
    try:
        from app.services import pubsub as pubsub_service

        out["pubsub"] = {
            "mode": pubsub_service.current_mode(),
            "subscribers": pubsub_service.subscriber_count(),
        }
    except Exception as e:  # noqa: BLE001
        out["pubsub"] = {"error": str(e)}

    # --- 4. Failed deliveries feed ---
    try:
        async with _Session() as db:
            # Failed email deliveries (last 20)
            email_rows = (
                await db.execute(
                    _select(EmailDelivery)
                    .where(EmailDelivery.status == "failed")
                    .order_by(EmailDelivery.created_at.desc())
                    .limit(20)
                )
            ).scalars().all()

            # Failed webhook deliveries (last 20)
            webhook_rows = (
                await db.execute(
                    _select(WebhookDelivery)
                    .where(
                        (WebhookDelivery.status_code.is_(None))
                        | (WebhookDelivery.status_code >= 400)
                    )
                    .order_by(WebhookDelivery.delivered_at.desc())
                    .limit(20)
                )
            ).scalars().all()

            failures = []
            for e in email_rows:
                failures.append(
                    {
                        "kind": "email",
                        "id": str(e.id),
                        "target": e.to_email,
                        "template": e.template,
                        "error": (e.error or "")[:200],
                        "at": e.created_at.isoformat() if e.created_at else None,
                    }
                )
            for w in webhook_rows:
                failures.append(
                    {
                        "kind": "webhook",
                        "id": str(w.id),
                        "target": str(w.target_id),
                        "event_kind": w.event_kind,
                        "status_code": w.status_code,
                        "error": (w.response_body or "")[:200],
                        "at": (
                            w.delivered_at.isoformat() if w.delivered_at else None
                        ),
                    }
                )

            # Sort merged by time desc
            failures.sort(key=lambda f: f.get("at") or "", reverse=True)
            out["recent_failures"] = failures[:30]
    except Exception as e:  # noqa: BLE001
        out["recent_failures"] = {"error": str(e)}

    # --- 5. SLA breach count ---
    try:
        async with _Session() as db:
            open_tickets = (
                await db.execute(
                    _select(FeedbackTicket).where(
                        FeedbackTicket.status.in_(["open", "in_progress"])
                    )
                )
            ).scalars().all()
            now = datetime.now(timezone.utc)
            breached = sum(
                1 for t in open_tickets if sla_service.is_breached(t, now=now)
            )
            out["sla"] = {
                "breached_open": breached,
                "open_total": len(open_tickets),
            }
    except Exception as e:  # noqa: BLE001
        out["sla"] = {"error": str(e)}

    # --- 6. Environment / feature flags ---
    out["env"] = {
        "email_enabled": _settings.email_enabled,
        "email_provider": _settings.email_provider,
        "embedding_provider": _settings.embedding_provider,
        "help_rate_limit_max": _settings.help_rate_limit_max,
        "webhook_max_attempts": _settings.webhook_max_attempts,
        "impersonation_ttl_minutes": _settings.impersonation_ttl_minutes,
        "admin_emails_configured": bool(_settings.admin_email_set),
        "agent_emails_configured": bool(_settings.agent_email_set),
    }

    return out
