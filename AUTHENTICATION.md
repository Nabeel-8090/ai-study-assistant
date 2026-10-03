# AI Study Assistant — V03 step 1: Authentication

React + TypeScript (Vite) frontend, FastAPI backend, PostgreSQL (Neon or local), Gemini.
This step adds **sign up with email verification (6-digit OTP), sign in / sign out, forgot password, sessions, profile page + picture, and a protected chat**.
Saved conversations come in the next V03 steps.

## How login works (session cookies, not JWT)

1. `POST /api/auth/login` checks the password (Argon2id hash) and creates a random token.
2. The server stores only the **SHA-256 hash** of that token in the `sessions` table and sends the
   raw token to the browser in an **HttpOnly** cookie (JavaScript can never read it).
3. On every request the browser sends the cookie; the server hashes it, looks it up, checks `expires_at`.
4. Logout deletes the row, so the cookie stops working immediately (JWTs cannot be revoked this easily).

Security rules implemented: hashed passwords, generic login error, same-time check for unknown users,
HttpOnly + SameSite cookie (`Secure` in production), explicit CORS origins with credentials,
CSRF protection by checking the `Origin` header on every POST/PUT/DELETE, no password echoed in errors,
profile images verified and re-encoded with Pillow, `/api/chat` requires a login.

## Routes

| Frontend | Who can open it |
|---|---|
| `/signin`, `/signup` | only people who are **not** logged in (others go to `/`) |
| `/` (chat), `/profile` | only logged-in people (others go to `/signin`) |

| Method | API | |
|---|---|---|
| GET | `/api/auth/username-available?username=` | live username check |
| POST | `/api/auth/signup` | create account + email verification code |
| POST | `/api/auth/verify-email` | `{email, code}` |
| POST | `/api/auth/forgot-password` | request OTP to reset password |
| POST | `/api/auth/reset-password` | `{email, code, new_password}` |
| POST | `/api/auth/login` | `{identifier: username-or-email, password}` |
| POST | `/api/auth/logout` | |
| GET | `/api/auth/me` | current user |
| GET/PUT/DELETE | `/api/profile/avatar` | profile picture |
| POST | `/api/chat` | now requires login |

## Database

`users`: id (UUID), full_name, username (unique, lowercase), email (unique, lowercase), password_hash,
avatar_data / avatar_content_type / avatar_updated_at, created_at.
`sessions`: id, user_id → users (ON DELETE CASCADE), token_hash (unique), created_at, expires_at.
Schema is created only by Alembic migrations (`backend/alembic/versions`).

## Setup

### 1. Database

**A. Neon (cloud)**: create a project at https://console.neon.tech → open the project → **Connect** →
copy the connection string (`postgresql://user:pass@ep-...neon.tech/dbname?sslmode=require...`).

**B. Local PostgreSQL**: You can also use a local installation of PostgreSQL on your machine. Just create a new database (e.g. `study_dev`) and update the connection string.

### 2. Backend (from `backend/`)

```bash
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env                 # Windows: copy .env.example .env
# edit .env: GEMINI_API_KEY and DATABASE_URL
alembic upgrade head                 # creates the tables (safe to re-run)
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend (from `frontend/`)

```bash
npm install
cp .env.example .env
npm run dev                          # open http://localhost:5173  (use "localhost", not 127.0.0.1)
```

### 4. Tests, lint, build

```bash
# backend (needs a separate test database whose name ends in _test)
cd backend
export TEST_DATABASE_URL="postgresql://app:app@localhost:5432/study_test"   # Windows: set TEST_DATABASE_URL=...
python -m pytest -q

# frontend
cd frontend
npm test && npm run lint && npm run build
```

Auth tests are skipped (not failed) if `TEST_DATABASE_URL` is missing. Tests empty the tables of the
test database only; the safety check refuses any database not named `*_test`.

## Deploying (later)

* Set `COOKIE_SECURE=true`, put your real https frontend URL in `ALLOWED_ORIGIN`.
* Frontend and backend on **different sites** (e.g. vercel.app + onrender.com) need
  `COOKIE_SAMESITE=none` (+ Secure). Some browsers (Safari) block such third-party cookies, so the
  most reliable setup is two subdomains of one domain (`app.example.com`, `api.example.com`).
* Run `alembic upgrade head` against the production database before starting the new version.

## Known limitations (kept out of scope on purpose)

No rate limiting / lockout on login itself (only the emailed codes are limited), fixed (non-sliding)
session expiry, the username-availability check is public (lets people test whether a username exists).
