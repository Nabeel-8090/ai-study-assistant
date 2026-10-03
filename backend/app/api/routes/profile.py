from fastapi import APIRouter, Depends, Response, UploadFile
from sqlalchemy.orm import Session

from ...db.session import get_db
from ...models import User
from ...schemas.auth import UserOut
from ...services import auth as auth_service
from ...services.avatar import MAX_UPLOAD_BYTES, process_avatar
from ..deps import get_current_user

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("/avatar")
def get_avatar(user: User = Depends(get_current_user)) -> Response:
    if user.avatar_content_type is None or user.avatar_data is None:
        raise auth_service.AuthError(404, "no_avatar", "No profile picture.")
    return Response(
        content=user.avatar_data,
        media_type=user.avatar_content_type,
        headers={"Cache-Control": "private, no-cache", "X-Content-Type-Options": "nosniff"},
    )


@router.put("/avatar", response_model=UserOut)
def upload_avatar(
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    # Plain `def` (not async): image processing and the DB write run in a worker thread.
    raw = file.file.read(MAX_UPLOAD_BYTES + 1)  # never read more than the limit
    data, content_type = process_avatar(raw)
    user.avatar_data = data
    user.avatar_content_type = content_type
    user.avatar_updated_at = auth_service.utcnow()
    db.add(user)
    db.commit()
    return auth_service.user_to_out(user)


@router.delete("/avatar", response_model=UserOut)
def delete_avatar(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> UserOut:
    user.avatar_data = None
    user.avatar_content_type = None
    user.avatar_updated_at = None
    db.add(user)
    db.commit()
    return auth_service.user_to_out(user)
