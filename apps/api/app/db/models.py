from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


# =====================================================================
# Users
# =====================================================================


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    # Clerk user ID (e.g. "user_2abcDEF..."). Nullable so existing rows
    # don't break, but populated on every authenticated request.
    clerk_user_id: Mapped[str | None] = mapped_column(
        String, unique=True, nullable=True, index=True
    )
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String, nullable=True)

    # Role for admin/support access. Source of truth is this column;
    # Clerk publicMetadata.role is mirrored into it on bootstrap only.
    # Values: "user" | "agent" | "admin"
    role: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="user",
        server_default="user",
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# =====================================================================
# Knowledge graph
# =====================================================================




class UserPreferences(Base):
    """
    Per-user settings that must sync across devices.

    Distinct from UserNotificationPrefs (which is about email opt-ins).
    This table holds UI + product preferences and consent flags.
    """

    __tablename__ = "user_preferences"

    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    # --- UI preferences ---
    # Chosen TTS voice id (e.g. "mira", "aria"). NULL = default.
    voice: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # --- Consent / data contribution ---
    # When True, the user consents to their captured data being used in
    # future Cortex model-training runs. Off by default.
    data_contribution_optin: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # Timestamp of the most recent opt-in change (grant or revoke).
    data_contribution_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Simple audit: the IP the change was made from (best-effort).
    data_contribution_changed_ip: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )

    # ---- Tier 4 agentic actions ----
    # Per-kind approval overrides. Shape:
    #   {"find_orphans": true, "suggest_links": false, "merge_concepts": false}
    # Missing keys fall back to the per-kind default in the dispatcher.
    agent_auto_apply: Mapped[dict] = mapped_column(
        "agent_auto_apply", JSON, default=dict, server_default="{}"
    )
    # Consent: whether Cortex may send captures to Groq/Gemini
    # for enrichment. Defaults TRUE for existing users.
    ai_processing: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Node(Base):
    __tablename__ = "nodes"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[str] = mapped_column(String, nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)

    # Concept canonicalization --- only meaningful when type = 'concept'.
    # NULL  ??' this is a canonical concept (or a non-concept node)
    # set   ??' this node is an alias; the canonical concept lives at that id
    canonical_concept_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("nodes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # ---- Tier 8 graph health ----
    # stale_since is set by the stale-detection worker when a concept has
    # been dormant past the threshold. NULL = active.
    # stale_dismissed_until lets the user mute the flag until a date; the
    # worker skips nodes whose dismissed_until is in the future.
    stale_since: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    stale_dismissed_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Edge(Base):
    __tablename__ = "edges"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    from_node_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    to_node_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[str] = mapped_column(String, nullable=False)
    weight: Mapped[float] = mapped_column(Float, default=1.0)
    created_by: Mapped[str] = mapped_column(String, default="ai")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Embedding(Base):
    __tablename__ = "embeddings"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    node_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        unique=True,
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), nullable=False, index=True
    )
    model: Mapped[str] = mapped_column(String, nullable=False)
    dim: Mapped[int] = mapped_column(Integer, nullable=False, default=768)
    content_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# =====================================================================
