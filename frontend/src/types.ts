export type Role = 'user' | 'assistant'

export interface Message {
  id: string
  conversation_id?: string
  role: Role
  content: string
  sequence_number?: number
  status?: 'sent' | 'pending' | 'error'
  created_at?: string
  timestamp?: number // For backward compatibility
}

export interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface ConversationList {
  items: Conversation[]
  next_cursor: string | null
}

export interface MessageList {
  items: Message[]
  has_more: boolean
}

export interface SendMessageResponse {
  user_message: Message
  assistant_message: Message
  conversation?: Conversation
}

/** Body sent to POST /api/chat (Legacy) */
export interface ChatRequest {
  message: string
  history?: { role: Role; content: string }[]
}

/** Body returned by POST /api/chat (Legacy) */
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
