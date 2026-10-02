import { latest } from '@/lib/documents'
import type { ScrollDocumentViewProps } from './types'
import { DocumentContent } from '../DocumentContent'
import { SectionSelector } from './SectionSelector'
import { ScrollReaderFrame } from './ScrollReaderFrame'

export function TextDocumentView({ doc, progress, onSelectQuote }: ScrollDocumentViewProps) {
  const section = Math.min(Math.max(0, progress.section), Math.max(0, doc.sections.length - 1))
  return (
    <>
      {doc.format === 'epub' && (
        <SectionSelector
          titles={doc.sections.map((item) => item.title)}
          section={section}
          label="章節"
          onChange={progress.changeSection}
        />
      )}
      <ScrollReaderFrame progress={progress} onSelectQuote={onSelectQuote}>
        <DocumentContent
          documentId={doc.id}
          text={doc.format === 'epub' ? (doc.sections[section]?.text ?? '') : latest(doc).content}
          markdown={doc.format === 'markdown'}
        />
      </ScrollReaderFrame>
    </>
  )
}
