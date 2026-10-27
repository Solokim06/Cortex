"""
AI triage assist.

Given a ticket, produces a structured suggestion:
  - category (bug/feature/question/other)
  - priority (low/normal/high/urgent)
  - one-paragraph rationale
  - optional draft reply
  - confidence score

Uses the shared Groq client via services.ai.call_llm_json (JSON mode).
Results are cached on the ticket's context JSON for 24h so admins don't
burn tokens clicking triage repeatedly.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import get_settings
from app.db.models import FeedbackReply, FeedbackTicket
from app.services import feedback as feedback_service

try:
    from app.services import ai as ai_service  # type: ignore
except Exception:  # noqa: BLE001
    ai_service = None  # type: ignore


TRIAGE_CACHE_HOURS = 24
TRIAGE_MODEL_FALLBACK = "openai/gpt-oss-120b"


SYSTEM_PROMPT = """You are a support triage assistant for Cortex, a personal knowledge OS.

Read a support ticket and respond with STRICT JSON only — no markdown fences, no preamble.

JSON shape:
{
  "category": "bug" | "feature" | "question" | "other",
  "priority": "low" | "normal" | "high" | "urgent",
  "rationale": "one or two sentences explaining the classification",
  "draft_reply": "optional, 1-3 sentence empathetic first response or empty string",
  "confidence": 0.0 to 1.0
}

