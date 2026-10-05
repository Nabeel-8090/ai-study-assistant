import logging
from contextlib import asynccontextmanager

from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api.routes import auth, chat, health, profile
from .core.config import get_settings
from .core.logging import setup_logging
from .services import llm
from .services.auth import AuthError

setup_logging()
logger = logging.getLogger(__name__)

settings = get_settings()
if not settings.gemini_api_key:
    logger.warning("GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.")
if not settings.secret_key:
    # Fail early with a clear message instead of failing later during a signup.
    raise RuntimeError(
        "SECRET_KEY is not set. Add it to backend/.env. Generate one with:\n"
        '  python -c "import secrets; print(secrets.token_urlsafe(32))"'
    )
if settings.email_backend == "console" and settings.cookie_secure:
    raise RuntimeError(
        "EMAIL_BACKEND=console only prints codes in the server log and is for development. "
        "Set EMAIL_BACKEND=smtp (with the SMTP_* settings) when COOKIE_SECURE=true."
    )
if settings.email_backend == "console":
    logger.warning("EMAIL_BACKEND=console: verification codes are printed here, not emailed.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Chat configured (model=%s, timeout=%ss)", settings.gemini_model, settings.request_timeout_seconds)
    try:
        yield
    finally:
        await llm.close_client()


app = FastAPI(title="RAGGG API", lifespan=lifespan)

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


@app.middleware("http")
async def require_trusted_origin(request: Request, call_next):
    """CSRF protection for cookie logins.

    Browsers attach cookies automatically, even when another website triggers the
    request. Every state-changing request must therefore say (via the Origin
    header, or Referer as a fallback) that it comes from one of our own frontends.
    """
    if request.method not in SAFE_METHODS:
        origin = request.headers.get("origin")
        if not origin:
            parts = urlsplit(request.headers.get("referer", ""))
            origin = f"{parts.scheme}://{parts.netloc}" if parts.scheme and parts.netloc else None
        if origin not in settings.allowed_origins:
            logger.warning("Blocked %s %s from untrusted origin %r", request.method, request.url.path, origin)
            return JSONResponse(
                status_code=403,
                content={"detail": "This request came from an untrusted origin.", "code": "untrusted_origin"},
            )
    return await call_next(request)


# Added after the origin check on purpose: the last middleware added is the outermost,
# so CORS headers are present even on the 403 above and the browser can read it.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,  # explicit list, never "*"
    allow_credentials=True,  # lets the browser send/receive the session cookie
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)


@app.exception_handler(AuthError)
async def auth_error_handler(request: Request, exc: AuthError) -> JSONResponse:
    content = {"detail": exc.message, "code": exc.code}
    if exc.field:
        content["field"] = exc.field
    if exc.extra:
        content.update(exc.extra)
    return JSONResponse(status_code=exc.status_code, content=content)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # FastAPI's default 422 body echoes the submitted values back ("input"),
    # which would include the plaintext password. Return only field + message.
    errors = []
    for err in exc.errors():
        loc = [str(p) for p in err.get("loc", ()) if p not in ("body", "query")]
        message = str(err.get("msg", "Invalid value.")).removeprefix("Value error, ")
        errors.append({"field": ".".join(loc) or None, "message": message})
    return JSONResponse(
        status_code=422,
        content={"detail": "Please check the form and try again.", "code": "validation_error", "errors": errors},
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
app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(chat.router)
