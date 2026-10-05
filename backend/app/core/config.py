"""Settings, read from environment variables (and backend/.env if present)."""

import os
import math
from dataclasses import dataclass, field
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
    database_url: str = field(default="", repr=False)  # contains the DB password: never print it
    session_lifetime_hours: int = 168  # 7 days
    cookie_name: str = "session"
    cookie_secure: bool = False  # must be True when the site is served over HTTPS
    cookie_samesite: str = "lax"  # "lax" | "strict" | "none"
    # --- V03: email codes (OTP) and password reset ---
    secret_key: str = field(default="", repr=False)  # signs/hashes one-time codes
    email_backend: str = "console"  # "console" | "smtp" | "mailjet"
    smtp_host: str = ""
    smtp_port: int = 587  # 587 = STARTTLS, 465 = implicit SSL
    smtp_username: str = ""
    smtp_password: str = field(default="", repr=False)
    smtp_from: str = ""
    otp_ttl_minutes: int = 10
    otp_max_attempts: int = 5  # wrong guesses allowed per code
    otp_resend_cooldown_seconds: int = 60
    otp_max_sends_per_hour: int = 5

    def __post_init__(self) -> None:
        if not math.isfinite(self.request_timeout_seconds) or self.request_timeout_seconds <= 0:
            raise ValueError("GEMINI_TIMEOUT_SECONDS must be a finite number greater than zero.")
        if "*" in self.allowed_origins:
            raise ValueError("ALLOWED_ORIGIN must list explicit origins; '*' cannot be used with cookies.")
        if self.session_lifetime_hours <= 0:
            raise ValueError("SESSION_LIFETIME_HOURS must be greater than zero.")
        if self.cookie_samesite not in {"lax", "strict", "none"}:
            raise ValueError("COOKIE_SAMESITE must be lax, strict or none.")
        if self.email_backend not in {"console", "smtp", "mailjet"}:
            raise ValueError("EMAIL_BACKEND must be 'console', 'smtp' or 'mailjet'.")
        if self.email_backend in ("smtp", "mailjet") and not (self.smtp_username and self.smtp_from):
            raise ValueError(f"EMAIL_BACKEND={self.email_backend} needs SMTP_USERNAME and SMTP_FROM.")
        if self.otp_ttl_minutes <= 0 or self.otp_max_attempts <= 0 or self.otp_max_sends_per_hour <= 0:
            raise ValueError("OTP_TTL_MINUTES, OTP_MAX_ATTEMPTS and OTP_MAX_SENDS_PER_HOUR must be greater than zero.")
        if self.otp_resend_cooldown_seconds < 0:
            raise ValueError("OTP_RESEND_COOLDOWN_SECONDS cannot be negative.")
        if self.cookie_samesite == "none" and not self.cookie_secure:
            raise ValueError("COOKIE_SAMESITE=none requires COOKIE_SECURE=true (browsers reject it otherwise).")


def _normalize_database_url(url: str) -> str:
    """Accept the plain URL that Neon shows and point SQLAlchemy at the psycopg driver."""
    url = url.strip()
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be a whole number.") from exc


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
        secret_key=os.getenv("SECRET_KEY", "").strip(),
        email_backend=os.getenv("EMAIL_BACKEND", "console").strip().lower() or "console",
        smtp_host=os.getenv("SMTP_HOST", "").strip(),
        smtp_port=_env_int("SMTP_PORT", 587),
        smtp_username=os.getenv("SMTP_USERNAME", "").strip(),
        # Google shows app passwords with spaces ("abcd efgh ..."); they must be removed.
        smtp_password=os.getenv("SMTP_PASSWORD", "").replace(" ", "").strip(),
        smtp_from=(os.getenv("SMTP_FROM", "").strip() or os.getenv("SMTP_USERNAME", "").strip()),
        otp_ttl_minutes=_env_int("OTP_TTL_MINUTES", 10),
        otp_max_attempts=_env_int("OTP_MAX_ATTEMPTS", 5),
        otp_resend_cooldown_seconds=_env_int("OTP_RESEND_COOLDOWN_SECONDS", 60),
        otp_max_sends_per_hour=_env_int("OTP_MAX_SENDS_PER_HOUR", 5),
    )
