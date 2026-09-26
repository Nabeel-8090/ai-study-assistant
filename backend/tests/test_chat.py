import asyncio
from types import SimpleNamespace
from dataclasses import replace
from unittest.mock import AsyncMock, Mock

import pytest
import httpx
from fastapi.testclient import TestClient
from google import genai

from app.services import llm
from app.core.config import Settings, get_settings
from app.main import app

client = TestClient(app, raise_server_exceptions=False)


def fake_answer(text: str):
    async def _fake(message: str, settings: Settings) -> str:
        return text

    return _fake


def fake_failure(exc: Exception):
    async def _fake(message: str, settings: Settings) -> str:
        raise exc

    return _fake


# ---------- API ----------


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_chat_returns_answer(monkeypatch):
    monkeypatch.setattr(llm, "generate_answer", fake_answer("An OS manages hardware."))
    res = client.post("/api/chat", json={"message": "explain me OS concepts"})
    assert res.status_code == 200
    assert res.json() == {"answer": "An OS manages hardware."}


def test_message_is_trimmed_before_it_reaches_the_llm(monkeypatch):
    seen = {}

    async def _capture(message: str, settings: Settings) -> str:
        seen["message"] = message
        return "ok"

    monkeypatch.setattr(llm, "generate_answer", _capture)
    client.post("/api/chat", json={"message": "  hello  "})
    assert seen["message"] == "hello"


@pytest.mark.parametrize(
    "payload",
    [{}, {"message": ""}, {"message": "   "}, {"message": "x" * 4001}, {"message": 123}],
)
def test_invalid_message_is_rejected(payload):
    assert client.post("/api/chat", json=payload).status_code == 422


def test_llm_failure_returns_502(monkeypatch):
    monkeypatch.setattr(llm, "generate_answer", fake_failure(llm.LLMError("boom")))
    res = client.post("/api/chat", json={"message": "hi"})
    assert res.status_code == 502
    assert res.json() == {
        "detail": "The AI service failed to respond. Please try again.",
        "code": "upstream_error", "retryable": True,
    }


def test_unexpected_error_returns_500(monkeypatch):
    monkeypatch.setattr(llm, "generate_answer", fake_failure(RuntimeError("bug")))
    res = client.post("/api/chat", json={"message": "hi"})
    assert res.status_code == 500
    assert res.json() == {"detail": "Something went wrong."}


def test_timeout_returns_504(monkeypatch):
    monkeypatch.setattr(llm, "generate_answer", fake_failure(llm.LLMTimeoutError("slow")))
    res = client.post("/api/chat", json={"message": "hi"})
    assert res.status_code == 504
    assert "timed out" in res.json()["detail"]


def test_cors_allows_the_frontend_origin():
    res = client.options(
        "/api/chat",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == "http://localhost:5173"


# ---------- Gemini wrapper ----------

SETTINGS = Settings(
    gemini_api_key="test-key",
    gemini_model="test-model",
    allowed_origins=[],
    request_timeout_seconds=5,
)


def fake_gemini(*, text=None, error=None):
    """A stand-in for the google-genai client."""

    async def generate_content(**kwargs):
        if error:
            raise error
        return SimpleNamespace(text=text)

    return SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate_content)))


def test_generate_answer_returns_stripped_text(monkeypatch):
    monkeypatch.setattr(llm, "_get_client", lambda s: fake_gemini(text="  hello \n"))
    assert asyncio.run(llm.generate_answer("hi", SETTINGS)) == "hello"


def test_generate_answer_rejects_empty_text(monkeypatch):
    monkeypatch.setattr(llm, "_get_client", lambda s: fake_gemini(text=None))
    with pytest.raises(llm.LLMError):
        asyncio.run(llm.generate_answer("hi", SETTINGS))


def test_generate_answer_wraps_sdk_errors(monkeypatch):
    monkeypatch.setattr(llm, "_get_client", lambda s: fake_gemini(error=TimeoutError("slow")))
    with pytest.raises(llm.LLMError):
        asyncio.run(llm.generate_answer("hi", SETTINGS))


def test_missing_api_key_is_reported(monkeypatch):
    monkeypatch.setattr(llm, "_client", None)
    no_key = Settings("", "m", [], 5)
    with pytest.raises(llm.LLMError, match="GEMINI_API_KEY"):
        asyncio.run(llm.generate_answer("hi", no_key))


@pytest.mark.parametrize("status", [504, 503, 400, 401, 403, 404, 429])
def test_sdk_does_not_retry_chat_failures(monkeypatch, status):
    calls = []
    real_client = genai.Client

    def handler(request):
        calls.append(request)
        if len(calls) == 1:
            return httpx.Response(status, json={"error": {"code": status, "message": "failed"}})
        return httpx.Response(200, json={"candidates": [{"content": {
            "role": "model", "parts": [{"text": "recovered"}],
        }}]})

    def make_client(**kwargs):
        options = kwargs["http_options"]
        assert options.timeout == 5000
        options.async_client_args = {"transport": httpx.MockTransport(handler)}
        return real_client(**kwargs)

    monkeypatch.setattr(llm, "_client", None)
    monkeypatch.setattr(llm.genai, "Client", make_client)

    async def run():
        try:
            with pytest.raises(llm.LLMError):
                await llm.generate_answer("hi", SETTINGS)
        finally:
            await llm._client.aio.aclose()
            llm._client.close()

    asyncio.run(run())
    assert len(calls) == 1


