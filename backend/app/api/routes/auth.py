from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from ...core.config import Settings, get_settings
from ...db.session import get_db
from ...models import User
from ...schemas.auth import LoginRequest, SignupRequest, UserOut, UsernameCheck
from ...services import auth as auth_service
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


@router.post("/signup", response_model=UserOut, status_code=201)
def signup(body: SignupRequest, db: Session = Depends(get_db)) -> UserOut:
    """Create the account only. The user then signs in on the login page (no session yet)."""
    user = auth_service.create_user(
        db, full_name=body.full_name, username=body.username, email=body.email, password=body.password
    )
    db.commit()
    return auth_service.user_to_out(user)


@router.post("/login", response_model=UserOut)
def login(
    body: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> UserOut:
    user = auth_service.authenticate(db, body.identifier, body.password)
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
