import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, sendMessage } from '../src/api'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function respond(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })))
}

describe('chat API', () => {
  it('returns a successful answer', async () => {
    respond({ answer: 'Hello' })
    expect(await sendMessage('hi')).toBe('Hello')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('preserves overload information from the backend', async () => {
    respond({ detail: 'Gemini is busy. Try later.', retryable: true }, 503)
    await expect(sendMessage('hi')).rejects.toMatchObject({
      message: 'Gemini is busy. Try later.', retryable: true,
    })
  })

  it('does not offer retry for a configuration error', async () => {
    respond({ detail: 'The AI service is not configured correctly.', retryable: false }, 503)
    await expect(sendMessage('hi')).rejects.toMatchObject({ retryable: false })
  })

  it('keeps blocked answers distinct from message validation', async () => {
    respond({ detail: 'Please rephrase your question.', retryable: false }, 422)
    await expect(sendMessage('hi')).rejects.toMatchObject({ message: 'Please rephrase your question.' })
  })

  it('handles FastAPI validation details without displaying objects', async () => {
    respond({ detail: [{ msg: 'invalid' }] }, 422)
    await expect(sendMessage('')).rejects.toMatchObject({
      message: expect.stringContaining('empty or too long'), retryable: false,
    })
  })

  it.each([null, {}, { answer: null }, { answer: '   ' }, []])('rejects malformed success bodies: %j', async (body) => {
    respond(body)
    await expect(sendMessage('hi')).rejects.toBeInstanceOf(ApiError)
  })

  it('handles non-JSON gateway errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Unavailable</html>', { status: 503 })))
    await expect(sendMessage('hi')).rejects.toMatchObject({ message: expect.stringContaining('unavailable') })
  })

  it('handles invalid JSON in a successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('invalid')))
    await expect(sendMessage('hi')).rejects.toMatchObject({ message: expect.stringContaining('could not read') })
  })

  it('reports connection failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(sendMessage('hi')).rejects.toMatchObject({ message: expect.stringContaining("Can't reach the server") })
  })

  it('cancels a stuck request after the browser deadline', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const result = expect(sendMessage('hi')).rejects.toMatchObject({ message: expect.stringContaining('too long') })
    await vi.advanceTimersByTimeAsync(25_000)
    await result
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves user cancellation and cleans up the timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const controller = new AbortController()
    const result = expect(sendMessage('hi', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await result
    expect(vi.getTimerCount()).toBe(0)
  })
})
