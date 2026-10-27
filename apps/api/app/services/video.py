"""
Video → transcript pipeline.

Uses ffmpeg to strip the audio track from a video file, then sends
the extracted audio to Groq's Whisper for transcription.

Requires ffmpeg on PATH (installed via winget earlier).
"""

import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from app.config.settings import get_settings
from app.services.ai import call_llm_json
from app.services.voice import transcribe_audio


# Groq Whisper limits: 25 MB, common audio formats
# We extract as FLAC first (lossless, small enough for most videos),
# but fall back to MP3 if FLAC is too big.
MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25 MB

# Whisper supported formats (final output we send to Groq)
WHISPER_SAFE_EXT = ".mp3"


def _ffmpeg_available() -> bool:
    """Check if ffmpeg is on PATH."""
    return shutil.which("ffmpeg") is not None


def _ffprobe_duration(video_path: str) -> float | None:
    """Get video duration in seconds via ffprobe (comes with ffmpeg)."""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                video_path,
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if result.returncode == 0:
            return float(result.stdout.strip())
    except Exception:
        pass
    return None


def _extract_audio(
    video_path: str,
    output_path: str,
) -> bool:
    """
    Extract audio track from a video file using ffmpeg.

    Returns True on success, False on failure.
    """
    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-y",  # overwrite
                "-i",
                video_path,
                "-vn",  # no video
                "-acodec",
                "libmp3lame",  # MP3 codec (widely supported by Whisper)
                "-ar",
                "16000",  # 16 kHz mono — ideal for Whisper
                "-ac",
                "1",
                "-b:a",
                "64k",  # low bitrate keeps file small
                output_path,
            ],
            capture_output=True,
            text=True,
            timeout=600,  # 10 min max
        )
        return result.returncode == 0 and os.path.exists(output_path)
    except subprocess.TimeoutExpired:
        print("[Cortex] ffmpeg timed out extracting audio")
        return False
    except Exception as e:
        print(f"[Cortex] ffmpeg error: {e}")
        return False


async def extract_video_transcript(
    video_bytes: bytes,
    filename: str,
    *,
    moments_allowed: bool = True,
) -> dict[str, Any]:
    """
    Extract audio from a video and transcribe it.

    Returns:
        {
            "text": str,
            "language": str | None,
            "duration": float | None,
            "transcript_segments": list[dict],   # [{start, end, text}, ...]
            "key_moments": list[dict],           # [{start, end, label, why}, ...]
            "error": str | None,
        }
    """
    if not _ffmpeg_available():
        return {
            "text": "",
            "language": None,
            "duration": None,
            "transcript_segments": [],
            "key_moments": [],
            "error": "ffmpeg is not installed or not on PATH.",
        }

    # Write video to temp file
    video_tmp = tempfile.NamedTemporaryFile(
        delete=False,
        suffix=Path(filename).suffix or ".mp4",
    )
    audio_tmp = tempfile.NamedTemporaryFile(
        delete=False,
        suffix=WHISPER_SAFE_EXT,
    )
    video_tmp.close()
    audio_tmp.close()

    try:
        with open(video_tmp.name, "wb") as f:
            f.write(video_bytes)

        duration = _ffprobe_duration(video_tmp.name)

        # Extract audio
        success = _extract_audio(video_tmp.name, audio_tmp.name)

        if not success:
            return {
                "text": "",
                "language": None,
                "duration": duration,
                "transcript_segments": [],
                "key_moments": [],
                "error": "Failed to extract audio from video.",
            }

        # Check audio file size
        audio_size = os.path.getsize(audio_tmp.name)
        if audio_size == 0:
            return {
                "text": "",
                "language": None,
                "duration": duration,
                "transcript_segments": [],
                "key_moments": [],
                "error": "Extracted audio was empty.",
            }

        if audio_size > MAX_AUDIO_BYTES:
            # Would need to split into chunks. For now, reject with a clear message.
            return {
                "text": "",
                "language": None,
                "duration": duration,
                "transcript_segments": [],
                "key_moments": [],
                "error": (
                    f"Video audio is too large for a single transcription "
                    f"({audio_size // 1024 // 1024} MB > 25 MB). "
                    f"Try a shorter clip."
                ),
            }

        # Read audio and send to Whisper
        with open(audio_tmp.name, "rb") as f:
            audio_bytes = f.read()

        result = await transcribe_audio(
            audio_bytes=audio_bytes,
            filename=f"extracted-from-{filename}",
        )

        segments = result.get("segments") or []

        # Detect key moments from the timestamped transcript.
        # Never raises -- returns [] on any failure or when the transcript
        # is too short to bother with. Skipped if AI processing is off.
        moments: list[dict] = []
        if moments_allowed:
            try:
                moments = await detect_key_moments(segments)
            except Exception as e:
                print(f"[Cortex] Key moment detection failed: {e}")

        return {
            "text": result.get("text", ""),
            "language": result.get("language"),
            "duration": duration or result.get("duration"),
            "transcript_segments": segments,
            "key_moments": moments,
            "error": None,
        }

    except Exception as e:
        print(f"[Cortex] Video extraction failed: {e}")
        return {
            "text": "",
            "language": None,
            "duration": None,
            "transcript_segments": [],
            "key_moments": [],
            "error": f"Video processing failed: {type(e).__name__}: {e}",
        }
    finally:
        # Clean up temp files
        for path in (video_tmp.name, audio_tmp.name):
            try:
                if os.path.exists(path):
                    os.unlink(path)
            except Exception:
                pass


