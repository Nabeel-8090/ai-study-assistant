"""Settings, read from environment variables (and backend/.env if present)."""

import os
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

# backend/.env, regardless of which directory the server is started from.
# This file lives at app/core/config.py, so backend/ is three levels up.
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

DEFAULT_MODEL = "gemini-3.5-flash-lite"
DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str
    gemini_model: str
    allowed_origins: list[str]
    request_timeout_seconds: float
    # --- V03: database and authentication (defaults keep older code working) ---
    database_url: str = ""
    session_lifetime_hours: int = 168  # 7 days
    cookie_name: str = "session"
    cookie_secure: bool = False  # must be True when the site is served over HTTPS
    cookie_samesite: str = "lax"  # "lax" | "strict" | "none"

    def __post_init__(self) -> None:
        if not math.isfinite(self.request_timeout_seconds) or self.request_timeout_seconds <= 0:
            raise ValueError("GEMINI_TIMEOUT_SECONDS must be a finite number greater than zero.")
        if "*" in self.allowed_origins:
            raise ValueError("ALLOWED_ORIGIN must list explicit origins; '*' cannot be used with cookies.")
        if self.session_lifetime_hours <= 0:
            raise ValueError("SESSION_LIFETIME_HOURS must be greater than zero.")
        if self.cookie_samesite not in {"lax", "strict", "none"}:
            raise ValueError("COOKIE_SAMESITE must be lax, strict or none.")
        if self.cookie_samesite == "none" and not self.cookie_secure:
            raise ValueError("COOKIE_SAMESITE=none requires COOKIE_SECURE=true (browsers reject it otherwise).")


def _normalize_database_url(url: str) -> str:
    """Accept the plain URL that Neon shows and point SQLAlchemy at the psycopg driver."""
    url = url.strip()
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@lru_cache
def get_settings() -> Settings:
    origins = os.getenv("ALLOWED_ORIGIN", DEFAULT_ORIGINS)
    try:
        timeout = float(os.getenv("GEMINI_TIMEOUT_SECONDS", "20"))
    except ValueError as exc:
        raise ValueError("GEMINI_TIMEOUT_SECONDS must be a finite number greater than zero.") from exc
    return Settings(
        gemini_api_key=os.getenv("GEMINI_API_KEY", "").strip(),
        gemini_model=os.getenv("GEMINI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL,
        # Comma-separated, so more than one frontend origin can be allowed.
        allowed_origins=[o.strip() for o in origins.split(",") if o.strip()],
        request_timeout_seconds=timeout,
        database_url=_normalize_database_url(os.getenv("DATABASE_URL", "")),
        session_lifetime_hours=int(os.getenv("SESSION_LIFETIME_HOURS", "168")),
        cookie_name=os.getenv("COOKIE_NAME", "session").strip() or "session",
        cookie_secure=_env_bool("COOKIE_SECURE", False),
        cookie_samesite=os.getenv("COOKIE_SAMESITE", "lax").strip().lower(),
    )
