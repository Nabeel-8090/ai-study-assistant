"""Settings, read from environment variables (and backend/.env if present)."""

import os
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

# backend/.env, regardless of which directory the server is started from.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DEFAULT_MODEL = "gemini-3.5-flash-lite"
DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str
    gemini_model: str
    allowed_origins: list[str]
    request_timeout_seconds: float

    def __post_init__(self) -> None:
        if not math.isfinite(self.request_timeout_seconds) or self.request_timeout_seconds <= 0:
            raise ValueError("GEMINI_TIMEOUT_SECONDS must be a finite number greater than zero.")


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
    )
