import { useEffect, useState } from 'react'
import { fetchAvatarUrl } from '../authApi'
import type { User } from '../types'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** The user's picture if they have one, otherwise their initials. */
export function Avatar({ user, size = 40 }: { user: User, size?: number }) {
  const [url, setUrl] = useState<string | null>(null)
  const version = user.avatar_version
  const hasAvatar = user.has_avatar

  useEffect(() => {
    if (!hasAvatar) return
    const controller = new AbortController()
    let created: string | null = null
    fetchAvatarUrl(controller.signal).then(
      (u) => {
        created = u
        if (controller.signal.aborted) URL.revokeObjectURL(u)
        else setUrl(u)
      },
      () => setUrl(null), // fall back to initials
    )
    return () => {
      controller.abort()
      if (created) URL.revokeObjectURL(created)
    }
  }, [hasAvatar, version])

  const style = { width: size, height: size, fontSize: size * 0.4 }
  if (hasAvatar && url) return <img className="avatar" style={style} src={url} alt={`${user.full_name}'s profile picture`} />
  return <span className="avatar avatar-initials" style={style} aria-hidden="true">{initials(user.full_name)}</span>
}
