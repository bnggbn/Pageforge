'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TopNav } from '@/components/layout/TopNav'
import { BookCard, BookCover, type Book } from '@/components/bookshelf/BookCard'
import { listDocuments, changeSource } from '@/lib/storage'
import { importFile } from '@/lib/importer'
import { FORMAT_LABELS, errorMessage, type DocumentSummary } from '@/lib/documents'
const BOOKS: Book[] = [
  { id: '1', title: 'The Creative Act', subtitle: 'A WAY OF BEING', author: 'Rick Rubin', color: '#e9e4d8', ink: '#343a32', progress: 42, format: 'MD', category: '創作與靈感' },
  { id: '2', title: '在日常裡，慢慢閱讀', subtitle: 'NOTES ON EVERYDAY LIFE', author: 'Pageforge 編輯室', color: '#a84b36', ink: '#fff3dc', progress: 18, format: 'MD', category: '生活隨筆' },
  { id: '3', title: 'A Philosophy of Software Design', subtitle: 'THINK DEEPLY. BUILD SIMPLY.', author: 'John Ousterhout', color: '#344a42', ink: '#e6ebd7', progress: 67, format: 'MD', category: '設計與技術' },
  { id: '4', title: 'Ways of Seeing', subtitle: 'LOOK. QUESTION. SEE AGAIN.', author: 'John Berger', color: '#dfad54', ink: '#342e22', progress: 0, format: 'TXT', category: '藝術與觀察' },
  { id: '5', title: '一些尚未完成的想法', subtitle: 'A NOTEBOOK OF POSSIBILITIES', author: '我的閱讀筆記', color: '#bcc9d1', ink: '#2d414e', progress: 0, format: 'TXT', category: '個人筆記' },
  { id: '6', title: 'The Practice', subtitle: 'SHIPPING CREATIVE WORK', author: 'Seth Godin', color: '#5e596a', ink: '#f0e7d9', progress: 100, format: 'MD', category: '創作與靈感' },
]
const FILTERS = ['全部文件', '閱讀中', '未開始', '已讀完']
export default function HomePage() {
  const router = useRouter()
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const refresh = () => listDocuments().then(docs => { setDocuments(docs.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))); setLoaded(true) }).catch(e => { setError(errorMessage(e)); setLoaded(true) })
    void refresh()
    window.addEventListener('focus', refresh)
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pageforge-library') : null
    if (channel) channel.onmessage = event => { if (event.data?.source !== changeSource) void refresh() }
    return () => { window.removeEventListener('focus', refresh); channel?.close() }
  }, [])
  const demo = loaded && documents.length === 0
  const books: Book[] = demo ? BOOKS : documents.map((doc, index) => ({ id: doc.id, title: doc.title, author: `匯入於 ${new Date(doc.createdAt).toLocaleDateString('zh-TW')}`, color: BOOKS[index % 6].color, ink: BOOKS[index % 6].ink, progress: doc.progress, format: FORMAT_LABELS[doc.format] as Book['format'], category: `${doc.revisionCount} 個版本`, subtitle: `${FORMAT_LABELS[doc.format]} / PERSONAL COLLECTION`, coverStyle: String(index % 6 + 1) }))
  const featured = books.find(book => book.progress > 0 && book.progress < 100) ?? books[0]
  const openBook = (book: Book) => { if (demo) setSelected(book); else router.push(`/reader/?id=${encodeURIComponent(book.id)}`) }
  const handleImport = async (file: File) => {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const imported = await importFile(file)
      setDocuments((await listDocuments()).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)))
      setNotice(imported.duplicate ? '這份文件已在書架中，沒有重複匯入。' : '文件已保存到本機書架。')
      setImportOpen(false)
      router.push(`/reader/?id=${encodeURIComponent(imported.id)}`)
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false); if (fileInput.current) fileInput.current.value = '' }
  }
  const [filter, setFilter] = useState('全部文件')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('default')
  const [selected, setSelected] = useState<Book | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const visible = books.filter(b => `${b.title} ${b.author}`.toLowerCase().includes(query.toLowerCase()) && (filter === '全部文件' || (filter === '閱讀中' && b.progress > 0 && b.progress < 100) || (filter === '未開始' && b.progress === 0) || (filter === '已讀完' && b.progress === 100))).sort((a,b) => sort === 'title' ? a.title.localeCompare(b.title, 'zh-TW') : sort === 'progress' ? b.progress - a.progress : 0)
  useEffect(() => { if (selected || importOpen) dialog.current?.showModal(); else dialog.current?.close() }, [selected, importOpen])
  const close = () => { if (!busy) { setSelected(null); setImportOpen(false) } }
  return <div><TopNav /><main className="library-main">
    <section className="library-heading"><div><p className="eyebrow">YOUR PERSONAL LIBRARY</p><h1>我的書架<span className="accent">。</span></h1><p className="heading-note">收藏值得停留的文字，接著上次的靈感往下讀。</p></div><button className="primary-button" onClick={() => setImportOpen(true)}><span aria-hidden="true">＋</span> 匯入文件</button></section>
    {error && <p className="status-message error" role="alert">{error}</p>}{notice && <p className="status-message" role="status">{notice}</p>}{!loaded && <p className="status-message" role="status">正在載入書架…</p>}{featured && <section className="featured-grid" aria-label="閱讀推薦"><button className="continue-card" onClick={() => openBook(featured)}><div className="continue-copy"><p className="eyebrow"><i className="live-dot" />繼續上次的閱讀</p><h2>留一點時間，<br />給正在發生的靈感。</h2><p className="continue-title">{featured.title} <span>／ {demo ? featured.author : featured.format}</span></p><div className="continue-progress"><span className="progress-track"><span style={{ width: `${featured.progress}%` }} /></span><span>已讀 {featured.progress}%</span></div><span className="continue-action">繼續閱讀 <span aria-hidden="true">→</span></span></div><div className="featured-cover"><BookCover book={featured} /></div><span className="feature-index" aria-hidden="true">01 — {String(books.length).padStart(2, '0')}</span></button><div className="quiet-card"><span className="eyebrow">A LITTLE SPACE TO READ</span><svg className="quiet-art" viewBox="0 0 180 100" fill="none" aria-hidden="true"><path d="M90 80C67 63 36 72 20 57V18c24 18 43 0 70 20 27-20 46-2 70-20v39c-16 15-47 6-70 23ZM90 38v42M31 32c18 8 35-1 48 12M31 43c18 8 35-1 48 12M149 32c-18 8-35-1-48 12M149 43c-18 8-35-1-48 12" stroke="currentColor" strokeWidth="1.2"/><circle cx="90" cy="10" r="3"/><path d="m69 12-4-5m46 5 4-5" stroke="currentColor"/></svg><h2>閱讀，是回到自己的路。</h2><p>不必急著讀完。<br />每一頁，都有自己的節奏。</p><span className="quiet-foot">少一點喧囂，多一點留白。</span></div></section>}
    <section className="shelf-section" aria-label="文件書架"><div className="shelf-toolbar"><div className="filter-tabs" role="group" aria-label="閱讀狀態">{FILTERS.map(label => <button key={label} className={filter === label ? 'active' : ''} aria-pressed={filter === label} onClick={() => setFilter(label)}>{label}{label === '全部文件' && <span>{books.length}</span>}</button>)}</div><div className="shelf-controls"><label className="search-field"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input type="search" aria-label="搜尋文件或作者" placeholder="搜尋文件或作者" value={query} onChange={e => setQuery(e.target.value)} /></label><select aria-label="文件排序" value={sort} onChange={e => setSort(e.target.value)}><option value="default">收藏順序</option><option value="title">依標題排序</option><option value="progress">依閱讀進度</option></select></div></div><div className="shelf-caption"><span>{query ? `搜尋結果 · ${visible.length} 份文件` : '每一本，都是一個新的入口。'}</span><span>{demo ? '示範書架 · 匯入後顯示你的文件' : `${documents.length} 份本機文件`}</span></div><div className="books-grid">{visible.map(book => <BookCard key={book.id} book={book} onOpen={openBook} />)}</div>{visible.length === 0 && <div className="empty-state"><h3>這裡暫時沒有文件</h3><p>換個關鍵字，或看看其他閱讀狀態。</p><button onClick={() => { setQuery(''); setFilter('全部文件') }}>顯示全部文件 →</button></div>}</section>
    <button className="import-strip" onClick={() => setImportOpen(true)}><span className="import-strip-icon" aria-hidden="true">＋</span><span><strong>你的下一頁，從這裡開始。</strong><span>將 PDF、EPUB、Excel 或文字文件，放進自己的書架。</span></span><span className="import-strip-action">匯入文件 <span aria-hidden="true">↗</span></span></button>
    <footer className="library-footer"><span>Pageforge<span className="accent">.</span> <span className="footer-note">為閱讀留白。</span></span><span>你的文件，你的閱讀節奏。</span></footer>
    </main><dialog ref={dialog} className="preview-dialog" aria-labelledby="preview-title" onCancel={e => { if (busy) e.preventDefault(); else close() }} onClick={e => { if (e.target === e.currentTarget) close() }}><button disabled={busy} className="dialog-close" autoFocus onClick={close} aria-label="關閉預覽">×</button>{selected ? <><p className="eyebrow">BOOK PREVIEW</p><div className="dialog-cover"><BookCover book={selected} /></div><h2 id="preview-title">{selected.title}</h2><p>{selected.author} · {selected.format}</p><p className="dialog-note">這是書架設計預覽。示範封面不包含書籍全文。匯入自己的文件，即可閱讀、做筆記與管理版本。</p></> : <><p className="eyebrow">MAKE ROOM FOR YOUR WORDS</p><h2 id="preview-title">把喜歡的文字，<br />放進自己的書架。</h2><div className="import-placeholder" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length !== 1) { setError("請一次匯入一份文件。"); return } void handleImport(e.dataTransfer.files[0]) }}><span aria-hidden="true">↥</span><strong>拖放文件，或選擇本機檔案</strong><span>MD／TXT：5 MiB · PDF／EPUB／XLSX：20 MiB</span><input ref={fileInput} type="file" aria-label="選擇匯入文件" accept=".md,.markdown,.txt,.pdf,.epub,.xlsx" disabled={busy} onChange={e => { const file=e.target.files?.[0]; if(file) void handleImport(file) }} />{busy && <span role="status">正在解析並保存文件…</span>}</div>{error && <p className="status-message error" role="alert">{error}</p>}<p className="dialog-note">文件只保存在此瀏覽器，不會上傳。清除網站資料會移除文件、筆記與版本；切換網址或連接埠也會使用不同的書架。</p></>}</dialog></div>
}
