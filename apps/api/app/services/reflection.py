import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Decision, Node, Reflection
from app.i18n import DEFAULT_LOCALE
from app.services.ai import call_llm_json
from app.services.memory import upsert_embedding


# ---------- Prompts ----------

REFLECTION_SYSTEM = """You are Cortex's Reflection Engine.
You help the user see patterns in their own thinking, extract lessons from their decisions,
and understand how they are growing over time.

You always return valid JSON. Never wrap it in markdown.
Be honest but kind. Focus on learning, not judgement.
Never moralize or prescribe. Show, don't tell.
"""

LESSON_EXTRACTION_TEMPLATE = """A user made a decision and its outcome is now known. Extract the deeper lesson.

Decision: {question}
Context: {context}
Chosen: {chosen_option}
Reasoning: {reasoning}
Expected: {expected_outcome}
Actual: {actual_outcome}

Return JSON in exactly this shape:

{{
  "title": "Short title for the lesson (max 60 chars)",
  "lesson": "One clear, generalizable insight (2-3 sentences max)",
  "why_it_matters": "Why this lesson is important to the user's growth",
  "tags": ["short", "topical", "tags"]
}}
"""

PERIOD_REPORT_TEMPLATE = """Generate a reflective report on the user's decisions over the last period.

Decisions in this period:

{decisions_summary}

Lessons extracted so far (if any):

{lessons_summary}

Return JSON in exactly this shape:

{{
  "title": "Short report title",
  "summary": "1-3 sentence overview",
  "themes": [
    "Recurring theme in their decisions"
  ],
  "strengths": [
    "Real strength shown in their thinking"
  ],
  "blind_spots": [
    "Recurring blind spot or bias"
  ],
  "growth_observations": [
    "How they seem to be changing or growing"
  ],
  "questions_to_sit_with": [
    "A reflective question for them to ponder"
  ]
}}

Be specific. Cite actual decisions by brief description. Do not invent patterns without evidence.
"""


# ---------- Lesson extraction ----------

async def extract_lesson_from_decision(
    db: AsyncSession,
    user_id: str,
    decision_id: str,
    locale: str = DEFAULT_LOCALE,
) -> Reflection | None:
    """Extract a lesson from a reviewed decision and store it as a Reflection + Node."""
    result = await db.execute(
        select(Decision).where(Decision.id == decision_id)
    )
    decision = result.scalar_one_or_none()
    if decision is None:
        return None

    prompt = LESSON_EXTRACTION_TEMPLATE.format(
        question=decision.question,
        context=decision.context or "(none)",
        chosen_option=decision.chosen_option or "(none)",
        reasoning=decision.reasoning or "(none)",
        expected_outcome=decision.expected_outcome or "(none)",
        actual_outcome=decision.actual_outcome or "(none)",
    )

    try:
        data = await call_llm_json(
            prompt=prompt,
            system=REFLECTION_SYSTEM,
            temperature=0.3,
            max_tokens=1200,
            locale=locale,
        )
    except Exception as e:
        print(f"[Cortex] Lesson extraction failed: {e}")
        data = {
            "title": "Lesson",
            "lesson": decision.lesson or "",
            "why_it_matters": "",
            "tags": [],
        }

    # Store as a Reflection
    reflection = Reflection(
        id=str(uuid.uuid4()),
        user_id=user_id,
        kind="lesson",
        decision_id=decision.id,
        title=data.get("title", "")[:200],
        content=data.get("lesson", ""),
        meta={
            "why_it_matters": data.get("why_it_matters", ""),
            "tags": data.get("tags", []),
            "source_question": decision.question,
        },
    )
    db.add(reflection)

    # Also store as a Node so it becomes part of the user's knowledge graph
    lesson_node = Node(
        id=str(uuid.uuid4()),
        user_id=user_id,
        type="reflection",
        title=data.get("title", "Lesson")[:200],
        content=data.get("lesson", ""),
        summary=data.get("why_it_matters", "")[:400],
        meta={
            "kind": "lesson",
            "decision_id": str(decision.id),
            "tags": data.get("tags", []),
        },
        confidence=0.9,
    )
    db.add(lesson_node)
    await db.commit()
    await db.refresh(reflection)
    await db.refresh(lesson_node)

    # Embed the lesson node so it becomes searchable
    try:
        embed_text = f"{lesson_node.title or ''}\n{lesson_node.content or ''}"
        await upsert_embedding(db, user_id, lesson_node.id, embed_text)
    except Exception as e:
        print(f"[Cortex] Lesson embedding failed: {e}")

    return reflection


