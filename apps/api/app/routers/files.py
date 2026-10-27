"""
Auth-gated file serving.

Currently serves private video files. Every request goes through
get_current_user and verifies the requesting user owns the node.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.models import Node, User
from app.db.session import get_db
from app.services.image_storage import find_image, mime_for as image_mime
from app.services.video_storage import find_video, mime_for

router = APIRouter(prefix="/files", tags=["files"])


@router.get("/video/{node_id}")
async def serve_video(
    node_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Serve the stored video for a node. Owner-only."""
    node = await db.get(Node, node_id)
    if node is None or str(node.user_id) != str(user.id):
        raise HTTPException(status_code=404, detail="Not found")

    path = find_video(str(user.id), node_id)
    if path is None or not path.exists():
        raise HTTPException(status_code=404, detail="Video file missing")

    return FileResponse(
        path,
        media_type=mime_for(path),
        filename=f"{node_id}{path.suffix}",
    )


@router.get("/image/{node_id}")
async def serve_image(
    node_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Serve the stored image for a node. Owner-only."""
    node = await db.get(Node, node_id)
    if node is None or str(node.user_id) != str(user.id):
        raise HTTPException(status_code=404, detail="Not found")

    path = find_image(str(user.id), node_id)
    if path is None or not path.exists():
        raise HTTPException(status_code=404, detail="Image file missing")

    return FileResponse(
        path,
        media_type=image_mime(path),
        filename=f"{node_id}{path.suffix}",
    )
