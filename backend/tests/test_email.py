"""Email sending. Uses fake SMTP classes, so no real mail is sent and no database is needed."""

import logging
import smtplib
from dataclasses import replace

import pytest

from app.core.config import Settings
from app.services import email as email_service

# The shared "outbox" fixture (conftest.py) replaces email_service.send_otp_email in every test.
# Keep a reference to the real function, taken at import time, so these tests exercise it.
real_send_otp_email = email_service.send_otp_email

SMTP = Settings(
    "", "m", [], 5,
    email_backend="smtp", smtp_host="smtp.example.com", smtp_port=587,
    smtp_username="me@example.com", smtp_password="super-secret-app-password", smtp_from="me@example.com",
    secret_key="k",
)


class FakeSMTP:
    instances: list["FakeSMTP"] = []
    fail_login = False

    def __init__(self, host, port, timeout=None, context=None):
        self.host, self.port, self.calls, self.message = host, port, [], None
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self, context=None):
        self.calls.append("starttls")

    def login(self, user, password):
        self.calls.append(("login", user, password))
        if FakeSMTP.fail_login:
            raise smtplib.SMTPAuthenticationError(535, b"5.7.8 Username and Password not accepted")

    def send_message(self, message):
        self.calls.append("send")
        self.message = message


@pytest.fixture(autouse=True)
def fake_smtp(monkeypatch):
    FakeSMTP.instances, FakeSMTP.fail_login = [], False
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(smtplib, "SMTP_SSL", FakeSMTP)


def test_port_587_uses_starttls_then_login_then_send():
    real_send_otp_email(SMTP, "ayesha@example.com", "Ayesha Khan", "123456", "verify_email")
    [conn] = FakeSMTP.instances
    assert conn.calls == ["starttls", ("login", "me@example.com", "super-secret-app-password"), "send"]
    assert conn.message["To"] == "ayesha@example.com"
    body = conn.message.get_content()
    assert "123456" in body and "Hi Ayesha" in body and "10 minutes" in body


def test_reset_email_has_its_own_subject():
    real_send_otp_email(SMTP, "a@example.com", "A", "654321", "reset_password")
    assert "password reset" in FakeSMTP.instances[0].message["Subject"]


def test_port_465_uses_implicit_ssl_without_starttls():
    real_send_otp_email(replace(SMTP, smtp_port=465), "a@example.com", "A", "111111", "verify_email")
    assert "starttls" not in FakeSMTP.instances[0].calls


def test_smtp_failure_never_raises_and_never_logs_the_password(caplog):
    FakeSMTP.fail_login = True
    with caplog.at_level(logging.INFO):
        real_send_otp_email(SMTP, "a@example.com", "A", "222222", "verify_email")  # must not raise
    assert "Could not send email" in caplog.text
    assert "super-secret-app-password" not in caplog.text and "222222" not in caplog.text


def test_console_backend_prints_instead_of_sending(caplog):
    console = replace(SMTP, email_backend="console")
    with caplog.at_level(logging.WARNING):
        real_send_otp_email(console, "a@example.com", "A", "333333", "verify_email")
    assert FakeSMTP.instances == []
    assert "333333" in caplog.text and "NOT actually sent" in caplog.text


def test_settings_do_not_leak_secrets_through_repr():
    text = repr(SMTP)
    assert "super-secret-app-password" not in text and "secret_key" not in text
    assert "postgresql" not in repr(replace(SMTP, database_url="postgresql://u:pw@h/db"))


@pytest.mark.parametrize("kwargs", [
    {"email_backend": "pigeon"},
    {"email_backend": "smtp", "smtp_host": ""},
    {"otp_ttl_minutes": 0},
    {"otp_max_attempts": 0},
])
def test_bad_email_settings_are_rejected_at_startup(kwargs):
    with pytest.raises(ValueError):
        replace(SMTP, **kwargs)
