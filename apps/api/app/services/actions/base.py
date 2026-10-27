"""
Base classes for Tier 4 agentic actions.

Every agent:
  - inherits ActionAgent
  - implements plan() and apply()
  - is registered via register_agent()

The Proposal dataclass is the universal shape the UI knows how to render.
"""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession


# =====================================================================
# the universal proposal shape
# =====================================================================


@dataclass
class Proposal:
    """
    A structured plan from an agent. Never mutates the DB by itself.

    changes    -- machine-readable list of ops (create_edge, create_node, ...)
    details    -- per-change human-readable notes (parallel array)
    reasoning  -- top-level summary
    confidence -- 0.0-1.0, used for UI highlighting and auto-apply gates
    """

    action_kind: str
    reasoning: str
    changes: list[dict[str, Any]] = field(default_factory=list)
    details: list[dict[str, Any]] = field(default_factory=list)
    confidence: float = 1.0
    expires_at: datetime | None = None
    id: str = field(default_factory=lambda: str(uuid.uuid4()))

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "action_kind": self.action_kind,
            "reasoning": self.reasoning,
            "changes": self.changes,
            "details": self.details,
            "confidence": float(self.confidence),
            "expires_at": (
                self.expires_at.isoformat() if self.expires_at else None
            ),
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Proposal":
        exp = d.get("expires_at")
        expires = None
        if exp:
            try:
                expires = datetime.fromisoformat(exp)
            except Exception:
                expires = None
        return cls(
            id=d.get("id") or str(uuid.uuid4()),
            action_kind=d.get("action_kind", ""),
            reasoning=d.get("reasoning", ""),
            changes=list(d.get("changes") or []),
            details=list(d.get("details") or []),
            confidence=float(d.get("confidence") or 0.0),
            expires_at=expires,
        )

    def is_expired(self, now: datetime | None = None) -> bool:
        if self.expires_at is None:
            return False
        now = now or datetime.now(timezone.utc)
        return self.expires_at < now


@dataclass
class ApplyResult:
    """What apply() returns. Stored in agent_actions.result."""

    ok: bool
    message: str = ""
    applied: int = 0
    snapshot: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "message": self.message,
            "applied": self.applied,
            "snapshot": self.snapshot,
        }


# =====================================================================
# the agent interface
# =====================================================================


class ActionAgent(ABC):
    """
    Base class for every agent.

    Subclasses declare their identity in class attributes and implement
    plan(). apply() has a default that returns a no-op result -- only
    mutating agents need to override it.
    """

    #: short machine name, e.g. "find_orphans"
    name: str = ""
    #: human-friendly description (for tool schema + UI)
    description: str = ""
    #: does plan() call an LLM? (read-only agents often don't)
    requires_llm: bool = False
    #: default auto-apply decision (per-kind default in dispatcher)
    auto_apply_default: bool = False

    @abstractmethod
    async def plan(
        self,
        db: AsyncSession,
        user_id: str,
        instruction: str,
        context: dict[str, Any] | None = None,
    ) -> Proposal | None:
        """
        Produce a Proposal without mutating anything.

        Returns None if there is nothing to do (empty graph, no matches,
        budget exceeded, etc.). Callers treat None as "no proposal".
        """
        raise NotImplementedError

    async def validate(
        self,
        db: AsyncSession,
        proposal: Proposal,
    ) -> Proposal:
        """
        Optional. Enrich the proposal with warnings or filter out
        changes that reference missing nodes. Default is pass-through.
        """
        return proposal

    async def apply(
        self,
        db: AsyncSession,
        proposal: Proposal,
    ) -> ApplyResult:
        """
        Execute the proposal. Default is a no-op, for agents whose
        changes are already self-contained in the plan phase.
        """
        return ApplyResult(ok=True, message="no-op", applied=0)


# =====================================================================
# registry
# =====================================================================


_REGISTRY: dict[str, ActionAgent] = {}


def register_agent(agent: ActionAgent) -> None:
    """Register an agent instance under its name."""
    if not agent.name:
        raise ValueError("agent has no name")
    _REGISTRY[agent.name] = agent


def get_agent(name: str) -> ActionAgent | None:
    """Return the singleton instance for a registered agent."""
    return _REGISTRY.get(name)


def list_agents() -> list[ActionAgent]:
    """Return all registered agents (for tool schema generation)."""
    return list(_REGISTRY.values())


# =====================================================================
# tool schema generation (for LLM function-calling)
# =====================================================================


def tools_schema() -> list[dict]:
    """
    Return OpenAI-format tool schemas for every registered agent.

    Called once per chat turn to tell the LLM which actions are
    available. Each agent declares its own `parameters_schema` (a
    JSON Schema for the args). Agents without one get an empty-args
    schema.
    """
    out: list[dict] = []
    for a in list_agents():
        params = getattr(a, "parameters_schema", None) or {
            "type": "object",
            "properties": {},
        }
        out.append({
            "type": "function",
            "function": {
                "name": a.name,
                "description": a.description,
                "parameters": params,
            },
        })
    return out