def is_video_available() -> bool:
    """Check whether video processing is available (ffmpeg installed)."""
    return _ffmpeg_available()


# ---------- Key moments (Tier 5.3) ----------

KEY_MOMENTS_SYSTEM = """You identify key moments in a video transcript for a personal knowledge system.

A key moment is one of:
  topic_shift -- the speaker moves to a new subject
  decision    -- a choice is made or announced
  question    -- an open question is raised
  action      -- a task or next step is stated
  quote       -- a memorable or quotable line

You will receive a numbered list of transcript segments with timestamps.
Return ONLY a JSON object of the form:

{
  "moments": [
    {"segment_index": 2, "label": "topic_shift", "why": "moves from setup to the main argument"},
    {"segment_index": 7, "label": "decision", "why": "commits to shipping by Friday"}
  ]
}

Rules:
- Return at most 8 moments. Fewer is fine.
- Use only the labels listed above.
- segment_index is the bracketed number from the input.
- "why" is one short sentence (max 15 words).
- If nothing stands out, return {"moments": []}.
- Return ONLY the JSON object. No commentary."""


async def detect_key_moments(segments: list[dict]) -> list[dict]:
    """
    Run an LLM pass over transcript segments to identify key moments.

    Returns a list of dicts:
      [{"start": float, "end": float, "label": str, "why": str}, ...]

    Never raises -- on any failure returns an empty list.
    """
    s = get_settings()
    if not s.video_key_moments_enabled:
        return []

    if not segments:
        return []

    # Combine text for word-count gating
    combined_words = sum(len((seg.get("text") or "").split()) for seg in segments)
    if combined_words < s.video_key_moments_min_words:
        return []

    # Build the numbered list for the LLM
    numbered_lines = []
    for i, seg in enumerate(segments):
        start = float(seg.get("start", 0.0))
        text = (seg.get("text") or "").strip()
        numbered_lines.append(f"[{i}] {start:.1f}s: {text}")

    prompt = (
        "Transcript segments:\n\n"
        + "\n".join(numbered_lines)
        + "\n\nIdentify the key moments."
    )

    try:
        raw = await call_llm_json(
            prompt=prompt,
            system=KEY_MOMENTS_SYSTEM,
            temperature=0.2,
            max_tokens=s.video_key_moments_max_tokens,
        )
    except Exception as e:
        print(f"[Cortex] Key moment detection failed: {e}")
        return []

    moments_in = raw.get("moments") if isinstance(raw, dict) else None
    if not isinstance(moments_in, list):
        return []

    valid_labels = {"topic_shift", "decision", "question", "action", "quote"}
    out: list[dict] = []
    for m in moments_in:
        if not isinstance(m, dict):
            continue
        try:
            idx = int(m.get("segment_index"))
        except (TypeError, ValueError):
            continue
        if idx < 0 or idx >= len(segments):
            continue
        label = str(m.get("label", "")).strip().lower()
        if label not in valid_labels:
            continue
        why = str(m.get("why", "")).strip()[:200]
        seg = segments[idx]
        out.append({
            "start": float(seg.get("start", 0.0)),
            "end": float(seg.get("end", 0.0)),
            "label": label,
            "why": why,
        })

    return out[:8]
