# PRD: AI Study Assistant — V03

**Version:** V03 — Authentication, PostgreSQL, Persistent Conversations, Conversation-Aware AI
**Status:** Draft for implementation
**Builds on:** V01 (basic AI chat), V02 (backend foundation: validation, error handling, logging, configuration, cleaner API structure)

> Items marked **[Confirm]** depend on what the repository inspection finds (filenames, package versions, existing V02 conventions). The PRD states the intended outcome; the implementation must adapt to the real codebase rather than assume.

---

## 1. Purpose and summary

Until V02, the app is a single-user chat with no memory: there are no accounts, no database, "New Chat" wipes the conversation, a refresh loses everything, and the model never sees earlier messages, so follow-up questions fail.

V03 turns it into a real multi-user application:

- Users sign up and log in with email and password.
- Every user has their own persistent, private conversations stored in PostgreSQL.
- The model receives a bounded amount of prior conversation, so follow-ups work.
- Failures (timeouts, model errors) are saved, visible, and retryable without duplicating messages.

V03 is also a learning milestone: the implementation should be small, readable, and each important decision explained.

## 2. Goals and non-goals

### Goals

1. Secure email/password authentication with server-side opaque sessions in HttpOnly cookies.
2. PostgreSQL persistence via SQLAlchemy, with schema managed only by Alembic migrations.
3. User-owned conversations and messages, with strict ownership enforcement.
4. Conversation-aware Gemini requests with a configurable history budget.
5. A safe message lifecycle: one generation at a time per conversation, recoverable after crashes, no fabricated answers on failure.
6. A frontend that supports auth, a conversation sidebar, persistence across refresh, and failed-message retry.
7. Meaningful automated tests using an isolated PostgreSQL test database and a mocked Gemini.

### Non-goals (explicitly out of scope)

PDF/file uploads, embeddings, RAG, Redis, queues, background workers, agents, social login, password reset, email verification, streaming responses, rate limiting, admin roles, conversation sharing, message editing, and a second application framework or generic repository abstraction.

## 3. Users and user stories

**Primary user:** a student using the assistant to study, returning over multiple sessions.

| # | As a… | I want to… | So that… |
|---|---|---|---|
| U1 | new user | sign up with email and password | I have my own account |
| U2 | returning user | log in and stay logged in across refreshes | I don't re-authenticate constantly |
| U3 | user | log out | my session ends on shared devices |
| U4 | user | start a new chat without losing old ones | I can organize topics separately |
| U5 | user | see and reopen past conversations | I can continue studying later |
| U6 | user | ask follow-up questions ("explain that more simply") | the assistant understands context |
| U7 | user | see when a reply failed and retry it | a transient error doesn't lose my question |
| U8 | user | delete a conversation | I control my data |
| U9 | user | be certain others can't see my chats | my data is private |

**V03 success scenario:** two users sign in independently, keep separate conversations, reopen chats after refreshing, ask context-aware follow-ups, retry failed generations, and create new chats without losing previous ones.

## 4. Current state (to be verified during inspection)

Known from the brief: React + TypeScript + Vite frontend, FastAPI backend, Gemini as LLM, V02 implemented (validation, error handling, logging, configuration, API structure). No users, no database, no history sent to the model.

**[Confirm]** during Stage 1: project layout, README, dependency files, existing chat route and Gemini client, timeout handling, error response format, logging setup, settings module, frontend chat state and API utilities, existing tests, and any repo instruction files. The Stage 1 output is a short architecture summary and implementation plan. V02 conventions (error shape, logging, config loading, timeout handling) are **reused**, not replaced.

## 5. Key design decisions

