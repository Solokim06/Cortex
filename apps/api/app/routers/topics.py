"""
Topics router — cross-capture synthesis for concept nodes.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.i18n import get_locale
from app.services.topic_synthesis import get_or_generate, list_concepts

router = APIRouter(prefix="/topics", tags=["topics"])


class ConceptListItem(BaseModel):
    id: str
    title: str
    summary: str
    has_synthesis: bool
    headline: str | None
    generated_at: str | None
    stale: bool


class ConceptListResponse(BaseModel):
    concepts: list[ConceptListItem]
    count: int


class SynthesisResponse(BaseModel):
    concept_id: str
    concept_title: str
    concept_summary: str
    headline: str
    what_youve_said: str
    patterns: list[dict]
    tensions: list[dict]
    open_questions: list[str]
    related_concepts: list[str]
    source_node_ids: list[str]
    locale: str
    generated_at: str | None
    stale: bool


@router.get("", response_model=ConceptListResponse)
async def list_topics_endpoint(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    concepts = await list_concepts(db, user.id, limit=limit, offset=offset)
    return ConceptListResponse(concepts=concepts, count=len(concepts))


@router.get("/{concept_id}", response_model=SynthesisResponse)
async def get_topic_endpoint(
    concept_id: str,
    force: bool = Query(False, description="Regenerate even if cached"),
    locale: str = Depends(get_locale),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await get_or_generate(db, user.id, concept_id, locale=locale, force=force)
    if result is None:
        raise HTTPException(status_code=404, detail="Concept not found")
    return result
