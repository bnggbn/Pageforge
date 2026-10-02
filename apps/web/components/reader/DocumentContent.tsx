'use client'
import ReactMarkdown from 'react-markdown'
import { memo, useMemo } from 'react'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import { LocalImage } from './LocalImage'

const components: Components = {
  a: ({ href, children }) =>
    href && /^(https?:|mailto:)/i.test(href) ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: ({ alt }) => (
    <span
      className={[
        'omitted-image text-muted text-[0.8em] border border-dashed border-line p-2',
        'inline-block',
      ].join(' ')}
    >
      [圖片：{alt || '不載入遠端圖片'}]
    </span>
  ),
  h1: ({ node, children }) => <h1 data-block={`line-${node?.position?.start.line}`}>{children}</h1>,
  h2: ({ node, children }) => <h2 data-block={`line-${node?.position?.start.line}`}>{children}</h2>,
  h3: ({ node, children }) => <h3 data-block={`line-${node?.position?.start.line}`}>{children}</h3>,
  h4: ({ node, children }) => <h4 data-block={`line-${node?.position?.start.line}`}>{children}</h4>,
  h5: ({ node, children }) => <h5 data-block={`line-${node?.position?.start.line}`}>{children}</h5>,
  h6: ({ node, children }) => <h6 data-block={`line-${node?.position?.start.line}`}>{children}</h6>,
  p: ({ node, children }) => <p data-block={`line-${node?.position?.start.line}`}>{children}</p>,
  pre: ({ node, children }) => (
    <pre data-block={`line-${node?.position?.start.line}`}>{children}</pre>
  ),
  ul: ({ node, children }) => <ul data-block={`line-${node?.position?.start.line}`}>{children}</ul>,
  ol: ({ node, children }) => <ol data-block={`line-${node?.position?.start.line}`}>{children}</ol>,
  blockquote: ({ node, children }) => (
    <blockquote data-block={`line-${node?.position?.start.line}`}>{children}</blockquote>
  ),
  table: ({ node, children }) => (
    <div
      className="reader-table-wrap overflow-auto max-w-full my-5 mx-0"
      data-block={`line-${node?.position?.start.line}`}
    >
      <table>{children}</table>
    </div>
  ),
}
export const DocumentContent = memo(function DocumentContent({
  text,
  markdown,
  documentId,
}: {
  text: string
  markdown: boolean
  documentId: string
}) {
  const documentComponents = useMemo<Components>(
    () => ({
      ...components,
      img: ({ src, alt }) => (
        <LocalImage
          source={typeof src === 'string' ? src : undefined}
          alt={alt}
          documentId={documentId}
        />
      ),
    }),
    [documentId],
  )
  if (markdown)
    return (
      <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={documentComponents}>
        {text}
      </ReactMarkdown>
    )
  return (
    <>
      {text.split(/\n\s*\n/).map((block, index) => (
        <p
          className="plain-paragraph whitespace-pre-wrap"
          data-block={`block-${index}`}
          key={index}
        >
          {block || '\u00a0'}
        </p>
      ))}
    </>
  )
})
