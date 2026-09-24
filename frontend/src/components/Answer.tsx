import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Renders the model's answer, which usually arrives as Markdown. */
export function Answer({ text }: { text: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
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
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
