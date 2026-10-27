import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.models import Edge, Node, User
from app.db.session import get_db
from app.services.capture import capture_text
from app.services.capture import capture_text, check_url_exists, get_node, list_nodes
from app.services.capture_kind import classify_capture
from app.services.extract import extract_from_file, extract_url, supported_extensions
from app.services.image_storage import save_image
from app.services.video_storage import save_video

router = APIRouter(prefix="/capture", tags=["capture"])

# Max upload size (100 MB — video needs headroom)
MAX_FILE_SIZE = 100 * 1024 * 1024


# ---------- Response models ----------

class CaptureTextRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=100000)
    title: str | None = None
    source_type: str = "manual"


class CaptureUrlRequest(BaseModel):
    url: str = Field(..., min_length=8, max_length=2000)
    title: str | None = None


class PreviewUrlRequest(BaseModel):
    url: str = Field(..., min_length=8, max_length=2000)


class CaptureTextResponse(BaseModel):
    id: str
    type: str
    title: str | None
    content: str | None
    summary: str | None = None
    created_at: str
    source_type: str | None = None
    meta: dict | None = None


class SaveAnnotationsRequest(BaseModel):
    """Payload for POST /capture/{node_id}/annotations."""
    annotations: list[dict] = Field(default_factory=list)
    re_enrich: bool = False


class CaptureFileResponse(BaseModel):
    id: str
    type: str
    title: str | None
    content: str | None
    summary: str | None
    created_at: str
    source_type: str
    extraction_metadata: dict
    extraction_error: str | None


# ---------- Helpers ----------

async def _read_and_validate_file(file: UploadFile) -> bytes:
    """Read the upload with a size guard."""
    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(data) // 1024 // 1024} MB). Max is 100 MB.",
        )
    return data


def _default_title(filename: str, text: str) -> str:
    """Build a title from the filename, or first line of the text."""
    base = filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").strip()
    if base and len(base) < 80:
        return base

    for line in text.splitlines():
        line = line.strip()
        if line and len(line) < 80:
            return line

    return filename


def _source_type_from_node(node: Node, fallback: str = "manual") -> str:
    """Read source_type from node.meta if present, else use fallback."""
    meta = node.meta or {}
    st = meta.get("source_type")
    if isinstance(st, str) and st.strip():
        return st
    return fallback


# ---------- Text capture ----------

