"""Sending email. The only module that knows how mail is delivered.

EMAIL_BACKEND=console  (development)  prints the email in the server terminal. Nothing is sent.
EMAIL_BACKEND=smtp     (real)         sends through your SMTP server (Gmail, Brevo, ...).
"""

import logging
import smtplib
import ssl
from email.message import EmailMessage

from ..core.config import Settings

logger = logging.getLogger(__name__)

APP_NAME = "AI Study Assistant"


def send_email(settings: Settings, to: str, subject: str, body: str) -> None:
    """Deliver one plain-text email. Never raises: it runs after the HTTP response was sent."""
    if settings.email_backend == "console":
        logger.warning("EMAIL (console backend, NOT actually sent)\n  To: %s\n  Subject: %s\n\n%s", to, subject, body)
        return

    message = EmailMessage()
    message["From"] = f"{APP_NAME} <{settings.smtp_from}>"
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    try:
        context = ssl.create_default_context()
        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15, context=context) as server:
                if settings.smtp_username:
                    server.login(settings.smtp_username, settings.smtp_password)
                server.send_message(message)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
                server.starttls(context=context)
                if settings.smtp_username:
                    server.login(settings.smtp_username, settings.smtp_password)
                server.send_message(message)
        logger.info("Email sent (subject=%r)", subject)
    except (smtplib.SMTPException, OSError) as exc:
        # The error text comes from the mail server and never contains our password.
        logger.error("Could not send email via SMTP (%s): %s", type(exc).__name__, exc)


def send_otp_email(settings: Settings, to: str, full_name: str, code: str, purpose: str) -> None:
    minutes = settings.otp_ttl_minutes
    first_name = full_name.split()[0] if full_name.strip() else "there"
    if purpose == "reset_password":
        subject = f"{APP_NAME}: your password reset code"
        intro = "We received a request to reset your password."
        outro = "If you did not ask for this, you can ignore this email. Your password will not change."
    else:
        subject = f"{APP_NAME}: verify your email"
        intro = "Use this code to verify your email address."
        outro = "If you did not create an account, you can ignore this email."
    body = (
        f"Hi {first_name},\n\n{intro}\n\n"
        f"    {code}\n\n"
        f"This code expires in {minutes} minutes and can be used once. "
        f"Never share it with anyone.\n\n{outro}\n\n- {APP_NAME}\n"
    )
    send_email(settings, to, subject, body)
