# Basic AI Chat

A minimal chatbot: **React (Vite + TypeScript) → FastAPI → Gemini → FastAPI → React**.
No database, no login. Each message is answered on its own (there is no chat memory yet).

**Key Features:**
- Custom UI theme (Crimson #CC3A63 and Cream #F9F0E0) with a modern rounded SVG logo.
- Message timestamps for precise tracking of message sent and received times.
- Real-time Markdown rendering for AI responses with automatic code highlighting.
- Responsive, accessible design with copy-to-clipboard functionality.

```
basic-ai-chat/
├── backend/                 FastAPI + Gemini
│   ├── app/
│   │   ├── main.py          routes (POST /api/chat, GET /health) and CORS
│   │   ├── llm.py           the one place that calls Gemini
│   │   ├── schemas.py       request/response models
│   │   └── config.py        environment settings
│   ├── tests/               pytest (no real Gemini calls)
│   ├── requirements.txt
│   └── .env.example
└── frontend/                React + Vite + TypeScript
    ├── src/
    │   ├── App.tsx          chat screen and state
    │   ├── api.ts           sendMessage() -> POST /api/chat
    │   ├── types.ts
    │   └── components/      Composer (input), Answer (Markdown)
    └── .env.example
```

## Run it

You need **Python 3.10+**, **Node 22.13+**, and a Gemini API key with access to your selected model from
https://aistudio.google.com/apikey.

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # Windows: copy .env.example .env
# open .env and paste your GEMINI_API_KEY
uvicorn app.main:app --reload
```

The API is now at http://localhost:8000 (interactive docs at http://localhost:8000/docs).
Try it:

```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "explain me OS concepts"}'
```

### 2. Frontend (in a second terminal)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

## API

`POST /api/chat`

```jsonc
// request
{ "message": "explain me OS concepts" }

// response 200
{ "answer": "An operating system (OS) is ..." }
```

| Status | Meaning |
|---|---|
| 422 | Invalid `message`, or Gemini blocked the answer (`code: response_blocked`) |
| 429 | Gemini request limit or quota reached (`code: rate_limited`) |
| 502 | Gemini returned an unusable answer or an unclassified upstream error |
| 503 | Gemini is overloaded/unreachable (`code: service_unavailable`), or configuration is invalid (`code: ai_configuration_error`) |
| 504 | Gemini exceeded the request deadline |
| 500 | Unexpected backend error |

AI errors include a safe `detail` string, a `code`, and a `retryable` boolean.
The frontend displays the detail and offers a retry only when appropriate.
Invalid API keys/model names are backend configuration errors, not invalid user messages.

`GET /health` returns `{ "status": "ok" }`. This checks that FastAPI is running;
it does **not** verify that Google is accepting generation requests.

## Configuration

**`backend/.env`**

| Variable | Default | Notes |
|---|---|---|
| `GEMINI_API_KEY` | (required) | Never sent to the browser |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | A Gemini model available to your API key |
| `ALLOWED_ORIGIN` | `http://localhost:5173,http://127.0.0.1:5173` | Frontend origin(s) for CORS, comma-separated |
| `GEMINI_TIMEOUT_SECONDS` | `20` | Overall Gemini generation deadline in seconds; one attempt, no automatic retries |

Chat requests do not automatically retry, so temporary failures do not multiply the wait.
The overall deadline cancels slow generation even if the transport is still active.
Restart the backend after changing `.env`. A shorter deadline limits waiting; it does
not make Google generate faster and may cause more timeout errors during slow periods.
Backend logs include elapsed Gemini request time to help diagnose latency.

**`frontend/.env`** (optional, this is the default)

```
VITE_API_BASE_URL=http://localhost:8000
VITE_REQUEST_TIMEOUT_SECONDS=25
```

The browser deadline covers the entire request, including reading the response.
Keep it slightly longer than `GEMINI_TIMEOUT_SECONDS` if you change the backend deadline.
Restart Vite after editing frontend environment variables. Vite uses port 5173 and
fails clearly if that port is occupied, rather than moving to an origin blocked by CORS.

## Tests

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```

```bash
cd frontend
npm install
npm test
npm run build
npm run lint
```

Tests simulate upstream failures; they do not spend Gemini quota. To check Gemini
directly with one small live request, independently of the frontend and FastAPI:

```bash
cd backend
python -m app.diagnose
# Optional: test another model without changing .env
python -m app.diagnose --model MODEL_NAME
```

This command reports the model, elapsed time, and a safe failure reason. It exits
with code 1 on a provider failure. A successful model listing or `/health` response
does not prove generation is available.

Google's `503 UNAVAILABLE` / high-demand response is an upstream availability
failure, not a CORS error. If this direct check fails too, check the same key/model
in Google AI Studio and Google's service status. Test an alternative model before
changing `GEMINI_MODEL`; an alternate model may have different costs. Persistent
failure across models requires Google support, provider recovery, or a different
provider integration. Increasing the timeout alone does not solve overload.
See [Google's troubleshooting guide](https://ai.google.dev/gemini-api/docs/troubleshooting).

## Notes

- **Markdown:** Gemini replies in Markdown (lists, code blocks, tables), so the frontend uses
  `react-markdown` + `remark-gfm` to render it. If you'd rather show plain text, delete
  `components/Answer.tsx` and render `{m.content}` in `App.tsx`.
- **No memory:** the backend sends only the latest message to Gemini. Multi-turn context is the
  natural next step: send the message history in the request and pass it to Gemini as `contents`.
- **Troubleshooting:** if the UI says it can't reach the server, check that the backend is running
  and that `ALLOWED_ORIGIN` matches the URL in your browser's address bar. If you get a 502, read the
  backend terminal for the upstream status. A 503 reports availability or configuration,
  429 reports quota, and 504 reports a timeout. Logs omit raw provider payloads and chat content.
