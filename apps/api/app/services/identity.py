import uuid
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Decision,
    Goal,
    IdentitySnapshot,
    Node,
    Reflection,
    SelfModel,
)
from app.i18n import DEFAULT_LOCALE, normalize_locale
from app.services.ai import call_llm_json


# ---------- Prompts ----------

IDENTITY_SYSTEM = """You are Cortex's Identity Engine.
You observe a user's captured knowledge, decisions, goals, and reflections — and produce a living model of who they are.

You always return valid JSON. Never wrap it in markdown.
Be specific. Cite evidence. Never invent traits without support.
Do not moralize. Do not flatter. Show them who they are, honestly.
"""

# The naming rule is templated because the behaviour depends on whether
# the previous snapshot was generated in the same locale as the current
# rebuild request.
NAMING_RULE_SAME_LOCALE = """
NAMING RULE (same locale as previous snapshot):
When you identify a concept that matches an item in the "Previous snapshot
item names" list below, you MUST reuse the EXACT SAME NAME, character-for-
character identical. Only introduce new names for genuinely new concepts.
This is how we track growth over time — inconsistent naming breaks the model.
"""

NAMING_RULE_DIFFERENT_LOCALE = """
NAMING RULE (locale has changed since the previous snapshot):
The previous snapshot was generated in {previous_locale}; the current
request is in {current_locale}. For every item that matches a previous
concept, TRANSLATE the item name into {current_locale} while preserving
its meaning exactly. Do NOT keep the old-language name — the whole model
should read coherently in {current_locale}. If the user later rebuilds in
the same language, the translated names become the new canonical ones.
"""


IDENTITY_BUILD_TEMPLATE = """Build a model of this user's identity from their real data.

--- Recent captured thoughts ---
{recent_nodes}

--- Active goals ---
{active_goals}

--- Recent decisions (with outcomes) ---
{decisions}

--- Recent lessons & reports ---
{reflections}

--- Previous snapshot item names (see naming rule below) ---
{previous_names}

--- Current locale: {current_locale} ---
{previous_locale_line}
{naming_rule}

Return JSON in exactly this shape:

{{
  "narrative": "A 2-3 sentence description of who this person is, based on evidence.",

  "values": [
    {{"value": "Name", "evidence": "Why you inferred this", "strength": "low|medium|high"}}
  ],

  "patterns": [
    {{"pattern": "Name", "description": "How it shows up", "evidence": "Supporting details"}}
  ],

  "strengths": [
    {{"strength": "Name", "evidence": "Where it shows"}}
  ],

  "blind_spots": [
    {{"spot": "Name", "evidence": "Where it shows"}}
  ],

  "growth_areas": [
    {{"area": "Name", "reason": "Why this matters for them"}}
  ],

  "thinking_style": "One sentence on how they seem to think."
}}

Rules:
- Prefer 3-6 items per list. Quality over quantity.
- If evidence is thin, say so honestly in the narrative.
- Follow the naming rule above.
"""


# ---------- Helpers ----------

def _build_naming_guide(previous_model: dict | None) -> str:
    """
    Extract item names from the previous snapshot and format them as a guide.
    Returns a bulleted list grouped by category, or a placeholder if empty.
    """
    if not previous_model:
        return "(No previous snapshot.)"

    sections = []

    def add_section(label: str, key: str, name_field: str):
        items = previous_model.get(key) or []
        names = [
            (item.get(name_field) or "").strip()
            for item in items
            if isinstance(item, dict) and item.get(name_field)
        ]
        if names:
            sections.append(f"{label}:")
            for n in names:
                sections.append(f"  - {n}")

    add_section("Values", "values", "value")
    add_section("Patterns", "patterns", "pattern")
    add_section("Strengths", "strengths", "strength")
    add_section("Blind spots", "blind_spots", "spot")
    add_section("Growth areas", "growth_areas", "area")

    if not sections:
        return "(No previous snapshot.)"

    return "\n".join(sections)


def _build_naming_rule(previous_locale: str | None, current_locale: str) -> tuple[str, str]:
    """
    Returns (naming_rule_text, previous_locale_line). Handles the case
    where there is no previous snapshot.
    """
    if not previous_locale:
        return ("(No previous snapshot. Name concepts freely.)", "")

    if normalize_locale(previous_locale) == normalize_locale(current_locale):
        return (
            NAMING_RULE_SAME_LOCALE,
            f"--- Previous snapshot locale: {previous_locale} ---",
        )

    return (
        NAMING_RULE_DIFFERENT_LOCALE.format(
            previous_locale=previous_locale, current_locale=current_locale
        ),
        f"--- Previous snapshot locale: {previous_locale} ---",
    )


