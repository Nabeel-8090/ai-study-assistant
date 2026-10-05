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

APP_NAME = "RAGGG"


def send_email(settings: Settings, to: str, subject: str, body: str, html_body: str = None) -> None:
    """Deliver one plain-text email. Never raises: it runs after the HTTP response was sent."""
    if settings.email_backend == "console":
        logger.warning("EMAIL (console backend, NOT actually sent)\n  To: %s\n  Subject: %s\n\n%s", to, subject, body)
        return

    message = EmailMessage()
    message["From"] = f"{APP_NAME} <{settings.smtp_from}>"
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    if html_body:
        message.add_alternative(html_body, subtype="html")
        
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
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #000000; margin: 0; padding: 40px 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #111111; border: 1px solid #333333; border-radius: 12px; padding: 40px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <div style="text-align: center; margin-bottom: 40px;">
                <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -0.5px;">RAGGG</h1>
                <p style="color: #888888; margin: 8px 0 0 0; font-size: 15px;">Your AI Study Companion</p>
            </div>
            <h2 style="color: #eeeeee; font-size: 22px; margin-top: 0; font-weight: 600;">Hi {first_name},</h2>
            <p style="color: #bbbbbb; font-size: 16px; line-height: 1.6;">{intro}</p>
            
            <div style="background-color: #222222; border: 1px solid #444444; border-radius: 8px; padding: 24px; text-align: center; margin: 35px 0; -webkit-user-select: all; user-select: all;">
                <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 42px; font-weight: bold; color: #ffffff; display: inline-block; padding: 10px;">{code}</span>
            </div>
            
            <p style="color: #aaaaaa; font-size: 15px; line-height: 1.6;">
                This code expires in <strong style="color: #dddddd;">{minutes} minutes</strong> and can be used once. Never share it with anyone.
            </p>
            
            <hr style="border: none; border-top: 1px solid #333333; margin: 40px 0;">
            
            <p style="color: #cccccc; font-size: 14px; line-height: 1.6; margin: 0; text-align: center;">
                {outro}<br><br>
                &copy; 2026 RAGGG
            </p>
        </div>
    </body>
    </html>
    """
    
    send_email(settings, to, subject, body, html_body=html_body)


def send_welcome_email(settings: Settings, to: str, full_name: str) -> None:
    first_name = full_name.split()[0] if full_name.strip() else "there"
    subject = f"Welcome to {APP_NAME}!"
    body = (
        f"Hi {first_name},\n\n"
        f"Your email has been successfully verified, and your account is ready to go!\n\n"
        f"Start exploring {APP_NAME} now. Feel free to ask your AI study companion anything.\n\n"
        f"Happy learning,\n"
        f"- The {APP_NAME} Team\n"
    )
    
    app_url = settings.allowed_origins[0] if settings.allowed_origins else "http://localhost:5173"
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #000000; margin: 0; padding: 40px 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #111111; border: 1px solid #333333; border-radius: 12px; padding: 40px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <div style="text-align: center; margin-bottom: 40px;">
                <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -0.5px;">RAGGG</h1>
                <p style="color: #888888; margin: 8px 0 0 0; font-size: 15px;">Your AI Study Companion</p>
            </div>
            <h2 style="color: #eeeeee; font-size: 22px; margin-top: 0; font-weight: 600;">Welcome, {first_name}!</h2>
            <p style="color: #bbbbbb; font-size: 16px; line-height: 1.6;">Your email has been successfully verified, and your account is ready to go.</p>
            
            <p style="color: #aaaaaa; font-size: 15px; line-height: 1.6;">
                Start exploring <strong>{APP_NAME}</strong> now. Feel free to ask your AI study companion anything.
            </p>
            
            <div style="text-align: center; margin: 40px 0;">
                <a href="{app_url}" style="background-color: #ffffff; color: #000000; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">Start Chatting Now</a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #333333; margin: 40px 0;">
            
            <p style="color: #cccccc; font-size: 14px; line-height: 1.6; margin: 0; text-align: center;">
                Happy learning,<br>The {APP_NAME} Team<br><br>
                &copy; 2026 RAGGG
            </p>
        </div>
    </body>
    </html>
    """
    
    send_email(settings, to, subject, body, html_body=html_body)


def send_password_changed_email(settings: Settings, to: str, full_name: str) -> None:
    first_name = full_name.split()[0] if full_name.strip() else "there"
    subject = f"Your {APP_NAME} password was changed"
    body = (
        f"Hi {first_name},\n\n"
        f"This is a confirmation that the password for your {APP_NAME} account has just been changed.\n\n"
        f"If you made this change, you can safely ignore this email.\n"
        f"If you didn't change your password, please secure your account immediately.\n\n"
        f"- {APP_NAME} Security\n"
    )
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #000000; margin: 0; padding: 40px 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #111111; border: 1px solid #333333; border-radius: 12px; padding: 40px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <div style="text-align: center; margin-bottom: 40px;">
                <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -0.5px;">RAGGG</h1>
                <p style="color: #888888; margin: 8px 0 0 0; font-size: 15px;">Your AI Study Companion</p>
            </div>
            <h2 style="color: #eeeeee; font-size: 22px; margin-top: 0; font-weight: 600;">Hi {first_name},</h2>
            
            <div style="background-color: #331111; border-left: 4px solid #ff4444; border-radius: 4px; padding: 16px; margin: 25px 0;">
                <p style="color: #ffcccc; margin: 0; font-size: 16px; font-weight: 600;">Password Change Confirmation</p>
                <p style="color: #eebbbb; margin: 8px 0 0 0; font-size: 15px; line-height: 1.5;">The password for your {APP_NAME} account has just been changed.</p>
            </div>
            
            <p style="color: #aaaaaa; font-size: 15px; line-height: 1.6;">
                If you made this change, you can safely ignore this email.
            </p>
            
            <p style="color: #aaaaaa; font-size: 15px; line-height: 1.6;">
                If you didn't change your password, please go to the app and reset your password immediately to secure your account.
            </p>
            
            <hr style="border: none; border-top: 1px solid #333333; margin: 40px 0;">
            
            <p style="color: #cccccc; font-size: 14px; line-height: 1.6; margin: 0; text-align: center;">
                {APP_NAME} Security<br><br>
                &copy; 2026 RAGGG
            </p>
        </div>
    </body>
    </html>
    """
    
    send_email(settings, to, subject, body, html_body=html_body)
