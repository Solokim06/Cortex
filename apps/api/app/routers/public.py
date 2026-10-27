"""
Public (unauthenticated) endpoints.

Currently:
  GET /public/status        — system health snapshot

These endpoints are safe to expose publicly:
  - No user data is returned
  - No PII
  - No counts that could leak business metrics
  - Just subsystem health + latencies

Rate limited? Not for v1 — the status service caches for 30s so
repeated hits are cheap. If this becomes a spam target, add a simple
IP-based limiter.
"""

from pydantic import BaseModel, Field  # noqa: E402
from fastapi import APIRouter, Depends, Query

from app.services import status as status_service

router = APIRouter(prefix="/public", tags=["public"])


# =====================================================================
# status
# =====================================================================


@router.get("/status")
async def public_status(
    force: bool = Query(
        False,
        description="Bypass the 30s cache and re-probe every subsystem.",
    ),
):
    """
    Return the current system health snapshot.

    Response shape:
      {
        overall: "operational" | "degraded" | "down",
        generated_at: "<ISO timestamp>",
        cached: true | false,
        components: [
          {
            key: "api" | "database" | "graph" | ...,
            label: "API" | "Database" | ...,
            status: "operational" | "degraded" | "down" | "unknown",
            detail: "short human string",
            latency_ms: 12 | null,
            provider: "Neo4j" | "Groq" | ... | null,
          },
          ...
        ]
      }
    """
    snapshot = await status_service.get_status(force=force)
    return status_service.snapshot_to_dict(snapshot)


# =====================================================================
# Public help center — no auth, rate-limited by IP
# =====================================================================

from fastapi import Request as _Request  # noqa: E402

from app.services import help as help_service  # noqa: E402
from app.services import rate_limit as rate_limit_service  # noqa: E402


class _PublicAskRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=1000)
    route: str | None = Field(None, max_length=200)


class _PublicCitedDoc(BaseModel):
    id: str
    title: str
    category: str


class _PublicAskResponse(BaseModel):
    answer: str
    cited_docs: list[_PublicCitedDoc]
    suggested_docs: list[_PublicCitedDoc]
    escalate: bool
    escalate_reason: str | None = None
    confidence: str = "medium"
    retrieval_weak: bool = False


def _client_ip(request: _Request) -> str:
    """Best-effort client IP, honouring common proxy headers."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host if request.client else "unknown"


async def _enforce_public_rate_limit(request: _Request) -> None:
    """Rate-limit anonymous help requests by IP."""
    from fastapi import HTTPException, status as _status

    ip = _client_ip(request)
    result = await rate_limit_service.check_rate_limit(f"public:help:{ip}")
    if not result.allowed:
        retry_after = max(1, result.reset_after_seconds)
        raise HTTPException(
            status_code=_status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Try again in {retry_after}s.",
            headers={"Retry-After": str(retry_after)},
        )


@router.post("/help/ask", response_model=_PublicAskResponse)
async def public_help_ask(
    payload: _PublicAskRequest,
    request: _Request,
    _rl: None = Depends(_enforce_public_rate_limit),
):
    """Anonymous help question — no login required."""
    context = {"route": payload.route} if payload.route else {}
    result = await help_service.ask_help(
        db=None,          # help_service doesn't use db for reads
        user_id="anon",
        question=payload.question,
        context=context,
        locale="en",
    )
    return _PublicAskResponse(**result)


@router.post("/help/ask/stream")
async def public_help_ask_stream(
    payload: _PublicAskRequest,
    request: _Request,
    _rl: None = Depends(_enforce_public_rate_limit),
):
    """Streaming variant — no login required."""
    import json as _json
    from fastapi.responses import StreamingResponse as _SR

    context = {"route": payload.route} if payload.route else {}

    async def event_source():
        try:
            async for frame in help_service.stream_help_answer(
                db=None,
                user_id="anon",
                question=payload.question,
                context=context,
                locale="en",
            ):
                yield f"data: {_json.dumps(frame, default=str)}\n\n"
        except Exception as e:  # noqa: BLE001
            print(f"[public/help/ask/stream] error: {e}")
            err = _json.dumps({"type": "error", "message": str(e)})
            yield f"data: {err}\n\n"
            yield f"data: {_json.dumps({'type': 'done'})}\n\n"

    return _SR(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/help/topics", response_model=list[dict])
async def public_help_topics():
    """Anonymous — list help categories."""
    return help_service.list_categories()


@router.get("/help/topics/{category}", response_model=list[dict])
async def public_help_topics_in_category(category: str):
    """Anonymous — list docs in a category."""
    from fastapi import HTTPException
    docs = help_service.list_docs_by_category(category)
    if not docs:
        raise HTTPException(status_code=404, detail="Category not found")
    return docs


@router.get("/help/docs/{doc_id}", response_model=dict)
async def public_help_doc(doc_id: str):
    """Anonymous — fetch a single doc."""
    from fastapi import HTTPException
    doc = help_service.get_doc(doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Doc not found")
    return {
        "id": doc["id"],
        "title": doc["title"],
        "category": doc["category"],
        "tags": doc.get("tags", []),
        "body": doc["body"],
        "related": doc.get("related", []),
    }