# ---------- Build ----------

async def rebuild_identity(
    db: AsyncSession,
    user_id: str,
    locale: str = DEFAULT_LOCALE,
) -> SelfModel:
    """Rebuild the self-model from the user's actual data."""
    locale = normalize_locale(locale)

    # 1. Fetch the previous snapshot (the current SelfModel acts as it)
    prev_result = await db.execute(
        select(IdentitySnapshot)
        .where(IdentitySnapshot.user_id == user_id)
        .order_by(IdentitySnapshot.created_at.desc())
        .limit(1)
    )
    previous_snapshot = prev_result.scalar_one_or_none()
    previous_model = (previous_snapshot.model or {}) if previous_snapshot else None
    previous_locale = previous_snapshot.locale if previous_snapshot else None

    # 2. Recent nodes (last 20)
    node_result = await db.execute(
        select(Node)
        .where(Node.user_id == user_id)
        .where(Node.type.in_(["thought", "concept", "reflection"]))
        .order_by(Node.created_at.desc())
        .limit(20)
    )
    nodes = list(node_result.scalars().all())

    # 3. Active goals
    goal_result = await db.execute(
        select(Goal)
        .where(Goal.user_id == user_id)
        .where(Goal.status == "active")
        .order_by(Goal.created_at.desc())
        .limit(10)
    )
    goals = list(goal_result.scalars().all())

    # 4. Recent decisions
    decision_result = await db.execute(
        select(Decision)
        .where(Decision.user_id == user_id)
        .order_by(Decision.created_at.desc())
        .limit(10)
    )
    decisions = list(decision_result.scalars().all())

    # 5. Recent reflections
    reflection_result = await db.execute(
        select(Reflection)
        .where(Reflection.user_id == user_id)
        .order_by(Reflection.created_at.desc())
        .limit(10)
    )
    reflections = list(reflection_result.scalars().all())

    # 6. Build the source summary
    recent_nodes = "\n".join(
        f"- [{n.type}] {n.title or ''}: {(n.summary or n.content or '')[:200]}"
        for n in nodes
    ) or "(No captured knowledge yet.)"

    active_goals = "\n".join(
        f"- {g.title}: {(g.description or '')[:200]}" for g in goals
    ) or "(No active goals yet.)"

    decisions_text = "\n".join(
        f"- Q: {d.question[:120]} | Chose: {(d.chosen_option or 'not decided')[:100]}"
        + (f" | Outcome: {d.actual_outcome[:100]}" if d.actual_outcome else "")
        + (f" | Lesson: {d.lesson[:120]}" if d.lesson else "")
        for d in decisions
    ) or "(No decisions yet.)"

    reflections_text = "\n".join(
        f"- [{r.kind}] {r.title or ''}: {r.content[:200]}" for r in reflections
    ) or "(No reflections yet.)"

    # 7. Build the naming guide and rule
    previous_names = _build_naming_guide(previous_model)
    naming_rule, previous_locale_line = _build_naming_rule(
        previous_locale, locale
    )

    source_stats = {
        "nodes": len(nodes),
        "goals": len(goals),
        "decisions": len(decisions),
        "reflections": len(reflections),
    }

    # 8. If there's almost no data, don't fabricate identity
    if sum(source_stats.values()) < 3:
        model_data = {
            "narrative": "Not enough data to build your identity yet. Capture thoughts, set goals, record decisions — Cortex will learn who you are as you use it.",
            "values": [],
            "patterns": [],
            "strengths": [],
            "blind_spots": [],
            "growth_areas": [],
            "thinking_style": "",
        }
    else:
        prompt = IDENTITY_BUILD_TEMPLATE.format(
            recent_nodes=recent_nodes,
            active_goals=active_goals,
            decisions=decisions_text,
            reflections=reflections_text,
            previous_names=previous_names,
            current_locale=locale,
            previous_locale_line=previous_locale_line,
            naming_rule=naming_rule,
        )

        try:
            model_data = await call_llm_json(
                prompt=prompt,
                system=IDENTITY_SYSTEM,
                temperature=0.4,
                max_tokens=3000,
                locale=locale,
            )
        except Exception as e:
            print(f"[Cortex] Identity build failed: {e}")
            model_data = {
                "narrative": "Identity build failed — try again in a moment.",
                "values": [],
                "patterns": [],
                "strengths": [],
                "blind_spots": [],
                "growth_areas": [],
                "thinking_style": "",
            }

    # 9. Upsert self model
    existing = await db.get(SelfModel, user_id)
    now = datetime.now(timezone.utc)

    if existing:
        existing.model = model_data
        existing.narrative = model_data.get("narrative", "")
        existing.source_stats = source_stats
        existing.last_rebuilt_at = now
        existing.locale = locale
    else:
        existing = SelfModel(
            user_id=user_id,
            model=model_data,
            narrative=model_data.get("narrative", ""),
            source_stats=source_stats,
            last_rebuilt_at=now,
            locale=locale,
        )
        db.add(existing)

    # 10. Save a snapshot for the timeline
    snapshot = IdentitySnapshot(
        id=str(uuid.uuid4()),
        user_id=user_id,
        model=model_data,
        narrative=model_data.get("narrative", ""),
        locale=locale,
    )
    db.add(snapshot)

    await db.commit()
    await db.refresh(existing)
    return existing


