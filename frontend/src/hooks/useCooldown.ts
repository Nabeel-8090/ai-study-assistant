import { useCallback, useEffect, useState } from 'react'

/** A countdown for "Resend code" buttons. `remaining` is whole seconds left (0 = ready). */
export function useCooldown(initialSeconds = 0) {
  const [until, setUntil] = useState(() => Date.now() + initialSeconds * 1000)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (until <= Date.now()) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= until) clearInterval(id)
    }, 500)
    return () => clearInterval(id)
  }, [until])

  const start = useCallback((seconds: number) => {
    const t = Date.now()
    setNow(t)
    setUntil(t + seconds * 1000)
  }, [])

  return { remaining: Math.max(0, Math.ceil((until - now) / 1000)), start }
}
