from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.services.voice import (
    SUPPORTED_EXTENSIONS,
    transcribe_and_capture,
    transcribe_audio,
)

router = APIRouter(prefix="/voice", tags=["voice"])

# 25 MB is Groq Whisper's max file size
MAX_FILE_SIZE = 25 * 1024 * 1024


async def _read_and_validate(file: UploadFile) -> bytes:
    """Read the uploaded file and validate size + extension."""
    # Extension check
    filename = file.filename or "audio.webm"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{ext}'. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    # Size check
    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty audio file.")
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(data) // 1024 // 1024} MB). Max is 25 MB.",
        )
    return data


# ---------- Endpoints ----------

@router.post("/transcribe")
async def transcribe_endpoint(
    file: UploadFile = File(...),
    language: str | None = Form(None),
    user: User = Depends(get_current_user),
):
    """Upload audio → get transcript. Does NOT save to Cortex."""
    data = await _read_and_validate(file)

    # Sanitize placeholder language value from Swagger
    if language and language.strip().lower() in {"string", "null", "none", ""}:
        language = None

    try:
        result = await transcribe_audio(
            audio_bytes=data,
            filename=file.filename or "audio.webm",
            language=language,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[Cortex] Transcribe failed: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")

    return result


@router.post("/capture")
async def capture_endpoint(
    file: UploadFile = File(...),
    title: str | None = Form(None),
    language: str | None = Form(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload audio → transcribe → capture into Cortex's knowledge graph.
    Extracts concepts, summary, embeddings automatically.
    """
    data = await _read_and_validate(file)

    # Sanitize placeholder language value from Swagger
    if language and language.strip().lower() in {"string", "null", "none", ""}:
        language = None

    try:
        result = await transcribe_and_capture(
            db=db,
            user_id=user.id,
            audio_bytes=data,
            filename=file.filename or "audio.webm",
            title=title,
            language=language,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[Cortex] Voice capture failed: {e}")
        raise HTTPException(status_code=500, detail=f"Voice capture failed: {e}")

    if result.get("error"):
        raise HTTPException(status_code=422, detail=result["error"])

    return result
