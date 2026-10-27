"""
Backfill edges for every existing node.

Run from apps/api/:

    python scripts/backfill_edges.py

Idempotent — re-running re-checks everything, but only writes new edges.
Safe to run while the API is live (the edge dedupe handles races).
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from app.db.models import EdgeCheck, Node
from app.db.session import AsyncSessionLocal
from app.services import edges as edges_service


async def main() -> None:
    async with AsyncSessionLocal() as db:
        # 1. Concept-to-concept implicit edges first (cheap, no LLM)
        print("=== implicit concept edges ===")
        users = list(
            (await db.execute(select(Node.user_id).distinct())).scalars().all()
        )
        for uid in users:
            try:
                created = await edges_service.generate_implicit_concept_edges(
                    db, str(uid)
                )
                print(f"  user {str(uid)[:8]}: +{created} implicit edges")
            except Exception as e:  # noqa: BLE001
                print(f"  user {str(uid)[:8]}: implicit pass failed — {e}")

        # 2. LLM edge generation for each thought/capture node that
        #    hasn't been checked yet
        print("\n=== LLM edge pass ===")
        nodes = list(
            (
                await db.execute(
                    select(Node).where(
                        Node.type.in_(["thought", "capture"]),
                    ).order_by(Node.created_at.asc())
                )
            ).scalars().all()
        )
        print(f"  {len(nodes)} thought nodes to process")

        processed = 0
        created_total = 0
        for node in nodes:
            # Check if already done (allows resuming)
            exists = await db.execute(
                select(EdgeCheck).where(EdgeCheck.node_id == node.id)
            )
            if exists.scalar_one_or_none() is not None:
                continue

            try:
                created = await edges_service.generate_edges_for_node(
                    db, str(node.user_id), str(node.id)
                )
            except Exception as e:  # noqa: BLE001
                print(f"  {str(node.id)[:8]}: FAILED — {e}")
                continue

            if created is None:
                # no embedding — skip (will be retried by the worker)
                continue

            db.add(EdgeCheck(node_id=node.id, edges_created=created))
            await db.commit()
            processed += 1
            created_total += created
            if created:
                print(f"  {str(node.id)[:8]}: +{created} edges")

        print(f"\nDone. Processed {processed} nodes, created {created_total} LLM edges.")


if __name__ == "__main__":
    asyncio.run(main())
