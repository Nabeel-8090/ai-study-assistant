"""Email verification (OTP), forgot/reset password, and terms acceptance. Needs PostgreSQL."""

import os
from dataclasses import replace
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.legal import TERMS_VERSION
from app.db.session import get_engine
from app.main import app
from app.models import AuthSession, OTPCode, User
from app.services import otp
from app.services.auth import utcnow

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL is not set (needs PostgreSQL)"
)

ORIGIN = {"Origin": "http://localhost:5173"}
EMAIL = "ayesha@example.com"
SIGNUP = {
    "full_name": "Ayesha Khan", "username": "ayesha_k", "email": "Ayesha@Example.com",
    "password": "correct-horse-1", "accept_terms": True,
}


@pytest.fixture
def client(db_clean, outbox):
    with TestClient(app, headers=ORIGIN) as c:
        c.outbox = outbox
        yield c


def codes(client, purpose, email=EMAIL):
    return [m["code"] for m in client.outbox if m["purpose"] == purpose and m["to"] == email]


def signup(client, **kw):
    return client.post("/api/auth/signup", json={**SIGNUP, **kw})


def verify(client, code, email=EMAIL):
    return client.post("/api/auth/verify-email", json={"email": email, "code": code})


def login(client, password="correct-horse-1"):
    return client.post("/api/auth/login", json={"identifier": "ayesha_k", "password": password})


def age_codes(minutes=0, seconds=0):
    """Pretend the existing codes were created that long ago (to test cooldown and expiry)."""
    with get_engine().begin() as conn:
        conn.execute(text("UPDATE otp_codes SET created_at = created_at - make_interval(mins => :m, secs => :s)"),
                     {"m": minutes, "s": seconds})


# ---------- terms ----------


def test_signup_requires_accepting_terms(client):
    assert signup(client, accept_terms=False).status_code == 422
    body = {k: v for k, v in SIGNUP.items() if k != "accept_terms"}
    assert client.post("/api/auth/signup", json=body).status_code == 422
    assert client.outbox == []  # nothing was created, nothing was emailed


def test_acceptance_of_terms_is_recorded(client):
    signup(client)
    with Session(get_engine()) as db:
        user = db.scalar(select(User))
        assert user.terms_version == TERMS_VERSION and user.terms_accepted_at is not None


# ---------- verification ----------


def test_signup_sends_a_six_digit_code_and_account_starts_unverified(client):
    assert signup(client).status_code == 201
    [code] = codes(client, "verify_email")
    assert len(code) == 6 and code.isdigit()
    with Session(get_engine()) as db:
        assert db.scalar(select(User)).email_verified_at is None


def test_code_is_stored_as_a_hmac_not_plaintext(client):
    signup(client)
    [code] = codes(client, "verify_email")
    with Session(get_engine()) as db:
        row = db.scalar(select(OTPCode))
        assert row.code_hash != code and len(row.code_hash) == 64 and code not in row.code_hash


def test_cannot_sign_in_until_email_is_verified(client):
    signup(client)
    res = login(client)
    assert res.status_code == 403 and res.json()["code"] == "email_not_verified"
    assert res.json()["email"] == EMAIL
    assert "set-cookie" not in res.headers
    # A wrong password must still look like any other failed login (no account hints).
    assert login(client, "wrong-password-1").json()["code"] == "invalid_credentials"


def test_correct_code_verifies_then_login_works(client):
    signup(client)
    [code] = codes(client, "verify_email")
    assert verify(client, code).status_code == 200
    assert login(client).status_code == 200


def test_wrong_code_is_rejected(client):
    signup(client)
    [code] = codes(client, "verify_email")
    wrong = "000000" if code != "000000" else "111111"
    res = verify(client, wrong)
    assert res.status_code == 400 and res.json()["code"] == "invalid_code"
    assert login(client).status_code == 403


def test_code_works_only_once(client):
    signup(client)
    [code] = codes(client, "verify_email")
    assert verify(client, code).status_code == 200
    assert verify(client, code).status_code == 400


def test_expired_code_is_rejected(client):
    signup(client)
    [code] = codes(client, "verify_email")
    with get_engine().begin() as conn:
        conn.execute(text("UPDATE otp_codes SET expires_at = now() - interval '1 second'"))
    assert verify(client, code).status_code == 400


def test_code_dies_after_too_many_wrong_guesses(client):
    signup(client)
    [code] = codes(client, "verify_email")
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(get_settings().otp_max_attempts):
        assert verify(client, wrong).status_code == 400
    assert verify(client, code).status_code == 400  # even the right code no longer works
    with Session(get_engine()) as db:
        assert db.scalar(select(User)).email_verified_at is None


def test_malformed_codes_and_unknown_emails_get_safe_errors(client):
    signup(client)
    assert verify(client, "12345").status_code == 422
    assert verify(client, "abcdef").status_code == 422
    unknown = verify(client, "123456", email="nobody@example.com")
    assert unknown.status_code == 400 and unknown.json()["code"] == "invalid_code"


def test_resend_respects_cooldown_and_replaces_old_code(client):
    signup(client)
    [first] = codes(client, "verify_email")
    again = lambda: client.post("/api/auth/resend-verification", json={"email": EMAIL})  # noqa: E731
    assert again().status_code == 200
    assert len(codes(client, "verify_email")) == 1  # too soon: silently ignored
    age_codes(seconds=61)
    assert again().status_code == 200
    first_list = codes(client, "verify_email")
    assert len(first_list) == 2
    new = first_list[-1]
    if new != first:
        assert verify(client, first).status_code == 400  # the old code was cancelled
    assert verify(client, new).status_code == 200


