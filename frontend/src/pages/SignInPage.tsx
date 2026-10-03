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
  const justRegistered = (location.state as { registered?: boolean } | null)?.registered === true

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
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue to your AI assistant.">
      {justRegistered && !error && <p className="notice ok" role="status">Account created. Please sign in.</p>}
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
        {error && <p className="notice bad" role="alert">{error}</p>}
        <button type="submit" className="primary" disabled={busy || !identifier.trim() || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="auth-switch">New here? <Link to="/signup">Create an account</Link></p>
    </AuthLayout>
  )
}
