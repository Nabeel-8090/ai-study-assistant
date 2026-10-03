import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { ApiError } from '../api'
import { AuthLayout } from '../components/AuthLayout'
import { PasswordField } from '../components/PasswordField'

export default function SignInPage() {
  const { login, startupError } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Message handed over by the page we came from (e.g. "Email verified.")
  const notice = (location.state as { notice?: string } | null)?.notice

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await login(identifier.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'email_not_verified') {
        // Right password, but the email was never verified: finish verification first.
        navigate('/verify-email', { state: { email: err.email ?? identifier.trim(), sendCode: true } })
        return
      }
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue to your AI assistant.">
      {notice && !error && <p className="notice ok" role="status">{notice}</p>}
      {startupError && !error && <p className="notice bad" role="alert">{startupError}</p>}
      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="identifier">Username or email</label>
          <input
            id="identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            required
            autoFocus
          />
        </div>
        <PasswordField id="password" value={password} onChange={setPassword} autoComplete="current-password" />
        <p className="forgot-row"><Link to="/forgot-password">Forgot password?</Link></p>
        {error && <p className="notice bad" role="alert">{error}</p>}
        <button type="submit" className="primary" disabled={busy || !identifier.trim() || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="auth-switch">New here? <Link to="/signup">Create an account</Link></p>
    </AuthLayout>
  )
}
