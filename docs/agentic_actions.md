# Agentic Actions -- Architecture

Status: Tier 4 -- complete (2026-10-09)

All four sub-phases shipped:

  4.1 -- Framework
     - agent_actions table + user_preferences.agent_auto_apply
     - Action framework (Proposal, ActionAgent, dispatcher, apply, undo)
     - find_orphans agent (read-only)
     - Chat tool-use loop with SSE proposal frames
     - ProposalCard / ProposalDetail / ActionsHistory components
     - /memory/actions history page
     - Settings > Agent panel (per-kind auto-apply)
     - Extension right-click menu
     - i18n in 6 locales

  4.2 -- suggest_links agent
     - Shared propose_edges_for_node() helper in edges.py
     - Dedupe by unordered pair + higher floor for related_to
     - Title enrichment on change objects

  4.3 -- Real place_url + merge_concepts
     - place_url: fetch + capture + propose edges
     - merge_concepts: three-tier scan + pending alias surfacing
     - metadata::jsonb cast for extractor lookups
     - delete_graph_edge for Neo4j undo mirror

  4.4 -- reorganize composite
     - Composes find_orphans + merge_concepts + suggest_links
     - Tags each change with _agent
     - Composite apply dispatches by sub-agent
     - Snapshot merges edges + aliases
     - Undo reverses everything atomically

Registered agents:
  find_orphans, suggest_links, merge_concepts, place_url, reorganize

Postgres <-> Neo4j mirror stays in sync on apply AND undo.
Last updated: 2026-10-08

Cortex's AI can read the graph. This feature lets it WRITE to the graph --
safely, transparently, and reversibly.

---

## The five capabilities

| # | Action | Risk | Phase |
|---|--------|------|-------|
| 1 | Find orphans (surface unconnected concepts) | None (read-only) | 4.1 |
| 2 | Suggest links (propose edges between related concepts) | Low | 4.2 |
| 3 | Place URL (capture + auto-link to existing concepts) | Low | 4.3 |
| 4 | Merge concepts (AI-initiated canonicalization) | Medium | 4.3 |
| 5 | Reorganize (composite: links + merges across graph) | High | 4.4 |

Every action follows the same five-layer pipeline:

    1. INTENT DETECTION   Chat LLM calls a tool based on user's message
    2. PLANNING           Agent runs plan() -- proposes changes, no mutations
    3. VALIDATION         Backend checks consistency + rate limits
    4. APPROVAL           User sees the proposal; applies or dismisses
    5. EXECUTION + AUDIT  apply() runs in a transaction; snapshot for undo

The LLM never mutates the graph directly. It only produces Proposals.
Only user-approved apply() calls touch the database.

---

## The Proposal format

Every agent returns the same JSON shape. The UI renders each op differently.

    {
      "id": "uuid",
      "action_kind": "find_orphans",
      "reasoning": "Human-readable summary",
      "changes": [
        {"op": "create_edge", "from": "...", "to": "...", "type": "related_to"},
        {"op": "create_node", "type": "concept", "title": "..."},
        {"op": "update_node", "id": "...", "patch": {"title": "..."}},
        {"op": "merge_nodes", "alias_id": "...", "canonical_id": "..."}
      ],
      "details": [
        {"change_index": 0, "note": "These two concepts share 3 tokens."}
      ],
      "confidence": 0.87,
      "expires_at": "2026-10-08T15:00:00Z"
    }

changes is the machine-readable action list. details is the per-change
LLM explanation.

---

## The agent interface

Every agent is a self-contained module implementing the same abstract:

    class ActionAgent(ABC):
        name: str                      # "find_orphans"
        requires_llm: bool             # false for read-only agents
        auto_apply_default: bool       # false for most

        async def plan(db, user_id, instruction, context) -> Proposal | None
        async def validate(db, proposal) -> Proposal
        async def apply(db, proposal) -> ApplyResult

Adding a new action = one new file in app/services/actions/.

---

## The tool-use pattern

Agents are exposed to the chat LLM as tools (function calling). When the
user says "find orphan concepts", the LLM:

1. Recognizes the intent
2. Calls find_orphans as a tool
3. Receives the tool result (a Proposal)
4. Streams a response explaining what it found
5. The UI renders the Proposal inline with Apply / Dismiss buttons

Tool calls are capped at AGENT_MAX_TOOL_CALLS per turn (default 3) to
prevent runaway loops on the free Groq tier.

---

## Approval hierarchy (per-kind defaults)

| Action kind | Default | User can override |
|---|---|---|
| find_orphans | Auto (read-only) | Force manual |
| suggest_links | Manual | Auto-apply |
| place_url | Manual | Auto-apply |
| merge_concepts | Manual | Auto-apply |
| reorganize | Always manual | Locked |

