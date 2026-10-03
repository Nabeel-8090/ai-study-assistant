"""One-time email codes: create, rate-limit, and check them.

Security rules in this file:
  * The 6-digit code is stored only as an HMAC (keyed with SECRET_KEY). 6 digits are too
    few to protect with a plain hash, so the secret key is what makes a stolen table useless.
  * A code works once, expires (OTP_TTL_MINUTES), and dies after OTP_MAX_ATTEMPTS wrong guesses.
  * Asking for a new code cancels the old ones, and sending is rate limited
    (cooldown between sends + a cap per hour).
  * A code made for one purpose can never be used for the other.
"""

import hashlib
import hmac
import secrets
from datetime import timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..core.config import Settings
from ..models import OTPCode, User
from .auth import utcnow

VERIFY_EMAIL = "verify_email"
RESET_PASSWORD = "reset_password"


def _digest(settings: Settings, user: User, purpose: str, code: str) -> str:
    message = f"{user.id}:{purpose}:{code}".encode()
    return hmac.new(settings.secret_key.encode(), message, hashlib.sha256).hexdigest()


def issue_code(db: Session, user: User, purpose: str, settings: Settings) -> str | None:
    """Create a fresh code and return it. Returns None if sending is rate limited.

    The caller must commit. Nothing here tells the *client* whether a code was skipped.
    """
    now = utcnow()
    mine = (OTPCode.user_id == user.id, OTPCode.purpose == purpose)

    last_sent = db.scalar(select(func.max(OTPCode.created_at)).where(*mine))
    if last_sent and (now - last_sent).total_seconds() < settings.otp_resend_cooldown_seconds:
        return None
    sent_last_hour = db.scalar(
        select(func.count()).select_from(OTPCode).where(*mine, OTPCode.created_at > now - timedelta(hours=1))
    )
    if sent_last_hour >= settings.otp_max_sends_per_hour:
        return None

    # Only the newest code may work: cancel any earlier unused ones.
    db.execute(
        update(OTPCode).where(*mine, OTPCode.consumed_at.is_(None)).values(consumed_at=now)
        .execution_options(synchronize_session=False)
    )
    code = f"{secrets.randbelow(10**6):06d}"  # cryptographically secure, always 6 digits
    db.add(OTPCode(
        user_id=user.id,
        purpose=purpose,
        code_hash=_digest(settings, user, purpose, code),
        expires_at=now + timedelta(minutes=settings.otp_ttl_minutes),
        created_at=now,
    ))
    db.flush()
    return code


def check_code(db: Session, user: User, purpose: str, code: str, settings: Settings) -> bool:
    """True if `code` is the user's valid code. A correct code is used up (caller must commit)."""
    now = utcnow()
    row = db.scalar(
        select(OTPCode)
        .where(OTPCode.user_id == user.id, OTPCode.purpose == purpose,
               OTPCode.consumed_at.is_(None), OTPCode.expires_at > now)
        .order_by(OTPCode.created_at.desc())
        .limit(1)
    )
    if row is None:
        return False

    # Count this guess BEFORE comparing, atomically, and save it even if the guess is wrong.
    # (If it were saved only on success, an attacker could guess forever.)
    attempts = db.execute(
        update(OTPCode)
        .where(OTPCode.id == row.id, OTPCode.attempts < settings.otp_max_attempts)
        .values(attempts=OTPCode.attempts + 1)
        .returning(OTPCode.attempts)
        .execution_options(synchronize_session=False)
    ).scalar()
    db.commit()
    if attempts is None:
        return False  # too many wrong guesses: this code is dead

    if not hmac.compare_digest(row.code_hash, _digest(settings, user, purpose, code)):
        return False

    # Use it up. The "consumed_at IS NULL" condition means two simultaneous requests
    # with the same correct code cannot both succeed.
    used = db.execute(
        update(OTPCode).where(OTPCode.id == row.id, OTPCode.consumed_at.is_(None))
        .values(consumed_at=now).execution_options(synchronize_session=False)
    ).rowcount
    return used == 1
