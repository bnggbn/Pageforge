'use client'
import { config } from '@/lib/config'
import { PrimaryButton } from '@/components/ui/PrimaryButton'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TopNav } from '@/components/layout/TopNav'
import { BookCard, BookCover, type Book } from '@/components/bookshelf/BookCard'
import {
  listDocuments,
  changeSource,
  storageInfo,
  browserDocumentCount,
  migrateBrowserDocuments,
  type StorageInfo,
} from '@/lib/storage'
import { syncCollection } from '@/lib/collection'
import { importFile } from '@/lib/importer'
import { FORMAT_LABELS, errorMessage, type DocumentSummary } from '@/lib/documents'
const PALETTE = [
  { color: '#e9e4d8', ink: '#343a32' },
  { color: '#a84b36', ink: '#fff3dc' },
  { color: '#344a42', ink: '#e6ebd7' },
  { color: '#dfad54', ink: '#342e22' },
  { color: '#bcc9d1', ink: '#2d414e' },
  { color: '#5e596a', ink: '#f0e7d9' },
]
const FILTERS = ['全部文件', '閱讀中', '未開始', '已讀完']
export default function HomePage() {
  const router = useRouter()
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [store, setStore] = useState<StorageInfo | null>(null)
  const [legacyCount, setLegacyCount] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const refresh = async () => {
      try {
        const info = await storageInfo()
        setStore(info)
        if (info.mode === 'disk' && !info.collectionImported) {
          setBusy(true)
          setNotice('正在載入 collection/ 中的文件…')
          try {
            const outcome = await syncCollection()
            setNotice(`已載入 ${outcome.imported} 份文件。`)
            if (outcome.errors.length) setError(outcome.errors.join('；'))
          } finally {
            setBusy(false)
          }
        }
        setDocuments((await listDocuments()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
        if (info.mode === 'disk') {
          try {
            setLegacyCount(await browserDocumentCount())
          } catch {
            setLegacyCount(0)
          }
        }
      } catch (e) {
        setError(errorMessage(e))
      } finally {
        setLoaded(true)
      }
    }
    void refresh()
    window.addEventListener('focus', refresh)
    const channel =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pageforge-library') : null
    if (channel)
      channel.onmessage = (event) => {
        if (event.data?.source !== changeSource) void refresh()
      }
    return () => {
      window.removeEventListener('focus', refresh)
      channel?.close()
    }
  }, [])
  const books: Book[] = documents.map((doc) => {
    const index = parseInt(doc.id.slice(0, 2), 16) % PALETTE.length
    return {
      id: doc.id,
      title: doc.title,
      author: doc.filename,
      ...PALETTE[index],
      progress: doc.progress,
      format: FORMAT_LABELS[doc.format] as Book['format'],
      category: `${doc.revisionCount} 個版本`,
      subtitle: `${FORMAT_LABELS[doc.format]} / PERSONAL COLLECTION`,
      coverStyle: String(index + 1),
    }
  })
  const featured = books.find((book) => book.progress > 0 && book.progress < 100) ?? books[0]
  const openBook = (book: Book) => router.push(`/reader/?id=${encodeURIComponent(book.id)}`)
  const handleImport = async (file: File) => {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const imported = await importFile(file)
      setDocuments((await listDocuments()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
      setNotice(imported.duplicate ? '這份文件已在書架中，沒有重複匯入。' : '文件已保存到書架。')
      setImportOpen(false)
      router.push(`/reader/?id=${encodeURIComponent(imported.id)}`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }
  const [filter, setFilter] = useState('全部文件')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('default')
  const [importOpen, setImportOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const visible = books
    .filter(
      (b) =>
        `${b.title} ${b.author}`.toLowerCase().includes(query.toLowerCase()) &&
        (filter === '全部文件' ||
          (filter === '閱讀中' && b.progress > 0 && b.progress < 100) ||
          (filter === '未開始' && b.progress === 0) ||
          (filter === '已讀完' && b.progress === 100)),
    )
    .sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title, 'zh-TW')
        : sort === 'progress'
          ? b.progress - a.progress
          : 0,
    )
  useEffect(() => {
    if (importOpen) dialog.current?.showModal()
    else dialog.current?.close()
  }, [importOpen])
  const close = () => {
    if (!busy) {
      setImportOpen(false)
    }
  }
  return (
    <div>
      <TopNav />
      <main
        className={[
          'library-main max-w-310 m-auto pt-13 px-0 pb-6',
          'max-xl:my-0 max-xl:mx-10',
          'max-md:my-0 max-md:mx-6 max-md:pt-[35px]',
          'max-sm:my-0 max-sm:mx-5',
        ].join(' ')}
      >
        <section className={styles.libraryHeading}>
          <div>
            <p className="eyebrow text-[10px] tracking-[2px] font-semibold m-0 text-muted">
              YOUR PERSONAL LIBRARY
            </p>
            <h1>
              我的書架<span className="accent text-rust">。</span>
            </h1>
            <p className={styles.headingNote}>收藏值得停留的文字，接著上次的靈感往下讀。</p>
          </div>
          <PrimaryButton
            className="max-sm:mt-[27px]"
            disabled={busy}

            onClick={() => setImportOpen(true)}
          >
            <span aria-hidden="true">＋</span> 匯入文件
          </PrimaryButton>
        </section>
        {error && (
          <p className={[styles.statusMessage, styles.error].join(' ')} role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p
            className={[
              'status-message py-3 px-4 mt-0 mx-0 mb-5 bg-[#e9ecdf] rounded-[5px] text-[13px]',
              'leading-[1.7]',
              '[&.error]:bg-[#f3e4df]',
            ].join(' ')}
            role="status"
          >
            {notice}
          </p>
        )}
        {!loaded && (
          <p
            className={[
              'status-message py-3 px-4 mt-0 mx-0 mb-5 bg-[#e9ecdf] rounded-[5px] text-[13px]',
              'leading-[1.7]',
              '[&.error]:bg-[#f3e4df]',
            ].join(' ')}
            role="status"
          >
            正在載入書架…
          </p>
        )}
        {featured && (
          <section
            className={[
              'featured-grid grid grid-cols-[2.2fr_1fr] gap-5',
              'max-lg:grid-cols-[1.8fr_1fr]',
              'max-md:grid-cols-1',
            ].join(' ')}
            aria-label="閱讀推薦"
          >
            <button className={styles.continueCard} onClick={() => openBook(featured)}>
              <div className={styles.continueCopy}>
                <p className="eyebrow text-[10px] tracking-[2px] font-semibold m-0 text-muted">
                  <i className="live-dot w-1.5 h-1.5 bg-[#758467] rounded-full inline-block" />
                  繼續上次的閱讀
                </p>
                <h2>
                  留一點時間，
                  <br />
                  給正在發生的靈感。
                </h2>
                <p className={styles.continueTitle}>
                  {featured.title} <span>／ {featured.format}</span>
                </p>
                <div className={styles.continueProgress}>
                  <span
                    className={[
                      'progress-track block h-0.5 flex-1 bg-[#dbddcf] overflow-hidden',
                      '[&_>_span]:block [&_>_span]:h-full [&_>_span]:bg-[#7c8969]',
                    ].join(' ')}
                  >
                    <span style={{ width: `${featured.progress}%` }} />
                  </span>
                  <span>已讀 {featured.progress}%</span>
                </div>
                <span
                  className={[
                    'continue-action inline-flex items-center gap-6.5 text-[12px] border-b border-solid',
                    'border-b-[#9ca58c] pb-1.5',
                    '[&_>_span]:text-[19px]',
                  ].join(' ')}
                >
                  繼續閱讀 <span aria-hidden="true">→</span>
                </span>
              </div>
              <div className={styles.featuredCover}>
                <BookCover book={featured} />
              </div>
              <span
                className={
                  'feature-index absolute right-5.5 bottom-4.5 text-[9px] tracking-[2px] text-[#89917e]'
                }
                aria-hidden="true"
              >
                01 — {String(books.length).padStart(2, '0')}
              </span>
            </button>
            <div className={styles.quietCard}>
              <span className="eyebrow text-[10px] tracking-[2px] font-semibold m-0 text-muted">
                A LITTLE SPACE TO READ
              </span>
              <svg
                className="quiet-art w-[145px] h-22 mt-[21px] mx-0 mb-2 text-[#79856c]"
                viewBox="0 0 180 100"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M90 80C67 63 36 72 20 57V18c24 18 43 0 70 20 27-20 46-2 70-20v39c-16 15-47 6-70 23ZM90 38v42M31 32c18 8 35-1 48 12M31 43c18 8 35-1 48 12M149 32c-18 8-35-1-48 12M149 43c-18 8-35-1-48 12"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <circle cx="90" cy="10" r="3" />
                <path d="m69 12-4-5m46 5 4-5" stroke="currentColor" />
              </svg>
              <h2>閱讀，是回到自己的路。</h2>
              <p>
                不必急著讀完。
                <br />
                每一頁，都有自己的節奏。
              </p>
              <span className="quiet-foot text-[10px] text-[#939587] mt-auto">
                少一點喧囂，多一點留白。
              </span>
            </div>
          </section>
        )}
        {store?.mode === 'disk' && (
          <div className={styles.folderBar}>
            <span>
              <strong>固定書架</strong> {store.label}
            </span>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setError('')
                try {
                  const outcome = await syncCollection()
                  setDocuments(
                    (await listDocuments()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
                  )
                  setNotice(
                    `資料夾載入完成：新增 ${outcome.imported} 份，已存在 ${outcome.skipped} 份。`,
                  )
                  if (outcome.errors.length) setError(outcome.errors.join('；'))
                } catch (e) {
                  setError(errorMessage(e))
                } finally {
                  setBusy(false)
                }
              }}
            >
              重新載入資料夾
            </button>
            {legacyCount > 0 && (
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  setError('')
                  try {
                    const outcome = await migrateBrowserDocuments()
                    setDocuments(
                      (await listDocuments()).sort((a, b) =>
                        b.updatedAt.localeCompare(a.updatedAt),
                      ),
                    )
                    setNotice(
                      `已轉入 ${outcome.imported} 份瀏覽器文件，${outcome.skipped} 份已存在。瀏覽器原資料保留。`,
                    )
                    if (outcome.conflicts.length) {
                      setError(
                        `同來源已有不同版本，尚未合併：${outcome.conflicts.join('、')}。瀏覽器資料保留。`,
                      )
                    } else {
                      setLegacyCount(0)
                    }
                  } catch (e) {
                    setError(errorMessage(e))
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                轉入瀏覽器書架（{legacyCount}）
              </button>
            )}
          </div>
        )}
        <section className="shelf-section mt-10 max-md:mt-7" aria-label="文件書架">
          <div
            className={[
              'shelf-toolbar flex items-center justify-between border-b border-solid border-b-line',
              'gap-5',
              'max-md:flex-wrap max-md:gap-0',
            ].join(' ')}
          >
            <div className={styles.filterTabs} role="group" aria-label="閱讀狀態">
              {FILTERS.map((label) => (
                <button
                  key={label}
                  className={filter === label ? 'active' : ''}
                  aria-pressed={filter === label}
                  onClick={() => setFilter(label)}
                >
                  {label}
                  {label === '全部文件' && <span>{books.length}</span>}
                </button>
              ))}
            </div>
            <div className={styles.shelfControls}>
              <label className={styles.searchField}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <path d="m16 16 4 4" />
                </svg>
                <input
                  type="search"
                  aria-label="搜尋文件或作者"
                  placeholder="搜尋文件或作者"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <select aria-label="文件排序" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="default">收藏順序</option>
                <option value="title">依標題排序</option>
                <option value="progress">依閱讀進度</option>
              </select>
            </div>
          </div>
          <div className={styles.shelfCaption}>
            <span>
              {query ? `搜尋結果 · ${visible.length} 份文件` : '每一本，都是一個新的入口。'}
            </span>
            <span>
              {store?.mode === 'disk'
                ? `${store.label} · ${documents.length} 份文件`
                : `瀏覽器 · ${documents.length} 份文件`}
            </span>
          </div>
          <div
            className={[
              'books-grid grid grid-cols-6 gap-7',
              'max-xl:gap-5',
              'max-lg:grid-cols-3 max-lg:gap-7.5',
              'max-md:[gap:24px_20px]',
              'max-sm:grid-cols-2',
              'max-sm:[gap:26px_18px]',
            ].join(' ')}
          >
            {visible.map((book) => (
              <BookCard key={book.id} book={book} onOpen={openBook} />
            ))}
          </div>
          {visible.length === 0 && (
            <div className={styles.emptyState}>
              <h3>這裡暫時沒有文件</h3>
              <p>
                {documents.length
                  ? '換個關鍵字，或看看其他閱讀狀態。'
                  : '匯入自己的文件，讓這裡成為真正的書架。'}
              </p>
              {documents.length ? (
                <button
                  onClick={() => {
                    setQuery('')
                    setFilter('全部文件')
                  }}
                >
                  顯示全部文件 →
                </button>
              ) : (
                <button disabled={busy} onClick={() => setImportOpen(true)}>
                  匯入第一份文件 →
                </button>
              )}
            </div>
          )}
        </section>
        <button disabled={busy} className={styles.importStrip} onClick={() => setImportOpen(true)}>
          <span
            className={[
              'import-strip-icon w-9 h-9 grid place-items-center border border-solid border-[#dbddcf]',
              'rounded-full text-[#8d9580] text-[23px]',
            ].join(' ')}
            aria-hidden="true"
          >
            ＋
          </span>
          <span>
            <strong>你的下一頁，從這裡開始。</strong>
            <span>將 PDF、EPUB、Excel 或文字文件，放進自己的書架。</span>
          </span>
          <span
            className={[
              'import-strip-action ml-auto text-[11px] flex items-center gap-5 whitespace-nowrap',
              '[&_>_span]:text-[20px]',
              'max-md:gap-2',
              'max-sm:ml-12 max-sm:basis-full',
            ].join(' ')}
          >
            匯入文件 <span aria-hidden="true">↗</span>
          </span>
        </button>
        <footer className={styles.libraryFooter}>
          <span>
            Pageforge<span className="accent text-rust">.</span>{' '}
            <span className="footer-note ml-[15px] font-display text-[9px] text-[#8b8f80] max-sm:hidden">
              為閱讀留白。
            </span>
          </span>
          <span>你的文件，你的閱讀節奏。</span>
        </footer>
      </main>
      <dialog
        ref={dialog}
        className={styles.previewDialog}
        aria-labelledby="preview-title"
        onCancel={(e) => {
          if (busy) e.preventDefault()
          else close()
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) close()
        }}
      >
        <button
          disabled={busy}
          className={[
            'dialog-close absolute top-3 right-[15px] text-[24px] border-0 bg-transparent',
            'text-muted py-0 px-[5px]',
          ].join(' ')}
          autoFocus
          onClick={close}
          aria-label="關閉預覽"
        >
          ×
        </button>
        {
          <>
            <p className="eyebrow text-[10px] tracking-[2px] font-semibold m-0 text-muted">
              MAKE ROOM FOR YOUR WORDS
            </p>
            <h2 id="preview-title">
              把喜歡的文字，
              <br />
              放進自己的書架。
            </h2>
            <div
              className={styles.importPlaceholder}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (e.dataTransfer.files.length !== 1) {
                  setError('請一次匯入一份文件。')
                  return
                }
                void handleImport(e.dataTransfer.files[0])
              }}
            >
              <span aria-hidden="true">↥</span>
              <strong>拖放文件，或選擇本機檔案</strong>
              <span>
                MD / TXT: {config.limits.textMiB} MiB / PDF / EPUB / XLSX:{' '}
                {config.limits.documentMiB} MiB
              </span>
              <input
                ref={fileInput}
                type="file"
                aria-label="選擇匯入文件"
                accept=".md,.markdown,.txt,.pdf,.epub,.xlsx"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleImport(file)
                }}
              />
              {busy && <span role="status">正在解析並保存文件…</span>}
            </div>
            {error && (
              <p className={[styles.statusMessage, styles.error].join(' ')} role="alert">
                {error}
              </p>
            )}
            <p className="dialog-note mt-5 leading-[1.9]">
              {store?.mode === 'disk'
                ? `原始檔、筆記與 VAX 版本都保存在 ${store.label}books/，不會傳到雲端。可直接備份整個 ${store.label} 資料夾。`
                : '目前是瀏覽器儲存模式。請用 pnpm dev:web 或 pnpm start:web 啟動資料夾書架；清除網站資料會移除此模式的文件。'}
            </p>
          </>
        }
      </dialog>
    </div>
  )
}

