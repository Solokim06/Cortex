import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Toc, type TocItem } from "@/components/features/Toc";
import {
  Section,
  RefTable,
  RefCode,
  RefKV,
} from "@/components/features/Reference";

export const metadata: Metadata = {
  title: "Features — Cortex",
  description:
    "A technical reference: how Cortex works, which models it uses, and what each subsystem does.",
};

// ---------------------------------------------------------------------------
// Table of contents
// ---------------------------------------------------------------------------

const TOC: TocItem[] = [
  { id: "shell", number: "1", label: "The app shell" },
  { id: "home", number: "2", label: "Home" },
  { id: "chat", number: "3", label: "Chat" },
  { id: "settings", number: "4", label: "Settings" },
  { id: "architecture", number: "5", label: "Architecture" },
  { id: "providers", number: "6", label: "Models & providers" },
  { id: "capture", number: "7", label: "Capture" },
  { id: "extraction", number: "8", label: "Extraction" },
  { id: "memory", number: "9", label: "Memory" },
  { id: "reasoning", number: "10", label: "Reasoning" },
  { id: "identity", number: "11", label: "Identity" },
  { id: "insights", number: "12", label: "Proactive insights" },
  { id: "reflection", number: "13", label: "Reflection" },
  { id: "decisions", number: "14", label: "Decisions" },
  { id: "learning", number: "15", label: "Learning" },
  { id: "agents", number: "16", label: "Agentic actions" },
  { id: "graph-health", number: "17", label: "Graph health" },
  { id: "support", number: "18", label: "Help & support" },
  { id: "privacy", number: "19", label: "Privacy & consent" },
  { id: "data-model", number: "20", label: "Data model" },
  { id: "limits", number: "21", label: "What it doesn't do" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 pb-20">
      {/* Hero */}
      <header className="max-w-3xl mb-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 pl-2 pr-3 py-1 mb-6">
          <span className="relative flex w-1.5 h-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 animate-ping" />
            <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Technical reference
          </span>
        </div>

        <h1 className="text-[2rem] leading-[1.05] sm:text-5xl font-semibold tracking-tight sm:leading-[1]">
          What Cortex is, and how it works.
        </h1>

        <p className="mt-5 text-base text-muted-foreground leading-relaxed max-w-2xl">
          A complete reference of every subsystem, model, and pipeline.
          Written for engineers — no marketing, no abbreviations without
          definition.
        </p>
      </header>

      {/* Two-column layout: sticky TOC + content */}
      <div className="flex gap-10">
        <Toc items={TOC} />

        <div className="min-w-0 flex-1 max-w-3xl">
          <Section
            id="shell"
            number="1"
            title="The app shell"
            intro="Every signed-in page renders inside the same layout: a left sidebar, a top bar, and a global ⌘K command palette."
          >
            <RefCode>{`app/[locale]/(app)/layout.tsx
  └─ CommandPaletteProvider          ← global ⌘K
      ├─ KeyboardShortcuts           ← g h, g c, g m, ...
      ├─ Sidebar
      └─ Topbar + <main>{children}</main>`}</RefCode>

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              Sidebar navigation:
            </p>

            <RefTable
              compact
              headers={["Item", "Path", "Shortcut"]}
              rows={[
                ["Home", "/home", "g h"],
                ["Capture", "/capture", "g c"],
                ["Chat", "/chat", "g m"],
                ["Memory", "/memory", "g M"],
                ["Learning", "/learning", "g l"],
                ["Decisions", "/decisions", "g d"],
                ["Reflections", "/reflections", "g r"],
                ["Identity", "/identity", "g i"],
                ["Help & Feedback", "/help", "—"],
                ["Admin", "/admin", "—"],
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              The command palette (⌘K / Ctrl+K) provides:
            </p>

            <RefKV
              entries={[
                { label: "Quick actions", value: "New capture" },
                { label: "Navigation", value: "Every sidebar item, searchable" },
                { label: "Language switcher", value: "6 locales with cookie persistence" },
                { label: "Behavior", value: "Ignored while typing in inputs; toggles open/closed" },
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed">
              The sidebar also hosts the chat conversation list — pinned,
              today, yesterday, previous 7 days, previous 30 days, older.
              Empty conversations older than one minute are silently cleaned up.
            </p>
          </Section>

          <Section
            id="home"
            number="2"
            title="Home"
            intro="The daily entry point. Shows what you've been doing and where to pick up."
          >
            <RefTable
              headers={["Zone", "What it shows"]}
              rows={[
                [
                  "Greeting",
                  "Time-of-day greeting, weekly capture count, total node count",
                ],
                [
                  "Activity stats",
                  "Six tiles: captures this week, nodes in graph, active goals, decisions logged, lessons learned, concepts forming",
                ],
                [
                  "Quick capture",
                  "Inline textarea + attachment button + URL prompt. Same pipeline as /capture",
                ],
                [
                  "Identity banner",
                  "Shown until the first identity snapshot is built",
                ],
                [
                  "Today's focus",
                  "Active learning goal, or CTA to set one",
                ],
                [
                  "Recent captures",
                  "Latest 5 nodes with a link to Memory",
                ],
                [
                  "Decisions due",
                  "Decisions with a review_at date that has passed",
                ],
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              All home data is fetched via TanStack Query against a handful
              of read-only endpoints:
            </p>

            <RefCode>{`GET /capture/?limit=50           → recent + total
GET /learning/goals               → active goals
GET /decisions/                   → due for review
GET /reflection/?kind=lesson      → lessons learned
GET /identity/                    → snapshot + maturity`}</RefCode>
          </Section>

          <Section
            id="chat"
            number="3"
            title="Chat"
            intro="The conversational surface. Streams replies, walks the graph, and renders agent proposals inline."
          >
            <RefTable
              headers={["Zone", "What it does"]}
              rows={[
                [
                  "Conversation list",
                  "Grouped by pinned / today / yesterday / 7d / 30d / older. Empty conversations auto-cleaned.",
                ],
                [
                  "Message stream",
                  "Optimistic user bubbles, streamed assistant replies, sources rendered as chips",
                ],
                [
                  "Source panel",
                  "Right-side drawer showing the node behind any citation",
                ],
                [
                  "Inline proposals",
                  "When the LLM calls an agent tool, a ProposalCard renders below the reply with Apply / Dismiss",
                ],
                [
                  "Input bar",
                  "Text, attachments, voice recording, agent selector, Stop-while-streaming",
                ],
                [
                  "Feedback",
                  "Send any message to support as a ticket",
                ],
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              Streaming protocol — the reply comes as Server-Sent Events:
            </p>

            <RefCode>{`POST /chat/conversations/{id}/messages   (SSE)
  → event: token       { "text": "..." }
  → event: proposal    { "kind": "find_orphans", "changes": [...] }
  → event: sources     { "nodes_used": 4, "edges": [...] }
  → event: done        { "message_id": "..." }`}</RefCode>

            <RefKV
              entries={[
                { label: "Agent selector", value: "null (chat) · find_orphans · suggest_links · place_url · merge_concepts · reorganize" },
                { label: "Attachments", value: "Any file — routed through /chat/attach" },
                { label: "Voice input", value: "MediaRecorder → /voice/transcribe → text" },
                { label: "Message persistence", value: "chat_messages with sources[] and edges[] JSON" },
              ]}
            />
          </Section>

          <Section
            id="settings"
            number="4"
            title="Settings"
            intro="A single modal with eight panels. Every user-facing preference lives here."
          >
            <RefTable
              headers={["Panel", "What it controls"]}
              rows={[
                ["General", "Theme, density, default landing page, time format, week start"],
                ["Agent", "Per-kind auto-apply toggles for the five agents"],
                ["Extension", "Extension connection status, API token minting"],
                ["Account", "Email, name, sign-out, delete account"],
                ["Notifications", "Email opt-ins, per-signal insight toggles"],
                ["Data", "Full JSON export, delete all chats, delete account"],
                ["Privacy", "Cookie consent (five categories), reset, cookie policy link"],
                ["About", "Version, changelog, links"],
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              Every panel is a self-contained component in{" "}
              <code className="text-primary">components/settings/panels/</code>. The
              modal renders each lazily as the user switches tabs.
            </p>

            <RefKV
              entries={[
                { label: "Trigger", value: "⌘, or the Settings button in the sidebar footer" },
                { label: "Also", value: "The Privacy panel is the second way to reopen the cookie consent modal" },
                { label: "Storage", value: "Most settings in user_preferences; consent also in a first-party cookie" },
              ]}
            />
          </Section>

          <Section
            id="architecture"
            number="5"
            title="Architecture at a glance"
            intro="Cortex is three clients, one backend, two databases, and two AI providers."
          >
            <RefTable
              headers={["Layer", "What it is"]}
              rows={[
                [
                  "Web",
                  "Next.js 16 app router, React 19, Tailwind 4, Clerk auth. Two route groups: (public) marketing, (app) product.",
                ],
                [
                  "Extension",
                  "Chrome MV3 with popup, options page, side panel, and background worker. Shares the same API as the web app.",
                ],
                [
                  "API",
                  "FastAPI on Python 3.12. 18 routers, 66 services, 32 migrations.",
                ],
                [
                  "Postgres",
                  "Supabase. 30+ tables. Authoritative — every fact lives here first.",
                ],
                [
                  "Neo4j",
                  "Aura Free. A mirror of the graph. Only nodes and edges — content is truncated to 1000 chars. Used for multi-hop traversal.",
                ],
                [
                  "Groq",
                  "Every text LLM call. Model: openai/gpt-oss-120b.",
                ],
                [
                  "Google Gemini",
                  "Vision analysis and embeddings. Models: gemini-3.8-flash and gemini-embedding-001.",
                ],
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              The request flow for a typical capture:
            </p>

            <RefCode>{`Client (web or extension)
  │  POST /capture/text   (Bearer token + X-AI-Consent header)
  ▼
FastAPI router
  │  auth deps → user → DB session
  ▼
capture_text()
  │  ├─ Node insert (Postgres)     ← authoritative
  │  ├─ extract_concepts()         ← Groq LLM, JSON mode
  │  ├─ canonicalization           ← merge into existing concepts
  │  ├─ create edges (Postgres)
  │  └─ mirror to Neo4j            ← best-effort, retries on failure
  ▼
Response: node_id + summary + concepts[]`}</RefCode>

            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Postgres is always authoritative. Neo4j is a write-through mirror — if it&rsquo;s
              down, captures still succeed and a background job backfills the graph later.
            </p>

            <RefKV
              entries={[
                { label: "Neo4j client", value: "Fresh driver per call (no singleton). 30s max connection lifetime." },
                { label: "Retry policy", value: "30 attempts with jittered backoff on Aura Free cold-start DatabaseNotFound" },
                { label: "Content truncation", value: "Node content is truncated to 1000 chars in Neo4j for storage economy" },
                { label: "Write durability", value: "Postgres commit succeeds before Neo4j mirror is attempted" },
              ]}
            />
          </Section>

          <Section
            id="providers"
            number="6"
            title="Models & providers"
            intro="Every model Cortex uses, where it runs, and what it does."
          >
            <RefTable
              headers={["Provider", "Model", "Purpose", "Notes"]}
              rows={[
                [
                  "Groq",
                  <code key="1" className="text-primary">openai/gpt-oss-120b</code>,
                  "Concept extraction, classification, chat, agents, identity, insights, decision analysis, learning plans, triage",
                  "Every text LLM call. 30 req/min free tier.",
                ],
                [
                  "Groq",
                  <code key="2" className="text-primary">whisper-large-v3-turbo</code>,
                  "Audio + video transcription with timestamps",
                  "Returns verbose_json segments.",
                ],
                [
                  "Google Gemini",
                  <code key="3" className="text-primary">gemini-embedding-001</code>,
                  "768-dimensional vector embeddings",
                  "Task type RETRIEVAL_DOCUMENT, 8000-char input cap.",
                ],
                [
                  "Google Gemini",
                  <code key="4" className="text-primary">gemini-3.8-flash</code>,
                  "Image + video frame understanding",
                  "Structured JSON output. Retried once on 5xx.",
                ],
                [
                  "Voyage AI",
                  <code key="5" className="text-primary">voyage-3-lite</code>,
                  "Embedding fallback",
                  "Dormant — only used if embedding_provider=voyage.",
                ],
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              Rate limits and retry behavior:
            </p>

            <RefKV
              entries={[
                { label: "Groq rate limit", value: "~30 requests/min on free tier. Enforced by AGENT_DAILY_RUNS_CAP + budget guard." },
                { label: "Gemini rate limit", value: "Exponential backoff on 429 (2^n seconds, up to 3 retries)." },
                { label: "Gemini 5xx retry", value: "One retry after 3s on any 5xx (typically overloaded 503)." },
                { label: "Whisper limit", value: "25 MB max file per request. Longer videos raise a clear error." },
                { label: "Embedding input cap", value: "8000 characters. Longer text is truncated silently." },
                { label: "Groq tool calls", value: "Capped at AGENT_MAX_TOOL_CALLS per turn (default 3)." },
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed">
              All providers are called via JSON mode where structured output is required
              — the response is parsed and validated before use. Malformed JSON returns a
              safe fallback rather than raising.
            </p>
          </Section>

          <Section
            id="capture"
            number="7"
            title="Capture"
            intro="Six input types. Every capture becomes a node in the graph, and goes through the same extraction pipeline."
          >
            <RefTable
              headers={["Input", "Pipeline", "Output"]}
              rows={[
                [
                  "Text",
                  "Direct → extract_concepts()",
                  "Node + concepts + edges",
                ],
                [
                  "URL",
                  "httpx fetch → readability → extract_concepts()",
                  "Article node + OG metadata + concepts",
                ],
                [
                  "File",
                  "PDF/DOCX/XLSX/CSV/JSON parse → extract_concepts()",
                  "Content node + concepts",
                ],
                [
                  "Voice",
                  "Groq Whisper → transcribe_and_capture() → classify_capture()",
                  "Transcript + segments + capture_kind",
                ],
                [
                  "Image",
                  "Gemini Vision → structured JSON → extract_concepts()",
                  "Description + objects + visible_text + capture_kind",
                ],
                [
                  "Video",
                  "ffmpeg audio strip → Whisper → detect_key_moments()",
                  "Transcript + key_moments[] + capture_kind",
                ],
              ]}
            />

            <div className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              Every capture flow also runs through <code className="text-primary">classify_capture()</code>{" "}
              which tags the node with a <em>kind</em>: task, idea, question,
              reflection, note, reference, decision, or other.
            </div>

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-3">
              The full text-capture pipeline, file by file:
            </p>

            <RefCode>{`POST /capture/text                    → routers/capture.py
  capture_text(db, user_id, text)     → services/capture.py
    ├─ Node(type="thought")           → db/models.py
    ├─ _enqueue_embedding()           → services/memory.py
    └─ extract_concepts(text)         → services/extractor.py
         └─ call_llm_json(JSON mode)  → services/ai.py
              └─ Groq API             → openai/gpt-oss-120b

Then, for each returned concept:
  canonicalization.find_or_create_concept()
    ├─ Tier 1: normalized-name match
    ├─ Tier 2: embedding similarity ≥ 0.90
    └─ Tier 3: definition similarity ≥ 0.92
  → if alias: set canonical_concept_id
  → if new: create concept node

Finally:
  edges.create_edge(thought → concept)  → services/edges.py
  graph.client.create_graph_node()      → Neo4j mirror`}</RefCode>
          </Section>

          <Section
            id="extraction"
            number="8"
            title="Extraction & canonicalization"
            intro="Concepts emerge automatically. Duplicate concepts are collapsed via a three-tier matching strategy."
          >
            <RefKV
              entries={[
                { label: "Model", value: "openai/gpt-oss-120b (Groq, JSON mode)" },
                { label: "Input cap", value: "8000 characters" },
                { label: "Response", value: "JSON: {summary, concepts[], tags[]}" },
                { label: "Post-processing", value: "Naming normalization → canonicalization → edges" },
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Canonicalization runs in three tiers:
            </p>

            <RefTable
              compact
              headers={["Tier", "Method", "Threshold"]}
              rows={[
                ["1", "Normalized-name match", "exact (fast, deterministic)"],
                ["2", "Embedding similarity + shared token", "cosine ≥ 0.90"],
                ["3", "Definition similarity + name containment", "cosine ≥ 0.92"],
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Merges are recorded in <code className="text-primary">concept_aliases</code> and
              are fully reversible. Alias chains resolve transitively — if A → B → C,{" "}
              <code className="text-primary">resolve_canonical_id(A)</code> returns C.
            </p>

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              The extraction prompt asks for this JSON:
            </p>

            <RefCode>{`{
  "summary": "One-paragraph summary of the capture.",
  "concepts": [
    { "title": "Raft", "definition": "consensus algorithm..." },
    { "title": "fault tolerance", "definition": "..." }
  ],
  "tags": ["distributed systems", "consensus"]
}`}</RefCode>

            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Extraction failures are non-fatal: if the LLM returns invalid JSON or
              the API call fails, the capture still saves as a plain node with
              empty summary and no concepts. Nothing is lost.
            </p>

            <RefKV
              entries={[
                { label: "Model", value: "openai/gpt-oss-120b via Groq (JSON mode)" },
                { label: "Temperature", value: "0.1 — deterministic extraction" },
                { label: "Max tokens", value: "3000 (extraction), 400 (kind classification)" },
                { label: "Input truncation", value: "8000 chars" },
                { label: "Classify kinds", value: "idea · task · question · reflection · note · reference · decision · other" },
              ]}
            />
          </Section>

          <Section
            id="memory"
            number="9"
            title="Memory"
            intro="Three layers, stacked in the prompt from bottom to top."
          >
            <RefTable
              headers={["Layer", "Storage", "Injected as"]}
              rows={[
                [
                  "Rolling summary",
                  "chat_conversations.summary",
                  "Condensed history for the current conversation",
                ],
                [
                  "Cross-conversation recall",
                  "message_embeddings + nodes",
                  "Semantically similar past messages + captures",
                ],
                [
                  "User model",
                  "user_model.profile (6 fields)",
                  "Persistent profile: tone, interests, expertise, goals",
                ],
              ]}
            />

            <RefCode>{`[locale directive]
[USER PROFILE]          ← Tier 2 #3
[RECALL BLOCK]          ← Tier 2 #2
[ROLLING SUMMARY]       ← Tier 2 #1
[verbatim turns]        ← Tier 1
[current message]       ← user input`}</RefCode>

            <RefKV
              entries={[
                { label: "Summary trigger", value: "Every 30 messages (SUMMARY_TRIGGER_MESSAGES)" },
                { label: "Summary target", value: "~400 tokens (SUMMARY_TARGET_TOKENS)" },
                { label: "Verbatim keep", value: "20 most recent messages (SUMMARY_MIN_MESSAGES_TO_KEEP)" },
                { label: "Recall top-K", value: "3 messages (RECALL_TOP_K)" },
                { label: "Recall threshold", value: "cosine ≥ 0.55 (RECALL_SIMILARITY_THRESHOLD)" },
                { label: "Recall budget", value: "600 tokens (RECALL_MAX_CONTEXT_TOKENS)" },
                { label: "User model update", value: "Every 20 messages (USER_MODEL_UPDATE_EVERY)" },
                { label: "User model budget", value: "400 tokens" },
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Recall never breaks chat: if embedding fails, the recall block is
              skipped silently. The chat still runs on Tier 1 + rolling summary.
            </p>
          </Section>

          <Section
            id="reasoning"
            number="10"
            title="Reasoning — multi-hop chat"
            intro="Chat doesn't just find similar text — it walks the graph."
          >
            <RefKV
              entries={[
                { label: "Seed", value: "Top-3 nodes by embedding similarity to question" },
                { label: "Walk", value: "2-hop BFS from each seed, max 15 nodes" },
                { label: "Edge priority", value: "Strong edges first (refines/contradicts/supports/expands/exemplifies/questions), then related_to with fanout=1" },
                { label: "Fallback", value: "If < 4 nodes found, falls back to flat RAG" },
                { label: "Subgraph context", value: "Text block with edges rendered inline: A —[contradicts]→ B" },
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Chat also has a tool-use loop. When the LLM calls an agent tool
              (find_orphans, suggest_links, etc.), the dispatcher runs{" "}
              <code className="text-primary">plan()</code> — which returns a
              Proposal without mutating anything. The proposal streams back to
              the UI as a card the user can Apply or Dismiss.
            </p>

            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Tool calls are capped at <code className="text-primary">AGENT_MAX_TOOL_CALLS</code>{" "}
              (default 3) per turn.
            </p>

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              The subgraph walk, as pseudocode:
            </p>

            <RefCode>{`seeds = top_k_nodes(question, k=3)            # embedding similarity
if len(seeds) < 4:
    return flat_rag(question)                    # fallback

visited = set()
frontier = seeds
for hop in range(2):                             # DEFAULT_HOPS = 2
    next_frontier = []
    for node in frontier:
        for edge in outbound_edges(node):
            if edge.type in STRONG_EDGE_TYPES:   # refines, contradicts, ...
                follow(edge)
            elif edge.type == "related_to":
                follow(edge) if related_to_count(node) < 1
    if len(visited) >= 15:                       # DEFAULT_MAX_NODES = 15
        break

context = render_subgraph(visited)
return call_llm(question, context)`}</RefCode>

            <p className="text-[12px] text-muted-foreground leading-relaxed">
              The rendered context shows edges inline so the LLM can see how ideas
              connect:
            </p>

            <RefCode>{`[Node: Raft]
  A consensus algorithm for distributed systems.

[Node: leader election]
  The process of choosing a coordinator in a cluster.

[Edge] Raft —[refines]→ leader election
[Edge] leader election —[contradicts]→ single-leader`}</RefCode>
          </Section>

          <Section
            id="identity"
            number="11"
            title="Identity engine"
            intro="A persistent model of who you are — built from your own data, evidence-cited, and tracked over time."
          >
            <RefKV
              entries={[
                { label: "Inputs", value: "Recent captures, active goals, decisions with outcomes, reflections" },
                { label: "Output", value: "Values, patterns, strengths, blind spots, growth areas, thinking style, narrative" },
                { label: "Storage", value: "self_models + identity_snapshots tables" },
                { label: "Rebuild trigger", value: "Manual from the /identity page" },
                { label: "Naming rule", value: "Item names are preserved across rebuilds so growth is trackable" },
                { label: "Locale handling", value: "If locale changes, names are translated while preserving meaning" },
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Every item in the identity model is{" "}
              <strong className="text-foreground/90">evidence-cited</strong>. The prompt
              prohibits inventing traits without support, moralizing, or flattery.
            </p>

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              The identity prompt returns this JSON shape:
            </p>

            <RefCode>{`{
  "narrative": "2-3 sentences about who this person is.",
  "values": [
    { "value": "Name", "evidence": "why inferred", "strength": "low|medium|high" }
  ],
  "patterns": [
    { "pattern": "Name", "description": "how it shows up", "evidence": "supporting details" }
  ],
  "strengths": [
    { "strength": "Name", "evidence": "where it shows" }
  ],
  "blind_spots": [
    { "spot": "Name", "evidence": "where it shows" }
  ],
  "growth_areas": [
    { "area": "Name", "reason": "why this matters for them" }
  ],
  "thinking_style": "One sentence on how they seem to think."
}`}</RefCode>

            <p className="text-[12px] text-muted-foreground leading-relaxed">
              The prompt also includes a <strong className="text-foreground/90">naming rule</strong>:
              when a concept matches a previous snapshot item, the exact same name is reused.
              This is how growth is tracked over time — inconsistent naming would break the
              model. If the user&rsquo;s locale changed between snapshots, item names are
              translated while preserving meaning.
            </p>

            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Every rebuild is snapshotted to <code className="text-primary">identity_snapshots</code>,
              so the trajectory can be viewed as a timeline.
            </p>
          </Section>

          <Section
            id="insights"
            number="12"
            title="Proactive insights"
            intro="Four signals that make Cortex speak first. Rate-limited to three per day per user, deduplicated via a unique constraint."
          >
            <RefTable
              headers={["Signal", "Trigger", "When it runs"]}
              rows={[
                [
                  "Dormant revival",
                  "New capture is close to a long-untouched node (≥30 days old, similarity ≥ 0.78)",
                  "Capture request path (<50ms)",
                ],
                [
                  "Contradiction",
                  "New capture reverses something said before (LLM-detected, similarity ≥ 0.72, checks 3 neighbors)",
                  "SLA worker (async)",
                ],
                [
                  "Decision drift",
                  "A committed decision's context has shifted since it was made",
                  "SLA worker's daily tick",
                ],
                [
                  "Rhythm",
                  "You write about a topic consistently on a particular weekday (min 4 samples)",
                  "Capture request path (statistical)",
                ],
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Every signal has a per-user toggle in{" "}
              <code className="text-primary">user_notification_prefs</code>. The master
              switch defaults to off.
            </p>

            <RefKV
              entries={[
                { label: "Dormant age floor", value: "30 days (DORMANT_MIN_AGE_DAYS)" },
                { label: "Dormant similarity", value: "cosine ≥ 0.78 (DORMANT_SIMILARITY_THRESHOLD)" },
                { label: "Contradiction similarity", value: "cosine ≥ 0.72 (CONTRADICTION_SIMILARITY_THRESHOLD)" },
                { label: "Contradiction neighbors", value: "Top 3 (CONTRADICTION_NEIGHBOR_LIMIT)" },
                { label: "Rhythm min samples", value: "4 captures on the same weekday (MIN_RHYTHM_SAMPLES)" },
                { label: "Daily cap", value: "3 per 24h (DAILY_INSIGHT_CAP)" },
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              Every signal fires through the same gate:
            </p>

            <RefCode>{`fire_insight(db, user_id, kind, ...)
  ├─ check user's master switch          ← insights_enabled
  ├─ check user's per-signal toggle       ← insights_dormant_revival, etc.
  ├─ count fired in last 24h             ← cap at 3
  ├─ insert SurfacedInsight row
  │    └─ unique on (user_id, kind, dedupe_key)
  │       → IntegrityError = already fired, skip
  └─ push_user_notification()`}</RefCode>

            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Sync signals (dormant revival, rhythm) run inside the capture request
              path in under 50ms. The contradiction signal is dispatched to the SLA
              worker so it never blocks the capture. Decision drift runs on the
              worker&rsquo;s daily tick.
            </p>
          </Section>

          <Section
            id="reflection"
            number="13"
            title="Reflection"
            intro="Turns decisions with outcomes into generalizable lessons, and produces weekly reports on patterns you might have missed."
          >
            <RefTable
              headers={["Output", "Trigger", "Storage"]}
              rows={[
                [
                  "Lesson",
                  "A decision's outcome is recorded → lesson extraction runs",
                  "reflections row with kind='lesson'",
                ],
                [
                  "Period report",
                  "Manual from /reflections, or weekly on the SLA worker",
                  "reflections row with kind='report'",
                ],
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              The lesson extraction prompt receives the full decision context
              — question, context, chosen option, reasoning, expected and actual
              outcomes — and returns:
            </p>

            <RefCode>{`{
  "title": "Short title for the lesson (max 60 chars)",
  "lesson": "One clear, generalizable insight (2-3 sentences max)",
  "why_it_matters": "Why this lesson is important to your growth",
  "tags": ["short", "topical", "tags"]
}`}</RefCode>

            <RefKV
              entries={[
                { label: "Model", value: "openai/gpt-oss-120b (Groq)" },
                { label: "System prompt", value: "Honest, kind, focused on learning — never moralizing" },
                { label: "Embedded", value: "Yes — lessons are searchable" },
                { label: "kinds", value: "reflection, lesson, report, observation" },
              ]}
            />
          </Section>

          <Section
            id="decisions"
            number="14"
            title="Decisions"
            intro="A decision log that helps you think before you commit, and learn after the outcome is known."
          >
            <RefTable
              headers={["Phase", "What happens"]}
              rows={[
                [
                  "Analyze",
                  "Ask a question → LLM analyzes options grounded in your captured knowledge and past decisions",
                ],
                [
                  "Decide",
                  "You pick an option, record reasoning, and set a review date",
                ],
                [
                  "Review",
                  "At the review date, you record the actual outcome",
                ],
                [
                  "Learn",
                  "The outcome triggers lesson extraction (see Reflection)",
                ],
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              The analysis prompt returns structured options with tradeoffs:
            </p>

            <RefCode>{`{
  "framing": "Restating the core decision",
  "options": [
    {
      "name": "Option name",
      "pros": ["pro 1", "pro 2"],
      "cons": ["con 1", "con 2"],
      "best_if": "circumstances where this option is best"
    }
  ],
  "tradeoffs": ["key trade-off 1", "key trade-off 2"]
}`}</RefCode>

            <RefKV
              entries={[
                { label: "Grounding", value: "Semantic search over your nodes + all past decisions" },
                { label: "Storage", value: "decisions table with options/analysis JSON, chosen_option, reasoning, expected/actual outcome" },
                { label: "Pattern view", value: "/decisions/patterns aggregates outcomes by kind" },
                { label: "Statuses", value: "open · decided · reviewed · archived" },
              ]}
            />
          </Section>

          <Section
            id="learning"
            number="15"
            title="Learning"
            intro="Turns a vague ambition into a phased plan with concrete milestones, grounded in what you already know."
          >
            <RefKV
              entries={[
                { label: "Input", value: "Goal title + description" },
                { label: "Context", value: "Semantic search for related captures to identify existing knowledge" },
                { label: "Output", value: "Skills, gaps, strengths, phased plan with milestones" },
                { label: "Storage", value: "goals + learning_plans tables" },
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              The goal decomposition returns:
            </p>

            <RefCode>{`{
  "summary": "one-sentence goal summary",
  "skills": [
    { "name": "Skill", "level": "beginner|intermediate|advanced",
      "why": "why this skill matters" }
  ],
  "gaps": ["Specific thing you don't know yet"],
  "strengths": ["Specific thing you already know"],
  "phases": [
    {
      "phase": "Phase 1: Foundation",
      "duration_weeks": 2,
      "milestones": [
        { "title": "...", "actions": ["concrete action 1", "..."] }
      ]
    }
  ]
}`}</RefCode>

            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Milestones can be marked done from the goal detail page. The home
              dashboard surfaces the first action of the active goal in{" "}
              <em>Today&apos;s focus</em>.
            </p>
          </Section>

          <Section
            id="agents"
            number="16"
            title="Agentic actions"
            intro="The LLM can read the graph. This subsystem lets it write to the graph — safely, transparently, and reversibly."
          >
            <RefTable
              headers={["#", "Action", "Risk", "Default"]}
              rows={[
                ["1", "Find orphans (surface unconnected concepts)", "None (read-only)", "Auto"],
                ["2", "Suggest links (propose edges between related concepts)", "Low", "Manual"],
                ["3", "Place URL (capture + auto-link to existing concepts)", "Low", "Manual"],
                ["4", "Merge concepts (AI-initiated canonicalization)", "Medium", "Manual"],
                ["5", "Reorganize (composite of the above)", "High", "Locked to manual"],
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              Every action follows the same five-layer pipeline:
            </p>

            <RefCode>{`1. INTENT DETECTION   Chat LLM calls a tool based on user's message
2. PLANNING           agent.plan() proposes changes — no mutations
3. VALIDATION         backend checks consistency + rate limits
4. APPROVAL           user sees proposal; applies or dismisses
5. EXECUTION + AUDIT  apply() runs in a transaction; snapshot for undo`}</RefCode>

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              The agent interface — every agent is a module:
            </p>

            <RefCode>{`class ActionAgent(ABC):
    name: str                      # "find_orphans"
    requires_llm: bool             # false for read-only agents
    auto_apply_default: bool

    async def plan(db, user_id, instruction, context) -> Proposal | None
    async def validate(db, proposal) -> Proposal
    async def apply(db, proposal) -> ApplyResult`}</RefCode>

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              Every apply writes a snapshot describing what to reverse:
            </p>

            <RefCode>{`{
  "created_nodes": ["uuid1"],
  "created_edges": ["uuid3"],
  "updated_nodes": [{ "id": "uuid4", "before": { "title": "old" } }],
  "merged_aliases": ["alias_row_id_1"]
}`}</RefCode>

            <RefKV
              entries={[
                { label: "Per-user override", value: "user_preferences.agent_auto_apply JSONB — {kind: bool}" },
                { label: "Daily cap", value: "AGENT_DAILY_RUNS_CAP (default 50)" },
                { label: "Tool cap", value: "AGENT_MAX_TOOL_CALLS per chat turn (default 3)" },
                { label: "Sampling", value: "Graphs over 500 nodes run on a 200-node sample" },
                { label: "Coalescing", value: "Identical instructions within 5 min reuse the last proposal" },
              ]}
            />
          </Section>

          <Section
            id="graph-health"
            number="17"
            title="Graph health"
            intro="A read-only diagnostic view of your knowledge graph — no writes, no LLM calls."
          >
            <RefKV
              entries={[
                { label: "Endpoint", value: "GET /memory/health" },
                { label: "Frontend", value: "/memory/health" },
                { label: "Sections", value: "overview · topology · issues · activity" },
                { label: "Cost", value: "Zero — pure SQL reads" },
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              What it surfaces:
            </p>

            <RefTable
              headers={["Panel", "What it shows"]}
              rows={[
                ["Overview", "Node counts by type, edge counts, embedding coverage, median degree"],
                ["Topology", "Degree histogram, most-connected nodes"],
                ["Orphans", "Concepts with zero incoming edges"],
                ["Pending merges", "Aliases proposed but not yet accepted"],
                ["Stale concepts", "Nodes not touched in 60+ days with low activity"],
                ["Activity", "Capture counts, edge additions, merge events (7-day window)"],
              ]}
            />

            <RefKV
              entries={[
                { label: "Stale threshold", value: "60 days (STALE_THRESHOLD_DAYS)" },
                { label: "Dismiss period", value: "90 days (STALE_DISMISS_DEFAULT_DAYS)" },
                { label: "Detector", value: "sla_jobs.py runs a daily scan" },
                { label: "Actions", value: "Merge (via ConceptAlias), dismiss, or trigger an agent" },
              ]}
            />
          </Section>

          <Section
            id="support"
            number="18"
            title="Help & support"
            intro="An in-app help assistant that answers product questions, and a ticket system when it can't."
          >
            <RefKV
              entries={[
                { label: "Knowledge base", value: "help_docs.json — loaded and embedded at import time" },
                { label: "Retrieval", value: "Cosine similarity over cached embeddings" },
                { label: "Answer shape", value: "{answer, cited_doc_ids[], suggested_doc_ids[], escalate}" },
                { label: "Escalation", value: "escalate:true → frontend offers 'File a ticket' with the question prefilled" },
                { label: "Feedback", value: "👍/👎 on every answer, logged for tuning" },
                { label: "Streaming", value: "SSE: meta → tokens → citations → done" },
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              The ticket system:
            </p>

            <RefTable
              headers={["Component", "What it does"]}
              rows={[
                ["Feedback ticket", "Category (bug/feature/question/other), subject, description, optional screenshot"],
                ["AI triage", "Auto-classifies category + priority with rationale and a draft reply (cached 24h)"],
                ["SLA policies", "First-response and resolution targets per priority (seeded at startup)"],
                ["Webhooks", "Ticket events fire to configured targets with retry"],
                ["Email", "Per-ticket and per-status-change notifications, with suppression list"],
              ]}
            />
          </Section>

          <Section
            id="privacy"
            number="19"
            title="Privacy & consent"
            intro="Five categories, opt-in for non-essential, and the ability to turn off AI processing without losing the app."
          >
            <RefTable
              headers={["Category", "What it controls", "Default"]}
              rows={[
                ["Essential", "Login, session, CSRF, locale, consent record", "Locked on"],
                ["Personalization", "Long-term memory, user model, recall", "Off"],
                ["Performance", "Local caches, prefetch", "Off"],
                ["AI processing", "Groq + Gemini calls for enrichment and chat", "Off"],
                ["Marketing", "Reserved — no email currently sent", "Off"],
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              Storage: the consent record lives in a first-party cookie{" "}
              <code className="text-primary">cortex_consent</code> AND in
              localStorage. Cookie wins if newer; both are read on every request.
            </p>

            <RefKV
              entries={[
                { label: "Header", value: "X-AI-Consent: true|false attached to every API call" },
                { label: "Backend", value: "contextvar set by middleware; read by is_ai_processing_allowed()" },
                { label: "Persisted", value: "user_preferences.ai_processing (DB is fallback)" },
                { label: "Gated calls", value: "extract_concepts · classify_capture · extract_image_text · detect_key_moments · embed_one · update_user_model" },
                { label: "Not gated", value: "chat, agents, topic synthesis, recall — these still work when AI processing is off" },
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed">
              When AI processing is disabled, captures save as raw text — no
              concepts extracted, no classification, images stored but not
              analyzed. The CaptureBox shows an amber notice to that effect.
            </p>

            <p className="text-[12px] text-muted-foreground leading-relaxed">
              The full cookie policy and preferences are at{" "}
              <code className="text-primary">/privacy/cookies</code>. Cookie
              preferences can be reopened from{" "}
              <code className="text-primary">Settings → Privacy</code> or from
              the footer on any public page.
            </p>
          </Section>

          <Section
            id="data-model"
            number="20"
            title="Data model"
            intro="Postgres is authoritative. These are the tables by function."
          >
            <RefTable
              headers={["Group", "Tables"]}
              rows={[
                ["Users & prefs", "users, user_preferences, user_notification_prefs, admin_notification_prefs, api_tokens, impersonation_sessions"],
                ["Graph", "nodes, edges, embeddings, embedding_queue, concept_aliases, edge_checks"],
                ["Chat & memory", "chat_conversations, chat_messages, message_embeddings, user_model, self_models, identity_snapshots"],
                ["Reasoning", "topics_syntheses, surfaced_insights, insight_checks"],
                ["Decisions & reflection", "decisions, reflections"],
                ["Learning", "goals, learning_plans"],
                ["Agentic actions", "agent_actions"],
                ["Support", "feedback_tickets, feedback_replies, ticket_events, ticket_tags, canned_responses, sla_policies"],
                ["Ops", "webhook_targets, webhook_deliveries, email_deliveries, email_suppressions, email_settings"],
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              Neo4j holds a mirror of the graph:
            </p>

            <RefCode>{`(:Node {
  id, user_id, type, title,
  content[:1000], created_at
})

Relationship types (whitelisted):
  refines, contradicts, expands, exemplifies,
  supports, questions, related_to, contains`}</RefCode>

            <RefKV
              entries={[
                { label: "Postgres → Neo4j", value: "On every capture, edge creation, and merge — with retries" },
                { label: "Mirror failures", value: "Do not fail the capture; a background job can backfill" },
                { label: "Neo4j → Postgres", value: "Never. The mirror is read-only from the app's perspective" },
                { label: "Undo", value: "delete_graph_edge reverses Neo4j relationship on agent undo" },
              ]}
            />
          </Section>

          <Section
            id="limits"
            number="21"
            title="What Cortex doesn't do"
            intro="Honest limits. Some are by choice, some are by scope."
          >
            <RefTable
              headers={["Not supported", "Why"]}
              rows={[
                ["Real-time collaboration", "Cortex is a personal cognition system — single-user by design."],
                ["On-device inference", "All LLM calls are server-side, to Groq and Google."],
                ["Third-party analytics", "No tracking pixels, no cross-site cookies, no fingerprinting."],
                ["Native mobile app", "Web app is mobile-responsive; extension is desktop-only."],
                ["Training on your data", "Neither provider trains models on API content per their policies."],
                ["Offline mode", "The app requires network access for LLM and search features."],
                ["Public sharing of captures", "Nodes are private to the owner. No public links are generated."],
                ["Selling or sharing user data", "Never. Not to advertisers, not to anyone."],
              ]}
            />

            <p className="text-[12px] text-muted-foreground leading-relaxed pt-2">
              Additional design constraints:
            </p>

            <RefKV
              entries={[
                { label: "Free tier limits", value: "Groq 30 req/min, Gemini rate limits, Neo4j Aura Free cold-start latency" },
                { label: "Agent runs", value: "Capped at 50/day per user to stay inside free-tier budget" },
                { label: "Graph size", value: "Agents sample down to 200 nodes when the graph exceeds 500" },
                { label: "Message embeddings", value: "Not retroactive — messages captured before this feature lack recall" },
                { label: "Locale coverage", value: "UI translated to 6 locales; help docs partially translated" },
              ]}
            />
          </Section>

          {/* Closing CTA — compact */}
          <section className="py-14 border-t border-border/60">
            <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/6 via-card/40 to-card/40 px-6 py-10 text-center">
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
                Try the real thing.
              </h2>
              <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                Free forever. No credit card. Your captures are yours alone.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/sign-in"
                  className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  Start free
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <Link
                  href="/support"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Try the AI first
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