# ---------- Retrieval ----------

async def get_self_model(
    db: AsyncSession,
    user_id: str,
) -> SelfModel | None:
    return await db.get(SelfModel, user_id)


async def get_timeline(
    db: AsyncSession,
    user_id: str,
    limit: int = 20,
) -> list[IdentitySnapshot]:
    result = await db.execute(
        select(IdentitySnapshot)
        .where(IdentitySnapshot.user_id == user_id)
        .order_by(IdentitySnapshot.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


# ---------- Insights ----------

async def get_insights(
    db: AsyncSession,
    user_id: str,
) -> dict:
    """Return a compact view of the current self-model."""
    model = await get_self_model(db, user_id)

    if model is None:
        return {
            "has_model": False,
            "narrative": "",
            "values": [],
            "patterns": [],
            "strengths": [],
            "blind_spots": [],
            "growth_areas": [],
            "thinking_style": "",
            "source_stats": {},
            "last_rebuilt_at": None,
            "locale": None,
        }

    md = model.model or {}
    return {
        "has_model": True,
        "narrative": md.get("narrative", ""),
        "values": md.get("values", []),
        "patterns": md.get("patterns", []),
        "strengths": md.get("strengths", []),
        "blind_spots": md.get("blind_spots", []),
        "growth_areas": md.get("growth_areas", []),
        "thinking_style": md.get("thinking_style", ""),
        "source_stats": model.source_stats or {},
        "last_rebuilt_at": model.last_rebuilt_at.isoformat()
        if model.last_rebuilt_at
        else None,
        "locale": model.locale,
    }


# ---------- Milestones ----------

MILESTONE_SYSTEM = """You are Cortex's Milestone Engine.
You look at a sequence of identity snapshots over time and label each one with a
short, evocative milestone that captures what changed or what emerged.

You always return valid JSON. Never wrap it in markdown.
Be specific. Reference actual content from the snapshot.
Keep titles under 60 characters. Keep highlights under 140 characters.
"""

MILESTONE_TEMPLATE = """A user's identity model has evolved through {count} snapshots.

Here is the sequence from OLDEST to NEWEST:

{snapshot_list}

For EACH snapshot (in order), return a milestone that captures what was happening
at that point in their development.

For the FIRST snapshot: describe the state they started in (e.g., "First identity model",
"Initial pattern discovery").

For subsequent snapshots: describe what CHANGED (e.g., "Attention theme solidifies",
"Boundary setting emerges", "Meta-cognitive layer appears").

Return JSON in exactly this shape:

{{
  "milestones": [
    {{
      "title": "Short milestone title (max 60 chars)",
      "highlights": "One sentence describing the change or state (max 140 chars)",
      "category": "one of: origin | discovery | growth | stabilizing | consolidation"
    }}
  ]
}}

Return exactly {count} milestones, in the same order.
"""


async def generate_milestones(
    db: AsyncSession,
    user_id: str,
    limit: int = 10,
    locale: str = DEFAULT_LOCALE,
) -> list[dict]:
    """
    Generate milestone titles for the user's snapshots via LLM.
    Returns a list of enriched snapshot summaries, most recent first.
    """
    locale = normalize_locale(locale)

    result = await db.execute(
        select(IdentitySnapshot)
        .where(IdentitySnapshot.user_id == user_id)
        .order_by(IdentitySnapshot.created_at.asc())
        .limit(limit)
    )
    snapshots = list(result.scalars().all())

    if not snapshots:
        return []

    lines = []
    for i, snap in enumerate(snapshots, 1):
        model = snap.model or {}
        values = [v.get("value", "") for v in (model.get("values") or [])][:4]
        patterns = [p.get("pattern", "") for p in (model.get("patterns") or [])][:3]
        narrative = (snap.narrative or "")[:200]

        lines.append(f"--- Snapshot {i} ---")
        lines.append(f"Narrative: {narrative}")
        if values:
            lines.append(f"Values: {', '.join(values)}")
        if patterns:
            lines.append(f"Patterns: {', '.join(patterns)}")
        lines.append("")

    snapshot_list = "\n".join(lines)

    prompt = MILESTONE_TEMPLATE.format(
        count=len(snapshots),
        snapshot_list=snapshot_list,
    )

    try:
        data = await call_llm_json(
            prompt=prompt,
            system=MILESTONE_SYSTEM,
            temperature=0.5,
            max_tokens=2000,
            locale=locale,
        )
        milestones = data.get("milestones") or []
    except Exception as e:
        print(f"[Cortex] Milestone generation failed: {e}")
        milestones = []

    output = []
    for i, snap in enumerate(snapshots):
        milestone = milestones[i] if i < len(milestones) else {}
        output.append({
            "id": str(snap.id),
            "created_at": snap.created_at.isoformat(),
            "narrative": snap.narrative or "",
            "title": milestone.get("title", "Snapshot"),
            "highlights": milestone.get("highlights", ""),
            "category": milestone.get("category", "origin"),
        })

    output.reverse()
    return output


# ---------- Signature Quote ----------

async def get_signature_quote(
    db: AsyncSession,
    user_id: str,
) -> dict:
    """
    Find the semantic centroid of the user's captured thoughts — the node
    that best represents the center of their thinking.
    """
    count_result = await db.execute(
        text(
            """
            SELECT COUNT(*) FROM embeddings
            WHERE user_id = :user_id AND embedding IS NOT NULL
            """
        ),
        {"user_id": user_id},
    )
    count = count_result.scalar() or 0

    if count < 3:
        return {
            "available": False,
            "reason": "Need at least 3 captured thoughts with embeddings.",
            "quote": "",
            "title": None,
            "node_id": None,
            "type": None,
        }

    sql = text(
        """
        WITH candidates AS (
            SELECT
                n.id,
                n.type,
                n.title,
                n.content,
                n.summary,
                e.embedding
            FROM embeddings e
            JOIN nodes n ON n.id = e.node_id
            WHERE e.user_id = :user_id
              AND e.embedding IS NOT NULL
              AND n.content IS NOT NULL
              AND LENGTH(n.content) > 20
              AND n.type IN ('thought', 'reflection', 'concept')
            LIMIT 200
        )
        SELECT
            c.id,
            c.type,
            c.title,
            c.content,
            c.summary,
            AVG(1 - (c.embedding <=> c2.embedding)) AS centroid_score
        FROM candidates c
        CROSS JOIN candidates c2
        WHERE c.id != c2.id
        GROUP BY c.id, c.type, c.title, c.content, c.summary
        ORDER BY centroid_score DESC
        LIMIT 1
        """
    )

    try:
        result = await db.execute(sql, {"user_id": user_id})
        row = result.mappings().first()
    except Exception as e:
        print(f"[Cortex] Signature quote query failed: {e}")
        return {
            "available": False,
            "reason": f"Query failed: {e}",
            "quote": "",
            "title": None,
            "node_id": None,
            "type": None,
        }

    if not row:
        return {
            "available": False,
            "reason": "No suitable thought found.",
            "quote": "",
            "title": None,
            "node_id": None,
            "type": None,
        }

    quote = (row["content"] or "").strip()

    if len(quote) > 200:
        for sep in [".", "!", "?"]:
            idx = quote.find(sep, 40)
            if 0 < idx < 200:
                quote = quote[: idx + 1]
                break

    if len(quote) > 240:
        truncated = quote[:240]
        last_space = truncated.rfind(" ")
        if last_space > 100:
            truncated = truncated[:last_space]
        quote = truncated.strip() + "…"

    return {
        "available": True,
        "quote": quote,
        "title": row["title"],
        "node_id": str(row["id"]),
        "type": row["type"],
        "score": float(row["centroid_score"]) if row["centroid_score"] else 0.0,
    }
