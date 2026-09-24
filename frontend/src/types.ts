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
