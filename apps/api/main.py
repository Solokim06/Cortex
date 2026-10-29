import asyncio
import os
import sys

# Neo4j's async driver + ProactorEventLoop on Windows triggers
# WinError 10038 ("not a socket"). SelectorEventLoop is compatible.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.staticfiles import StaticFiles

from app.config.settings import settings
from app.db.base import Base
from app.db.session import AsyncSessionLocal, engine
from app.db import models  # noqa: F401 — registers models with metadata
from app.graph.client import close_driver
from app.routers import (
    admin,
    agent,
    capture,
    chat,
    decision,
    extension,
    files,
    help,
    identity,
    learning,
    memory,
    public,
    reflection,
    topics,
    voice,
)
from app.routers import inbound_email as inbound_email_router
from app.routers import user as user_router
from app.services import email_retry as email_retry_service
from app.services import pubsub as pubsub_service
from app.services import sla as sla_service
from app.services import sla_jobs as sla_jobs_service
from app.services import webhook_retry as webhook_retry_service
from app.services import webhooks as webhooks_service


async def _graph_warmup_loop() -> None:
    """
    Keep Neo4j Aura warm by pinging every 60s. Free-tier instances
    cold-start after ~5 min idle, which makes the first query slow.
    """

    from app.graph.client import test_connection

    while True:
        try:
            await asyncio.wait_for(test_connection(), timeout=4.0)
        except Exception:  # noqa: BLE001
            pass
        try:
            await asyncio.sleep(25)
        except asyncio.CancelledError:
            return


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ================================================================
    # STARTUP
    # ================================================================

    # 1. Ensure DB schema is up to date
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("[Cortex] Database ready")

    # 2. Seed SLA policies (idempotent — reads settings.sla_defaults)
    try:
        async with AsyncSessionLocal() as db:
            for priority in ("urgent", "high", "normal", "low"):
                await sla_service.ensure_policy(db, priority)
        print("[Cortex] SLA policies seeded")
    except Exception as e:  # noqa: BLE001
        print(f"[Cortex] SLA seed skipped: {e}")

    # 3. Seed webhook targets from settings.webhook_urls if table empty
    try:
        async with AsyncSessionLocal() as db:
            created = await webhooks_service.seed_from_settings(db)
        if created:
            print(f"[Cortex] Seeded {created} webhook target(s) from env")
    except Exception as e:  # noqa: BLE001
        print(f"[Cortex] Webhook seed skipped: {e}")

    # 4. Start background workers
    #    Both workers run one immediate pass on start, then loop.
    try:
        sla_jobs_service.start_worker()
        print("[Cortex] SLA worker started")
    except Exception as e:  # noqa: BLE001
        print(f"[Cortex] SLA worker failed to start: {e}")

    try:
        webhook_retry_service.start_retry_worker()
        print("[Cortex] Webhook retry worker started")
    except Exception as e:  # noqa: BLE001
        print(f"[Cortex] Webhook retry worker failed to start: {e}")

    try:
        email_retry_service.start_worker()
        print("[Cortex] Email retry worker started")
    except Exception as e:  # noqa: BLE001
        print(f"[Cortex] Email retry worker failed to start: {e}")

    # Start graph warmup (keeps Aura from cold-starting)
    try:
        _warmup_task = asyncio.create_task(
            _graph_warmup_loop(), name="graph-warmup"
        )
        print("[Cortex] Graph warmup started")
    except Exception as e:  # noqa: BLE001
        print(f"[Cortex] Graph warmup failed: {e}")

    print("[Cortex] Startup complete")

    yield

    # ================================================================
    # SHUTDOWN
    # ================================================================

    # Stop background workers first (they may be mid-DB-write)
    try:
        await sla_jobs_service.stop_worker()
    except Exception as e:  # noqa: BLE001
        print(f"[Cortex] SLA worker shutdown error: {e}")

    try:
        await webhook_retry_service.stop_retry_worker()
    except Exception as e:  # noqa: BLE001
        print(f"[Cortex] Webhook worker shutdown error: {e}")

    try:
        await email_retry_service.stop_worker()
    except Exception as e:  # noqa: BLE001
        print(f"[Cortex] Email worker shutdown error: {e}")

    # Close pubsub (Redis client if used)
    try:
        await pubsub_service.shutdown()
    except Exception as e:  # noqa: BLE001
        print(f"[Cortex] Pubsub shutdown error: {e}")

    # Close graph + DB
    await close_driver()
    await engine.dispose()
    print("[Cortex] Shutdown complete")


