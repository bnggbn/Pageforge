'use client'
import { config } from '@/lib/config'
import { PrimaryButton } from '@/components/ui/PrimaryButton'
import { readingAnchor } from '@/lib/reading-anchor'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { RevisionHistory } from './RevisionHistory'
import { NotesPanel } from './NotesPanel'
import { exportFile } from '@/lib/download'
import { DocumentContent } from './DocumentContent'
import { DocumentProse } from './DocumentProse'
import { WorkingCopyBar } from './WorkingCopyBar'
import { SandboxPanel } from './SandboxPanel'
import { useWorkingCopy } from '@/hooks/useWorkingCopy'
import {
  EDITABLE,
  FORMAT_LABELS,
  latest,
  errorMessage,
  type LibraryDocument,
  type Note,
  type ReadingPosition,
  type Revision,
  type AdoptionSource,
} from '@/lib/documents'
import {
  appendRevision,
  loadDocument,
  readProgress,
  saveProgress,
  readFontSize,
  saveFontSize,
  deleteDocument,
  changeSource,
} from '@/lib/storage'
import { createRevision, verifyHistory } from '@/lib/history'

type Tab = 'read' | 'edit' | 'notes' | 'history' | 'sandbox'

export function ReaderWorkspace() {
  const [doc, setDoc] = useState<LibraryDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState<Tab>('read')
  const working = useWorkingCopy()
  const { content: draft, body, quote, location } = working
  const setDraft = (content: string) => working.change({ content })
  const setBody = (body: string) => working.change({ body })
  const setQuote = (quote: string) => working.change({ quote })
  const setLocation = (location: string) => working.change({ location })
  const [busy, setBusy] = useState(false)
  const [fontSize, setFontSize] = useState(config.reading.defaultFontSize)
  const [section, setSection] = useState(0)
  const [pdfPage, setPdfPage] = useState(1)
  const [pdfUrl, setPdfUrl] = useState('')
  const [percentage, setPercentage] = useState(0)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [compareNotes, setCompareNotes] = useState(false)
  const [stale, setStale] = useState(false)
  const [verified, setVerified] = useState(false)
  const scroll = useRef<HTMLDivElement>(null)
  const article = useRef<HTMLElement>(null)
  const readingBlocks = useRef<HTMLElement[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<ReadingPosition | null>(null)
  const restore = useRef<ReadingPosition | null>(null)
  const currentDoc = useRef<LibraryDocument | null>(null)
  const mounted = useRef(true)
  const sandboxFlush = useRef<(() => Promise<void>) | null>(null)
  const registerSandboxFlush = useCallback((flush: (() => Promise<void>) | null) => {
    sandboxFlush.current = flush
  }, [])
  const head = doc ? latest(doc) : null
  const dirty = !!head && draft !== head.content

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setVerified(false)
    setStale(false)
    try {
      const id = new URL(window.location.href).searchParams.get('id')
      if (!id) throw new Error('請從書架選擇一份文件。')
      const loaded = await loadDocument(id)
      if (!loaded) throw new Error('找不到這份文件，可能已被刪除。')
      await verifyHistory(loaded)
      const last = latest(loaded)
      const recovered = await working.open(loaded)
      const [position, savedFontSize] = await Promise.all([readProgress(id), readFontSize()])
      const compatible =
        position &&
        loaded.revisions.find((r) => r.id === position.revisionId)?.content === last.content
      restore.current = compatible ? position : null
      pending.current = null
      setSection(position?.section ?? 0)
      setPdfPage((position?.section ?? 0) + 1)
      setPercentage(compatible ? position.percentage : 0)
      setFontSize(savedFontSize)
      setDoc(loaded)
      currentDoc.current = loaded
      if (recovered.restored) setTab(recovered.edited ? 'edit' : recovered.note ? 'notes' : 'read')
      setVerified(true)
      setFrom(loaded.revisions.at(-2)?.id ?? last.id)
      setTo(last.id)
      if (position && !compatible) setMessage('文件內容已有新版本，閱讀位置已回到開頭。')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [working.open])
  useEffect(() => {
    mounted.current = true
    void load()
    return () => {
      mounted.current = false
      if (timer.current) clearTimeout(timer.current)
      const position = pending.current
      const active = currentDoc.current
      if (position && active) void saveProgress(active.id, position).catch(() => {})
    }
  }, [load])
  useEffect(() => {
    const channel =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pageforge-library') : null
    if (channel)
      channel.onmessage = (event) => {
        if (event.data?.source !== changeSource) setStale(true)
      }
    return () => channel?.close()
  }, [])
  useEffect(() => {
    if (!doc || doc.format !== 'pdf') return
    const url = URL.createObjectURL(new Blob([doc.original], { type: 'application/pdf' }))
    setPdfUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [doc?.id, doc?.format]) // Original binary stays immutable across revisions.

  const capture = useCallback((): ReadingPosition | null => {
    const active = currentDoc.current,
      container = scroll.current
    if (!active || !container) return null
    const top = container.getBoundingClientRect().top
    const anchor = readingAnchor(readingBlocks.current, top + 36)
    const rect = anchor?.getBoundingClientRect()
    const distance = container.scrollHeight - container.clientHeight
    const localRatio = distance <= 0 ? 1 : Math.max(0, Math.min(1, container.scrollTop / distance))
    const count =
      active.format === 'epub'
        ? active.sections.length
        : active.format === 'xlsx'
          ? active.sheets.length
          : 1
    return {
      revisionId: latest(active).id,
      block: anchor?.dataset.block ?? '',
      ratio: rect ? Math.max(0, Math.min(1, (top + 36 - rect.top) / Math.max(rect.height, 1))) : 0,
      percentage: Math.round(((section + localRatio) / Math.max(1, count)) * 100),
      updatedAt: new Date().toISOString(),
      section,
    }
  }, [section])
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    const active = currentDoc.current,
      position = pending.current
    if (!active || !position) return
    await saveProgress(active.id, position)
    if (pending.current === position) pending.current = null
  }, [])
  const onScroll = () => {
    if (tab !== 'read' && tab !== 'notes') return
    const position = capture()
    if (!position) return
    pending.current = position
    setPercentage(position.percentage)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void flush().catch((e) => {
        if (mounted.current) setError(errorMessage(e))
      })
    }, config.reading.progressDebounceMs)
  }
  useEffect(() => {
    readingBlocks.current = Array.from(
      article.current?.querySelectorAll<HTMLElement>('[data-block]') ?? [],
    )
  }, [doc, loading, tab, section])
  useEffect(() => {
    if (!doc || loading || (tab !== 'read' && tab !== 'notes') || !scroll.current) return
    const position = restore.current
    if (!position) return
    const container = scroll.current
    const anchor = Array.from(container.querySelectorAll<HTMLElement>('[data-block]')).find(
      (node) => node.dataset.block === position.block,
    )
    if (anchor)
      container.scrollTop =
        anchor.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop +
        anchor.getBoundingClientRect().height * position.ratio -
        36
    else if (position.block) {
      container.scrollTop = 0
      setMessage('舊閱讀區塊無法定位，已回到開頭。')
    }
    restore.current = null
  }, [doc, loading, tab, fontSize, section])

  const changeTab = async (next: Tab) => {
    if (busy) return
    try {
      await sandboxFlush.current?.()
      await working.flush()
      await flush()
    } catch (e) {
      setError(errorMessage(e))
      return
    }
    restore.current = capture()
    setTab(next)
    setError('')
    setMessage('')
  }
  const commit = async (
    kind: Revision['kind'],
    content: string,
    notes: Note[],
    restoredFrom: string | null = null,
    clearNote = false,
    adoptedFrom?: AdoptionSource,
  ) => {
    if (!doc || !head || busy || !verified) return false
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await working.flush()
      await flush()
      const version = await createRevision(doc, kind, content, notes, restoredFrom, adoptedFrom)
      const updated = await appendRevision(doc, head.id, version)
      setDoc(updated)
      currentDoc.current = updated
      await working
        .rebase(
          updated,
          kind === 'edit' || (!dirty && (kind === 'restore' || kind === 'adopt')),
          clearNote,
        )
        .catch((e) => {
          setError(`版本已保存，但草稿整理失敗：${errorMessage(e)}`)
        })
      setStale(false)
      setFrom(head.id)
      setTo(version.id)
      if (content !== head.content) {
        restore.current = null
        pending.current = null
        setPercentage(0)
        if (scroll.current) scroll.current.scrollTop = 0
      }
      setMessage(`已保存第 ${updated.revisions.length} 版。`)
      return true
    } catch (e) {
      setError(errorMessage(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  const saveEdit = async () => {
    if (!doc || !head || !dirty) return
    if (
      !draft.trim() ||
      new TextEncoder().encode(draft).length > config.limits.textMiB * 1024 * 1024
    ) {
      setError(`文字不可空白，且最多 ${config.limits.textMiB} MiB。`)
      return
    }
    if (await commit('edit', draft, head.notes)) setTab('read')
  }
  const addNote = async () => {
    if (!head || !body.trim()) return
    if (
      body.length > config.limits.noteCharacters ||
      quote.length > config.limits.quoteCharacters
    ) {
      setError(
        `筆記最多 ${config.limits.noteCharacters} 字，引用最多 ${config.limits.quoteCharacters} 字。`,
      )
      return
    }
    const note: Note = {
      id: crypto.randomUUID(),
      body: body.trim(),
      quote,
      location,
      createdAt: new Date().toISOString(),
    }
    await commit('note', head.content, [...head.notes, note], null, true)
  }
  const selectQuote = () => {
    const selection = window.getSelection()
    if (
      !selection?.anchorNode ||
      !article.current?.contains(selection.anchorNode) ||
      !article.current.contains(selection.focusNode)
    )
      return
    const text = selection.toString().trim()
    if (!text) return
    const element =
      selection.anchorNode instanceof Element
        ? selection.anchorNode
        : selection.anchorNode.parentElement
    const block = element?.closest('[data-block]')?.getAttribute('data-block') ?? '全文'
    setQuote(text.slice(0, config.limits.quoteCharacters))
    setLocation(
      doc?.format === 'epub'
        ? `${doc.sections[section]?.title} / ${block}`
        : doc?.format === 'xlsx'
          ? `${doc.sheets[section]?.name} / ${block}`
          : block,
    )
    setTab('notes')
  }
  const resizeFont = async (size: number) => {
    restore.current = capture()
    try {
      await saveFontSize(size)
      setFontSize(size)
    } catch (e) {
      setError(errorMessage(e))
    }
  }
  const changeSection = async (index: number) => {
    if (!doc || !head) return
    const count = doc.format === 'epub' ? doc.sections.length : doc.sheets.length
    const next: ReadingPosition = {
      revisionId: head.id,
      block: '',
      ratio: 0,
      percentage: Math.round((index / Math.max(1, count)) * 100),
      section: index,
      updatedAt: new Date().toISOString(),
    }
    try {
      await flush()
      await saveProgress(doc.id, next)
    } catch (e) {
      setError(errorMessage(e))
      return
    }
    restore.current = null
    pending.current = null
    setSection(index)
    setPercentage(next.percentage)
    if (scroll.current) scroll.current.scrollTop = 0
  }

  if (loading)
    return (
      <main className={styles.readerLoading}>
        <p className="eyebrow text-[10px] tracking-[2px] font-semibold m-0 text-muted">
          PAGEFORGE READING ROOM
        </p>
        <h1>正在打開你的文字…</h1>
      </main>
    )
  if (!doc || !head || !verified)
    return (
      <main className={styles.readerLoading}>
        <h1>無法開啟文件</h1>
        <p role="alert">{error}</p>
        <Link href="/">回到書架 →</Link>
      </main>
    )
  const editable = EDITABLE.has(doc.format)
  const sections =
    doc.format === 'epub'
      ? doc.sections.map((s) => s.title)
      : doc.format === 'xlsx'
        ? doc.sheets.map((s) => s.name)
        : []
  const activeSection = Math.min(Math.max(0, section), Math.max(0, sections.length - 1))
  const returnToShelf = async () => {
    try {
      await sandboxFlush.current?.()
      await working.flush()
      await flush()
      window.location.href = '/'
    } catch (e) {
      setError(errorMessage(e))
    }
  }
  return (
    <div
      className={[
        'reader-workspace min-h-[100dvh] max-w-375 m-auto pt-0 px-10 pb-7.5',
        'max-lg:pt-0 max-lg:px-[25px] max-lg:pb-7.5',
        'max-md:pt-0 max-md:px-5 max-md:pb-[25px]',
      ].join(' ')}
    >
      <header className={styles.readerHeader}>
        <button
          className={
            'back-button border-0 bg-transparent text-[12px] whitespace-nowrap py-2 px-0 text-muted'
          }
          onClick={() => void returnToShelf()}
        >
          ← 書架
        </button>
        <div>
          <p className="eyebrow text-[10px] tracking-[2px] font-semibold m-0 text-muted">
            {FORMAT_LABELS[doc.format]} / PERSONAL READING ROOM
          </p>
          <h1>{doc.title}</h1>
        </div>
        <span
          className={[
            'version-badge text-[11px] py-1.5 px-2.5 border border-solid border-line rounded-[4px]',
            'whitespace-nowrap text-muted',
            'max-md:text-[9px] max-md:p-[5px]',
          ].join(' ')}
        >
          第 {doc.revisions.length} 版
        </span>
      </header>
      <div
        className={[
          'reader-toolbar flex justify-between items-center gap-4 border-b border-solid',
          'border-b-line py-[5px] px-0 flex-wrap',
        ].join(' ')}
      >
        <div className={styles.readerTabs}>
          {(
            [
              ['read', '閱讀'],
              ['notes', `筆記 ${head.notes.length}`],
              ...(editable ? [['edit', '編輯文字']] : []),
              ...(editable ? [['sandbox', '思考沙盒']] : []),
              ['history', '版本紀錄'],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? 'active' : ''}
              disabled={busy}
              aria-pressed={tab === key}
              onClick={() => void changeTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.readerTools}>
          <label>
            字級{' '}
            <select
              aria-label="閱讀字級"
              value={fontSize}
              onChange={(e) => void resizeFont(Number(e.target.value))}
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
          <button
            className="delete-action text-rust"
            disabled={busy}
            onClick={async () => {
              if (
                !window.confirm(
                  '確定從書架移除文件、筆記與全部版本？固定資料夾模式會移到 .trash/；瀏覽器模式會永久刪除。',
                )
              )
                return
              setBusy(true)
              try {
                if (timer.current) clearTimeout(timer.current)
                pending.current = null
                await sandboxFlush.current?.()
                await deleteDocument(doc.id)
                working.close()
                window.location.href = '/'
              } catch (e) {
                setError(errorMessage(e))
                setBusy(false)
              }
            }}
          >
            刪除
          </button>
        </div>
      </div>
      {(error || message || stale) && (
        <div className={styles.readerStatus}>
          {error && (
            <p role="alert" className="error text-[#a43c2e]">
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
          {stale && (
            <p>
              另一個分頁更新了書架。
              <button
                onClick={async () => {
                  try {
                    await sandboxFlush.current?.()
                    await working.flush()
                    await load()
                  } catch (e) {
                    setError(errorMessage(e))
                  }
                }}
              >
                重新載入
              </button>
            </p>
          )}
        </div>
      )}
      {tab !== 'sandbox' &&
        (dirty || body || quote || working.copies.length > 0 || working.error) && (
          <WorkingCopyBar
            status={working.status}
            error={working.error}
            restored={working.restored}
            stale={working.baseRevisionId !== head.id}
            copies={working.copies}
            selectedId={working.id}
            busy={busy}
            onRetry={() => void working.flush().catch((e) => setError(errorMessage(e)))}
            onSelect={(id) => {
              void (async () => {
                try {
                  await working.flush()
                  const restored = await working.open(doc, id)
                  setTab(restored.edited ? 'edit' : 'notes')
                } catch (e) {
                  setError(errorMessage(e))
                }
              })()
            }}
            onDiscard={() => {
              if (window.confirm('捨棄此草稿？已保存版本與其他草稿會保留。'))
                void (async () => {
                  setBusy(true)
                  try {
                    await working.discard(doc)
                  } catch (e) {
                    setError(errorMessage(e))
                  } finally {
                    setBusy(false)
                  }
                })()
            }}
          />
        )}
      {tab === 'sandbox' ? (
        <SandboxPanel
          doc={doc}
          onBusyChange={setBusy}
          registerFlush={registerSandboxFlush}
          onAdopt={(source, content) => commit('adopt', content, head.notes, null, false, source)}
        />
      ) : tab === 'history' ? (
        <RevisionHistory
          doc={doc}
          busy={busy}
          from={from}
          to={to}
          compareNotes={compareNotes}
          setFrom={setFrom}
          setTo={setTo}
          setCompareNotes={setCompareNotes}
          onRestore={(revision) => commit('restore', revision.content, revision.notes, revision.id)}
        />
      ) : tab === 'edit' ? (
        <section className={styles.editorPanel}>
          <div className={styles.editorHeading}>
            <div>
              <p className="eyebrow text-[10px] tracking-[2px] font-semibold m-0 text-muted">
                MAKE IT YOUR OWN
              </p>
              <h2>讓文字，往前一步。</h2>
              <p>每次儲存建立新版本，原文與筆記都會保留。</p>
            </div>
            <PrimaryButton
              className="max-sm:mt-[27px]"
              disabled={busy || !dirty}
              onClick={() => void saveEdit()}
            >
              {busy ? '保存中…' : '儲存新版本'}
            </PrimaryButton>
          </div>
          <textarea
            aria-label="編輯文件文字"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            disabled={busy}
          />
          <span className="small-note text-[11px] text-muted leading-[1.8] my-2.5 mx-0">
            {dirty ? '有未儲存的修改' : '目前文字已保存'} · {draft.length.toLocaleString()} 字元
          </span>
        </section>
      ) : (
        <div className={`${styles.readingLayout} ${tab === 'notes' ? styles.withNotes : ''}`}>
          <section
            className={[
              'reading-panel min-w-0 border border-solid border-line bg-surface rounded-[7px]',
              'overflow-hidden',
              '[&_>_.small-note]:my-3 [&_>_.small-note]:mx-5',
            ].join(' ')}
          >
            {sections.length > 0 && (
              <div className={styles.sectionSelector}>
                <label>
                  {doc.format === 'epub' ? '章節' : '工作表'}
                  <select
                    aria-label="選擇章節或工作表"
                    value={activeSection}
                    onChange={(e) => void changeSection(Number(e.target.value))}
                  >
                    {sections.map((title, index) => (
                      <option key={index} value={index}>
                        {title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {doc.format === 'pdf' ? (
              <>
                <div className={styles.pdfControls}>
                  <label>
                    頁碼書籤{' '}
                    <input
                      type="number"
                      aria-label="PDF 頁碼書籤"
                      min="1"
                      max={config.reading.pdfMaxPage}
                      value={pdfPage}
                      onChange={(e) => {
                        const value = Math.max(
                          1,
                          Math.min(config.reading.pdfMaxPage, Number(e.target.value) || 1),
                        )
                        setPdfPage(value)
                        setLocation(`PDF 第 ${value} 頁`)
                      }}
                    />
                  </label>
                  <button
                    onClick={async () => {
                      try {
                        await saveProgress(doc.id, {
                          revisionId: head.id,
                          block: '',
                          ratio: 0,
                          percentage: 0,
                          section: pdfPage - 1,
                          updatedAt: new Date().toISOString(),
                        })
                        setMessage(`已保存第 ${pdfPage} 頁書籤。`)
                      } catch (e) {
                        setError(errorMessage(e))
                      }
                    }}
                  >
                    保存頁碼
                  </button>
                  <span>PDF 捲動由瀏覽器管理；請手動保存頁碼。</span>
                </div>
                <iframe
                  className="pdf-viewer w-full [height:calc(100dvh_-_330px)] min-h-100 border-0 bg-[#eeeeea]"
                  title={`${doc.title} PDF`}
                  src={pdfUrl ? `${pdfUrl}#page=${pdfPage}` : undefined}
                />
                <p className="small-note text-[11px] text-muted leading-[1.8] my-2.5 mx-0">
                  若瀏覽器無法顯示 PDF，可下載原始檔閱讀；筆記仍可在右側保存。
                </p>
              </>
            ) : (
              <div ref={scroll} className={styles.readerScroll} onScroll={onScroll}>
                <DocumentProse
                  ref={article}
                  style={{ fontSize }}
                  onMouseUp={selectQuote}
                  onKeyUp={(e) => {
                    if (e.key === 'Shift') selectQuote()
                  }}
                >
                  {doc.format === 'xlsx' ? (
                    <>
                      <h2>{doc.sheets[activeSection]?.name}</h2>
                      <p className="small-note text-[11px] text-muted leading-[1.8] my-2.5 mx-0">
                        顯示儲存格原始值與公式的快取結果；不重算公式，也不保留 Excel 樣式。
                      </p>
                      <div className="reader-table-wrap overflow-auto max-w-full my-5 mx-0">
                        <table>
                          <tbody>
                            {doc.sheets[activeSection]?.rows.map((row, index) => (
                              <tr data-block={`row-${index}`} key={index}>
                                <th scope="row">{index + 1}</th>
                                {row.map((cell, column) => (
                                  <td key={column}>{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <DocumentContent
                      documentId={doc.id}
                      text={
                        doc.format === 'epub'
                          ? (doc.sections[activeSection]?.text ?? '')
                          : head.content
                      }
                      markdown={doc.format === 'markdown'}
                    />
                  )}
                </DocumentProse>
              </div>
            )}
            <div
              className={[
                'reading-footer flex justify-between text-[10px] text-muted py-3.5 px-5.5 border-t',
                'border-solid border-t-line',
                'max-md:text-[9px] max-md:py-3 max-md:px-4',
              ].join(' ')}
            >
              <span>
                {doc.format === 'pdf' ? `頁碼書籤 ${pdfPage}` : `閱讀位置 ${percentage}%`}
              </span>
              <span>{doc.format === 'epub' ? '文字閱讀模式' : '留一點時間，給文字。'}</span>
            </div>
          </section>
          <NotesPanel
            notes={head.notes}
            body={body}
            quote={quote}
            location={location}
            busy={busy}
            setBody={setBody}
            setQuote={setQuote}
            setLocation={setLocation}
            onAdd={addNote}
            onRemove={(id) =>
              commit(
                'note',
                head.content,
                head.notes.filter((note) => note.id !== id),
              )
            }
          />
        </div>
      )}
    </div>
  )
}

const styles = {
  readerLoading: [
    'reader-loading max-w-225 py-17.5 px-6 m-auto',
    '[&_h1]:text-[28px] [&_h1]:font-medium [&_h1]:my-5 [&_h1]:mx-0',
    '[&_p]:leading-[1.8]',
    '[&_a]:inline-block [&_a]:mt-[25px] [&_a]:text-rust',
  ].join(' '),
  readerHeader: [
    'reader-header flex items-center gap-7 py-7 px-0 border-b border-solid border-b-line',
    '[&_h1]:font-display [&_h1]:text-[25px] [&_h1]:font-medium [&_h1]:mt-2 [&_h1]:mx-0',
    '[&_h1]:mb-0 [&_h1]:wrap-anywhere',
    '[&_>_div]:flex-1 [&_>_div]:min-w-0',
    'max-md:gap-[15px] max-md:py-5.5 max-md:px-0',
    'max-md:[&_h1]:text-[19px]',
    'max-md:[&_.eyebrow]:text-[8px] max-md:[&_.eyebrow]:tracking-[1px]',
  ].join(' '),
  readerTabs: [
    'reader-tabs flex items-center gap-6',
    '[&_button]:border-0 [&_button]:border-b-2 [&_button]:border-solid',
    '[&_button]:border-b-transparent [&_button]:py-3.5 [&_button]:px-0',
    '[&_button]:bg-transparent [&_button]:text-[12px] [&_button]:text-muted',
    '[&_button.active]:border-ink [&_button.active]:text-ink',
    'max-md:gap-2 max-md:w-full max-md:justify-between max-md:flex-wrap',
    'max-md:[&_button]:text-[11px]',
  ].join(' '),
  readerTools: [
    'reader-tools flex items-center gap-4 text-[11px] text-muted flex-wrap',
    '[&_button]:bg-transparent [&_button]:border-0 [&_button]:py-2 [&_button]:px-0',
    '[&_select]:bg-transparent [&_select]:border-0 [&_select]:ml-[5px] [&_select]:p-1',
    'max-lg:pb-[5px]',
    'max-md:gap-3.5 max-md:text-[10px]',
  ].join(' '),
  readerStatus: [
    'reader-status py-3 px-4.5 bg-[#eeeee3] mt-4 mx-0 mb-0 rounded-[5px] text-[12px]',
    'leading-[1.8]',
    '[&_button]:bg-transparent [&_button]:border-0 [&_button]:underline [&_button]:ml-2.5',
  ].join(' '),
  editorPanel: [
    'editor-panel pt-9 px-0 pb-0 max-w-275 m-auto',
    '[&_textarea]:block [&_textarea]:w-full',
    '[&_textarea]:[min-height:calc(100dvh_-_370px)]',
    '[&_textarea]:border [&_textarea]:border-solid [&_textarea]:border-line',
    '[&_textarea]:bg-surface [&_textarea]:rounded-[5px] [&_textarea]:p-7',
    '[&_textarea]:font-code [&_textarea]:text-[15px] [&_textarea]:leading-[1.9]',
    '[&_textarea]:resize-y [&_textarea]:mb-3',
    'max-md:[&_textarea]:p-4.5 max-md:[&_textarea]:text-[13px]',
  ].join(' '),
  editorHeading: [
    'editor-heading flex items-center justify-between gap-5 mb-6',
    '[&_h2]:text-[23px] [&_h2]:font-medium [&_h2]:my-3 [&_h2]:mx-0',
    '[&_p:not(.eyebrow)]:text-[12px] [&_p:not(.eyebrow)]:text-muted',
    'max-md:items-start',
    'max-md:[&_h2]:text-[19px]',
    'max-md:[&_.primary-button]:text-[10px] max-md:[&_.primary-button]:p-2.5',
    'max-md:[&_.primary-button]:whitespace-nowrap',
    'max-md:[&_p:not(.eyebrow)]:text-[10px] max-md:[&_p:not(.eyebrow)]:leading-[1.7]',
  ].join(' '),
  readingLayout: [
    'reading-layout grid grid-cols-[minmax(0,_1fr)_300px] gap-7 mt-6.5 items-start',
    'max-lg:grid-cols-[minmax(0,_1fr)_250px] max-lg:gap-5',
    'max-md:grid-cols-[minmax(0,_1fr)] max-md:mt-4.5',
  ].join(' '),
  withNotes: [
    'with-notes',
    'max-md:[&_.notes-panel]:block',
    'max-md:[&_.reader-scroll]:max-h-[42dvh] max-md:[&_.reader-scroll]:min-h-62.5',
  ].join(' '),
  sectionSelector: [
    'section-selector border-b border-solid border-b-line py-3 px-5 text-[11px] text-muted',
    '[&_label]:flex [&_label]:gap-[15px] [&_label]:items-center',
    '[&_select]:min-w-0 [&_select]:max-w-[90%] [&_select]:border-0',
    '[&_select]:bg-transparent [&_select]:text-ink [&_select]:p-[5px]',
  ].join(' '),
  pdfControls: [
    'pdf-controls flex items-center gap-3.5 flex-wrap py-3.5 px-5 text-[11px] text-muted',
    '[&_input]:w-[65px] [&_input]:border [&_input]:border-solid [&_input]:border-line',
    '[&_input]:p-[5px] [&_input]:bg-transparent [&_input]:rounded-[3px] [&_input]:ml-1.5',
    '[&_button]:bg-[#e9ecdf] [&_button]:border-0 [&_button]:py-1.5 [&_button]:px-3',
    '[&_button]:rounded-[4px] [&_button]:text-ink',
    '[&_>_span]:text-[10px]',
  ].join(' '),
  readerScroll: [
    'reader-scroll',
    '[height:calc(100dvh_-_250px)]',
    'min-h-87.5 max-h-212.5 overflow-auto',
    '[scroll-behavior:auto]',
    '[overscroll-behavior:contain]',
    'max-md:[height:calc(100dvh_-_270px)]',
    'max-md:min-h-75',
  ].join(' '),
}
