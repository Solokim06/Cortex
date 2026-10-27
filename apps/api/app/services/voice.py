import os
import tempfile
from pathlib import Path

from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.db.models import Node
from app.services.capture import capture_text
from app.services.capture_kind import classify_capture


# Groq exposes an OpenAI-compatible audio API
_client: AsyncOpenAI | None = None

# Whisper on Groq: 25 MB max file size, common audio formats
WHISPER_MODEL = "whisper-large-v3-turbo"
SUPPORTED_EXTENSIONS = {".webm", ".mp3", ".wav", ".m4a", ".ogg", ".flac", ".mpga", ".mp4"}


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.groq_api_key,
            base_url="https://api.groq.com/openai/v1",
        )
    return _client


async def transcribe_audio(
    audio_bytes: bytes,
    filename: str,
    language: str | None = None,
) -> dict:
    """
    Transcribe raw audio bytes using Groq Whisper.

    Returns:
        {
            "text": "...",
            "language": "en",
            "duration": 12.3,
            "segments": [{"start": 0.0, "end": 2.5, "text": "..."}, ...],
        }
    """
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported audio format: {ext}. "
            f"Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    # Whisper API needs a file-like object with a name
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    try:
        tmp.write(audio_bytes)
        tmp.flush()
        tmp.close()

        with open(tmp.name, "rb") as f:
            kwargs = {
                "model": WHISPER_MODEL,
                "file": (filename, f, "audio/" + ext.lstrip(".")),
                "response_format": "verbose_json",
            }
            if language:
                kwargs["language"] = language

            result = await get_client().audio.transcriptions.create(**kwargs)

        # Groq returns an object; convert to dict-like access safely
        text = getattr(result, "text", "") or ""
        detected_lang = getattr(result, "language", None) or language or "en"
        duration = getattr(result, "duration", None)

        # Extract timestamped segments (available with response_format=verbose_json).
        # Each segment looks like {"id": 0, "start": 0.0, "end": 2.5, "text": "..."}.
        raw_segments = getattr(result, "segments", None) or []
        segments: list[dict] = []
        for s in raw_segments:
            try:
                segments.append({
                    "start": float(getattr(s, "start", 0.0)),
                    "end": float(getattr(s, "end", 0.0)),
                    "text": str(getattr(s, "text", "") or "").strip(),
                })
            except Exception:
                continue

        return {
            "text": text.strip(),
            "language": detected_lang,
            "duration": float(duration) if duration is not None else None,
            "segments": segments,
        }
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass


async def transcribe_and_capture(
    db: AsyncSession,
    user_id: str,
    audio_bytes: bytes,
    filename: str,
    title: str | None = None,
    language: str | None = None,
) -> dict:
    """
    Full pipeline: transcribe the audio, then capture the transcript
    into the knowledge graph (concepts + embeddings included).
    """
    # 1. Transcribe
    result = await transcribe_audio(audio_bytes, filename, language=language)
    transcript = result["text"]

    if not transcript.strip():
        return {
            "transcript": "",
            "language": result["language"],
            "duration": result["duration"],
            "node": None,
            "error": "Empty transcript — nothing captured.",
        }

    # 2. Auto-title from the transcript if none provided
    if not title:
        words = transcript.split()
        title = " ".join(words[:8]) + ("..." if len(words) > 8 else "")

    # 3. Capture into knowledge graph
    node: Node = await capture_text(
        db=db,
        user_id=user_id,
        text=transcript,
        title=title,
        source_type="voice",
    )

    # 4. Attach voice metadata
    node.meta = {
        **(node.meta or {}),
        "source_type": "voice",
        "language": result["language"],
        "duration_seconds": result["duration"],
        "original_filename": filename,
        "transcript_segments": result.get("segments") or [],
    }

    # 5. Classify the capture kind (5.2)
    # (gated by AI processing consent)
    from app.services.consent import is_ai_processing_allowed
    if await is_ai_processing_allowed(db, str(user_id)):
        try:
            classification = await classify_capture(
                text=transcript,
                source_type="voice",
                locale=language or "en",
            )
            node.meta = {
                **(node.meta or {}),
                "capture_classification": classification,
            }
        except Exception as e:
            print(f"[Cortex] Voice classification failed: {e}")

    await db.commit()
    await db.refresh(node)

    return {
        "transcript": transcript,
        "language": result["language"],
        "duration": result["duration"],
        "node": {
            "id": str(node.id),
            "title": node.title,
            "content": node.content,
            "summary": node.summary,
            "created_at": node.created_at.isoformat(),
        },
        "error": None,
    }
