"""
Add notifications table. Idempotent.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from app.db.session import AsyncSessionLocal


async def main():
    async with AsyncSessionLocal() as db:
        await db.execute(text("""
            CREATE TABLE IF NOT EXISTS notifications (
                id UUID PRIMARY KEY,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                event_kind VARCHAR(64) NOT NULL,
                title VARCHAR(255) NOT NULL,
                body TEXT NOT NULL DEFAULT '',
                ticket_id UUID NULL REFERENCES feedback_tickets(id) ON DELETE SET NULL,
                ticket_subject VARCHAR(255) NULL,
                click_url VARCHAR(512) NULL,
                extra JSONB NOT NULL DEFAULT '{}'::jsonb,
                read_at TIMESTAMPTZ NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                expires_at TIMESTAMPTZ NULL
            )
        """))
        await db.execute(text("CREATE INDEX IF NOT EXISTS ix_notifications_user_created ON notifications (user_id, created_at DESC)"))
        await db.execute(text("CREATE INDEX IF NOT EXISTS ix_notifications_user_unread ON notifications (user_id) WHERE read_at IS NULL"))
        await db.execute(text("CREATE INDEX IF NOT EXISTS ix_notifications_expires ON notifications (expires_at)"))
        await db.commit()
        print("migration applied: notifications")


if __name__ == "__main__":
    asyncio.run(main())
