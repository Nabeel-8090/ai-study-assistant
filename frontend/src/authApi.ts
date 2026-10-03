import { API_BASE_URL, ApiError, isAbortError } from './api'
import type { User } from './types'

const TIMEOUT_MS = 15_000

/** Turns FastAPI error bodies into an ApiError the UI can show. */
async function request(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) cancel()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, TIMEOUT_MS)
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include', // required so the browser stores/sends the session cookie
      signal: controller.signal,
    })
    if (res.ok) return res

    let message = 'Something went wrong. Please try again.'
    let fieldErrors: Record<string, string> | undefined
    const extra: { code?: string, email?: string } = {}
    try {
      const data: unknown = await res.json()
      if (data && typeof data === 'object') {
        const d = data as Record<string, unknown>
        if (typeof d.detail === 'string' && d.detail.trim()) message = d.detail
        if (typeof d.code === 'string') extra.code = d.code
        if (typeof d.email === 'string') extra.email = d.email
        if (Array.isArray(d.errors)) {
          fieldErrors = {}
          for (const e of d.errors as { field?: string | null, message?: string }[]) {
            if (e.field && e.message && !(e.field in fieldErrors)) fieldErrors[e.field] = e.message
          }
          const first = Object.values(fieldErrors)[0]
          if (first) message = first
        }
        if (typeof d.field === 'string' && typeof d.detail === 'string') {
          fieldErrors = { [d.field]: d.detail }
        }
      }
    } catch { /* body was not JSON (gateway error page); keep the generic message */ }
    throw new ApiError(message, res.status >= 500, res.status, fieldErrors, extra)
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError')
    if (timedOut) throw new ApiError('The request took too long. Please try again.')
    if (isAbortError(err)) throw err
    throw new ApiError(`Can't reach the server at ${API_BASE_URL}. Check that the backend is running.`)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export interface SignupInput {
  full_name: string
  username: string
  email: string
  password: string
  accept_terms: boolean
}

export async function signup(input: SignupInput): Promise<User> {
  return (await request('/api/auth/signup', json(input))).json()
}

export async function verifyEmail(email: string, code: string): Promise<void> {
  await request('/api/auth/verify-email', json({ email, code }))
}

export async function resendVerification(email: string): Promise<void> {
  await request('/api/auth/resend-verification', json({ email }))
}

export async function forgotPassword(email: string): Promise<void> {
  await request('/api/auth/forgot-password', json({ email }))
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<void> {
  await request('/api/auth/reset-password', json({ email, code, new_password: newPassword }))
}

export async function login(identifier: string, password: string): Promise<User> {
  return (await request('/api/auth/login', json({ identifier, password }))).json()
}

export async function logout(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' })
}

/** Returns the signed-in user, or null when there is no valid session. */
export async function fetchMe(signal?: AbortSignal): Promise<User | null> {
  try {
    return await (await request('/api/auth/me', {}, signal)).json()
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null
    throw err
  }
}

export async function checkUsername(username: string, signal?: AbortSignal): Promise<{ available: boolean, reason: string | null }> {
  const res = await request(`/api/auth/username-available?username=${encodeURIComponent(username)}`, {}, signal)
  return res.json()
}

export async function uploadAvatar(file: File): Promise<User> {
  const form = new FormData() // the browser sets the multipart Content-Type itself
  form.append('file', file)
  return (await request('/api/profile/avatar', { method: 'PUT', body: form })).json()
}

export async function removeAvatar(): Promise<User> {
  return (await request('/api/profile/avatar', { method: 'DELETE' })).json()
}

/** Downloads the picture with the cookie attached and returns a blob URL for <img src>. */
export async function fetchAvatarUrl(signal?: AbortSignal): Promise<string> {
  const res = await request('/api/profile/avatar', {}, signal)
  return URL.createObjectURL(await res.blob())
}
