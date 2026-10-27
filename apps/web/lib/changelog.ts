/**
 * Release history.
 *
 * Hand-authored. Each release is a chronological entry with:
 *   - stat chips (files / endpoints / migrations)
 *   - themed sections
 *   - tagged items (feat / fix / chore / breaking)
 *   - optional cross-links to /features#<section>
 *
 * When adding a new release, prepend to the array — the page renders
 * top-down so the newest appears first.
 */

export type ReleaseTag = "feat" | "fix" | "chore" | "breaking";

export type ReleaseItem = {
  tag?: ReleaseTag;
  text: string;
  /** Optional inline code (model name, endpoint, config key) */
  code?: string;
  /** Optional cross-link to another page (rendered at the end) */
  href?: string;
  /** Optional anchor text for the cross-link */
  linkText?: string;
};

export type ReleaseSection = {
  title: string;
  icon:
    | "Inbox"
    | "Brain"
    | "MessageSquare"
    | "Network"
    | "Sparkles"
    | "Shield"
    | "Server"
    | "BookOpen"
    | "Wand2"
    | "Layers"
    | "Activity"
    | "Mail";
  items: ReleaseItem[];
};

export type StatChip = {
  count: number;
  label: string;
};

export type Release = {
  version: string;
  date: string;
  title: string;
  tag?: string;
  summary: string;
  stats?: StatChip[];
  sections: ReleaseSection[];
  /** Only shown on the latest release */
  whatsNext?: string[];
};

