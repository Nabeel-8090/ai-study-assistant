from datetime import datetime
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import select, func
import asyncio

from ...core.config import Settings, get_settings
from ...db.session import get_db
from ...models import User, Conversation, Message
from ..deps import get_current_user
from ...schemas.chat import (
    ChatRequest, ChatResponse,
    ConversationList, ConversationOut,
    MessageList, MessageOut, MessageCreate, SendMessageResponse
)
from ...services import llm

router = APIRouter(prefix="/api/conversations", tags=["chat"])

@router.get("", response_model=ConversationList)
def list_conversations(
    limit: int = Query(30, ge=1, le=100),
    cursor: Optional[datetime] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    query = select(Conversation).where(Conversation.user_id == user.id)
    if cursor:
        query = query.where(Conversation.updated_at < cursor)
    query = query.order_by(Conversation.updated_at.desc(), Conversation.id.desc()).limit(limit + 1)
    
    results = db.scalars(query).all()
    has_more = len(results) > limit
    items = results[:limit]
    
    next_cursor = items[-1].updated_at if has_more else None
    
    return ConversationList(items=items, next_cursor=next_cursor)

@router.post("", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
def create_conversation(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    conversation = Conversation(user_id=user.id, title="New Chat")
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation

@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    conversation = db.scalar(select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user.id))
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    db.delete(conversation)
    db.commit()
    return None

@router.get("/{conversation_id}/messages", response_model=MessageList)
def list_messages(
    conversation_id: UUID,
    limit: int = Query(50, ge=1, le=100),
    before_sequence: Optional[int] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    conversation = db.scalar(select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user.id))
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    query = select(Message).where(Message.conversation_id == conversation_id)
    if before_sequence is not None:
        query = query.where(Message.sequence_number < before_sequence)
    query = query.order_by(Message.sequence_number.desc()).limit(limit + 1)
    
    results = db.scalars(query).all()
    has_more = len(results) > limit
    items = results[:limit]
    
    items.reverse()
    
    return MessageList(items=items, has_more=has_more)

@router.post("/{conversation_id}/messages", response_model=SendMessageResponse)
async def send_message(
    conversation_id: UUID,
    request: MessageCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings)
):
    conversation = db.scalar(select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user.id))
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    max_seq = db.scalar(select(func.max(Message.sequence_number)).where(Message.conversation_id == conversation_id)) or 0
    
    user_msg = Message(
        conversation_id=conversation_id,
        role="user",
        content=request.content,
        sequence_number=max_seq + 1,
        status="sent"
    )
    db.add(user_msg)
    
    recent_history = db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id, Message.status == "sent")
        .order_by(Message.sequence_number.asc())
        .limit(20)
    ).all()
    
    assistant_msg = Message(
        conversation_id=conversation_id,
        role="assistant",
        content="",
        sequence_number=max_seq + 2,
        status="pending"
    )
    db.add(assistant_msg)
    
    conversation.updated_at = func.now()
    if max_seq == 0 and len(request.content) < 50:
        conversation.title = request.content
    elif max_seq == 0:
        # Temporary title until LLM completes
        conversation.title = request.content[:47] + "..."
    
    db.commit()
    db.refresh(user_msg)
    db.refresh(assistant_msg)
    db.refresh(conversation)

    try:
        # Create a task for the main answer
        answer_task = asyncio.create_task(llm.generate_answer(request.content, recent_history, settings))
        
        # Create a task for the title generation if this is a new conversation and prompt is long
        title_task = None
        if max_seq == 0 and len(request.content) >= 50:
            title_prompt = f"Summarize this prompt into a very concise chat title (max 4 words, no quotes, no punctuation). Prompt: {request.content}"
            title_task = asyncio.create_task(llm.generate_answer(title_prompt, [], settings))
            
        # Wait for the main answer
        answer = await answer_task
        
        # Check if we generated a title
        if title_task:
            try:
                title_answer = await title_task
                conversation.title = title_answer.strip('"\'. \n')
                db.add(conversation)
            except Exception as e:
                print(f"Failed to generate title: {e}")
        
        assistant_msg.content = answer
        assistant_msg.status = "sent"
        db.commit()
        db.refresh(assistant_msg)
        db.refresh(conversation)
    except Exception as e:
        assistant_msg.status = "error"
        db.commit()
        db.refresh(assistant_msg)
        db.refresh(conversation)
        raise HTTPException(status_code=500, detail="Failed to get response from AI") from e

    return SendMessageResponse(user_message=user_msg, assistant_message=assistant_msg, conversation=conversation)

@router.post("/{conversation_id}/messages/{message_id}/retry", response_model=SendMessageResponse)
async def retry_message(
    conversation_id: UUID,
    message_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings)
):
    conversation = db.scalar(select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user.id))
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    user_msg = db.scalar(select(Message).where(Message.id == message_id, Message.conversation_id == conversation_id, Message.role == "user"))
    if not user_msg:
        raise HTTPException(status_code=404, detail="Message not found")

    # Find the failed assistant message that follows this user message
    assistant_msg = db.scalar(
        select(Message)
        .where(Message.conversation_id == conversation_id, Message.sequence_number == user_msg.sequence_number + 1, Message.role == "assistant")
    )

    if not assistant_msg or assistant_msg.status == "sent":
        raise HTTPException(status_code=400, detail="Cannot retry this message")

    assistant_msg.status = "pending"
    db.commit()
    db.refresh(assistant_msg)

    recent_history = db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id, Message.status == "sent", Message.sequence_number < user_msg.sequence_number)
        .order_by(Message.sequence_number.asc())
        .limit(20)
    ).all()

    try:
        answer = await llm.generate_answer(user_msg.content, recent_history, settings)
        assistant_msg.content = answer
        assistant_msg.status = "sent"
        db.commit()
        db.refresh(assistant_msg)
    except Exception as e:
        assistant_msg.status = "error"
        db.commit()
        db.refresh(assistant_msg)
        raise HTTPException(status_code=500, detail="Failed to get response from AI") from e

    return SendMessageResponse(user_message=user_msg, assistant_message=assistant_msg)


legacy_router = APIRouter(prefix="/api", tags=["chat_legacy"])

@legacy_router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    settings: Settings = Depends(get_settings),
    _user: User = Depends(get_current_user),  # only signed-in users may chat
) -> ChatResponse:
    answer = await llm.generate_answer(request.message, request.history, settings)
    return ChatResponse(answer=answer)