Per-user override lives in user_preferences.agent_auto_apply (JSONB):

    {"find_orphans": true, "suggest_links": false, "merge_concepts": false}

Defaults for missing keys come from the table above.

---

## The apply + undo cycle

Every apply() writes:

1. The mutations to Postgres (and Neo4j mirror if applicable)
2. An agent_actions row with status='applied'
3. A snapshot in that row describing what to reverse

    {
      "created_nodes": ["uuid1"],
      "created_edges": ["uuid3"],
      "updated_nodes": [{"id": "uuid4", "before": {"title": "old"}}],
      "merged_aliases": ["alias_row_id_1"]
    }

undo() reads the snapshot and applies the inverse in a single
transaction. Failure rolls back -- undo is always atomic.

---

## Cost safety (free tier)

Groq free tier limits (~30 req/min, ~14k req/day) mean every agent run
must be budget-aware:

- No automatic agent runs. Every invocation is user-initiated.
- Budget guard. Dispatcher estimates tokens and refuses if the run
  would exceed a safe fraction of remaining quota.
- Request coalescing. Identical instructions within 5 min reuse the
  last proposal.
- Sampling for large graphs. Over 500 nodes runs on a 200-node sample.
- Daily cap. AGENT_DAILY_RUNS_CAP per user (default 50).

No new paid services. All LLM calls reuse groq_api_key. All embeddings
reuse gemini_api_key.

---

## Data model

    CREATE TABLE agent_actions (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action_kind VARCHAR(32) NOT NULL,
        instruction TEXT,
        proposal JSONB NOT NULL,
        status VARCHAR(16) NOT NULL,
        result JSONB,
        snapshot JSONB,
        created_at TIMESTAMPTZ DEFAULT now(),
        applied_at TIMESTAMPTZ,
        undone_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ
    );

    CREATE INDEX ix_agent_actions_user_status ON agent_actions (user_id, status);
    CREATE INDEX ix_agent_actions_created ON agent_actions (created_at DESC);

Plus one column on user_preferences:

    ALTER TABLE user_preferences
      ADD COLUMN agent_auto_apply JSONB NOT NULL DEFAULT '{}'::jsonb;

Status values: pending | applied | rejected | failed | undone.

---

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET  | /agent/actions | List past actions (with status filter) |
| POST | /agent/actions/plan | Run an agent plan() -- returns a Proposal |
| POST | /agent/actions/{id}/apply | Apply a pending proposal |
| POST | /agent/actions/{id}/reject | Reject a pending proposal |
| POST | /agent/actions/{id}/undo | Undo an applied proposal |

All user-scoped. All authenticated. Apply and undo are idempotent.

---

## The multi-turn chat loop

The chat streaming endpoint gets a tool loop:

    1. User message -> LLM
    2. LLM returns tool_call OR text
    3. If tool_call:
       a. Dispatcher routes to the right agent
       b. plan() runs (no mutations)
       c. Tool result fed back to LLM
       d. Loop (max AGENT_MAX_TOOL_CALLS per turn)
    4. If text:
       a. Stream tokens
       b. Emit {"type": "proposal", "data": ...} frames

Multiple tool calls in one turn are allowed (up to the cap).

---

## UI surfaces

1. Chat -- proposals render inline as cards below the assistant reply
2. Memory page -- "Ask AI to organize" button runs the dispatcher
3. Health page -- "Find more merges" button runs the merge agent
4. Extension -- right-click "Ask Cortex to place this URL"
5. Actions history -- sub-page at /actions showing past actions with undo

---

## Phase 4.1 scope (this release)

- Foundation: agent_actions table, agent_auto_apply column
- Base classes: ActionAgent, Proposal, registry
- One agent implemented: find_orphans (read-only, zero-risk)
- Dispatcher + apply + undo
- 5 endpoints
- Chat tool-use plumbing (upgrade graph_reasoning.py)
- UI: ProposalCard, ProposalDetail, ActionsHistory
- Settings: per-kind approval preferences
- Extension: "Ask Cortex to place this URL" context menu
- i18n for all 6 locales

---

## File map

Backend:

    apps/api/app/services/actions/
      __init__.py
      base.py             Proposal, ActionAgent, registry
      find_orphans.py     first agent
      dispatcher.py       intent routing
      apply.py            execute + snapshot
      undo.py             inverse operations

    apps/api/app/routers/agent.py
    apps/api/scripts/migrate_add_agent_actions.py
    apps/api/docs/agentic_actions.md  (this file)

Frontend:

    apps/web/lib/hooks/use-agent-actions.ts
    apps/web/components/actions/ProposalCard.tsx
    apps/web/components/actions/ProposalDetail.tsx
    apps/web/components/actions/ActionsHistory.tsx
    apps/web/app/[locale]/(app)/actions/page.tsx

Extension:

    apps/extension/src/background.ts  (patch: add context menu item)
