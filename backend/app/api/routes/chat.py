"""POST /api/chat - validate a message, ask the LLM service to answer it.

This module is intentionally "thin": it knows about HTTP (the route,
status codes via response_model) and delegates everything else -
settings, the Gemini SDK, error classification - to other layers.
"""

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
    """Handle one chat turn.

    1. `request` has already been validated by Pydantic (ChatRequest) by
       the time this function body runs - FastAPI does that for us.
    2. `settings` is *injected* via `Depends(get_settings)` rather than
       imported as a module-level global. FastAPI calls `get_settings()`
       for us and passes the result in. Because `get_settings` is
       `@lru_cache`-d, this costs nothing after the first call, and in
       tests a route's dependencies can be swapped out (see
       `app.dependency_overrides`) without monkeypatching a global.
    3. The actual Gemini call is delegated to the service layer
       (`services.llm.generate_answer`); this route has no idea how
       that call is made, retried, or times out.
    4. If the LLM service raises `llm.LLMError` (or any of its
       subclasses), this function does NOT catch it. It is caught once,
       centrally, by the exception handler registered in `main.py` -
       see AR/section 7 of the PRD for why that trade-off was made here.
    """
    answer = await llm.generate_answer(request.message, settings)
    return ChatResponse(answer=answer)