| Decision | Choice | Rationale |
|---|---|---|
| DB access model | **Synchronous SQLAlchemy 2.x + `psycopg` (v3)** with plain `def` route handlers **[Confirm against V02]** | Simplest mental model. FastAPI runs `def` handlers in a threadpool, so blocking DB and blocking Gemini calls don't stall the event loop. If V02 handlers are `async def`, either convert the affected handlers to `def`, or use the async SDK/`run_in_threadpool`. Never mix blocking DB calls into `async def` handlers. |
| Auth mechanism | Opaque random session token in an HttpOnly cookie; only the token's hash is stored | Sessions are revocable server-side (logout, expiry), tokens never appear in JS or JSON. |
| Password hashing | Argon2id via `argon2-cffi` | Established library, memory-hard, supports rehash-on-verify. |
| CSRF defense | Explicit `Origin` allow-list check on all state-changing requests, plus `SameSite=Lax` | See §9.3. |
| Conversation creation | **Lazy:** "New Chat" opens an empty local draft; the conversation is created on the first send | Avoids piles of empty "New Chat" rows. Uses `POST /conversations` then `POST …/messages`. Applied consistently. |
| Pending-turn lock | Database **partial unique index**: at most one `pending` user message per conversation | The database enforces the invariant atomically; no reliance on UI or app-level checks. |
| Retry scope | Only the **most recent** user message in a conversation can be retried | Keeps each user/assistant pair adjacent in `sequence_number`. See §7.4. |
| Context trimming | Whole-turn trimming under a configurable budget; older rows stay in the DB | Bounded cost and latency without data loss. |
| Title generation | First ~60 characters of the first user message, whitespace-collapsed | No extra LLM call. |

## 6. Data model

All tables are created and changed **only through Alembic migrations**. `create_all()` is not part of normal setup. Timestamps are timezone-aware (`timestamptz`), stored in UTC.

### 6.1 `users`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID, PK | server- or app-generated |
| `email` | text, NOT NULL | normalized (trimmed + lowercased); **UNIQUE** constraint |
| `password_hash` | text, NOT NULL | Argon2id hash |
| `created_at` | timestamptz, NOT NULL | default now() |

Email is normalized by one shared function used by both signup and login. Duplicate signups are rejected by an application pre-check **and** by the unique constraint (catching `IntegrityError` to handle races), returning the same conflict response either way.

### 6.2 `sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (or bigint), PK | |
| `user_id` | UUID, FK → users, NOT NULL, `ON DELETE CASCADE` | indexed |
| `token_hash` | text, NOT NULL | **UNIQUE**; SHA-256 of the raw token |
| `created_at` | timestamptz, NOT NULL | |
| `expires_at` | timestamptz, NOT NULL | created_at + configured lifetime |

- Raw token: `secrets.token_urlsafe(32)` (≥256 bits). Only its SHA-256 hash is persisted. SHA-256 (not Argon2) is appropriate because the token is high-entropy random, not a human password.
- Expired sessions are rejected (and may be deleted opportunistically when encountered).
- Logout deletes the current session row and clears the cookie.

### 6.3 `conversations`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID, PK | |
| `user_id` | UUID, FK → users, NOT NULL, `ON DELETE CASCADE` | |
| `title` | text, NOT NULL | default `'New Chat'` |
| `created_at` | timestamptz, NOT NULL | |
| `updated_at` | timestamptz, NOT NULL | bumped on each completed turn |

Index: `(user_id, updated_at DESC, id DESC)` for the sidebar list and ownership checks.

### 6.4 `messages`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID, PK | |
| `conversation_id` | UUID, FK → conversations, NOT NULL, `ON DELETE CASCADE` | |
| `role` | text, NOT NULL | `CHECK (role IN ('user','assistant'))` |
| `content` | text, NOT NULL | bounded length |
| `sequence_number` | integer, NOT NULL | 1-based, monotonic per conversation |
| `status` | text, NOT NULL | `CHECK (status IN ('pending','completed','failed'))` |
| `pending_since` | timestamptz, NULL | set while `pending`; used for expiry |
| `created_at` | timestamptz, NOT NULL | |

Constraints and indexes:

- `UNIQUE (conversation_id, sequence_number)` — stable ordering; also the backstop against concurrent inserts.
- **Partial unique index** on `(conversation_id) WHERE role = 'user' AND status = 'pending'` — at most one in-flight turn per conversation.
- Index on `(conversation_id, sequence_number)` is provided by the unique constraint and serves ordered/paginated retrieval.

### 6.5 Status meanings

| Status | Applies to | Meaning |
|---|---|---|
| `pending` | user message | The turn was claimed and Gemini is (presumably) generating. `pending_since` is set. |
| `completed` | user and assistant | The turn finished successfully. A completed user message has a completed assistant message after it. Assistant messages are **only ever created as `completed`**. |
| `failed` | user message | Generation failed, timed out, or the pending claim expired. No assistant message exists for it. Retryable (subject to §7.4). |

Cascade behavior: deleting a conversation removes its messages; deleting a user removes their sessions and conversations (via FK cascades, with `passive_deletes` configured in the ORM as appropriate).

