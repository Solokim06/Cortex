"""
Tier 4 -- agentic actions.

Agents propose graph mutations; users approve before they apply.
See docs/agentic_actions.md for the architecture.

Public surface:
  from app.services.actions.base import Proposal, ActionAgent, get_agent
  from app.services.actions.dispatcher import dispatch
"""

from app.services.actions.base import (  # noqa: F401
    Proposal,
    ActionAgent,
    ApplyResult,
    get_agent,
    list_agents,
    register_agent,
    tools_schema,
)

# Import every agent module so register_agent() runs at package import
# time. Order doesn't matter -- registration is keyed by name.
from app.services.actions import find_orphans  # noqa: F401
from app.services.actions import place_url  # noqa: F401
from app.services.actions import suggest_links  # noqa: F401
from app.services.actions import merge_concepts  # noqa: F401
from app.services.actions import reorganize  # noqa: F401

__all__ = [
    "Proposal",
    "ActionAgent",
    "ApplyResult",
    "get_agent",
    "list_agents",
    "register_agent",
    "tools_schema",
]
