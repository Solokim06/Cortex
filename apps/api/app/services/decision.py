import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Decision
from app.i18n import DEFAULT_LOCALE
from app.services.ai import call_llm_json
from app.services.memory import semantic_search


# ---------- Prompts ----------

DECISION_SYSTEM = """You are Cortex's Decision Engine.
You help users make better decisions by grounding them in their own knowledge, past decisions, and values.

You always return valid JSON. Never wrap it in markdown.
Be honest, concrete, and specific. Prefer clarity over completeness.
Never moralize. Never assume what the user should want.
Help them think, not tell them what to do.
"""

DECISION_ANALYSIS_TEMPLATE = """A user is facing a decision.

Question: {question}
Context: {context}

Relevant knowledge from their captured mind:

{knowledge}

Past decisions they've made (for pattern awareness):

{past_decisions}

Analyze this decision. Return JSON in exactly this shape:

{{
  "framing": "1-2 sentences restating the core decision",
  "options": [
    {{
      "name": "Option name",
      "pros": ["pro 1", "pro 2"],
      "cons": ["con 1", "con 2"],
      "best_if": "circumstances where this option is best"
    }}
  ],
  "tradeoffs": [
    "key trade-off 1",
    "key trade-off 2"
  ],
  "patterns_noticed": [
    "Any pattern from their past decisions that's relevant (empty if none)"
  ],
  "blind_spots": [
    "Things they might be overlooking"
  ],
  "questions_to_ask_self": [
    "Powerful question 1",
    "Powerful question 2",
    "Powerful question 3"
  ],
  "suggested_review_days": 30
}}

Provide 2-5 options. Be specific about pros/cons.
If their knowledge is empty, still analyze the decision generically but note the limitation.
"""

OUTCOME_LESSON_TEMPLATE = """A user made a decision and now the outcome is known.

Decision: {question}
Context: {context}
Chosen option: {chosen_option}
Their reasoning: {reasoning}
Expected outcome: {expected_outcome}
Actual outcome: {actual_outcome}

Extract the lesson from this decision-outcome pair.

Return JSON in exactly this shape:

{{
  "lesson": "One clear, generalizable lesson the user should carry forward",
  "what_was_right": "What their thinking got right",
  "what_was_wrong": "What their thinking missed or got wrong",
  "recommendation_for_future": "A concrete recommendation for similar future decisions"
}}

Be honest but kind. Focus on learning, not blame.
"""


# ---------- Analysis ----------

