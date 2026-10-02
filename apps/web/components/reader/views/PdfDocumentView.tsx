import { useEffect, useState } from 'react'
import { config } from '@/lib/config'
import type { LibraryDocument } from '@/lib/documents'

interface Props {
  doc: LibraryDocument
  page: number
  onPageChange: (page: number) => void
  onBookmark: () => Promise<void>
}
export function PdfDocumentView({ doc, page, onPageChange, onBookmark }: Props) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([doc.original], { type: 'application/pdf' }))
    setUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [doc.id]) // Original bytes are immutable; IndexedDB may clone the Blob on note saves.
  return (
    <>
      <div className={styles.controls}>
        <label>
          頁碼書籤{' '}
          <input
            type="number"
            aria-label="PDF 頁碼書籤"
            min="1"
            max={config.reading.pdfMaxPage}
            value={page}
            onChange={(e) => onPageChange(Number(e.target.value))}
          />
        </label>
        <button onClick={() => void onBookmark()}>保存頁碼</button>
        <span>PDF 捲動由瀏覽器管理；請手動保存頁碼。</span>
      </div>
      <iframe
        className="pdf-viewer w-full [height:calc(100dvh_-_330px)] min-h-100 border-0 bg-[#eeeeea]"
        title={`${doc.title} PDF`}
        src={url ? `${url}#page=${page}` : undefined}
      />
      <p className="small-note text-[11px] text-muted leading-[1.8] my-2.5 mx-0">
        若瀏覽器無法顯示 PDF，可下載原始檔閱讀；筆記仍可在右側保存。
      </p>
    </>
  )
}

const styles = {
  controls: [
    'pdf-controls flex items-center gap-3.5 flex-wrap py-3.5 px-5 text-[11px] text-muted',
    '[&_input]:w-[65px] [&_input]:border [&_input]:border-solid [&_input]:border-line',
    '[&_input]:p-[5px] [&_input]:bg-transparent [&_input]:rounded-[3px] [&_input]:ml-1.5',
    '[&_button]:bg-[#e9ecdf] [&_button]:border-0 [&_button]:py-1.5 [&_button]:px-3',
    '[&_button]:rounded-[4px] [&_button]:text-ink [&_>_span]:text-[10px]',
  ].join(' '),
}
