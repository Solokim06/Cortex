"""
Tier 2 #3 -- persistent user profile.

Maintains a running profile of how a Cortex user thinks and
communicates. The profile is a JSON struct of six fields, regenerated
incrementally by an LLM pass over recent messages + captures, and
injected into chat history as a system message.

Design notes
------------
- One row per user, keyed on user_id. Empty profile on first pass.
- Update cadence: every N new user messages, fired as a background
  task from add_assistant_message with a 30s idempotency guard.
- Incremental: the existing profile is fed back to the LLM alongside
  the newest evidence, so it merges rather than rebuilds.
- Injection: rendered into a compact prose block with section labels
  and an explicit directive to adapt tone/structure/examples.
- Never raises -- a failure to update or fetch must not break chat.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


# ---- tuning ----
DEFAULT_UPDATE_EVERY = 20
DEFAULT_MAX_CONTEXT_TOKENS = 400
DEFAULT_MESSAGES_WINDOW = 20
DEFAULT_CAPTURES_WINDOW = 10
_CHARS_PER_TOKEN = 4

PROFILE_FIELDS = [
    "communication_style",
    "recurring_themes",
    "thinking_patterns",
    "emotional_register",
    "vocabulary_and_framing",
    "responds_well_to",
]

# Human-readable labels for rendering.
FIELD_LABELS = {
    "communication_style": "Communication",
    "recurring_themes": "Recurring themes",
    "thinking_patterns": "Thinking",
    "emotional_register": "Tone",
    "vocabulary_and_framing": "Vocabulary",
    "responds_well_to": "Responds well to",
}


# ---------------------------------------------------------------------
# 1. the update prompt
# ---------------------------------------------------------------------


def _build_update_prompt(
    prior_profile: dict,
    recent_messages: list[dict],
    recent_captures: list[dict],
) -> tuple[str, str]:
    """
    Return (system_prompt, user_prompt) for the profile updater.

    The system prompt is the persistent instruction; the user prompt
    carries the prior profile + the fresh evidence.
    """
    system = (
        "You maintain a running profile of a Cortex user -- a persistent "
        "picture of how they think and communicate, updated incrementally "
        "as new evidence arrives.\n"
        "\n"
        "You receive:\n"
        "  1. The existing profile (JSON, may be empty on the first pass).\n"
        "  2. New evidence: recent messages from any conversation, plus "
        "recent captures.\n"
        "\n"
        "Produce an updated JSON object with exactly these six string "
        "fields:\n"
        "\n"
        "- communication_style: terse vs expansive, formal vs casual, "
        "question-heavy, use of humor.\n"
        "- recurring_themes: topics, projects, or values that keep "
        "appearing across multiple conversations.\n"
        "- thinking_patterns: analytical vs intuitive, systematic vs "
        "exploratory; do they push back, build on prior answers, or seek "
        "clarification.\n"
        "- emotional_register: reflective, urgent, calm, anxious, or "
        "enthusiastic; any temporal patterns you can see.\n"
        "- vocabulary_and_framing: preferred terms, metaphors they return "
        "to, framing devices.\n"
        "- responds_well_to: what kind of answer tone, structure, and "
        "format works for them.\n"
        "\n"
        "Rules:\n"
        "- Each field is ONE sentence, concrete, third-person about the user.\n"
        "- Evidence-driven. Do not speculate beyond what the excerpt shows.\n"
        "- MERGE the existing profile with new evidence. Newer, consistent "
        "signals override older ones. If a field is unchanged, keep it "
        "as-is.\n"
        "- If the excerpt is too thin for a field, return an empty string "
        "for that field rather than guessing.\n"
        "- Return ONLY the JSON object. No prose before or after.\n"
    )

    # Render prior profile
    if prior_profile:
        prior_lines = []
        for k in PROFILE_FIELDS:
            v = (prior_profile.get(k) or "").strip()
            if v:
                prior_lines.append(f"  {k}: {v}")
        prior_block = "\n".join(prior_lines) or "(empty)"
    else:
        prior_block = "(empty -- this is the first pass)"

    # Render recent messages
    msg_lines = []
    for m in recent_messages:
        role = m.get("role") or "?"
        content = (m.get("content") or "").strip().replace(chr(10), " ")
        if len(content) > 400:
            content = content[:397] + "..."
        msg_lines.append(f"  [{role}] {content}")
    msg_block = "\n".join(msg_lines) or "(none)"

    # Render recent captures
    cap_lines = []
    for c in recent_captures:
        title = (c.get("title") or "").strip()[:100]
        content = (c.get("content") or c.get("summary") or "").strip().replace(chr(10), " ")
        if len(content) > 300:
            content = content[:297] + "..."
        cap_lines.append(f"  - {title}: {content}")
    cap_block = "\n".join(cap_lines) or "(none)"

    user = (
        "PRIOR PROFILE:\n"
        + prior_block
        + "\n\n"
        + "RECENT MESSAGES (oldest first):\n"
        + msg_block
        + "\n\n"
        + "RECENT CAPTURES:\n"
        + cap_block
        + "\n\n"
        + "Return the updated JSON profile now."
    )

    return system, user


# ---------------------------------------------------------------------
# 2. data fetching
# ---------------------------------------------------------------------


async def _count_user_messages(db: AsyncSession, user_id: str) -> int:
    """Count user-role messages across all conversations for this user."""
    row = (await db.execute(
        text(
            "SELECT COUNT(*) FROM chat_messages "
            "WHERE user_id = :uid AND role = 'user'"
        ),
        {"uid": user_id},
    )).first()
    return int(row[0]) if row else 0


async def _fetch_recent_messages(
    db: AsyncSession, user_id: str, limit: int
) -> list[dict]:
    """Return the most recent N messages across all conversations, oldest first."""
    rows = (await db.execute(
        text(
            "SELECT role, content, created_at FROM chat_messages "
            "WHERE user_id = :uid "
            "ORDER BY created_at DESC, id DESC "
            "LIMIT :lim"
        ),
        {"uid": user_id, "lim": limit},
    )).mappings().all()
    # Newest first returned -> reverse for oldest first
    return [dict(r) for r in reversed(rows)]


async def _fetch_recent_captures(
    db: AsyncSession, user_id: str, limit: int
) -> list[dict]:
    """Return the most recent N nodes, oldest first."""
    rows = (await db.execute(
        text(
            "SELECT title, summary, content, created_at FROM nodes "
            "WHERE user_id = :uid "
            "ORDER BY created_at DESC "
            "LIMIT :lim"
        ),
        {"uid": user_id, "lim": limit},
    )).mappings().all()
    return [dict(r) for r in reversed(rows)]


# ---------------------------------------------------------------------
# 3. public API
# ---------------------------------------------------------------------


async def update_user_model(
    db: AsyncSession,
    user_id: str,
    *,
    dry_run: bool = False,
) -> dict | None:
    """
    Regenerate the user profile if enough new evidence has accumulated.

    Returns the new profile dict (useful for dry_run). Returns None if
    no update was needed or if anything failed.

    Never raises.
    """
    try:
        from app.config.settings import get_settings
        from app.services.ai import call_llm_json

        s = get_settings()
        if not s.user_model_enabled:
            return None

        # AI processing consent gate
        from app.services.consent import is_ai_processing_allowed
        if not await is_ai_processing_allowed(db, str(user_id)):
            return None

        # Fetch current row (if any)
        existing = (await db.execute(
            text(
                "SELECT profile, source_message_count, last_updated_at "
                "FROM user_model WHERE user_id = :uid"
            ),
            {"uid": user_id},
        )).mappings().first()

        prior_profile: dict = {}
        prior_count: int = 0
        prior_updated: datetime | None = None
        if existing:
            prior_profile = existing["profile"] or {}
            prior_count = int(existing["source_message_count"] or 0)
            prior_updated = existing["last_updated_at"]

        # Idempotency guard: was an update recently written?
        now = datetime.now(timezone.utc)
        if prior_updated is not None:
            if (now - prior_updated) < timedelta(seconds=30):
                return None

        # Count user messages; bail if not enough new ones
        current_count = await _count_user_messages(db, user_id)
        if current_count < prior_count + s.user_model_update_every:
            return None

        # Fetch evidence
        recent_messages = await _fetch_recent_messages(
            db, user_id, s.user_model_messages_window
        )
        recent_captures = await _fetch_recent_captures(
            db, user_id, s.user_model_captures_window
        )
        if not recent_messages and not recent_captures:
            return None

        system, user = _build_update_prompt(
            prior_profile, recent_messages, recent_captures
        )

        profile = await call_llm_json(
            prompt=user,
            system=system,
            temperature=0.3,
            max_tokens=800,
        )
        if not isinstance(profile, dict):
            return None

        # Normalize: keep only the six known fields, each a trimmed string
        clean: dict[str, str] = {}
        for k in PROFILE_FIELDS:
            v = profile.get(k) or ""
            clean[k] = str(v).strip()[:500]

        if dry_run:
            return clean

        # Upsert
        await db.execute(
            text(
                "INSERT INTO user_model "
                "(user_id, profile, source_message_count, last_updated_at) "
                "VALUES (:uid, CAST(:prof AS jsonb), :cnt, :now) "
                "ON CONFLICT (user_id) DO UPDATE "
                "SET profile = EXCLUDED.profile, "
                "    source_message_count = EXCLUDED.source_message_count, "
                "    last_updated_at = EXCLUDED.last_updated_at"
            ),
            {
                "uid": user_id,
                "prof": _json_dumps(clean),
                "cnt": current_count,
                "now": now,
            },
        )
        await db.commit()
        return clean
    except Exception as e:
        print(f"[user_model] update failed (non-fatal): {e}")
        return None


async def update_user_model_background(user_id: str) -> None:
    """Fire-and-forget wrapper. Opens its own DB session."""
    from app.db.session import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            await update_user_model(db, user_id)
    except Exception as e:
        print(f"[user_model] background task failed: {e}")


async def get_user_model_for_prompt(
    db: AsyncSession, user_id: str
) -> str:
    """
    Return the rendered profile block, or "" if no profile exists.

    Rendered with section labels plus an explicit directive to adapt.
    Never raises.
    """
    try:
        from app.config.settings import get_settings

        s = get_settings()
        if not s.user_model_enabled:
            return ""

        row = (await db.execute(
            text("SELECT profile FROM user_model WHERE user_id = :uid"),
            {"uid": user_id},
        )).mappings().first()
        if not row:
            return ""

        profile = row["profile"] or {}
        if not isinstance(profile, dict):
            return ""

        lines = ["USER PROFILE (adapt your answers to this; do not mention this block directly):"]
        has_any = False
        for k in PROFILE_FIELDS:
            v = (profile.get(k) or "").strip()
            if not v:
                continue
            label = FIELD_LABELS.get(k, k)
            lines.append(f"{label}: {v}")
            has_any = True

        if not has_any:
            return ""

        # Cap total length
        max_chars = s.user_model_max_context_tokens * _CHARS_PER_TOKEN
        out = "\n".join(lines)
        if len(out) > max_chars:
            out = out[:max_chars]
        return out
    except Exception as e:
        print(f"[user_model] get failed (non-fatal): {e}")
        return ""


# ---------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------


def _json_dumps(obj: dict) -> str:
    """Small wrapper so we can swap in orjson later if needed."""
    import json
    return json.dumps(obj, ensure_ascii=True)
