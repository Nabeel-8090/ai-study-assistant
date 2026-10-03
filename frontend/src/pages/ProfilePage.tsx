import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../api'
import { removeAvatar, uploadAvatar } from '../authApi'
import { useAuth } from '../auth'
import { Avatar } from '../components/Avatar'
import { ThemeToggle } from '../theme'

const MAX_BYTES = 2 * 1024 * 1024
const TYPES = ['image/png', 'image/jpeg', 'image/webp']

export default function ProfilePage() {
  const { user, setUser, logout, handleUnauthorized } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'bad', text: string } | null>(null)

  if (!user) return null // ProtectedRoute guarantees a user; this keeps TypeScript happy

  async function run(action: () => Promise<typeof user>, success: string) {
    setBusy(true)
    setMessage(null)
    try {
      const updated = await action()
      if (updated) setUser(updated)
      setMessage({ kind: 'ok', text: success })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return handleUnauthorized()
      setMessage({ kind: 'bad', text: err instanceof Error ? err.message : 'Something went wrong.' })
    } finally {
      setBusy(false)
    }
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the same file again later
    if (!file) return
    if (!TYPES.includes(file.type)) return setMessage({ kind: 'bad', text: 'Please choose a PNG, JPEG or WebP image.' })
    if (file.size > MAX_BYTES) return setMessage({ kind: 'bad', text: 'Image is too large. Maximum size is 2 MB.' })
    void run(() => uploadAvatar(file), 'Profile picture updated.')
  }

  async function onLogout() {
    await logout()
    navigate('/signin', { replace: true })
  }

  return (
    <div className="app">
      <header className="bar">
        <Link to="/" className="back-link">← Back to chat</Link>
        <ThemeToggle />
      </header>
      <div className="scroll">
        <main className="profile">
          <section className="profile-card">
            <div className="profile-head">
              <Avatar user={user} size={96} />
              <div className="profile-id">
                <h1>{user.full_name}</h1>
                <p className="muted">@{user.username}</p>
              </div>
            </div>

            <div className="avatar-actions">
              <input ref={fileRef} type="file" accept={TYPES.join(',')} onChange={onPick} hidden />
              <button type="button" className="primary" disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy ? 'Working…' : user.has_avatar ? 'Change picture' : 'Upload picture'}
              </button>
              {user.has_avatar && (
                <button type="button" className="ghost" disabled={busy} onClick={() => void run(removeAvatar, 'Profile picture removed.')}>
                  Remove
                </button>
              )}
            </div>
            {message && <p className={`notice ${message.kind}`} role={message.kind === 'bad' ? 'alert' : 'status'}>{message.text}</p>}

            <dl className="details">
              <div><dt>Full name</dt><dd>{user.full_name}</dd></div>
              <div><dt>Username</dt><dd>@{user.username}</dd></div>
              <div><dt>Email</dt><dd>{user.email}</dd></div>
              <div><dt>Member since</dt><dd>{new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</dd></div>
            </dl>

            <button type="button" className="danger" onClick={() => void onLogout()}>Log out</button>
          </section>
        </main>
      </div>
    </div>
  )
}
