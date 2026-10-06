import { useEffect, useRef, useState } from 'react'
import type { Ref } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api'
import { getConversations, createConversation, deleteConversation, getMessages, sendChatMessage, retryChatMessage } from '../api/chat'
import { useAuth } from '../auth'
import { Answer } from '../components/Answer'
import { Avatar } from '../components/Avatar'
import { Composer } from '../components/Composer'
import { ThemeToggle } from '../theme'
import type { Message, Conversation } from '../types'

const SUGGESTIONS = [
  'How do file permissions work in Linux?',
  'How does a CPU execute instructions?',
  'Explain the theory of relativity in simple terms.',
  'Write a Python script to scrape a website.',
  'What are the best practices for React performance?',
  'Can you help me understand quantum computing?',
  'What is the difference between SQL and NoSQL?',
  'How does public-key cryptography work?',
  'What are the principles of object-oriented programming?',
  'Explain the concept of containerization and Docker.',
  'How do neural networks learn?',
  'What is the event loop in JavaScript?',
  'Explain the SOLID design principles.',
  'How does a blockchain actually work?',
  'What is the difference between a process and a thread?',
  'Can you explain the TCP/IP model?',
  'What are some common sorting algorithms?',
  'How do web browsers render a web page?',
  'Explain RESTful API design.',
  'What is dynamic programming and how is it used?',
]

function SidebarItem({ c, isActive, onDelete, onClick }: { c: Conversation, isActive: boolean, onDelete: (e: React.MouseEvent, id: string) => void, onClick: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLongPress = useRef(false)

  const startPress = () => {
    isLongPress.current = false
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true
      setMenuOpen(true)
    }, 500)
  }

  const cancelPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
    }
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  return (
    <div 
      style={{ position: 'relative', zIndex: menuOpen ? 50 : 1 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); cancelPress(); }}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchMove={cancelPress}
      onContextMenu={(e) => {
        // Option for long press triggering context menu on some devices
        if (typeof window !== 'undefined' && window.innerWidth <= 768) {
          e.preventDefault()
          setMenuOpen(true)
        }
      }}
    >
      <Link 
        to={`/c/${c.id}`} 
        onClick={(e) => {
          if (isLongPress.current) {
            e.preventDefault()
            return
          }
          onClick()
        }}
        className={`sidebar-item ${isActive ? 'active' : ''}`}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '2rem' }}
        title={c.title || 'New Chat'}
      >
        <span style={{ 
          display: 'block',
          width: '100%',
          overflow: 'hidden', 
          whiteSpace: 'nowrap',
          WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,1) calc(100% - 24px), rgba(0,0,0,0) 100%)',
          maskImage: 'linear-gradient(to right, rgba(0,0,0,1) calc(100% - 24px), rgba(0,0,0,0) 100%)'
        }}>
          {c.title || 'New Chat'}
        </span>
      </Link>
      
      <div ref={menuRef} style={{ position: 'absolute', right: '0.4rem', top: '50%', transform: 'translateY(-50%)', opacity: (isHovered || menuOpen) ? 1 : 0, transition: 'opacity 0.2s', pointerEvents: (isHovered || menuOpen) ? 'auto' : 'none' }}>
        <button 
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(!menuOpen) }}
          style={{ padding: '4px', background: 'transparent', border: 'none', outline: 'none', color: isActive ? 'var(--accent-text-color)' : 'var(--text-secondary)', cursor: 'pointer', display: 'flex', borderRadius: '4px' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="1"></circle>
            <circle cx="12" cy="5" r="1"></circle>
            <circle cx="12" cy="19" r="1"></circle>
          </svg>
        </button>
        
        {menuOpen && (
          <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: '4px', background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: 'var(--shadow-md)', zIndex: 10, padding: '4px', minWidth: '110px' }}>
            <button 
              onClick={(e) => { onDelete(e, c.id); setMenuOpen(false) }}
              onMouseOver={(e) => e.currentTarget.style.opacity = '0.7'}
              onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', borderRadius: '4px', fontSize: '0.9rem', fontWeight: 500, transition: 'opacity 0.2s' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function MessageItem({ m, isLast, lastMessageRef, onRetry }: { m: Message, isLast: boolean, lastMessageRef: Ref<HTMLElement>, onRetry: (id: string) => void }) {
  const [copyStatus, setCopyStatus] = useState('Copy')
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyAttempt = useRef(0)

  useEffect(() => () => {
    copyAttempt.current++
    if (copyTimer.current !== null) clearTimeout(copyTimer.current)
  }, [])

  const handleCopy = async () => {
    const attempt = ++copyAttempt.current
    if (copyTimer.current !== null) clearTimeout(copyTimer.current)
    try {
      await navigator.clipboard.writeText(m.content)
      if (attempt !== copyAttempt.current) return
      setCopyStatus('Copied ✓')
    } catch {
      if (attempt !== copyAttempt.current) return
      setCopyStatus('Copy failed')
    }
    copyTimer.current = setTimeout(() => setCopyStatus('Copy'), 2000)
  }

  return (
    <article
      className={`message-wrapper ${m.role === 'user' ? 'user' : 'assistant'}`}
      ref={isLast ? lastMessageRef : null}
    >
      <div className="message">
        {m.role === 'user' ? (
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.content}</p>
        ) : (
          m.status === 'error' ? (
            <div style={{ color: '#d32f2f' }}>Failed to get response.</div>
          ) : m.status === 'pending' ? (
             <div className="typing-indicator" role="status" aria-label="Loading response"><span></span><span></span><span></span></div>
          ) : (
            <Answer text={m.content} />
          )
        )}
      </div>
      <div className={`msg-actions ${m.role === 'user' ? 'user' : 'assistant'}`}>
        {m.status === 'error' && m.role === 'assistant' && (
           <button type="button" className="copy-btn" onClick={() => onRetry(m.id)} style={{ color: '#d32f2f' }}>Retry</button>
        )}
        {m.status === 'sent' && m.content && (
          <button type="button" className="copy-btn" onClick={() => void handleCopy()} title="Copy text" aria-live="polite" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: '6px', padding: 0 }} onMouseOver={(e) => { e.currentTarget.style.background = 'var(--bg-color)'; e.currentTarget.style.color = 'var(--text-primary)'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
            {copyStatus === 'Copy' ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            )}
          </button>
        )}
      </div>
    </article>
  )
}

