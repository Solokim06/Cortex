"""
Graph reasoning agents.

Each agent is a prompt voice + a lens over the walked subgraph. The
walker stays generic (find_seed_nodes + walk_subgraph); agents filter
its output down to the edges they care about and layer a system
addendum on top of GRAPH_SYSTEM.

Registry
--------
  devil_advocate  — argues *against* the user's position using their
                    own captures that contradict or question it
  steelman        — argues *for* it using captures that support or
                    exemplify it
  historian       — traces how a position evolved over time, ordering
                    by timestamp and surfacing refines/expands/contradicts
  connector       — (stub) finds non-obvious links between two clusters

Connector is registered but raises NotImplementedError in its filter.
Real connector semantics need a two-seed traversal and a UI for picking
the pair — deferred to a dedicated session. The stub exists so the
dropdown can show the option and the backend can return an honest
"not yet available" error rather than silently misbehaving.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class AgentSpec:
    """Static definition of one agent."""

    name: str
    """Machine name used in the API payload: 'devil_advocate', etc."""

    label_key: str
    """i18n key under chat.agents.* for the UI label."""

    system_addendum: str
    """Appended to GRAPH_SYSTEM before the LLM call."""

    preferred_edges: tuple[str, ...]
    """Edge types this agent prioritizes. Used by filter_subgraph_for_agent."""

    keep_all_nodes: bool = False
    """
    If True, the filter keeps every node the walk found but only the
    preferred edges. If False, it drops nodes that aren't endpoints of a
    preferred edge (plus seeds). Default False tightens the subgraph;
    Historian sets True so chronology isn't lost.
    """

    temperature: float = 0.5
    max_tokens: int = 2200


# ---------------------------------------------------------------------
# The three shipping agents
# ---------------------------------------------------------------------

DEVIL_ADVOCATE = AgentSpec(
    name="devil_advocate",
    label_key="devilAdvocate",
    system_addendum="""
You are now speaking as the user's Devil's Advocate.

Your job: make the strongest *honest* case AGAINST the position the
user appears to hold. You must draw only on what they wrote — captures
they themselves tagged as contradictory or questioning, plus their own
stated doubts and hesitations. You are not inventing objections; you
are surfacing the ones already latent in their graph.

Rules:
- Lead with the case against. State it plainly.
- Cite the specific nodes that contradict or question the position:
  "[n3] directly contradicts this because..." etc.
- Do NOT hedge into "on the other hand, actually the user is right" in
  the same breath. The user asked for the opposing view; give it.
- If the subgraph contains no genuinely contradicting material, say so
  and stop — do not manufacture opposition.
- End with one sentence acknowledging you are playing a role, so the
  user does not mistake this for Cortex's actual assessment.
""".strip(),
    preferred_edges=("contradicts", "questions"),
    keep_all_nodes=False,
    temperature=0.4,
    max_tokens=1800,
)


STEELMAN = AgentSpec(
    name="steelman",
    label_key="steelman",
    system_addendum="""
You are now speaking as the user's Steelman.

Your job: make the strongest *honest* case FOR the position the user
appears to hold. Use their own captures — evidence they provided,
examples they wrote down, refinements that sharpen the claim. Not
invention; amplification of what they already argued.

Rules:
- Lead with the case for. State it plainly.
- Cite the specific nodes that support or exemplify the position.
- Strengthen weak points by finding the reasoning the user implied but
  did not spell out — still grounded in their captures.
- If the subgraph contains no genuinely supporting material, say so and
  stop.
- End with one sentence acknowledging you are playing a role.
""".strip(),
    preferred_edges=("supports", "exemplifies", "refines"),
    keep_all_nodes=False,
    temperature=0.4,
    max_tokens=1800,
)


HISTORIAN = AgentSpec(
    name="historian",
    label_key="historian",
    system_addendum="""
You are now speaking as the user's Historian.

Your job: trace how a belief, concept, or position has *evolved* over
time in their captures. Not what they think now — how they got there.

Rules:
- Order your answer chronologically. Earliest framing first.
- At each step, cite the node that marks the transition: "In [n2] they
  framed it as X, then in [n5] refined it to Y, and [n7] contradicts
  that entirely."
- Surface reversals, sharpenings, and abandonments. Those are the
  interesting beats.
- Do NOT invent dates. If the subgraph's ordering is ambiguous, say so.
- Be warm — this is a story about the user's own thinking.
""".strip(),
    preferred_edges=("refines", "expands", "contradicts", "questions"),
    keep_all_nodes=True,   # chronology needs context nodes too
    temperature=0.5,
    max_tokens=2400,
)


# ---------------------------------------------------------------------
# Connector — registered but not yet implemented
# ---------------------------------------------------------------------

CONNECTOR = AgentSpec(
    name="connector",
    label_key="connector",
    system_addendum="""
You are now speaking as the user's Connector.

Your job: find a non-obvious link between two apparently separate
clusters of their graph.

(This agent is not yet available — see filter_subgraph_for_agent.)
""".strip(),
    preferred_edges=(),   # not used; filter raises before this is read
    keep_all_nodes=True,
    temperature=0.5,
    max_tokens=2000,
)


AGENTS: dict[str, AgentSpec] = {
    DEVIL_ADVOCATE.name: DEVIL_ADVOCATE,
    STEELMAN.name: STEELMAN,
    HISTORIAN.name: HISTORIAN,
    CONNECTOR.name: CONNECTOR,
}


def get_agent(name: str | None) -> AgentSpec | None:
    """Return the spec for `name`, or None if name is empty/unknown."""
    if not name:
        return None
    return AGENTS.get(name)


def filter_subgraph_for_agent(subgraph: dict, spec: AgentSpec) -> dict:
    """
    Tighten a walked subgraph to the edges this agent cares about.

    Returns a new subgraph dict with the same shape. Original is not
    mutated.

    Raises NotImplementedError for Connector — see module docstring.
    """
    if spec.name == "connector":
        raise NotImplementedError(
            "Connector requires a two-seed traversal, not a single-seed "
            "filter. Deferred to a dedicated session. The dropdown may "
            "still show it; the backend should return a clear error."
        )

    nodes = subgraph.get("nodes") or []
    edges = subgraph.get("edges") or []

    preferred = set(spec.preferred_edges)
    kept_edges = [e for e in edges if e.get("type") in preferred]

    if spec.keep_all_nodes:
        return {"nodes": list(nodes), "edges": kept_edges}

    # Keep seeds + endpoints of preferred edges. Everything else drops.
    keep_ids: set[str] = set()
    for n in nodes:
        if n.get("is_seed"):
            keep_ids.add(n["id"])
    for e in kept_edges:
        keep_ids.add(e.get("from_id"))
        keep_ids.add(e.get("to_id"))

    kept_nodes = [n for n in nodes if n.get("id") in keep_ids]

    return {"nodes": kept_nodes, "edges": kept_edges}


def apply_agent_to_system(base_system: str, spec: AgentSpec | None) -> str:
    """Layer an agent's addendum on top of the base graph system prompt."""
    if spec is None:
        return base_system
    return f"{base_system}\n\n---\n\n{spec.system_addendum}"
