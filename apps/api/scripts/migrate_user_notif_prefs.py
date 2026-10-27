"""
User notification prefs migration — idempotent.

Creates:
  - user_notification_prefs  (per-filer email toggles + unsubscribe token)

Backfills a row for every existing user with a fresh random token.

Safe to run multiple times.

Run from apps/api:
    python scripts/migrate_user_notif_prefs.py
"""

import asyncio
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select, text  # noqa: E402

from app.db.models import User, UserNotificationPrefs  # noqa: E402
from app.db.session import AsyncSessionLocal, engine  # noqa: E402


def _new_token() -> str:
    """32-char URL-safe token. Same shape used everywhere else."""
    return secrets.token_urlsafe(24)[:32]


async def _table_exists(conn, table: str) -> bool:
    q = text(
        """
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = :t
        """
    )
    res = await conn.execute(q, {"t": table})
    return res.first() is not None


async def _index_exists(conn, index: str) -> bool:
    q = text(
        "SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=:i"
    )
    res = await conn.execute(q, {"i": index})
    return res.first() is not None


async def create_table(conn) -> None:
    print("[1/2] user_notification_prefs table")

    if await _table_exists(conn, "user_notification_prefs"):
        print("  = table exists")
        return

    print("  + creating table")
    await conn.execute(
        text(
            """
            CREATE TABLE user_notification_prefs (
                user_id UUID PRIMARY KEY
                    REFERENCES users(id) ON DELETE CASCADE,
                email_on_ticket_reply BOOLEAN NOT NULL DEFAULT TRUE,
                email_on_status_change BOOLEAN NOT NULL DEFAULT TRUE,
                email_on_resolved BOOLEAN NOT NULL DEFAULT TRUE,
                unsubscribe_token VARCHAR(64) NOT NULL UNIQUE,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
    )

    if not await _index_exists(conn, "ix_user_notification_prefs_token"):
        print("  + index on unsubscribe_token")
        await conn.execute(
            text(
                "CREATE INDEX ix_user_notification_prefs_token "
                "ON user_notification_prefs(unsubscribe_token)"
            )
        )


async def backfill_rows() -> None:
    print("[2/2] backfill prefs for existing users")

    async with AsyncSessionLocal() as db:
        users = (
            await db.execute(select(User))
        ).scalars().all()
        if not users:
            print("  = no users to backfill")
            return

        user_ids = [str(u.id) for u in users]
        existing_rows = (
            await db.execute(
                select(UserNotificationPrefs).where(
                    UserNotificationPrefs.user_id.in_(user_ids)
                )
            )
        ).scalars().all()
        existing_user_ids = {str(r.user_id) for r in existing_rows}

        created = 0
        for u in users:
            if str(u.id) in existing_user_ids:
                continue
            db.add(
                UserNotificationPrefs(
                    user_id=str(u.id),
                    unsubscribe_token=_new_token(),
                )
            )
            created += 1

        if created:
            await db.commit()
            print(f"  + created {created} row(s)")
        else:
            print("  = all users already have a row")


async def main() -> None:
    print("[migrate_user_notif_prefs] starting")

    async with engine.begin() as conn:
        await create_table(conn)

    await backfill_rows()
    await engine.dispose()

    print("[migrate_user_notif_prefs] done")


if __name__ == "__main__":
    asyncio.run(main())
