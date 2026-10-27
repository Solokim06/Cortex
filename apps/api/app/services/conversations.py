"""
Chat conversation persistence.

Handles creating conversations, saving messages, and orchestrating
the reply from Cortex's chat service.
"""

import uuid

from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ChatConversation, ChatMessageRecord
from app.i18n import DEFAULT_LOCALE
from app.services.chat import chat as cortex_chat


# ---------- Conversation management ----------

async def create_conversation(
    db: AsyncSession,
    user_id: str,
    title: str = "New chat",
) -> ChatConversation:
    """Create a new empty conversation."""
    conversation = ChatConversation(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title or "New chat",
        message_count=0,
        pinned=False,
    )
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return conversation


async def _cleanup_empty_conversations(
    db: AsyncSession,
    user_id: str,
    *,
    older_than_minutes: int = 1,
) -> None:
    """
    Silently delete empty conversations older than N minutes.

    Prevents the "New chat" button from cluttering the list when users
    open chats they never use. Safe --- the only rows this touches have
    zero messages.

    Current window is 1 minute (tight, for snappy cleanup during dev).
    Production suggestion: 60 minutes.
    """
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import delete

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=older_than_minutes)
    await db.execute(
        delete(ChatConversation).where(
            ChatConversation.user_id == user_id,
            ChatConversation.message_count == 0,
            ChatConversation.pinned.is_(False),
            ChatConversation.created_at < cutoff,
        )
    )
    await db.commit()