export const RELEASES: Release[] = [
  {
    version: "v0.4",
    date: "2026-10-12",
    title: "External mind",
    tag: "Latest",
    summary:
      "The public face of Cortex. A complete hybrid landing page, a technical reference covering every subsystem, an anonymous contact path, and a full consent system that puts the user in charge of what leaves their device.",
    stats: [
      { count: 22, label: "new files" },
      { count: 4, label: "new endpoints" },
      { count: 1, label: "migration" },
      { count: 3, label: "new models" },
    ],
    sections: [
      {
        title: "Landing page",
        icon: "Sparkles",
        items: [
          {
            tag: "feat",
            text: "10 hybrid sections — hero with live Q&A demo, three-stage pipeline preview, capability clusters, 8-card feature grid, interactive graph, trust band, personas, FAQ, first-capture demo, footer",
          },
          {
            tag: "feat",
            text: "Interactive knowledge graph — hover nodes for tooltips, click for a concept inspector with connected concepts",
          },
          {
            tag: "feat",
            text: "Rotating first-capture preview at the CTA — types itself, extracts concepts, shows tags, loops",
          },
          {
            tag: "feat",
            text: "Live Ask demo in the hero — real streaming replies with citations",
          },
          {
            tag: "feat",
            text: "Eight persona cards with three-step workflows",
          },
          {
            tag: "chore",
            text: "Matchless motion: every animation is CSS keyframes, no framer-motion, reduced-motion respected",
          },
        ],
      },
      {
        title: "Features reference",
        icon: "BookOpen",
        items: [
          {
            tag: "feat",
            text: "21-section technical reference at",
            code: "/features",
            href: "/features",
            linkText: "Open it",
          },
          {
            tag: "feat",
            text: "Covers architecture, every model in use, capture pipelines, extraction, memory, reasoning, identity, insights, reflection, decisions, learning, agentic actions, graph health, help & support, privacy, data model, and honest limits",
          },
          {
            tag: "feat",
            text: "Sticky table of contents with scroll-aware highlighting",
          },
          {
            tag: "feat",
            text: "Real model names throughout —",
            code: "openai/gpt-oss-120b · gemini-embedding-001 · gemini-3.8-flash · whisper-large-v3-turbo",
          },
        ],
      },
      {
        title: "Contact & support",
        icon: "Mail",
        items: [
          {
            tag: "feat",
            text: "Public contact page at",
            code: "/contact",
          },
          {
            tag: "feat",
            text: "Anonymous submissions — no account required",
          },
          {
            tag: "feat",
            text: "Rate-limited to 5 messages per hour per IP with a honeypot field for spam",
          },
          {
            tag: "feat",
            text: "Optional reply-to email; otherwise tickets are one-way",
          },
          {
            tag: "feat",
            text: "New backend endpoint",
            code: "POST /help/feedback/public",
          },
          {
            tag: "fix",
            text: "Notification guards — anonymous tickets no longer crash the notification path",
          },
        ],
      },
      {
        title: "Privacy & consent",
        icon: "Shield",
        items: [
          {
            tag: "feat",
            text: "Five-category consent — Essential (locked) · Personalization · Performance · AI Processing · Marketing",
          },
          {
            tag: "feat",
            text: "Banner on first visit, full preferences modal, dedicated cookie policy page",
          },
          {
            tag: "feat",
            text: "Opt-out of AI processing actually gates LLM calls — captures save as raw text",
          },
          {
            tag: "feat",
            text: "Six gated operations:",
            code: "extract_concepts · classify_capture · extract_image_text · detect_key_moments · embed_one · update_user_model",
          },
          {
            tag: "feat",
            text: "Consent attached to every API request via",
            code: "X-AI-Consent",
          },
          {
            tag: "feat",
            text: "Deny button — same visual weight as Accept all, GDPR-compliant",
          },
        ],
      },
      {
        title: "Image annotation",
        icon: "Wand2",
        items: [
          {
            tag: "feat",
            text: "Draw boxes, arrows, and text on any image before or after capture",
          },
          {
            tag: "feat",
            text: "Annotations guide Gemini Vision — extraction focuses on what you marked",
          },
          {
            tag: "feat",
            text: "Auth-gated image storage outside the public static mount",
          },
          {
            tag: "feat",
            text: "Post-capture editing from the source panel",
          },
        ],
      },
      {
        title: "Infrastructure",
        icon: "Server",
        items: [
          {
            tag: "feat",
            text: "Neo4j client hardened for Aura Free cold-start with 30-attempt retry and pre-flight probes",
          },
          {
            tag: "feat",
            text: "Rate limiting for anonymous endpoints via shared Redis / in-memory counter",
          },
          {
            tag: "chore",
            text: "Middleware whitelist for public routes —",
            code: "/features · /contact · /changelog",
          },
          {
            tag: "fix",
            text: "CORS allowlist now explicitly lists custom headers (Starlette refuses wildcard with credentials)",
          },
        ],
      },
    ],
    whatsNext: [
      "Comparison table on the landing page — Cortex vs. Notion / Obsidian / Apple Notes",
      "RSS feed for this changelog",
      "Admin-editable releases instead of hand-authored data",
      "Stripe billing for a paid tier (free stays free)",
    ],
  },
  {
    version: "v0.3",
    date: "2026-10-10",
    title: "Multimodal",
    tag: "Tier 5",
    summary:
      "Cortex learns to read images, hear voices, and watch videos. Every input type now extracts structured concepts through the same pipeline.",
    stats: [
      { count: 6, label: "new files" },
      { count: 2, label: "new endpoints" },
      { count: 5, label: "capture types" },
    ],
    sections: [
      {
        title: "Capture types",
        icon: "Inbox",
        items: [
          {
            tag: "feat",
            text: "Image — Gemini Vision returns structured JSON: description, visible text, objects, layout, entities, scene type",
          },
          {
            tag: "feat",
            text: "Voice — Groq Whisper transcribes with timestamped segments, then classifies the capture kind",
          },
          {
            tag: "feat",
            text: "Video — ffmpeg strips audio, Whisper transcribes, LLM picks key moments",
          },
          {
            tag: "feat",
            text: "Annotated images — user-drawn boxes and labels guide extraction",
          },
        ],
      },
      {
        title: "Capture classification",
        icon: "Sparkles",
        items: [
          {
            tag: "feat",
            text: "Every voice / image / video capture runs through",
            code: "classify_capture()",
          },
          {
            tag: "feat",
            text: "Kinds: idea · task · question · reflection · note · reference · decision · other",
          },
          {
            tag: "feat",
            text: "Short inputs skip the LLM — no cost for",
            code: "remind me at 3pm",
          },
        ],
      },
      {
        title: "Video player",
        icon: "Activity",
        items: [
          {
            tag: "feat",
            text: "Interactive transcript with timestamps you can click to seek",
          },
          {
            tag: "feat",
            text: "Key moments as chips — topic shifts, decisions, questions, actions, quotes",
          },
          {
            tag: "feat",
            text: "Auth-gated video storage at",
            code: "/files/video/<node_id>",
          },
        ],
      },
      {
        title: "Retrieval",
        icon: "Network",
        items: [
          {
            tag: "feat",
            text: "Search API now returns",
            code: "meta",
            href: "/features#reasoning",
            linkText: "how it works",
          },
          {
            tag: "fix",
            text: "Fixed latent bug in search SQL — column is",
            code: "metadata",
            href: "/features#data-model",
            linkText: "data model",
          },
        ],
      },
    ],
  },
  {
    version: "v0.2",
    date: "2026-10-09",
    title: "Cognition",
    tag: "Tiers 2, 4, 8",
    summary:
      "Cortex learns to remember across conversations, act on the graph safely, and monitor its own health. The system becomes a long-term thinking partner.",
    stats: [
      { count: 3, label: "new tables" },
      { count: 5, label: "AI agents" },
      { count: 4, label: "new endpoints" },
    ],
    sections: [
      {
        title: "Long-term memory",
        icon: "Brain",
        items: [
          {
            tag: "feat",
            text: "Rolling summaries — condensed history per conversation",
          },
          {
            tag: "feat",
            text: "Cross-conversation recall — semantically similar past messages and captures",
          },
          {
            tag: "feat",
            text: "User model — persistent six-field profile derived from your data",
          },
          {
            tag: "feat",
            text: "Three-layer prompt stack:",
            code: "summary → recall → profile → verbatim",
            href: "/features#memory",
            linkText: "details",
          },
        ],
      },
      {
        title: "Agentic actions",
        icon: "Wand2",
        items: [
          {
            tag: "feat",
            text: "Five agents:",
            code: "find_orphans · suggest_links · place_url · merge_concepts · reorganize",
          },
          {
            tag: "feat",
            text: "Five-layer pipeline: intent → plan → validate → approve → execute",
          },
          {
            tag: "feat",
            text: "The LLM never mutates the graph directly — every change is a Proposal",
          },
          {
            tag: "feat",
            text: "Snapshot-based undo, atomic and reversible",
          },
          {
            tag: "feat",
            text: "Chat tool-use loop with proposal frames streamed over SSE",
          },
          {
            tag: "chore",
            text: "Budget guards against the free tier — capped at",
            code: "AGENT_DAILY_RUNS_CAP",
          },
        ],
      },
      {
        title: "Graph health",
        icon: "Activity",
        items: [
          {
            tag: "feat",
            text: "Orphan detection, stale concepts (60-day rule), pending merges",
          },
          {
            tag: "feat",
            text: "Dashboard at",
            code: "/memory/health",
          },
          {
            tag: "feat",
            text: "Pure read — no LLM calls, no writes",
          },
        ],
      },
      {
        title: "Conversations",
        icon: "MessageSquare",
        items: [
          {
            tag: "feat",
            text: "Persistent conversation history with pinning and cleanup",
          },
          {
            tag: "feat",
            text: "Streaming replies with source citations",
          },
          {
            tag: "chore",
            text: "Empty conversations cleaned up silently after 1 minute",
          },
        ],
      },
    ],
  },
  {
    version: "v0.1",
    date: "2026-09-01",
    title: "Origin",
    tag: "Initial release",
    summary:
      "The first working version. A single-user personal cognition system: capture thoughts, extract concepts, build a knowledge graph, and reason with it.",
    sections: [
      {
        title: "Capture",
        icon: "Inbox",
        items: [
          {
            tag: "feat",
            text: "Text captures with concept extraction via Groq",
          },
          {
            tag: "feat",
            text: "URL captures with article extraction",
          },
          {
            tag: "feat",
            text: "File uploads —",
            code: "PDF · DOCX · XLSX · CSV · JSON",
          },
        ],
      },
      {
        title: "Reasoning",
        icon: "MessageSquare",
        items: [
          {
            tag: "feat",
            text: "Chat with streaming replies and source citations",
          },
          {
            tag: "feat",
            text: "Multi-hop graph reasoning — walks the knowledge graph instead of flat text",
            href: "/features#reasoning",
            linkText: "how it works",
          },
          {
            tag: "feat",
            text: "Semantic search over every capture",
          },
        ],
      },
      {
        title: "Reflection & decisions",
        icon: "Sparkles",
        items: [
          {
            tag: "feat",
            text: "Decision log with analysis, expected outcome, actual outcome, and lesson extraction",
          },
          {
            tag: "feat",
            text: "Weekly reflection reports on patterns and drift",
          },
          {
            tag: "feat",
            text: "Learning goals decomposed into phased plans with milestones",
          },
        ],
      },
      {
        title: "Identity",
        icon: "Brain",
        items: [
          {
            tag: "feat",
            text: "A model of who you are — values, patterns, strengths, blind spots, growth areas",
          },
          {
            tag: "feat",
            text: "Built from your captures, decisions, and reflections — evidence-cited",
            href: "/features#identity",
            linkText: "how it works",
          },
          {
            tag: "feat",
            text: "Snapshotted for tracking growth over time",
          },
        ],
      },
      {
        title: "Support",
        icon: "Mail",
        items: [
          {
            tag: "feat",
            text: "Help assistant over product documentation",
          },
          {
            tag: "feat",
            text: "Feedback tickets with AI triage",
          },
          {
            tag: "feat",
            text: "SLA policies, email notifications, and webhooks",
          },
        ],
      },
      {
        title: "Infrastructure",
        icon: "Server",
        items: [
          {
            tag: "feat",
            text: "FastAPI + Postgres + Neo4j",
          },
          {
            tag: "feat",
            text: "Groq for all text LLM calls",
          },
          {
            tag: "feat",
            text: "Google Gemini for embeddings",
          },
          {
            tag: "feat",
            text: "Clerk for authentication",
          },
          {
            tag: "feat",
            text: "Six-locale UI: English · Spanish · French · German · Arabic · Swahili",
          },
        ],
      },
    ],
  },
];

/** Anchor helper — turns "v0.4" into "v0-4" for URL fragments */
export function releaseAnchor(r: Release): string {
  return r.version.replace(/\./g, "-");
}

/** Tag colors for badges */
export const TAG_STYLES: Record<ReleaseTag, string> = {
  feat: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400",
  fix: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  chore: "border-sky-500/30 bg-sky-500/10 text-sky-500 dark:text-sky-400",
  breaking: "border-destructive/40 bg-destructive/10 text-destructive",
};

export const TAG_LABELS: Record<ReleaseTag, string> = {
  feat: "feat",
  fix: "fix",
  chore: "chore",
  breaking: "breaking",
};
