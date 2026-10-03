import { useState } from 'react'

interface Props {
  id: string
  value: string
  onChange: (v: string) => void
  autoComplete: 'current-password' | 'new-password'
  label?: string
  error?: string
  hint?: string
}

export function PasswordField({ id, value, onChange, autoComplete, label = 'Password', error, hint }: Props) {
  const [show, setShow] = useState(false)
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-row">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          maxLength={128}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-msg` : hint ? `${id}-msg` : undefined}
          required
        />
        <button type="button" className="show-btn" onClick={() => setShow((s) => !s)} aria-pressed={show}>
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {error ? <p id={`${id}-msg`} className="field-msg bad" role="alert">{error}</p>
        : hint ? <p id={`${id}-msg`} className="field-msg">{hint}</p> : null}
    </div>
  )
}
