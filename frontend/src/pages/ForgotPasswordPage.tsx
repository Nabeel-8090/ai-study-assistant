import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../api'
import { forgotPassword } from '../authApi'
import { AuthLayout } from '../components/AuthLayout'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const valid = EMAIL_RE.test(email.trim())

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || !valid) return
    setBusy(true)
    setError(null)
    try {
      await forgotPassword(email.trim())
      // Same next step whether or not the address has an account (the server never says).
      navigate('/reset-password', { state: { email: email.trim().toLowerCase(), sent: true } })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Forgot your password?" subtitle="Enter your email and we'll send you a 6-digit reset code.">
      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="forgot-email">Email</label>
          <input id="forgot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} required autoFocus />
        </div>
        {error && <p className="notice bad" role="alert">{error}</p>}
        <button type="submit" className="primary" disabled={busy || !valid}>
          {busy ? 'Sending…' : 'Send reset code'}
        </button>
      </form>
      <p className="auth-switch"><Link to="/signin">← Back to sign in</Link></p>
    </AuthLayout>
  )
}
