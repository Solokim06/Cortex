"""
Application settings loaded from the monorepo root .env file.
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ---------------------------------------------------------------- core
    database_url: str = "postgresql+asyncpg://cortex:cortex@localhost:5432/cortex"
    neo4j_uri: str = ""
    neo4j_user: str = ""
    neo4j_password: str = ""
    neo4j_database: str = "01f28d19"
    redis_url: str = "redis://localhost:6379"

    # ---------------------------------------------------------------- LLM
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"

    # ---------------------------------------------------------------- summaries
    # Tier 2 rolling summary ??--- condenses old turns when a conversation
    # grows past a threshold, so long chats keep their context.
    summary_enabled: bool = True
    # Total messages in a conversation before we first summarize.
    # With MAX_HISTORY_TURNS=10 (20 messages kept verbatim), 30 means
    # we summarize the oldest 10 messages once the conversation crosses
    # 30 total.
    summary_trigger_messages: int = 30
    # Approximate target length of the summary text, in tokens (1 token
    # is roughly 4 characters ??--- matches load_history's heuristic).
    summary_target_tokens: int = 400
    # Minimum number of trailing messages to keep verbatim after
    # summarization. Prevents the summary from eating the entire
    # history if the conversation is very short.
    summary_min_messages_to_keep: int = 20

    # ---------------------------------------------------------------- recall
    # Tier 2 cross-conversation recall ??--- searches past messages + nodes
    # for semantically similar content and injects the top hits as
    # context into the prompt.
    recall_enabled: bool = True
    recall_top_k: int = 3
    recall_similarity_threshold: float = 0.55
    recall_max_context_tokens: int = 600

    # ---------------------------------------------------------------- user model
    user_model_enabled: bool = True
    user_model_update_every: int = 20
    user_model_max_context_tokens: int = 400
    user_model_messages_window: int = 20
    user_model_captures_window: int = 10

    # ---------------------------------------------------------------- graph health
    # Tier 8 -- proactive graph health.
    # Stale concept detection: a canonical concept is marked stale when
    # it is older than this many days and has had no edge or synthesis
    # activity in the same window.
    stale_threshold_days: int = 60
    # Default mute period when a user dismisses a stale flag.
    stale_dismiss_default_days: int = 90

    # ---------------------------------------------------------------- capture kind
    # Tier 5 -- multimodal capture classification. After a voice
    # transcript or image extraction, we ask the LLM to label the
    # capture as idea / task / question / reflection / other.
    capture_classify_enabled: bool = True
    # Skip the LLM call for short captures below this word count --
    # they are almost always notes.
    capture_classify_min_words: int = 8
    # Token cap for the classification call.
    capture_classify_max_tokens: int = 400
    # When True, image captures also get meta.image_analysis.scene_type
    capture_classify_image_scene_type: bool = True

    # ---------- Tier 5.3 -- Video key moments ----------
    # Request timestamped segments from Whisper
    video_transcribe_timestamps: bool = True
    # LLM pass to identify key moments (topic shifts, decisions, questions)
    video_key_moments_enabled: bool = True
    # Skip the LLM pass for transcripts below this word count
    video_key_moments_min_words: int = 200
    # LLM response budget
    video_key_moments_max_tokens: int = 1500
    # Where to store uploaded video files (relative to apps/api)
    video_storage_dir: str = "private_videos"
    # Where to store uploaded image files (relative to apps/api)
    image_storage_dir: str = "private_images"
    # Reject videos longer than this (seconds). 1 hour default.
    video_max_duration_seconds: int = 3600

    # ---------------------------------------------------------------- agentic actions
    # Tier 4 -- agentic actions. Agents propose graph mutations; users
    # approve before they apply. All runs are user-initiated and budgeted
    # to stay safe on the free Groq tier.
    agent_enabled: bool = True
    # Max LLM tool calls per chat turn (prevents runaway loops).
    agent_max_tool_calls: int = 3
    # How long a proposal stays valid before it expires.
    agent_proposal_ttl_minutes: int = 60
    # Per-user daily cap on agent runs (plan() invocations).
    agent_daily_runs_cap: int = 50

    # ---------------------------------------------------------------- suggest_links
    # Phase 4.2 -- the suggest_links agent proposes edges between
    # semantically related concepts. It is manual-only by default.
    # Max edges proposed in a single run.
    suggest_links_max_edges: int = 3
    # Max neighbors evaluated per target concept.
    suggest_links_max_candidates: int = 5
    # Embedding similarity floor -- candidates below this are dropped
    # before the LLM sees them.
    suggest_links_similarity_floor: float = 0.70
    # Minimum LLM confidence to include a proposed edge.
    suggest_links_min_confidence: float = 0.60
    # Sweep mode: how many low-degree concepts to consider per run.
    suggest_links_sweep_targets: int = 5
    # Sweep mode: concepts with degree at or above this are skipped.
    suggest_links_max_degree: int = 3

    # ---------------------------------------------------------------- reorganize
    # Phase 4.4 -- the reorganize agent composes suggest_links and
    # merge_concepts. This caps the total number of combined changes
    # so a single reorganize run does not overwhelm the review UI.
    reorganize_max_changes: int = 8

    anthropic_api_key: str = ""
    openai_api_key: str = ""

    # ---------------------------------------------------------------- embeddings
    gemini_api_key: str = ""
    embedding_provider: str = "gemini"
    embedding_model: str = "gemini-embedding-001"
    embedding_dim: int = 768

    voyage_api_key: str = ""

    # ---------------------------------------------------------------- app
    api_url: str = "http://localhost:8000"
    jwt_secret: str = "dev-secret"

    # ---------------------------------------------------------------- clerk
    clerk_issuer: str = ""
    clerk_jwks_url: str = ""
    clerk_secret_key: str = ""
    web_url: str = "http://localhost:3000"

    # ================================================================
    # ADMIN / TIER 3
    # ================================================================

    admin_emails: str = ""
    agent_emails: str = ""

    sla_urgent_first_min: int = 60
    sla_urgent_resolve_min: int = 240
    sla_high_first_min: int = 240
    sla_high_resolve_min: int = 1440
    sla_normal_first_min: int = 1440
    sla_normal_resolve_min: int = 4320
    sla_low_first_min: int = 4320
    sla_low_resolve_min: int = 10080

    webhook_urls: str = ""
    webhook_retry_base_seconds: int = 30
    webhook_max_attempts: int = 3
    webhook_signing_secret: str = ""

    impersonation_ttl_minutes: int = 15

    # ================================================================
    # RATE LIMITING
    # ================================================================

    help_rate_limit_max: int = 20
    # ---- AI ticket pipeline -------------------------------------------------
    # When a user files a ticket, we run a background pipeline that:
    #   1. Classifies category + priority with an LLM
    #   2. Overwrites ticket.category / ticket.priority if confidence is high
    #   3. Optionally auto-sends a first reply (see auto_reply_mode)
    auto_triage_enabled: bool = True
    # "off"   ??--- no auto-reply (triage classification still runs)
    # "draft" ??--- save the AI reply as a draft for admin approval
    # "auto"  ??--- auto-send if category=question AND confidence >= threshold
    auto_reply_mode: str = "auto"
    # Minimum LLM confidence (0.0??---1.0) required to auto-send a reply
    auto_reply_confidence_threshold: float = 0.8
    # Minimum confidence to overwrite category / priority on the ticket
    auto_triage_apply_threshold: float = 0.7
    # Minimum seconds between re-triages triggered by user replies.
    # Prevents burst LLM calls when the user sends multiple messages.
    auto_triage_debounce_seconds: int = 30
    # Cascade intent classifier ??--- LLM fallback only fires when
    # the rules-based check is ambiguous.
    intent_classifier_enabled: bool = True
    intent_classifier_model: str = "openai/gpt-oss-120b"


    help_rate_limit_window_seconds: int = 300
    help_rate_limit_admin_bypass: bool = True
    rate_limit_key_prefix: str = "cortex:rl"

    # ================================================================
    # EMAIL
    # ================================================================

    # Master switch ??--- set to false to fully disable outbound emails.
    email_enabled: bool = True

    # Sender identity. "Cortex <onboarding@resend.dev>" works with
    # Resend's sandbox without verifying a domain. For production,
    # verify your domain in Resend and change this to
    # "Cortex <notifications@yourdomain.com>".
    email_from: str = "Cortex <onboarding@resend.dev>"
    # Where replies go, if different from `email_from`. Empty = same.
    email_reply_to: str = ""

    # Inbound email (reply-by-email)
    inbound_email_domain: str = "inbound.cortex.local"
    inbound_email_webhook_secret: str | None = None

    # --- Resend (primary) ---
    # If set, Resend is used. Get one at https://resend.com/api-keys
    resend_api_key: str = ""

    # --- SMTP (fallback) ---
    # Only used if RESEND_API_KEY is empty AND smtp_host is set.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True

    # --- Retry behavior ---
    email_max_attempts: int = 3
    email_retry_base_seconds: int = 30

    # ---------------------------------------------------------------- helpers

    # --- role bootstrapping ---
    @property
    def admin_email_set(self) -> set[str]:
        return {
            e.strip().lower()
            for e in self.admin_emails.split(",")
            if e.strip()
        }

    @property
    def agent_email_set(self) -> set[str]:
        return {
            e.strip().lower()
            for e in self.agent_emails.split(",")
            if e.strip()
        }

    # --- webhooks ---
    @property
    def webhook_url_list(self) -> list[str]:
        return [u.strip() for u in self.webhook_urls.split(",") if u.strip()]

    # --- SLA ---
    def sla_defaults(self) -> dict[str, tuple[int, int]]:
        return {
            "urgent": (self.sla_urgent_first_min, self.sla_urgent_resolve_min),
            "high":   (self.sla_high_first_min,   self.sla_high_resolve_min),
            "normal": (self.sla_normal_first_min, self.sla_normal_resolve_min),
            "low":    (self.sla_low_first_min,    self.sla_low_resolve_min),
        }

    # --- email ---
    @property
    def email_provider(self) -> str:
        """
        Which backend will be used, in priority order:
          - "resend"  if RESEND_API_KEY is set
          - "smtp"    if SMTP_HOST is set
          - "console" otherwise (dev / disabled)
        """
        if not self.email_enabled:
            return "disabled"
        if self.resend_api_key.strip():
            return "resend"
        if self.smtp_host.strip():
            return "smtp"
        return "console"

    @property
    def email_configured(self) -> bool:
        """True when a real provider is wired up (not just console)."""
        return self.email_provider in ("resend", "smtp")

    @property
    def email_from_address(self) -> str:
        """
        Extract just the email address from `EMAIL_FROM`.

        Accepts:
          "Cortex <notifications@x.com>"  ??--- "notifications@x.com"
          "notifications@x.com"           ??--- "notifications@x.com"
        """
        raw = self.email_from.strip()
        if "<" in raw and ">" in raw:
            return raw[raw.index("<") + 1 : raw.index(">")].strip()
        return raw

    @property
    def email_from_name(self) -> str:
        """Extract just the display name from `EMAIL_FROM`."""
        raw = self.email_from.strip()
        if "<" in raw:
            return raw[: raw.index("<")].strip().strip('"')
        return "Cortex"


def get_settings() -> Settings:
    """
    Always construct a fresh Settings object.

    We used to @lru_cache this, which meant any `.env` edit was silently
    ignored by long-running processes (uvicorn holds the first-read
    Settings forever). The cost of re-reading .env on every call is
    negligible ??--- Settings has no network I/O.
    """
    return Settings()


# Kept for backwards compatibility with code that imports `settings`.
# Do NOT rely on this being fresh ??--- prefer get_settings() in hot paths.
settings = get_settings()

# When True, image captures also get meta.image_analysis.scene_type
