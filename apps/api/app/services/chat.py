from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Node
from app.i18n import DEFAULT_LOCALE, tr
from app.services.ai import call_llm
from app.services.graph_reasoning import reason_with_subgraph


CHAT_SYSTEM = """You are Cortex, the user's external mind.

You have access to:
1. The user's captured knowledge (their thoughts, concepts, notes).
2. Your own general knowledge about the world.

Your job is to be genuinely useful while being honest about sources.

Rules:
1. ALWAYS check the user's captured knowledge first.
2. If the user's knowledge covers the question, ground your answer in it and cite specific thoughts or concepts by title in [brackets].
3. If the user's knowledge does NOT cover the question, say so briefly, then answer from general knowledge. Mark general answers as such.
4. Be warm, concise, honest, and calm. No filler. No sycophancy.
5. If you use the user's knowledge, reference it explicitly. If you use general knowledge, make it clear.
6. Never invent facts about the user that aren't in their captured knowledge.
7. Format responses for readability: use short paragraphs, and bold key terms when helpful.
8. CROSS-CONVERSATION RECALL
   If a system message beginning with "Relevant context from earlier
   conversations and captured notes" appears in your context, it comes
   from the user's own past — messages from other chats and captures
   they made earlier. Treat it as legitimate background. Draw on it
   whenever it sharpens your answer, and feel free to note that you
   remember the earlier exchange ("you mentioned before that...").
   Do not quote this block directly or refer to it as "recall".

Examples of good behavior:
- User knows about X, asks about X -> answer with their knowledge cited
- User doesn't know about Y, asks about Y -> say you don't see it in their captured knowledge, then answer from general knowledge
- User asks about a topic they partially know -> combine: their captured knowledge first, then fill gaps from general knowledge (clearly marked)
"""


async def find_relevant_nodes(
    db: AsyncSession,
    user_id: str,
    query: str,
    limit: int = 8,
) -> list[Node]:
    """Find nodes relevant to the query using keyword matching."""
    keywords = [w.strip().lower() for w in query.split() if len(w.strip()) > 3]

    if not keywords:
        result = await db.execute(
            select(Node)
            .where(Node.user_id == user_id)
            .order_by(Node.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    filters = []
    for kw in keywords:
        filters.append(Node.title.ilike(f"%{kw}%"))
        filters.append(Node.content.ilike(f"%{kw}%"))
        filters.append(Node.summary.ilike(f"%{kw}%"))

    result = await db.execute(
        select(Node)
        .where(Node.user_id == user_id)
        .where(or_(*filters))
        .order_by(Node.created_at.desc())
        .limit(limit)
    )

    nodes = list(result.scalars().all())

    if not nodes:
        result = await db.execute(
            select(Node)
            .where(Node.user_id == user_id)
            .order_by(Node.created_at.desc())
            .limit(limit)
        )
        nodes = list(result.scalars().all())

    return nodes


def build_context(nodes: list[Node], locale: str = DEFAULT_LOCALE) -> tuple[str, bool]:
    """
    Turn nodes into a context block for the LLM.
    Returns (context_string, has_relevant_knowledge).
    """
    if not nodes:
        return (tr("no_knowledge_captured", locale), False)

    lines = ["The user's captured knowledge (may or may not be relevant):"]
    for i, n in enumerate(nodes, 1):
        title = n.title or tr("untitled", locale)
        content = (n.content or "")[:400]
        summary = (n.summary or "").strip()

        lines.append(f"\n[{i}] {n.type.upper()}: {title}")
        if summary:
            lines.append(f"    Summary: {summary}")
        if content and content != title:
            lines.append(f"    Content: {content}")

    return ("\n".join(lines), True)


async def chat(
    db: AsyncSession,
    user_id: str,
    message: str,
    locale: str = DEFAULT_LOCALE,
) -> dict:
    """
    Answer a user message.

    First tries graph-native reasoning: walk the knowledge graph from a
    seed node, feed the LLM the connected subgraph with its typed edges.
    If the subgraph is too thin, falls back to the original keyword-based
    flat RAG path.
    """

    # --- Path 1: graph-native reasoning ---
    try:
        graph_result = await reason_with_subgraph(
            db, user_id, message, locale=locale
        )
    except Exception as e:  # noqa: BLE001
        print(f"[chat] graph reasoning failed, falling back: {e}")
        graph_result = None

    if graph_result is not None:
        return graph_result

    # --- Path 2: flat keyword RAG (existing behaviour) ---
    nodes = await find_relevant_nodes(db, user_id, message, limit=8)
    context, _ = build_context(nodes, locale)

    prompt = f"""{context}

---

The user asks:
{message}

Instructions:
- If the user's captured knowledge above is relevant to their question, answer using it and cite specific titles in [brackets].
- If the knowledge above is NOT relevant, briefly say so, then answer from your general knowledge. Clearly mark any general-knowledge content.
- Be concise. Use short paragraphs. Bold key terms when helpful.
"""

    reply = await call_llm(
        prompt=prompt,
        system=CHAT_SYSTEM,
        temperature=0.6,
        max_tokens=2000,
        locale=locale,
    )

    return {
        "reply": reply.strip(),
        "sources": [
            {"id": n.id, "type": n.type, "title": n.title}
            for n in nodes
        ],
        "nodes_used": len(nodes),
        "mode": "flat",
    }