# Learning / decisions / reflections / identity
# =====================================================================


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="active", index=True)
    meta: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    locale: Mapped[str] = mapped_column(
        String(5), nullable=False, default="en", server_default="en", index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class LearningPlan(Base):
    __tablename__ = "learning_plans"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    goal_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("goals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plan: Mapped[dict] = mapped_column("plan", JSON, default=dict)
    status: Mapped[str] = mapped_column(String, default="active", index=True)
    locale: Mapped[str] = mapped_column(
        String(5), nullable=False, default="en", server_default="en", index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    options: Mapped[dict] = mapped_column("options", JSON, default=list)
    analysis: Mapped[dict] = mapped_column("analysis", JSON, default=dict)
    chosen_option: Mapped[str | None] = mapped_column(Text, nullable=True)
    reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    actual_outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    lesson: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="open", index=True)
    review_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    locale: Mapped[str] = mapped_column(
        String(5), nullable=False, default="en", server_default="en", index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Reflection(Base):
    __tablename__ = "reflections"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[str] = mapped_column(String, nullable=False, index=True)
    decision_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("decisions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    meta: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    locale: Mapped[str] = mapped_column(
        String(5), nullable=False, default="en", server_default="en", index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class SelfModel(Base):
    __tablename__ = "self_models"

    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    model: Mapped[dict] = mapped_column("model", JSON, default=dict)
    narrative: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_stats: Mapped[dict] = mapped_column("source_stats", JSON, default=dict)
    last_rebuilt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    locale: Mapped[str] = mapped_column(
        String(5), nullable=False, default="en", server_default="en"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class IdentitySnapshot(Base):
    __tablename__ = "identity_snapshots"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    model: Mapped[dict] = mapped_column("model", JSON, default=dict)
    narrative: Mapped[str | None] = mapped_column(Text, nullable=True)
    locale: Mapped[str] = mapped_column(
        String(5), nullable=False, default="en", server_default="en", index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


# =====================================================================
# Chat
# =====================================================================


class ChatConversation(Base):
    __tablename__ = "chat_conversations"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String, nullable=False, default="New chat")
    message_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # ---- Tier 2 rolling summary ----
    # When the conversation grows past a token threshold, the oldest
    # turns are folded into the summary field. The summary_through_id
    # marks how far we have summarized (soft pointer, no FK; if the
    # referenced message is deleted, load_history simply ignores it).
    # summary_updated_at is an idempotency guard so two parallel
    # turn-finalization tasks cannot race to write the same summary.
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_through_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), nullable=True
    )
    summary_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class ChatMessageRecord(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    conversation_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("chat_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sources: Mapped[list] = mapped_column("sources", JSON, default=list)
    # Index-keyed edges ({from, to, type}) from the graph walk, matching
    # the [nX] order of `sources`. Empty for flat-path replies.
    edges: Mapped[list] = mapped_column("edges", JSON, default=list)
    nodes_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


# =====================================================================
# User model (Tier 2 -- persistent profile)
# =====================================================================


class UserModel(Base):
    """
    Persistent profile of a user's communication style and thinking.

    One row per user, updated incrementally by an LLM pass over recent
    messages + captures. The profile is a JSON struct of six fields:
        communication_style, recurring_themes, thinking_patterns,
        emotional_register, vocabulary_and_framing, responds_well_to

    Rendered into a system message and prepended to chat history.
    """

    __tablename__ = "user_model"

    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # JSONB struct of the six profile fields. Empty dict on first pass.
    profile: Mapped[dict] = mapped_column(
        "profile", JSON, default=dict, server_default="{}"
    )
    # Idempotency guard: number of user messages seen at last update.
    source_message_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    last_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )



# =====================================================================
# API tokens
# =====================================================================


class ApiToken(Base):
    __tablename__ = "api_tokens"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )
    token_prefix: Mapped[str] = mapped_column(String(16), nullable=False)
    label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


# =====================================================================
# Feedback tickets (Tier 3 extended)
# =====================================================================


class FeedbackTicket(Base):
    """
    A user-submitted feedback ticket.

    Categories: bug | feature | question | other
    Status:     open ??' in_progress ??' resolved ??' closed
    Priority:   low | normal | high | urgent
    """

    __tablename__ = "feedback_tickets"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    # Nullable: anonymous visitors can submit tickets via
    # POST /help/feedback/public — no user row exists for them.
    user_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    category: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[dict] = mapped_column("context", JSON, default=dict)
    attachment_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="open", server_default="open", index=True
    )

    # --- Tier 3 additions ---
    priority: Mapped[str] = mapped_column(
        String(16), nullable=False, default="normal", server_default="normal", index=True
    )
    assigned_to_user_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # "user" | "team" | "note" | None
    last_replied_by: Mapped[str | None] = mapped_column(String(16), nullable=True)

    first_responded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    first_response_due_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    resolution_due_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Soft delete --- admin hides the ticket from their list after it's
    # resolved/closed. The filer still sees it. Cleared on user reply.
    hidden_from_admin_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )


class Notification(Base):
    """
    User-facing bell notifications.

    Inserted by push_user_notification() when a user event fires.
    Survive page refresh; filtered by expires_at so short-lived events
    (12h) don't accumulate forever.
    """

    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_kind: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    ticket_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("feedback_tickets.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    ticket_subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    click_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    extra: Mapped[dict] = mapped_column(JSON, default=dict)

    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )


class FeedbackReply(Base):
    """
    A reply on a feedback ticket.

    author:
      - "user"  --- the ticket owner
      - "team"  --- Cortex support
      - "note"  --- internal note, hidden from the user
    """

    __tablename__ = "feedback_replies"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    ticket_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("feedback_tickets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    # Set when the reply's author edits it (within the allowed window).
    # NULL = never edited.
    edited_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


# =====================================================================
# Tier 3 --- new tables
# =====================================================================


class TicketEvent(Base):
    """
    Append-only audit log for everything that happens on a ticket.
    Powers the activity timeline, SLA math, and impersonation auditing.
    """

    __tablename__ = "ticket_events"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    ticket_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("feedback_tickets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    actor_user_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # "user" | "team" | "system"
    actor_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    # "created" | "status_changed" | "priority_changed" | "assigned" |
    # "replied" | "note_added" | "tag_added" | "tag_removed" |
    # "impersonated_action" | "sla_recomputed"
    kind: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    data: Mapped[dict] = mapped_column("data", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class TicketTag(Base):
    """Free-form tags on a ticket. One row per (ticket, tag)."""

    __tablename__ = "ticket_tags"
    __table_args__ = (
        UniqueConstraint("ticket_id", "tag", name="uq_ticket_tag"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    ticket_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("feedback_tickets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tag: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class CannedResponse(Base):
    """Reusable reply snippets. Not tied to a specific ticket."""

    __tablename__ = "canned_responses"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # JSON list of tags that should surface this macro, e.g. ["bug", "billing"]
    tags: Mapped[list] = mapped_column("tags", JSON, default=list)
    created_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class SlaPolicy(Base):
    """Per-priority SLA windows in minutes. Seeded from settings on startup."""

    __tablename__ = "sla_policies"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    priority: Mapped[str] = mapped_column(
        String(16), unique=True, nullable=False, index=True
    )
    first_response_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    resolution_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class WebhookTarget(Base):
    """Outbound webhook destination (Slack, Discord, generic)."""

    __tablename__ = "webhook_targets"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional HMAC secret. Falls back to settings.webhook_signing_secret.
    secret: Mapped[str | None] = mapped_column(String(256), nullable=True)
    # JSON list of event kinds, or ["*"] for all.
    events: Mapped[list] = mapped_column("events", JSON, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    last_status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_delivery_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    failure_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class WebhookDelivery(Base):
    """One row per delivery attempt. Kept for audit + retry."""

    __tablename__ = "webhook_deliveries"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    target_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("webhook_targets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_kind: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    ticket_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("feedback_tickets.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    payload: Mapped[dict] = mapped_column("payload", JSON, default=dict)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    delivered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class ImpersonationSession(Base):
    """
    An admin impersonating a user (D2.b --- full impersonation).

    Every request made with an impersonation JWT must resolve this row and
    verify is_active=True. Ending a session is the kill switch.
    """

    __tablename__ = "impersonation_sessions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    admin_user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, index=True
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )



class AdminNotificationPrefs(Base):
    """
    Per-admin notification preferences.

    One row per admin/agent. Created on-demand (get_prefs auto-inserts).
    """

    __tablename__ = "admin_notification_prefs"

    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    email_on_new_ticket: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    email_on_assignment: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    email_on_user_reply: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    email_on_sla_breach: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    email_digest_daily: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

# =====================================================================
# Email (Wave: notifications)
# =====================================================================


class EmailDelivery(Base):
    """
    One row per outbound email attempt.

    Status lifecycle:
      queued     --- created, no send attempted yet
      sending    --- in flight (rare; usually flips within the same call)
      sent       --- provider accepted (message_id present)
      failed     --- final failure after all retries
      suppressed --- recipient is on the suppression list

    `provider` records which backend handled it ("resend" | "smtp" |
    "console"). `template` is a logical name ("new_ticket", "assignment",
    etc.) for analytics and filtering.
    """

    __tablename__ = "email_deliveries"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    # Recipient email, lowercased
    to_email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    # What triggered this --- "new_ticket" | "assignment" | "user_reply" | "sla_breach"
    template: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True
    )
    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    # Optional linkage to the ticket this email is about
    ticket_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("feedback_tickets.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="queued",
        server_default="queued",
        index=True,
    )
    provider: Mapped[str] = mapped_column(String(16), nullable=False, default="console")

    # Provider-assigned message id (Resend "id", SMTP Message-ID header, etc.)
    message_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # Short error string when status == "failed"
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class EmailSuppression(Base):
    """
    Addresses that should never receive emails from Cortex.

    Populated by:
      - User clicks "unsubscribe" (future Phase 3)
      - Provider hard-bounce webhook (future)
      - Admin manual addition

    A row here short-circuits `send_email()` --- the delivery is recorded
    with status="suppressed" instead of trying to send.
    """

    __tablename__ = "email_suppressions"

    email: Mapped[str] = mapped_column(String(320), primary_key=True)
    reason: Mapped[str] = mapped_column(String(64), nullable=False, default="manual")
    # Optional free-form note for admins ("user requested", "bounced 3x", ...)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# =====================================================================
# Email settings (singleton, DB-backed runtime toggle)
# =====================================================================


class EmailSettings(Base):
    """
    Singleton row that controls runtime email behavior.

    Why a table instead of env-only:
      - The `enabled` master switch needs to be flippable from the
        admin UI without restarting the server.
      - Everything else (provider keys, from address, retry tuning)
        stays in `.env` because it's deploy-time config, not runtime.

    The row is seeded on startup from `settings.email_enabled` if
    missing, and never deleted --- always exactly one row with
    id='default'.
    """

    __tablename__ = "email_settings"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default="default")
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    updated_by_user_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


# =====================================================================
# User notification preferences (end-user facing)
# =====================================================================


class UserNotificationPrefs(Base):
    """
    Per-user email preferences for end-users (ticket filers).

    Admin/agent prefs live in AdminNotificationPrefs --- that table is
    for people who triage tickets. This one is for the people who
    FILE tickets.

    `unsubscribe_token` is a 32-char random string baked into email
    footers so a recipient can opt out without logging in.
    """

    __tablename__ = "user_notification_prefs"

    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    email_on_ticket_reply: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    email_on_status_change: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    email_on_resolved: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    # 32-char opaque token used in unsubscribe links
    unsubscribe_token: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )

    # ---- Proactive insights (all optional, default off) ----
    # Master toggle. When False, no insight is ever surfaced, regardless
    # of the per-signal flags below.
    insights_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    insights_dormant_revival: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    insights_contradiction: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    insights_decision_drift: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    insights_rhythm: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class TopicSynthesis(Base):
    """Cached AI synthesis for a concept node.

    One row per (user_id, concept_id). Regenerated when the input set
    changes (tracked via content_hash) or when the caller forces a refresh.
    """
    __tablename__ = "topic_syntheses"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    concept_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    source_node_ids: Mapped[list] = mapped_column(JSON, default=list)
    content_hash: Mapped[str] = mapped_column(String, nullable=False)

    headline: Mapped[str] = mapped_column(Text, nullable=False, default="")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)

    model: Mapped[str] = mapped_column(String, nullable=False, default="")
    locale: Mapped[str] = mapped_column(String, nullable=False, default="en")
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    stale: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    __table_args__ = (
        UniqueConstraint(
            "user_id", "concept_id", name="uq_topic_synthesis_user_concept"
        ),
    )

class SurfacedInsight(Base):
    """
    One row per insight we've surfaced to a user.

    Serves three purposes:
      1. Dedupe --- a unique (user_id, kind, dedupe_key) constraint means
         the same insight can't be re-fired.
      2. Rate limiting --- COUNT rows in the last 24h to enforce the
         daily cap.
      3. Audit / analytics --- dismissed_at / opened_at let us tune which
         signals are useful vs. noise.
    """
    __tablename__ = "surfaced_insights"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # "dormant_revival" | "contradiction" | "decision_drift" | "rhythm"
    kind: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    # Stable fingerprint of what triggered this --- e.g. "{new_id}:{old_id}"
    # for dormant revival. Used with the unique constraint below.
    dedupe_key: Mapped[str] = mapped_column(String(128), nullable=False)

    # The node that caused this (the new capture, or the decision)
    trigger_node_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), nullable=True, index=True
    )
    # Related nodes (JSON array of UUID strings)
    related_node_ids: Mapped[list] = mapped_column(JSON, default=list)

    # What we wrote to the bell (so we can render it from the row)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    click_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    fired_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    dismissed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    opened_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id", "kind", "dedupe_key",
            name="uq_surfaced_insight_dedupe",
        ),
    )


