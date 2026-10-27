import copy
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.db.models import Goal, LearningPlan
from app.i18n import DEFAULT_LOCALE
from app.services.ai import call_llm_json
from app.services.memory import semantic_search


# ---------- Prompts ----------

GOAL_SYSTEM = """You are Cortex's Learning Engine.
You help users turn vague ambitions into concrete, achievable learning plans.

You always return valid JSON. Never wrap in markdown.
Be specific. Prefer measurable milestones over abstract goals.
"""

GOAL_DECOMPOSITION_TEMPLATE = """The user wants to achieve this learning goal:

Title: {title}
Description: {description}

The user already knows the following (from their captured knowledge):

{existing_knowledge}

Break this goal down into a learning plan. Return JSON in exactly this shape:

{{
  "summary": "one-sentence goal summary",
  "skills": [
    {{"name": "Skill name", "level": "beginner|intermediate|advanced", "why": "why this skill matters for the goal"}}
  ],
  "gaps": [
    "Specific thing the user doesn't know yet but needs to learn"
  ],
  "strengths": [
    "Specific thing the user already knows that helps them here"
  ],
  "phases": [
    {{
      "phase": "Phase 1: Foundation",
      "duration_weeks": 2,
      "milestones": [
        {{"title": "Milestone title", "actions": ["concrete action 1", "concrete action 2"]}}
      ]
    }}
  ],
  "first_action": "The single most important thing the user should do today"
}}

Keep it to 3-5 phases. Each phase: 2-4 milestones. Each milestone: 2-4 concrete actions.
"""


# ---------- Goal creation ----------

async def create_goal(
    db: AsyncSession,
    user_id: str,
    title: str,
    description: str = "",
    locale: str = DEFAULT_LOCALE,
) -> Goal:
    goal = Goal(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        description=description or "",
        status="active",
        meta={},
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)

    try:
        related = await semantic_search(
            db, user_id, title + " " + description, limit=10
        )
    except Exception as e:
        print(f"[Cortex] Semantic search for learning failed: {e}")
        related = []

    existing_text = "\n".join(
        f"- [{r['type']}] {r['title']}: {(r['summary'] or r['content'] or '')[:200]}"
        for r in related
    ) or "(The user has no relevant captured knowledge yet.)"

    prompt = GOAL_DECOMPOSITION_TEMPLATE.format(
        title=title,
        description=description or "(no description)",
        existing_knowledge=existing_text,
    )

    try:
        plan_data = await call_llm_json(
            prompt=prompt,
            system=GOAL_SYSTEM,
            temperature=0.3,
            max_tokens=4000,
            locale=locale,
        )
    except Exception as e:
        print(f"[Cortex] Learning plan generation failed: {e}")
        plan_data = {
            "summary": title,
            "skills": [],
            "gaps": [],
            "strengths": [],
            "phases": [],
            "first_action": "",
        }

    plan = LearningPlan(
        id=str(uuid.uuid4()),
        user_id=user_id,
        goal_id=goal.id,
        plan=plan_data,
        status="active",
    )
    db.add(plan)

    goal.meta = {
        "summary": plan_data.get("summary", ""),
        "skill_count": len(plan_data.get("skills", [])),
        "phase_count": len(plan_data.get("phases", [])),
        "related_node_ids": [r["id"] for r in related],
    }
    await db.commit()
    await db.refresh(goal)

    return goal


# ---------- Retrieval ----------

async def get_goal(db: AsyncSession, goal_id: str) -> Goal | None:
    result = await db.execute(select(Goal).where(Goal.id == goal_id))
    return result.scalar_one_or_none()


async def get_plan_for_goal(
    db: AsyncSession, goal_id: str
) -> LearningPlan | None:
    result = await db.execute(
        select(LearningPlan)
        .where(LearningPlan.goal_id == goal_id)
        .order_by(LearningPlan.created_at.desc())
    )
    return result.scalars().first()


async def list_goals(
    db: AsyncSession, user_id: str, limit: int = 50
) -> list[Goal]:
    result = await db.execute(
        select(Goal)
        .where(Goal.user_id == user_id)
        .order_by(Goal.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


# ---------- Progress tracking ----------

async def mark_milestone(
    db: AsyncSession,
    goal_id: str,
    phase_index: int,
    milestone_index: int,
    done: bool = True,
    notes: str | None = None,
) -> LearningPlan | None:
    """
    Update a milestone's done state and (optionally) its notes.

    Also keeps the parent Goal.status in sync with the plan:
      - plan fully complete    -> Goal.status = "completed"
      - plan un-completed      -> Goal.status = "active"

    Without this sync, /learning/goals (which reads Goal.status) would
    disagree with /learning/plan/{id} (which reads LearningPlan.status).
    """
    plan = await get_plan_for_goal(db, goal_id)
    if plan is None:
        return None

    # Deep copy so we never mutate shared references held by the ORM.
    plan_data = copy.deepcopy(plan.plan or {})
    phases = plan_data.get("phases") or []

    if 0 <= phase_index < len(phases):
        milestones = phases[phase_index].get("milestones") or []
        if 0 <= milestone_index < len(milestones):
            milestones[milestone_index]["done"] = done

            if notes is not None:
                clean = notes.strip()
                if clean:
                    milestones[milestone_index]["notes"] = clean
                else:
                    milestones[milestone_index].pop("notes", None)

    plan.plan = plan_data

    # Compute completion
    all_done = True
    has_any = False
    for p in phases:
        for m in p.get("milestones", []):
            has_any = True
            if not m.get("done"):
                all_done = False
                break

    if has_any and all_done:
        plan.status = "completed"
    elif has_any and not all_done and plan.status == "completed":
        plan.status = "active"

    # Sync Goal.status so the list view reflects plan completion
    goal = await get_goal(db, goal_id)
    if goal is not None:
        if plan.status == "completed":
            goal.status = "completed"
        elif goal.status == "completed" and plan.status != "completed":
            # A previously completed goal was un-completed
            goal.status = "active"

    # Force SQLAlchemy to see the JSON column as dirty.
    flag_modified(plan, "plan")

    await db.commit()
    await db.refresh(plan)
    return plan
