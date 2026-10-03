import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

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
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