@pytest.mark.parametrize("failure", [
    httpx.ReadTimeout("slow"),
    llm.errors.ServerError(504, {"error": {"code": 504, "message": "deadline"}}),
])
def test_exhausted_timeout_is_classified(monkeypatch, failure):
    monkeypatch.setattr(llm, "_get_client", lambda s: fake_gemini(error=failure))
    with pytest.raises(llm.LLMTimeoutError):
        asyncio.run(llm.generate_answer("hi", SETTINGS))


def test_total_deadline_cancels_slow_generation(monkeypatch):
    cancelled = []

    async def slow_response(**kwargs):
        try:
            await asyncio.sleep(10)
        finally:
            cancelled.append(True)

    client = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(
        generate_content=slow_response,
    )))
    monkeypatch.setattr(llm, "_get_client", lambda s: client)
    with pytest.raises(llm.LLMTimeoutError):
        asyncio.run(llm.generate_answer("hi", replace(SETTINGS, request_timeout_seconds=0.01)))
    assert cancelled == [True]


@pytest.mark.parametrize("upstream_status, status, code, retryable", [
    (503, 503, "service_unavailable", True),
    (500, 503, "service_unavailable", True),
    (502, 503, "service_unavailable", True),
    (429, 429, "rate_limited", True),
    (400, 503, "ai_configuration_error", False),
    (401, 503, "ai_configuration_error", False),
    (403, 503, "ai_configuration_error", False),
    (404, 503, "ai_configuration_error", False),
    (504, 504, "upstream_timeout", True),
])
def test_upstream_errors_reach_ui_with_safe_details(monkeypatch, caplog, upstream_status, status, code, retryable):
    upstream_error = llm.errors.APIError(upstream_status, {
        "error": {"code": upstream_status, "message": "private prompt and secret-key"},
    })
    monkeypatch.setattr(llm, "_get_client", lambda s: fake_gemini(error=upstream_error))
    res = client.post("/api/chat", json={"message": "hi"})
    assert res.status_code == status
    assert res.json()["code"] == code
    assert res.json()["retryable"] is retryable
    assert "secret-key" not in res.text + caplog.text
    assert "private prompt" not in res.text + caplog.text


def test_network_failure_returns_unavailable(monkeypatch):
    monkeypatch.setattr(llm, "_get_client", lambda s: fake_gemini(error=httpx.ConnectError("offline")))
    res = client.post("/api/chat", json={"message": "hi"})
    assert res.status_code == 503
    assert res.json()["code"] == "service_unavailable"


@pytest.mark.parametrize("response", [
    llm.types.GenerateContentResponse(prompt_feedback={"block_reason": "SAFETY"}),
    llm.types.GenerateContentResponse(candidates=[{"finish_reason": "SAFETY"}]),
])
def test_blocked_response_can_be_distinguished_from_invalid_input(monkeypatch, response):
    generate = AsyncMock(return_value=response)
    monkeypatch.setattr(llm, "_get_client", lambda s: SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate)),
    ))
    res = client.post("/api/chat", json={"message": "hi"})
    assert res.status_code == 422
    assert res.json()["code"] == "response_blocked"
    assert res.json()["retryable"] is False


def test_client_pools_are_closed_at_app_shutdown(monkeypatch):
    upstream = SimpleNamespace(aio=SimpleNamespace(aclose=AsyncMock()), close=Mock())
    monkeypatch.setattr(llm, "_client", upstream)
    with TestClient(app) as session:
        assert session.get("/health").status_code == 200
    upstream.aio.aclose.assert_awaited_once()
    upstream.close.assert_called_once()
    assert llm._client is None


def test_request_cancellation_is_not_wrapped_as_an_error(monkeypatch):
    generate = AsyncMock(side_effect=asyncio.CancelledError())
    monkeypatch.setattr(llm, "_get_client", lambda s: SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate)),
    ))
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(llm.generate_answer("hi", SETTINGS))


@pytest.mark.parametrize("value", ["0", "-1", "nan", "inf", "-inf", "abc", ""])
def test_invalid_timeout_is_reported_at_startup(monkeypatch, value):
    get_settings.cache_clear()
    monkeypatch.setenv("GEMINI_TIMEOUT_SECONDS", value)
    try:
        with pytest.raises(ValueError, match="GEMINI_TIMEOUT_SECONDS"):
            get_settings()
    finally:
        get_settings.cache_clear()


def test_environment_settings_are_trimmed(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("GEMINI_MODEL", " model ")
    monkeypatch.setenv("GEMINI_TIMEOUT_SECONDS", " 12.5 ")
    monkeypatch.setenv("ALLOWED_ORIGIN", "http://localhost:5173, , http://127.0.0.1:5173 ")
    try:
        settings = get_settings()
        assert settings.gemini_model == "model"
        assert settings.request_timeout_seconds == 12.5
        assert settings.allowed_origins == ["http://localhost:5173", "http://127.0.0.1:5173"]
    finally:
        get_settings.cache_clear()
