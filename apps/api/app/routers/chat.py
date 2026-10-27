from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.i18n import get_locale
from app.services.capture import capture_text
from app.services.chat import chat
from app.services.graph_reasoning import stream_reason_with_tools
from app.services.conversations import (
    create_conversation,
    delete_conversation,
    get_conversation,
    list_conversations,
    list_messages,
    rename_conversation,
    send_message_and_reply,
    set_pinned,
)
from app.services.extract import extract_from_file

router = APIRouter(prefix="/chat", tags=["chat"])

MAX_FILE_SIZE = 100 * 1024 * 1024


# ---------- Request / response models ----------

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    agent: str | None = None


class SourceItem(BaseModel):
    id: str
    type: str
    title: str | None


class ChatResponse(BaseModel):
    reply: str
    sources: list[SourceItem]
    nodes_used: int
    mode: str | None = None  # "graph" | "flat" --- for observability


class AttachedNode(BaseModel):
    id: str
    title: str | None
    type: str
    source_type: str


class AttachResponse(BaseModel):
    node: AttachedNode
    reply: str
    sources: list[SourceItem]
    nodes_used: int
    extraction_metadata: dict
    extraction_error: str | None


class CreateConversationRequest(BaseModel):
    title: str = Field("New chat", max_length=120)


class RenameConversationRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)


class SetPinnedRequest(BaseModel):
    pinned: bool


class SendMessageRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    agent: str | None = None


class ConversationSummary(BaseModel):
    id: str
    title: str
    message_count: int
    pinned: bool
    created_at: str
    updated_at: str


class MessageItem(BaseModel):
    id: str
    role: str
    content: str
    sources: list
    nodes_used: int
    edges: list = []
    created_at: str


class ConversationDetail(BaseModel):
    id: str
    title: str
    message_count: int
    pinned: bool
    created_at: str
    updated_at: str
    messages: list[MessageItem]


class SendMessageResponse(BaseModel):
    user_message: MessageItem
    assistant_message: MessageItem
    conversation: ConversationSummary


# ---------- Helpers ----------

def _conversation_summary(c) -> ConversationSummary:
    return ConversationSummary(
        id=str(c.id),
        title=c.title,
        message_count=c.message_count,
        pinned=bool(c.pinned),
        created_at=c.created_at.isoformat(),
        updated_at=c.updated_at.isoformat(),
    )


def _message_item(m) -> MessageItem:
    return MessageItem(
        id=str(m.id),
        role=m.role,
        content=m.content,
        sources=m.sources or [],
        nodes_used=m.nodes_used,
        edges=getattr(m, "edges", None) or [],
        created_at=m.created_at.isoformat(),
    )


# ---------- Legacy single-shot chat ----------

@router.post("/", response_model=ChatResponse)
async def chat_endpoint(
    payload: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    locale: str = Depends(get_locale),
):
    result = await chat(db, user.id, payload.message, locale=locale)
    return ChatResponse(**result)


# ---------- Attach file ----------

@router.post("/attach", response_model=AttachResponse)
async def chat_attach_endpoint(
    file: UploadFile = File(...),
    question: str | None = Form(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    locale: str = Depends(get_locale),
):
    filename = file.filename or "upload"

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(data) // 1024 // 1024} MB). Max is 100 MB.",
        )

    extraction = await extract_from_file(data, filename)
    extracted_text = extraction.get("text", "")
    source_type = extraction.get("source_type", "file")
    extraction_error = extraction.get("error")
    metadata = extraction.get("metadata", {})

    if not extracted_text.strip():
        raise HTTPException(
            status_code=422,
            detail=f"Could not extract text from '{filename}': {extraction_error or 'unknown error'}",
        )

    node = await capture_text(
        db=db,
        user_id=user.id,
        text=extracted_text,
        title=_title_from_filename(filename),
        source_type=source_type,
        metadata=metadata,
    )

    node.meta = {
        **(node.meta or {}),
        "source_type": source_type,
        "original_filename": filename,
        "extraction_metadata": metadata,
    }
    await db.commit()
    await db.refresh(node)

    if question and question.strip():
        chat_question = question.strip()
    else:
        chat_question = (
            f"What is this document about? Summarize the key ideas from the "
            f"file '{filename}' that I just uploaded."
        )

    chat_result = await chat(db, user.id, chat_question, locale=locale)

    return AttachResponse(
        node=AttachedNode(
            id=node.id,
            title=node.title,
            type=node.type,
            source_type=source_type,
        ),
        reply=chat_result["reply"],
        sources=chat_result["sources"],
        nodes_used=chat_result["nodes_used"],
        extraction_metadata=metadata,
        extraction_error=extraction_error,
    )


def _title_from_filename(filename: str) -> str:
    base = filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").strip()
    return base[:200] if base else filename


# ---------- Conversation management ----------

