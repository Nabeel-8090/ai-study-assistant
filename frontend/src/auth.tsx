import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import * as authApi from './authApi'
import type { User } from './types'

type Status = 'loading' | 'authenticated' | 'anonymous'

interface AuthContextValue {
  status: Status
  user: User | null
  /** Set when the first check could not reach the server at all. */
  startupError: string | null
  login: (identifier: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setUser: (user: User) => void
  /** Call when any request returns 401: the session ended, so go back to sign-in. */
  handleUnauthorized: () => void
  retryStartup: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUserState] = useState<User | null>(null)
  const [startupError, setStartupError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  // On every page load, ask the server "who am I?". The cookie travels automatically.
  useEffect(() => {
    const controller = new AbortController()
    authApi.fetchMe(controller.signal).then(
      (me) => {
        setUserState(me)
        setStatus(me ? 'authenticated' : 'anonymous')
      },
      (err: unknown) => {
        if (controller.signal.aborted) return
        setStartupError(err instanceof Error ? err.message : 'Could not reach the server.')
        setStatus('anonymous')
      },
    )
    return () => controller.abort()
  }, [attempt])

  const login = useCallback(async (identifier: string, password: string) => {
    const me = await authApi.login(identifier, password)
    setUserState(me)
    setStatus('authenticated')
  }, [])

  const clearUser = useCallback(() => {
    setUserState(null)
    setStatus('anonymous')
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      clearUser() // even if the request failed, leave the signed-in UI
    }
  }, [clearUser])

  const value = useMemo<AuthContextValue>(() => ({
    status, user, startupError, login, logout, handleUnauthorized: clearUser,
    setUser: (u: User) => setUserState(u),
    retryStartup: () => {
      setStatus('loading')
      setStartupError(null)
      setAttempt((n) => n + 1)
    },
  }), [status, user, startupError, login, logout, clearUser])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