System instructions live in backend configuration/code. There is no `system` role in the DB, and clients cannot create one.

## 7. Behavior specification

### 7.1 Authentication

- **Signup:** validate email format and password length limits → normalize email → reject duplicates → hash password → create user → create session → set cookie → return safe user JSON.
- **Login:** normalize email → look up user → verify password → create session → set cookie. Failure always returns the same generic `invalid credentials` error, whether the email doesn't exist or the password is wrong. To reduce timing differences, verify against a dummy hash when the user doesn't exist.
- **Logout:** delete the current session, clear the cookie (same attributes as when set). Idempotent.
- **Me:** resolve session cookie → reject missing/unknown/expired → return `{id, email, created_at}`.
- Never return or log password hashes, plaintext passwords, raw session tokens, or token hashes.

### 7.2 Conversation access

Every conversation endpoint requires a valid session. Ownership is always derived from the session's `user_id`; client-supplied user IDs are ignored/not accepted. Queries filter on both `conversation_id` **and** `user_id`. A conversation that doesn't exist and one owned by another user produce the **identical** `404` response.

### 7.3 Send-message flow

1. Authenticate.
2. Load the conversation filtered by `id` and `user_id`; `404` otherwise.
3. Validate content (trimmed, non-empty, max length from config).
4. **Short transaction A (claim):**
   - Lock the conversation row (`SELECT … FOR UPDATE`) briefly to serialize sequence allocation.
   - Mark any `pending` user message whose `pending_since` is older than the timeout as `failed` (recovery).
   - If a non-expired `pending` message remains → `409 turn_in_progress`.
   - Insert the user message with `status='pending'`, `pending_since=now()`, `sequence_number = max+1`. The partial unique index and the `(conversation_id, sequence_number)` constraint are the safety net; an `IntegrityError` maps to `409`.
   - If this is the conversation's first message, set the title from it.
   - Commit. **No transaction or row lock is held after this point.**
5. Load eligible history (completed turns before the current message) in `sequence_number` order.
6. Trim to the history budget (§7.5).
7. Build the Gemini request: backend system instruction + trimmed history + current message **exactly once**.
8. Call Gemini with the V02 timeout handling, outside any transaction.
9. **On success — short transaction B:** insert the assistant message (`completed`, `sequence_number = user_seq + 1`), set the user message to `completed`, clear `pending_since`, bump `conversations.updated_at`. Commit.
10. Return both saved messages (IDs, roles, content, sequence numbers, statuses, timestamps).

**On failure:** short transaction marks the user message `failed` (clears `pending_since`), no assistant row is created, and a structured error is returned. The user message remains visible and persisted.

### 7.4 Retry

`POST /api/conversations/{id}/messages/{message_id}/retry`

- Requires auth and ownership; the message must belong to that conversation and be a `failed` **user** message.
- Must be the **latest** user message in the conversation; otherwise `409 not_retryable`. (Rationale: a retry produces an assistant reply at `user_seq + 1`, which is only valid if nothing newer exists. The claim step also applies the same rule.)
- Re-runs the same claim step (pending check, expiry recovery, atomic transition `failed → pending`), then the same generate/save/fail steps as §7.3. **No new user message is created.**
- History for a retry includes completed turns *before* the retried message; the retried message is the "current" message, included once.

### 7.5 Context construction and history budget

- Eligible history = messages in the same conversation that belong to **completed** turns (completed user message + its completed assistant reply), with `sequence_number` lower than the current message. Failed and pending turns are excluded; other conversations are never read.
- Order is deterministic: ascending `sequence_number`.
- Budget is configurable (`MODEL_HISTORY_MAX_TOKENS`). Selection walks **backwards from the most recent** completed turn, adding whole turns until the budget would be exceeded; stops there. The current message is always included regardless of budget (its own length is bounded by the input limit).
- Token measurement: use the Gemini SDK's token counting if the installed version supports it cleanly (note it may be a network call — if so, prefer the approximation to avoid extra latency). Otherwise use a documented conservative approximation (e.g. `ceil(len(text) / 3)` tokens). **[Confirm]** against the installed SDK.
- System instructions are passed via the SDK's dedicated system-instruction mechanism, not as a history message.
- Role mapping uses the SDK's real format: assistant messages map to the Gemini role `model`, user messages to `user`. Verify the installed SDK's content/parts types rather than assuming OpenAI-style `{role, content}` dicts. **[Confirm]**
- Trimming affects only the request; the database keeps everything.

