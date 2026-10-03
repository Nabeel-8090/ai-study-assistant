import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../api'
import { checkUsername, signup } from '../authApi'
import { AuthLayout } from '../components/AuthLayout'
import { PasswordField } from '../components/PasswordField'

const USERNAME_RE = /^[a-z0-9_]{3,30}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

type UsernameState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok' }
  | { kind: 'bad', message: string }

/** Result of asking the server about one specific (normalized) username. */
interface Checked { name: string, available: boolean, reason: string | null }

export default function SignUpPage() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [checked, setChecked] = useState<Checked | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // What the username box should say. Local rules are checked while rendering;
  // the server answer is used only if it is about the username currently typed.
  const normalized = username.trim().toLowerCase()
  let usernameState: UsernameState = { kind: 'idle' }
  if (normalized) {
    if (!USERNAME_RE.test(normalized)) usernameState = { kind: 'bad', message: 'Use 3-30 letters, numbers or underscores.' }
    else if (checked?.name === normalized) {
      usernameState = checked.available ? { kind: 'ok' } : { kind: 'bad', message: checked.reason ?? 'Username is not available.' }
    } else usernameState = { kind: 'checking' }
  }

  // Live "is this username free?" check. Waits 350 ms after typing stops, and a
  // slow old answer can never overwrite a newer one (the old request is aborted).
  useEffect(() => {
    if (!USERNAME_RE.test(normalized)) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      checkUsername(normalized, controller.signal).then(
        (r) => setChecked({ name: normalized, available: r.available, reason: r.reason }),
        () => { /* network hiccup or cancelled: the server re-checks on submit anyway */ },
      )
    }, 350)
    return () => { clearTimeout(timer); controller.abort() }
  }, [normalized])

  const emailError = email && !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address.' : undefined
  const passwordError = password && password.length < 8 ? 'Use at least 8 characters.' : undefined

  const canSubmit = !busy && fullName.trim() && USERNAME_RE.test(username.trim().toLowerCase())
    && usernameState.kind !== 'bad' && EMAIL_RE.test(email.trim()) && password.length >= 8 && agreed

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setFormError(null)
    setFieldErrors({})
    try {
      await signup({
        full_name: fullName.trim(), username: username.trim(), email: email.trim(), password, accept_terms: true,
      })
      // The server emailed a 6-digit code. Verify it, then sign in.
      navigate('/verify-email', { replace: true, state: { email: email.trim().toLowerCase() } })
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors ?? {})
        if (err.fieldErrors?.username) setChecked({ name: normalized, available: false, reason: err.fieldErrors.username })
        if (!err.fieldErrors) setFormError(err.message)
      } else {
        setFormError('Something went wrong. Please try again.')
      }
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Sign up, verify your email, then sign in to start chatting.">
      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="full_name">Full name</label>
          <input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)}
            autoComplete="name" maxLength={80} required autoFocus />
          {fieldErrors.full_name && <p className="field-msg bad" role="alert">{fieldErrors.full_name}</p>}
        </div>

        <div className="field">
          <label htmlFor="username">Username</label>
          <input id="username" value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={30} required
            aria-invalid={usernameState.kind === 'bad' ? true : undefined}
            aria-describedby="username-msg" />
          <p id="username-msg" className={`field-msg ${usernameState.kind === 'bad' ? 'bad' : usernameState.kind === 'ok' ? 'good' : ''}`}
            role={usernameState.kind === 'bad' ? 'alert' : 'status'}>
            {usernameState.kind === 'checking' && 'Checking…'}
            {usernameState.kind === 'ok' && '✓ Username is available.'}
            {usernameState.kind === 'bad' && usernameState.message}
            {usernameState.kind === 'idle' && 'Letters, numbers and underscores. 3-30 characters.'}
          </p>
        </div>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} required
            aria-invalid={emailError || fieldErrors.email ? true : undefined} />
          {(emailError || fieldErrors.email) && <p className="field-msg bad" role="alert">{fieldErrors.email ?? emailError}</p>}
        </div>

        <PasswordField id="new-password" value={password} onChange={setPassword} autoComplete="new-password"
          error={passwordError ?? fieldErrors.password} hint="At least 8 characters." />

        <div className="check">
          <input id="terms" type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <label htmlFor="terms">
            I agree to the{' '}
            <Link to="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</Link>
            {' '}and{' '}
            <Link to="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>.
          </label>
        </div>
        {fieldErrors.accept_terms && <p className="field-msg bad" role="alert">{fieldErrors.accept_terms}</p>}

        {formError && <p className="notice bad" role="alert">{formError}</p>}
        <button type="submit" className="primary" disabled={!canSubmit}>
          {busy ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
      <p className="auth-switch">Already have an account? <Link to="/signin">Sign in</Link></p>
    </AuthLayout>
  )
}
