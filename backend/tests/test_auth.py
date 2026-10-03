"""Authentication tests. They run against a real PostgreSQL database (TEST_DATABASE_URL)."""

import io
import os
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_token
from app.db.session import get_engine
from app.main import app
from app.models import AuthSession, User
from app.services.auth import utcnow

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL is not set (needs PostgreSQL)"
)

ORIGIN = {"Origin": "http://localhost:5173"}
SIGNUP = {
    "full_name": "Ayesha Khan", "username": "Ayesha_K", "email": "Ayesha@Example.com",
    "password": "correct-horse-1", "accept_terms": True,
}


@pytest.fixture
def client(db_clean, outbox):
    with TestClient(app, headers=ORIGIN) as c:
        c.app_outbox = outbox  # the emails "sent" so far
        yield c


def signup(client, **overrides):
    """Create an account. Signup does NOT sign the user in."""
    return client.post("/api/auth/signup", json={**SIGNUP, **overrides})


def login(client, identifier="ayesha_k", password="correct-horse-1"):
    return client.post("/api/auth/login", json={"identifier": identifier, "password": password})


def register(client, **overrides):
    """Signup + verify email + login, for tests that need a signed-in user."""
    res = signup(client, **overrides)
    assert res.status_code == 201
    email = overrides.get("email", SIGNUP["email"]).lower()
    code = [m for m in client.app_outbox if m["to"] == email and m["purpose"] == "verify_email"][-1]["code"]
    assert client.post("/api/auth/verify-email", json={"email": email, "code": code}).status_code == 200
    identifier = overrides.get("username", SIGNUP["username"])
    login_res = login(client, identifier, overrides.get("password", SIGNUP["password"]))
    assert login_res.status_code == 200
    return login_res


def png_bytes(size=(600, 400), fmt="PNG"):
    buf = io.BytesIO()
    Image.new("RGB", size, (200, 30, 30)).save(buf, format=fmt)
    return buf.getvalue()


# ---------- signup ----------


def test_signup_creates_user_but_does_not_sign_in(client):
    res = signup(client)
    assert res.status_code == 201
    assert "set-cookie" not in res.headers
    assert client.get("/api/auth/me").status_code == 401
    body = res.json()
    assert body["username"] == "ayesha_k" and body["email"] == "ayesha@example.com"
    assert body["full_name"] == "Ayesha Khan"
    assert "password" not in str(body).lower() and "hash" not in str(body).lower()


def test_password_is_stored_as_argon2id_hash(client):
    signup(client)
    with Session(get_engine()) as db:
        user = db.scalar(select(User))
        assert user.password_hash.startswith("$argon2id$")
        assert "correct-horse-1" not in user.password_hash


def test_session_cookie_flags_and_only_hash_is_stored(client):
    res = register(client)
    cookie = res.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie and "Path=/" in cookie and "Max-Age=" in cookie
    token = res.cookies.get(get_settings().cookie_name)
    with Session(get_engine()) as db:
        row = db.scalar(select(AuthSession))
        assert row.token_hash == hash_token(token) and token not in row.token_hash


@pytest.mark.parametrize("field,value", [("username", "AYESHA_K"), ("email", "AYESHA@example.COM")])
def test_duplicate_username_or_email_is_rejected_case_insensitively(client, field, value):
    assert signup(client).status_code == 201
    other = {"username": "someone_else", "email": "other@example.com", field: value}
    res = signup(client, **other)
    assert res.status_code == 409
    assert res.json()["field"] == field


def test_database_constraints_stop_duplicates_even_without_app_checks(client):
    signup(client)
    with Session(get_engine()) as db:
        db.add(User(full_name="X", username="ayesha_k", email="x@example.com", password_hash="h"))
        with pytest.raises(Exception, match="uq_users_username"):
            db.commit()


def test_database_rejects_uppercase_username(client):
    with Session(get_engine()) as db:
        db.add(User(full_name="X", username="Upper", email="x@example.com", password_hash="h"))
        with pytest.raises(Exception, match="ck_users_username_lowercase"):
            db.commit()


@pytest.mark.parametrize("overrides", [
    {"email": "not-an-email"},
    {"email": "a@b"},
    {"password": "short"},
    {"password": "x" * 129},
    {"username": "ab"},
    {"username": "has space"},
    {"username": "emoji😀name"},
    {"full_name": "   "},
])
def test_signup_validation(client, overrides):
    res = signup(client, **overrides)
    assert res.status_code == 422
    assert res.json()["code"] == "validation_error"


def test_validation_errors_never_echo_the_password(client):
    res = signup(client, password="short-pw", email="bad")
    assert "short-pw" not in res.text


def test_username_availability(client):
    signup(client)
    check = lambda u: client.get("/api/auth/username-available", params={"username": u}).json()  # noqa: E731
    assert check("AYESHA_K") == {"available": False, "reason": "This username is already taken."}
    assert check("free_name")["available"] is True
    assert check("no")["available"] is False


# ---------- login / logout / session ----------


@pytest.mark.parametrize("identifier", ["ayesha_k", "AYESHA_K", "ayesha@example.com", " Ayesha@Example.com "])
def test_login_with_username_or_email(client, identifier):
    register(client)
    client.post("/api/auth/logout")
    res = client.post("/api/auth/login", json={"identifier": identifier, "password": "correct-horse-1"})
    assert res.status_code == 200
    assert client.get("/api/auth/me").status_code == 200