# ---------- Pending reviews ----------

async def get_pending_reviews(
    db: AsyncSession,
    user_id: str,
) -> list[Decision]:
    """Decisions due for review (review_at <= now, status = 'decided')."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Decision)
        .where(Decision.user_id == user_id)
        .where(Decision.status == "decided")
        .where(Decision.review_at.isnot(None))
        .where(Decision.review_at <= now)
        .order_by(Decision.review_at.asc())
    )
    return list(result.scalars().all())


# ---------- Period report ----------

async def generate_report(
    db: AsyncSession,
    user_id: str,
    days: int = 30,
    locale: str = DEFAULT_LOCALE,
) -> Reflection:
    """Generate a reflective report over the last N days of decisions."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # 1. Fetch decisions in the period
    result = await db.execute(
        select(Decision)
        .where(Decision.user_id == user_id)
        .where(Decision.created_at >= since)
        .order_by(Decision.created_at.desc())
        .limit(50)
    )
    decisions = list(result.scalars().all())

    if not decisions:
        # Save an empty report
        reflection = Reflection(
            id=str(uuid.uuid4()),
            user_id=user_id,
            kind="weekly_report",
            title=f"Reflection — last {days} days",
            content="No decisions recorded in this period.",
            meta={"days": days, "decision_count": 0},
        )
        db.add(reflection)
        await db.commit()
        await db.refresh(reflection)
        return reflection

    # 2. Build decision summary
    lines = []
    for d in decisions:
        line = f"- Q: {d.question[:140]}"
        if d.chosen_option:
            line += f" | Chose: {d.chosen_option[:100]}"
        if d.actual_outcome:
            line += f" | Outcome: {d.actual_outcome[:100]}"
        if d.lesson:
            line += f" | Lesson: {d.lesson[:150]}"
        lines.append(line)

    # 3. Fetch recent lessons
    lesson_result = await db.execute(
        select(Reflection)
        .where(Reflection.user_id == user_id)
        .where(Reflection.kind == "lesson")
        .order_by(Reflection.created_at.desc())
        .limit(10)
    )
    lessons = list(lesson_result.scalars().all())
    lessons_text = "\n".join(
        f"- {r.title}: {r.content[:200]}" for r in lessons
    ) or "(No lessons extracted yet.)"

    # 4. Ask the AI
    prompt = PERIOD_REPORT_TEMPLATE.format(
        decisions_summary="\n".join(lines),
        lessons_summary=lessons_text,
    )

    try:
        data = await call_llm_json(
            prompt=prompt,
            system=REFLECTION_SYSTEM,
            temperature=0.4,
            max_tokens=2500,
            locale=locale,
        )
    except Exception as e:
        print(f"[Cortex] Report generation failed: {e}")
        data = {
            "title": f"Reflection — last {days} days",
            "summary": "Report generation failed.",
            "themes": [],
            "strengths": [],
            "blind_spots": [],
            "growth_observations": [],
            "questions_to_sit_with": [],
        }

    # 5. Store the report
    reflection = Reflection(
        id=str(uuid.uuid4()),
        user_id=user_id,
        kind="weekly_report",
        title=data.get("title", f"Reflection — last {days} days")[:200],
        content=data.get("summary", ""),
        meta={
            "days": days,
            "decision_count": len(decisions),
            "themes": data.get("themes", []),
            "strengths": data.get("strengths", []),
            "blind_spots": data.get("blind_spots", []),
            "growth_observations": data.get("growth_observations", []),
            "questions_to_sit_with": data.get("questions_to_sit_with", []),
        },
    )
    db.add(reflection)
    await db.commit()
    await db.refresh(reflection)
    return reflection


# ---------- Retrieval ----------

async def list_reflections(
    db: AsyncSession,
    user_id: str,
    kind: str | None = None,
    limit: int = 50,
) -> list[Reflection]:
    q = select(Reflection).where(Reflection.user_id == user_id)
    if kind:
        q = q.where(Reflection.kind == kind)
    q = q.order_by(Reflection.created_at.desc()).limit(limit)

    result = await db.execute(q)
    return list(result.scalars().all())


async def get_reflection(
    db: AsyncSession, reflection_id: str
) -> Reflection | None:
    result = await db.execute(
        select(Reflection).where(Reflection.id == reflection_id)
    )
    return result.scalar_one_or_none()
