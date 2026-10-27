"""
Backend locale handling.

The locale arrives via the `X-Locale` header on every request.
Routers read it through the `get_locale` FastAPI dependency and
pass it down to services, which pass it to the LLM.

Two mechanisms translate backend output:

1. LLM-generated content — `call_llm(locale=...)` injects a
   "respond in <language>" instruction into the system prompt.

2. Hardcoded backend strings — `tr(key, locale)` looks up a
   short phrase in `MESSAGES` below.
"""

from fastapi import Header


SUPPORTED_LOCALES = {"en", "es", "fr", "de", "ar", "sw"}
DEFAULT_LOCALE = "en"


# Human-readable names used in the LLM prompt. Kept in English
# because the LLM instruction itself is in English.
LANGUAGE_NAMES = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "ar": "Arabic",
    "sw": "Swahili",
}


def normalize_locale(value: str | None) -> str:
    """Return a supported locale code, falling back to English."""
    if not value:
        return DEFAULT_LOCALE
    code = value.strip().lower()[:2]  # "es-MX" -> "es"
    return code if code in SUPPORTED_LOCALES else DEFAULT_LOCALE


async def get_locale(x_locale: str | None = Header(default=None)) -> str:
    """
    FastAPI dependency. Reads the `X-Locale` header and returns a
    normalized locale code.

    Usage in a router:

        from app.i18n import get_locale
        from fastapi import Depends

        @router.post("/chat")
        async def chat_endpoint(
            ...,
            locale: str = Depends(get_locale),
        ):
            ...
    """
    return normalize_locale(x_locale)


def language_instruction(locale: str) -> str:
    """
    System-prompt directive telling the LLM which language to respond in.
    Injected by `call_llm` at the top of every system prompt.
    """
    name = LANGUAGE_NAMES.get(locale, LANGUAGE_NAMES[DEFAULT_LOCALE])
    return (
        f"Always respond in {name} ({locale}). "
        f"Even if the user writes in another language, respond in {name}. "
        f"Do not translate proper nouns, code, or quoted material from "
        f"the user's captured knowledge."
    )


# ---------------------------------------------------------------------------
# Backend hardcoded strings
# ---------------------------------------------------------------------------

MESSAGES: dict[str, dict[str, str]] = {
    "not_in_knowledge_prefix": {
        "en": "I don't see this in your captured knowledge.",
        "es": "No veo esto en tu conocimiento capturado.",
        "fr": "Je ne vois pas cela dans vos connaissances capturées.",
        "de": "Ich sehe dies nicht in deinem erfassten Wissen.",
        "ar": "لا أرى هذا في معرفتك الملتقطة.",
        "sw": "Sioni hii katika maarifa yako uliyonasa.",
    },
    "general_knowledge_prefix": {
        "en": "From general knowledge:",
        "es": "Desde conocimiento general:",
        "fr": "D'après les connaissances générales :",
        "de": "Aus allgemeinem Wissen:",
        "ar": "من المعرفة العامة:",
        "sw": "Kutoka maarifa ya jumla:",
    },
    "no_knowledge_captured": {
        "en": "The user has not captured any knowledge yet.",
        "es": "El usuario aún no ha capturado ningún conocimiento.",
        "fr": "L'utilisateur n'a pas encore capturé de connaissances.",
        "de": "Der Benutzer hat noch kein Wissen erfasst.",
        "ar": "لم يلتقط المستخدم أي معرفة بعد.",
        "sw": "Mtumiaji hajanasa maarifa yoyote bado.",
    },
    "untitled": {
        "en": "(untitled)",
        "es": "(sin título)",
        "fr": "(sans titre)",
        "de": "(ohne Titel)",
        "ar": "(بدون عنوان)",
        "sw": "(bila kichwa)",
    },
}


def tr(key: str, locale: str) -> str:
    """Look up a hardcoded backend string by key."""
    locale = normalize_locale(locale)
    return MESSAGES.get(key, {}).get(locale, MESSAGES.get(key, {}).get(DEFAULT_LOCALE, key))
