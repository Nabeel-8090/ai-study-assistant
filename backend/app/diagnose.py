"""One small, live Gemini check, independent of the browser and FastAPI.

Run from backend/: python -m app.diagnose [--model MODEL]
This consumes one API request and never prints the API key or raw error payload.
"""

import argparse
import asyncio
import json
from dataclasses import replace
from time import perf_counter

from .config import get_settings
from .llm import LLMError, close_client, generate_answer


async def diagnose(model: str | None = None) -> int:
    settings = get_settings()
    if model:
        settings = replace(settings, gemini_model=model)
    started = perf_counter()
    result = {"model": settings.gemini_model, "timeout_seconds": settings.request_timeout_seconds}
    try:
        await generate_answer("Reply with just OK.", settings)
        result.update(status="ok", message="Gemini generated a non-empty answer.")
        exit_code = 0
    except LLMError as exc:
        result.update(status=exc.code, http_status=exc.status_code, message=exc.public_message)
        exit_code = 1
    finally:
        await close_client()
    result["elapsed_seconds"] = round(perf_counter() - started, 2)
    print(json.dumps(result, indent=2))
    return exit_code


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", help="Override the model for this check only; does not edit .env.")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(diagnose(args.model)))
