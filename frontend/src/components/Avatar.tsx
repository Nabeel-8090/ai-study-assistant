import { useEffect, useState } from 'react'
import { fetchAvatarUrl } from '../authApi'
import type { User } from '../types'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

const avatarCache = new Map<number, string>()
const avatarPromises = new Map<number, Promise<string>>()

/** The user's picture if they have one, otherwise their initials. */
export function Avatar({ user, size = 40 }: { user: User, size?: number }) {
  const version = user.avatar_version || 0
  const hasAvatar = user.has_avatar
  const [url, setUrl] = useState<string | null>(hasAvatar ? avatarCache.get(version) || null : null)

  useEffect(() => {
    if (!hasAvatar) return
    
    if (avatarCache.has(version)) {
      setUrl(avatarCache.get(version)!)
      return
    }

    let isMounted = true

    if (!avatarPromises.has(version)) {
      const promise = fetchAvatarUrl().then((u) => {
        avatarCache.set(version, u)
        return u
      }).catch(() => {
        avatarPromises.delete(version)
        return null as unknown as string
      })
      avatarPromises.set(version, promise)
    }

    avatarPromises.get(version)!.then((u) => {
      if (isMounted && u) setUrl(u)
    })

    return () => {
      isMounted = false
    }
  }, [hasAvatar, version])

  const style = { width: size, height: size, fontSize: size * 0.4 }
  if (hasAvatar && url) return <img className="avatar" style={style} src={url} alt={`${user.full_name}'s profile picture`} />
  return <span className="avatar avatar-initials" style={style} aria-hidden="true">{initials(user.full_name)}</span>
}
