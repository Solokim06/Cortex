import json
from typing import Any

from openai import AsyncOpenAI

from app.config.settings import settings
from app.i18n import DEFAULT_LOCALE, language_instruction, normalize_locale


_client: AsyncOpenAI | None = None


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.groq_api_key,
            base_url="https://api.groq.com/openai/v1",
        )
    return _client


def _inject_locale(system: str, locale: str) -> str:
    """
    Prepend a language directive to the system prompt.
    The directive is placed first so the LLM treats it as a global
    constraint, then the caller's system prompt sets the persona and
    rules for the specific task.
    """
    if normalize_locale(locale) == DEFAULT_LOCALE:
        return system

    directive = language_instruction(locale)
    if system:
        return f"{directive}\n\n{system}"
    return directive


async def call_llm(
    prompt: str,
    system: str = "",
    temperature: float = 0.2,
    max_tokens: int = 2000,
    json_mode: bool = False,
    locale: str = DEFAULT_LOCALE,
    history: list[dict] | None = None,
) -> str:
    client = get_client()
    locale = normalize_locale(locale)

    messages = []
    localized_system = _inject_locale(system, locale)
    if localized_system:
        messages.append({"role": "system", "content": localized_system})
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": prompt})

    kwargs: dict[str, Any] = {
        "model": settings.groq_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    response = await client.chat.completions.create(**kwargs)
    return response.choices[0].message.content or ""


async def call_llm_json(
    prompt: str,
    system: str = "",
    temperature: float = 0.2,
    max_tokens: int = 2000,
    locale: str = DEFAULT_LOCALE,
) -> dict:
    text = await call_llm(
        prompt=prompt,
        system=system,
        temperature=temperature,
        max_tokens=max_tokens,
        json_mode=True,
        locale=locale,
    )

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                pass
        return {}


async def test_ai_connection() -> str:
    response = await call_llm(
        prompt="Reply with exactly these three words: Cortex AI alive",
        temperature=0,
        max_tokens=200,
    )
    return response.strip()

async def stream_llm(
    prompt: str,
    system: str = "",
    temperature: float = 0.2,
    max_tokens: int = 2000,
    locale: str = DEFAULT_LOCALE,
    history: list[dict] | None = None,
):
    """
    Async generator that yields tokens from Groq as they arrive.

    Same parameters as call_llm, same locale injection. Use this when
    you want SSE-style progressive output --- the caller iterates:

        async for chunk in stream_llm(...):
            yield chunk   # a string, not JSON
    """
    from typing import AsyncIterator
    client = get_client()
    locale = normalize_locale(locale)

    messages = []
    localized_system = _inject_locale(system, locale)
    if localized_system:
        messages.append({"role": "system", "content": localized_system})
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": prompt})

    # OpenAI SDK v1.x: with stream=True, create() returns a coroutine
    # that resolves to an AsyncStream. We must await it to get the
    # stream object, then iterate the stream for chunks.
    stream = await client.chat.completions.create(
        model=settings.groq_model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=True,
    )

    async for event in stream:
        if not event.choices:
            continue
        delta = event.choices[0].delta
        if delta and delta.content:
            yield delta.content


# =====================================================================
# Tool-aware streaming (Tier 4 -- agentic actions)
# =====================================================================


def _build_messages(
    prompt: str,
    system: str,
    locale: str,
    history: list[dict] | None,
) -> list[dict]:
    """Shared message assembly for both stream_llm and stream_llm_with_tools."""
    messages: list[dict] = []
    localized_system = _inject_locale(system, locale)
    if localized_system:
        messages.append({"role": "system", "content": localized_system})
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": prompt})
    return messages


async def stream_llm_with_tools(
    prompt: str,
    system: str = "",
    temperature: float = 0.2,
    max_tokens: int = 2000,
    locale: str = DEFAULT_LOCALE,
    history: list[dict] | None = None,
    tools: list[dict] | None = None,
    tool_choice: str = "auto",
):
    """
    Async generator that yields structured events.

    Yields dicts:
      {"type": "token",     "text": "..."}
      {"type": "tool_call", "id": "...", "name": "...", "args": {...}}
      {"type": "done"}

    If `tools` is None, behaves exactly like stream_llm but wrapped in
    dict events. The tokenizer path is unchanged; only the outer wrapper
    differs.
    """
    client = get_client()
    locale = normalize_locale(locale)
    messages = _build_messages(prompt, system, locale, history)

    kwargs: dict = {
        "model": settings.groq_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
    }
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = tool_choice

    stream = await client.chat.completions.create(**kwargs)

    # Accumulate tool calls across deltas. Groq emits them piecewise,
    # same as OpenAI. Each tool call has {id, function: {name, arguments}}.
    tool_calls_acc: dict[int, dict] = {}

    async for event in stream:
        if not event.choices:
            continue
        delta = event.choices[0].delta

        # Regular text token
        if delta and delta.content:
            yield {"type": "token", "text": delta.content}

        # Tool call deltas
        if delta and getattr(delta, "tool_calls", None):
            for tc in delta.tool_calls:
                idx = tc.index or 0
                slot = tool_calls_acc.setdefault(idx, {
                    "id": "",
                    "name": "",
                    "arguments": "",
                })
                if tc.id:
                    slot["id"] = tc.id
                fn = getattr(tc, "function", None)
                if fn is not None:
                    if fn.name:
                        slot["name"] = fn.name
                    if fn.arguments:
                        slot["arguments"] += fn.arguments

    # Emit any accumulated tool calls
    for idx in sorted(tool_calls_acc.keys()):
        tc = tool_calls_acc[idx]
        if not tc["name"]:
            continue
        args = {}
        if tc["arguments"]:
            try:
                import json as _json
                args = _json.loads(tc["arguments"])
            except Exception:  # noqa: BLE001
                args = {}
        yield {
            "type": "tool_call",
            "id": tc["id"] or f"call_{idx}",
            "name": tc["name"],
            "args": args,
        }

    yield {"type": "done"}
