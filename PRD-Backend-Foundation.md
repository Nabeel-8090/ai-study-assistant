# Product Requirements Document — Backend Foundation

**Project:** AI Study Assistant
**Version:** V02
**Focus:** Backend Foundation
**Status:** Draft
**Frontend:** React + TypeScript + Vite
**Backend:** FastAPI + Python
**LLM Provider:** Gemini
**Depends on:** V01 (complete)

---

## 1. Overview

V01 established a working AI chat application: the React frontend sends a message to the FastAPI backend, the backend calls Gemini, and the generated response is returned to the frontend.

V02 will **not introduce major new user-facing features**. Its purpose is to strengthen the existing FastAPI backend by improving its architecture and, more importantly, developing a clear understanding of the backend concepts already in use.

---

## 2. Current V01 System

### 2.1 Request Flow

```text
React Frontend
      │
      │ POST /api/chat
      ▼
FastAPI Backend
      │
      ▼
Gemini LLM
      │
      ▼
FastAPI
      │
      ▼
React Frontend
```

### 2.2 Current API Endpoints

| Method | Endpoint     | Purpose                                  |
|--------|--------------|-------------------------------------------|
| GET    | `/health`    | Check backend health                      |
| POST   | `/api/chat`  | Send a message to Gemini and return the response |

### 2.3 Current Backend Structure

```text
backend/
│
├── app/
│   ├── __init__.py
│   ├── config.py
│   ├── diagnose.py
│   ├── llm.py
│   ├── main.py
│   └── schemas.py
│
├── tests/
├── .env
├── .gitignore
├── pytest.ini
├── requirements.txt
└── requirements-dev.txt
```

### 2.4 V01 Already Includes

- FastAPI application
- Gemini API integration
- Pydantic request validation
- Request and response schemas
- Environment-based configuration
- CORS configuration
- Logging
- LLM timeout handling
- LLM error classification
- Health endpoint
- Automated tests using pytest
- Mocking of external LLM calls

**V02 builds on these foundations rather than reimplementing them.**

---

## 3. V02 Goal

> Transform the existing working backend into a backend whose architecture and behavior are clearly understood, maintainable, and ready for future features.

By the end of V02, the developer should understand the complete request lifecycle:

```text
HTTP Request
     │
     ▼
FastAPI Router
     │
     ▼
Pydantic Validation
     │
     ▼
Service Layer
     │
     ▼
External LLM
     │
     ▼
Error Handling
     │
     ▼
HTTP Response
```

V02 prioritizes **understanding and backend engineering**, not feature count.

---

## 4. Functional Requirements

Existing application functionality must continue working.

### FR-01 — Chat API

Must continue exposing:

```http
POST /api/chat
```

Example request:

```json
{
  "message": "Explain deadlock in operating systems"
}
```

The backend must:
1. Receive the HTTP request.
2. Validate the request.
3. Pass the message to the LLM service.
4. Call Gemini.
5. Handle possible Gemini failures.
6. Return a structured response.

### FR-02 — Health API

Must continue exposing:

```http
GET /health
```

The endpoint should provide a simple indication that the FastAPI application is running.

### FR-03 — Input Validation

Chat messages must continue being validated using Pydantic. The API should reject cases such as:

```json
{}
```
```json
{ "message": "" }
```
```json
{ "message": "     " }
```

Messages exceeding the configured maximum length must also be rejected.

Validation behavior must be covered by automated tests.

### FR-04 — LLM Integration

Gemini communication must remain separated from the HTTP route implementation. The route should not need to understand Gemini SDK implementation details.

```text
Route
  │
  ▼
LLM Service
  │
  ▼
Gemini
```

This separation allows the LLM implementation to change later without rewriting API routes.

---

## 5. Backend Architecture Requirements

### AR-01 — Introduce APIRouter

Endpoints should be moved out of the main application initialization file. The application should use FastAPI's `APIRouter` and `app.include_router(...)`.

The developer must understand:
- what a router is
- why routers are useful
- router prefixes
- router tags
- how `include_router()` connects a router to the application

