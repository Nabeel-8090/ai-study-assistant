"""Application factory.

This file is responsible ONLY for:
  - creating the FastAPI() app
  - application-level configuration (CORS, lifespan/startup-shutdown)
  - registering centralized exception handlers
  - wiring routers together with app.include_router(...)

It does NOT contain: request/response models (see app/schemas/), the
Gemini/LLM call itself (see app/services/llm.py), or route handler
bodies (see app/api/routes/).
"""

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
    """Runs once before the app starts accepting requests (before `yield`)
    and once while it is shutting down (after `yield`, in `finally`).

    This is where any resource with a lifetime longer than a single
    request belongs - here, that's the shared Gemini HTTP client, which
    must be closed cleanly so its connection pool doesn't leak.
    """
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
    """Translate any LLM/Gemini failure into a safe, structured HTTP response.

    Centralizing this here - instead of a try/except inside every route
    that happens to call the LLM service - means:
      - every current and future route gets identical, safe error
        handling for free (right status code, no leaked upstream detail)
      - the mapping from failure type -> HTTP status lives in exactly
        one place (here + the LLMError subclasses in services/llm.py)

    The trade-off: a reader has to know this handler exists to see why
    `chat()` never catches `llm.LLMError` itself. For a single call site
    like this one, route-level try/except would also have been
    reasonable; centralizing pays off more as more routes call the LLM.
    """
    logger.warning("Chat failed (%s): %s", exc.code, exc)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.public_message, "code": exc.code, "retryable": exc.retryable},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Last-resort safety net.

    Anything that reaches here is a bug, not an expected failure mode
    (those are all `llm.LLMError` subclasses, handled above, or a
    Pydantic validation error, handled automatically by FastAPI as a
    422). We log the full traceback for ourselves via `logger.exception`
    but return only a generic message to the client - never internal
    details, stack traces, or exception text.
    """
    logger.exception("Unhandled error while processing %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong."})


app.include_router(health.router)
app.include_router(chat.router)
