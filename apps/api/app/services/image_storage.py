"""
Private image file storage.

Images live OUTSIDE the public /uploads static mount so they cannot be
fetched by URL guessing. Access goes through the auth-gated
/files/image/<node_id> route, which verifies ownership.

Path scheme:
    private_images/<user_id>/<node_id>.<ext>

Mirror of video_storage.py — keep the two in sync when either changes.
"""

from pathlib import Path

from app.config.settings import get_settings


_ROOT = Path(__file__).resolve().parent.parent.parent  # apps/api/

_MIME_BY_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".tiff": "image/tiff",
    ".heic": "image/heic",
    ".heif": "image/heif",
}

# 25 MB cap — comfortably above any real screenshot, well below anything odd
_MAX_IMAGE_BYTES = 25 * 1024 * 1024


def _storage_root() -> Path:
    s = get_settings()
    configured = getattr(s, "image_storage_dir", None)
    root = _ROOT / (configured or "private_images")
    root.mkdir(parents=True, exist_ok=True)
    return root


def _user_dir(user_id: str) -> Path:
    d = _storage_root() / str(user_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _sanitize_ext(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in _MIME_BY_EXT:
        return ".png"
    return ext


def mime_for(path: Path) -> str:
    return _MIME_BY_EXT.get(path.suffix.lower(), "application/octet-stream")


def save_image(
    user_id: str,
    node_id: str,
    filename: str,
    data: bytes,
) -> str:
    """
    Persist an image to disk and return the URL path to serve it.

    Overwrites any existing file for the same node_id (any extension).
    Raises ValueError if the file exceeds the size cap.
    """
    if len(data) > _MAX_IMAGE_BYTES:
        raise ValueError(
            f"Image too large: {len(data) // 1024 // 1024} MB "
            f"> {_MAX_IMAGE_BYTES // 1024 // 1024} MB"
        )

    ext = _sanitize_ext(filename)
    target = _user_dir(user_id) / f"{node_id}{ext}"

    # Remove any prior upload with a different extension
    for old in _user_dir(user_id).glob(f"{node_id}.*"):
        if old != target:
            try:
                old.unlink()
            except Exception:
                pass

    target.write_bytes(data)
    return f"/files/image/{node_id}"


def find_image(user_id: str, node_id: str) -> Path | None:
    """Locate the stored image file for a node, regardless of extension."""
    d = _storage_root() / str(user_id)
    if not d.exists():
        return None
    for candidate in d.glob(f"{node_id}.*"):
        if candidate.is_file():
            return candidate
    return None


def delete_image(user_id: str, node_id: str) -> bool:
    """Remove any stored image for this node. Returns True if something was removed."""
    d = _storage_root() / str(user_id)
    if not d.exists():
        return False
    removed = False
    for candidate in d.glob(f"{node_id}.*"):
        try:
            candidate.unlink()
            removed = True
        except Exception:
            pass
    return removed
