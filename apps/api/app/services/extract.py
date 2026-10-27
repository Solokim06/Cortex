"""
Multi-format text extraction.

Takes any supported file (or URL) and returns clean text ready to be
captured into the knowledge graph. Dispatches per file type.
"""

import io
import json
from pathlib import Path
from typing import Any

# Text / docs
import pypdf
from docx import Document as DocxDocument
import pandas as pd

# Images
from PIL import Image
import pillow_heif  # registers HEIC support with PIL

# URLs
from readability import Document as ReadabilityDocument
from bs4 import BeautifulSoup

from app.services.vision import extract_image_text
from app.services.video import extract_video_transcript
from app.services.voice import transcribe_audio


# Supported extensions grouped by handler
TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".log", ".csv", ".json", ".yaml", ".yml"}
PDF_EXTENSIONS = {".pdf"}
DOCX_EXTENSIONS = {".docx"}
SPREADSHEET_EXTENSIONS = {".xlsx", ".xls"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff", ".heic", ".heif"}
AUDIO_EXTENSIONS = {".m4a", ".mp3", ".wav", ".webm", ".ogg", ".flac", ".aac", ".opus"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".mkv"}


def supported_extensions() -> dict[str, list[str]]:
    """Return a map of category → extensions, for frontend validation."""
    return {
        "text": sorted(TEXT_EXTENSIONS),
        "pdf": sorted(PDF_EXTENSIONS),
        "docx": sorted(DOCX_EXTENSIONS),
        "spreadsheet": sorted(SPREADSHEET_EXTENSIONS),
        "image": sorted(IMAGE_EXTENSIONS),
        "audio": sorted(AUDIO_EXTENSIONS),
        "video": sorted(VIDEO_EXTENSIONS),
    }


def _ext(filename: str) -> str:
    """Return the lowercase extension including the dot."""
    return Path(filename).suffix.lower()


# ---------- Text ----------

def _extract_text(data: bytes) -> str:
    """UTF-8 with a latin-1 fallback for weird encodings."""
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("latin-1", errors="replace")


# ---------- PDF ----------

def _extract_pdf(data: bytes) -> tuple[str, dict[str, Any]]:
    reader = pypdf.PdfReader(io.BytesIO(data))
    pages = []
    for i, page in enumerate(reader.pages):
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        if text.strip():
            pages.append(f"--- Page {i + 1} ---\n{text}")

    full_text = "\n\n".join(pages).strip()
    metadata = {
        "pages": len(reader.pages),
        "extracted_pages": len(pages),
        "pdf_metadata": (reader.metadata or {}).get("/Title") if reader.metadata else None,
    }
    return full_text, metadata


# ---------- DOCX ----------

def _extract_docx(data: bytes) -> tuple[str, dict[str, Any]]:
    doc = DocxDocument(io.BytesIO(data))

    parts: list[str] = []
    for para in doc.paragraphs:
        if para.text.strip():
            parts.append(para.text)

    # Also pull tables as plain text
    for table in doc.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells]
            parts.append(" | ".join(cells))

    full_text = "\n".join(parts).strip()
    metadata = {
        "paragraphs": len(doc.paragraphs),
        "tables": len(doc.tables),
    }
    return full_text, metadata


# ---------- Spreadsheet ----------

def _extract_spreadsheet(data: bytes, filename: str) -> tuple[str, dict[str, Any]]:
    ext = _ext(filename)

    if ext == ".csv":
        df = pd.read_csv(io.BytesIO(data))
        sheets = {"Sheet1": df}
    else:
        # .xlsx / .xls
        sheets = pd.read_excel(io.BytesIO(data), sheet_name=None)

    parts: list[str] = []
    total_rows = 0

    for sheet_name, df in sheets.items():
        parts.append(f"## Sheet: {sheet_name}")
        parts.append(f"({len(df)} rows × {len(df.columns)} columns)")
        parts.append("")

        # Convert to markdown table (limit rows to keep node size reasonable)
        max_rows = 200
        preview = df.head(max_rows)
        parts.append(preview.to_markdown(index=False))

        if len(df) > max_rows:
            parts.append(f"\n... ({len(df) - max_rows} more rows truncated)")

        parts.append("")
        total_rows += len(df)

    full_text = "\n".join(parts).strip()
    metadata = {
        "sheets": list(sheets.keys()),
        "total_rows": total_rows,
    }
    return full_text, metadata


