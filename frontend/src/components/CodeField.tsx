interface Props {
  id: string
  value: string
  onChange: (v: string) => void
  error?: string
}

/** One box for the 6-digit emailed code. Digits only; works with paste and phone autofill. */
export function CodeField({ id, value, onChange, error }: Props) {
  return (
    <div className="field">
      <label htmlFor={id}>6-digit code</label>
      <input
        id={id}
        className="otp-input"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="••••••"
        maxLength={6}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-msg` : undefined}
        required
      />
      {error && <p id={`${id}-msg`} className="field-msg bad" role="alert">{error}</p>}
    </div>
  )
}
