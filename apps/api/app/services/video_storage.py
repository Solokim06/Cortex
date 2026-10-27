"""
Video file storage.

Videos live OUTSIDE the public /uploads static mount so they cannot
be fetched by URL guessing. Every access goes through the auth-gated
/files/video/<node_id> route, which verifies ownership.

Path scheme:
    private_videos/<user_id>/<node_id>.<ext>
"""

import shutil
from pathlib import Path

from app.config.settings import get_settings


# Resolve once at import time. Prefer a setting if provided, else default.
_ROOT = Path(__file__).resolve().parent.parent.parent  # apps/api/

_MIME_BY_EXT = {
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
}

# Upload cap mirrors MAX_FILE_SIZE in routers/capture.py
_MAX_VIDEO_BYTES = 100 * 1024 * 1024


def _storage_root() -> Path:
    """
    Root directory for private video storage.

    Uses settings.video_storage_dir if set (relative to apps/api/),
    else falls back to private_videos/.
    """
    s = get_settings()
    configured = getattr(s, "video_storage_dir", None)
    if configured:
        # If configured value starts with "uploads/", honor it but warn --
        # that path is under the public static mount.
        root = _ROOT / configured
    else:
        root = _ROOT / "private_videos"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _user_dir(user_id: str) -> Path:
    d = _storage_root() / str(user_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _sanitize_ext(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in _MIME_BY_EXT:
        # Default to mp4 rather than risk a weird extension
        return ".mp4"
    return ext


def mime_for(path: Path) -> str:
    return _MIME_BY_EXT.get(path.suffix.lower(), "application/octet-stream")


def save_video(
    user_id: str,
    node_id: str,
    filename: str,
    data: bytes,
) -> str:
    """
    Persist a video to disk and return the URL path to serve it.

    Overwrites any existing file for the same node_id (any extension).
    Raises ValueError if the file exceeds the size cap.
    """
    if len(data) > _MAX_VIDEO_BYTES:
        raise ValueError(
            f"Video too large: {len(data) // 1024 // 1024} MB "
            f"> {_MAX_VIDEO_BYTES // 1024 // 1024} MB"
        )

    ext = _sanitize_ext(filename)
    target = _user_dir(user_id) / f"{node_id}{ext}"

    # If a prior upload exists with a different extension, remove it
    for old in _user_dir(user_id).glob(f"{node_id}.*"):
        if old != target:
            try:
                old.unlink()
            except Exception:
                pass

    target.write_bytes(data)
    return f"/files/video/{node_id}"


def find_video(user_id: str, node_id: str) -> Path | None:
    """Locate the stored video file for a node, regardless of extension."""
    d = _storage_root() / str(user_id)
    if not d.exists():
        return None
    for candidate in d.glob(f"{node_id}.*"):
        if candidate.is_file():
            return candidate
    return None


def delete_video(user_id: str, node_id: str) -> bool:
    """Remove any stored video for this node. Returns True if something was removed."""
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
