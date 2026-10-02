import type { ReactNode } from 'react'
import type { ReaderProgress } from '@/hooks/useReaderProgress'
import { DocumentProse } from '../DocumentProse'

interface Props {
  progress: Pick<ReaderProgress, 'scrollRef' | 'articleRef' | 'fontSize' | 'onScroll'>
  onSelectQuote: () => void
  children: ReactNode
}
export function ScrollReaderFrame({ progress, onSelectQuote, children }: Props) {
  return (
    <div ref={progress.scrollRef} className={styles.scroll} onScroll={progress.onScroll}>
      <DocumentProse
        ref={progress.articleRef}
        style={{ fontSize: progress.fontSize }}
        onMouseUp={onSelectQuote}
        onKeyUp={(e) => {
          if (e.key === 'Shift') onSelectQuote()
        }}
      >
        {children}
      </DocumentProse>
    </div>
  )
}

const styles = {
  scroll: [
    'reader-scroll [height:calc(100dvh_-_250px)] min-h-87.5 max-h-212.5 overflow-auto',
    '[scroll-behavior:auto] [overscroll-behavior:contain]',
    'max-md:[height:calc(100dvh_-_270px)] max-md:min-h-75',
  ].join(' '),
}