def test_resend_gives_same_answer_for_unknown_or_verified_accounts(client):
    signup(client)
    [code] = codes(client, "verify_email")
    verify(client, code)
    a = client.post("/api/auth/resend-verification", json={"email": EMAIL})
    b = client.post("/api/auth/resend-verification", json={"email": "ghost@example.com"})
    assert a.status_code == b.status_code == 200 and a.json() == b.json()
    assert len(codes(client, "verify_email")) == 1  # nothing new was sent


def test_hourly_send_cap(client):
    signup(client)
    settings = replace(get_settings(), otp_resend_cooldown_seconds=0, otp_max_sends_per_hour=3)
    with Session(get_engine()) as db:
        user = db.scalar(select(User))
        results = [otp.issue_code(db, user, otp.VERIFY_EMAIL, settings) for _ in range(4)]
        db.commit()
    # signup already used 1 of the 3 allowed: two more succeed, the fourth is refused.
    assert [r is not None for r in results] == [True, True, False, False]


# ---------- forgot / reset password ----------


def make_verified_user(client):
    signup(client)
    verify(client, codes(client, "verify_email")[0])


def test_forgot_password_does_not_reveal_whether_an_account_exists(client):
    make_verified_user(client)
    known = client.post("/api/auth/forgot-password", json={"email": EMAIL})
    unknown = client.post("/api/auth/forgot-password", json={"email": "ghost@example.com"})
    assert known.status_code == unknown.status_code == 200 and known.json() == unknown.json()
    assert len(codes(client, "reset_password")) == 1
    assert codes(client, "reset_password", "ghost@example.com") == []


def test_reset_password_changes_password_and_signs_out_everywhere(client):
    make_verified_user(client)
    assert login(client).status_code == 200  # an existing signed-in session...
    other = TestClient(app, headers=ORIGIN)
    assert other.post("/api/auth/login", json={"identifier": "ayesha_k", "password": "correct-horse-1"}).status_code == 200

    client.post("/api/auth/forgot-password", json={"email": EMAIL})
    [code] = codes(client, "reset_password")
    res = client.post("/api/auth/reset-password", json={"email": EMAIL, "code": code, "new_password": "brand-new-pass-9"})
    assert res.status_code == 200

    assert client.get("/api/auth/me").status_code == 401  # ...is ended by the reset
    assert other.get("/api/auth/me").status_code == 401
    assert login(client, "correct-horse-1").status_code == 401  # old password is dead
    assert login(client, "brand-new-pass-9").status_code == 200
    with Session(get_engine()) as db:
        assert db.scalar(select(User)).password_hash.startswith("$argon2id$")


def test_reset_code_cannot_be_reused_or_guessed(client):
    make_verified_user(client)
    client.post("/api/auth/forgot-password", json={"email": EMAIL})
    [code] = codes(client, "reset_password")
    body = {"email": EMAIL, "code": code, "new_password": "brand-new-pass-9"}
    wrong = {**body, "code": "000000" if code != "000000" else "111111"}
    assert client.post("/api/auth/reset-password", json=wrong).status_code == 400
    assert client.post("/api/auth/reset-password", json=body).status_code == 200
    assert client.post("/api/auth/reset-password", json={**body, "new_password": "another-pass-77"}).status_code == 400
    assert login(client, "brand-new-pass-9").status_code == 200  # the second attempt changed nothing


def test_reset_validates_the_new_password(client):
    make_verified_user(client)
    client.post("/api/auth/forgot-password", json={"email": EMAIL})
    [code] = codes(client, "reset_password")
    res = client.post("/api/auth/reset-password", json={"email": EMAIL, "code": code, "new_password": "short"})
    assert res.status_code == 422 and "short" not in res.text
    # the code was not used up by the rejected request, so it still works
    ok = client.post("/api/auth/reset-password", json={"email": EMAIL, "code": code, "new_password": "long-enough-pass-1"})
    assert ok.status_code == 200


def test_code_for_one_purpose_cannot_be_used_for_the_other(client):
    signup(client)  # verification code issued; account unverified
    [verify_code] = codes(client, "verify_email")
    res = client.post("/api/auth/reset-password", json={"email": EMAIL, "code": verify_code, "new_password": "brand-new-pass-9"})
    assert res.status_code == 400
    client.post("/api/auth/forgot-password", json={"email": EMAIL})
    [reset_code] = codes(client, "reset_password")
    if reset_code != verify_code:
        assert verify(client, reset_code).status_code == 400


def test_reset_also_verifies_an_unverified_email(client):
    signup(client)  # never verified
    client.post("/api/auth/forgot-password", json={"email": EMAIL})
    [code] = codes(client, "reset_password")
    client.post("/api/auth/reset-password", json={"email": EMAIL, "code": code, "new_password": "brand-new-pass-9"})
    assert login(client, "brand-new-pass-9").status_code == 200


# ---------- protection ----------


@pytest.mark.parametrize("path,body", [
    ("/api/auth/verify-email", {"email": EMAIL, "code": "123456"}),
    ("/api/auth/resend-verification", {"email": EMAIL}),
    ("/api/auth/forgot-password", {"email": EMAIL}),
    ("/api/auth/reset-password", {"email": EMAIL, "code": "123456", "new_password": "brand-new-pass-9"}),
])
def test_new_endpoints_enforce_the_origin_check(db_clean, path, body):
    with TestClient(app) as bare:
        res = bare.post(path, json=body, headers={"Origin": "https://evil.example"})
        assert res.status_code == 403 and res.json()["code"] == "untrusted_origin"


def test_codes_are_deleted_with_the_user(client):
    signup(client)
    with get_engine().begin() as conn:
        conn.execute(text("DELETE FROM users"))
        assert conn.execute(text("SELECT count(*) FROM otp_codes")).scalar() == 0
