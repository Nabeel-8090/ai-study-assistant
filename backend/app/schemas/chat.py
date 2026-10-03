from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, Field, field_validator

MAX_MESSAGE_LENGTH = 4000

class ConversationOut(BaseModel):
    id: UUID
    title: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ConversationList(BaseModel):
    items: List[ConversationOut]
    next_cursor: Optional[datetime] = None

class MessageOut(BaseModel):
    id: UUID
    conversation_id: UUID
    role: str
    content: str
    sequence_number: int
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class MessageList(BaseModel):
    items: List[MessageOut]
    has_more: bool

class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("content must not be blank")
        return value

class SendMessageResponse(BaseModel):
    user_message: MessageOut
    assistant_message: MessageOut
    conversation: Optional[ConversationOut] = None

# Legacy schemas (kept for backward compatibility during migration)
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)
    history: Optional[List[ChatMessage]] = None

    @field_validator("message")
    @classmethod
    def message_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("message must not be blank")
        return value

class ChatResponse(BaseModel):
    answer: str
