from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from ...core.config import Settings, get_settings
from ...core.security import hash_password
from ...db.session import get_db
from ...models import User
from ...schemas.auth import (
    EmailRequest,
    LoginRequest,
    MessageOut,
    ResetPasswordRequest,
    SignupRequest,
    UserOut,
    UsernameCheck,
    VerifyEmailRequest,
)
from ...services import auth as auth_service
from ...services import email as email_service
from ...services import otp
from ..deps import clear_session_cookie, get_current_user, set_session_cookie

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _start_session(db: Session, user: User, response: Response, settings: Settings) -> None:
    token, expires_at = auth_service.create_session(db, user, settings)
    db.commit()
    set_session_cookie(response, token, expires_at, settings)


@router.get("/username-available", response_model=UsernameCheck)
def username_available(
    username: str = Query(max_length=100),
    db: Session = Depends(get_db),
) -> UsernameCheck:
    available, reason = auth_service.check_username(db, username)
    return UsernameCheck(available=available, reason=reason)


def _queue_code_email(
    background: BackgroundTasks, db: Session, user: User, purpose: str, settings: Settings
) -> None:
    """Create a code and email it AFTER the response is sent.

    Sending in the background means the response takes the same time whether or not an
    email was sent, so the answer does not reveal whether an account exists.
    """
    code = otp.issue_code(db, user, purpose, settings)
    db.commit()
    if code:
        background.add_task(email_service.send_otp_email, settings, user.email, user.full_name, code, purpose)


@router.post("/signup", response_model=UserOut, status_code=201)
def signup(
    body: SignupRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> UserOut:
    """Create the account and email a 6-digit code. No session yet: verify, then sign in."""
    user = auth_service.create_user(
        db, full_name=body.full_name, username=body.username, email=body.email, password=body.password
    )
    db.commit()
    _queue_code_email(background, db, user, otp.VERIFY_EMAIL, settings)
    return auth_service.user_to_out(user)


@router.post("/verify-email", response_model=MessageOut)
def verify_email(
    body: VerifyEmailRequest, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)
) -> MessageOut:
    user = auth_service.get_user_by_email(db, body.email)
    if user is None or not otp.check_code(db, user, otp.VERIFY_EMAIL, body.code, settings):
        # One message for "wrong", "expired", "used" and "no such account".
        raise auth_service.AuthError(400, "invalid_code", "That code is incorrect or has expired.", "code")
    if user.email_verified_at is None:
        user.email_verified_at = auth_service.utcnow()
    db.commit()
    return MessageOut(message="Email verified. You can now sign in.")


@router.post("/resend-verification", response_model=MessageOut)
def resend_verification(
    body: EmailRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> MessageOut:
    user = auth_service.get_user_by_email(db, body.email)
    if user is not None and user.email_verified_at is None:
        _queue_code_email(background, db, user, otp.VERIFY_EMAIL, settings)
    return MessageOut(message="If this account still needs verification, a new code is on its way.")


@router.post("/forgot-password", response_model=MessageOut)
def forgot_password(
    body: EmailRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> MessageOut:
    user = auth_service.get_user_by_email(db, body.email)
    if user is not None:
        _queue_code_email(background, db, user, otp.RESET_PASSWORD, settings)
    # Identical answer whether or not the email has an account.
    return MessageOut(message="If an account exists for that email, we have sent a reset code.")


@router.post("/reset-password", response_model=MessageOut)
def reset_password(
    body: ResetPasswordRequest, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)
) -> MessageOut:
    user = auth_service.get_user_by_email(db, body.email)
    if user is None or not otp.check_code(db, user, otp.RESET_PASSWORD, body.code, settings):
        raise auth_service.AuthError(400, "invalid_code", "That code is incorrect or has expired.", "code")
    user.password_hash = hash_password(body.new_password)
    if user.email_verified_at is None:
        user.email_verified_at = auth_service.utcnow()  # they just proved they own this inbox
    auth_service.delete_all_sessions(db, user)  # a reset signs the account out everywhere
    db.commit()
    return MessageOut(message="Password updated. Please sign in with your new password.")


@router.post("/login", response_model=UserOut)
def login(
    body: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> UserOut:
    user = auth_service.authenticate(db, body.identifier, body.password)
    if user.email_verified_at is None:
        # Only reached with the CORRECT password, so this does not help someone guess accounts.
        raise auth_service.AuthError(
            403, "email_not_verified", "Please verify your email address to continue.", extra={"email": user.email}
        )
    _start_session(db, user, response, settings)
    return auth_service.user_to_out(user)


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> None:
    auth_service.delete_session(db, request.cookies.get(settings.cookie_name))
    db.commit()
    clear_session_cookie(response, settings)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return auth_service.user_to_out(user)