# ---------- Image ----------

async def _extract_image(
    data: bytes,
    filename: str,
    annotations: list[dict[str, Any]] | None = None,
    *,
    vision_allowed: bool = True,
) -> tuple[str, dict[str, Any]]:
    # Open with PIL to get dimensions + confirm validity
    try:
        with Image.open(io.BytesIO(data)) as img:
            width, height = img.size
            format_name = img.format or "unknown"
    except Exception as e:
        return "", {"error": f"Invalid image: {e}"}

    # AI consent gate: if disabled, skip the vision call and save
    # the image as an unanalyzed file.
    if not vision_allowed:
        return (
            f"# Image: {filename}\n\n"
            "(image uploaded; AI processing is disabled, so no analysis ran)",
            {
                "width": width,
                "height": height,
                "format": format_name,
                "image_analysis": {"skipped": "ai_processing_disabled"},
            },
        )

    # If the caller supplied annotations, format them as LLM context so
    # Gemini focuses its extraction on the marked regions.
    annotation_context = ""
    if annotations:
        from app.services.annotations import format_annotations_for_llm
        annotation_context = format_annotations_for_llm(
            annotations, width, height
        )

    # Hand off to Gemini Vision (returns (content, image_analysis))
    text, image_analysis = await extract_image_text(
        data, filename, annotation_context=annotation_context
    )

    metadata: dict[str, Any] = {
        "width": width,
        "height": height,
        "format": format_name,
        "image_analysis": image_analysis,
    }
    if annotations:
        metadata["annotations"] = annotations
    return text, metadata


# ---------- Audio ----------

async def _extract_audio(data: bytes, filename: str) -> tuple[str, dict[str, Any]]:
    result = await transcribe_audio(data, filename)
    return result.get("text", ""), {
        "language": result.get("language"),
        "duration": result.get("duration"),
    }


# ---------- Video ----------

async def _extract_video(
    data: bytes, filename: str, *, moments_allowed: bool = True
) -> tuple[str, dict[str, Any]]:
    result = await extract_video_transcript(
        data, filename, moments_allowed=moments_allowed
    )
    return result.get("text", ""), {
        "language": result.get("language"),
        "duration": result.get("duration"),
        "video_analysis": {
            "transcript_segments": result.get("transcript_segments") or [],
            "key_moments": result.get("key_moments") or [],
        },
    }


# ---------- URL ----------

async def extract_url(url: str) -> dict[str, Any]:
    """
    Fetch a URL and extract the main article text + OG metadata
    (title, description, image, site name, favicon).
    Returns the same shape as file extraction.
    """
    import httpx
    from urllib.parse import urlparse, urljoin

    try:
        async with httpx.AsyncClient(
            timeout=15,
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; Cortex/1.0; +https://cortex.local)"
            },
        ) as client:
            r = await client.get(url)
            r.raise_for_status()
            html = r.text
            final_url = str(r.url)
    except Exception as e:
        return {
            "text": "",
            "source_type": "url",
            "metadata": {"url": url, "error": str(e)},
            "error": f"Failed to fetch URL: {e}",
        }

    try:
        # ── OG / meta scraping (before Readability mangles the <head>) ──
        head_soup = BeautifulSoup(html, "lxml")

        def _meta(prop: str, attr: str = "property") -> str | None:
            tag = head_soup.find("meta", attrs={attr: prop})
            if tag and tag.get("content"):
                return str(tag["content"]).strip()
            return None

        og_title = _meta("og:title") or _meta("twitter:title")
        og_description = (
            _meta("og:description")
            or _meta("twitter:description")
            or _meta("description", attr="name")
        )
        og_image = _meta("og:image") or _meta("twitter:image")
        og_site_name = _meta("og:site_name")
        html_title_tag = head_soup.find("title")
        html_title = html_title_tag.get_text(strip=True) if html_title_tag else None

        # Favicon — try common <link rel> patterns first, fall back to /favicon.ico
        favicon: str | None = None
        for rel in ("icon", "shortcut icon", "apple-touch-icon"):
            link = head_soup.find(
                "link",
                rel=lambda v: v and rel in (v if isinstance(v, list) else [v]),
            )
            if link and link.get("href"):
                favicon = urljoin(final_url, str(link["href"]))
                break
        if not favicon:
            parsed = urlparse(final_url)
            favicon = f"{parsed.scheme}://{parsed.netloc}/favicon.ico"

        # Make og:image absolute
        if og_image and not og_image.startswith(("http://", "https://")):
            og_image = urljoin(final_url, og_image)

        # ── Readability for main article text ──
        doc = ReadabilityDocument(html)
        title = doc.title() or og_title or html_title or ""
        main_html = doc.summary()

        soup = BeautifulSoup(main_html, "lxml")
        text = soup.get_text(separator="\n", strip=True)

        full_text = f"# {title}\n\n{text}" if title else text

        domain = urlparse(final_url).netloc

        return {
            "text": full_text.strip(),
            "source_type": "url",
            "metadata": {
                "url": final_url,
                "domain": domain,
                "title": title,
                "description": og_description,
                "site_name": og_site_name,
                "image": og_image,
                "favicon": favicon,
                "content_length": len(full_text),
            },
            "error": None,
        }
    except Exception as e:
        return {
            "text": "",
            "source_type": "url",
            "metadata": {"url": url, "error": str(e)},
            "error": f"Failed to parse URL content: {e}",
        }


