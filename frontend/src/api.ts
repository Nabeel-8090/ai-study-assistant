import type { ChatRequest, ChatResponse } from './types'

const API_BASE_URL = String(
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
).trim().replace(/\/+$/, '')

const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_REQUEST_TIMEOUT_SECONDS ?? '25') * 1000

/** An error whose message is safe to show directly to the user. */
export class ApiError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable = true) {
    super(message)
    this.name = 'ApiError'
    this.retryable = retryable
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

function messageForStatus(status: number): string {
  if (status === 503) {
    return 'The AI service is temporarily busy or unavailable. Please try again later.'
  }
  if (status === 429) {
    return "The AI service's request limit or quota has been reached. Please try later."
  }
  if (status === 504) {
    return 'The AI service took too long to respond. Please try again in a moment.'
  }
  if (status === 422) {
    return 'That message is empty or too long. Keep it under 4,000 characters.'
  }
  if (status === 502) {
    return "The AI service didn't respond. Try again in a moment."
  }
  return 'Something went wrong on the server. Try again.'
}

/** Sends one message to the backend and returns the model's answer. */
export async function sendMessage(
  message: string,
  signal?: AbortSignal,
): Promise<string> {
  const body: ChatRequest = { message }
  if (!Number.isFinite(REQUEST_TIMEOUT_MS) || REQUEST_TIMEOUT_MS <= 0) {
    throw new ApiError('The app request timeout is not configured correctly.', false)
  }
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) cancel()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    let data: unknown
    try {
      data = await res.json()
    } catch (err) {
      if (controller.signal.aborted) throw err
      // Gateways sometimes return HTML or an empty body; preserve the HTTP error.
      if (res.ok) throw new ApiError('The server sent a response the app could not read.')
    }

    if (!res.ok) {
      let detail = messageForStatus(res.status)
      let retryable = res.status === 429 || res.status >= 500
      if (data && typeof data === 'object') {
        if ('detail' in data && typeof data.detail === 'string' && data.detail.trim()) {
          detail = data.detail
        }
        if ('retryable' in data && typeof data.retryable === 'boolean') {
          retryable = data.retryable
        }
      }
      throw new ApiError(detail, retryable)
    }

    if (!data || typeof data !== 'object' ||
        !('answer' in data) || typeof data.answer !== 'string' || !data.answer.trim()) {
      throw new ApiError('The server sent a response the app could not read.')
    }
    return (data as ChatResponse).answer
  } catch (err) {
    if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError')
    if (timedOut) throw new ApiError('The request took too long. Please try again in a moment.')
    if (err instanceof ApiError) throw err
    if (isAbortError(err)) throw err
    throw new ApiError(
      `Can't reach the server at ${API_BASE_URL}. Check that the backend is running.`,
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}