Possible organization:

```text
app/
├── api/
│   ├── __init__.py
│   └── routes/
│       ├── __init__.py
│       ├── chat.py
│       └── health.py
│
├── main.py
└── ...
```

`main.py` should primarily be responsible for application creation and application-level configuration.

### AR-02 — Service Layer

External LLM communication should remain isolated from HTTP-specific code.

```text
API Layer
    │
    ▼
Service Layer
    │
    ▼
External Service
```

Possible structure:

```text
services/
└── llm.py
```

The existing `llm.py` may be moved/refactored rather than rewritten unnecessarily.

### AR-03 — Schemas

Pydantic models should remain separated from route logic.

Possible organization:

```text
schemas/
├── __init__.py
└── chat.py
```

The developer should understand:
- `BaseModel`
- `Field`
- type validation
- field validators
- request models
- response models
- why API schemas differ from internal application logic

### AR-04 — Configuration

Application configuration must continue being separated from application logic. Configuration includes values such as:

```text
GEMINI_API_KEY
GEMINI_MODEL
GEMINI_TIMEOUT_SECONDS
ALLOWED_ORIGIN
```

Secrets must not be hardcoded. `.env` must remain excluded from Git.

The developer should understand:
- environment variables
- `.env`
- application settings
- configuration validation
- why secrets must not be committed

---

## 6. Dependency Injection

V02 should introduce the developer to FastAPI dependency injection using `Depends(...)`.

The goal is **not** to use dependency injection everywhere unnecessarily.

The developer should understand:
- what dependency injection means
- how FastAPI resolves dependencies
- why `Depends()` exists
- how dependencies can be reused
- how dependencies simplify future authentication and database integration

This knowledge is required in V03 for functionality such as:

```text
Database Session
Current User
Authentication
Authorization
```

---

## 7. Error Handling

Existing LLM errors should continue being translated into appropriate HTTP responses.

Possible failure categories:

```text
LLM timeout
LLM unavailable
Rate limit
Configuration error
Blocked response
Unexpected internal error
```

V02 should investigate centralized FastAPI exception handling using `@app.exception_handler(...)` or equivalent application-level registration.

The developer should understand the trade-off between:

```text
Route-level try/except
```

vs.

```text
Centralized exception handlers
```

The goal is **not** to centralize every exception blindly.

---

## 8. HTTP Status Codes

V02 should reinforce correct HTTP semantics. The developer should understand when responses such as the following are appropriate:

```text
200 OK
4xx Client Errors
422 Unprocessable Content
429 Too Many Requests
500 Internal Server Error
502 Bad Gateway
503 Service Unavailable
504 Gateway Timeout
```

Gemini failures should not automatically be exposed directly to the frontend. Internal implementation details and sensitive information must not be returned to clients.

---

## 9. Logging

Existing logging should be reviewed and understood.

The developer should understand:

```python
logger.info(...)
logger.warning(...)
logger.error(...)
logger.exception(...)
```

and:

```python
logging.getLogger(__name__)
```

Logs should provide useful diagnostic information without exposing:
- API keys
- secrets
- sensitive configuration
- unnecessary user content

The developer should also understand basic log levels:

```text
DEBUG
INFO
WARNING
ERROR
CRITICAL
```

---

## 10. Testing

Existing pytest tests must continue passing after the V02 refactor.

Tests should cover important behavior including:
- `/health`
- successful `/api/chat`
- invalid input
- empty messages
- whitespace-only messages
- oversized messages
- LLM timeout
- LLM unavailable
- rate limiting
- blocked responses
- unexpected errors
- configuration failures
- CORS behavior

External Gemini calls should normally be mocked during automated testing.

The developer should understand:

```text
pytest
TestClient
Mock
AsyncMock
monkeypatch
@pytest.mark.parametrize
```

The developer should specifically understand **why real Gemini API calls should generally not be required for unit/API tests**.

---

## 11. Manual API Testing

Postman may be used for manual API testing.

At minimum, manually test:

