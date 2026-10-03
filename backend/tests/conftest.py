"""Test setup. Auth tests need a real PostgreSQL database, separate from development.

Set TEST_DATABASE_URL (see README). Tests TRUNCATE tables, so the database name must
end in "_test" and must never be the development database.
"""

import os
from urllib.parse import urlsplit

import pytest

TEST_URL = os.getenv("TEST_DATABASE_URL", "").strip()
if TEST_URL:
    db_name = urlsplit(TEST_URL).path.rsplit("/", 1)[-1]
    if not db_name.endswith("_test") or TEST_URL == os.getenv("DATABASE_URL", "").strip():
        raise RuntimeError("TEST_DATABASE_URL must point to a dedicated database whose name ends in '_test'.")
    # Must happen before the app is imported: settings are read once.
    os.environ["DATABASE_URL"] = TEST_URL
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production-0123456789")
os.environ.setdefault("EMAIL_BACKEND", "console")
os.environ.setdefault("COOKIE_SECURE", "false")
os.environ.setdefault("COOKIE_SAMESITE", "lax")


@pytest.fixture(scope="session")
def migrated_db():
    """Build the schema with Alembic (this also tests the migration itself)."""
    from alembic import command
    from alembic.config import Config

    command.upgrade(Config("alembic.ini"), "head")
    yield


@pytest.fixture
def db_clean(migrated_db):
    from sqlalchemy import text

    from app.db.session import get_engine

    with get_engine().begin() as conn:
        conn.execute(text("TRUNCATE TABLE otp_codes, sessions, users CASCADE"))
    yield


@pytest.fixture(autouse=True)
def outbox(monkeypatch):
    """Capture the emails the app would send, so tests can read the codes.

    Each entry is {"to", "purpose", "code"}. Nothing is printed or really sent.
    """
    from app.services import email as email_service

    sent: list[dict] = []

    def fake_send(settings, to, full_name, code, purpose):
        sent.append({"to": to, "purpose": purpose, "code": code})

    monkeypatch.setattr(email_service, "send_otp_email", fake_send)
    return sent
