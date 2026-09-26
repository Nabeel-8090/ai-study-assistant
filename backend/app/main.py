import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api.routes import chat, health
from .core.config import get_settings
from .core.logging import setup_logging
from .services import llm

setup_logging()
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


@app.exception_handler(llm.LLMError)
async def llm_error_handler(request: Request, exc: llm.LLMError) -> JSONResponse:
    logger.warning("Chat failed (%s): %s", exc.code, exc)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.public_message, "code": exc.code, "retryable": exc.retryable},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error while processing %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong."})


app.include_router(health.router)
app.include_router(chat.router)
