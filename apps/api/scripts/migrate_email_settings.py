"""
Email settings migration — idempotent.

Creates:
  - email_settings   (singleton row for runtime email toggles)

Seeds the row from settings.email_enabled if missing.

Safe to run multiple times.

Run from apps/api:
    python scripts/migrate_email_settings.py
"""

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select, text  # noqa: E402

from app.config.settings import settings  # noqa: E402
from app.db.models import EmailSettings  # noqa: E402
from app.db.session import AsyncSessionLocal, engine  # noqa: E402


async def _table_exists(conn, table: str) -> bool:
    q = text(
        """
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = :t
        """
    )
    res = await conn.execute(q, {"t": table})
    return res.first() is not None


async def create_table(conn) -> None:
    print("[1/2] email_settings table")

    if await _table_exists(conn, "email_settings"):
        print("  = table exists")
        return

    print("  + creating table")
    await conn.execute(
        text(
            """
            CREATE TABLE email_settings (
                id VARCHAR(32) PRIMARY KEY DEFAULT 'default',
                enabled BOOLEAN NOT NULL DEFAULT TRUE,
                updated_by_user_id UUID NULL
                    REFERENCES users(id) ON DELETE SET NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
    )


async def seed_row() -> None:
    print("[2/2] seed singleton row")

    async with AsyncSessionLocal() as db:
        existing = (
            await db.execute(
                select(EmailSettings).where(EmailSettings.id == "default")
            )
        ).scalar_one_or_none()

        if existing:
            print(
                f"  = row exists (enabled={existing.enabled})"
            )
            return

        row = EmailSettings(
            id="default",
            enabled=settings.email_enabled,
        )
        db.add(row)
        await db.commit()
        print(
            f"  + created row (enabled={settings.email_enabled}, "
            f"from settings.email_enabled)"
        )


async def main() -> None:
    print("[migrate_email_settings] starting")

    async with engine.begin() as conn:
        await create_table(conn)

    await seed_row()
    await engine.dispose()

    print("[migrate_email_settings] done")


if __name__ == "__main__":
    asyncio.run(main())