# ---------- Dispatcher ----------

async def extract_from_file(
    data: bytes,
    filename: str,
    annotations: list[dict[str, Any]] | None = None,
    *,
    vision_allowed: bool = True,
) -> dict[str, Any]:
    """
    Extract text from any supported file.

    Returns:
        {
            "text": str,
            "source_type": str,  # e.g. "file_pdf", "image", "video"
            "metadata": dict,
            "error": str | None,
        }
    """
    ext = _ext(filename)

    try:
        # Text-ish files
        if ext in TEXT_EXTENSIONS:
            text = _extract_text(data)
            return {
                "text": text,
                "source_type": f"file_{ext.lstrip('.')}",
                "metadata": {"filename": filename, "size": len(data)},
                "error": None,
            }

        # PDF
        if ext in PDF_EXTENSIONS:
            text, meta = _extract_pdf(data)
            return {
                "text": text,
                "source_type": "file_pdf",
                "metadata": {"filename": filename, **meta},
                "error": None if text else "PDF had no extractable text.",
            }

        # DOCX
        if ext in DOCX_EXTENSIONS:
            text, meta = _extract_docx(data)
            return {
                "text": text,
                "source_type": "file_docx",
                "metadata": {"filename": filename, **meta},
                "error": None if text else "DOCX had no extractable text.",
            }

        # Spreadsheet
        if ext in SPREADSHEET_EXTENSIONS:
            text, meta = _extract_spreadsheet(data, filename)
            return {
                "text": text,
                "source_type": "file_spreadsheet",
                "metadata": {"filename": filename, **meta},
                "error": None if text else "Spreadsheet had no data.",
            }

        # Image
        if ext in IMAGE_EXTENSIONS:
            text, meta = await _extract_image(
                data, filename,
                annotations=annotations,
                vision_allowed=vision_allowed,
            )
            return {
                "text": text,
                "source_type": "image",
                "metadata": {"filename": filename, **meta},
                "error": None if text else "Image produced no text.",
            }

        # Audio
        if ext in AUDIO_EXTENSIONS:
            text, meta = await _extract_audio(data, filename)
            return {
                "text": text,
                "source_type": "audio",
                "metadata": {"filename": filename, **meta},
                "error": None if text else "Audio transcription produced no text.",
            }

        # Video
        if ext in VIDEO_EXTENSIONS:
            text, meta = await _extract_video(
                data, filename, moments_allowed=vision_allowed
            )
            return {
                "text": text,
                "source_type": "video",
                "metadata": {"filename": filename, **meta},
                "error": None if text else "Video produced no transcript.",
            }

        # Unsupported
        return {
            "text": "",
            "source_type": "unsupported",
            "metadata": {"filename": filename, "extension": ext},
            "error": f"Unsupported file type: {ext}",
        }

    except Exception as e:
        return {
            "text": "",
            "source_type": "error",
            "metadata": {"filename": filename, "extension": ext},
            "error": f"Extraction failed: {type(e).__name__}: {e}",
        }


def is_url(text: str) -> bool:
    """Quick check for a pasted URL."""
    text = text.strip()
    return text.startswith(("http://", "https://")) and " " not in text
