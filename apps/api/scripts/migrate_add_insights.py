"""
Migration: proactive insights — extend prefs + add 2 tables.

Run from apps/api/:

    python scripts/migrate_add_insights.py

Idempotent: re-running is safe.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from app.db.session import engine


SQL = """
-- 1. Extend user_notification_prefs with insight columns
ALTER TABLE user_notification_prefs
    ADD COLUMN IF NOT EXISTS insights_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_notification_prefs
    ADD COLUMN IF NOT EXISTS insights_dormant_revival BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE user_notification_prefs
    ADD COLUMN IF NOT EXISTS insights_contradiction BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE user_notification_prefs
    ADD COLUMN IF NOT EXISTS insights_decision_drift BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE user_notification_prefs
    ADD COLUMN IF NOT EXISTS insights_rhythm BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Surfaced insights: dedupe + rate-limit + audit
CREATE TABLE IF NOT EXISTS surfaced_insights (
    id                UUID PRIMARY KEY,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind              VARCHAR(32) NOT NULL,
    dedupe_key        VARCHAR(128) NOT NULL,
    trigger_node_id   UUID,
    related_node_ids  JSON NOT NULL DEFAULT '[]'::json,
    title             VARCHAR(255) NOT NULL,
    body              TEXT NOT NULL DEFAULT '',
    click_url         VARCHAR(512),
    fired_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    dismissed_at      TIMESTAMPTZ,
    opened_at         TIMESTAMPTZ,
    CONSTRAINT uq_surfaced_insight_dedupe
        UNIQUE (user_id, kind, dedupe_key)
);

CREATE INDEX IF NOT EXISTS ix_surfaced_insights_user_fired
    ON surfaced_insights (user_id, fired_at DESC);

CREATE INDEX IF NOT EXISTS ix_surfaced_insights_kind
    ON surfaced_insights (kind);

-- 3. Insight checks: mark which nodes have been contradiction-checked
CREATE TABLE IF NOT EXISTS insight_checks (
    node_id     UUID PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
    checked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_insight_checks_checked_at
    ON insight_checks (checked_at);
"""


async def main() -> None:
    async with engine.begin() as conn:
        for stmt in SQL.split(";"):
            s = stmt.strip()
            if s:
                await conn.execute(text(s))
    print("OK: insight schema ready")


if __name__ == "__main__":
    asyncio.run(main())
