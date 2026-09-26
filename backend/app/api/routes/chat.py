from fastapi import APIRouter, Depends

from ...core.config import Settings, get_settings
from ...schemas.chat import ChatRequest, ChatResponse
from ...services import llm

router = APIRouter(prefix="/api", tags=["chat"])

@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    settings: Settings = Depends(get_settings),
) -> ChatResponse:
    answer = await llm.generate_answer(request.message, settings)
    return ChatResponse(answer=answer)
