"""Account and session logic. Route handlers stay thin; the rules live here."""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.config import Settings
from ..core.security import (
    dummy_hash,
    hash_password,
    hash_token,
    new_session_token,
    password_needs_rehash,
    verify_password,
)
from ..models import AuthSession, User
from ..schemas.auth import USERNAME_PATTERN, USERNAME_RULE, UserOut, clean_username

logger = logging.getLogger(__name__)


class AuthError(Exception):
    """An expected, user-facing failure. main.py turns it into the JSON error response."""

    def __init__(self, status_code: int, code: str, message: str, field: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.field = field


UNAUTHENTICATED = AuthError(401, "unauthenticated", "Please sign in.")
INVALID_CREDENTIALS = AuthError(401, "invalid_credentials", "Incorrect username/email or password.")


def utcnow() -> datetime:
    return datetime.now(UTC)


def user_to_out(user: User) -> UserOut:
    version = int(user.avatar_updated_at.timestamp() * 1000) if user.avatar_updated_at else None
    return UserOut(
        id=user.id,
        full_name=user.full_name,
        username=user.username,
        email=user.email,
        created_at=user.created_at,
        has_avatar=user.avatar_content_type is not None,
        avatar_version=version,
    )


# ---------- username availability ----------


def check_username(db: Session, raw: str) -> tuple[bool, str | None]:
    username = clean_username(raw)
    if not USERNAME_PATTERN.fullmatch(username):
        return False, USERNAME_RULE
    taken = db.scalar(select(User.id).where(User.username == username))
    if taken is not None:
        return False, "This username is already taken."
    return True, None


# ---------- signup / login ----------


def create_user(db: Session, *, full_name: str, username: str, email: str, password: str) -> User:
    """Create an account. Inputs are already validated and normalized by the schema."""
    # Friendly pre-check, so the user is told exactly which field clashes...
    if db.scalar(select(User.id).where(User.username == username)) is not None:
        raise AuthError(409, "username_taken", "This username is already taken.", "username")
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise AuthError(409, "email_taken", "An account with this email already exists.", "email")

    user = User(full_name=full_name, username=username, email=email, password_hash=hash_password(password))
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:
        # ...and the database constraint is the real guarantee if two signups race.
        db.rollback()
        constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", "") or ""
        if "email" in constraint:
            raise AuthError(409, "email_taken", "An account with this email already exists.", "email") from exc
        if "username" in constraint:
            raise AuthError(409, "username_taken", "This username is already taken.", "username") from exc
        raise
    return user


def authenticate(db: Session, identifier: str, password: str) -> User:
    """Check username-or-email + password. Always fails with the same generic error."""
    column = User.email if "@" in identifier else User.username
    user = db.scalar(select(User).where(column == identifier))
    if user is None:
        verify_password(dummy_hash(), password)  # spend similar time so timing doesn't reveal the user
        raise INVALID_CREDENTIALS
    if not verify_password(user.password_hash, password):
        raise INVALID_CREDENTIALS
    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    return user


# ---------- sessions ----------


def create_session(db: Session, user: User, settings: Settings) -> tuple[str, datetime]:
    """Store a new session and return (raw token for the cookie, expiry)."""
    now = utcnow()
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id, AuthSession.expires_at <= now))
    token = new_session_token()
    expires_at = now + timedelta(hours=settings.session_lifetime_hours)
    db.add(AuthSession(user_id=user.id, token_hash=hash_token(token), expires_at=expires_at))
    db.flush()
    return token, expires_at


def get_user_by_token(db: Session, token: str | None) -> User | None:
    if not token:
        return None
    row = db.scalar(
        select(AuthSession).where(AuthSession.token_hash == hash_token(token), AuthSession.expires_at > utcnow())
    )
    return row.user if row else None


def delete_session(db: Session, token: str | None) -> None:
    if token:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == hash_token(token)))