async def analyze_decision(
    db: AsyncSession,
    user_id: str,
    question: str,
    context: str = "",
    chosen_option: str = "",
    reasoning: str = "",
    expected_outcome: str = "",
    locale: str = DEFAULT_LOCALE,
) -> Decision:
    """Analyze a decision using the user's knowledge graph and past decisions."""

    # 1. Semantic search over user's knowledge
    try:
        related = await semantic_search(
            db, user_id, f"{question} {context}", limit=8
        )
    except Exception as e:
        print(f"[Cortex] Decision semantic search failed: {e}")
        related = []

    knowledge_text = "\n".join(
        f"- [{r['type']}] {r['title']}: {(r['summary'] or r['content'] or '')[:250]}"
        for r in related
    ) or "(The user has no relevant captured knowledge yet.)"

    # 2. Fetch past decisions for pattern awareness
    past_result = await db.execute(
        select(Decision)
        .where(Decision.user_id == user_id)
        .where(Decision.status.in_(["decided", "reviewed"]))
        .order_by(Decision.created_at.desc())
        .limit(5)
    )
    past_decisions = list(past_result.scalars().all())

    if past_decisions:
        past_text = "\n".join(
            f"- Q: {d.question[:120]} | Chosen: {(d.chosen_option or '')[:100]} | "
            f"Expected: {(d.expected_outcome or '')[:100]} | "
            f"Actual: {(d.actual_outcome or 'not yet reviewed')[:100]}"
            for d in past_decisions
        )
    else:
        past_text = "(No past decisions recorded yet.)"

    # 3. AI analysis
    prompt = DECISION_ANALYSIS_TEMPLATE.format(
        question=question,
        context=context or "(no additional context)",
        knowledge=knowledge_text,
        past_decisions=past_text,
    )

    try:
        analysis = await call_llm_json(
            prompt=prompt,
            system=DECISION_SYSTEM,
            temperature=0.4,
            max_tokens=3000,
            locale=locale,
        )
    except Exception as e:
        print(f"[Cortex] Decision analysis failed: {e}")
        analysis = {
            "framing": question,
            "options": [],
            "tradeoffs": [],
            "patterns_noticed": [],
            "blind_spots": [],
            "questions_to_ask_self": [],
            "suggested_review_days": 30,
        }

    # 4. Save the decision
    decision = Decision(
        id=str(uuid.uuid4()),
        user_id=user_id,
        question=question,
        context=context or "",
        options=analysis.get("options", []),
        analysis={
            "framing": analysis.get("framing", ""),
            "tradeoffs": analysis.get("tradeoffs", []),
            "patterns_noticed": analysis.get("patterns_noticed", []),
            "blind_spots": analysis.get("blind_spots", []),
            "questions_to_ask_self": analysis.get("questions_to_ask_self", []),
            "suggested_review_days": analysis.get("suggested_review_days", 30),
        },
        chosen_option=chosen_option or None,
        reasoning=reasoning or None,
        expected_outcome=expected_outcome or None,
        status="decided" if chosen_option else "open",
        review_at=datetime.now(timezone.utc)
        + timedelta(days=analysis.get("suggested_review_days", 30)),
    )
    db.add(decision)
    await db.commit()
    await db.refresh(decision)

    return decision


# ---------- Retrieval ----------

async def get_decision(db: AsyncSession, decision_id: str) -> Decision | None:
    result = await db.execute(select(Decision).where(Decision.id == decision_id))
    return result.scalar_one_or_none()


async def list_decisions(
    db: AsyncSession,
    user_id: str,
    status: str | None = None,
    limit: int = 50,
) -> list[Decision]:
    q = select(Decision).where(Decision.user_id == user_id)
    if status:
        q = q.where(Decision.status == status)
    q = q.order_by(Decision.created_at.desc()).limit(limit)

    result = await db.execute(q)
    return list(result.scalars().all())


# ---------- Outcome recording ----------

async def record_outcome(
    db: AsyncSession,
    decision_id: str,
    actual_outcome: str,
    locale: str = DEFAULT_LOCALE,
) -> Decision | None:
    """Record what actually happened, and generate the lesson."""
    decision = await get_decision(db, decision_id)
    if decision is None:
        return None

    prompt = OUTCOME_LESSON_TEMPLATE.format(
        question=decision.question,
        context=decision.context or "(none)",
        chosen_option=decision.chosen_option or "(not recorded)",
        reasoning=decision.reasoning or "(none)",
        expected_outcome=decision.expected_outcome or "(not recorded)",
        actual_outcome=actual_outcome,
    )

    try:
        result = await call_llm_json(
            prompt=prompt,
            system=DECISION_SYSTEM,
            temperature=0.3,
            max_tokens=1200,
            locale=locale,
        )
    except Exception as e:
        print(f"[Cortex] Lesson extraction failed: {e}")
        result = {
            "lesson": "",
            "what_was_right": "",
            "what_was_wrong": "",
            "recommendation_for_future": "",
        }

    decision.actual_outcome = actual_outcome
    decision.lesson = result.get("lesson", "")
    decision.analysis = {
        **(decision.analysis or {}),
        "what_was_right": result.get("what_was_right", ""),
        "what_was_wrong": result.get("what_was_wrong", ""),
        "recommendation_for_future": result.get("recommendation_for_future", ""),
    }
    decision.status = "reviewed"
    decision.reviewed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(decision)
    return decision