@router.post("/text", response_model=CaptureTextResponse)
async def capture_text_endpoint(
    payload: CaptureTextRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    node = await capture_text(
        db=db,
        user_id=user.id,
        text=payload.text,
        title=payload.title,
        source_type=payload.source_type,
    )

    # Evaluate proactive insights (sync signals only — dormant revival + rhythm).
    # Fire-and-forget: never let an insight failure break the capture.
    try:
        from app.services import insights as _insights
        await _insights.evaluate_capture(db, str(user.id), str(node.id))
    except Exception as _e:  # noqa: BLE001
        print(f"[capture] insight evaluation failed: {_e}")

    return CaptureTextResponse(
        id=node.id,
        type=node.type,
        title=node.title,
        content=node.content,
        summary=node.summary,
        created_at=node.created_at.isoformat(),
        source_type=_source_type_from_node(node, fallback=payload.source_type),
    )


# ---------- File capture ----------

@router.post("/file", response_model=CaptureFileResponse)
async def capture_file_endpoint(
    file: UploadFile = File(...),
    title: str | None = Form(None),
    annotations: str | None = Form(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload any supported file → extract text → capture as a node.

    Supported: PDF, DOCX, XLSX, CSV, JSON, images (via Vision),
    audio (via Whisper), video (via ffmpeg + Whisper).
    """
    filename = file.filename or "upload"
    data = await _read_and_validate_file(file)

    # Parse user-drawn annotations (JSON string) if present.
    from app.services.annotations import parse_annotations
    from app.services.consent import is_ai_processing_allowed
    parsed_annotations = parse_annotations(annotations)

    vision_allowed = await is_ai_processing_allowed(db, str(user.id))

    extraction = await extract_from_file(
        data,
        filename,
        annotations=parsed_annotations or None,
        vision_allowed=vision_allowed,
    )

    extracted_text = extraction.get("text", "")
    source_type = extraction.get("source_type", "file")
    extraction_error = extraction.get("error")
    metadata = extraction.get("metadata", {})

    if not extracted_text.strip():
        fallback_title = title or filename
        fallback_body = (
            f"[File uploaded: {filename}]\n\n"
            f"Extraction failed or produced no text.\n\n"
            f"Reason: {extraction_error or 'unknown'}"
        )
        node = await capture_text(
            db=db,
            user_id=user.id,
            text=fallback_body,
            title=fallback_title,
            source_type=source_type,
        )
        return CaptureFileResponse(
            id=node.id,
            type=node.type,
            title=node.title,
            content=node.content,
            summary=node.summary,
            created_at=node.created_at.isoformat(),
            source_type=source_type,
            extraction_metadata=metadata,
            extraction_error=extraction_error or "No text extracted.",
        )

    node = await capture_text(
        db=db,
        user_id=user.id,
        text=extracted_text,
        title=title or _default_title(filename, extracted_text),
        source_type=source_type,
        metadata=metadata,
    )

    node.meta = {
        **(node.meta or {}),
        "source_type": source_type,
        "original_filename": filename,
        "extraction_metadata": metadata,
    }

    # 5.1 -- classify image captures into a capture kind
    # (gated by AI processing consent)
    if source_type == "image":
        from app.services.consent import is_ai_processing_allowed
        if await is_ai_processing_allowed(db, str(user.id)):
            try:
                classification = await classify_capture(
                    text=extracted_text,
                    source_type="image",
                )
                node.meta = {
                    **(node.meta or {}),
                    "capture_classification": classification,
                }
            except Exception as e:
                print(f"[Cortex] Image classification failed: {e}")

    # 5.4 -- persist the image file and store its URL
    if source_type == "image":
        try:
            image_url = save_image(
                user_id=str(user.id),
                node_id=str(node.id),
                filename=filename,
                data=data,
            )
            node.meta = {
                **(node.meta or {}),
                "image_url": image_url,
            }
        except Exception as e:
            # Don't fail the capture -- the node exists with its image_analysis
            print(f"[Cortex] Image storage failed: {e}")

    # 5.3 -- persist the video file and store its URL
    if source_type == "video":
        try:
            video_url = save_video(
                user_id=str(user.id),
                node_id=str(node.id),
                filename=filename,
                data=data,
            )
            node.meta = {
                **(node.meta or {}),
                "video_url": video_url,
            }
        except Exception as e:
            # Don't fail the capture -- the node exists with transcript + moments
            print(f"[Cortex] Video storage failed: {e}")

    # 5.3 -- classify video captures into a capture kind
    # (gated by AI processing consent)
    if source_type == "video":
        from app.services.consent import is_ai_processing_allowed
        if await is_ai_processing_allowed(db, str(user.id)):
            try:
                classification = await classify_capture(
                    text=extracted_text,
                    source_type="video",
                )
                node.meta = {
                    **(node.meta or {}),
                    "capture_classification": classification,
                }
            except Exception as e:
                print(f"[Cortex] Video classification failed: {e}")

    await db.commit()
    await db.refresh(node)

    return CaptureFileResponse(
        id=node.id,
        type=node.type,
        title=node.title,
        content=node.content,
        summary=node.summary,
        created_at=node.created_at.isoformat(),
        source_type=source_type,
        extraction_metadata=metadata,
        extraction_error=extraction_error,
    )


# ---------- URL capture ----------

@router.post("/url", response_model=CaptureFileResponse)
async def capture_url_endpoint(
    payload: CaptureUrlRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch a URL, extract the article text, and capture it as a node.

    If extraction fails (JS-rendered page, paywall, blocked fetch, etc.),
    we still save a lightweight "bookmark" node so the URL lands in the
    user's graph. The response's `extraction_error` explains what happened.
    """
    url = payload.url.strip()

    if not url.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=400,
            detail="URL must start with http:// or https://",
        )

    extraction = await extract_url(url)
    extracted_text = extraction.get("text", "")
    source_type = extraction.get("source_type", "url")
    extraction_error = extraction.get("error")
    metadata = extraction.get("metadata", {})

    # Fallback: extraction failed → save a bookmark node instead of 422
    if not extracted_text.strip():
        bookmark_body = (
            f"[Bookmarked URL: {url}]\n\n"
            f"Cortex could not extract readable content from this page "
            f"({extraction_error or 'unknown reason'}).\n\n"
            f"Open the link to view it directly."
        )
        node = await capture_text(
            db=db,
            user_id=user.id,
            text=bookmark_body,
            title=payload.title or metadata.get("title") or url,
            source_type="url",
        )

        node.meta = {
            **(node.meta or {}),
            "source_type": "url",
            "original_url": url,
            "extraction_metadata": metadata,
            "extraction_error": extraction_error or "No extractable content.",
            "bookmark_only": True,
        }
        await db.commit()
        await db.refresh(node)

        return CaptureFileResponse(
            id=node.id,
            type=node.type,
            title=node.title,
            content=node.content,
            summary=node.summary,
            created_at=node.created_at.isoformat(),
            source_type="url",
            extraction_metadata=metadata,
            extraction_error=extraction_error or "No extractable content.",
        )

    # Normal path: extraction succeeded
    node = await capture_text(
        db=db,
        user_id=user.id,
        text=extracted_text,
        title=payload.title or metadata.get("title") or url,
        source_type=source_type,
    )

    node.meta = {
        **(node.meta or {}),
        "source_type": source_type,
        "original_url": url,
        "extraction_metadata": metadata,
    }
    await db.commit()
    await db.refresh(node)

    return CaptureFileResponse(
        id=node.id,
        type=node.type,
        title=node.title,
        content=node.content,
        summary=node.summary,
        created_at=node.created_at.isoformat(),
        source_type=source_type,
        extraction_metadata=metadata,
        extraction_error=extraction_error,
    )


# ---------- URL preview (metadata only, does NOT save) ----------

@router.post("/preview")
async def preview_url_endpoint(
    payload: PreviewUrlRequest,
    user: User = Depends(get_current_user),
):
    """
    Fetch metadata for a URL WITHOUT saving anything.
    Used to render a live preview card in the Add-a-link dialog.
    """
    url = payload.url.strip()

    if not url.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=400,
            detail="URL must start with http:// or https://",
        )

    extraction = await extract_url(url)
    meta = extraction.get("metadata", {}) or {}

    return {
        "url": meta.get("url") or url,
        "domain": meta.get("domain"),
        "title": meta.get("title"),
        "description": meta.get("description"),
        "site_name": meta.get("site_name"),
        "image": meta.get("image"),
        "favicon": meta.get("favicon"),
        "error": extraction.get("error"),
    }


# ---------- Supported file types ----------

@router.get("/supported-types")
async def supported_types_endpoint():
    """Return the file extensions Cortex accepts, grouped by category."""
    return supported_extensions()


# ---------- URL existence check (for extension badge) ----------

@router.get("/check")
async def check_url_endpoint(
    url: str = Query(..., min_length=8, max_length=2000),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return whether a URL has already been captured by the current user.

    Used by the browser extension to show a badge when the current page
    is already in the graph.
    """
    result = await check_url_exists(db, user.id, url)
    return result


# ---------- Related nodes (must come BEFORE /{node_id}) ----------

@router.get("/{node_id}/related")
async def related_nodes_endpoint(
    node_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return all nodes connected to a given node via edges.
    Includes both outgoing and incoming connections.
    """
    center = await db.get(Node, node_id)
    if center is None or center.user_id != user.id:
        raise HTTPException(status_code=404, detail="Node not found")

    edges_result = await db.execute(
        select(Edge)
        .where(Edge.user_id == user.id)
        .where(
            or_(
                Edge.from_node_id == node_id,
                Edge.to_node_id == node_id,
            )
        )
        .limit(50)
    )
    edges = list(edges_result.scalars().all())

    related_ids = set()
    edge_meta = []
    for e in edges:
        other_id = e.to_node_id if e.from_node_id == node_id else e.from_node_id
        related_ids.add(other_id)
        edge_meta.append({
            "edge_id": str(e.id),
            "other_id": other_id,
            "type": e.type,
            "weight": e.weight,
            "direction": "outgoing" if e.from_node_id == node_id else "incoming",
        })

    if not related_ids:
        return {
            "center_id": node_id,
            "count": 0,
            "related": [],
        }

    nodes_result = await db.execute(
        select(Node)
        .where(Node.user_id == user.id)
        .where(Node.id.in_(list(related_ids)))
    )
    nodes = {str(n.id): n for n in nodes_result.scalars().all()}

    related = []
    for meta in edge_meta:
        n = nodes.get(meta["other_id"])
        if n is None:
            continue
        related.append({
            "id": str(n.id),
            "type": n.type,
            "title": n.title,
            "summary": n.summary or (n.content or "")[:200],
            "edge_type": meta["type"],
            "edge_direction": meta["direction"],
            "edge_weight": meta["weight"],
        })

    return {
        "center_id": node_id,
        "count": len(related),
        "related": related,
    }


# ---------- Read endpoints ----------

@router.post("/{node_id}/annotations", response_model=CaptureTextResponse)
async def save_annotations_endpoint(
    node_id: str,
    payload: SaveAnnotationsRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Save or update user-drawn annotations on an existing image node.

    If `re_enrich` is True and the image file is available on disk,
    re-run Gemini Vision with the annotation context so the extracted
    concepts / summary focus on the annotated regions.
    """
    from app.services.annotations import parse_annotations
    from app.services.image_storage import find_image

    node = await get_node(db, node_id)
    if node is None or str(node.user_id) != str(user.id):
        raise HTTPException(status_code=404, detail="Node not found")

    if (node.meta or {}).get("source_type") != "image":
        raise HTTPException(
            status_code=400,
            detail="Annotations are only supported on image captures.",
        )

    # Validate the incoming list (defensive — the request model already
    # requires dicts, but the shape can still be wrong).
    raw = json.dumps(payload.annotations)
    clean = parse_annotations(raw)

    node.meta = {
        **(node.meta or {}),
        "annotations": clean,
    }

    # Optional: re-enrich via Gemini using the new annotations
    if payload.re_enrich and clean:
        img_path = find_image(str(user.id), node_id)
        if img_path and img_path.exists():
            try:
                from app.services.annotations import format_annotations_for_llm
                from app.services.vision import extract_image_text
                from PIL import Image
                import io as _io

                data = img_path.read_bytes()
                with Image.open(_io.BytesIO(data)) as im:
                    w, h = im.size

                ctx = format_annotations_for_llm(clean, w, h)
                content, analysis = await extract_image_text(
                    data, img_path.name, annotation_context=ctx
                )
                if content and not analysis.get("error"):
                    node.content = content
                    node.meta = {
                        **(node.meta or {}),
                        "image_analysis": analysis,
                        "annotations_re_extracted_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
                    }
            except Exception as e:
                print(f"[Cortex] Re-enrich failed: {e}")

    await db.commit()
    await db.refresh(node)

    return CaptureTextResponse(
        id=node.id,
        type=node.type,
        title=node.title,
        content=node.content,
        summary=node.summary,
        created_at=node.created_at.isoformat(),
        source_type=_source_type_from_node(node),
        meta=node.meta or None,
    )


@router.get("/{node_id}", response_model=CaptureTextResponse)
async def get_node_endpoint(
    node_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    node = await get_node(db, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")

    if node.user_id != user.id:
        raise HTTPException(status_code=404, detail="Node not found")

    return CaptureTextResponse(
        id=node.id,
        type=node.type,
        title=node.title,
        content=node.content,
        summary=node.summary,
        created_at=node.created_at.isoformat(),
        source_type=_source_type_from_node(node),
        meta=node.meta or None,
    )


@router.get("/")
async def list_nodes_endpoint(
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    nodes = await list_nodes(db, user.id, limit=limit, offset=offset)

    return {
        "count": len(nodes),
        "nodes": [
            {
                "id": n.id,
                "type": n.type,
                "title": n.title,
                "content": (n.content or "")[:200],
                "created_at": n.created_at.isoformat(),
                "source_type": _source_type_from_node(n),
            }
            for n in nodes
        ],
    }
