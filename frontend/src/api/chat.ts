import { API_BASE_URL, ApiError } from '../api'
import type { Conversation, ConversationList, MessageList, SendMessageResponse } from '../types'

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  let data: any
  try {
    data = await res.json()
  } catch {
    if (!res.ok) throw new ApiError('The server sent a response the app could not read.')
  }

  if (!res.ok) {
    throw new ApiError(data?.detail || 'Something went wrong', res.status >= 500, res.status)
  }

  return data
}

export async function getConversations(cursor?: string): Promise<ConversationList> {
  const url = cursor ? `/api/conversations?cursor=${encodeURIComponent(cursor)}` : '/api/conversations'
  return fetchJson<ConversationList>(url)
}

export async function createConversation(): Promise<Conversation> {
  return fetchJson<Conversation>('/api/conversations', { method: 'POST' })
}

export async function deleteConversation(id: string): Promise<void> {
  await fetchJson(`/api/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function getMessages(conversationId: string, beforeSequence?: number): Promise<MessageList> {
  let url = `/api/conversations/${encodeURIComponent(conversationId)}/messages`
  if (beforeSequence !== undefined) {
    url += `?before_sequence=${beforeSequence}`
  }
  return fetchJson<MessageList>(url)
}

export async function sendChatMessage(conversationId: string, content: string): Promise<SendMessageResponse> {
  return fetchJson<SendMessageResponse>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

export async function retryChatMessage(conversationId: string, messageId: string): Promise<SendMessageResponse> {
  return fetchJson<SendMessageResponse>(`/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/retry`, {
    method: 'POST',
  })
}
