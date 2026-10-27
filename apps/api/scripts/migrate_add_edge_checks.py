"""
Migration: edge_checks table for graph edge generation.

Run from apps/api/:

    python scripts/migrate_add_edge_checks.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from app.db.session import engine


SQL = """
CREATE TABLE IF NOT EXISTS edge_checks (
    node_id        UUID PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
    checked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    edges_created  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_edge_checks_checked_at
    ON edge_checks (checked_at);
"""


async def main() -> None:
    async with engine.begin() as conn:
        for stmt in SQL.split(";"):
            s = stmt.strip()
            if s:
                await conn.execute(text(s))
    print("OK: edge_checks ready")


if __name__ == "__main__":
    asyncio.run(main())
