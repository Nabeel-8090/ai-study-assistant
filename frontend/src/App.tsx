import { useCallback, useEffect, useRef, useState } from 'react'
import type { Ref } from 'react'
import { ApiError, isAbortError, sendMessage } from './api'
import { Answer } from './components/Answer'
import { Composer } from './components/Composer'
import type { Message } from './types'

const SUGGESTIONS = [
  'Explain OS concepts',
  'What is the difference between a process and a thread?',
  'How does virtual memory work?',
]

let idCounter = 0
const newId = () => String(++idCounter)

function MessageItem({ m, isLast, lastMessageRef }: { m: Message, isLast: boolean, lastMessageRef: Ref<HTMLElement> }) {
  const [copyStatus, setCopyStatus] = useState('Copy')
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyAttempt = useRef(0)

  useEffect(() => () => {
    copyAttempt.current++
    if (copyTimer.current !== null) clearTimeout(copyTimer.current)
  }, [])

  const handleCopy = async () => {
    const attempt = ++copyAttempt.current
    if (copyTimer.current !== null) clearTimeout(copyTimer.current)
    try {
      await navigator.clipboard.writeText(m.content)
      if (attempt !== copyAttempt.current) return
      setCopyStatus('Copied ✓')
    } catch {
      if (attempt !== copyAttempt.current) return
      setCopyStatus('Copy failed')
    }
    copyTimer.current = setTimeout(() => setCopyStatus('Copy'), 2000)
  }

  return (
    <article
      className={`message-wrapper ${m.role === 'user' ? 'user' : 'assistant'}`}
      ref={isLast ? lastMessageRef : null}
    >
      <div className="message">
        {m.role === 'user' ? <p style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.content}</p> : <Answer text={m.content} />}
        {m.timestamp && (
          <div className="msg-time" style={{ fontSize: '0.75rem', opacity: m.role === 'user' ? 0.9 : 0.6, textAlign: m.role === 'user' ? 'right' : 'left', marginTop: '0.5rem' }}>
            {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
      <div className={`msg-actions ${m.role === 'user' ? 'user' : 'assistant'}`}>
        <button type="button" className="copy-btn" onClick={() => void handleCopy()} title="Copy text" aria-live="polite">
          {copyStatus}
        </button>
      </div>
    </article>
  )
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const lastMessageRef = useRef<HTMLElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => () => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  // Ask the backend and append the answer (or set an error).
  const requestAnswer = useCallback(async (text: string) => {
    if (abortRef.current) return
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const answer = await sendMessage(text, controller.signal)
      if (controller.signal.aborted || abortRef.current !== controller) return
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: 'assistant', content: answer, timestamp: Date.now() },
      ])
    } catch (err) {
      if (controller.signal.aborted || abortRef.current !== controller || isAbortError(err)) return
      setError(
        err instanceof ApiError
          ? err
          : new ApiError('Something went wrong. Try again.'),
      )
    } finally {
      // Ignore requests that were cancelled by "New chat".
      if (abortRef.current === controller) {
        abortRef.current = null
        setLoading(false)
      }
    }
  }, [])

  const handleSend = useCallback(
    (text: string) => {
      if (abortRef.current) return
      setMessages((prev) => [...prev, { id: newId(), role: 'user', content: text, timestamp: Date.now() }])
      void requestAnswer(text)
    },
    [requestAnswer],
  )

  function handleRetry() {
    const lastQuestion = [...messages].reverse().find((m) => m.role === 'user')
    if (lastQuestion) void requestAnswer(lastQuestion.content)
  }

  function handleNewChat() {
    abortRef.current?.abort()
    abortRef.current = null
    setMessages([])
    setError(null)
    setLoading(false)
  }

  // Keep the right part of the thread in view: a new answer starts at its
  // first line (so it reads top-down); everything else scrolls to the bottom.
  useEffect(() => {
    const last = messages[messages.length - 1]
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const behavior = reduceMotion ? 'auto' : 'smooth'
    if (last?.role === 'assistant') {
      lastMessageRef.current?.scrollIntoView({ block: 'start', behavior })
    } else {
      bottomRef.current?.scrollIntoView({ block: 'end', behavior })
    }
  }, [messages, loading, error])

  const isEmpty = messages.length === 0 && !loading && !error

  return (
    <div className="app">
      <header className="bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img src="/logo.svg" alt="Logo" style={{ width: '36px', height: '36px', borderRadius: '10px', border: '2px solid var(--accent-color)' }} />
          <h1>Basic AI Chat</h1>
        </div>
        <button
          type="button"
          className="ghost"
          onClick={handleNewChat}
          disabled={isEmpty}
        >
          New chat
        </button>
      </header>

      <div className="scroll">
        <div className="thread" role="log" aria-label="Conversation">
          {isEmpty && (
            <section className="empty">
              <h2>What do you want to understand?</h2>
              <p>Ask a question and get a plain explanation.</p>
              <ul className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <li key={s}>
                    <button type="button" onClick={() => handleSend(s)}>
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {messages.map((m, i) => (
            <MessageItem
              key={m.id}
              m={m}
              isLast={i === messages.length - 1}
              lastMessageRef={lastMessageRef}
            />
          ))}

          {loading && (
            <div className="thinking" role="status">
              <span>Thinking</span>
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </div>
          )}

          {error && (
            <div className="error" role="alert">
              <p>{error.message}</p>
              {error.retryable && (
                <button type="button" onClick={handleRetry} disabled={loading}>
                  Try again
                </button>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <Composer busy={loading} onSend={handleSend} />
    </div>
  )
}
