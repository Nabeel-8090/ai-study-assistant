import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api'
import { forgotPassword, resetPassword } from '../authApi'
import { AuthLayout } from '../components/AuthLayout'
import { CodeField } from '../components/CodeField'
import { PasswordField } from '../components/PasswordField'
import { useCooldown } from '../hooks/useCooldown'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const state = (useLocation().state ?? {}) as { email?: string, sent?: boolean }
  const [email, setEmail] = useState(state.email ?? '')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(
    state.sent ? 'If an account exists for that email, we sent a 6-digit code. It expires in 10 minutes.' : null,
  )
  const [busy, setBusy] = useState(false)
  const { remaining, start } = useCooldown(state.sent ? 60 : 0)

  const passwordError = password && password.length < 8 ? 'Use at least 8 characters.' : undefined
  const canSubmit = !busy && email.trim() && code.length === 6 && password.length >= 8

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await resetPassword(email.trim(), code, password)
      navigate('/signin', { replace: true, state: { notice: 'Password updated. Please sign in with your new password.' } })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  async function onResend() {
    setError(null)
    try {
      await forgotPassword(email.trim())
      start(60)
      setInfo('If an account exists for that email, a new code is on its way.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send a new code. Please try again.')
    }
  }

  return (
    <AuthLayout title="Reset your password" subtitle="Enter the code from your email and choose a new password.">
      {info && !error && <p className="notice ok" role="status">{info}</p>}
      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="reset-email">Email</label>
          <input id="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} required />
        </div>
        <CodeField id="reset-code" value={code} onChange={setCode} />
        <PasswordField id="new-password" label="New password" value={password} onChange={setPassword}
          autoComplete="new-password" error={passwordError} hint="At least 8 characters." />
        {error && <p className="notice bad" role="alert">{error}</p>}
        <button type="submit" className="primary" disabled={!canSubmit}>
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </form>
      <button type="button" className="link-btn" onClick={() => void onResend()} disabled={remaining > 0 || !email.trim()}>
        {remaining > 0 ? `Resend code in ${remaining}s` : 'Resend code'}
      </button>
      <p className="auth-switch"><Link to="/signin">← Back to sign in</Link></p>
    </AuthLayout>
  )
}