# ---------- Review scheduling ----------

async def get_due_reviews(
    db: AsyncSession,
    user_id: str,
) -> list[Decision]:
    """Return decisions that are due for review right now."""
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


# ---------- Pattern detection ----------

async def detect_patterns(
    db: AsyncSession,
    user_id: str,
    locale: str = DEFAULT_LOCALE,
) -> dict:
    """Look across all decisions and find recurring themes."""
    result = await db.execute(
        select(Decision)
        .where(Decision.user_id == user_id)
        .order_by(Decision.created_at.desc())
        .limit(20)
    )
    decisions = list(result.scalars().all())

    if len(decisions) < 2:
        return {
            "count": len(decisions),
            "patterns": [],
            "note": "Need at least 2 decisions to detect patterns.",
        }

    summary_lines = []
    for d in decisions:
        line = f"- Q: {d.question[:150]}"
        if d.chosen_option:
            line += f" | Chose: {d.chosen_option[:100]}"
        if d.actual_outcome:
            line += f" | Outcome: {d.actual_outcome[:100]}"
        if d.lesson:
            line += f" | Lesson: {d.lesson[:150]}"
        summary_lines.append(line)

    prompt = f"""The user has made the following decisions over time:

{chr(10).join(summary_lines)}

Look for patterns across these decisions — recurring themes, biases, strengths, blind spots.

Return JSON in exactly this shape:

{{
  "patterns": [
    {{
      "name": "Short pattern name",
      "description": "1-2 sentence explanation",
      "evidence": ["specific decision reference 1", "specific decision reference 2"],
      "confidence": "low|medium|high"
    }}
  ],
  "strengths": ["Strength noticed in their decision-making"],
  "blind_spots": ["Recurring blind spot noticed"]
}}

Be specific. Only report patterns with real evidence. Return an empty list if there's not enough data.
"""

    try:
        result = await call_llm_json(
            prompt=prompt,
            system=DECISION_SYSTEM,
            temperature=0.3,
            max_tokens=2000,
            locale=locale,
        )
    except Exception as e:
        print(f"[Cortex] Pattern detection failed: {e}")
        result = {"patterns": [], "strengths": [], "blind_spots": []}

    return {
        "count": len(decisions),
        "patterns": result.get("patterns", []),
        "strengths": result.get("strengths", []),
        "blind_spots": result.get("blind_spots", []),
    }


# ---------- Update (decide-later flow) ----------

async def update_decision(
    db: AsyncSession,
    decision_id: str,
    chosen_option: str | None = None,
    reasoning: str | None = None,
    expected_outcome: str | None = None,
    review_days: int | None = None,
) -> Decision | None:
    """
    Update a decision after it was analyzed. Used for the "decide later"
    flow: the user reviews the AI analysis, then commits to an option.

    Only fields passed as non-None are updated.
    """
    decision = await get_decision(db, decision_id)
    if decision is None:
        return None

    if chosen_option is not None:
        decision.chosen_option = chosen_option.strip() or None

    if reasoning is not None:
        decision.reasoning = reasoning.strip() or None

    if expected_outcome is not None:
        decision.expected_outcome = expected_outcome.strip() or None

    # Status transitions
    if decision.chosen_option and decision.status == "open":
        decision.status = "decided"

    # Reschedule review if a new window was requested
    if review_days is not None and decision.chosen_option:
        decision.review_at = datetime.now(timezone.utc) + timedelta(
            days=max(1, min(review_days, 365))
        )

    await db.commit()
    await db.refresh(decision)
    return decision


# ---------- Delete ----------

async def delete_decision(
    db: AsyncSession,
    decision_id: str,
) -> bool:
    """
    Permanently remove a decision row.

    Note: any related knowledge (Node with type='decision') is left
    untouched — Memory is meant to retain lessons even when the decision
    record is gone.
    """
    decision = await get_decision(db, decision_id)
    if decision is None:
        return False

    await db.delete(decision)
    await db.commit()
    return True
