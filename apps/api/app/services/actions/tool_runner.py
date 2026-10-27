"""
Tier 4 -- tool call execution.

When the chat LLM emits a tool_call, this module:
  1. Validates the tool name against the registry
  2. Calls dispatch() with action_kind=<tool name>
  3. Returns a compact result object the LLM can read

Important: this only runs plan() (no apply). The user still approves
before anything is mutated.
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.actions.base import get_agent
from app.services.actions.dispatcher import dispatch


def _summarize_proposal(proposal: dict[str, Any]) -> str:
    """
    Produce a short natural-language summary of a proposal for the
    LLM to read back to the user.
    """
    kind = proposal.get("action_kind", "action")
    reasoning = proposal.get("reasoning", "")
    changes = proposal.get("changes") or []
    n = len(changes)

    if kind == "find_orphans":
        if n == 0:
            return "No orphan concepts found -- every concept is connected."
        return f"Found {n} orphan concept" + ("s" if n != 1 else "") + ". " + reasoning

    # Generic fallback
    return f"{kind}: {n} change" + ("s" if n != 1 else "") + ". " + reasoning


async def run_tool_call(
    db: AsyncSession,
    user_id: str,
    name: str,
    args: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Execute one tool call from the LLM.

    Returns a dict with:
      {
        "name": tool name,
        "action_id": agent_actions.id,
        "status": "pending" | "applied" | "failed",
        "summary": short natural-language summary for the LLM,
        "proposal": full proposal dict (for the frontend),
        "error": present only if the call failed,
      }
    """
    args = args or {}

    agent = get_agent(name)
    if agent is None:
        return {
            "name": name,
            "status": "failed",
            "summary": f"Unknown action: {name}",
            "error": f"tool '{name}' is not registered",
        }

    try:
        result = await dispatch(
            db,
            user_id,
            instruction="",
            action_kind=name,
            context=args,
        )
    except Exception as e:  # noqa: BLE001
        return {
            "name": name,
            "status": "failed",
            "summary": f"Could not run {name}: {e}",
            "error": str(e),
        }

    summary = _summarize_proposal(result.get("proposal") or {})

    return {
        "name": name,
        "action_id": result.get("action_id"),
        "status": result.get("status"),
        "auto_applied": result.get("auto_applied", False),
        "summary": summary,
        "proposal": result.get("proposal"),
    }


def tool_result_message(
    tool_call_id: str,
    tool_name: str,
    result: dict[str, Any],
) -> dict[str, Any]:
    """
    Build the OpenAI-format tool response message to feed back into
    the LLM's conversation history.
    """
    payload = {
        "name": tool_name,
        "status": result.get("status"),
        "summary": result.get("summary"),
        "action_id": result.get("action_id"),
        "auto_applied": result.get("auto_applied", False),
    }
    if result.get("error"):
        payload["error"] = result["error"]

    return {
        "role": "tool",
        "tool_call_id": tool_call_id,
        "content": json.dumps(payload),
    }