const styles = {
  libraryHeading: [
    'library-heading flex justify-between items-center mb-8.5 gap-5',
    '[&_h1]:font-display [&_h1]:text-[42px] [&_h1]:font-medium [&_h1]:tracking-[-2px]',
    '[&_h1]:my-3 [&_h1]:mx-0 [&_h1]:leading-[1.2]',
    'max-md:[&_h1]:text-[34px]',
    'max-sm:items-start max-sm:gap-2 max-sm:mb-6.5',
    'max-sm:[&_.eyebrow]:text-[8px] max-sm:[&_.eyebrow]:tracking-[1.5px]',
  ].join(' '),
  headingNote: [
    'heading-note text-[13px] text-muted m-0 tracking-[0.5px]',
    'max-md:text-[11px] max-md:leading-[1.8] max-md:max-w-62.5',
    'max-sm:max-w-[205px] max-sm:text-[10px]',
  ].join(' '),
  statusMessage: [
    'status-message py-3 px-4 mt-0 mx-0 mb-5 bg-[#e9ecdf] rounded-[5px] text-[13px]',
    'leading-[1.7]',
    '[&.error]:bg-[#f3e4df]',
  ].join(' '),
  error: 'error text-[#a43c2e]',
  continueCard: [
    'continue-card relative bg-[#e9ecdf] border border-solid border-[#e1e4d6] rounded-[8px]',
    'flex justify-between pt-8.5 pr-12 pb-9 pl-9 gap-[25px] overflow-hidden',
    'hover:bg-[#e3e8d6]',
    '[&:hover_.featured-cover]:[transform:rotate(4deg)_translateY(-4px)]',
    'max-lg:py-7.5 max-lg:px-[25px]',
    'max-md:p-7',
    'max-sm:py-[25px] max-sm:px-5 max-sm:gap-3.5',
    'max-xs:py-[23px] max-xs:px-4.5 max-xs:gap-2.5',
  ].join(' '),
  continueCopy: [
    'continue-copy flex-1 relative z-1',
    '[&_.eyebrow]:flex [&_.eyebrow]:items-center [&_.eyebrow]:gap-2',
    '[&_.eyebrow]:text-[#627159] [&_.eyebrow]:tracking-[1.5px]',
    '[&_h2]:font-display [&_h2]:text-[28px] [&_h2]:font-medium [&_h2]:tracking-[1px]',
    '[&_h2]:leading-[1.6] [&_h2]:mt-5.5 [&_h2]:mx-0 [&_h2]:mb-[15px]',
    'max-lg:[&_h2]:text-[23px]',
    'max-sm:[&_h2]:text-[21px] max-sm:[&_h2]:tracking-[0] max-sm:[&_h2]:mt-5',
    'max-sm:[&_h2]:mx-0 max-sm:[&_h2]:mb-3',
    'max-sm:[&_.eyebrow]:text-[9px] max-sm:[&_.eyebrow]:tracking-[0.5px]',
    'max-xs:[&_h2]:text-[18px]',
  ].join(' '),
  continueTitle: [
    'continue-title font-display text-[15px] m-0',
    '[&_>_span]:font-sans [&_>_span]:text-[10px] [&_>_span]:text-[#737c69]',
    '[&_>_span]:leading-[normal]',
    'max-sm:text-[13px]',
    'max-sm:[&_>_span]:block max-sm:[&_>_span]:mt-1 max-sm:[&_>_span]:text-[9px]',
  ].join(' '),
  continueProgress: [
    'continue-progress flex items-center gap-3 max-w-[275px] mt-[19px] mx-0 mb-6',
    'text-[10px] text-[#737c69]',
    'max-sm:my-[17px] max-sm:mx-0 max-sm:gap-[7px] max-sm:text-[9px]',
  ].join(' '),
  featuredCover: [
    'featured-cover w-[165px] self-center',
    '[transform:rotate(8deg)]',
    'mr-1.5',
    '[transition:transform_0.3s]',
    'max-lg:w-[125px]',
    'max-md:w-[145px]',
    'max-sm:w-25.5 max-sm:shrink-0 max-sm:mr-[3px]',
    'max-sm:[&_.book-cover]:pt-3 max-sm:[&_.book-cover]:pr-2.5',
    'max-sm:[&_.book-cover]:pb-2.5 max-sm:[&_.book-cover]:pl-[13px]',
    'max-sm:[&_.cover-title]:text-[18px] max-sm:[&_.cover-title]:mt-[13px]',
    'max-sm:[&_.cover-edition]:text-[4px] max-sm:[&_.cover-edition]:tracking-[0.5px]',
    'max-sm:[&_.cover-subtitle]:text-[4px] max-sm:[&_.cover-subtitle]:tracking-[0.7px]',
    'max-sm:[&_.cover-author]:text-[5px]',
    'max-xs:w-20',
    'max-xs:[&_.cover-title]:text-[15px]',
  ].join(' '),
  quietCard: [
    'quiet-card border border-solid border-[#deded0] rounded-[8px] p-7 text-center flex',
    'items-center flex-col bg-[#f0eee5]',
    '[&_.eyebrow]:text-[9px] [&_.eyebrow]:tracking-[1.8px]',
    '[&_h2]:text-[16px] [&_h2]:tracking-[1px] [&_h2]:font-medium [&_h2]:my-[9px]',
    '[&_h2]:mx-0',
    '[&_p]:text-[12px] [&_p]:text-muted [&_p]:leading-[1.9] [&_p]:mt-[3px] [&_p]:mx-0',
    '[&_p]:mb-5',
    'max-lg:py-6 max-lg:px-4',
    'max-lg:[&_h2]:text-[14px]',
    'max-md:hidden',
  ].join(' '),
  folderBar: [
    'folder-bar flex items-center flex-wrap gap-4 py-3.5 px-4.5 border border-solid',
    'border-line bg-[#efefe5] rounded-[5px] text-[11px] text-muted mt-[25px]',
    '[&_strong]:text-ink [&_strong]:font-medium [&_strong]:mr-3',
    '[&_button]:border-0 [&_button]:bg-transparent [&_button]:text-rust',
    '[&_button]:text-[11px] [&_button]:py-1.5 [&_button]:px-0',
    '[&_>_button:first-of-type]:ml-auto',
    'max-sm:[gap:8px_16px]',
    'max-sm:p-3',
    'max-sm:[&_button]:text-[10px]',
  ].join(' '),
  filterTabs: [
    'filter-tabs flex gap-7',
    '[&_button]:border-0 [&_button]:border-b-2 [&_button]:border-solid',
    '[&_button]:border-b-transparent [&_button]:bg-transparent [&_button]:text-muted',
    '[&_button]:py-[15px] [&_button]:px-0 [&_button]:text-[12px]',
    '[&_button]:whitespace-nowrap',
    '[&_button.active]:text-ink [&_button.active]:border-b-ink',
    '[&_button:hover]:text-rust',
    '[&_button_>_span]:ml-[7px] [&_button_>_span]:py-0.5 [&_button_>_span]:px-1.5',
    '[&_button_>_span]:bg-[#e9e9df] [&_button_>_span]:text-[10px]',
    '[&_button_>_span]:rounded-[4px]',
    'max-md:gap-[25px] max-md:w-full',
    'max-sm:justify-between max-sm:gap-2.5',
    'max-sm:[&_button]:text-[11px]',
  ].join(' '),
  shelfControls: [
    'shelf-controls flex items-center gap-5',
    '[&_select]:text-[11px] [&_select]:text-muted [&_select]:border-0',
    '[&_select]:bg-transparent [&_select]:py-2 [&_select]:px-1',
    'max-md:w-full max-md:justify-between max-md:py-3 max-md:px-0 max-md:border-t',
    'max-md:border-solid max-md:border-t-line',
    'max-sm:gap-3',
    'max-sm:[&_select]:max-w-25 max-sm:[&_select]:shrink-0',
  ].join(' '),
  searchField: [
    'search-field flex items-center gap-2 text-[#919487] min-w-0',
    '[&_input]:w-[153px] [&_input]:text-[11px] [&_input]:bg-transparent [&_input]:border-0',
    '[&_input]:text-ink [&_input]:py-2 [&_input]:px-0 [&_input]:min-w-0',
    '[&_input::placeholder]:text-[#909486]',
    'max-md:[&_input]:w-50',
    'max-sm:[&_input]:w-full',
    'max-sm:flex-1',
  ].join(' '),
  shelfCaption: [
    'shelf-caption flex justify-between mt-5 mx-0 mb-[25px] text-[#85897b] text-[10px]',
    'tracking-[0.5px]',
    '[&_>_span:last-child]:border [&_>_span:last-child]:border-solid',
    '[&_>_span:last-child]:border-[#dcded2] [&_>_span:last-child]:py-0.5',
    '[&_>_span:last-child]:px-[7px] [&_>_span:last-child]:rounded-[3px]',
  ].join(' '),
  emptyState: [
    'empty-state py-[45px] px-[15px] text-center',
    '[&_h3]:font-medium [&_h3]:text-[18px]',
    '[&_p]:text-muted [&_p]:text-[12px] [&_p]:mt-2.5 [&_p]:mx-0 [&_p]:mb-5',
    '[&_button]:bg-transparent [&_button]:border-0 [&_button]:text-rust',
    '[&_button]:text-[12px]',
  ].join(' '),
  importStrip: [
    'import-strip flex items-center w-full gap-4.5 border border-dashed border-[#cccfc1]',
    'bg-transparent rounded-[5px] py-[21px] px-[25px] mt-10',
    'hover:bg-[#eeeee4]',
    '[&_strong]:block [&_strong]:font-medium [&_strong]:text-[12px] [&_strong]:mb-[5px]',
    '[&_>_span:nth-child(2)_>_span]:text-[10px] [&_>_span:nth-child(2)_>_span]:text-muted',
    'max-md:p-4.5 max-md:gap-3',
    'max-sm:flex-wrap max-sm:gap-3',
    'max-sm:[&_>_span:nth-child(2)]:flex-1',
    'max-sm:[&_>_span:nth-child(2)_>_span]:leading-[1.7]',
    'max-sm:[&_>_span:nth-child(2)_>_span]:block',
    'max-sm:[&_>_span:nth-child(2)_>_span]:text-[9px]',
  ].join(' '),
  libraryFooter: [
    'library-footer flex items-center justify-between mt-10.5 pt-5 border-t border-solid',
    'border-t-line font-display text-[15px]',
    '[&_>_span:last-child]:font-display [&_>_span:last-child]:text-[9px]',
    '[&_>_span:last-child]:text-[#8b8f80]',
    'max-sm:[&_>_span:last-child]:text-[8px]',
  ].join(' '),
  previewDialog: [
    'preview-dialog fixed inset-0 m-auto max-h-[90dvh]',
    '[width:min(440px,_calc(100vw_-_32px))]',
    'border border-solid border-line rounded-[10px] p-9.5 bg-[#faf8f1] text-ink',
    'overflow-y-auto',
    'backdrop:bg-[#252b2466] backdrop:backdrop-blur-[4px]',
    '[&_h2]:font-display [&_h2]:text-[25px] [&_h2]:mt-4.5 [&_h2]:mx-0 [&_h2]:mb-3',
    '[&_h2]:leading-[1.6] [&_h2]:font-medium',
    '[&_p]:text-[12px] [&_p]:text-muted',
    '[&_.eyebrow]:text-[9px]',
  ].join(' '),
  importPlaceholder: [
    'import-placeholder flex flex-col items-center p-[25px] border border-dashed',
    'border-[#bfc6b2] rounded-[5px] gap-3 my-6 mx-0',
    '[&_>_span:first-child]:text-[30px] [&_>_span:first-child]:text-[#788368]',
    '[&_strong]:text-[13px] [&_strong]:font-medium',
    '[&_>_span:last-child]:text-[11px] [&_>_span:last-child]:text-muted',
    '[&_input]:w-full [&_input]:max-w-full [&_input]:text-[12px] [&_input]:py-3',
    '[&_input]:px-0',
  ].join(' '),
}
