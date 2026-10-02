import { config } from '@/lib/config'
import { EDITABLE, latest, type LibraryDocument } from '@/lib/documents'
import { exportFile } from '@/lib/download'
import type { ReaderTab } from '@/lib/reader-types'

interface Props {
  doc: LibraryDocument
  tab: ReaderTab
  busy: boolean
  fontSize: number
  onTabChange: (tab: ReaderTab) => Promise<void>
  onFontChange: (size: number) => Promise<void>
  onDelete: () => Promise<void>
}
export function ReaderToolbar({
  doc,
  tab,
  busy,
  fontSize,
  onTabChange,
  onFontChange,
  onDelete,
}: Props) {
  const editable = EDITABLE.has(doc.format),
    head = latest(doc)
  const tabs: [ReaderTab, string][] = [
    ['read', '閱讀'],
    ['notes', `筆記 ${head.notes.length}`],
    ...(editable
      ? ([
          ['edit', '編輯文字'],
          ['sandbox', '思考沙盒'],
        ] as [ReaderTab, string][])
      : []),
    ['history', '版本紀錄'],
  ]
  return (
    <div className="reader-toolbar flex justify-between items-center gap-4 border-b border-line py-[5px] px-0 flex-wrap">
      <div className={styles.tabs}>
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? 'active' : ''}
            disabled={busy}
            aria-pressed={tab === key}
            onClick={() => void onTabChange(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={styles.tools}>
        <label>
          字級{' '}
          <select
            aria-label="閱讀字級"
            value={fontSize}
            onChange={(e) => void onFontChange(Number(e.target.value))}
          >
            {config.reading.fontSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => exportFile(doc.original, doc.filename)}>下載原始檔</button>
        {editable && (
          <button
            onClick={() =>
              exportFile(
                new Blob([head.content], { type: 'text/plain;charset=utf-8' }),
                `${doc.title}.${doc.format === 'markdown' ? 'md' : 'txt'}`,
              )
            }
          >
            匯出目前文字
          </button>
        )}
        <button className="delete-action text-rust" disabled={busy} onClick={() => void onDelete()}>
          刪除
        </button>
      </div>
    </div>
  )
}

const styles = {
  tabs: [
    'reader-tabs flex items-center gap-6',
    '[&_button]:border-0 [&_button]:border-b-2 [&_button]:border-solid',
    '[&_button]:border-b-transparent [&_button]:py-3.5 [&_button]:px-0',
    '[&_button]:bg-transparent [&_button]:text-[12px] [&_button]:text-muted',
    '[&_button.active]:border-ink [&_button.active]:text-ink',
    'max-md:gap-2 max-md:w-full max-md:justify-between max-md:flex-wrap max-md:[&_button]:text-[11px]',
  ].join(' '),
  tools: [
    'reader-tools flex items-center gap-4 text-[11px] text-muted flex-wrap',
    '[&_button]:bg-transparent [&_button]:border-0 [&_button]:py-2 [&_button]:px-0',
    '[&_select]:bg-transparent [&_select]:border-0 [&_select]:ml-[5px] [&_select]:p-1',
    'max-lg:pb-[5px] max-md:gap-3.5 max-md:text-[10px]',
  ].join(' '),
}
