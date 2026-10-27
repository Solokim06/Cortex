"""
Backfill concept canonicalization.

Run from apps/api/:

    python scripts/backfill_canonicalization.py

Idempotent — re-running only processes nodes that haven't already been
canonicalized.

By default it runs against every user with concept nodes. Pass a
user_id as the first argument to limit it to one user.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from app.db.models import Node
from app.db.session import AsyncSessionLocal
from app.services import canonicalization as canon


async def main() -> None:
    async with AsyncSessionLocal() as db:
        # Discover users
        if len(sys.argv) > 1:
            user_ids = [sys.argv[1]]
        else:
            user_ids = list(
                (await db.execute(
                    text("SELECT DISTINCT user_id FROM nodes WHERE type = 'concept'")
                )).scalars().all()
            )

        total = {"aliased": 0, "left_canonical": 0, "already_done": 0}
        for uid in user_ids:
            uid_str = str(uid)
            print(f"\n=== canonicalizing user {uid_str[:8]} ===")
            stats = await canon.backfill_canonicalization(db, uid_str)
            for k in total:
                total[k] += stats[k]
            print(
                f"  aliased: {stats['aliased']}, "
                f"left canonical: {stats['left_canonical']}, "
                f"already done: {stats['already_done']}"
            )

        print(f"\n=== totals ===")
        print(f"  aliased:          {total['aliased']}")
        print(f"  left canonical:   {total['left_canonical']}")
        print(f"  already done:     {total['already_done']}")


if __name__ == "__main__":
    asyncio.run(main())