### 7.6 Pending-turn recovery

If the process dies mid-generation, a `pending` row would block the conversation forever. Recovery rule: a pending turn older than `PENDING_TURN_TIMEOUT_SECONDS` (set comfortably above the Gemini timeout) is treated as failed at the next claim attempt, at message listing time (so the UI shows it as failed), or both. The frontend polls a reopened pending conversation until it is completed, failed, or expired.

## 8. API specification

Base path: `/api`. **[Confirm]** against V02 naming; adapt and document the final routes in the README if they differ. All error bodies follow the existing V02 error shape; the `code` values below are the intended machine-readable codes.

### 8.1 Auth

| Method & path | Auth | Request | Success | Errors |
|---|---|---|---|---|
| `POST /api/auth/signup` | no | `{email, password}` | `201` + Set-Cookie + `{user}` | `422` validation, `409` email exists, `403` bad origin |
| `POST /api/auth/login` | no | `{email, password}` | `200` + Set-Cookie + `{user}` | `401 invalid_credentials`, `422`, `403` |
| `POST /api/auth/logout` | cookie | — | `204` + cleared cookie | `403` bad origin |
| `GET /api/auth/me` | cookie | — | `200 {user}` | `401` |

`user` = `{id, email, created_at}`. No hashes or tokens in any body.

### 8.2 Conversations and messages

| Method & path | Purpose | Notes |
|---|---|---|
| `GET /api/conversations?limit=&cursor=` | List own conversations, `updated_at` desc | Keyset cursor on `(updated_at, id)`; default limit ~30, max ~100; returns `{items, next_cursor}` |
| `POST /api/conversations` | Create conversation | Body optional/empty; title defaults to "New Chat"; `201` |
| `GET /api/conversations/{id}/messages?limit=&before_sequence=` | Message history | Returns the newest `limit` messages (ascending order in payload) older than `before_sequence`; `{items, has_more}`; lets the UI load older messages |
| `POST /api/conversations/{id}/messages` | Send message | Body `{content}` **only**; `200/201` returns `{user_message, assistant_message}` |
| `POST /api/conversations/{id}/messages/{message_id}/retry` | Retry failed user message | No body; same response shape |
| `DELETE /api/conversations/{id}` | Delete conversation | `204`; cascades to messages |

Message object: `{id, conversation_id, role, content, sequence_number, status, created_at}`.

### 8.3 Error codes

| HTTP | `code` | When |
|---|---|---|
| 401 | `unauthenticated` | No/invalid/expired session |
| 401 | `invalid_credentials` | Failed login (generic) |
| 403 | `untrusted_origin` | Origin check failed on a state-changing request |
| 404 | `not_found` | Conversation/message missing **or** owned by someone else |
| 409 | `email_taken` | Duplicate signup |
| 409 | `turn_in_progress` | Another pending turn in the conversation |
| 409 | `not_retryable` | Retry on a non-failed or non-latest message |
| 422 | `validation_error` | Bad email, password/message length, etc. |
| 502/504 | `llm_failed` / `llm_timeout` | Gemini error/timeout (reuse V02 mapping); user message is saved as `failed` and its ID is included in the error payload so the UI can show retry |

## 9. Security requirements

### 9.1 Passwords and sessions

- Argon2id with library defaults (documented), rehash-on-verify if parameters change.
- Password limits: minimum length (e.g. 8) and a maximum (e.g. 128) to avoid hashing abuse.
- Session cookie attributes: `HttpOnly`, `Path=/`, `SameSite=Lax`, `Max-Age` equal to session lifetime, `Secure` controlled by `COOKIE_SECURE` (true in HTTPS production; explicitly false for local HTTP development — no silent auto-detection).
- Session lifetime configurable (`SESSION_LIFETIME_HOURS` or similar). Fixed expiry; no sliding refresh in V03 (documented limitation).
- No secrets in source control. `.env` is git-ignored; `.env.example` holds placeholders only. No passwords, tokens, cookies, or full request bodies in logs.

### 9.2 CORS

Explicit origin list from configuration (`FRONTEND_ORIGINS`), `allow_credentials=True`, never `*`. Restrict allowed methods/headers to what the app uses.

