import type { ReactNode } from 'react'
import type { LibraryDocument } from '@/lib/documents'
import type { ReaderProgress } from '@/hooks/useReaderProgress'
import { PdfDocumentView } from './views/PdfDocumentView'
import { SpreadsheetView } from './views/SpreadsheetView'
import { TextDocumentView } from './views/TextDocumentView'

interface Props {
  doc: LibraryDocument
  progress: ReaderProgress
  withNotes: boolean
  onSelectQuote: () => void
  onPdfPageChange: (page: number) => void
  children: ReactNode
}
export function ReadingView({
  doc,
  progress,
  withNotes,
  onSelectQuote,
  onPdfPageChange,
  children,
}: Props) {
  return (
    <div className={`${styles.layout} ${withNotes ? styles.withNotes : ''}`}>
      <section className="reading-panel min-w-0 border border-line bg-surface rounded-[7px] overflow-hidden [&_>_.small-note]:my-3 [&_>_.small-note]:mx-5">
        {doc.format === 'pdf' ? (
          <PdfDocumentView
            doc={doc}
            page={progress.pdfPage}
            onPageChange={onPdfPageChange}
            onBookmark={progress.savePdfBookmark}
          />
        ) : doc.format === 'xlsx' ? (
          <SpreadsheetView doc={doc} progress={progress} onSelectQuote={onSelectQuote} />
        ) : (
          <TextDocumentView doc={doc} progress={progress} onSelectQuote={onSelectQuote} />
        )}
        <div className="reading-footer flex justify-between text-[10px] text-muted py-3.5 px-5.5 border-t border-line max-md:text-[9px] max-md:py-3 max-md:px-4">
          <span>
            {doc.format === 'pdf'
              ? `頁碼書籤 ${progress.pdfPage}`
              : `閱讀位置 ${progress.percentage}%`}
          </span>
          <span>{doc.format === 'epub' ? '文字閱讀模式' : '留一點時間，給文字。'}</span>
        </div>
      </section>
      {children}
    </div>
  )
}

const styles = {
  layout: [
    'reading-layout grid grid-cols-[minmax(0,_1fr)_300px] gap-7 mt-6.5 items-start',
    'max-lg:grid-cols-[minmax(0,_1fr)_250px] max-lg:gap-5 max-md:grid-cols-[minmax(0,_1fr)] max-md:mt-4.5',
  ].join(' '),
  withNotes: [
    'with-notes max-md:[&_.notes-panel]:block',
    'max-md:[&_.reader-scroll]:max-h-[42dvh] max-md:[&_.reader-scroll]:min-h-62.5',
  ].join(' '),
}
