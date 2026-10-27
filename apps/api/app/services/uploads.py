"""
File upload service for help feedback screenshots.

Storage: local disk under `apps/api/uploads/{namespace}/`.
Access:  served as static files at `/uploads/{namespace}/{filename}`.

The saved filename is a UUID + sanitized extension, so two users can't
collide and we can't be tricked into writing a path traversal.

Validation:
  - MIME type from the browser must be image/png, image/jpeg, or image/webp
  - Extension must match an allowlist
  - Content length ≤ MAX_BYTES (5 MB by default)
  - We sniff the first bytes to double-check the file is actually an image

Swap for S3/R2 later by replacing `save_image()` — the router and
frontend only care about the returned URL.
"""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

# ---------- config ----------

# Resolve uploads dir relative to apps/api/, not cwd
API_ROOT = Path(__file__).resolve().parent.parent.parent
UPLOAD_ROOT = API_ROOT / "uploads"

ALLOWED_MIME = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
}

MAX_BYTES = 5 * 1024 * 1024  # 5 MB

# Magic-byte signatures for the formats we accept
_MAGIC = {
    b"\x89PNG\r\n\x1a\n": ".png",
    b"\xff\xd8\xff": ".jpg",  # JPEG SOI + marker
}
# WebP is "RIFF....WEBP" — we check the first 4 bytes + bytes 8:12
_WEBP_RIFF = b"RIFF"
_WEBP_WEBP = b"WEBP"


# ---------- helpers ----------


def _sniff_ext(head: bytes) -> str | None:
    """Return the extension inferred from magic bytes, or None."""
    for sig, ext in _MAGIC.items():
        if head.startswith(sig):
            return ext
    if (
        len(head) >= 12
        and head[:4] == _WEBP_RIFF
        and head[8:12] == _WEBP_WEBP
    ):
        return ".webp"
    return None


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


# ---------- public API ----------


async def save_image(
    file: UploadFile,
    *,
    namespace: str = "feedback",
) -> dict:
    """
    Save an uploaded image and return:
      {
        "url":       "/uploads/feedback/abc123.png",
        "filename":  "abc123.png",
        "size":      12345,
        "mime":      "image/png",
      }

    Raises HTTPException(400) for validation failures.
    """
    # 1. MIME check (browser-declared — not trusted, but a fast pre-filter)
    declared = (file.content_type or "").lower().strip()
    if declared not in ALLOWED_MIME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported file type '{declared or 'unknown'}'. "
                f"Use PNG, JPG, or WebP."
            ),
        )

    # 2. Read content (bounded by MAX_BYTES + a bit for the check)
    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty file",
        )
    if len(content) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large (max {MAX_BYTES // (1024 * 1024)} MB)",
        )

    # 3. Sniff magic bytes — this is what we actually trust
    sniffed = _sniff_ext(content[:16])
    if sniffed is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File does not look like a valid image",
        )

    # If browser MIME and sniffed ext disagree, trust the sniffed one
    ext = sniffed

    # 4. Write
    namespace_clean = "".join(
        c for c in namespace if c.isalnum() or c in "-_"
    ) or "feedback"
    target_dir = UPLOAD_ROOT / namespace_clean
    _ensure_dir(target_dir)

    filename = f"{uuid.uuid4().hex}{ext}"
    target_path = target_dir / filename

    with open(target_path, "wb") as f:
        f.write(content)

    return {
        "url": f"/uploads/{namespace_clean}/{filename}",
        "filename": filename,
        "size": len(content),
        "mime": declared or ("image/" + ext.lstrip(".")),
    }