function SidebarToggleBtn({ onClick }: { onClick: () => void }) {
  const [isHovered, setIsHovered] = useState(false)
  return (
    <div style={{ position: 'relative', display: 'flex' }} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <button 
        type="button" 
        onClick={onClick}
        className="icon-btn" 
        onMouseOver={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
        onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
        style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-secondary)', padding: '4px', display: 'flex', cursor: 'pointer', transition: 'color 0.2s' }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="12" x2="20" y2="12"></line>
          <line x1="4" y1="6" x2="20" y2="6"></line>
          <line x1="4" y1="18" x2="20" y2="18"></line>
        </svg>
      </button>
      
      {isHovered && (
        <div style={{ 
          position: 'absolute', 
          top: '100%', 
          left: '0', 
          marginTop: '8px', 
          background: '#4a4a4a', 
          color: '#e5e5e5', 
          padding: '4px 8px', 
          borderRadius: '6px', 
          fontSize: '0.75rem',
          fontWeight: 600, 
          whiteSpace: 'nowrap', 
          zIndex: 100, 
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          pointerEvents: 'none'
        }}>
          Ctrl+B
        </div>
      )}
    </div>
  )
}

export default function ChatPage() {
  const { id: conversationId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const cached = sessionStorage.getItem('raggg_conversations')
    return cached ? JSON.parse(cached) : []
  })
  const [messages, setMessages] = useState<Message[]>(() => {
    if (!conversationId) return []
    const cached = sessionStorage.getItem(`raggg_messages_${conversationId}`)
    return cached ? JSON.parse(cached) : []
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  
  const [randomSuggestions, setRandomSuggestions] = useState<string[]>(() => {
    return [...SUGGESTIONS].sort(() => 0.5 - Math.random()).slice(0, 2)
  })

  useEffect(() => {
    if (!conversationId) {
      setRandomSuggestions([...SUGGESTIONS].sort(() => 0.5 - Math.random()).slice(0, 2))
    }
  }, [conversationId])
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) return false
    const saved = localStorage.getItem('sidebarOpen')
    return saved !== null ? saved === 'true' : true
  })
  
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth <= 768 : false)
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleSidebarNav = () => {
    if (isMobile) {
      setSidebarOpen(false)
    }
  }
  
  useEffect(() => {
    localStorage.setItem('sidebarOpen', String(sidebarOpen))
  }, [sidebarOpen])
  
  const { user, handleUnauthorized } = useAuth()
  
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth')
    return saved !== null ? parseInt(saved, 10) : 260
  })

  const isResizing = useRef(false)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      let newWidth = e.clientX
      if (newWidth < 200) newWidth = 200
      if (newWidth > 500) newWidth = 500
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false
        document.body.style.cursor = 'default'
        setSidebarWidth(w => {
          localStorage.setItem('sidebarWidth', w.toString())
          return w
        })
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const lastMessageRef = useRef<HTMLElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const skipNextFetch = useRef(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setSidebarOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    getConversations().then(res => {
      setConversations(res.items)
      sessionStorage.setItem('raggg_conversations', JSON.stringify(res.items))
    }).catch(console.error)
  }, [])

  useEffect(() => {
    if (conversationId) {
      if (skipNextFetch.current) {
        skipNextFetch.current = false
        return
      }
      
      const cacheKey = `raggg_messages_${conversationId}`
      const cached = sessionStorage.getItem(cacheKey)
      if (cached) {
        setMessages(JSON.parse(cached))
      } else {
        setMessages([])
        setLoading(true)
      }
      
      getMessages(conversationId).then(res => {
        setMessages(res.items)
        sessionStorage.setItem(cacheKey, JSON.stringify(res.items))
      }).catch(err => {
        if (err.status === 401) handleUnauthorized()
        setError(err)
      }).finally(() => {
        setLoading(false)
      })
    } else {
      setMessages([])
    }
  }, [conversationId, handleUnauthorized])

  const handleSend = async (text: string) => {
    let targetConvId = conversationId
    let isNew = false
    
    // Immediately show user prompt and pending AI state in UI
    const tempUserId = `user-${Date.now()}`
    const tempAsstId = `asst-${Date.now()}`
    setMessages(prev => [
      ...prev, 
      { id: tempUserId, role: 'user', content: text, status: 'sent', conversation_id: targetConvId || '', created_at: new Date().toISOString() },
      { id: tempAsstId, role: 'assistant', content: '', status: 'pending', conversation_id: targetConvId || '', created_at: new Date().toISOString() }
    ])

    try {
      setLoading(true)
      setError(null)
      if (!targetConvId) {
        const conv = await createConversation()
        setConversations(prev => [conv, ...prev])
        targetConvId = conv.id
        isNew = true
        skipNextFetch.current = true
        navigate(`/c/${targetConvId}`)
      }
      
      const res = await sendChatMessage(targetConvId, text)
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== tempUserId && m.id !== tempAsstId)
        return [...filtered, res.user_message, res.assistant_message]
      })
      
      setConversations(prev => {
        const updated = prev.map(c => {
          if (c.id === targetConvId) {
            return isNew ? { ...c, title: res.conversation?.title || (text.slice(0, 47) + (text.length > 47 ? '...' : '')) } : c
          }
          return c
        })
        const c = updated.find(x => x.id === targetConvId)
        const finalConvs = c ? [c, ...updated.filter(x => x.id !== targetConvId)] : updated
        sessionStorage.setItem('raggg_conversations', JSON.stringify(finalConvs))
        return finalConvs
      })
      
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) handleUnauthorized()
      // On error, mark the temporary assistant message as errored
      setMessages(prev => prev.map(m => m.id === tempAsstId ? { ...m, status: 'error' } : m))
    } finally {
      setLoading(false)
    }
  }

  const handleRetry = async (messageId: string) => {
    if (!conversationId) return
    
    // Find the user message before this assistant message
    const msgIndex = messages.findIndex(m => m.id === messageId)
    const userMsg = messages[msgIndex - 1]
    if (!userMsg || userMsg.role !== 'user') return

    try {
      setLoading(true)
      setError(null)
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, status: 'pending' } : m))
      
      const res = await retryChatMessage(conversationId, userMsg.id)
      setMessages(prev => prev.map(m => m.id === messageId ? res.assistant_message : m))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) handleUnauthorized()
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, status: 'error' } : m))
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteChat = async (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await deleteConversation(id)
      setConversations(prev => {
        const filtered = prev.filter(c => c.id !== id)
        sessionStorage.setItem('raggg_conversations', JSON.stringify(filtered))
        return filtered
      })
      if (conversationId === id) navigate('/')
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    const last = messages[messages.length - 1]
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    if (last?.role === 'assistant') {
      lastMessageRef.current?.scrollIntoView({ block: 'start', behavior })
    } else {
      bottomRef.current?.scrollIntoView({ block: 'end', behavior })
    }
  }, [messages, loading, error])

  const isEmpty = messages.length === 0 && !loading && !error

  return (
    <div className="app" style={{ flexDirection: 'row' }}>
      {sidebarOpen && isMobile && (
        <div 
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            zIndex: 999
          }}
        />
      )}
      {sidebarOpen && (
        <aside className="sidebar" style={{ width: isMobile ? '85vw' : sidebarWidth, position: isMobile ? 'absolute' : 'relative', zIndex: isMobile ? 1000 : 1 }}>
          {/* Resize handle */}
          {!isMobile && (
            <div 
              onMouseDown={(e) => {
                e.preventDefault()
                isResizing.current = true
                document.body.style.cursor = 'col-resize'
              }}
              style={{ 
                position: 'absolute', 
                top: 0, 
                right: '-3px', 
                width: '6px', 
                height: '100%', 
                cursor: 'col-resize', 
                zIndex: 100 
              }} 
              title="Resize sidebar"
            />
          )}
          <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <SidebarToggleBtn onClick={() => setSidebarOpen(false)} />
            </div>
            <button 
              type="button" 
              onClick={() => { navigate('/'); handleSidebarNav() }} 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                padding: '8px 12px', 
                background: 'transparent', 
                color: 'var(--text-primary)', 
                border: 'none', 
                borderRadius: '8px', 
                cursor: 'pointer', 
                fontSize: '0.875rem',
                fontWeight: 500,
                transition: 'background-color 0.2s ease'
              }} 
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'var(--bg-tertiary)';
              }} 
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent';
              }} 
              title="New Chat"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
              New chat
            </button>
          </div>
          <div className="sidebar-list">
            {conversations.length > 0 && (
              <div style={{ padding: '0 0.75rem', marginTop: '2.5rem', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Recents</div>
            )}
            {conversations.map(c => (
              <SidebarItem key={c.id} c={c} isActive={c.id === conversationId} onDelete={handleDeleteChat} onClick={handleSidebarNav} />
            ))}
          </div>
        </aside>
      )}

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100dvh', minWidth: 0, position: 'relative' }}>
        <header className="bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {!sidebarOpen && (
              <SidebarToggleBtn onClick={() => setSidebarOpen(true)} />
            )}
            <img src="/favicon.png" alt="Logo" style={{ width: '36px', height: '36px', borderRadius: '50%' }} />
            <h1>RAGGG</h1>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <ThemeToggle />
            {user && (
              <Link to="/profile" state={{ fromChatId: conversationId }} className="profile-link" aria-label="Open your profile" title={`@${user.username}`}>
                <Avatar user={user} size={40} />
              </Link>
            )}
          </div>
        </header>

        <div className="scroll" style={{ overflowY: isEmpty ? 'hidden' : 'auto' }}>
          <div className="thread" role="log" aria-label="Conversation">
            {isEmpty && (
              <section className="empty">
                <h2>What do you want to understand?</h2>
                <p>Ask a question and get a plain explanation.</p>
                <ul className="suggestions">
                  {randomSuggestions.map((s) => (
                    <li key={s}>
                      <button type="button" onClick={() => handleSend(s)}>
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {messages.map((m, i) => (
              <MessageItem
                key={m.id}
                m={m}
                isLast={i === messages.length - 1}
                lastMessageRef={lastMessageRef}
                onRetry={handleRetry}
              />
            ))}

            {error && (
              <div className="error" role="alert" style={{ marginTop: '1rem' }}>
                <p>{error.message}</p>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        <Composer busy={loading} onSend={handleSend} />
      </main>
    </div>
  )
}