def test_login_failures_are_generic(client):
    register(client)
    client.post("/api/auth/logout")
    wrong_password = client.post("/api/auth/login", json={"identifier": "ayesha_k", "password": "nope-nope-1"})
    unknown_user = client.post("/api/auth/login", json={"identifier": "ghost", "password": "nope-nope-1"})
    assert wrong_password.status_code == unknown_user.status_code == 401
    assert wrong_password.json() == unknown_user.json()
    assert client.get("/api/auth/me").status_code == 401


def test_me_requires_login(client):
    res = client.get("/api/auth/me")
    assert res.status_code == 401 and res.json()["code"] == "unauthenticated"


def test_logout_invalidates_session_and_clears_cookie(client):
    register(client)
    token = client.cookies.get(get_settings().cookie_name)
    res = client.post("/api/auth/logout")
    assert res.status_code == 204
    assert "Max-Age=0" in res.headers["set-cookie"] or "expires=" in res.headers["set-cookie"].lower()
    # Even a client that kept a copy of the old cookie is rejected: the server forgot the session.
    stale = TestClient(app, headers=ORIGIN, cookies={get_settings().cookie_name: token})
    assert stale.get("/api/auth/me").status_code == 401


def test_expired_session_is_rejected(client):
    register(client)
    with Session(get_engine()) as db:
        row = db.scalar(select(AuthSession))
        row.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    assert client.get("/api/auth/me").status_code == 401


def test_garbage_cookie_is_rejected(client):
    client.cookies.set(get_settings().cookie_name, "not-a-real-token")
    assert client.get("/api/auth/me").status_code == 401


def test_two_users_have_independent_sessions(client):
    register(client)
    other = TestClient(app, headers=ORIGIN)
    other.app_outbox = client.app_outbox
    register(other, username="bilal", email="bilal@example.com", full_name="Bilal")
    assert client.get("/api/auth/me").json()["username"] == "ayesha_k"
    assert other.get("/api/auth/me").json()["username"] == "bilal"


# ---------- CSRF / origin ----------


@pytest.mark.parametrize("headers", [{}, {"Origin": "https://evil.example"}, {"Origin": "null"}])
def test_state_changing_requests_need_a_trusted_origin(db_clean, headers):
    with TestClient(app) as bare:
        res = bare.post("/api/auth/signup", json=SIGNUP, headers=headers)
        assert res.status_code == 403 and res.json()["code"] == "untrusted_origin"
        assert bare.post("/api/auth/login", json={"identifier": "a", "password": "b"}, headers=headers).status_code == 403
        assert bare.post("/api/auth/logout", headers=headers).status_code == 403


def test_referer_is_accepted_when_origin_header_is_missing(db_clean):
    with TestClient(app) as bare:
        res = bare.post("/api/auth/signup", json=SIGNUP, headers={"Referer": "http://localhost:5173/signup"})
        assert res.status_code == 201


def test_get_requests_do_not_need_origin(db_clean):
    with TestClient(app) as bare:
        assert bare.get("/api/auth/me").status_code == 401  # reached the app (not 403)


def test_cors_allows_credentials_for_listed_origin_only(db_clean):
    with TestClient(app) as bare:
        ok = bare.options("/api/auth/login", headers={**ORIGIN, "Access-Control-Request-Method": "POST"})
        assert ok.headers["access-control-allow-origin"] == "http://localhost:5173"
        assert ok.headers["access-control-allow-credentials"] == "true"
        bad = bare.options("/api/auth/login", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
        assert "access-control-allow-origin" not in bad.headers


# ---------- chat is protected ----------


def test_chat_endpoint_requires_login(client):
    assert client.post("/api/chat", json={"message": "hi"}).status_code == 401


# ---------- profile picture ----------


def test_avatar_upload_resize_and_download(client):
    register(client)
    assert client.get("/api/profile/avatar").status_code == 404
    res = client.put("/api/profile/avatar", files={"file": ("me.png", png_bytes(), "image/png")})
    assert res.status_code == 200 and res.json()["has_avatar"] is True and res.json()["avatar_version"]
    img = client.get("/api/profile/avatar")
    assert img.headers["content-type"] == "image/webp"
    assert Image.open(io.BytesIO(img.content)).size == (256, 256)
    assert client.get("/api/auth/me").json()["has_avatar"] is True


def test_avatar_rejects_non_images_and_oversize(client):
    register(client)
    fake = client.put("/api/profile/avatar", files={"file": ("x.png", b"<script>alert(1)</script>", "image/png")})
    assert fake.status_code == 400
    big = client.put("/api/profile/avatar", files={"file": ("x.png", b"0" * (2 * 1024 * 1024 + 10), "image/png")})
    assert big.status_code == 413
    gif = io.BytesIO()
    Image.new("RGB", (10, 10)).save(gif, format="GIF")
    assert client.put("/api/profile/avatar", files={"file": ("x.gif", gif.getvalue(), "image/gif")}).status_code == 400


def test_avatar_remove_and_login_required(client):
    anon = client.put("/api/profile/avatar", files={"file": ("a.png", png_bytes(), "image/png")})
    assert anon.status_code == 401
    register(client)
    client.put("/api/profile/avatar", files={"file": ("a.png", png_bytes(), "image/png")})
    res = client.delete("/api/profile/avatar")
    assert res.json()["has_avatar"] is False
    assert client.get("/api/profile/avatar").status_code == 404


def test_deleting_a_user_deletes_their_sessions(client):
    register(client)
    with get_engine().begin() as conn:
        conn.execute(text("DELETE FROM users"))
        assert conn.execute(text("SELECT count(*) FROM sessions")).scalar() == 0
