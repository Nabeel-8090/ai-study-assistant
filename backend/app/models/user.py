import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, LargeBinary, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        # The app lowercases these before saving; the database double-checks it,
        # so "Ali" and "ali" can never become two different accounts.
        CheckConstraint("username = lower(username)", name="username_lowercase"),
        CheckConstraint("email = lower(email)", name="email_lowercase"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(String(80))
    username: Mapped[str] = mapped_column(String(30), unique=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    # Profile picture, stored (already resized to a small image) in the database.
    # deferred=True: the bytes are only loaded when we actually ask for them.
    avatar_data: Mapped[bytes | None] = mapped_column(LargeBinary, deferred=True)
    avatar_content_type: Mapped[str | None] = mapped_column(String(50))
    avatar_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # NULL until the user enters the code we email them. Login is refused until it is set.
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Which Terms/Privacy version the user accepted at signup, and when.
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    terms_version: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sessions: Mapped[list["AuthSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    conversations: Mapped[list["Conversation"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True,
        order_by="desc(Conversation.updated_at)"
    )


class AuthSession(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # SHA-256 of the random token. The token itself is never stored.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="sessions")


class OTPCode(Base):
    """A one-time 6-digit code sent by email, for verifying an address or resetting a password."""

    __tablename__ = "otp_codes"
    __table_args__ = (
        CheckConstraint("purpose IN ('verify_email', 'reset_password')", name="purpose_valid"),
        Index("ix_otp_codes_user_id_purpose", "user_id", "purpose"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    purpose: Mapped[str] = mapped_column(String(20))
    # HMAC of the code (see services/otp.py). The code itself is never stored.
    code_hash: Mapped[str] = mapped_column(String(64))
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
