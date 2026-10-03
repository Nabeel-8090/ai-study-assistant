import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api'
import { resendVerification, verifyEmail } from '../authApi'
import { AuthLayout } from '../components/AuthLayout'
import { CodeField } from '../components/CodeField'
import { useCooldown } from '../hooks/useCooldown'

interface NavState { email?: string, sendCode?: boolean }

export default function VerifyEmailPage() {
  const navigate = useNavigate()
  const state = (useLocation().state ?? {}) as NavState
  const [email, setEmail] = useState(state.email ?? '')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(state.email ? `We sent a 6-digit code to ${state.email}.` : null)
  const [busy, setBusy] = useState(false)
  const { remaining, start } = useCooldown(state.email ? 60 : 0)
  const autoSent = useRef(false)

  // Arriving from a sign-in attempt by an unverified user: send a fresh code once.
  useEffect(() => {
    if (!state.sendCode || !state.email || autoSent.current) return
    autoSent.current = true
    void resendVerification(state.email).catch(() => { /* the Resend button is still there */ })
  }, [state.sendCode, state.email])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await verifyEmail(email.trim(), code)
      navigate('/signin', { replace: true, state: { notice: 'Email verified. You can now sign in.' } })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  async function onResend() {
    setError(null)
    try {
      await resendVerification(email.trim())
      start(60)
      setInfo('If this account still needs verification, a new code is on its way.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send a new code. Please try again.')
    }
  }

  return (
    <AuthLayout title="Verify your email" subtitle="Enter the code we emailed you to activate your account.">
      {info && !error && <p className="notice ok" role="status">{info}</p>}
      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="verify-email">Email</label>
          <input id="verify-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} required />
        </div>
        <CodeField id="verify-code" value={code} onChange={setCode} />
        {error && <p className="notice bad" role="alert">{error}</p>}
        <button type="submit" className="primary" disabled={busy || code.length !== 6 || !email.trim()}>
          {busy ? 'Verifying…' : 'Verify email'}
        </button>
      </form>
      <button type="button" className="link-btn" onClick={() => void onResend()} disabled={remaining > 0 || !email.trim()}>
        {remaining > 0 ? `Resend code in ${remaining}s` : 'Resend code'}
      </button>
      <p className="auth-switch">Wrong address? <Link to="/signup">Start again</Link> · <Link to="/signin">Sign in</Link></p>
    </AuthLayout>
  )
}
