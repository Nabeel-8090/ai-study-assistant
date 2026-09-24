"""The only place that talks to Gemini."""

import asyncio
import logging
from time import perf_counter

import httpx
from google import genai
from google.genai import errors, types

from .config import Settings

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = (
    "You are a helpful assistant in a simple chat app. "
    "Answer clearly and accurately. Keep answers as short as the question allows. "
    "Use Markdown for structure (short lists, code blocks, tables) when it helps."
)


class LLMError(Exception):
    """The Gemini call failed or returned nothing usable."""

    status_code = 502
    code = "upstream_error"
    public_message = "The AI service failed to respond. Please try again."
    retryable = True


class LLMTimeoutError(LLMError):
    """Gemini did not finish within its deadline."""

    status_code = 504
    code = "upstream_timeout"
    public_message = "The AI service timed out. Please try again in a moment."


class LLMUnavailableError(LLMError):
    status_code = 503
    code = "service_unavailable"
    public_message = "Google's Gemini service is temporarily busy or unavailable. Please try again later."


class LLMRateLimitError(LLMError):
    status_code = 429
    code = "rate_limited"
    public_message = "The AI service's request limit or quota has been reached. Please try later."


class LLMConfigurationError(LLMError):
    status_code = 503
    code = "ai_configuration_error"
    public_message = "The AI service is not configured correctly. Please contact the app administrator."
    retryable = False


class LLMBlockedError(LLMError):
    status_code = 422
    code = "response_blocked"
    public_message = "The AI service could not answer this message. Please rephrase it."
    retryable = False


def _translate_error(exc: Exception) -> LLMError:
    if isinstance(exc, (TimeoutError, httpx.TimeoutException)):
        return LLMTimeoutError("Gemini request exceeded its deadline.")
    if isinstance(exc, httpx.TransportError):
        return LLMUnavailableError("Cannot connect to Gemini.")
    if isinstance(exc, errors.APIError):
        if exc.code in (408, 504):
            return LLMTimeoutError("Gemini returned a deadline error.")
        if exc.code in (500, 502, 503):
            return LLMUnavailableError("Gemini is unavailable.")
        if exc.code == 429:
            return LLMRateLimitError("Gemini rate limit or quota exceeded.")
        if exc.code in (400, 401, 403, 404):
            return LLMConfigurationError(
                "Gemini rejected the request configuration. Check GEMINI_API_KEY, GEMINI_MODEL and API access."
            )
    return LLMError("Gemini request failed.")


_client: genai.Client | None = None


def _get_client(settings: Settings) -> genai.Client:
    """Create the Gemini client on first use and reuse it afterwards."""
    global _client
    if _client is None:
        if not settings.gemini_api_key:
            raise LLMConfigurationError("GEMINI_API_KEY is not set. Add it to backend/.env.")
        _client = genai.Client(
            api_key=settings.gemini_api_key,
            http_options=types.HttpOptions(
                timeout=int(settings.request_timeout_seconds * 1000),  # milliseconds
                retry_options=types.HttpRetryOptions(
                    attempts=1,  # Interactive chat: let the user decide whether to retry.
                ),
            ),
        )
    return _client


async def close_client() -> None:
    """Release both connection pools when the application shuts down."""
    global _client
    client, _client = _client, None
    if client is not None:
        try:
            await client.aio.aclose()
        finally:
            client.close()


async def generate_answer(message: str, settings: Settings) -> str:
    """Send one message to Gemini and return the text of its reply."""
    client = _get_client(settings)
    started = perf_counter()
    try:
        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=settings.gemini_model,
                contents=message,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                ),
            ),
            timeout=settings.request_timeout_seconds,
        )
    except (errors.APIError, httpx.HTTPError, TimeoutError) as exc:
        # Never log raw upstream payloads: they can contain prompts or credentials.
        logger.warning(
            "Gemini request failed (model=%s, error=%s, upstream_status=%s)",
            settings.gemini_model, type(exc).__name__, getattr(exc, "code", None),
        )
        raise _translate_error(exc) from exc
    finally:
        logger.info("Gemini request finished (model=%s, elapsed=%.2fs)",
                    settings.gemini_model, perf_counter() - started)

    text = (response.text or "").strip()
    if not text:
        feedback = getattr(response, "prompt_feedback", None)
        block_reason = getattr(feedback, "block_reason", None)
        finishes = [getattr(c, "finish_reason", None) for c in (getattr(response, "candidates", None) or [])]
        if (block_reason and block_reason != "BLOCKED_REASON_UNSPECIFIED") or any(
            reason in {"SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY"}
            for reason in finishes
        ):
            raise LLMBlockedError("Gemini blocked the response.")
        logger.warning("Gemini returned no text (model=%s).", settings.gemini_model)
        raise LLMError("Gemini returned an empty response.")
    return text
