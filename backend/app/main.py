import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import llm
from .config import get_settings
from .schemas import ChatRequest, ChatResponse

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s: %(message)s")
logger = logging.getLogger(__name__)

settings = get_settings()
if not settings.gemini_api_key:
    logger.warning("GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Chat configured (model=%s, timeout=%ss)", settings.gemini_model, settings.request_timeout_seconds)
    try:
        yield
    finally:
        await llm.close_client()


app = FastAPI(title="Basic AI Chat API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse | JSONResponse:
    try:
        answer = await llm.generate_answer(request.message, settings)
    except llm.LLMError as exc:
        logger.warning("Chat failed (%s): %s", exc.code, exc)
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.public_message, "code": exc.code, "retryable": exc.retryable},
        )
    except Exception:
        logger.exception("Unexpected error while handling /api/chat")
        raise HTTPException(status_code=500, detail="Something went wrong.")
    return ChatResponse(answer=answer)