class InsightCheck(Base):
    """
    Marker: "this node's contradiction check has already run."

    Prevents the background worker from re-evaluating the same capture
    every cycle. We don't need the result --- only the fact that we looked.
    """
    __tablename__ = "insight_checks"

    node_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("nodes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

class EmbeddingQueue(Base):
    """
    Nodes waiting to be embedded.

    Embedding is enqueued on the capture path so the request stays fast
    (Voyage's rate limit is ~3 req/sec; a capture can create 1 thought +
    up to 6 concepts, so inline embedding would add 2-3s to every capture).

    The SLA worker drains this queue every cycle. Rows are deleted once
    the embedding has been written.
    """
    __tablename__ = "embedding_queue"

    node_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("nodes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        nullable=False,
        index=True,
    )
    queued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True,
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

class EdgeCheck(Base):
    """
    Marker: "this node has had edge generation run."

    Same pattern as InsightCheck --- the worker finds recent nodes without
    a marker here, runs the edge-generation pass, and writes the marker
    only if the pass completed (not if it was skipped due to missing
    embedding).

    Deleting a row from here forces a re-run on the next worker cycle.
    """
    __tablename__ = "edge_checks"

    node_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("nodes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    edges_created: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

class ConceptAlias(Base):
    """
    Audit trail for concept canonicalization.

    Every time we detect that a new concept should be merged into an
    existing canonical concept, we record the decision here. This keeps
    the merge reversible: if a merge was wrong, we can look up the
    alias row, revert `canonical_concept_id` on the node, and drop
    the row.
    """
    __tablename__ = "concept_aliases"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # The node that got aliased
    alias_node_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # The canonical node it was merged into
    canonical_node_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # How we decided: "name_exact" | "name_normalized" | "embedding" | "definition"
    match_strategy: Mapped[str] = mapped_column(String(32), nullable=False)
    # Similarity score for embedding/definition matches (0.0-1.0)
    similarity: Mapped[float] = mapped_column(Float, default=0.0)
    # Short human-readable reason (from the algorithm, not the LLM)
    note: Mapped[str] = mapped_column(String(255), default="")
    # Tier 8 -- graph health.
    #   accepted  -- merge is live (Tier 1 auto, or user approved)
    #   pending   -- Tier 3 match, waiting for user approval
    #   rejected  -- user declined, or undid an auto-merge
    # Existing rows default to 'accepted' (they were applied historically).
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="accepted", server_default="accepted"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


# =====================================================================
# Tier 4 -- agentic actions
# =====================================================================


class AgentAction(Base):
    """
    Audit log for every agent proposal.

    Lifecycle: pending -> applied | rejected | failed | undone

    The proposal column holds the structured plan (list of ops).
    The snapshot column holds the inverse (what to undo).
    """

    __tablename__ = "agent_actions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # "find_orphans" | "suggest_links" | "place_url" | "merge_concepts" | "reorganize"
    action_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    # Original user instruction, if any (e.g. "find orphan concepts")
    instruction: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The structured proposal
    proposal: Mapped[dict] = mapped_column("proposal", JSON, default=dict)
    # "pending" | "applied" | "rejected" | "failed" | "undone"
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending", server_default="pending"
    )
    # Result of apply() -- usually a summary like {"changes_applied": 4}
    result: Mapped[dict | None] = mapped_column("result", JSON, nullable=True)
    # Snapshot for undo -- describe what to reverse
    snapshot: Mapped[dict | None] = mapped_column("snapshot", JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    applied_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    undone_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