### 9.3 CSRF (origin validation)

Cookie-authenticated browsers send cookies automatically, so state-changing requests need a check that they come from our frontend.

- Applies to every `POST`, `PUT`, `PATCH`, `DELETE` under `/api` (including signup/login, which prevents login CSRF).
- The request's `Origin` header must exactly match an entry in `TRUSTED_ORIGINS` (normally the same list as `FRONTEND_ORIGINS`). If `Origin` is absent, fall back to the origin parsed from `Referer`; if both are missing or untrusted → `403 untrusted_origin`.
- Safe methods (`GET`, `HEAD`, `OPTIONS`) are not checked and must never change state.
- Implemented as a small middleware or dependency, fully covered by tests.
- Defense in depth with `SameSite=Lax`. Token-based CSRF (double submit) is noted as a possible hardening step but is not required for V03.
- Limitation: non-browser clients can forge `Origin`; this defends against browser-based CSRF only, which is the threat model for cookie auth.

## 10. Configuration

All backend-only settings load through the existing V02 settings mechanism **[Confirm]** and are documented in `.env.example`. None use the `VITE_` prefix.

| Variable | Purpose | Example / default |
|---|---|---|
| `DATABASE_URL` | SQLAlchemy URL (psycopg3) | `postgresql+psycopg://user:pass@localhost:5432/study_assistant` |
| `TEST_DATABASE_URL` | Isolated test DB | `…/study_assistant_test` |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, timeout | Existing V02 settings | unchanged |
| `FRONTEND_ORIGINS` | CORS allow-list | `http://localhost:5173` |
| `TRUSTED_ORIGINS` | CSRF allow-list (defaults to `FRONTEND_ORIGINS`) | |
| `SESSION_LIFETIME_HOURS` | Session expiry | `168` |
| `COOKIE_SECURE` | Secure flag | `false` locally, `true` in prod |
| `COOKIE_SAMESITE` | SameSite value | `lax` |
| `COOKIE_NAME` | Session cookie name | `session` |
| `PENDING_TURN_TIMEOUT_SECONDS` | Pending expiry | > Gemini timeout, e.g. `90` |
| `MODEL_HISTORY_MAX_TOKENS` | History budget | e.g. `6000` |
| `MESSAGE_MAX_CHARS` | Input limit | e.g. `4000` |

Frontend: only a public API base URL (or a Vite dev proxy), if needed. No secrets.

**Local PostgreSQL:** add a minimal `docker-compose.yml` with a `postgres` service, a named volume for persistent data, a healthcheck, and a separate test database (created by an init script or test setup) **[Confirm: skip if the project already provides one]**.

## 11. Frontend requirements

Reuse the existing theme, components, styling, and API utilities; extend rather than rewrite.

### 11.1 Screens and components

- **Auth screen:** login/signup (toggle or two views), inline validation and server error display.
- **App shell:** sidebar (conversation list, "New Chat", delete, logout, user email) + existing chat panel. Responsive: sidebar collapses on narrow screens.
- **Chat panel:** message list, composer, per-message status (pending indicator, failed state with Retry button), "Load older messages" control.
- Loading, empty ("No conversations yet"), and error states for auth, list, and messages.

### 11.2 Behavior rules

- A central API client sends `credentials: 'include'` on every request; a `401` anywhere returns the UI to the login state and clears user-specific state.
- On load, call `/api/auth/me` to restore auth. Show a loading state until resolved.
- **New Chat** opens an empty draft (no DB row). The conversation is created on first send. Old chats are untouched.
- Selecting a conversation fetches its latest messages from the backend (authoritative source). `localStorage` holds **only** the selected conversation ID; on refresh, it is restored only if the conversation still exists (otherwise fall back to the draft state).
- Sending: disable the composer while that conversation has a pending turn; the backend also enforces this (`409`).
- **Late responses** are stored by the conversation ID they were sent from, never applied to "whichever chat is open." Message state is keyed by conversation ID.
- **Stale requests:** switching conversations must not show earlier requests' data — ignore/abort responses whose conversation ID is no longer the active one (AbortController and/or request-token check).
- Failed send: show the saved user message with a failed indicator and Retry; state survives refresh because it is served from the DB.
- Reopening a conversation whose latest turn is `pending`: poll the messages endpoint at a modest interval until it resolves to completed/failed (expiry makes this terminate).
- Deleting a conversation requires explicit confirmation; if it was selected, return to the draft state.
- Logout clears the selected ID, conversation list, messages, and any other user-specific state.

