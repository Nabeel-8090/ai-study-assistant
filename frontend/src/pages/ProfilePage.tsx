import { useRef, useState, useEffect } from 'react'
import type { ChangeEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { ApiError } from '../api'
import { removeAvatar, uploadAvatar } from '../authApi'
import { useAuth } from '../auth'
import { Avatar } from '../components/Avatar'
import { ThemeToggle } from '../theme'
import Cropper from 'react-easy-crop'
import { getCroppedImg } from '../utils/cropImage'

const MAX_BYTES = 2 * 1024 * 1024
const TYPES = ['image/png', 'image/jpeg', 'image/webp']

export default function ProfilePage() {
  const { user, setUser, logout, handleUnauthorized } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'bad', text: string } | null>(null)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)

  useEffect(() => {
    if (message?.kind === 'ok') {
      const timer = setTimeout(() => {
        setMessage(null)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [message])

  const backUrl = location.state?.fromChatId ? `/c/${location.state.fromChatId}` : '/'

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
    
    const reader = new FileReader()
    reader.addEventListener('load', () => setImageSrc(reader.result?.toString() || null))
    reader.readAsDataURL(file)
  }

  async function handleCropSave() {
    if (!imageSrc || !croppedAreaPixels) return
    setBusy(true)
    setMessage(null)
    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels)
      const file = new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' })
      const updated = await uploadAvatar(file)
      if (updated) setUser(updated)
      setMessage({ kind: 'ok', text: 'Profile picture updated.' })
      setImageSrc(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return handleUnauthorized()
      setMessage({ kind: 'bad', text: err instanceof Error ? err.message : 'Something went wrong.' })
    } finally {
      setBusy(false)
    }
  }

  function handleRemoveAvatar() {
    setShowRemoveConfirm(true)
  }

  async function confirmRemoveAvatar() {
    setShowRemoveConfirm(false)
    void run(removeAvatar, 'Profile picture removed.')
  }

  async function onLogout() {
    await logout()
    navigate('/signin', { replace: true })
  }

  return (
    <div className="app">
      <header className="bar">
        <Link to={backUrl} className="back-link">← Back to chat</Link>
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
                <button type="button" className="ghost" disabled={busy} onClick={handleRemoveAvatar}>
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

            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', fontSize: '0.9rem', justifyContent: 'center' }}>
              <Link to="/terms" style={{ color: 'inherit', opacity: 0.7 }}>Terms of Service</Link>
              <Link to="/privacy" style={{ color: 'inherit', opacity: 0.7 }}>Privacy Policy</Link>
            </div>

            <button type="button" className="danger" onClick={() => void onLogout()}>Log out</button>
          </section>
        </main>
      </div>
      
      {/* Cropper Modal */}
      {imageSrc && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'var(--surface-color)', borderRadius: '12px', width: '100%', maxWidth: '400px', overflow: 'hidden', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', fontSize: '1.1rem', fontWeight: 600 }}>
              Adjust Profile Picture
            </div>
            <div style={{ position: 'relative', width: '100%', height: '300px', background: '#000' }}>
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_croppedArea, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels)}
              />
            </div>
            <div style={{ padding: '1rem 20px', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', background: 'var(--bg-color)' }}>
              <button className="ghost" onClick={() => setImageSrc(null)}>Cancel</button>
              <button className="primary" onClick={handleCropSave} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Confirmation Modal */}
      {showRemoveConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'var(--surface-color)', borderRadius: '12px', width: '100%', maxWidth: '360px', padding: '24px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1.15rem' }}>Remove Picture?</h3>
            <p style={{ margin: '0 0 24px 0', color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.5 }}>
              Are you sure you want to remove your profile picture? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="ghost" onClick={() => setShowRemoveConfirm(false)}>Cancel</button>
              <button className="danger" onClick={() => void confirmRemoveAvatar()}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
