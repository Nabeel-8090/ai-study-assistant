import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth'

/** Wraps pages that need a login. Anonymous visitors are sent to /signin. */
export function ProtectedRoute() {
  const { status } = useAuth()
  if (status === 'loading') return <Splash />
  if (status === 'anonymous') return <Navigate to="/signin" replace />
  return <Outlet />
}

/** Wraps /signin and /signup. People who are already logged in go straight to the chat. */
export function PublicOnlyRoute() {
  const { status } = useAuth()
  if (status === 'loading') return <Splash />
  if (status === 'authenticated') return <Navigate to="/" replace />
  return <Outlet />
}

function Splash() {
  return (
    <div className="splash" role="status" aria-live="polite">
      <img src="/favicon.png" alt="" />
      <span>Loading…</span>
    </div>
  )
}
