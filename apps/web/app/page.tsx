'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TopNav } from '@/components/layout/TopNav'
import { BookCard, BookCover, type Book } from '@/components/bookshelf/BookCard'
import { listDocuments, changeSource, storageInfo, browserDocumentCount, migrateBrowserDocuments, type StorageInfo } from '@/lib/storage'
import { syncCollection } from '@/lib/collection'
import { importFile } from '@/lib/importer'
import { FORMAT_LABELS, errorMessage, type DocumentSummary } from '@/lib/documents'
const PALETTE = [
  { color:'#e9e4d8', ink:'#343a32' }, { color:'#a84b36', ink:'#fff3dc' },
  { color:'#344a42', ink:'#e6ebd7' }, { color:'#dfad54', ink:'#342e22' },
  { color:'#bcc9d1', ink:'#2d414e' }, { color:'#5e596a', ink:'#f0e7d9' },
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
        const info = await storageInfo(); setStore(info)
        if (info.mode === 'disk' && !info.collectionImported) {
          setBusy(true); setNotice('正在載入 library/collection/ 中的文件…')
          try { const outcome=await syncCollection(); setNotice(`已載入 ${outcome.imported} 份文件。`); if(outcome.errors.length) setError(outcome.errors.join('；')) }
          finally {setBusy(false)}
        }
        setDocuments((await listDocuments()).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)))
        if(info.mode === 'disk') {try {setLegacyCount(await browserDocumentCount())} catch {setLegacyCount(0)}}
      } catch(e) {setError(errorMessage(e))} finally {setLoaded(true)}
    }
    void refresh()
    window.addEventListener('focus', refresh)
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pageforge-library') : null
    if (channel) channel.onmessage = event => { if (event.data?.source !== changeSource) void refresh() }
    return () => { window.removeEventListener('focus', refresh); channel?.close() }
  }, [])
  const books: Book[] = documents.map(doc => {
    const index = parseInt(doc.id.slice(0,2),16) % PALETTE.length
    return {id:doc.id,title:doc.title,author:doc.filename,...PALETTE[index],progress:doc.progress,format:FORMAT_LABELS[doc.format] as Book['format'],category:`${doc.revisionCount} 個版本`,subtitle:`${FORMAT_LABELS[doc.format]} / PERSONAL COLLECTION`,coverStyle:String(index+1)}
  })
  const featured = books.find(book => book.progress > 0 && book.progress < 100) ?? books[0]
  const openBook = (book: Book) => router.push(`/reader/?id=${encodeURIComponent(book.id)}`)
  const handleImport = async (file: File) => {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const imported = await importFile(file)
      setDocuments((await listDocuments()).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)))
      setNotice(imported.duplicate ? '這份文件已在書架中，沒有重複匯入。' : '文件已保存到書架。')
      setImportOpen(false)
      router.push(`/reader/?id=${encodeURIComponent(imported.id)}`)
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false); if (fileInput.current) fileInput.current.value = '' }
  }
  const [filter, setFilter] = useState('全部文件')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('default')
  const [importOpen, setImportOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const visible = books.filter(b => `${b.title} ${b.author}`.toLowerCase().includes(query.toLowerCase()) && (filter === '全部文件' || (filter === '閱讀中' && b.progress > 0 && b.progress < 100) || (filter === '未開始' && b.progress === 0) || (filter === '已讀完' && b.progress === 100))).sort((a,b) => sort === 'title' ? a.title.localeCompare(b.title, 'zh-TW') : sort === 'progress' ? b.progress - a.progress : 0)
  useEffect(() => { if (importOpen) dialog.current?.showModal(); else dialog.current?.close() }, [importOpen])
  const close = () => { if (!busy) { setImportOpen(false) } }
  return <div><TopNav /><main className="library-main">
    <section className="library-heading"><div><p className="eyebrow">YOUR PERSONAL LIBRARY</p><h1>我的書架<span className="accent">。</span></h1><p className="heading-note">收藏值得停留的文字，接著上次的靈感往下讀。</p></div><button disabled={busy} className="primary-button" onClick={() => setImportOpen(true)}><span aria-hidden="true">＋</span> 匯入文件</button></section>
    {error && <p className="status-message error" role="alert">{error}</p>}{notice && <p className="status-message" role="status">{notice}</p>}{!loaded && <p className="status-message" role="status">正在載入書架…</p>}{featured && <section className="featured-grid" aria-label="閱讀推薦"><button className="continue-card" onClick={() => openBook(featured)}><div className="continue-copy"><p className="eyebrow"><i className="live-dot" />繼續上次的閱讀</p><h2>留一點時間，<br />給正在發生的靈感。</h2><p className="continue-title">{featured.title} <span>／ {featured.format}</span></p><div className="continue-progress"><span className="progress-track"><span style={{ width: `${featured.progress}%` }} /></span><span>已讀 {featured.progress}%</span></div><span className="continue-action">繼續閱讀 <span aria-hidden="true">→</span></span></div><div className="featured-cover"><BookCover book={featured} /></div><span className="feature-index" aria-hidden="true">01 — {String(books.length).padStart(2, '0')}</span></button><div className="quiet-card"><span className="eyebrow">A LITTLE SPACE TO READ</span><svg className="quiet-art" viewBox="0 0 180 100" fill="none" aria-hidden="true"><path d="M90 80C67 63 36 72 20 57V18c24 18 43 0 70 20 27-20 46-2 70-20v39c-16 15-47 6-70 23ZM90 38v42M31 32c18 8 35-1 48 12M31 43c18 8 35-1 48 12M149 32c-18 8-35-1-48 12M149 43c-18 8-35-1-48 12" stroke="currentColor" strokeWidth="1.2"/><circle cx="90" cy="10" r="3"/><path d="m69 12-4-5m46 5 4-5" stroke="currentColor"/></svg><h2>閱讀，是回到自己的路。</h2><p>不必急著讀完。<br />每一頁，都有自己的節奏。</p><span className="quiet-foot">少一點喧囂，多一點留白。</span></div></section>}
    {store?.mode === 'disk' && <div className="folder-bar"><span><strong>固定書架</strong> library/</span><button disabled={busy} onClick={async () => {setBusy(true);setError('');try {const outcome=await syncCollection();setDocuments((await listDocuments()).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));setNotice(`資料夾載入完成：新增 ${outcome.imported} 份，已存在 ${outcome.skipped} 份。`);if(outcome.errors.length)setError(outcome.errors.join('；'))}catch(e){setError(errorMessage(e))}finally{setBusy(false)}}}>重新載入資料夾</button>{legacyCount>0 && <button disabled={busy} onClick={async () => {setBusy(true);setError('');try {const outcome=await migrateBrowserDocuments();setDocuments((await listDocuments()).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));setNotice(`已轉入 ${outcome.imported} 份瀏覽器文件，${outcome.skipped} 份已存在。瀏覽器原資料保留。`);if(outcome.conflicts.length){setError(`同來源已有不同版本，尚未合併：${outcome.conflicts.join('、')}。瀏覽器資料保留。`)}else{setLegacyCount(0)}}catch(e){setError(errorMessage(e))}finally{setBusy(false)}}}>轉入瀏覽器書架（{legacyCount}）</button>}</div>}<section className="shelf-section" aria-label="文件書架"><div className="shelf-toolbar"><div className="filter-tabs" role="group" aria-label="閱讀狀態">{FILTERS.map(label => <button key={label} className={filter === label ? 'active' : ''} aria-pressed={filter === label} onClick={() => setFilter(label)}>{label}{label === '全部文件' && <span>{books.length}</span>}</button>)}</div><div className="shelf-controls"><label className="search-field"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input type="search" aria-label="搜尋文件或作者" placeholder="搜尋文件或作者" value={query} onChange={e => setQuery(e.target.value)} /></label><select aria-label="文件排序" value={sort} onChange={e => setSort(e.target.value)}><option value="default">收藏順序</option><option value="title">依標題排序</option><option value="progress">依閱讀進度</option></select></div></div><div className="shelf-caption"><span>{query ? `搜尋結果 · ${visible.length} 份文件` : '每一本，都是一個新的入口。'}</span><span>{store?.mode === 'disk' ? `library/ · ${documents.length} 份文件` : `瀏覽器 · ${documents.length} 份文件`}</span></div><div className="books-grid">{visible.map(book => <BookCard key={book.id} book={book} onOpen={openBook} />)}</div>{visible.length === 0 && <div className="empty-state"><h3>這裡暫時沒有文件</h3><p>{documents.length ? '換個關鍵字，或看看其他閱讀狀態。' : '匯入自己的文件，讓這裡成為真正的書架。'}</p>{documents.length ? <button onClick={() => { setQuery(''); setFilter('全部文件') }}>顯示全部文件 →</button> : <button disabled={busy} onClick={() => setImportOpen(true)}>匯入第一份文件 →</button>}</div>}</section>
    <button disabled={busy} className="import-strip" onClick={() => setImportOpen(true)}><span className="import-strip-icon" aria-hidden="true">＋</span><span><strong>你的下一頁，從這裡開始。</strong><span>將 PDF、EPUB、Excel 或文字文件，放進自己的書架。</span></span><span className="import-strip-action">匯入文件 <span aria-hidden="true">↗</span></span></button>
    <footer className="library-footer"><span>Pageforge<span className="accent">.</span> <span className="footer-note">為閱讀留白。</span></span><span>你的文件，你的閱讀節奏。</span></footer>
    </main><dialog ref={dialog} className="preview-dialog" aria-labelledby="preview-title" onCancel={e => { if (busy) e.preventDefault(); else close() }} onClick={e => { if (e.target === e.currentTarget) close() }}><button disabled={busy} className="dialog-close" autoFocus onClick={close} aria-label="關閉預覽">×</button>{<><p className="eyebrow">MAKE ROOM FOR YOUR WORDS</p><h2 id="preview-title">把喜歡的文字，<br />放進自己的書架。</h2><div className="import-placeholder" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length !== 1) { setError("請一次匯入一份文件。"); return } void handleImport(e.dataTransfer.files[0]) }}><span aria-hidden="true">↥</span><strong>拖放文件，或選擇本機檔案</strong><span>MD／TXT：5 MiB · PDF／EPUB／XLSX：20 MiB</span><input ref={fileInput} type="file" aria-label="選擇匯入文件" accept=".md,.markdown,.txt,.pdf,.epub,.xlsx" disabled={busy} onChange={e => { const file=e.target.files?.[0]; if(file) void handleImport(file) }} />{busy && <span role="status">正在解析並保存文件…</span>}</div>{error && <p className="status-message error" role="alert">{error}</p>}<p className="dialog-note">{store?.mode === 'disk' ? '原始檔、筆記與 VAX 版本都保存在 library/books/，不會傳到雲端。可直接備份整個 library/ 資料夾。' : '目前是瀏覽器儲存模式。請用 npm run dev:web 或 npm run start:web 啟動資料夾書架；清除網站資料會移除此模式的文件。'}</p></>}</dialog></div>
}
