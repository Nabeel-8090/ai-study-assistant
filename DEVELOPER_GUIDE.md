# Developer Guide: Basic AI Chat

This document explains **each and every concept** you should know as a developer working on this project. This project connects a modern Frontend (React + Vite + TypeScript) to a Python Backend (FastAPI), which in turn communicates with Google's Gemini LLM.

## 1. The Architecture (High Level)
The architecture follows a standard 3-tier structure, minus the database:

1. **Frontend (Client Layer)**: React application running in the user's browser. Responsible for the User Interface (UI), managing local chat state, and displaying messages.
2. **Backend (Server Layer)**: A FastAPI Python server. Responsible for validation, security (hiding API keys), and acting as a bridge.
3. **LLM (AI Layer)**: Google's Gemini API, accessed via the `google-genai` Python SDK. Responsible for generating the intelligence.

**The Request Flow:**
1. User types "Hello" in the React `Composer` component and presses Send.
2. React adds the message to its local state and sends an HTTP `POST` request using `fetch()` to the FastAPI backend (`/api/chat`).
3. FastAPI receives the request, validates that it has a `message` string (using Pydantic schemas), and calls the `generate_answer()` function.
4. The backend sends the text "Hello" to the Gemini API securely using the `GEMINI_API_KEY`.
5. Gemini generates a response and sends it back to the FastAPI backend.
6. FastAPI wraps the response in a JSON object (`{ "answer": "Hi there!" }`) and sends it back to React.
7. React updates its state with the new AI message, which automatically triggers a UI re-render, showing the answer on screen.

---

## 2. Frontend Concepts (React + TypeScript + Vite)

### React State (`useState`)
In `App.tsx`, we manage the chat messages using `useState<Message[]>([])`. React State is immutable; when a user sends a message, we create a **new array** containing the previous messages plus the new one. This state change tells React to re-render the screen. 

### Side Effects & Refs (`useEffect` and `useRef`)
- **`useRef` for DOM Elements**: We use `bottomRef` and `lastMessageRef` to store references to HTML elements. We use these references to automatically scroll the user to the bottom of the chat when a new message arrives.
- **`useEffect` for scrolling**: We have a `useEffect` that runs every time the `messages` array changes. Inside, it calls `.scrollIntoView()` on our references.
- **`useRef` for AbortControllers**: When a user clicks "New Chat" before an AI response finishes, we use an `AbortController` (stored in `abortRef`) to cancel the ongoing HTTP fetch request.

### TypeScript Interfaces
In `types.ts`, we define exactly what a `Message` looks like:
```ts
export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
}
```
TypeScript acts as a safety net. If you try to access `message.time` instead of `message.timestamp`, the compiler will throw an error before you even run the code.

### Markdown Rendering
The Gemini API returns text formatted in **Markdown** (e.g., `**bold**`, `## Headers`, and ` ```code``` `). 
In `components/Answer.tsx`, we use `react-markdown` and `remark-gfm`. These libraries parse the raw markdown string and convert it into safe, styled HTML elements (like `<strong>`, `<h2>`, and `<code>`).

---

## 3. Backend Concepts (FastAPI + Python)

### FastAPI Routing & Endpoints
FastAPI uses `APIRouter` to modularize endpoints. 
In `app/api/routes/chat.py`, `@router.post("/chat")` defines the endpoint, which is then included in `main.py` via `app.include_router()`. This keeps the main application factory clean.

### Data Validation (Pydantic)
In `app/schemas/chat.py`, we define `ChatRequest` inheriting from `pydantic.BaseModel`.
```python
class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
```
When FastAPI receives JSON data, it automatically passes it through Pydantic. If a user tries to send a message that is 5,000 characters long, or an empty string, Pydantic immediately rejects it with a `422 Unprocessable Entity` HTTP error, meaning your core logic doesn't have to worry about bad data.

### Dependency Injection (`Depends`)
FastAPI allows injecting dependencies, such as application settings, directly into routes using `Depends`. In our chat route, `settings: Settings = Depends(get_settings)` dynamically injects our environment configuration without needing global imports, making the app much easier to test.

### Asynchronous Python (`async` / `await`)
The backend is built asynchronously. When the backend sends a request to the Gemini API using `await client.aio.models.generate_content(...)`, the Python server does **not** freeze. Instead, it pauses that specific request and is free to handle other users' requests simultaneously until Gemini responds.

### Context Managers (`lifespan`)
In `main.py`, we define a `lifespan` context manager. This runs code when the server starts, `yield`s control to the server to handle traffic, and then runs code when the server shuts down (like safely closing the HTTP client pool in `services/llm.py`).

### Error Handling & HTTP Status Codes
In `app/services/llm.py`, we wrap the Gemini SDK in a `try/except` block and map external SDK errors to our own `LLMError` classes. In `main.py`, we use `@app.exception_handler(llm.LLMError)` to globally catch these errors and map them to specific HTTP status codes:
- **504 Gateway Timeout**: Gemini took too long.
- **503 Service Unavailable**: Gemini servers are down.
- **429 Too Many Requests**: You hit your API rate limit.
- **422 Unprocessable Entity**: The prompt was flagged/blocked by safety filters.
This makes it easy for the frontend to display helpful, human-readable error messages.

---

## 4. Why We Have This Architecture

**Why not call Gemini directly from React?**
If we put the `GEMINI_API_KEY` in the React frontend, anyone visiting the website could open their browser's developer tools, steal the key, and use it to run up a massive bill on your Google account. The backend exists as a secure middleman. The backend holds the secret key, authenticates with Google, and returns the public result to the frontend.

**Why no database?**
For this basic version, messages live entirely in the React browser memory. If you refresh the page, the state is wiped. Adding a database would require user accounts (so users don't see each other's chats), session cookies, and database schema migrations. Keeping it stateless makes this the perfect starter project!