## 12. Non-functional requirements

- **Security:** as in §9; ownership enforced in every query.
- **Reliability:** no DB transaction held during LLM calls; pending-turn recovery; migrations are the only schema path.
- **Performance:** bounded list/history queries; bounded model context; indexes per §6.
- **Observability:** reuse V02 logging; log auth events (login success/failure without credentials), turn lifecycle (claimed / completed / failed / expired) with conversation and message IDs, never content or secrets.
- **Maintainability:** simple module layout (models, schemas, auth helpers, conversation/chat service, routers), no generic repository layer, small functions with clear names, comments on the non-obvious decisions (claim step, origin check, budget trimming).
- **Compatibility:** verified against the versions actually installed/pinned; consult official docs for SQLAlchemy, Alembic, FastAPI, `argon2-cffi`, psycopg, and the Gemini SDK.

## 13. Testing strategy

**Environment:** a separate PostgreSQL test database (never the dev DB). Schema for tests is created by running Alembic migrations (which also verifies the migration). Per-test isolation via transaction rollback or table truncation of the test DB only. Guard: tests refuse to run if `TEST_DATABASE_URL` equals `DATABASE_URL`. Gemini is replaced by a fake client that records the exact request it received and can be made to succeed, fail, time out, or block on an event.

| Area | Tests |
|---|---|
| Signup | success sets cookie & returns safe user; email normalization; duplicate rejected (app-level and DB-level race); weak/invalid input |
| Login | success; wrong password and unknown email return identical error; no secrets in responses |
| Sessions | `/me` restores; expired session rejected; logout invalidates and clears cookie; token stored only as hash |
| Access control | every conversation endpoint → 401 when unauthenticated; user B gets identical 404 when reading, sending, retrying, deleting user A's data |
| CSRF/origin | untrusted origin → 403; missing origin → 403; trusted origin passes; `GET` unaffected; applies to login/signup |
| Persistence | messages saved with correct order and stable `sequence_number`; history pagination (`before_sequence`) returns correct pages |
| Gemini context | request contains system instruction, correct ordered history with correct roles, current message exactly once; failed/pending turns and other conversations excluded |
| Budget | history trimmed by whole turns to budget; current message always included; DB rows untouched |
| Failure & retry | Gemini failure → user message `failed`, no assistant row, structured error; state persists on reload; retry reuses message (no duplicate user row) and succeeds; retry of non-latest/non-failed → 409 |
| Concurrency | two simultaneous sends to one conversation (real PostgreSQL, threads + blocked fake) → exactly one accepted, the other `409`; expired pending turn is recovered |
| Deletion | conversation delete cascades to messages; other users' data unaffected |
| Migrations | upgrade to head succeeds on an empty DB; models match migration (no autogenerate drift) |

**Frontend:** type-check, lint, production build, and a small set of component/logic tests if the project already has a frontend test setup **[Confirm]** (auth restoration, 401 handling, stale/late-response handling are the most valuable).

**Verification report:** the final summary lists the commands run and actual results, and explicitly names anything not run (e.g. live Gemini calls, real browser E2E) along with what remains to be checked manually.

## 14. Implementation plan

| Stage | Work | How to verify |
|---|---|---|
| 1. Inspect & plan | Read repo; summarize architecture and V02 features to reuse; short plan | Written summary |
| 2. Models & migrations | SQLAlchemy models, session factory, Alembic config, initial migration, Docker Compose | `alembic upgrade head` on a fresh DB; inspect tables/constraints in `psql` |
| 3. Authentication | Hashing, sessions, cookie helpers, origin check, CORS, auth routes, current-user dependency | Auth tests; manual signup/login/me/logout with curl |
| 4. Conversation persistence | Conversation & message endpoints, ownership, pagination, title generation, delete | Persistence/ownership tests |
| 5. Gemini context & failures | Claim/complete/fail flow, history builder & budget, retry, pending recovery | Context, budget, failure, retry, concurrency tests with fake Gemini |
| 6. Frontend | Auth views, sidebar, conversation state keyed by ID, failed/retry UI, polling, credentials, 401 handling | Type-check, lint, build; manual two-user walkthrough |
| 7. Verification & docs | Full test run, README/`.env.example` updates, final report | Acceptance checklist below |