@router.get("/conversations", response_model=list[ConversationSummary])
async def list_conversations_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all conversations. Pinned first, then most recent."""
    conversations = await list_conversations(db, user.id)
    return [_conversation_summary(c) for c in conversations]


@router.post("/conversations", response_model=ConversationSummary)
async def create_conversation_endpoint(
    payload: CreateConversationRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new empty conversation."""
    conversation = await create_conversation(db, user.id, payload.title)
    return _conversation_summary(conversation)


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation_endpoint(
    conversation_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a conversation with all its messages."""
    conversation = await get_conversation(db, user.id, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = await list_messages(db, user.id, conversation_id)

    return ConversationDetail(
        id=str(conversation.id),
        title=conversation.title,
        message_count=conversation.message_count,
        pinned=bool(conversation.pinned),
        created_at=conversation.created_at.isoformat(),
        updated_at=conversation.updated_at.isoformat(),
        messages=[_message_item(m) for m in messages],
    )


@router.patch("/conversations/{conversation_id}", response_model=ConversationSummary)
async def rename_conversation_endpoint(
    conversation_id: str,
    payload: RenameConversationRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Rename a conversation."""
    conversation = await rename_conversation(
        db, user.id, conversation_id, payload.title
    )
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return _conversation_summary(conversation)


@router.patch(
    "/conversations/{conversation_id}/pin",
    response_model=ConversationSummary,
)
async def set_pinned_endpoint(
    conversation_id: str,
    payload: SetPinnedRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Pin or unpin a conversation."""
    conversation = await set_pinned(
        db, user.id, conversation_id, payload.pinned
    )
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return _conversation_summary(conversation)


@router.delete("/conversations/{conversation_id}")
async def delete_conversation_endpoint(
    conversation_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a conversation and all its messages."""
    ok = await delete_conversation(db, user.id, conversation_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"deleted": True}


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=SendMessageResponse,
)
async def send_message_endpoint(
    conversation_id: str,
    payload: SendMessageRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    locale: str = Depends(get_locale),
):
    """
    Send a message ??' Cortex replies ??' both saved to the conversation.
    """
    try:
        result = await send_message_and_reply(
            db, user.id, conversation_id, payload.message, locale=locale
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    conversation = await get_conversation(db, user.id, conversation_id)

    return SendMessageResponse(
        user_message=_message_item(result["user_message"]),
        assistant_message=_message_item(result["assistant_message"]),
        conversation=_conversation_summary(conversation),
    )

# ---------- streaming chat ----------


@router.post("/conversations/{conversation_id}/messages/stream")
async def chat_stream_endpoint(
    conversation_id: str,
    payload: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    SSE streaming chat for a specific conversation.

    On entry: persists the user's message.
    While streaming: yields tokens as the LLM produces them.
    On completion: persists the assistant's full reply.
    """
    import json as _json
    from app.services.conversations import (
        get_conversation,
        add_user_message,
        add_assistant_message,
    )

    # Verify the conversation belongs to this user
    conv = await get_conversation(db, str(user.id), conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    locale = "en"

    async def event_gen():
        # Everything the generator does touches the DB session. If the
        # client disconnects mid-stream (e.g., user clicks Stop), Starlette
        # cancels the generator and we would otherwise leak an open
        # transaction --- leaving a session "idle in transaction" holding
        # row locks on chat_messages / chat_conversations. Wrapping the
        # whole body in try/finally ensures the session is always cleaned
        # up, no matter how the generator exits.
        try:
            # 1. Persist the user's message
            try:
                await add_user_message(
                    db, str(user.id), conversation_id, payload.message
                )
            except Exception as e:  # noqa: BLE001
                yield f"data: {_json.dumps({'type': 'error', 'message': f'Could not save message: {e}'})}\n\n"
                yield f"data: {_json.dumps({'type': 'done'})}\n\n"
                return

            # 2. Stream, accumulating tokens + meta
            full_reply = ""
            mode = "flat"
            sources_acc: list = []
            nodes_used_acc: int = 0
            edges_acc: list = []

            # Load prior turns so the model has context. Excludes the
            # just-saved user message (it's passed in the prompt).
            from app.services.conversations import load_history as _load_history
            try:
                history = await _load_history(
                    db,
                    str(user.id),
                    conversation_id,
                    current_message=payload.message,
                    include_recall=True,
                    include_user_model=True,
                )
            except Exception as e:  # noqa: BLE001
                print(f"[chat] history load failed, continuing without: {e}")
                history = []

            try:
                async for frame in stream_reason_with_tools(
                    db, str(user.id), payload.message,
                    locale=locale,
                    history=history,
                    agent=payload.agent,
                ):
                    if frame.get("type") == "meta":
                        mode = frame.get("mode", "flat")
                        sources_acc = frame.get("sources") or []
                        nodes_used_acc = int(frame.get("nodes_used") or 0)
                        edges_acc = frame.get("edges") or []
                    elif frame.get("type") == "token":
                        full_reply += frame.get("text", "")
                    yield f"data: {_json.dumps(frame, default=str)}\n\n"

                # 3. Persist the assistant reply
                try:
                    saved = await add_assistant_message(
                        db,
                        str(user.id),
                        conversation_id,
                        full_reply,
                        sources_acc,
                        nodes_used_acc,
                        edges_acc,
                    )
                    msg_id = str(getattr(saved, "id", saved)) if saved else ""
                    yield f"data: {_json.dumps({'type': 'done', 'message_id': msg_id, 'mode': mode})}\n\n"
                except Exception as e:  # noqa: BLE001
                    yield f"data: {_json.dumps({'type': 'error', 'message': f'Could not save reply: {e}'})}\n\n"
                    yield f"data: {_json.dumps({'type': 'done'})}\n\n"

            except Exception as e:  # noqa: BLE001
                yield f"data: {_json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                yield f"data: {_json.dumps({'type': 'done'})}\n\n"
        finally:
            # Guarantee cleanup regardless of how we exit (normal, error,
            # GeneratorExit on client disconnect). This is the fix for the
            # "idle in transaction" leak that blocked DELETE /user/account.
            try:
                await db.rollback()
            except Exception:
                pass
            try:
                await db.close()
            except Exception:
                pass


    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