```text
GET /health

POST /api/chat
    valid message
    empty message
    whitespace message
    oversized message
    malformed request
```

FastAPI Swagger documentation at `/docs` may also be used.

Postman-generated local project files do not need to be committed for V02 unless a Postman collection is intentionally created as a shared project artifact.

---

## 12. Proposed Backend Structure

The exact structure does not need to be created immediately. A possible final V02 structure is:

```text
backend/
│
├── app/
│   ├── __init__.py
│   ├── main.py
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   └── routes/
│   │       ├── __init__.py
│   │       ├── chat.py
│   │       └── health.py
│   │
│   ├── schemas/
│   │   ├── __init__.py
│   │   └── chat.py
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   └── llm.py
│   │
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py
│   │   └── logging.py
│   │
│   └── diagnose.py
│
├── tests/
│
├── .env
├── .gitignore
├── pytest.ini
├── requirements.txt
└── requirements-dev.txt
```

This structure is a **target**, not a requirement to create empty folders prematurely. Every separation should have a reason.

---

## 13. Learning Requirements

V02 is considered successful only if the developer can explain the important code being used.

By the end of V02, the developer should be able to explain:

### FastAPI
```text
FastAPI()
APIRouter
include_router()
Depends()
lifespan
middleware
CORS
request models
response models
exception handlers
```

### Python / Async
```text
async def
await
asyncio.wait_for()
exceptions
context/lifecycle management
```

### Pydantic
```text
BaseModel
Field
field validation
request validation
response validation
```

### Configuration
```text
environment variables
.env
settings
lru_cache
```

### Testing
```text
pytest
TestClient
Mock
AsyncMock
monkeypatch
parameterized tests
```

### HTTP
```text
GET vs POST
request body
JSON
status codes
client errors
server errors
upstream service errors
```

The goal is not memorization. The developer should be able to explain **why** each concept is used in this project.

---

## 14. Non-Goals

The following are explicitly outside V02:

- PostgreSQL
- User accounts
- Authentication
- Authorization
- JWT
- Sessions
- Conversation persistence
- Chat history database
- PDF uploads
- Document processing
- Embeddings
- Vector databases
- pgvector
- RAG
- Redis
- Background workers
- Message queues
- Docker deployment architecture
- Microservices
- AI agents
- Agent tools

These belong to later versions. V02 must not become a feature-creep version.

---

## 15. V02 Completion Criteria

V02 is complete when:

- [ ] Existing V01 functionality still works.
- [ ] `/health` works.
- [ ] `/api/chat` works.
- [ ] Existing tests pass.
- [ ] API routes are cleanly organized.
- [ ] `APIRouter` is understood and implemented.
- [ ] Request/response schemas remain properly separated.
- [ ] Gemini communication remains separated from route logic.
- [ ] Configuration remains environment-based.
- [ ] Error handling is clean and understood.
- [ ] Logging behavior is understood.
- [ ] Dependency injection fundamentals are understood and demonstrated where appropriate.
- [ ] Important failure cases are tested.
- [ ] The developer can explain the request lifecycle from React to Gemini and back.
- [ ] The developer can explain the important backend code without relying on AI-generated explanations.

---

## 16. Definition of Done

V02 is **not done merely because the code runs**.

V02 is done when the developer can trace:

```text
React
  ↓
HTTP Request
  ↓
FastAPI
  ↓
Router
  ↓
Pydantic Validation
  ↓
Service
  ↓
Gemini
  ↓
Service
  ↓
Error Handling
  ↓
HTTP Response
  ↓
React
```

and explain what happens at every major step.

**Main outcome of V02:**

> I don't just have a working FastAPI backend. I understand how my FastAPI backend is structured, why it is structured that way, how failures are handled, and how it can safely grow into V03.

---

## 17. Next Version

After V02 is complete, **V03 — Authentication & Database** will introduce persistent backend state and identity:

```text
PostgreSQL
    +
Users
    +
Authentication
    +
Authorization
    +
Conversations
    +
Persistent Chat History
```

V02 must provide the backend foundation required to introduce those features without turning the application into tightly coupled code.