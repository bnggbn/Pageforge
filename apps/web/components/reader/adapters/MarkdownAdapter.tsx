import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ContentAdapter } from '../types'

export class MarkdownAdapter implements ContentAdapter {
  render(raw: string) {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-3xl font-bold mt-8 mb-4">{children}</h1>,
          h2: ({ children }) => <h2 className="text-2xl font-semibold mt-6 mb-3">{children}</h2>,
          h3: ({ children }) => <h3 className="text-xl font-semibold mt-4 mb-2">{children}</h3>,
          p:  ({ children }) => <p className="leading-relaxed mb-4 text-text">{children}</p>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary pl-4 italic text-text-muted my-4">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="bg-surface-muted rounded px-1.5 py-0.5 text-sm font-mono">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="bg-surface-muted rounded-xl p-4 overflow-x-auto my-4 text-sm font-mono">
              {children}
            </pre>
          ),
        }}
      >
        {raw}
      </ReactMarkdown>
    )
  }
}
