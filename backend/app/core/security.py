"""Password hashing and session-token helpers. No database code here."""

import hashlib
import secrets
from functools import lru_cache

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

# Argon2id with the library's recommended defaults. The salt is random and is
# stored inside the hash string itself, so one column is enough.
_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


@lru_cache
def dummy_hash() -> str:
    """Verified against when the user does not exist, so login takes similar time either way."""
    return _hasher.hash("not-a-real-password")


def new_session_token() -> str:
    """256 bits of cryptographically secure randomness, safe to put in a cookie."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """SHA-256 is right here: the token is random and long, unlike a human password."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
