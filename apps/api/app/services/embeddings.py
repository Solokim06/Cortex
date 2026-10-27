import asyncio
import hashlib

import httpx

from app.config.settings import settings


GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent"
VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# ---------- Gemini ----------

async def _gemini_embed_one(text: str, retries: int = 3) -> list[float]:
    """Embed a single string using Google Gemini's gemini-embedding-001."""
    if not text or not text.strip():
        return [0.0] * settings.embedding_dim

    url = GEMINI_URL.format(model=settings.embedding_model)
    last_error: Exception | None = None

    for attempt in range(retries):
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(
                    url,
                    params={"key": settings.gemini_api_key},
                    headers={"Content-Type": "application/json"},
                    json={
                        "model": f"models/{settings.embedding_model}",
                        "content": {
                            "parts": [{"text": text[:8000]}],
                        },
                        "taskType": "RETRIEVAL_DOCUMENT",
                        "outputDimensionality": settings.embedding_dim,
                    },
                )
                if r.status_code == 429:
                    wait = 2 ** attempt
                    print(f"[Cortex] Gemini 429, waiting {wait}s...")
                    await asyncio.sleep(wait)
                    continue
                if r.status_code >= 400:
                    print(f"[Cortex] Gemini error {r.status_code}: {r.text[:300]}")
                r.raise_for_status()
                data = r.json()
                return data["embedding"]["values"]
        except httpx.HTTPError as e:
            last_error = e
            await asyncio.sleep(1 + attempt)

    if last_error:
        raise last_error
    raise RuntimeError("Gemini embedding failed after retries")


# ---------- Voyage (kept as fallback) ----------

async def _voyage_embed_one(text: str, retries: int = 3) -> list[float]:
    """Embed a single string using Voyage AI."""
    if not text or not text.strip():
        return [0.0] * 512

    last_error: Exception | None = None

    for attempt in range(retries):
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(
                    VOYAGE_URL,
                    headers={
                        "Authorization": f"Bearer {settings.voyage_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "input": [text[:8000]],
                        "model": "voyage-3-lite",
                    },
                )
                if r.status_code == 429:
                    wait = 2 ** attempt
                    print(f"[Cortex] Voyage 429, waiting {wait}s...")
                    await asyncio.sleep(wait)
                    continue
                r.raise_for_status()
                data = r.json()
                return data["data"][0]["embedding"]
        except httpx.HTTPError as e:
            last_error = e
            await asyncio.sleep(1 + attempt)

    if last_error:
        raise last_error
    raise RuntimeError("Voyage embedding failed after retries")


# ---------- Public API ----------

async def embed_one(
    text: str,
    retries: int = 3,
    *,
    db=None,
    user_id: str | None = None,
) -> list[float]:
    """
    Embed a single string using the configured provider.

    If `db` and `user_id` are provided and AI processing is disabled
    for that user, returns an empty vector (no embedding computed).
    Callers should treat an empty return as "no embedding available".
    """
    # Consent gate (only when caller supplies user context)
    if db is not None and user_id is not None:
        try:
            from app.services.consent import is_ai_processing_allowed
            if not await is_ai_processing_allowed(db, str(user_id)):
                return []
        except Exception:
            # Fail-open: if consent lookup breaks, don't block embeddings
            pass

    provider = settings.embedding_provider.lower()

    if provider == "gemini":
        return await _gemini_embed_one(text, retries)
    elif provider == "voyage":
        return await _voyage_embed_one(text, retries)
    else:
        raise ValueError(f"Unknown embedding provider: {provider}")


async def embed_many(texts: list[str]) -> list[list[float]]:
    """Embed multiple strings. Sequential for Gemini."""
    if not texts:
        return []

    provider = settings.embedding_provider.lower()

    if provider == "gemini":
        results: list[list[float]] = []
        for t in texts:
            results.append(await _gemini_embed_one(t))
            await asyncio.sleep(0.1)
        return results

    cleaned = [t[:8000] if t and t.strip() else " " for t in texts]
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            VOYAGE_URL,
            headers={
                "Authorization": f"Bearer {settings.voyage_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "input": cleaned,
                "model": "voyage-3-lite",
            },
        )
        r.raise_for_status()
        data = r.json()
        return [item["embedding"] for item in data["data"]]


def content_hash(text: str) -> str:
    return _hash(text or "")
