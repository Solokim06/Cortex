"""
Graph reasoning eval harness.

Runs each question in eval_questions.json through the graph-native
reasoning path (reason_with_subgraph) and reports:

  - recall@graph      : how many expected nodes the walk found
  - precision@graph   : what fraction of walked nodes were expected
  - latency@graph     : wall-clock time for the graph path
  - mode              : "graph" or "fell_back" for each question

Also runs the flat keyword path (find_relevant_nodes) on the same
questions as a baseline, so you can compare.

Run from apps/api/:

    python scripts/eval_graph_reasoning.py
"""

import asyncio
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from app.db.models import Node
from app.db.session import AsyncSessionLocal
from app.services.chat import find_relevant_nodes
from app.services.graph_reasoning import reason_with_subgraph


USER_ID = "b2021b06-e709-4520-9a45-179063dd4b2e"


async def resolve_titles_to_ids(db, titles: list[str]) -> set[str]:
    """
    Look up node ids by title. Returns every matching id — a question can
    legitimately expect multiple nodes with the same title (e.g. the twin
    'recording quality' captures that were later canonicalized).
    """
    if not titles:
        return set()
    ids: set[str] = set()
    for title in titles:
        # Try exact match first
        r = await db.execute(
            select(Node.id).where(
                Node.user_id == USER_ID,
                Node.title == title,
            )
        )
        exact_hits = [str(row[0]) for row in r]
        if exact_hits:
            ids.update(exact_hits)
            continue

        # No exact match — try prefix (covers truncation in the JSON)
        prefix = title[:40]
        r = await db.execute(
            select(Node.id).where(
                Node.user_id == USER_ID,
                Node.title.ilike(f"{prefix}%"),
            )
        )
        for row in r:
            ids.add(str(row[0]))

    return ids



async def run_eval():
    qpath = Path(__file__).parent / "eval_questions.json"
    questions = json.loads(qpath.read_text(encoding="utf-8"))

    rows = []
    async with AsyncSessionLocal() as db:
        for q in questions:
            expected_ids = await resolve_titles_to_ids(db, q.get("expected_titles") or [])
            is_fallback_test = q.get("category") == "fallback"

            # ---- graph path ----
            t0 = time.monotonic()
            graph_result = None
            graph_error: str | None = None
            try:
                graph_result = await reason_with_subgraph(
                    db, USER_ID, q["question"], locale="en"
                )
            except Exception as e:
                graph_error = f"{type(e).__name__}: {e}"
                print(f"  [{q['id']}] graph error: {graph_error}")
            graph_latency = time.monotonic() - t0

            # ---- flat path ----
            t1 = time.monotonic()
            flat_nodes = await find_relevant_nodes(db, USER_ID, q["question"], limit=8)
            flat_latency = time.monotonic() - t1
            flat_ids = {str(n.id) for n in flat_nodes}

            # ---- graph metrics ----
            if graph_error is not None:
                graph_mode = "error"
                graph_ids = set()
                cited_ids = set()
            elif graph_result is None:
                graph_mode = "fell_back"
                graph_ids = set()
                cited_ids = set()
            else:
                # New: reason_with_subgraph returns mode "graph" or
                # "graph_declined". Keep both, but treat declined as a
                # distinct outcome for the fallback tests.
                graph_mode = graph_result.get("mode", "graph")
                graph_ids = {s["id"] for s in graph_result["sources"]}
                # Precision fix: count only nodes the LLM actually cited
                # in its reply, not every node the walk visited.
                import re as _re2
                reply_text = graph_result.get("reply", "")
                cited_indices = set(_re2.findall(r"\[n(\d+)\]", reply_text))
                # Node order in sources matches [nX] order used in the prompt.
                cited_ids = {
                    graph_result["sources"][int(i)]["id"]
                    for i in cited_indices
                    if int(i) < len(graph_result["sources"])
                }

            if is_fallback_test:
                # Fallback success now means "the system didn't pretend to
                # answer from the graph". Two ways to succeed:
                #   - mode == "fell_back"      (walk was empty)
                #   - mode == "graph_declined" (LLM ignored the subgraph)
                graph_recall = "N/A"
                graph_precision = "N/A"
                graph_ok = graph_mode in ("fell_back", "graph_declined")
            else:
                # recall: how many expected nodes did we find?
                if expected_ids:
                    found = expected_ids & graph_ids
                    graph_recall = f"{len(found)}/{len(expected_ids)}"
                else:
                    graph_recall = "—"
                # precision: of the nodes the LLM actually cited, how many
                # were expected? (was: of nodes walked — wrong question)
                if cited_ids:
                    graph_precision = f"{len(cited_ids & expected_ids) / len(cited_ids):.0%}"
                else:
                    graph_precision = "—"
                graph_ok = len(expected_ids & graph_ids) > 0 if expected_ids else None

            # ---- flat metrics ----
            if expected_ids:
                flat_found = expected_ids & flat_ids
                flat_recall = f"{len(flat_found)}/{len(expected_ids)}"
                flat_precision = (
                    f"{len(flat_ids & expected_ids) / len(flat_ids):.0%}"
                    if flat_ids else "—"
                )
            else:
                flat_recall = "—"
                flat_precision = "—"

            rows.append({
                "id": q["id"],
                "question": q["question"][:50],
                "cat": q.get("category", ""),
                "graph_mode": graph_mode,
                "graph_error": graph_error,
                "graph_recall": graph_recall,
                "graph_precision": graph_precision,
                "graph_ms": int(graph_latency * 1000),
                "flat_recall": flat_recall,
                "flat_precision": flat_precision,
                "flat_ms": int(flat_latency * 1000),
            })

    # ---- print table ----
    header = (
        f"{'id':<5} {'category':<20} {'mode':<10} "
        f"{'graph_rec':>10} {'graph_prc':>10} {'graph_ms':>9} "
        f"{'flat_rec':>10} {'flat_prc':>10} {'flat_ms':>8}"
    )
    print(header)
    print("-" * len(header))
    for r in rows:
        print(
            f"{r['id']:<5} {r['cat']:<20} {r['graph_mode']:<10} "
            f"{r['graph_recall']:>10} {r['graph_precision']:>10} {r['graph_ms']:>9} "
            f"{r['flat_recall']:>10} {r['flat_precision']:>10} {r['flat_ms']:>8}"
        )

    # ---- aggregate ----
    graph_used = [r for r in rows if r["graph_mode"] == "graph"]
    fallback_used = [r for r in rows if r["graph_mode"] == "fell_back"]
    fallback_tests = [r for r in rows if r["cat"] == "fallback"]

    errored = [r for r in rows if r["graph_mode"] == "error"]

    print()
    print(f"total questions:            {len(rows)}")
    print(f"graph mode triggered:       {len(graph_used)}")
    print(f"fell back to flat:          {len(fallback_used)}")
    print(f"graph path errored:         {len(errored)}")
    declined = sum(1 for r in fallback_tests if r["graph_mode"] == "graph_declined")
    fell_back = sum(1 for r in fallback_tests if r["graph_mode"] == "fell_back")
    print(f"fallback tests handled honestly:            {declined + fell_back}/{len(fallback_tests)}  (declined={declined}, fell_back={fell_back})")

    # Average latencies
    if graph_used:
        avg_graph = sum(r["graph_ms"] for r in graph_used) / len(graph_used)
        print(f"avg graph latency (ms):     {avg_graph:.0f}")
    avg_flat = sum(r["flat_ms"] for r in rows) / len(rows)
    print(f"avg flat  latency (ms):     {avg_flat:.0f}")


if __name__ == "__main__":
    asyncio.run(run_eval())
