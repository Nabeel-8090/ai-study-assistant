export type Role = 'user' | 'assistant'

export interface Message {
  id: string
  role: Role
  content: string
  timestamp?: number
}

/** Body sent to POST /api/chat */
export interface ChatRequest {
  message: string
}

/** Body returned by POST /api/chat */
export interface ChatResponse {
  answer: string
}

/** The signed-in user, as returned by /api/auth/me. Never contains a password or token. */
export interface User {
  id: string
  full_name: string
  username: string
  email: string
  created_at: string
  has_avatar: boolean
  avatar_version: number | null
}