async def list_conversations(
    db: AsyncSession,
    user_id: str,
    limit: int = 100,
) -> list[ChatConversation]:
    """List all conversations for a user. Pinned first, then most recent."""
    # Opportunistic cleanup --- cheap, and the query already scans the
    # conversation table for this user.
    try:
        await _cleanup_empty_conversations(db, user_id)
    except Exception as e:  # noqa: BLE001
        print(f"[conversations] cleanup failed: {e}")
    result = await db.execute(
        select(ChatConversation)
        .where(ChatConversation.user_id == user_id)
        .order_by(
            desc(ChatConversation.pinned),
            desc(ChatConversation.updated_at),
        )
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_conversation(
    db: AsyncSession,
    user_id: str,
    conversation_id: str,
) -> ChatConversation | None:
    """Fetch a single conversation, scoped to the user."""
    result = await db.execute(
        select(ChatConversation)
        .where(ChatConversation.id == conversation_id)
        .where(ChatConversation.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def rename_conversation(
    db: AsyncSession,
    user_id: str,
    conversation_id: str,
    title: str,
) -> ChatConversation | None:
    """Rename a conversation. Returns None if not found / not owned."""
    conversation = await get_conversation(db, user_id, conversation_id)
    if conversation is None:
        return None

    conversation.title = title[:120]
    await db.commit()
    await db.refresh(conversation)
    return conversation


async def set_pinned(
    db: AsyncSession,
    user_id: str,
    conversation_id: str,
    pinned: bool,
) -> ChatConversation | None:
    """Pin or unpin a conversation."""
    conversation = await get_conversation(db, user_id, conversation_id)
    if conversation is None:
        return None

    conversation.pinned = pinned
    await db.commit()
    await db.refresh(conversation)
    return conversation


async def delete_conversation(
    db: AsyncSession,
    user_id: str,
    conversation_id: str,
) -> bool:
    """Delete a conversation and all its messages (cascade)."""
    conversation = await get_conversation(db, user_id, conversation_id)
    if conversation is None:
        return False

    await db.delete(conversation)
    await db.commit()
    return True


# ---------- Message management ----------

async def list_messages(
    db: AsyncSession,
    user_id: str,
    conversation_id: str,
    limit: int = 200,
) -> list[ChatMessageRecord]:
    """Return all messages in a conversation, oldest first."""
    result = await db.execute(
        select(ChatMessageRecord)
        .where(ChatMessageRecord.conversation_id == conversation_id)
        .where(ChatMessageRecord.user_id == user_id)
        .order_by(
            ChatMessageRecord.created_at.asc(),
            ChatMessageRecord.id.asc(),
        )
        .limit(limit)
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------
# History loading for persistent chat memory
#
# Caps: MAX_HISTORY_TURNS turns (user+assistant pairs) OR
# MAX_HISTORY_TOKENS approximate tokens, whichever hits first.
# Rough token estimate: 1 token ??? 4 characters. Good enough for a cap.
# ---------------------------------------------------------------------

MAX_HISTORY_TURNS = 10
MAX_HISTORY_TOKENS = 4000
_CHARS_PER_TOKEN = 4


async def load_history(
    db: AsyncSession,
    user_id: str,
    conversation_id: str,
    *,
    current_message: str | None = None,
    max_turns: int = MAX_HISTORY_TURNS,
    max_tokens: int = MAX_HISTORY_TOKENS,
    include_recall: bool = False,
    include_user_model: bool = False,
) -> list[dict]:
    """
    Return the last N turns of a conversation as OpenAI-style messages.

    Shape: [{"role": "user"|"assistant", "content": str}, ...] oldest first.

    `current_message`, if provided, is excluded --- the caller has just
    persisted the user's new message and doesn't want it duplicated
    inside the history block (it goes in the prompt separately).

    Truncation: walks backward from newest, accumulating turns, stops
    at max_turns or when the approximate token count would exceed
    max_tokens. Always returns whole turns (never splits a pair).
    """
    from sqlalchemy import select, desc

    # Fetch a generous window so we have something to truncate from.
    # 2 * max_turns covers pairs; +2 gives us slack for the current message
    # and any mid-pair boundaries.
    fetch_limit = max_turns * 2 + 2

    # --- Tier 2: fetch the rolling summary (if any) ---
    # The summary covers the oldest part of the conversation; the
    # verbatim window below covers only what came after summary_through_id.
    conv_row = await db.execute(
        select(ChatConversation).where(
            ChatConversation.id == conversation_id,
            ChatConversation.user_id == user_id,
        )
    )
    conversation = conv_row.scalar_one_or_none()
    summary_text: str | None = None
    summary_through_id: str | None = None
    if conversation is not None:
        summary_text = conversation.summary
        summary_through_id = (
            str(conversation.summary_through_id)
            if conversation.summary_through_id
            else None
        )

    result = await db.execute(
        select(ChatMessageRecord)
        .where(ChatMessageRecord.conversation_id == conversation_id)
        .where(ChatMessageRecord.user_id == user_id)
        .order_by(
            desc(ChatMessageRecord.created_at),
            desc(ChatMessageRecord.id),
        )
        .limit(fetch_limit)
    )
    recent = list(result.scalars().all())

    # Newest-first ??' apply the filters, then reverse for chronological order.
    filtered: list[ChatMessageRecord] = []
    for m in recent:
        if (
            current_message is not None
            and m.role == "user"
            and m.content == current_message
        ):
            continue
        filtered.append(m)

    # Walk forward (oldest of the recent window first) accumulating until
    # either cap is hit. We compute tokens on the raw content length.
    filtered.reverse()

    kept: list[ChatMessageRecord] = []
    tokens_used = 0
    for m in reversed(filtered):  # walk backward from newest
        approx = len(m.content or "") // _CHARS_PER_TOKEN
        if tokens_used + approx > max_tokens:
            break
        kept.append(m)
        tokens_used += approx
        # Count "turns" as pairs of (user, assistant). Stop when we have
        # max_turns * 2 messages.
        if len(kept) >= max_turns * 2:
            break

    kept.reverse()  # back to chronological

    # Drop any messages already folded into the summary.
    if summary_through_id:
        filtered_by_summary: list[ChatMessageRecord] = []
        passed_marker = False
        for m in kept:
            if passed_marker:
                filtered_by_summary.append(m)
            elif str(m.id) == summary_through_id:
                passed_marker = True
        # If the marker was not in kept, the summary is older than the
        # current window - use all of kept (nothing to drop).
        if not passed_marker:
            filtered_by_summary = kept
    else:
        filtered_by_summary = kept

    result_msgs: list[dict] = []

    # Tier 2 #3: user profile. Runs FIRST so the LLM reads it as the
    # outermost context -- who this person is, before what they said.
    if include_user_model:
        try:
            from app.services.user_model import (
                get_user_model_for_prompt as _get_um,
            )
            _profile_block = await _get_um(db, user_id)
            if _profile_block:
                result_msgs.append(
                    {"role": "system", "content": _profile_block}
                )
        except Exception as e:  # noqa: BLE001
            print(f"[load_history] user model failed (non-fatal): {e}")

    # Tier 2 cross-conversation recall: fetch related past exchanges
    # (from other conversations) and captured nodes, prepend as a
    # single system message. Runs before the summary block so the LLM
    # reads it as broader context, then narrows to this conversation.
    if include_recall and current_message:
        try:
            from app.config.settings import get_settings as _get_settings
            from app.services.recall import (
                recall_relevant as _recall_relevant,
                format_recall_block as _format_recall_block,
            )
            _s = _get_settings()
            if _s.recall_enabled:
                _hits = await _recall_relevant(
                    db,
                    user_id,
                    current_message,
                    top_k=_s.recall_top_k,
                    threshold=_s.recall_similarity_threshold,
                    exclude_conversation_id=conversation_id,
                )
                if _hits:
                    _block = _format_recall_block(
                        _hits, max_tokens=_s.recall_max_context_tokens
                    )
                    if _block:
                        result_msgs.append(
                            {"role": "system", "content": _block}
                        )
        except Exception as e:  # noqa: BLE001
            print(f"[load_history] recall failed (non-fatal): {e}")

    if summary_text:
        result_msgs.append(
            {
                "role": "system",
                "content": (
                    "Earlier in this conversation (summarized): "
                    + summary_text
                ),
            }
        )
    result_msgs.extend(
        {"role": m.role, "content": m.content}
        for m in filtered_by_summary
        if m.role in ("user", "assistant")
    )
    return result_msgs


async def add_user_message(
    db: AsyncSession,
    user_id: str,
    conversation_id: str,
    content: str,
) -> ChatMessageRecord:
    """Save a user message to a conversation."""
    # Auto-title on the very first user message, before we bump
    # message_count. This runs for every caller (streaming + non-streaming)
    # so the conversation title always reflects the opening question.
    conv = await get_conversation(db, user_id, conversation_id)
    if conv is not None and conv.message_count == 0 and conv.title == "New chat":
        conv.title = _auto_title_from_message(content)
        await db.commit()

    msg = ChatMessageRecord(
        id=str(uuid.uuid4()),
        conversation_id=conversation_id,
        user_id=user_id,
        role="user",
        content=content,
        sources=[],
        nodes_used=0,
    )
    db.add(msg)

    await db.execute(
        update(ChatConversation)
        .where(ChatConversation.id == conversation_id)
        .values(
            message_count=ChatConversation.message_count + 1,
            updated_at=func.now(),
        )
    )

    await db.commit()
    await db.refresh(msg)

    # Tier 2 recall: embed this message so future turns can search
    # past conversations by meaning. Inline (not backgrounded) so the
    # vector is live the moment the message is persisted. Failure is
    # non-fatal - chat continues without a recall vector for this row.
    try:
        from app.services.recall import embed_message as _embed_message
        await _embed_message(
            db,
            user_id=user_id,
            message_id=str(msg.id),
            conversation_id=conversation_id,
            role="user",
            text_content=content,
        )
    except Exception as e:  # noqa: BLE001
        print(f"[conversations] user-message embed failed (non-fatal): {e}")

    return msg


async def add_assistant_message(
    db: AsyncSession,
    user_id: str,
    conversation_id: str,
    content: str,
    sources: list,
    nodes_used: int,
    edges: list | None = None,
) -> ChatMessageRecord:
    """Save an assistant reply to a conversation."""
    msg = ChatMessageRecord(
        id=str(uuid.uuid4()),
        conversation_id=conversation_id,
        user_id=user_id,
        role="assistant",
        content=content,
        sources=sources or [],
        edges=edges or [],
        nodes_used=nodes_used or 0,
    )
    db.add(msg)

    await db.execute(
        update(ChatConversation)
        .where(ChatConversation.id == conversation_id)
        .values(
            message_count=ChatConversation.message_count + 1,
            updated_at=func.now(),
        )
    )

    await db.commit()
    await db.refresh(msg)

    # Fire-and-forget Tier 2 summary maintenance. Creates its own DB
    # session because this request session will be closed by the time
    # the task runs. Errors are swallowed inside the task.
    try:
        import asyncio as _aio
        _aio.create_task(
            _maybe_update_summary_background(user_id, conversation_id)
        )
    except Exception as e:  # noqa: BLE001
        print(f"[summary] could not schedule task: {e}")

    # Tier 2 #3: user-profile maintenance. Same fire-and-forget pattern
    # as the summary; the update function self-guards on update cadence
    # and idempotency.
    try:
        import asyncio as _aio
        from app.services.user_model import (
            update_user_model_background as _update_um,
        )
        _aio.create_task(_update_um(user_id))
    except Exception as e:  # noqa: BLE001
        print(f"[user_model] could not schedule task: {e}")

    # Tier 2 recall: embed this assistant reply inline so a future
    # turn in another conversation can recall it by meaning. Non-fatal.
    try:
        from app.services.recall import embed_message as _embed_message
        await _embed_message(
            db,
            user_id=user_id,
            message_id=str(msg.id),
            conversation_id=conversation_id,
            role="assistant",
            text_content=content,
        )
    except Exception as e:  # noqa: BLE001
        print(f"[conversations] assistant-message embed failed (non-fatal): {e}")

    return msg


# ---------- Auto-title ----------

def _auto_title_from_message(message: str) -> str:
    """Take the first ~60 chars of a message and make a title."""
    cleaned = " ".join(message.strip().split())
    if len(cleaned) <= 60:
        return cleaned
    return cleaned[:57] + "???"


# ---------------------------------------------------------------------
# Tier 2 rolling summary
#
# When a conversation grows past `summary_trigger_messages`, the oldest
# turns are folded into `ChatConversation.summary` by an LLM pass. On
# subsequent `load_history` calls the summary is prepended as a system
# message so the model sees both the compressed past and the recent
# verbatim turns.
#
# The summarizer is HYBRID: it captures factual content, the AI's
# reasoning style, the user's cognition patterns, open threads, tone
# register, and grounding citations --- so future turns inherit not just
# WHAT was discussed but HOW the conversation was conducted.
# ---------------------------------------------------------------------


def _estimate_tokens(text: str) -> int:
    """Approximate token count. 1 token ??? 4 chars, matching load_history."""
    return max(1, len(text or "") // _CHARS_PER_TOKEN)


def _format_transcript(messages: list[ChatMessageRecord]) -> str:
    """
    Format a batch of turns as a compact transcript for the summarizer.

    Shape (one line per message, oldest first):
        [user] <content>
        [assistant] <content> (sources: [n0] Title, [n1] Title)
    """
    lines: list[str] = []
    for m in messages:
        role = "user" if m.role == "user" else "assistant"
        body = (m.content or "").strip().replace("\n", " ")
        if len(body) > 500:
            body = body[:497] + "..."
        line = f"[{role}] {body}"
        # Assistants may carry source citations --- keep a compact list.
        if role == "assistant" and m.sources:
            titles = []
            for i, s in enumerate(m.sources[:6]):
                if isinstance(s, dict) and s.get("title"):
                    titles.append(f"[n{i}] {s['title']}")
            if titles:
                line += f"  (sources: {', '.join(titles)})"
        lines.append(line)
    return "\n".join(lines)


def _build_summary_prompt(
    prior_summary: str | None,
    overflow_messages: list[ChatMessageRecord],
    target_tokens: int,
) -> tuple[str, str]:
    """
    Return (system_prompt, user_prompt) for the hybrid summarizer.

    The system prompt instructs the model to capture SIX layers:
      1. Content (topics, facts the user established)
      2. AI reasoning style (how Cortex answered, what sources it used)
      3. User cognition (how the user engages, thinks, pushes back)
      4. Open threads (unresolved questions, promised follow-ups)
      5. Tone register (formality, urgency, confidence)
      6. Grounding (recurring concepts and how they were linked)
    """
    system = (
        "You are maintaining a rolling memory summary for a long-running "
        "conversation between a user and Cortex, a personal cognition "
        "assistant. Your summary is what the model will use to remember "
        "this conversation after the raw turns have scrolled past the "
        "token cap.\n"
        "\n"
        "Each update gives you:\n"
        "  - The PRIOR SUMMARY (may be empty on the first pass)\n"
        "  - A NEW EXCERPT of turns (oldest first) to fold into it\n"
        "\n"
        "Produce ONE updated summary as flowing prose (no bullets, no "
        "headings). It must capture:\n"
        "\n"
        "1. CONTENT --- topics discussed, questions asked, facts the user "
        "established about themselves, their projects, their values, "
        "their decisions.\n"
        "\n"
        "2. AI REASONING STYLE --- how Cortex answered: analytical, "
        "exploratory, direct, tentative? What kinds of graph sources did "
        "it lean on (concepts, thoughts, edges)? Any recurring patterns.\n"
        "\n"
        "3. USER COGNITION --- how the user engages: open-ended vs narrow "
        "questions, do they push back, build on prior answers, prefer "
        "terse or expansive exchanges? Signals about how they think.\n"
        "\n"
        "4. OPEN THREADS --- anything unresolved the next turn might return "
        "to: unanswered questions, promised follow-ups, decisions still "
        "pending.\n"
        "\n"
        "5. TONE REGISTER --- the conversation's emotional texture: "
        "formal/informal, urgent/reflective, confident/uncertain.\n"
        "\n"
        "6. GROUNDING --- which concepts or thoughts Cortex repeatedly "
        "cited, and how it linked them (contains, supports, exemplifies).\n"
        "\n"
        "Rules:\n"
        "  - Prose only. One to two paragraphs.\n"
        "  - Neutral third person (\"the user asked...\", \"Cortex replied by...\").\n"
        "  - Preserve names, project titles, and technical terms verbatim.\n"
        "  - If PRIOR SUMMARY and NEW EXCERPT together exceed the length "
        "target, compress the oldest material first --- never truncate "
        "mid-sentence.\n"
        f"  - Target length: approximately {target_tokens} tokens.\n"
    )

    prior = (prior_summary or "").strip() or "(none --- this is the first summary)"
    transcript = _format_transcript(overflow_messages)
    user = (
        "PRIOR SUMMARY:\n"
        '"""\n'
        f"{prior}\n"
        '"""\n'
        "\n"
        f"NEW EXCERPT (oldest first, {len(overflow_messages)} messages):\n"
        '"""\n'
        f"{transcript}\n"
        '"""\n'
    )
    return system, user


async def _maybe_update_summary(
    db: AsyncSession,
    user_id: str,
    conversation_id: str,
    *,
    dry_run: bool = False,
) -> str | None:
    """
    Fold the oldest un-summarized turns into ChatConversation.summary.

    Returns the generated summary text (useful in dry_run), or None if
    nothing was done. Never raises --- all failures are logged and
    swallowed so the calling chat path is never disrupted.
    """
    from datetime import datetime, timezone, timedelta

    try:
        from app.config.settings import get_settings
        from app.services.ai import call_llm

        s = get_settings()
        if not s.summary_enabled:
            return None

        conversation = await get_conversation(db, user_id, conversation_id)
        if conversation is None:
            return None

        total = conversation.message_count or 0
        if total < s.summary_trigger_messages:
            return None

        # Idempotency guard: if a summary was written in the last 30s,
        # another parallel turn is probably still in flight. Skip.
        now = datetime.now(timezone.utc)
        last = conversation.summary_updated_at
        if last is not None and (now - last) < timedelta(seconds=30):
            return None

        # Fetch all messages oldest-first. Small conversations only ---
        # this runs after a threshold check, so the cost is bounded.
        all_msgs = await list_messages(db, user_id, conversation_id, limit=1000)
        if not all_msgs:
            return None

        # Determine the overflow window: everything except the last
        # `summary_min_messages_to_keep` messages. Also exclude any
        # messages already represented in the prior summary.
        keep_tail = max(0, s.summary_min_messages_to_keep)
        overflow = all_msgs[: max(0, len(all_msgs) - keep_tail)]
        if not overflow:
            return None

        # Skip messages already represented in the prior summary.
        prior_through_id = conversation.summary_through_id
        if prior_through_id:
            try:
                idx = next(
                    i for i, m in enumerate(overflow)
                    if str(m.id) == str(prior_through_id)
                )
                overflow = overflow[idx + 1 :]
            except StopIteration:
                # prior_through_id not in the overflow set --- fine, use
                # the whole overflow. This happens on the first pass.
                pass
        if not overflow:
            return None

        system, user = _build_summary_prompt(
            prior_summary=conversation.summary,
            overflow_messages=overflow,
            target_tokens=s.summary_target_tokens,
        )

        text = await call_llm(
            prompt=user,
            system=system,
            temperature=0.2,
            max_tokens=max(600, s.summary_target_tokens * 2),
        )
        text = (text or "").strip()
        if not text:
            return None

        if dry_run:
            return text

        # Persist.
        conversation.summary = text
        conversation.summary_through_id = str(overflow[-1].id)
        conversation.summary_updated_at = now
        await db.commit()
        return text

    except Exception as e:  # noqa: BLE001
        print(f"[summary] update failed (non-fatal): {e}")
        return None


async def _maybe_update_summary_background(
    user_id: str,
    conversation_id: str,
) -> None:
    """
    Fire-and-forget wrapper. Opens its own DB session because the
    request-scoped session will already be closed by the time this
    task runs.
    """
    from app.db.session import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            await _maybe_update_summary(db, user_id, conversation_id)
    except Exception as e:  # noqa: BLE001
        print(f"[summary] background task failed: {e}")


# ---------- The main "send message and get reply" flow ----------

async def send_message_and_reply(
    db: AsyncSession,
    user_id: str,
    conversation_id: str,
    message: str,
    locale: str = DEFAULT_LOCALE,
) -> dict:
    """
    Save the user message, call Cortex for a reply, save the reply.
    Returns both messages plus the reply's sources.
    Auto-titles the conversation if it's still called 'New chat'.
    """
    conversation = await get_conversation(db, user_id, conversation_id)
    if conversation is None:
        raise ValueError("Conversation not found")

    if conversation.message_count == 0 and conversation.title == "New chat":
        conversation.title = _auto_title_from_message(message)
        await db.commit()

    user_msg = await add_user_message(db, user_id, conversation_id, message)

    reply_data = await cortex_chat(db, user_id, message, locale=locale)

    assistant_msg = await add_assistant_message(
        db,
        user_id,
        conversation_id,
        reply_data.get("reply", ""),
        reply_data.get("sources", []),
        reply_data.get("nodes_used", 0),
    )

    return {
        "user_message": user_msg,
        "assistant_message": assistant_msg,
    }