app = FastAPI(
    title="Cortex API",
    version="1.0.0",
    description="The external mind — capture, connect, and converse with your own knowledge.",
    lifespan=lifespan,
)

# CORS: allow the web app + browser extensions.
# Read origins from env (comma-separated). Fallback to localhost + settings.web_url.
_cors_env = os.getenv("CORS_ORIGINS", "").strip()
if _cors_env:
    _allowed_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]
else:
    _allowed_origins = ["http://localhost:3000", settings.web_url]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_origin_regex=r"^(https://.*\.vercel\.app|http://localhost:\d+|chrome-extension://[a-zA-Z0-9-]+|moz-extension://[a-zA-Z0-9-]+)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "X-Locale",
        "X-AI-Consent",
        "X-Requested-With",
    ],
)

# Set the AI consent header into a contextvar for the duration of the
# request. Downstream services (is_ai_processing_allowed) read it from
# there so we don't have to thread `request` through every signature.
from starlette.requests import Request as _StarletteRequest
from app.services.consent import set_ai_consent_header as _set_ai_header

@app.middleware("http")
async def _ai_consent_middleware(request: _StarletteRequest, call_next):
    # Bypass preflight: OPTIONS requests don't carry app headers,
    # and touching contextvars here can 400 before CORS responds.
    if request.method == "OPTIONS":
        return await call_next(request)
    _set_ai_header(request.headers.get("x-ai-consent"))
    return await call_next(request)


# --- Static uploads ---
# Serves user-uploaded screenshots at /uploads/feedback/<file>.
# In production, put a CDN in front of this.
_UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"
_UPLOADS_DIR.mkdir(exist_ok=True)
app.mount(
    "/uploads",
    StaticFiles(directory=str(_UPLOADS_DIR)),
    name="uploads",
)


# --- Routers ---
app.include_router(agent.router)
app.include_router(capture.router)
app.include_router(chat.router)
app.include_router(memory.router)
app.include_router(topics.router)
app.include_router(learning.router)
app.include_router(decision.router)
app.include_router(reflection.router)
app.include_router(identity.router)
app.include_router(voice.router)
app.include_router(extension.router)
app.include_router(help.router)
app.include_router(public.router)
app.include_router(admin.router)
app.include_router(inbound_email_router.router)
app.include_router(user_router.router)
app.include_router(files.router)


# --- Health & Root ---
@app.get("/", tags=["system"])
async def root():
    return {
        "message": "Cortex API — the external mind",
        "status": "alive",
        "version": "1.0.0",
    }


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "service": "cortex-api"}


@app.get("/health/graph", tags=["system"])
async def health_graph():
    from app.graph.client import test_connection
    try:
        msg = await test_connection()
        return {"status": "ok", "graph": msg}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


# --- OpenAPI customization: add Bearer auth to Swagger UI ---

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )

    openapi_schema.setdefault("components", {}).setdefault("securitySchemes", {})
    openapi_schema["components"]["securitySchemes"]["HTTPBearer"] = {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": "Paste your Clerk session token (without the word 'Bearer').",
    }

    public_paths = {"/", "/health", "/health/graph", "/openapi.json", "/docs", "/redoc"}

    for path, methods in openapi_schema.get("paths", {}).items():
        if path in public_paths:
            continue
        for method in methods.values():
            method["security"] = [{"HTTPBearer": []}]

    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi