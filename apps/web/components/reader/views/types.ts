import type { LibraryDocument } from '@/lib/documents'
import type { ReaderProgress } from '@/hooks/useReaderProgress'

export interface ScrollDocumentViewProps {
  doc: LibraryDocument
  progress: Pick<
    ReaderProgress,
    'scrollRef' | 'articleRef' | 'fontSize' | 'onScroll' | 'section' | 'changeSection'
  >
  onSelectQuote: () => void
}
