"""Shared FastAPI dependencies: who is the current user, and cookie helpers."""

from datetime import datetime

from fastapi import Depends, Request, Response
from sqlalchemy.orm import Session

from ..core.config import Settings, get_settings
from ..db.session import get_db
from ..models import User
from ..services import auth as auth_service


def set_session_cookie(response: Response, token: str, expires_at: datetime, settings: Settings) -> None:
    max_age = max(0, int((expires_at - auth_service.utcnow()).total_seconds()))
    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        max_age=max_age,
        httponly=True,  # JavaScript can never read it
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,  # type: ignore[arg-type]
        path="/",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    # Must use the same attributes it was set with, or the browser keeps the old cookie.
    response.delete_cookie(
        key=settings.cookie_name,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,  # type: ignore[arg-type]
        path="/",
    )


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    """Use as a dependency on any route that needs a logged-in user."""
    user = auth_service.get_user_by_token(db, request.cookies.get(settings.cookie_name))
    if user is None:
        raise auth_service.UNAUTHENTICATED
    return user
