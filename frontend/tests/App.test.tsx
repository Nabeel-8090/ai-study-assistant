import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { ApiError, sendMessage } from '../src/api'

vi.mock('../src/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/api')>(),
  sendMessage: vi.fn(),
}))

const send = vi.mocked(sendMessage)

function deferred() {
  let resolve!: (value: string) => void
  let reject!: (error: Error) => void
  const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function ask(text = 'hello') {
  fireEvent.change(screen.getByRole('textbox', { name: 'Your message' }), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
}

beforeEach(() => {
  send.mockReset()
})

describe('chat screen', () => {
  it('shows a response and allows the next message', async () => {
    send.mockResolvedValue('A useful answer')
    render(<App />)
    ask()
    expect(await screen.findByText('A useful answer')).toBeTruthy()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it.each(['resolve', 'reject'] as const)('ignores a stale %s after New chat', async (outcome) => {
    const old = deferred()
    const current = deferred()
    send.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    render(<App />)
    ask('old question')
    const oldSignal = send.mock.calls[0][1]
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    expect(oldSignal?.aborted).toBe(true)
    ask('new question')
    await act(async () => {
      if (outcome === 'resolve') old.resolve('Stale answer')
      else old.reject(new ApiError('Stale error'))
    })
    expect(screen.queryByText('Stale answer')).toBeNull()
    expect(screen.queryByText('Stale error')).toBeNull()
    expect(screen.getByRole('status')).toBeTruthy()
    await act(async () => current.resolve('Fresh answer'))
    expect(screen.getByText('Fresh answer')).toBeTruthy()
  })

  it('aborts an in-flight request when unmounted', () => {
    send.mockReturnValue(new Promise(() => {}))
    const { unmount } = render(<App />)
    ask()
    const signal = send.mock.calls[0][1]
    unmount()
    expect(signal?.aborted).toBe(true)
  })

  it('retries without duplicating the user message', async () => {
    send.mockRejectedValueOnce(new ApiError('Gemini is busy')).mockResolvedValueOnce('Recovered')
    render(<App />)
    ask()
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Recovered')).toBeTruthy()
    expect(screen.getAllByText('hello')).toHaveLength(1)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('does not offer retry for configuration failures', async () => {
    send.mockRejectedValue(new ApiError('Configuration error', false))
    render(<App />)
    ask()
    expect(await screen.findByText('Configuration error')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('reports clipboard failures instead of claiming success', async () => {
    send.mockResolvedValue('Answer')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('Permission denied')) },
    })
    render(<App />)
    ask()
    await screen.findByText('Answer')
    fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0])
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy failed' })).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Copied ✓' })).toBeNull()
  })
})