Each stage ends with a brief note: what changed and how to verify.

## 15. Documentation deliverables

README (or docs) updated with: architecture overview; exact commands to (1) start PostgreSQL, (2) install backend/frontend dependencies, (3) apply migrations, (4) start FastAPI, (5) start the frontend, (6) run tests, lint, and build; final API route list; configuration table; explanation of the auth/cookie/CSRF design, the turn lifecycle and status meanings, and the context budget. Normal setup must not include destructive reset commands.

The final handoff also includes: implemented-behavior summary, important files changed, test/build results, remaining limitations, and a plain-language walkthrough of how browser ↔ FastAPI ↔ PostgreSQL ↔ Gemini interact.

## 16. Acceptance criteria

V03 is done when all of the following are true and verified:

1. [ ] Fresh DB + `alembic upgrade head` creates all four tables with the specified constraints and indexes.
2. [ ] Signup, login, logout, and `/me` work; cookie is HttpOnly with deliberate Secure/SameSite/Path/expiry; no secrets in responses or logs.
3. [ ] Duplicate emails (including case variants) are rejected; failed login is generic.
4. [ ] Expired and logged-out sessions are rejected.
5. [ ] State-changing requests from untrusted or missing origins get `403`; CORS uses explicit origins with credentials.
6. [ ] All conversation endpoints require auth; other users' resources return the same `404` as nonexistent ones.
7. [ ] Conversations list most-recent-first with bounded pagination; older messages can be loaded.
8. [ ] Sending a message persists both messages with stable ordering and returns them with IDs, sequence numbers, and timestamps.
9. [ ] Gemini receives system instruction + bounded, correctly ordered, correctly role-mapped history + current message once; failed/pending/other-conversation messages are excluded; DB history is never trimmed.
10. [ ] No DB transaction is open during the Gemini call.
11. [ ] Concurrent sends to one conversation: exactly one succeeds, others get `409`; interrupted pending turns recover after the timeout.
12. [ ] Gemini failure keeps the user message as `failed`, creates no assistant message, returns a structured error; failed state survives refresh; retry reuses the message and does not duplicate it.
13. [ ] Conversation deletion removes its messages and only its messages.
14. [ ] Frontend: auth restoration, login/signup/logout, sidebar, New Chat preserving old chats, selection loading saved messages, refresh restoration, failed/retry UI, pending polling, late-response and stale-response correctness, 401 → login.
15. [ ] Automated backend tests pass against an isolated PostgreSQL DB with Gemini mocked; frontend type-check/lint/build pass; any unrun checks are explicitly reported.
16. [ ] Two real users can independently complete the success scenario in §3 (runtime verification requires a Gemini key; if unavailable, this is reported as remaining manual verification).

## 17. Risks, limitations, and open questions

**Known limitations (accepted for V03):** no rate limiting or account lockout; fixed (non-sliding) session expiry; no password reset or email verification; no streaming responses; history budget uses tokens from the SDK or an approximation; retry only for the latest message; origin-check CSRF protection targets browsers only; single-region, single-node assumptions; no cleanup job for expired sessions beyond opportunistic deletion.

**Risks:**

| Risk | Mitigation |
|---|---|
| V02 handlers are `async` while DB layer is sync | Decide during Stage 1; use `def` handlers or threadpool; test that the event loop isn't blocked |
| Gemini SDK differs from assumed format/API (roles, system instruction, token counting) | Inspect installed SDK types and docs before writing the builder; cover with tests that assert the actual request shape |
| Cross-origin cookies in dev (Vite on :5173, API on :8000) | Use a Vite dev proxy or documented CORS/cookie config; same-site `localhost` works with `SameSite=Lax` |
| Sequence races under concurrency | Row lock during claim + unique constraint backstop + concurrency test on real PostgreSQL |
| Tests touching the dev DB | Separate `TEST_DATABASE_URL` with a hard guard |

**Open questions (defaults chosen, change if you disagree):**

1. Lazy conversation creation (on first send) vs. immediate creation on "New Chat" — **default: lazy**.
2. Retry limited to the most recent message — **default: yes**; alternative is to block new sends until a failed turn is retried or dismissed.
3. Sync vs. async SQLAlchemy — **default: sync**, pending V02 inspection.
4. Session lifetime — **default: 7 days**, configurable.