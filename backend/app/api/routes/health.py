"""GET /health - a plain liveness check for the FastAPI process itself.

This deliberately knows nothing about Gemini, settings, or the chat
feature: it only answers "is this process up and handling requests?".
"""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