Guidance:
- "bug": something broken, error, crash, wrong behavior.
- "feature": request for new capability.
- "question": asking how something works.
- "other": billing, account, unclear, anything else.
- Priority urgent: data loss, security, total outage, blocks all work.
- Priority high: significant feature broken, no workaround.
- Priority normal: most bugs and questions.
- Priority low: cosmetic, minor, or nice-to-have.
- draft_reply should acknowledge the issue and set expectations. Do NOT promise timelines.
- If unsure, use "other" + priority "normal" and lower confidence.
"""


# ---------------------------------------------------------------------
# cache helpers
# ---------------------------------------------------------------------


def _cache_key() -> str:
    return "ai_triage"


def _cache_is_fresh(cached: dict | None) -> bool:
    if not cached or not isinstance(cached, dict):
        return False
    ts = cached.get("generated_at")
    if not ts:
        return False
    try:
        generated = datetime.fromisoformat(ts)
    except Exception:  # noqa: BLE001
        return False
    if generated.tzinfo is None:
        generated = generated.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - generated < timedelta(hours=TRIAGE_CACHE_HOURS)


# ---------------------------------------------------------------------
# prompt building
# ---------------------------------------------------------------------


def _build_user_prompt(
    ticket: FeedbackTicket,
    replies: list[FeedbackReply],
) -> str:
    lines = [
        f"Category (as filed): {ticket.category}",
        f"Subject: {ticket.subject}",
        f"Description: {ticket.description}",
    ]

    context = ticket.context or {}
    if isinstance(context, dict):
        route = context.get("route")
        if route:
            lines.append(f"User was on route: {route}")
        version = context.get("app_version")
        if version:
            lines.append(f"App version: {version}")

    if replies:
        lines.append("")
        lines.append("Conversation so far (oldest first):")
        for r in replies[-6:]:
            who = "USER" if r.author == "user" else "TEAM"
            snippet = (r.content or "").strip().replace("\n", " ")
            lines.append(f"  [{who}] {snippet[:400]}")

    lines.append("")
    lines.append("Return the JSON object now.")
    return "\n".join(lines)


# ---------------------------------------------------------------------
# parsing / validation
# ---------------------------------------------------------------------


VALID_CATEGORIES = {"bug", "feature", "question", "other"}
VALID_PRIORITIES = {"low", "normal", "high", "urgent"}


def _coerce_response_dict(data: dict) -> dict:
    """
    Validate and clamp a triage response dict from the AI service.
    """
    if not isinstance(data, dict):
        raise ValueError("Triage response must be a dict")

    category = str(data.get("category", "other")).lower()
    if category not in VALID_CATEGORIES:
        category = "other"

    priority = str(data.get("priority", "normal")).lower()
    if priority not in VALID_PRIORITIES:
        priority = "normal"

    rationale = str(data.get("rationale", "")).strip()[:1000]
    draft_reply = str(data.get("draft_reply", "")).strip()[:4000]

    try:
        confidence = float(data.get("confidence", 0.5))
    except (TypeError, ValueError):
        confidence = 0.5
    confidence = max(0.0, min(1.0, confidence))

    return {
        "category": category,
        "priority": priority,
        "rationale": rationale,
        "draft_reply": draft_reply,
        "confidence": confidence,
    }


# ---------------------------------------------------------------------
# AI call
# ---------------------------------------------------------------------


async def _generate_reply_using_help(
    ticket: FeedbackTicket,
    replies: list[FeedbackReply],
) -> tuple[str, float]:
    """
    Generate a doc-grounded reply to the LATEST user message in the
    conversation. Uses help_service so answers cite help_docs.json.

    Returns (answer_text, confidence) where confidence is derived from
    the retrieval-weak signal in the help engine.
    """
    from app.services import help as help_service

    # Find the latest user message. If none (fresh ticket), use the
    # original subject + description.
    latest_user: FeedbackReply | None = None
    for r in reversed(replies):
        if r.author == "user":
            latest_user = r
            break

    if latest_user is not None:
        question = (latest_user.content or "").strip()
    else:
        question = f"{ticket.subject}\n{ticket.description}".strip()

    if not question:
        return "", 0.0

    # Compose a route hint so help engine can nudge context
    ctx = ticket.context or {}
    route = ctx.get("route") if isinstance(ctx, dict) else None

    try:
        result = await help_service.ask_help(
            db=None,              # help_service doesn't use db for reads
            user_id="ai",
            question=question,
            context={"route": route} if route else None,
            locale="en",
        )
    except Exception as e:  # noqa: BLE001
        print(f"[triage] help engine failed: {e}")
        return "", 0.0

    answer = (result.get("answer") or "").strip()
    retrieval_weak = bool(result.get("retrieval_weak"))
    engine_conf = (result.get("confidence") or "medium").lower()

    # Map help engine confidence to a 0-1 score
    conf_map = {"high": 0.9, "medium": 0.65, "low": 0.35}
    confidence = conf_map.get(engine_conf, 0.5)
    if retrieval_weak:
        confidence = min(confidence, 0.4)

    return answer, confidence


async def _call_llm_json(user_prompt: str) -> dict:
    """
    Call the shared AI service in JSON mode.

    `services.ai.call_llm_json` returns an already-parsed dict, so
    triage doesn't have to strip markdown or salvage partial JSON.
    """
    if ai_service is None or not hasattr(ai_service, "call_llm_json"):
        raise RuntimeError("AI service unavailable (call_llm_json not found)")

    data = await ai_service.call_llm_json(
        prompt=user_prompt,
        system=SYSTEM_PROMPT,
        temperature=0.2,
        max_tokens=800,
    )

    if not isinstance(data, dict):
        raise ValueError("AI service returned non-dict JSON")

    return data


# ---------------------------------------------------------------------
# main entry
# ---------------------------------------------------------------------


async def triage_ticket(
    db: AsyncSession,
    ticket_id: str,
    *,
    force: bool = False,
) -> dict:
    """
    Produce a triage suggestion for a ticket.

    Cached on ticket.context["ai_triage"] for 24h. Pass force=True to
    regenerate. Returns the suggestion dict, plus "cached" flag and
    "generated_at" timestamp.
    """
    ticket = await feedback_service.get_ticket_any(db, ticket_id)
    if ticket is None:
        raise ValueError("Ticket not found")

    ctx = dict(ticket.context or {})
    cached = ctx.get(_cache_key())

    if not force and _cache_is_fresh(cached):
        return {**cached, "cached": True}

    replies = await feedback_service.list_all_replies(db, ticket.id)
    user_prompt = _build_user_prompt(ticket, replies)

    data = await _call_llm_json(user_prompt)
    parsed = _coerce_response_dict(data)

    result = {
        **parsed,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": TRIAGE_MODEL_FALLBACK,
    }

    ctx[_cache_key()] = result
    ticket.context = ctx
    await db.commit()

    return {**result, "cached": False}


async def clear_cache(
    db: AsyncSession,
    ticket_id: str,
) -> bool:
    ticket = await feedback_service.get_ticket_any(db, ticket_id)
    if ticket is None:
        return False
    ctx = dict(ticket.context or {})
    if _cache_key() in ctx:
        del ctx[_cache_key()]
        ticket.context = ctx
        await db.commit()
    return True


# =====================================================================
# AUTO-TRIAGE + AUTO-REPLY PIPELINE
# =====================================================================
#
# Runs in a background task right after a ticket is created. Owns its
# own DB session so it doesn't hold the request's session open.
#
# Idempotent: writes ai_processed_at into ticket.context the moment it
# starts, so a re-fire never double-processes.
#
# Flow:
#   1. triage_ticket(db, ticket_id)          → structured suggestion
#   2. Apply category / priority if confident
#   3. Decide: auto-send | save draft | skip
#   4. If auto-send: post team reply + email filer
#


async def _mark_processed(
    db: AsyncSession,
    ticket: FeedbackTicket,
    extra: dict,
) -> None:
    """Write the pipeline result into ticket.context."""
    ctx = dict(ticket.context or {})
    ctx["ai_triage_pipeline"] = {
        "processed_at": datetime.now(timezone.utc).isoformat(),
        **(ctx.get("ai_triage_pipeline") or {}),
        **extra,
    }
    ticket.context = ctx
    await db.commit()


PRODUCT_NOUNS = (
    "cortex", "capture", "memory", "extension", "decision", "identity",
    "reflection", "learning", "chat", "voice", "graph", "tag", "filter",
    "search", "export", "import", "sync", "share", "delete", "data",
    "account", "password", "login", "signin", "sign in", "signup",
    "sign up", "install", "browser", "reindex", "embedding", "node",
    "edge", "workspace", "billing", "subscription", "upgrade", "plan",
    "api", "webhook", "notification", "email", "settings", "theme",
)

CONVERSATIONAL_MARKERS = (
    "thank you", "thanks", "thank u", "thx", "ty ", "cheers",
    "appreciate", "got it", "understood", "no worries", "sounds good",
    "will do", "ok thanks", "okay thanks", "ok thank", "k thanks",
    "bye", "see ya", "take care", "have a good", "have a nice",
    "good morning", "good afternoon", "good evening",
)

SMALL_TALK_MARKERS = (
    "how are you", "how r u", "how're you", "how are u", "hows it going",
    "how's it going", "how is it going", "you good", "you okay", "you ok",
    "what's up", "whats up", "sup", "how do you do",
    "how have you been", "how you doing", "how're things", "how are things",
)

GREETING_ONLY = ("hi", "hello", "hey", "yo", "sup", "greetings")


def _sanitize_text(text: str) -> str:
    """Strip quotes, brackets, and surrounding punctuation."""
    t = (text or "").strip()
    # Strip a matched pair of quotes / brackets at the edges
    pairs = [('"', '"'), ("'", "'"), ("“", "”"), ("(", ")"), ("[", "]")]
    for open_q, close_q in pairs:
        if len(t) >= 2 and t.startswith(open_q) and t.endswith(close_q):
            t = t[1:-1].strip()
    return t


def _rule_classify(text: str) -> str:
    """
    Return 'conversational' | 'question' | 'ambiguous'.
    Fast, deterministic, no LLM.
    """
    if not text:
        return "ambiguous"
    t = _sanitize_text(text).lower()
    if not t:
        return "ambiguous"

    # Short greeting-only messages — strip trailing punctuation
    t_clean = t.rstrip("!.,?;:")
    if t_clean in GREETING_ONLY:
        return "conversational"

    # Small-talk markers (regardless of ?)
    if any(m in t for m in SMALL_TALK_MARKERS):
        return "conversational"

    # Thank-you / acknowledgement markers — but only if there's no
    # product noun in the same message (a real question can contain
    # "thanks" as a courtesy).
    has_marker = any(m in t for m in CONVERSATIONAL_MARKERS)
    has_product = any(n in t for n in PRODUCT_NOUNS)

    if has_marker and not has_product:
        return "conversational"

    if has_product and "?" in t:
        return "question"

    # Very short, has no marker, has no product noun, has no ? → ambiguous
    # (could be "I see", "lol", "neat", etc.)
    if len(t.split()) <= 4 and "?" not in t and not has_product:
        return "ambiguous"

    return "question" if "?" in t else "ambiguous"


# Canned reply templates — chosen based on the conversational subtype
CANNED_REPLIES = {
    "thanks": (
        "You're welcome — glad it helped! "
        "If anything else comes up, just reply here."
    ),
    "greeting": (
        "Hey! Let me know if you need anything from Cortex."
    ),
    "small_talk": (
        "Doing well, thanks for asking! "
        "What can I help you with today?"
    ),
    "ack": (
        "Great — just reply here if anything else comes up."
    ),
    "generic": (
        "Thanks for the note. Just reply here if you need anything."
    ),
}


def _classify_conversational_subtype(text: str) -> str:
    """
    Return the subtype: thanks | greeting | small_talk | ack | generic.
    Rules-based, cheap, and correct 95% of the time.
    """
    t = _sanitize_text(text).lower()
    if not t:
        return "generic"

    # Small talk first (highest specificity)
    if any(m in t for m in SMALL_TALK_MARKERS):
        return "small_talk"

    # Thanks
    thanks = (
        "thank you", "thanks", "thank u", "thx", "ty ",
        "cheers", "appreciate", "much appreciated",
    )
    if any(m in t for m in thanks):
        return "thanks"

    # Bare greeting (very short, only greeting words)
    if t.rstrip("!.,") in GREETING_ONLY:
        return "greeting"

    # Acknowledgements
    acks = (
        "got it", "understood", "sounds good", "will do",
        "ok thanks", "okay thanks", "ok thank", "k thanks",
        "no worries", "perfect", "great", "awesome", "nice",
        "cool", "ok", "okay", "k", "alright", "fine",
    )
    if any(t == a or t.startswith(a + " ") or t.startswith(a + ",") or t.startswith(a + "!") for a in acks):
        return "ack"

    return "generic"


def _canned_reply_for(text: str) -> str:
    subtype = _classify_conversational_subtype(text)
    print(f"[triage] conversational subtype: {subtype!r} for {text[:40]!r}")
    return CANNED_REPLIES.get(subtype, CANNED_REPLIES["generic"])


async def _recent_canned_within(
    db: AsyncSession,
    ticket: FeedbackTicket,
    *,
    seconds: int = 300,
) -> bool:
    """
    Return True if we sent a canned conversational reply within the
    given window. Prevents 3-in-a-row spam when users send casual
    messages in quick succession.
    """
    ctx = ticket.context or {}
    last_iso = ctx.get("last_canned_at")
    if not last_iso:
        return False
    try:
        last = datetime.fromisoformat(last_iso)
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - last).total_seconds() < seconds
    except Exception:  # noqa: BLE001
        return False


async def _mark_canned_sent(db: AsyncSession, ticket: FeedbackTicket) -> None:
    ctx = dict(ticket.context or {})
    ctx["last_canned_at"] = datetime.now(timezone.utc).isoformat()
    ticket.context = ctx
    await db.commit()


async def _llm_classify(text: str, recent: list[str]) -> str:
    """
    LLM fallback for ambiguous cases. Reads the last few messages
    for context, returns 'conversational' | 'question'.
    """
    if ai_service is None or not hasattr(ai_service, "call_llm_json"):
        return "question"  # safest default: treat as a real question

    history = "\n".join(f"- {m[:200]}" for m in recent[-3:]) or "(no history)"
    prompt = (
        f"Recent conversation (oldest first):\n{history}\n\n"
        f"New user message: {text!r}\n\n"
        "Reply with a SINGLE word — no punctuation, no quotes:\n"
        "  conversational   if the message is a greeting, thanks, "
        "small talk, acknowledgement, or chitchat.\n"
        "  question         if the message asks for information or help.\n"
        "Your one-word answer:"
    )
    try:
        # Use the plain-text LLM path — more robust than JSON mode for
        # one-word classification decisions.
        from app.services.ai import call_llm
        raw = await call_llm(
            prompt=prompt,
            system=(
                "You are a strict single-word intent classifier. "
                "Reply with exactly one of: conversational, question."
            ),
            temperature=0.0,
            max_tokens=8,
        )
    except Exception as e:  # noqa: BLE001
        print(f"[triage] intent classifier failed: {e}")
        return "question"

    verdict = (raw or "").strip().strip(".,!?:;\"'").lower()
    # Some models may echo the whole phrase — check both words
    if "conversational" in verdict:
        return "conversational"
    if "question" in verdict:
        return "question"
    return "question"  # default safe


async def _classify_intent(
    text: str,
    recent_replies: list[FeedbackReply],
) -> str:
    """
    Cascade: rules first, LLM fallback only for ambiguous cases.
    Returns 'conversational' | 'question'.
    """
    verdict = _rule_classify(text)
    if verdict != "ambiguous":
        print(f"[triage] intent (rules): {verdict!r} for {text[:60]!r}")
        return verdict

    settings = get_settings()
    if not settings.intent_classifier_enabled:
        return "question"

    recent_texts = [(r.content or "") for r in recent_replies[-5:]]
    verdict = await _llm_classify(text, recent_texts)
    print(f"[triage] intent (llm): {verdict!r} for {text[:60]!r}")
    return verdict



def _should_auto_send(
    parsed: dict,
    *,
    auto_reply_mode: str,
    threshold: float,
) -> bool:
    """Decide whether to send the AI reply without human review."""
    if auto_reply_mode != "auto":
        return False
    if parsed.get("category") != "question":
        return False
    if float(parsed.get("confidence", 0.0)) < threshold:
        return False
    if not (parsed.get("draft_reply") or "").strip():
        return False
    return True


async def _apply_triage_to_ticket(
    db: AsyncSession,
    ticket: FeedbackTicket,
    parsed: dict,
    *,
    apply_threshold: float,
) -> dict:
    """
    Overwrite category / priority when the AI is confident enough.
    Returns a diff dict for logging + storage.
    """
    diff: dict = {}
    confidence = float(parsed.get("confidence", 0.0))

    if confidence < apply_threshold:
        return diff

    new_category = parsed.get("category")
    new_priority = parsed.get("priority")

    if new_category and new_category != ticket.category:
        diff["category_before"] = ticket.category
        diff["category_after"] = new_category
        ticket.category = new_category

    if new_priority and new_priority != ticket.priority:
        diff["priority_before"] = ticket.priority
        diff["priority_after"] = new_priority
        ticket.priority = new_priority

    if diff:
        await db.commit()
        await db.refresh(ticket)

    return diff


async def _send_team_reply(
    db: AsyncSession,
    ticket: FeedbackTicket,
    content: str,
) -> str | None:
    """
    Post a team reply (by the AI) and email the filer.
    Returns the reply id, or None on failure.
    """
    from app.services import notifications as notifications_service

    try:
        reply = await feedback_service.add_team_reply_with_event(
            db,
            ticket_id=str(ticket.id),
            content=content,
            actor_user_id=None,
        )
    except Exception as e:  # noqa: BLE001
        print(f"[triage] team reply failed: {e}")
        return None

    if reply is None:
        return None

    # NOTE: add_team_reply_with_event already fires the filer email +
    # bell notification internally. Do NOT also call
    # notify_filer_of_reply — that would double-send both.
    return str(reply.id)


async def _save_draft(
    db: AsyncSession,
    ticket: FeedbackTicket,
    parsed: dict,
) -> None:
    """Save the AI draft onto ticket.context for admin review."""
    ctx = dict(ticket.context or {})
    # Always overwrite — the newest draft is the current one.
    ctx["ai_draft_reply"] = {
        "content": parsed.get("draft_reply", "").strip(),
        "confidence": float(parsed.get("confidence", 0.0)),
        "category": parsed.get("category"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    ticket.context = ctx
    await db.commit()


async def run_triage_pipeline(
    ticket_id: str,
    *,
    force: bool = False,
) -> None:
    """
    Background entry point. Owns its own DB session.

    `force=True` is used when the user replies — it bypasses the
    "already processed" idempotency check and regenerates the triage
    with the new conversation context.

    Never raises — logs and exits on any error so it can't take down
    the caller's request cycle.
    """
    from app.db.session import AsyncSessionLocal

    settings = get_settings()
    if not settings.auto_triage_enabled:
        return

    async with AsyncSessionLocal() as db:
        try:
            ticket = await feedback_service.get_ticket_any(db, ticket_id)
            if ticket is None:
                return

            ctx = dict(ticket.context or {})
            pipeline_state = ctx.get("ai_triage_pipeline") or {}

            # --- Debounce: skip if we ran very recently ---
            if force:
                last_run_iso = pipeline_state.get("processed_at")
                if last_run_iso:
                    try:
                        last_run = datetime.fromisoformat(last_run_iso)
                        if last_run.tzinfo is None:
                            last_run = last_run.replace(tzinfo=timezone.utc)
                        delta = (
                            datetime.now(timezone.utc) - last_run
                        ).total_seconds()
                        if delta < settings.auto_triage_debounce_seconds:
                            print(
                                f"[triage] debounced (ran {delta:.1f}s ago, "
                                f"limit {settings.auto_triage_debounce_seconds}s)"
                            )
                            return
                    except Exception:  # noqa: BLE001
                        pass

            # --- Idempotency: skip on non-force if already processed ---
            if not force and pipeline_state.get("processed_at"):
                return

            # Clear any stale draft so the panel doesn't show the old one
            # while the new one generates.
            if force:
                ctx.pop("ai_draft_reply", None)
                ctx["ai_triage_pipeline"] = {
                    **pipeline_state,
                    "regenerating": True,
                }
                ticket.context = ctx
                await db.commit()

            # Mark first so a re-fire can't race in
            await _mark_processed(
                db,
                ticket,
                {"started_at": datetime.now(timezone.utc).isoformat()},
            )

            # ---- 1. Triage ----
            try:
                triage_result = await triage_ticket(db, ticket_id, force=False)
            except Exception as e:  # noqa: BLE001
                print(f"[triage] LLM call failed for {ticket_id}: {e}")
                await _mark_processed(db, ticket, {"error": "triage_failed"})
                return

            parsed = {
                "category": triage_result.get("category"),
                "priority": triage_result.get("priority"),
                "rationale": triage_result.get("rationale"),
                # Draft reply is now generated by the help engine, not
                # triage. Overwrite whatever triage produced.
                "draft_reply": "",
                "confidence": float(triage_result.get("confidence", 0.0)),
            }

            # Generate a doc-grounded reply to the latest user message.
            replies_all = await feedback_service.list_all_replies(
                db, str(ticket.id)
            )

            # ---- Conversational shortcut ----
            # If the latest user message is a short thank-you / ack,
            # skip the LLM and send a canned friendly reply immediately.
            latest_user_text = ""
            for r in reversed(replies_all):
                if r.author == "user":
                    latest_user_text = r.content or ""
                    break

            if latest_user_text:
                intent = await _classify_intent(latest_user_text, replies_all)
                if intent == "conversational":
                    # Cooldown: if we already sent a canned reply in the
                    # last 5 min, silently skip. Prevents 3-in-a-row spam
                    # from casual messages.
                    if await _recent_canned_within(db, ticket, seconds=300):
                        print(
                            f"[triage] conversational cooldown active — "
                            f"skipping reply to {latest_user_text[:40]!r}"
                        )
                        await _mark_processed(
                            db,
                            ticket,
                            {
                                "auto_sent": False,
                                "cooldown_skipped": True,
                                "conversational": True,
                                "category": parsed["category"],
                                "priority": parsed["priority"],
                                "applied_diff": {},
                                "regenerating": False,
                            },
                        )
                        return

                    canned = _canned_reply_for(latest_user_text)
                    reply_id = await _send_team_reply(db, ticket, canned)
                    auto_sent = reply_id is not None
                    # Clear any stale draft from a previous cycle
                    ctx_after = dict(ticket.context or {})
                    ctx_after.pop("ai_draft_reply", None)
                    ticket.context = ctx_after
                    await db.commit()
                    await _mark_canned_sent(db, ticket)
                    await _mark_processed(
                        db,
                        ticket,
                        {
                            "auto_sent": auto_sent,
                            "reply_id": reply_id,
                            "conversational": True,
                            "confidence": 1.0,
                            "category": parsed["category"],
                            "priority": parsed["priority"],
                            "applied_diff": {},
                            "regenerating": False,
                        },
                    )
                    print(
                        f"[triage] CONVERSATIONAL reply sent — "
                        f"ticket={ticket_id[:8]} reply_id={reply_id}"
                    )
                    return

            try:
                help_answer, help_conf = await _generate_reply_using_help(
                    ticket, replies_all
                )
                if help_answer:
                    parsed["draft_reply"] = help_answer
                    parsed["help_confidence"] = help_conf
                    parsed["classification_confidence"] = parsed["confidence"]
                    parsed["confidence"] = help_conf
            except Exception as e:  # noqa: BLE001
                print(f"[triage] help draft failed: {e}")

            # ---- 2. Apply category / priority ----
            diff = await _apply_triage_to_ticket(
                db,
                ticket,
                parsed,
                apply_threshold=settings.auto_triage_apply_threshold,
            )

            # ---- 3. Auto-send or draft ----
            auto_sent = False
            reply_id: str | None = None

            # Auto-send fires when the help engine is confident the
            # doc-grounded answer is good. Classification confidence is
            # not used for this gate.
            if _should_auto_send(
                parsed,
                auto_reply_mode=settings.auto_reply_mode,
                threshold=settings.auto_reply_confidence_threshold,
            ):
                reply_id = await _send_team_reply(db, ticket, parsed["draft_reply"])
                auto_sent = reply_id is not None
            elif settings.auto_reply_mode in ("draft", "auto"):
                # Save the draft regardless — admin can approve with one click
                if (parsed.get("draft_reply") or "").strip():
                    await _save_draft(db, ticket, parsed)

            # ---- 4. Record outcome ----
            await _mark_processed(
                db,
                ticket,
                {
                    "auto_sent": auto_sent,
                    "reply_id": reply_id,
                    "applied_diff": diff,
                    "confidence": parsed["confidence"],
                    "category": parsed["category"],
                    "priority": parsed["priority"],
                    "regenerating": False,
                },
            )

            if auto_sent:
                print(
                    f"[triage] AUTO-SENT to filer — ticket={ticket_id[:8]} "
                    f"category={parsed['category']} "
                    f"conf={parsed['confidence']:.2f} "
                    f"reply_id={reply_id}"
                )
            else:
                print(
                    f"[triage] ticket={ticket_id[:8]} "
                    f"category={parsed['category']} "
                    f"conf={parsed['confidence']:.2f} "
                    f"auto_sent=False"
                )

        except Exception as e:  # noqa: BLE001
            print(f"[triage] pipeline crashed for {ticket_id}: {e}")


def schedule_triage_pipeline(
    ticket_id: str,
    *,
    force: bool = False,
) -> None:
    """
    Fire-and-forget from a sync context. Safe to call from
    create_ticket() or add_user_reply() — swallows scheduling errors.

    `force=True` re-runs even if the ticket was already triaged —
    used after a user reply so the AI gets the new context.
    """
    try:
        loop = asyncio.get_event_loop()
        loop.create_task(run_triage_pipeline(ticket_id, force=force))
    except Exception as e:  # noqa: BLE001
        print(f"[triage] schedule failed: {e}")


# =====================================================================
# DRAFT LIFECYCLE (admin actions)
# =====================================================================


async def approve_draft(
    db: AsyncSession,
    ticket_id: str,
    *,
    admin_user_id: str | None = None,
) -> dict:
    """
    Send the stored AI draft as a team reply, then clear it.
    Idempotent: once cleared, returns {"ok": False, "reason": "no_draft"}.
    """
    ticket = await feedback_service.get_ticket_any(db, ticket_id)
    if ticket is None:
        return {"ok": False, "reason": "ticket_not_found"}

    ctx = dict(ticket.context or {})
    draft = ctx.get("ai_draft_reply") or {}
    content = (draft.get("content") or "").strip()
    if not content:
        return {"ok": False, "reason": "no_draft"}

    reply_id = await _send_team_reply(db, ticket, content)
    if reply_id is None:
        return {"ok": False, "reason": "send_failed"}

    # Clear the draft and record the approval
    ctx.pop("ai_draft_reply", None)
    ctx["ai_draft_approved_at"] = datetime.now(timezone.utc).isoformat()
    ctx["ai_draft_approved_by"] = admin_user_id
    ctx["ai_draft_reply_id"] = reply_id
    ticket.context = ctx
    await db.commit()

    return {"ok": True, "reply_id": reply_id}


async def discard_draft(
    db: AsyncSession,
    ticket_id: str,
) -> bool:
    ticket = await feedback_service.get_ticket_any(db, ticket_id)
    if ticket is None:
        return False
    ctx = dict(ticket.context or {})
    if "ai_draft_reply" not in ctx:
        return True  # idempotent
    ctx.pop("ai_draft_reply", None)
    ctx["ai_draft_discarded_at"] = datetime.now(timezone.utc).isoformat()
    ticket.context = ctx
    await db.commit()
    return True
