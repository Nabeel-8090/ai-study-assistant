import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

import { useState } from 'react'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy', err)
    }
  }

  return (
    <button 
      onClick={handleCopy}
      title="Copy code"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        background: 'transparent',
        border: 'none',
        color: 'inherit',
        cursor: 'pointer',
        padding: '2px 4px',
        fontSize: '0.8rem'
      }}
    >
      {copied ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Copied!
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          Copy
        </>
      )}
    </button>
  )
}

/** Renders the model's answer, which usually arrives as Markdown. */
export function Answer({ text }: { text: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Let wide tables scroll sideways instead of breaking the layout.
          table: ({ node: _node, ...props }) => (
            <div className="table-wrap">
              <table {...props} />
            </div>
          ),
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer noopener" />
          ),
          pre: ({ node: _node, children, ...props }) => {
            const codeProps = (children as any)?.props || {}
            const textToCopy = codeProps.children ? String(codeProps.children).replace(/\n$/, '') : ''
            const match = /language-(\w+)/.exec(codeProps.className || '')
            const language = match ? match[1] : 'text'
            
            return (
              <div style={{ position: 'relative', marginBottom: '1.25rem', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--code-bg)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '0.4rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <span style={{ textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>{language}</span>
                  <CopyButton text={textToCopy} />
                </div>
                <pre {...props} style={{ margin: 0, borderRadius: 0, border: 'none' }}>
                  {children}
                </pre>
              </div>
            )
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
