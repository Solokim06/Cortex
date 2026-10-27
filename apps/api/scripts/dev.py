"""
Windows-safe dev server.

Sets SelectorEventLoop *before* importing uvicorn, so both the
reloader parent and the child worker use it. Avoids the Proactor
"WinError 10038 — not a socket" crash that occasionally kills the
reload process when Neo4j's async driver is in play.

Usage:
    python scripts/dev.py
"""

import asyncio
import sys
from pathlib import Path

# Must run before anything imports uvicorn or asyncio internals.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Make "main" importable when run from scripts/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uvicorn  # noqa: E402


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8010,
        reload=True,
        reload_dirs=[str(Path(__file__).resolve().parent.parent / "app")],
        reload_includes=["*.py"],
    )
