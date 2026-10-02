import { FORMAT_LABELS, type LibraryDocument } from '@/lib/documents'

export function ReaderHeader({
  doc,
  onBack,
  busy,
}: {
  doc: LibraryDocument
  onBack: () => Promise<void>
  busy: boolean
}) {
  return (
    <header className={styles.header}>
      <button
        className="back-button border-0 bg-transparent text-[12px] whitespace-nowrap py-2 px-0 text-muted"
        disabled={busy}
        onClick={() => void onBack()}
      >
        ← 書架
      </button>
      <div>
        <p className="eyebrow text-[10px] tracking-[2px] font-semibold m-0 text-muted">
          {FORMAT_LABELS[doc.format]} / PERSONAL READING ROOM
        </p>
        <h1>{doc.title}</h1>
      </div>
      <span className="version-badge text-[11px] py-1.5 px-2.5 border border-line rounded-[4px] whitespace-nowrap text-muted max-md:text-[9px] max-md:p-[5px]">
        第 {doc.revisions.length} 版
      </span>
    </header>
  )
}

const styles = {
  header: [
    'reader-header flex items-center gap-7 py-7 px-0 border-b border-line',
    '[&_h1]:font-display [&_h1]:text-[25px] [&_h1]:font-medium [&_h1]:mt-2 [&_h1]:mx-0',
    '[&_h1]:mb-0 [&_h1]:wrap-anywhere [&_>_div]:flex-1 [&_>_div]:min-w-0',
    'max-md:gap-[15px] max-md:py-5.5 max-md:px-0 max-md:[&_h1]:text-[19px]',
    'max-md:[&_.eyebrow]:text-[8px] max-md:[&_.eyebrow]:tracking-[1px]',
  ].join(' '),
}
