import re
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

USERNAME_PATTERN = re.compile(r"^[a-z0-9_]{3,30}$")
USERNAME_RULE = "Username must be 3-30 characters: letters, numbers and underscores only."


def clean_username(value: str) -> str:
    return value.strip().lower()


def clean_email(value: str) -> str:
    """The one place email is normalized, so signup, login and reset always agree."""
    value = value.strip().lower()
    if len(value) > 254:
        raise ValueError("Email is too long.")
    return value


class SignupRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=80)
    username: str = Field(min_length=1, max_length=30)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    accept_terms: bool

    @field_validator("accept_terms")
    @classmethod
    def terms_must_be_accepted(cls, value: bool) -> bool:
        if not value:
            raise ValueError("You must accept the Terms of Service and Privacy Policy.")
        return value

    @field_validator("full_name")
    @classmethod
    def full_name_not_blank(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Full name is required.")
        return value

    @field_validator("username")
    @classmethod
    def username_format(cls, value: str) -> str:
        value = clean_username(value)
        if not USERNAME_PATTERN.fullmatch(value):
            raise ValueError(USERNAME_RULE)
        return value

    @field_validator("email")
    @classmethod
    def email_normalized(cls, value: str) -> str:
        return clean_email(value)


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=1, max_length=254)  # username OR email
    password: str = Field(min_length=1, max_length=128)

    @field_validator("identifier")
    @classmethod
    def identifier_clean(cls, value: str) -> str:
        value = value.strip().lower()
        if not value:
            raise ValueError("Enter your username or email.")
        return value


class UserOut(BaseModel):
    """The only user shape the API returns. No password hash, no tokens, no image bytes."""

    id: uuid.UUID
    full_name: str
    username: str
    email: str
    created_at: datetime
    has_avatar: bool
    avatar_version: int | None  # changes whenever the picture changes (cache busting)


class UsernameCheck(BaseModel):
    available: bool
    reason: str | None = None


class EmailRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def email_normalized(cls, value: str) -> str:
        return clean_email(value)


class VerifyEmailRequest(EmailRequest):
    code: str = Field(pattern=r"^\d{6}$")  # exactly 6 digits


class ResetPasswordRequest(VerifyEmailRequest):
    new_password: str = Field(min_length=8, max_length=128)


class MessageOut(BaseModel):
    message: str
